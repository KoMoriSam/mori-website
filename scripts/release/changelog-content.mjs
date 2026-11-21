import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import frontMatter from "front-matter";
import yaml from "js-yaml";
import MarkdownIt from "markdown-it";

import {
  CHANGELOG_SCHEMA_VERSION,
  CHANGELOG_TEXT_LIMITS,
  CHANGELOG_TYPE_ORDER,
  CHANGELOG_TYPES,
  CHANGELOG_VERSION_PATTERN,
  compareVersions,
  isValidDate,
} from "../../shared/changelog.js";
import { formatLocalIso } from "../lib/release-utils.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = resolve(SCRIPT_DIR, "../..");
export const CHANGELOG_DIR = join(PROJECT_ROOT, "changelog", "releases");
export const STATIC_CHANGELOG_PATH = join(
  PROJECT_ROOT,
  ".tmp",
  "changelog",
  "changelog.json",
);
export const SEMVER_BUMPS = Object.freeze(["major", "minor", "patch"]);

const SPECIAL_SECTIONS = Object.freeze({
  版本说明: "note",
  升级前请注意: "warning",
});
const HEADING_TO_TYPE = new Map(
  Object.entries(CHANGELOG_TYPES).map(([type, label]) => [label, type]),
);
const MARKDOWN = new MarkdownIt({ html: false });
const RELEASE_STATUSES = new Set(["draft", "released"]);
const PLACEHOLDERS = [
  "请填写本次更新摘要",
  "请填写版本概述。",
  "请填写更新内容。",
  "请说明破坏性变化和升级方式。",
];

export { formatLocalIso };

