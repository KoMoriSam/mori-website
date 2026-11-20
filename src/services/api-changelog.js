import { normalizeChangelogPayload } from "../../shared/changelog.js";

const normalizeEndpoint = (value = "") =>
  String(value || "")
    .trim()
    .replace(/\/+$/, "");

const REMOTE_ENDPOINT = normalizeEndpoint(
  import.meta.env?.VITE_CHANGELOG_API || "/api/changelog",
);
const STATIC_ENDPOINT = "/changelog.json";
const REQUEST_TIMEOUT_MS = 6000;

const fetchPayload = async (endpoint, { force = false } = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      cache: force ? "reload" : "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(
        String(payload?.message || `更新日志请求失败：${response.status}`),
      );
      error.status = response.status;
      throw error;
    }
    return normalizeChangelogPayload(payload);
  } finally {
    clearTimeout(timeout);
  }
};

export const fetchRemoteChangelog = (options) =>
  fetchPayload(REMOTE_ENDPOINT, options);

export const fetchStaticChangelog = (options) =>
  fetchPayload(STATIC_ENDPOINT, options);

export const fetchChangelogWithFallback = async (options = {}) => {
  try {
    return {
      payload: await fetchRemoteChangelog(options),
      source: "remote",
      remoteError: null,
    };
  } catch (remoteError) {
    return {
      payload: await fetchStaticChangelog(options),
      source: "static",
      remoteError,
    };
  }
};
