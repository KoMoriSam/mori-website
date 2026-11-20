import { normalizeAnnouncementsPayload } from "../../shared/announcements.js";
import { fetchJson, normalizeEndpoint } from "./http.js";

const ENDPOINT = normalizeEndpoint(
  import.meta.env?.VITE_ANNOUNCEMENTS_API ||
    (import.meta.env?.PROD
      ? "https://api.komori.cc/announcements"
      : "/api/announcements"),
);
const REQUEST_TIMEOUT_MS = 6000;

export async function fetchAnnouncements({ force = false } = {}) {
  if (typeof window === "undefined") return null;

  const payload = await fetchJson(ENDPOINT, {
    cache: force ? "reload" : "default",
    headers: { Accept: "application/json" },
    mode: "cors",
    timeout: REQUEST_TIMEOUT_MS,
    errorMessage: "公告接口请求失败",
  });

  return normalizeAnnouncementsPayload(payload);
}
