import { normalizeChangelogPayload } from "../../shared/changelog.js";
import { fetchJson, normalizeEndpoint } from "./http.js";

const REMOTE_ENDPOINT = normalizeEndpoint(
  import.meta.env?.VITE_CHANGELOG_API || "/api/changelog",
);
const STATIC_ENDPOINT = "/changelog.json";
const REQUEST_TIMEOUT_MS = 6000;

const fetchPayload = async (endpoint, { force = false } = {}) => {
  const payload = await fetchJson(endpoint, {
    cache: force ? "reload" : "no-store",
    headers: { Accept: "application/json" },
    timeout: REQUEST_TIMEOUT_MS,
    errorMessage: "更新日志请求失败",
  });
  return normalizeChangelogPayload(payload);
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
