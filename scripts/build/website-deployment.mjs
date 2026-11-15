import { setTimeout } from "node:timers/promises";
import { sameChangelog } from "../../shared/changelog.js";
import { run } from "../lib/commands.mjs";
import { buildEvent, observeBuild } from "../lib/build-report.mjs";

const config = ["--config", "wrangler.jsonc"];
const origin = "https://komori.cc";

export async function deployWebsiteVersion(versionId, { env, assertCurrent, changelog },
  { command = run, request = fetch, delay = setTimeout } = {}) {
  const status = async () => JSON.parse(await command(
    ["wrangler", "deployments", "status", ...config, "--json"], { env, capture: true },
  ));
  const deploy = (...specs) => command(["wrangler", "versions", "deploy", ...specs, ...config,
    "--yes", "--message", `MoriWebsite production version ${specs.join(" ")}`], { env });
  const isActive = ({ versions }, id = versionId) => versions?.length === 1 &&
    versions[0].version_id === id && versions[0].percentage === 100;
  const isStaged = ({ versions }, previousId) => versions?.length === 2 &&
    versions.some((v) => v.version_id === previousId && v.percentage === 100) &&
    versions.some((v) => v.version_id === versionId && v.percentage === 0);

  async function verify(candidate = false) {
    const headers = candidate ? { "Cloudflare-Workers-Version-Overrides": `website="${versionId}"` } : {};
    const get = (path, method = "GET") => request(new URL(path, origin), {
      method, headers, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(6000),
    });
    for (let attempt = 1; ; attempt++) {
      try {
        const [version, homepage, log] = await Promise.all([
          get("/api/version"), get("/"), get("/changelog.json"),
        ]);
        if (!version.ok || (await version.json()).version !== versionId)
          throw new Error("The production domain did not serve the expected Worker Version ID");
        if (!log.ok || !sameChangelog(await log.json(), changelog))
          throw new Error("The Worker changelog does not match the Markdown used to build it");
        if (!candidate) {
          const api = await get("/api/changelog");
          if (!api.ok || !sameChangelog(await api.json(), changelog))
            throw new Error("The website API does not match the deployed changelog");
        }
        if (!homepage.ok || !homepage.headers.get("content-type")?.includes("text/html"))
          throw new Error(`Homepage did not return HTML (HTTP ${homepage.status})`);
        const html = await homepage.text();
        const entry = html.match(/<script\b[^>]*\btype="module"[^>]*\bsrc="(\/(?!\/)[^"?#]+\.js)"/u)?.[1];
        if (!entry) throw new Error("Homepage does not reference its compiled JavaScript");
        const asset = await get(entry, "HEAD");
        if (!asset.ok || !asset.headers.get("content-type")?.includes("javascript"))
          throw new Error(`Compiled JavaScript is unavailable (HTTP ${asset.status})`);
        return;
      } catch (error) {
        if (attempt === 8) throw error;
        await delay(5000);
      }
    }
  }

  const active = await observeBuild("deploy", "read active website deployment", status);
  const previousId = active.versions?.find(({ percentage }) => percentage === 100)?.version_id;
  if (!previousId) throw new Error("Expected an existing website version with 100% traffic");
  await assertCurrent();
  if (!isActive(active)) {
    let changedTraffic = isStaged(active, previousId);
    try {
      if (previousId !== versionId) {
        if (!isStaged(active, previousId)) await observeBuild("deploy", "stage website version at 0%", async () => {
          if ((await status()).id !== active.id) throw new Error("Production traffic changed before staging");
          changedTraffic = true;
          await deploy(`${previousId}@100%`, `${versionId}@0%`);
        }, { versionId });
        await observeBuild("deploy", "verify candidate with no public traffic", () => verify(true), { versionId });
      }
      await assertCurrent();
      const staged = await status();
      if (previousId === versionId ? staged.id !== active.id : !isStaged(staged, previousId))
        throw new Error("The active deployment changed during verification");
      await observeBuild("deploy", "switch traffic to verified version", () => deploy(`${versionId}@100%`), { versionId });
      await observeBuild("deploy", "verify production website", () => verify(), { versionId });
      if (!isActive(await status())) throw new Error("The verified website version is not at 100%");
    } catch (error) {
      try {
        const current = await status();
        if (changedTraffic && previousId !== versionId && (isStaged(current, previousId) || isActive(current))) {
          await observeBuild("deploy", "restore previous website version", async () => {
            await deploy(`${previousId}@100%`);
            if (!isActive(await status(), previousId)) throw new Error("Rollback did not restore 100% traffic");
          }, { previousId });
        }
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], `Deployment failed and restoration of ${previousId} could not be verified`);
      }
      throw error;
    }
  } else {
    await observeBuild("deploy", "verify already active website version", () => verify(), { versionId });
  }
  const deployment = await status();
  if (!isActive(deployment)) throw new Error("Production traffic changed before deployment verification finished");
  buildEvent("deploy", "production website", "verified", { versionId, deploymentId: deployment.id });
}