export const formatLocalDate = (date = new Date()) => {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}`;
};

const normalizeDate = (value) => {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return typeof value === "string" ? value.trim() : "";
};

const normalizeText = (value, limit = Infinity) => {
  if (typeof value !== "string") return "";
  const text = value.trim();
  return text && text.length <= limit ? text : "";
};

const versionParts = (version) => {
  const [core, prerelease = ""] = String(version).split("-", 2);
  return {
    core: core.split(".").map(Number),
    prerelease,
  };
};

const countTopLevelListItems = (markdown) => {
  const items = MARKDOWN.parse(markdown, {}).filter(
    (token) => token.type === "list_item_open",
  );
  if (!items.length) return 0;
  const minimumLevel = Math.min(...items.map((token) => token.level));
  return items.filter((token) => token.level === minimumLevel).length;
};

const splitReleaseBody = (body, source) => {
  const lines = String(body || "").replace(/\r\n?/g, "\n").split("\n");
  const headings = [];
  const tokens = MARKDOWN.parse(lines.join("\n"), {});

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (
      token.type !== "heading_open" ||
      token.tag !== "h2" ||
      token.level !== 0 ||
      !token.map
    ) {
      continue;
    }
    const label = String(tokens[index + 1]?.content || "").trim();
    headings.push({ label, start: token.map[0], contentStart: token.map[1] });
  }

  const intro = lines.slice(0, headings[0]?.start ?? lines.length).join("\n").trim();
  const groups = [];
  const seenTypes = new Set();
  const special = { note: "", warning: "" };
  let lastGroupOrder = -1;
  let specialOrder = -1;

  headings.forEach((heading, index) => {
    const end = headings[index + 1]?.start ?? lines.length;
    const markdown = lines.slice(heading.contentStart, end).join("\n").trim();
    const type = HEADING_TO_TYPE.get(heading.label);
    const specialKey = SPECIAL_SECTIONS[heading.label];

    if (!type && !specialKey) {
      throw new Error(
        `${source} 包含未知的二级标题“${heading.label}”；仅支持更新分类、版本说明和升级前请注意。`,
      );
    }
    if (!markdown) {
      throw new Error(`${source} 的“${heading.label}”内容不能为空。`);
    }
    if (markdown.length > CHANGELOG_TEXT_LIMITS.markdown) {
      throw new Error(`${source} 的“${heading.label}”内容过长。`);
    }

    if (type) {
      if (specialOrder >= 0) {
        throw new Error(`${source} 的更新分类必须位于版本说明和升级警告之前。`);
      }
      if (seenTypes.has(type)) {
        throw new Error(`${source} 重复定义了“${heading.label}”分类。`);
      }
      const groupOrder = CHANGELOG_TYPE_ORDER.indexOf(type);
      if (groupOrder <= lastGroupOrder) {
        throw new Error(
          `${source} 的分类顺序必须为：${CHANGELOG_TYPE_ORDER.map((item) => CHANGELOG_TYPES[item]).join("、")}。`,
        );
      }
      const count = countTopLevelListItems(markdown);
      if (!count || !MARKDOWN.parse(markdown, {}).some((token) => token.type === "bullet_list_open")) {
        throw new Error(`${source} 的“${heading.label}”必须包含项目符号列表。`);
      }
      lastGroupOrder = groupOrder;
      seenTypes.add(type);
      groups.push({ type, markdown, count });
      return;
    }

    const nextSpecialOrder = specialKey === "note" ? 0 : 1;
    if (nextSpecialOrder <= specialOrder) {
      throw new Error(`${source} 的版本说明必须位于升级警告之前。`);
    }
    if (special[specialKey]) {
      throw new Error(`${source} 重复定义了“${heading.label}”。`);
    }
    specialOrder = nextSpecialOrder;
    special[specialKey] = markdown;
  });

  if (!groups.length) {
    throw new Error(`${source} 至少需要一个更新分类。`);
  }

  return { intro, groups, ...special };
};

export const validateRelease = (release, source = "更新日志") => {
  const errors = [];
  const version = normalizeText(
    release?.version,
    CHANGELOG_TEXT_LIMITS.version,
  );
  const status = normalizeText(release?.status, 20);
  const summary = normalizeText(
    release?.summary,
    CHANGELOG_TEXT_LIMITS.summary,
  );
  const date = normalizeDate(release?.date);
  const breaking = release?.breaking ?? false;

  if (!CHANGELOG_VERSION_PATTERN.test(version)) errors.push("version 必须是有效的语义版本号");
  if (!RELEASE_STATUSES.has(status)) errors.push("status 必须是 draft 或 released");
  if (!summary) errors.push(`summary 必须是 1-${CHANGELOG_TEXT_LIMITS.summary} 个字符`);
  if (date && !isValidDate(date)) errors.push("date 必须是 YYYY-MM-DD 格式的有效日期");
  if (status === "released" && !date) errors.push("正式版本必须提供 date");
  if (typeof breaking !== "boolean") errors.push("breaking 必须是布尔值");
  if (!Array.isArray(release?.groups) || !release.groups.length) {
    errors.push("至少需要一个更新分类");
  }
  if (breaking && !normalizeText(release.warning, CHANGELOG_TEXT_LIMITS.markdown)) {
    errors.push("破坏性版本必须提供“升级前请注意”");
  }

  if (errors.length) {
    throw new Error(`${source} 校验失败：\n- ${errors.join("\n- ")}`);
  }

  return {
    version,
    status,
    ...(date ? { date } : {}),
    summary,
    breaking,
    intro: normalizeText(release.intro, CHANGELOG_TEXT_LIMITS.markdown),
    groups: release.groups,
    note: normalizeText(release.note, CHANGELOG_TEXT_LIMITS.markdown),
    warning: normalizeText(release.warning, CHANGELOG_TEXT_LIMITS.markdown),
  };
};

export const parseReleaseMarkdown = (content, source = "更新日志文件", { allowDraftPlaceholders = false } = {}) => {
  if (!frontMatter.test(content)) {
    throw new Error(`${source} 缺少 YAML front matter。`);
  }
  const parsed = frontMatter(content);
  const sections = splitReleaseBody(parsed.body, source);
  const release = validateRelease(
    {
      version: parsed.attributes.version,
      status: parsed.attributes.status,
      date: parsed.attributes.date,
      summary: parsed.attributes.summary,
      breaking: parsed.attributes.breaking,
      ...sections,
    },
    source,
  );

  if (!(allowDraftPlaceholders && release.status === "draft") &&
      PLACEHOLDERS.some((placeholder) => content.includes(placeholder))) {
    throw new Error(`${source} 仍包含未填写的占位内容。`);
  }
  return release;
};

export const renderReleaseMarkdown = (release) => {
  const normalized = validateRelease(release);
  const metadata = yaml.dump(
    {
      version: normalized.version,
      status: normalized.status,
      ...(normalized.date ? { date: normalized.date } : {}),
      summary: normalized.summary,
      ...(normalized.breaking ? { breaking: true } : {}),
    },
    { lineWidth: -1, noRefs: true, sortKeys: false },
  );
  const sections = [normalized.intro];
  normalized.groups.forEach((group) => {
    sections.push(`## ${CHANGELOG_TYPES[group.type]}\n\n${group.markdown}`);
  });
  if (normalized.note) sections.push(`## 版本说明\n\n${normalized.note}`);
  if (normalized.warning) {
    sections.push(`## 升级前请注意\n\n${normalized.warning}`);
  }
  return `---\n${metadata}---\n\n${sections.filter(Boolean).join("\n\n")}\n`;
};

export const releasePath = (version) => join(CHANGELOG_DIR, `${version}.md`);

