import { normalizeAnnouncementsPayload } from "../../shared/announcements.js";

const normalizeEndpoint = (value = "") =>
  String(value || "")
    .trim()
    .replace(/\/+$/, "");

const ENDPOINT = normalizeEndpoint(
  import.meta.env?.VITE_ANNOUNCEMENTS_API ||
    (import.meta.env?.PROD
      ? "https://api.komori.cc/announcements"
      : "/api/announcements"),
);
const REQUEST_TIMEOUT_MS = 6000;

export async function fetchAnnouncements({ force = false } = {}) {
  if (typeof window === "undefined") return null;

  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );

  try {
    const response = await fetch(ENDPOINT, {
      cache: force ? "reload" : "default",
      headers: { Accept: "application/json" },
      mode: "cors",
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new Error(
        String(payload?.message || `公告接口请求失败：${response.status}`),
      );
      error.status = response.status;
      throw error;
    }

    return normalizeAnnouncementsPayload(payload);
  } finally {
    window.clearTimeout(timeout);
  }
}
