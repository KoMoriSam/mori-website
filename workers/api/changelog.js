import { normalizeChangelogPayload } from "../../shared/changelog.js";
import { handleKvJsonResource } from "../lib/kv-json.js";

const CHANGELOG_KV_KEY = "changelog:v1";
const CHANGELOG_CACHE_CONTROL =
  "public, max-age=300, s-maxage=300, stale-while-revalidate=3600";

export function handleChangelog(request, env, corsOrigin) {
  return handleKvJsonResource(request, env, corsOrigin, {
    binding: "CHANGELOG_KV",
    kvKey: CHANGELOG_KV_KEY,
    cacheControl: CHANGELOG_CACHE_CONTROL,
    unavailableError: "CHANGELOG_UNAVAILABLE",
    invalidError: "INVALID_CHANGELOG",
    methodNotAllowedMessage: "更新日志接口仅支持 GET。",
    missingBindingMessage: "缺少 CHANGELOG_KV 绑定。",
    uninitializedMessage: "更新日志数据尚未初始化。",
    invalidJsonMessage: "更新日志数据不是有效的 JSON。",
    invalidShapeMessage: "更新日志数据结构无效。",
    unavailableMessage: "更新日志服务暂不可用。",
    lookupFailedLogMessage: "changelog lookup failed",
    normalize: (payload) =>
      normalizeChangelogPayload(payload, {
        requireServerTime: false,
        serverTime: new Date().toISOString(),
        onInvalidItem(item) {
          console.warn(
            JSON.stringify({
              message: "invalid or duplicate changelog release ignored",
              version: String(item?.version || ""),
            }),
          );
        },
      }),
  });
}
