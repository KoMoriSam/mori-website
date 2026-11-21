import { fetchJson, normalizeEndpoint } from "./http.js";

const ENDPOINT = normalizeEndpoint(
  import.meta.env.VITE_ANALYTICS_API ||
    (import.meta.env.PROD ? "https://api.komori.cc/analytics" : ""),
);
const REQUEST_TIMEOUT_MS = 6000;
const RETRY_DELAY_MS = 600;

export const hasAnalyticsApi = Boolean(ENDPOINT);

const normalizeCount = (value) => {
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
};

const normalizePayload = (payload = {}) => {
  const normalized = {
    accepted: Boolean(payload.accepted),
    todayVisits: normalizeCount(payload.todayVisits),
    totalVisits: normalizeCount(payload.totalVisits),
    totalReads: normalizeCount(payload.totalReads),
    startedAt: String(payload.startedAt || ""),
  };

  if (Object.hasOwn(payload, "contentReads")) {
    normalized.contentReads = normalizeCount(payload.contentReads);
  }

  if (Object.hasOwn(payload, "contentTypeReads")) {
    normalized.contentTypeReads = normalizeCount(payload.contentTypeReads);
  }

  if (payload.contentReadsById && typeof payload.contentReadsById === "object") {
    normalized.contentReadsById = Object.fromEntries(
      Object.entries(payload.contentReadsById).map(([contentId, reads]) => [
        String(contentId),
        normalizeCount(reads),
      ]),
    );
  }

  return normalized;
};

const wait = (duration) =>
  new Promise((resolve) => window.setTimeout(resolve, duration));

async function requestJson(path, options = {}, { retry = false } = {}) {
  const attempts = retry ? 2 : 1;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const payload = await fetchJson(`${ENDPOINT}/${path}`, {
        ...options,
        mode: "cors",
        timeout: REQUEST_TIMEOUT_MS,
        errorMessage: "统计接口请求失败",
      });

      return normalizePayload(payload || {});
    } catch (error) {
      const shouldRetry =
        attempt + 1 < attempts &&
        (!Number.isFinite(error?.status) || error.status >= 500);

      if (!shouldRetry) throw error;
      await wait(RETRY_DELAY_MS);
    }
  }

  return null;
}

export async function fetchAnalyticsStats({
  contentType = "",
  contentId = "",
  contentIds = [],
} = {}) {
  if (!hasAnalyticsApi || typeof window === "undefined") return null;

  const params = new URLSearchParams();
  if (contentType) {
    params.set("contentType", contentType);
  }
  const requestedIds =
    Array.isArray(contentIds) && contentIds.length > 0
      ? contentIds
      : contentId
        ? [contentId]
        : [];
  for (const requestedId of requestedIds) {
    params.append("contentId", requestedId);
  }

  const query = params.size ? `?${params.toString()}` : "";
  return requestJson(`stats${query}`);
}

export async function recordAnalyticsEvent({
  eventType,
  sessionId,
  contentType = "",
  contentId = "",
}) {
  if (!hasAnalyticsApi || typeof window === "undefined") return null;

  return requestJson(
    "events",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        eventType,
        sessionId,
        ...(contentType && contentId ? { contentType, contentId } : {}),
      }),
      keepalive: true,
    },
    { retry: true },
  );
}
