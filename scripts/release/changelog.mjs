import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import {
  compareVersions,
  normalizeChangelogPayload,
  sameChangelog,
} from "../../shared/changelog.js";
import { readWorkerConfig } from "../lib/worker-config.mjs";
import { run } from "../lib/commands.mjs";
import { openEditor, printDiff } from "../lib/release-utils.mjs";
import { waitForPublishedContent } from "./verify-published.mjs";

import {
  CHANGELOG_DIR,
  PROJECT_ROOT,
  SEMVER_BUMPS,
  createChangelogPayload,
  formatLocalDate,
  nextVersion,
  parseReleaseMarkdown,
  readReleaseFiles,
  releasePath,
  renderReleaseMarkdown,
  validateReleaseChain,
  writeStaticChangelog,
} from "./changelog-content.mjs";
const CONFIG_PATH = "wrangler.api.jsonc";
const KV_BINDING = "CHANGELOG_KV";
const KV_KEY = "changelog:v1";
const PUBLIC_ENDPOINT = "https://api.komori.cc/changelog";
const BACKUP_DIR = join(PROJECT_ROOT, ".tmp", "changelog-backups");
const TEMP_DIR = join(PROJECT_ROOT, ".tmp", "changelog");
const PACKAGE_PATH = join(PROJECT_ROOT, "package.json");
const README_PATHS = ["README.md", "README_en.md", "README_fr.md", "README_si.md"].map((name) =>
  join(PROJECT_ROOT, name),
);
const README_VERSION_PATTERN = /^([\t ]*(?:当前版本：|Current version:|Version actuelle :|වත්මන් අනුවාදය:)[\t ]*<strong>)([^<\r\n]+)(<\/strong>)/gm;
const DRAFT_INTRO = "请填写版本概述。";
const DRAFT_CHANGE = "- 请填写更新内容。";
const DRAFT_WARNING = "请说明破坏性变化和升级方式。";

const helpText = `撰写版本更新日志，准备发布资料，并将更新内容展示到网站。

用法：pnpm release changelog <命令> [选项]

命令：
  new <major|minor|patch|version>       创建版本日志草稿并打开编辑器
  edit <version>                        编辑版本日志
  list                                  查看全部本地版本
  check                                 检查版本内容与发布顺序
  generate                              生成供网站展示的更新日志
  prepare <version> [--date YYYY-MM-DD] 同步版本号、项目说明和更新日志
  publish --dry-run                    查看正式更新日志的同步差异

选项：
  --dry-run    预览版本准备或发布结果
`;

const parseOptions = (args) => {
  const options = new Map();
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (!value.startsWith("--")) {
      positional.push(value);
      continue;
    }
    const [name, inlineValue] = value.split("=", 2);
    if (inlineValue !== undefined) {
      options.set(name, inlineValue);
    } else if (name === "--date" && args[index + 1] && !args[index + 1].startsWith("--")) {
      options.set(name, args[index + 1]);
      index += 1;
    } else {
      options.set(name, true);
    }
  }
  return { positional, options };
};

