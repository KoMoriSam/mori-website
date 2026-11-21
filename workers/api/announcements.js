import { normalizeAnnouncementsPayload } from "../../shared/announcements.js";
import { handleKvJsonResource } from "../lib/kv-json.js";

const ANNOUNCEMENTS_KV_KEY = "announcements:v1";
const ANNOUNCEMENTS_CACHE_CONTROL =
  "public, max-age=60, s-maxage=300, stale-while-revalidate=300";

export function handleAnnouncements(request, env, corsOrigin) {
  return handleKvJsonResource(request, env, corsOrigin, {
    binding: "ANNOUNCEMENTS_KV",
    kvKey: ANNOUNCEMENTS_KV_KEY,
    cacheControl: ANNOUNCEMENTS_CACHE_CONTROL,
    unavailableError: "ANNOUNCEMENTS_UNAVAILABLE",
    invalidError: "INVALID_ANNOUNCEMENTS",
    methodNotAllowedMessage: "公告接口仅支持 GET。",
    missingBindingMessage: "缺少 ANNOUNCEMENTS_KV 绑定。",
    uninitializedMessage: "公告数据尚未初始化。",
    invalidJsonMessage: "公告数据不是有效的 JSON。",
    invalidShapeMessage: "公告数据结构无效。",
    unavailableMessage: "公告服务暂不可用。",
    lookupFailedLogMessage: "announcement lookup failed",
    normalize: (payload) =>
      normalizeAnnouncementsPayload(payload, {
        now: Date.now(),
        requireServerTime: false,
        sortByStartsAt: true,
        onInvalidItem(item) {
          console.warn(
            JSON.stringify({
              message: "invalid or duplicate announcement ignored",
              id: String(item?.id || ""),
            }),
          );
        },
      }),
  });
}
