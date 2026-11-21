import { readFile } from "node:fs/promises";
import { snapshotStore } from "../build/snapshot-store.mjs";

export function stripJsonComments(text) {
  return String(text || "").replace(
    /("(?:\\.|[^"\\])*")|(\/\/[^\r\n]*)|(\/\*[\s\S]*?\*\/)/g,
    (match, stringGroup) => (stringGroup ? match : ""),
  );
}

export function parseJsonc(text) {
  const stripped = stripJsonComments(text).replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(stripped);
}

export async function readWorkerConfig(file = "wrangler.jsonc") {
  return parseJsonc(await readFile(file, "utf8"));
}

export function publishStores(config, { snapshotOnly = false } = {}) {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID || config.account_id;
  if (!/^[a-f0-9]{32}$/.test(account || "") || config.account_id && account !== config.account_id)
    throw new Error("Cloudflare account does not match wrangler.jsonc");
  const bucket = config.r2_buckets?.find(({ binding }) => binding === "NOVEL_VAULT")?.bucket_name;
  if (!bucket) throw new Error("NOVEL_VAULT is missing in wrangler.jsonc");
  if (process.env.NOVEL_R2_BUCKET && process.env.NOVEL_R2_BUCKET !== bucket)
    throw new Error("NOVEL_R2_BUCKET differs from the website NOVEL_VAULT binding");
  const endpoint = `https://${account}.r2.cloudflarestorage.com`;
  return {
    cache: snapshotStore({ defaults: { endpoint, bucket: "website-build-snapshots", namespace: "production" } }),
    novel: snapshotOnly ? null : snapshotStore({ prefix: "NOVEL_R2", namespace: "v1", defaults: { endpoint, bucket } }),
  };
}