export const nextVersion = (version, bump) => {
  if (!SEMVER_BUMPS.includes(bump)) {
    throw new Error(`不支持的版本升级类型：${bump}`);
  }
  const parsed = versionParts(version);
  if (parsed.prerelease || parsed.core.length !== 3 || parsed.core.some((part) => !Number.isSafeInteger(part) || part < 0)) {
    throw new Error(`无法从无效版本号计算下一版本：${version}`);
  }
  const [major, minor, patch] = parsed.core;
  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
};

export const inferReleaseBump = (release) => {
  if (release.breaking) return "major";
  return release.groups.some((group) => group.type === "feature")
    ? "minor"
    : "patch";
};

export const validateReleaseChain = (entries, source = "更新日志版本链") => {
  const releases = entries
    .map((entry) => entry.release || entry)
    .filter((release) => release.status === "released")
    .sort((left, right) => compareVersions(left.version, right.version));
  const drafts = entries
    .map((entry) => entry.release || entry)
    .filter((release) => release.status === "draft");

  if (!releases.length || releases[0].version !== "1.0.0") {
    throw new Error(`${source} 必须从 1.0.0 开始。`);
  }
  if (drafts.length > 1) {
    throw new Error(`${source} 同时只能存在一个草稿版本。`);
  }

  for (let index = 1; index < releases.length; index += 1) {
    const previous = releases[index - 1];
    const current = releases[index];
    const bump = inferReleaseBump(current);
    const expected = nextVersion(previous.version, bump);
    if (current.version !== expected) {
      throw new Error(
        `${source} 中 ${current.version} 的内容要求 ${bump.toUpperCase()} 升级；上一版本 ${previous.version} 的下一合法版本应为 ${expected}。`,
      );
    }
    if (current.date < previous.date) {
      throw new Error(`${source} 中 ${current.version} 的发布日期早于上一版本。`);
    }
  }

  if (drafts.length) {
    const latest = releases.at(-1);
    const draft = drafts[0];
    const bump = inferReleaseBump(draft);
    const expected = nextVersion(latest.version, bump);
    if (draft.version !== expected) {
      throw new Error(
        `${source} 中草稿 ${draft.version} 的内容要求 ${bump.toUpperCase()} 升级；下一合法版本应为 ${expected}。`,
      );
    }
  }

  return { releases, drafts };
};

export const readReleaseFiles = async (options) => {
  await mkdir(CHANGELOG_DIR, { recursive: true });
  const names = (await readdir(CHANGELOG_DIR))
    .filter((name) => name.toLowerCase().endsWith(".md"))
    .sort((left, right) => compareVersions(basename(right, ".md"), basename(left, ".md")));
  const releases = [];
  const versions = new Set();

  for (const name of names) {
    const path = join(CHANGELOG_DIR, name);
    const content = await readFile(path, "utf8");
    const release = parseReleaseMarkdown(content, name, options);
    if (name !== `${release.version}.md`) {
      throw new Error(`${name} 的文件名必须与 version ${release.version} 一致。`);
    }
    if (versions.has(release.version)) {
      throw new Error(`更新日志版本重复：${release.version}`);
    }
    versions.add(release.version);
    releases.push({ path, name, content, release });
  }
  validateReleaseChain(releases);
  return releases;
};

export const toPublicRelease = (release) => ({
  version: release.version,
  date: release.date,
  summary: release.summary,
  intro: release.intro || "",
  groups: release.groups.map(({ type, markdown, count }) => ({
    type,
    markdown,
    count,
  })),
  ...(release.note ? { note: release.note } : {}),
  ...(release.warning ? { warning: release.warning } : {}),
});

export const createChangelogPayload = (
  releases,
  { updatedAt, serverTime } = {},
) => {
  const items = releases
    .map((entry) => entry.release || entry)
    .filter((release) => release.status === "released")
    .sort((left, right) => compareVersions(right.version, left.version))
    .map(toPublicRelease);
  const deterministicTime = items.length
    ? `${items.reduce((latest, item) => (item.date > latest ? item.date : latest), items[0].date)}T00:00:00.000Z`
    : "1970-01-01T00:00:00.000Z";

  return {
    schemaVersion: CHANGELOG_SCHEMA_VERSION,
    updatedAt: updatedAt || deterministicTime,
    ...(serverTime ? { serverTime } : {}),
    items,
  };
};

export const writeStaticChangelog = async (releases = null, output = STATIC_CHANGELOG_PATH) => {
  const entries = releases || (await readReleaseFiles({ allowDraftPlaceholders: true }));
  const basePayload = createChangelogPayload(entries);
  const payload = { ...basePayload, serverTime: basePayload.updatedAt };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(
    output,
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8",
  );
  return payload;
};
