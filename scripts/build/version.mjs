import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { run } from "../lib/commands.mjs";
import { assertPublicVite, buildEnvironment, deployEnvironment, sameOriginAssets, unusedBuildVariables } from "../lib/build-environment.mjs";
import { buildEvent, observeBuild } from "../lib/build-report.mjs";
import { publishStores, readWorkerConfig } from "../lib/worker-config.mjs";
import { deployWebsiteVersion } from "./website-deployment.mjs";
import { changelogRevision } from "../../shared/changelog.js";
import { versionInputs } from "./version-inputs.mjs";

const branch = "production";
const full = process.argv.includes("--full");
const deploy = !process.argv.includes("--upload");
if (process.argv.slice(2).some((arg) => !["--full", "--deploy", "--upload"].includes(arg)) ||
    !deploy && process.argv.includes("--deploy"))
  throw new Error("Usage: node scripts/build/version.mjs [--full] [--upload | --deploy]");
if (process.env.WORKERS_CI !== "1" || process.env.WORKERS_CI_BRANCH !== branch ||
    process.env.CONTENT_BLOG_DIR || process.env.CONTENT_NOVEL_DIR)
  throw new Error(`Version uploads require the trusted Workers Builds branch (${branch})`);
if (process.env.SKIP_DEPENDENCY_INSTALL !== "1")
  throw new Error("Set SKIP_DEPENDENCY_INSTALL=1 in website → Settings → Builds");
const unused = unusedBuildVariables();
for (const name of unused) delete process.env[name];
if (unused.length) buildEvent("version", "build configuration", "skip", {
  reason: "runtime-only or retired variables removed from this process; remove these names from Workers Builds",
  variables: unused,
});
assertPublicVite();
Object.assign(process.env, sameOriginAssets());

const config = await readWorkerConfig();
if (config.name !== "website" || config.assets?.directory !== "./dist" ||
    config.r2_buckets?.find(({ binding }) => binding === "NOVEL_VAULT")?.bucket_name !== "novel-vault" ||
    process.env.WRANGLER_CI_OVERRIDE_NAME && process.env.WRANGLER_CI_OVERRIDE_NAME !== config.name)
  throw new Error("This build must be connected to the website Worker and use its configured private bucket");

