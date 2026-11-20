export const ANNOUNCEMENTS_SCHEMA_VERSION = 1;

export const ANNOUNCEMENT_TONES = new Set(["info", "warning", "error"]);
export const ANNOUNCEMENT_PRIORITIES = new Set(["normal", "important"]);
export const ANNOUNCEMENT_TEXT_LIMITS = Object.freeze({
  id: 128,
  title: 160,
  summary: 320,
  body: 20000,
});

const normalizeBoundedText = (value, maxLength) => {
  if (typeof value !== "string") return "";
  const text = value.trim();
  return text && text.length <= maxLength ? text : "";
};

export const normalizeAnnouncement = (value, { now } = {}) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const id = normalizeBoundedText(value.id, ANNOUNCEMENT_TEXT_LIMITS.id);
  const title = normalizeBoundedText(
    value.title,
    ANNOUNCEMENT_TEXT_LIMITS.title,
  );
  const summary = normalizeBoundedText(
    value.summary,
    ANNOUNCEMENT_TEXT_LIMITS.summary,
  );
  const body = normalizeBoundedText(value.body, ANNOUNCEMENT_TEXT_LIMITS.body);
  const revision = value.revision;
  const tone = typeof value.tone === "string" ? value.tone.trim() : "";
  const priority =
    typeof value.priority === "string" ? value.priority.trim() : "";
  const pinned = value.pinned ?? false;
  const startsAt =
    typeof value.startsAt === "string" ? value.startsAt.trim() : "";
  const startsAtTimestamp = Date.parse(startsAt);
  const endsAt =
    value.endsAt == null
      ? null
      : typeof value.endsAt === "string"
        ? value.endsAt.trim()
        : "";
  const endsAtTimestamp = endsAt === null ? null : Date.parse(endsAt);
  const evaluateAtNow = Number.isFinite(now);

  if (
    !id ||
    !title ||
    !summary ||
    !body ||
    !Number.isSafeInteger(revision) ||
    revision < 1 ||
    !ANNOUNCEMENT_TONES.has(tone) ||
    !ANNOUNCEMENT_PRIORITIES.has(priority) ||
    typeof pinned !== "boolean" ||
    !Number.isFinite(startsAtTimestamp) ||
    (endsAtTimestamp !== null &&
      (!Number.isFinite(endsAtTimestamp) ||
        endsAtTimestamp <= startsAtTimestamp)) ||
    (!evaluateAtNow && typeof value.active !== "boolean")
  ) {
    return null;
  }

  // 定时公告在生效前不通过公开接口泄露。
  if (evaluateAtNow && startsAtTimestamp > now) {
    return null;
  }

  return {
    id,
    revision,
    title,
    summary,
    body,
    tone,
    priority,
    pinned,
    startsAt: new Date(startsAtTimestamp).toISOString(),
    endsAt:
      endsAtTimestamp === null ? null : new Date(endsAtTimestamp).toISOString(),
    active: evaluateAtNow
      ? endsAtTimestamp === null || endsAtTimestamp > now
      : value.active,
  };
};

export const normalizeAnnouncementsPayload = (
  payload,
  {
    now,
    requireServerTime = true,
    sortByStartsAt = false,
    onInvalidItem = null,
  } = {},
) => {
  const updatedAtRaw =
    typeof payload?.updatedAt === "string" ? payload.updatedAt.trim() : "";
  const updatedAtTimestamp = Date.parse(updatedAtRaw);
  const hasServerTime = typeof payload?.serverTime === "string";
  const serverTimeTimestamp = hasServerTime
    ? Date.parse(payload.serverTime.trim())
    : NaN;
  const evaluateAtNow = Number.isFinite(now);

  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    payload.schemaVersion !== ANNOUNCEMENTS_SCHEMA_VERSION ||
    !Array.isArray(payload.items) ||
    !Number.isFinite(updatedAtTimestamp) ||
    (requireServerTime && !Number.isFinite(serverTimeTimestamp)) ||
    (hasServerTime && !Number.isFinite(serverTimeTimestamp))
  ) {
    throw new TypeError("公告接口返回了无效的数据结构。");
  }

  const seenIds = new Set();
  const items = [];

  for (const value of payload.items) {
    if (evaluateAtNow) {
      const startsAtTimestamp = Date.parse(value?.startsAt);
      if (Number.isFinite(startsAtTimestamp) && startsAtTimestamp > now) {
        continue;
      }
    }

    const item = normalizeAnnouncement(value, { now });
    if (!item || seenIds.has(item.id)) {
      onInvalidItem?.(value);
      continue;
    }

    seenIds.add(item.id);
    items.push(item);
  }

  if (sortByStartsAt) {
    items.sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt));
  }

  const resolvedServerTime = Number.isFinite(serverTimeTimestamp)
    ? new Date(serverTimeTimestamp).toISOString()
    : evaluateAtNow
      ? new Date(now).toISOString()
      : undefined;

  return {
    schemaVersion: ANNOUNCEMENTS_SCHEMA_VERSION,
    updatedAt: evaluateAtNow
      ? new Date(updatedAtTimestamp).toISOString()
      : payload.updatedAt,
    ...(resolvedServerTime ? { serverTime: resolvedServerTime } : {}),
    items,
  };
};
