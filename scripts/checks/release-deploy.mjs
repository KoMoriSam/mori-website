import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { deployWebsiteVersion } from "../build/website-deployment.mjs";
import { publishReleaseChangelog } from "../release/changelog.mjs";
import { createChangelogPayload, readReleaseFiles } from "../release/changelog-content.mjs";
import website from "../../workers/website.js";

const oldId = "11111111-1111-4111-8111-111111111111";
const candidateId = "22222222-2222-4222-8222-222222222222";
const releases = await readReleaseFiles({ allowDraftPlaceholders: true });
const changelog = createChangelogPayload(releases);
const oldChangelog = { ...changelog, items: changelog.items.slice(1) };

function deployment({ initial = oldId, failCandidate = false, failActive = false } = {}) {
  const changes = [];
  let active = { id: 0, versions: [{ version_id: initial, percentage: 100 }] };
  const command = async (args) => {
    if (args[1] === "deployments") return JSON.stringify(active);
    const specs = args.slice(3, args.indexOf("--config"));
    changes.push(specs);
    active = { id: changes.length, versions: specs.map((spec) => {
      const [version_id, share] = spec.split("@");
      return { version_id, percentage: parseInt(share) };
    }) };
  };
  const request = async (url, { headers }) => {
    const overridden = "Cloudflare-Workers-Version-Overrides" in headers;
    const id = overridden
      ? active.versions.find(({ percentage }) => percentage === 0)?.version_id
      : active.versions.find(({ percentage }) => percentage === 100)?.version_id;
    if (url.pathname === "/api/version") return Response.json({ version: id });
    if (["/changelog.json", "/api/changelog"].includes(url.pathname)) return Response.json(id === candidateId ? changelog : oldChangelog);
    if (url.pathname === "/") return new Response('<script type="module" crossorigin src="/js/index-abc.js"></script>',
      { headers: { "content-type": "text/html" } });
    return new Response(null, id === candidateId && (overridden ? failCandidate : failActive)
      ? { status: 404 }
      : { headers: { "content-type": "application/javascript" } });
  };
  return {
    changes,
    run: (assertCurrent = async () => {}) => deployWebsiteVersion(candidateId,
      { env: {}, assertCurrent, changelog }, { command, request, delay: async () => {} }),
  };
}

test("reuses a Worker version and checks it at 0% before switching traffic", async () => {
  const build = deployment();
  await build.run();
  assert.deepEqual(build.changes, [[`${oldId}@100%`, `${candidateId}@0%`], [`${candidateId}@100%`]]);
  build.changes.length = 0;
  await build.run();
  assert.deepEqual(build.changes, []);
});

test("failed verification at 0% leaves the old version serving all traffic", async () => {
  const build = deployment({ failCandidate: true });
  await assert.rejects(build.run(), /unavailable/);
  assert.deepEqual(build.changes, [[`${oldId}@100%`, `${candidateId}@0%`], [`${oldId}@100%`]]);
});

test("failed live verification restores the previous version", async () => {
  const build = deployment({ failActive: true });
  await assert.rejects(build.run(), /unavailable/);
  assert.deepEqual(build.changes, [[`${oldId}@100%`, `${candidateId}@0%`],
    [`${candidateId}@100%`], [`${oldId}@100%`]]);
});

test("a newer production commit prevents a staged version from taking traffic", async () => {
  const build = deployment();
  let checks = 0;
  await assert.rejects(build.run(() => {
    if (++checks === 2) throw new Error("obsolete build");
  }), /obsolete build/);
  assert.deepEqual(build.changes, [[`${oldId}@100%`, `${candidateId}@0%`], [`${oldId}@100%`]]);
});

test("the website never serves KV changelog data for another deployment", async () => {
  const request = new Request("https://komori.cc/api/changelog");
  const apiTime = "2026-01-01T01:02:03.000Z";
  for (const active of [oldChangelog, changelog]) {
    const ASSETS = { fetch: () => Response.json(active) };
    for (const remote of [oldChangelog, changelog, null]) {
      const PUBLIC_API = { fetch: () => {
        if (!remote) throw new Error("KV unavailable");
        return Response.json({ ...remote, serverTime: apiTime });
      } };
      const response = await website.fetch(request, { ASSETS, PUBLIC_API });
      assert.match(response.headers.get("cache-control"), /no-store/);
      const result = await response.json();
      assert.deepEqual(result.items, active.items);
      assert.equal(result.updatedAt, active.updatedAt);
      if (remote === active) assert.equal(result.serverTime, apiTime);
    }
  }
});

