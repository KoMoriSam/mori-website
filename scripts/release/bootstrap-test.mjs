import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { deployEnvironment } from "../lib/build-environment.mjs";
import { run } from "../lib/commands.mjs";
import { loadLocalAnnouncements } from "./announcement.mjs";
import { writeStaticChangelog } from "./changelog-content.mjs";
import { deploymentConfigs } from "./environment.mjs";

const [action, target, ...extra] = process.argv.slice(2);
if (!["--dry-run", "--apply"].includes(action) ||
    (target && !["--auth-only", "--api-only"].includes(target)) || extra.length)
  throw new Error("Use --dry-run or --apply [--auth-only|--api-only]");

async function syncTestApiKv(apiConfig, root, env) {
  const changelogFile = resolve(root, "changelog.json");
  await writeStaticChangelog(null, changelogFile);
  await run(
    ["wrangler", "kv", "key", "put", "changelog:v1", "--path", changelogFile,
      "--binding", "CHANGELOG_KV", "--remote", "--config", apiConfig],
    { env, cwd: root, capture: true },
  );

  let hasAnnouncements = false;
  try {
    const existing = await run(
      ["wrangler", "kv", "key", "get", "announcements:v1",
        "--binding", "ANNOUNCEMENTS_KV", "--remote", "--config", apiConfig, "--text"],
      { env, cwd: root, capture: true },
    );
    hasAnnouncements = Boolean(existing);
  } catch {
    // 测试公告 KV 尚未初始化时写入种子公告，避免覆盖已有测试公告。
  }
  if (hasAnnouncements) return;

  const entries = await loadLocalAnnouncements();
  const items = entries.map(({ announcement }) => announcement);
  if (!items.length) {
    items.push({
      id: "test-announcement",
      revision: 1,
      title: "测试环境公告",
      summary: "用于验证测试站公告中心与已读状态。",
      body: "这条公告仅在测试环境中展示。",
      tone: "info",
      priority: "important",
      pinned: true,
      startsAt: "2026-01-01T00:00:00.000Z",
    });
  }
  const announcementsFile = resolve(root, "announcements.json");
  await writeFile(announcementsFile, JSON.stringify({
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    items,
  }));
  await run(
    ["wrangler", "kv", "key", "put", "announcements:v1", "--path", announcementsFile,
      "--binding", "ANNOUNCEMENTS_KV", "--remote", "--config", apiConfig],
    { env, cwd: root, capture: true },
  );
}

const env = deployEnvironment();
await mkdir(".tmp", { recursive: true });
const root = await mkdtemp(resolve(".tmp/test-backends-"));
try {
  for (const name of ["workers", "shared", "migrations", "wrangler.auth.jsonc", "wrangler.api.jsonc"])
    await cp(name, resolve(root, name), { recursive: true });
  const configs = await deploymentConfigs(root);
  const targets = target === "--auth-only" ? ["auth"] : target === "--api-only" ? ["api"] : ["auth", "api"];
  const migrations = { auth: "AUTH_DB", api: "ANALYTICS_DB" };
  if (action === "--apply") {
    for (const name of targets) {
      await run(
        ["wrangler", "d1", "migrations", "apply", migrations[name], "--remote", "--config", configs[name]],
        { env, cwd: root },
      );
    }
    if (targets.includes("api")) {
      await syncTestApiKv(configs.api, root, env);
    }
  }
  for (const name of targets)
    await run(["wrangler", "deploy", "--config", configs[name], ...(action === "--dry-run" ? ["--dry-run"] : [])],
      { env, cwd: root });
} finally {
  await rm(root, { recursive: true, force: true });
}
