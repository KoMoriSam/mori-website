export const CHANGELOG_SCHEMA_VERSION = 1;

export const CHANGELOG_TYPES = Object.freeze({
  feature: "功能",
  improve: "改进",
  fix: "修复",
  performance: "优化",
  refactor: "重构",
  chore: "维护",
});

export const CHANGELOG_TYPE_ORDER = Object.freeze(
  Object.keys(CHANGELOG_TYPES),
);

export const CHANGELOG_VERSION_PATTERN =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
export const CHANGELOG_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const CHANGELOG_TEXT_LIMITS = Object.freeze({
  version: 80,
  summary: 320,
  markdown: 30000,
});

export const isValidDate = (value) => {
  if (typeof value !== "string" || !CHANGELOG_DATE_PATTERN.test(value)) {
    return false;
  }
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === value
  );
};

export const compareVersions = (left, right) => {
  const parse = (value) => {
    const [core, prerelease = ""] = String(value || "").split("-", 2);
    return { core: core.split(".").map(Number), prerelease };
  };
  const a = parse(left);
  const b = parse(right);

  for (let index = 0; index < 3; index += 1) {
    const difference = (a.core[index] || 0) - (b.core[index] || 0);
    if (difference !== 0) return difference;
  }
  if (!a.prerelease && b.prerelease) return 1;
  if (a.prerelease && !b.prerelease) return -1;
  return a.prerelease.localeCompare(b.prerelease, "en", { numeric: true });
};

const normalizeBoundedText = (value, maxLength) => {
  if (typeof value !== "string") return "";
  const text = value.trim();
  return text && text.length <= maxLength ? text : "";
};

const normalizeOptionalMarkdown = (value) => {
  if (value == null) return "";
  if (
    typeof value !== "string" ||
    value.length > CHANGELOG_TEXT_LIMITS.markdown
  ) {
    return null;
  }
  return value.trim();
};

export const normalizeRelease = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const version = normalizeBoundedText(
    value.version,
    CHANGELOG_TEXT_LIMITS.version,
  );
  const date = typeof value.date === "string" ? value.date.trim() : "";
  const summary = normalizeBoundedText(
    value.summary,
    CHANGELOG_TEXT_LIMITS.summary,
  );
  const intro =
    typeof value.intro === "string" &&
    value.intro.length <= CHANGELOG_TEXT_LIMITS.markdown
      ? value.intro.trim()
      : null;
  const note = normalizeOptionalMarkdown(value.note);
  const warning = normalizeOptionalMarkdown(value.warning);

  if (
    !CHANGELOG_VERSION_PATTERN.test(version) ||
    !isValidDate(date) ||
    !summary ||
    intro === null ||
    note === null ||
    warning === null ||
    !Array.isArray(value.groups) ||
    !value.groups.length
  ) {
    return null;
  }

  const seenTypes = new Set();
  const groups = [];
  for (const group of value.groups) {
    const type = typeof group?.type === "string" ? group.type.trim() : "";
    const markdown = normalizeBoundedText(
      group?.markdown,
      CHANGELOG_TEXT_LIMITS.markdown,
    );
    const count = group?.count;
    if (
      !Object.hasOwn(CHANGELOG_TYPES, type) ||
      seenTypes.has(type) ||
      !markdown ||
      !Number.isSafeInteger(count) ||
      count < 1
    ) {
      return null;
    }
    seenTypes.add(type);
    groups.push({ type, markdown, count });
  }

  return {
    version,
    date,
    summary,
    intro,
    groups,
    ...(note ? { note } : {}),
    ...(warning ? { warning } : {}),
  };
};

export const normalizeChangelogPayload = (
  payload,
  {
    requireServerTime = true,
    strictItems = false,
    onInvalidItem = null,
    serverTime: fallbackServerTime,
  } = {},
) => {
  const updatedAtRaw =
    typeof payload?.updatedAt === "string" ? payload.updatedAt.trim() : "";
  const updatedAtTimestamp = Date.parse(updatedAtRaw);
  const hasServerTime = typeof payload?.serverTime === "string";
  const serverTimeTimestamp = hasServerTime
    ? Date.parse(payload.serverTime.trim())
    : NaN;

  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    payload.schemaVersion !== CHANGELOG_SCHEMA_VERSION ||
    !Array.isArray(payload.items) ||
    !Number.isFinite(updatedAtTimestamp) ||
    (requireServerTime && !Number.isFinite(serverTimeTimestamp)) ||
    (hasServerTime && !Number.isFinite(serverTimeTimestamp))
  ) {
    throw new TypeError("更新日志接口返回了无效的数据结构。");
  }

  const seenVersions = new Set();
  const items = [];
  for (const value of payload.items) {
    const item = normalizeRelease(value);
    if (!item || seenVersions.has(item.version)) {
      if (strictItems) {
        throw new TypeError("更新日志数据包含无效或重复的版本条目。");
      }
      onInvalidItem?.(value);
      continue;
    }
    seenVersions.add(item.version);
    items.push(item);
  }

  const resolvedServerTime = Number.isFinite(serverTimeTimestamp)
    ? new Date(serverTimeTimestamp).toISOString()
    : fallbackServerTime;

  return {
    schemaVersion: CHANGELOG_SCHEMA_VERSION,
    updatedAt: new Date(updatedAtTimestamp).toISOString(),
    ...(resolvedServerTime ? { serverTime: resolvedServerTime } : {}),
    items: items.sort((left, right) =>
      compareVersions(right.version, left.version),
    ),
  };
};

// serverTime describes the response, so it is not part of the published revision.
export const changelogRevision = (payload) =>
  JSON.stringify([payload.schemaVersion, payload.updatedAt, payload.items]);

export const sameChangelog = (left, right) =>
  left?.schemaVersion === CHANGELOG_SCHEMA_VERSION &&
  right?.schemaVersion === CHANGELOG_SCHEMA_VERSION &&
  Array.isArray(left.items) &&
  Array.isArray(right.items) &&
  changelogRevision(left) === changelogRevision(right);