async function getRemotePayload(request = fetch) {
  if (process.env.CLOUDFLARE_API_TOKEN) {
    const { kv_namespaces: namespaces } = await readWorkerConfig(CONFIG_PATH);
    const account = process.env.CLOUDFLARE_ACCOUNT_ID || (await readWorkerConfig()).account_id;
    const namespace = namespaces?.find(({ binding }) => binding === KV_BINDING)?.id;
    if (namespace && account) {
      const response = await request(
        `https://api.cloudflare.com/client/v4/accounts/${account}/storage/kv/namespaces/${namespace}/values/${encodeURIComponent(KV_KEY)}`,
        {
          headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` },
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (response.status === 404) return null;
      if (response.ok) {
        const raw = await response.text();
        try {
          return normalizeChangelogPayload(JSON.parse(raw), {
            requireServerTime: false,
            strictItems: true,
          });
        } catch {
          console.warn("远端更新日志格式无效，将以已部署网站的 Markdown 数据为准。");
          return null;
        }
      }
    }
  }

  try {
    const raw = await run(
      ["wrangler", "kv", "key", "get", KV_KEY, "--binding", KV_BINDING, "--remote", "--config", CONFIG_PATH, "--text"],
      { capture: true },
    );
    if (raw) {
      return normalizeChangelogPayload(JSON.parse(raw), {
        requireServerTime: false,
        strictItems: true,
      });
    }
  } catch {
    try {
      const response = await request(`${PUBLIC_ENDPOINT}?publish=${Date.now()}`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(6000),
      });
      if (response.ok) {
        return normalizeChangelogPayload(await response.json(), {
          requireServerTime: false,
          strictItems: true,
        });
      }
    } catch {}
  }

  throw new Error("缺少更新日志 KV 配置或 Workers Builds API Token，且无法通过 Wrangler 读取。");
}

const releaseMap = (items) => new Map(items.map((item) => [item.version, item]));

const diffPayloads = (localItems, remoteItems) => {
  const local = releaseMap(localItems);
  const remote = releaseMap(remoteItems);
  return {
    added: localItems.filter((item) => !remote.has(item.version)),
    changed: localItems.filter((item) => remote.has(item.version) && JSON.stringify(item) !== JSON.stringify(remote.get(item.version))),
    removed: remoteItems.filter((item) => !local.has(item.version)),
  };
};

const verifyPublicEndpoint = async (expected, request) => {
  try {
    const response = await request(`${PUBLIC_ENDPOINT}?publish=${Date.now()}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    return response.ok && sameChangelog(expected, normalizeChangelogPayload(await response.json(), {
      requireServerTime: true,
      strictItems: true,
    }));
  } catch {
    return false;
  }
};

export const publishAllReleases = async ({ dryRun }) => {
  if (!dryRun) throw new Error("更新日志只在正式网站部署验证后自动同步；可用 --dry-run 查看差异。");
  const local = createChangelogPayload(await readReleaseFiles({ allowDraftPlaceholders: true }));
  const remote = await getRemotePayload();
  printDiff(diffPayloads(local.items, remote?.items || []), {
    formatItem: (item) => `${item.version} · ${item.summary}`,
    emptyMessage: "更新日志内容已与网站一致。",
  });
};

export async function publishReleaseChangelog(versionId,
  { request = fetch, command = run, wait = waitForPublishedContent } = {}) {
  const payload = createChangelogPayload(await readReleaseFiles({ allowDraftPlaceholders: true }));
  const remote = await getRemotePayload(request);
  // Retry a write only when needed. A previous attempt may have written KV but timed
  // out waiting for propagation; in that case just verify the public endpoint again.
  if (!sameChangelog(payload, remote)) {
    const active = await request("https://komori.cc/api/version", {
      cache: "no-store", signal: AbortSignal.timeout(6000),
    });
    if (!active.ok || (await active.json()).version !== versionId)
      throw new Error("更新日志所属的网站版本未在线上生效。");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    await mkdir(TEMP_DIR, { recursive: true });
    const file = join(TEMP_DIR, `publish-${process.pid}.json`);
    if (remote) {
      await mkdir(BACKUP_DIR, { recursive: true });
      await writeFile(join(BACKUP_DIR, `${timestamp}.json`), JSON.stringify(remote), "utf8");
    }
    await writeFile(file, JSON.stringify(payload), "utf8");
    try {
      await command(["wrangler", "kv", "key", "put", KV_KEY, "--binding", KV_BINDING,
        "--remote", "--config", CONFIG_PATH, "--path", file]);
    } finally {
      await unlink(file).catch(() => {});
    }
  }
  await wait(() => verifyPublicEndpoint(payload, request));
  console.log(`更新日志同步并验证成功：${payload.items.length} 个版本。`);
}

const findRelease = async (version, options) => {
  if (!version) throw new Error("请提供版本号。");
  const entries = await readReleaseFiles(options);
  const entry = entries.find((item) => item.release.version === version);
  if (!entry) throw new Error(`未找到版本：${version}`);
  return { entries, entry };
};

const resolveDraftTarget = (value, entries) => {
  if (!value) throw new Error("请提供 major、minor、patch 或明确版本号。");
  const latest = entries
    .map((entry) => entry.release)
    .filter((release) => release.status === "released")
    .sort((left, right) => compareVersions(right.version, left.version))[0];
  if (!latest) throw new Error("缺少可用于计算下一版本的正式日志。");
  if (entries.some((entry) => entry.release.status === "draft")) {
    throw new Error("当前已经存在草稿版本，请先编辑、发布或移除该草稿。");
  }

  const candidates = new Map(
    SEMVER_BUMPS.map((bump) => [nextVersion(latest.version, bump), bump]),
  );
  if (SEMVER_BUMPS.includes(value)) {
    return { bump: value, version: nextVersion(latest.version, value) };
  }
  const bump = candidates.get(value);
  if (!bump) {
    throw new Error(
      `${value} 不是 ${latest.version} 的下一合法版本；可用版本为 ${Array.from(candidates.keys()).join("、")}。`,
    );
  }
  return { bump, version: value };
};

const createDraft = async (value) => {
  const entries = await readReleaseFiles();
  const { bump, version } = resolveDraftTarget(value, entries);
  const path = releasePath(version);
  try {
    await readFile(path, "utf8");
    throw new Error(`版本文件已存在：${version}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await mkdir(CHANGELOG_DIR, { recursive: true });
  const heading = bump === "patch" ? "修复" : "功能";
  const metadata = `---\nversion: ${version}\nstatus: draft\nsummary: 请填写本次更新摘要\n${bump === "major" ? "breaking: true\n" : ""}---\n\n`;
  const warning = bump === "major"
    ? `\n\n## 升级前请注意\n\n${DRAFT_WARNING}`
    : "";
  await writeFile(
    path,
    `${metadata}${DRAFT_INTRO}\n\n## ${heading}\n\n${DRAFT_CHANGE}${warning}\n`,
    "utf8",
  );
  console.log(`已创建：${path}`);
  await openEditor(path);
  const release = parseReleaseMarkdown(await readFile(path, "utf8"), basename(path));
  validateReleaseChain([...entries, { release }]);
  console.log("草稿校验通过。");
};

const listReleases = async () => {
  const entries = await readReleaseFiles();
  console.table(entries.map(({ release }) => ({
    version: release.version,
    status: release.status,
    date: release.date || "—",
    changes: release.groups.reduce((sum, group) => sum + group.count, 0),
    summary: release.summary,
  })));
};

const checkReleases = async () => {
  const entries = await readReleaseFiles();
  const releasedCount = entries.filter(
    ({ release }) => release.status === "released",
  ).length;
  console.log(
    `更新日志校验通过：${entries.length} 个本地版本，${releasedCount} 个正式版本。`,
  );
};

const readReadmeVersions = async () =>
  Promise.all(README_PATHS.map(async (path) => {
    const content = await readFile(path, "utf8");
    const matches = [...content.matchAll(README_VERSION_PATTERN)];
    if (matches.length !== 1) {
      throw new Error(`${basename(path)} 必须包含唯一的当前版本标记。`);
    }
    return { path, content, version: matches[0][2].trim() };
  }));

export const verifyReleaseVersion = async (expectedVersion) => {
  const entries = await readReleaseFiles();
  const released = entries
    .map((entry) => entry.release)
    .filter((release) => release.status === "released")
    .sort((left, right) => compareVersions(right.version, left.version));
  const latest = released[0];
  const pkg = JSON.parse(await readFile(PACKAGE_PATH, "utf8"));

  if (!latest) throw new Error("缺少正式更新日志。");
  if (pkg.version !== latest.version) {
    throw new Error(
      `package.json 版本 ${pkg.version} 与最新正式日志 ${latest.version} 不一致。`,
    );
  }
  if (expectedVersion && expectedVersion !== latest.version) {
    throw new Error(
      `发布版本 ${expectedVersion} 与最新正式日志 ${latest.version} 不一致。`,
    );
  }

  for (const readme of await readReadmeVersions()) {
    if (readme.version !== latest.version) {
      throw new Error(
        `${basename(readme.path)} 版本 ${readme.version} 与最新正式日志 ${latest.version} 不一致。`,
      );
    }
  }

  return { entries, version: latest.version };
};

const updatePackageVersion = (content, currentVersion, nextVersionValue) => {
  const escapedVersion = currentVersion.replaceAll(".", "\\.");
  const pattern = new RegExp(
    `(\\"version\\"\\s*:\\s*\\")${escapedVersion}(\\")`,
  );
  const updated = content.replace(pattern, `$1${nextVersionValue}$2`);
  if (updated === content && currentVersion !== nextVersionValue) {
    throw new Error("无法更新 package.json 的 version 字段。");
  }
  return updated;
};

export const prepareRelease = async (version, { date, dryRun = false } = {}) => {
  const { entries, entry } = await findRelease(version);
  if (entry.release.status !== "draft") throw new Error(`${version} 已是正式版本。`);
  const packageContent = await readFile(PACKAGE_PATH, "utf8");
  const pkg = JSON.parse(packageContent);
  const currentReleasedVersion = entries
    .map((item) => item.release)
    .filter((release) => release.status === "released")
    .sort((left, right) => compareVersions(right.version, left.version))[0]?.version;
  if (pkg.version !== currentReleasedVersion && pkg.version !== version) {
    throw new Error(
      `package.json 当前版本为 ${pkg.version}，应为最新正式版本 ${currentReleasedVersion}。`,
    );
  }
  const releaseContent = renderReleaseMarkdown({
    ...entry.release,
    status: "released",
    date: date || formatLocalDate(),
  });
  const release = parseReleaseMarkdown(releaseContent, entry.name);
  const candidateEntries = entries.map((item) => item === entry ? { ...item, release } : item);
  validateReleaseChain(candidateEntries);
  const readmes = await readReadmeVersions();
  if (dryRun) {
    console.log(`准备发布：${pkg.version} → ${version}`);
    console.log(`发布日期：${release.date}`);
    console.log("准备结果预览：版本号、各语言项目说明和更新日志将就绪。确认后移除 --dry-run 再次运行。");
    return;
  }

  const snapshots = [
    ...readmes.map(({ path, content }) => [path, content]),
    [entry.path, entry.content],
    [PACKAGE_PATH, packageContent],
  ];

  try {
    await writeFile(entry.path, releaseContent, "utf8");
    await writeFile(
      PACKAGE_PATH,
      updatePackageVersion(packageContent, pkg.version, version),
      "utf8",
    );
    for (const { path, content } of readmes) {
      await writeFile(
        path,
        content.replace(README_VERSION_PATTERN, (_, prefix, previousVersion, suffix) =>
          `${prefix}${version}${suffix}`,
        ),
        "utf8",
      );
    }
  } catch (error) {
    await Promise.all(
      snapshots.map(([path, content]) => writeFile(path, content, "utf8")),
    );
    throw error;
  }

  console.log(`\n版本 ${version} 的发布资料已准备完成。`);
};

export async function finalizeRelease(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version))
    throw new Error("请先将一个正式版本号的更新日志草稿提交到 main。");
  await prepareRelease(version);
  await verifyReleaseVersion(version);
  return version;
}

const main = async () => {
  const [command = "help", ...rawArgs] = process.argv.slice(2);
  const { positional, options } = parseOptions(rawArgs);
  const version = positional[0];
  switch (command) {
    case "new":
      await createDraft(version);
      break;
    case "edit": {
      const { entries, entry } = await findRelease(version, { allowDraftPlaceholders: true });
      await openEditor(entry.path);
      const release = parseReleaseMarkdown(
        await readFile(entry.path, "utf8"),
        entry.name,
      );
      validateReleaseChain(
        entries.map((item) => (item === entry ? { ...item, release } : item)),
      );
      console.log("更新日志校验通过。");
      break;
    }
    case "list":
      await listReleases();
      break;
    case "check":
      await checkReleases();
      break;
    case "generate": {
      const payload = await writeStaticChangelog();
      console.log(`网站更新日志已生成：共 ${payload.items.length} 个正式版本。`);
      break;
    }
    case "prepare":
      await prepareRelease(version, {
        date: options.get("--date"),
        dryRun: options.has("--dry-run"),
      });
      break;
    case "publish":
      await publishAllReleases({
        dryRun: options.has("--dry-run"),
      });
      break;
    case "help":
    case "--help":
    case "-h":
      console.log(helpText);
      break;
    default:
      throw new Error(`未知命令：${command}\n\n${helpText}`);
  }
};

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(pathToFileURL(resolve(process.argv[1])));
if (isMain) {
  main().catch((error) => {
    console.error(`\n更新日志工具执行失败：${error.message}`);
    process.exitCode = 1;
  });
}