test("KV synchronization waits for the deployment, then retries without writing twice", async () => {
  const envPrevious = process.env.CLOUDFLARE_API_TOKEN;
  process.env.CLOUDFLARE_API_TOKEN = "fixture";
  try {
    let active = oldId, remote, propagated = false, writes = 0;
    const request = async (value) => {
      const { hostname, pathname } = new URL(value);
      if (hostname === "api.cloudflare.com") return remote ? Response.json(remote) : new Response(null, { status: 404 });
      if (pathname === "/api/version") return Response.json({ version: active });
      return Response.json({ ...(propagated ? remote : oldChangelog), serverTime: new Date().toISOString() });
    };
    const command = async (args) => {
      writes++;
      remote = JSON.parse(await readFile(args.at(-1), "utf8"));
    };
    const wait = async (check) => {
      if (!await check()) throw new Error("not propagated");
    };
    const sync = () => publishReleaseChangelog(candidateId, { request, command, wait });
    await assert.rejects(sync(), /未在线上生效/);
    assert.equal(writes, 0);
    active = candidateId;
    await assert.rejects(sync(), /not propagated/);
    assert.equal(writes, 1);
    propagated = true;
    await sync();
    assert.equal(writes, 1);
    assert.deepEqual(remote, changelog);
  } finally {
    if (envPrevious === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
    else process.env.CLOUDFLARE_API_TOKEN = envPrevious;
  }
});

test("Git history keeps a failed release pending but skips an untouched old draft and the finalized commit", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "mori-release-check-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.org",
    ...args], { cwd: dir, encoding: "utf8" }).trim();
  const put = async (file, value) => {
    const path = join(dir, file);
    await mkdir(resolve(path, ".."), { recursive: true });
    await writeFile(path, value);
  };
  const copy = async (file) => put(file, await readFile(new URL("../../" + file, import.meta.url)));
  const commit = (subject) => { git("add", "-A"); git("commit", "-qm", subject); return git("rev-parse", "HEAD"); };
  git("init", "-q", "-b", "main");
  for (const file of ["scripts/lib/commands.mjs", "scripts/lib/build-environment.mjs", "scripts/lib/worker-config.mjs",
    "scripts/build/snapshot-store.mjs", "scripts/release/changelog-content.mjs", "scripts/release/changelog.mjs",
    "scripts/release/verify-published.mjs", "scripts/release/cli.mjs", "shared/changelog.js"])
    await copy(file);
  await put(".gitignore", "node_modules\n");
  await put("package.json", '{"type":"module","version":"1.0.0"}');
  const readmes = ["README.md", "README_en.md", "README_fr.md", "README_si.md"];
  for (const file of readmes) await put(file, "Current version: <strong>1.0.0</strong>\n");
  await put("changelog/releases/1.0.0.md", releases.at(-1).content);
  commit("initial");
  git("branch", "production");
  const path = "changelog/releases/1.0.1.md";
  const draft = "---\nversion: 1.0.1\nstatus: draft\nsummary: 修复站点链接\n---\n\n## 修复\n\n- 修复无效链接\n";
  await put(path, draft);
  commit("old unrequested draft");

  await copy("scripts/release/pending-release.mjs");
  commit("enable release automation");
  await symlink(resolve("node_modules"), join(dir, "node_modules"), "junction");
  const pending = () => execFileSync(process.execPath, ["scripts/release/pending-release.mjs", "production"],
    { cwd: dir, encoding: "utf8" }).trim();
  assert.equal(pending(), "");

  await put("feature.txt", "daily update");
  commit("ordinary push");
  assert.equal(pending(), "");
  git("branch", "-f", "production", "HEAD");

  await put(path, draft.replace("修复无效链接", "修复博客无效链接"));
  commit("request release");
  assert.equal(pending(), "1.0.1");
  await put("feature.txt", "a fix after failed release");
  commit("retry with a code fix");
  assert.equal(pending(), "1.0.1");

  const output = join(dir, ".github-output");
  execFileSync(process.execPath, ["scripts/release/cli.mjs", "finalize", pending()], {
    cwd: dir, env: { ...process.env, GITHUB_ACTIONS: "true", GITHUB_OUTPUT: output },
  });
  assert.equal(await readFile(output, "utf8"), "tag=v1.0.1\n");
  assert.match(await readFile(join(dir, path), "utf8"), /status: released/);
  assert.equal(JSON.parse(await readFile(join(dir, "package.json"), "utf8")).version, "1.0.1");
  for (const file of readmes) assert.match(await readFile(join(dir, file), "utf8"), /<strong>1\.0\.1<\/strong>/);
  await rm(output);
  commit("finalized release");
  git("tag", "v1.0.1");
  git("branch", "-f", "production", "HEAD");
  assert.equal(pending(), "");
});