const { cache, novel } = publishStores(config);
await mkdir(".tmp", { recursive: true });
const scratch = await mkdtemp(resolve(".tmp/website-version-"));
const pointer = resolve(scratch, "version.json");
const releaseReceipt = resolve(scratch, "release.json");
const existingLock = resolve(scratch, "existing-owner");
const marker = resolve(scratch, "owner");
const lock = "publish.lock";
const resultFile = resolve(scratch, "build.json");
const wranglerEnv = deployEnvironment();
const versionIdPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const readPointer = async () => await cache.get("version.json", pointer) ? JSON.parse(await readFile(pointer, "utf8")) : null;
const writePointer = async (result) => {
  await writeFile(pointer, JSON.stringify(result));
  await cache.put("version.json", pointer);
};
const install = () => new Promise((done, reject) => {
  const child = spawn("pnpm", ["install", "--frozen-lockfile"], { env: buildEnvironment(), stdio: "inherit" });
  child.once("error", reject);
  child.once("close", (code) => code === 0 ? done() : reject(new Error(`pnpm install failed (${code})`)));
});
let lockEtag;
try {
  await writeFile(marker, randomUUID());
  await observeBuild("version", "acquire build lock", async () => {
    const deadline = Date.now() + 120_000;
    while (!lockEtag) {
      const current = await cache.getLock(lock, existingLock);
      // Workers Builds kills builds after 20 minutes. A longer lease lets a
      // cancelled build's lock expire without letting two builds publish at once.
      if (!current || Date.now() - current.modified > 22 * 60_000 ||
          await readFile(existingLock, "utf8") === "released") {
        lockEtag = await cache.putLock(lock, marker, current?.etag || true);
        if (lockEtag) break;
      }
      if (Date.now() > deadline) throw new Error("Another build holds publish.lock; it expires if that build was interrupted");
      await new Promise((done) => setTimeout(done, 3000));
    }
  });
  const { inputs, fingerprint } = await observeBuild("version", "resolve pinned inputs", versionInputs);
  if (deploy) await assertCurrentProduction(inputs.websiteCommit);
  const previous = await readPointer();
  await observeBuild("version", "install locked dependencies", install);
  let changelog, digest, needsSync;
  if (deploy) {
    const { createChangelogPayload, readReleaseFiles } = await import("../release/changelog-content.mjs");
    changelog = createChangelogPayload(await readReleaseFiles({ allowDraftPlaceholders: true }));
    digest = createHash("sha256").update(changelogRevision(changelog)).digest("hex");
    const receipt = await cache.get("release.json", releaseReceipt) ?
      JSON.parse(await readFile(releaseReceipt, "utf8")) : null;
    needsSync = receipt?.digest !== digest;
    if (needsSync) await assertReleaseTag(changelog.items[0].version, inputs.websiteCommit);
  }
  const versions = JSON.parse(await observeBuild("version", "check existing Worker versions", () =>
    run(["wrangler", "versions", "list", "--config", "wrangler.jsonc", "--json"], { env: wranglerEnv, capture: true })));
  const reuse = !full && previous?.fingerprint === fingerprint &&
    versionIdPattern.test(previous.versionId) && versions.some(({ id }) => id === previous.versionId);
  const record = reuse ? previous : await prepareVersion(inputs, fingerprint, previous, versions);
  if (reuse) buildEvent("version", "input fingerprint", "skip", { reason: "inputs unchanged", ...record });
  if (deploy) {
    await deployWebsiteVersion(record.versionId, {
      env: wranglerEnv,
      assertCurrent: () => assertCurrentProduction(inputs.websiteCommit),
      changelog,
    });
    if (needsSync) await syncWebsiteRelease(record.versionId, digest);
    else buildEvent("release", "sync changelog", "skip", { reason: "revision already verified", digest });
  }
} finally {
  try {
    if (lockEtag) {
      await writeFile(marker, "released");
      await cache.putLock(lock, marker, lockEtag);
    }
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

async function assertCurrentProduction(commit) {
  const head = await run(["git", "ls-remote", "--exit-code", "https://github.com/KoMoriSam/MoriWebsite.git", `refs/heads/${branch}`],
    { capture: true, env: { ...buildEnvironment(), GIT_TERMINAL_PROMPT: "0" }, signal: AbortSignal.timeout(30_000) });
  if (commit !== head.split("\t")[0])
    throw new Error(`This build is no longer at the head of ${branch}`);
}

async function assertReleaseTag(version, commit) {
  const tag = `refs/tags/v${version}`;
  const remote = "https://github.com/KoMoriSam/MoriWebsite.git";
  const env = { ...buildEnvironment(), GIT_TERMINAL_PROMPT: "0" };
  const options = () => ({ env, signal: AbortSignal.timeout(45_000) });
  await run(["git", "fetch", "--no-tags", remote, tag], options());
  const tagged = await run(["git", "rev-parse", "FETCH_HEAD^{commit}"], { capture: true });
  if (tagged !== commit && await run(["git", "rev-parse", "--is-shallow-repository"], { capture: true }) === "true") {
    await run(["git", "fetch", "--no-tags", "--unshallow", remote, `refs/heads/${branch}`], options());
  }
  await run(["git", "merge-base", "--is-ancestor", tagged, commit]);
}

async function syncWebsiteRelease(versionId, digest) {
  await observeBuild("release", "sync changelog", async () => {
    const env = { ...wranglerEnv, CLOUDFLARE_ACCOUNT_ID: config.account_id,
      WORKERS_CI: "1", WORKERS_CI_BRANCH: branch };
    delete env.WRANGLER_CI_OVERRIDE_NAME;
    delete env.WRANGLER_CI_MATCH_TAG;
    await run(["node", "scripts/release/cli.mjs", "sync", versionId], { env });
    await writeFile(releaseReceipt, JSON.stringify({ digest, versionId, verifiedAt: new Date().toISOString() }));
    await cache.put("release.json", releaseReceipt);
  }, { versionId });
}

async function prepareVersion(inputs, fingerprint, previous, versions) {
  buildEvent("version", "input fingerprint", "miss", { fingerprint, websiteCommit: inputs.websiteCommit, sources: inputs.sources });
  const tag = `input-${fingerprint.slice(0, 26)}`;
  const message = `MoriWebsite inputs ${fingerprint}`;
  const uploaded = !full && versions.find(({ id, annotations }) =>
    versionIdPattern.test(id) && annotations?.["workers/tag"] === tag && annotations?.["workers/message"] === message);
  if (uploaded) {
    const record = { fingerprint, versionId: uploaded.id };
    await writePointer(record);
    buildEvent("version", "native version", "reuse", record);
    return record;
  }

  const [blog, novelSource, font] = inputs.sources;
  const buildEnv = { ...buildEnvironment(), MORI_SMART_RESULT: resultFile, WORKERS_CI: "1",
    WORKERS_CI_BRANCH: branch, SSG_PRODUCTION_BRANCH: branch,
    CONTENT_GITHUB_TOKEN: process.env.CONTENT_GITHUB_TOKEN,
    CONTENT_BLOG_REF: blog.ref, CONTENT_NOVEL_REF: novelSource.ref,
    MORI_PINNED_BLOG: blog.commit, MORI_PINNED_NOVEL: novelSource.commit, MORI_PINNED_KAIMING: JSON.stringify(font) };
  for (const key of ["SSG_R2_ENDPOINT", "SSG_R2_BUCKET", "SSG_R2_ACCESS_KEY", "SSG_R2_SECRET_KEY",
    "SSG_SNAPSHOT_NAMESPACE", "CLOUDFLARE_ACCOUNT_ID"])
    if (process.env[key]) buildEnv[key] = process.env[key];
  await run(["node", "scripts/build/smart.mjs", ...(full ? ["--full"] : [])], { env: buildEnv });
  const { mode, snapshotId } = JSON.parse(await readFile(resultFile, "utf8"));
  if (!snapshotId) throw new Error("Smart build did not record its snapshot");
  if (mode === "SKIPPED" && previous?.snapshotId === snapshotId &&
      versions.some(({ id }) => id === previous.versionId && versionIdPattern.test(id))) {
    const record = { ...previous, fingerprint };
    await writePointer(record);
    buildEvent("version", "native version", "reuse", { reason: "build output unchanged", ...record });
    return record;
  }

  const { includePublicContent, publishNovelRelease } = await import("./novel-release.mjs");
  const novelVersion = await observeBuild("version", "include sealed public content", () => includePublicContent());
  await observeBuild("version", "sync private novel objects", () => publishNovelRelease(novelVersion, { store: novel }));
  const outputFile = resolve(scratch, "wrangler.ndjson");
  await observeBuild("version", "upload Worker version", () =>
    run(["wrangler", "versions", "upload", "--config", "wrangler.jsonc", "--tag", tag, "--message", message],
      { env: { ...wranglerEnv, WRANGLER_OUTPUT_FILE_PATH: outputFile } }));
  const output = (await readFile(outputFile, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
  const version = output.find(({ type }) => type === "version-upload");
  if (version?.worker_name !== config.name || !versionIdPattern.test(version.version_id))
    throw new Error("Wrangler did not report the uploaded website Version ID");
  const record = { fingerprint, snapshotId, versionId: version.version_id, novelVersion };
  await writePointer(record);
  buildEvent("version", "native version", "ready", record);
  return record;
}
