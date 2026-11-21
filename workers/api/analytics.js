import { isOriginAllowed } from "../lib/cors.js";
import { createHttpError, jsonResponse, readJsonObject } from "../lib/http.js";

const ANALYTICS_MAX_BODY_BYTES = 2048;
const ANALYTICS_CONTENT_ID_MAX_LENGTH = 128;
const ANALYTICS_CONTENT_BATCH_MAX = 50;
const ANALYTICS_EVENT_RETENTION_MS = 48 * 60 * 60 * 1000;
const ANALYTICS_CLEANUP_LIMIT = 5000;
const ANALYTICS_CONTENT_TYPES = new Set(["article", "novel"]);
const ANALYTICS_SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function analyticsJsonResponse(body, status, corsOrigin) {
  return jsonResponse(body, status, corsOrigin, {
    "Cache-Control": "no-store",
  });
}

function readAnalyticsJsonBody(request) {
  return readJsonObject(request, {
    maxBytes: ANALYTICS_MAX_BODY_BYTES,
    tooLargeCode: "PAYLOAD_TOO_LARGE",
    tooLargeMessage: "请求体不能超过 2 KB。",
    invalidCode: "INVALID_JSON",
    emptyMessage: "缺少 JSON 请求体。",
    invalidMessage: "请求体必须是 JSON 对象。",
  });
}

function getAnalyticsDateKey(env, date = new Date()) {
  const timeZone = String(env.ANALYTICS_TIME_ZONE || "Asia/Shanghai").trim();
  let formatter;

  try {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  }

  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function normalizeAnalyticsContent(contentType, contentId, required = false) {
  const type = String(contentType || "").trim();
  const id = String(contentId || "").trim();

  if (!type && !id && !required) {
    return { contentType: "", contentId: "" };
  }

  if (!ANALYTICS_CONTENT_TYPES.has(type)) {
    throw createHttpError(
      "INVALID_CONTENT_TYPE",
      "contentType 仅支持 article 或 novel。",
      400,
    );
  }

  if (
    !id ||
    id.length > ANALYTICS_CONTENT_ID_MAX_LENGTH ||
    /[\u0000-\u001f\u007f]/u.test(id)
  ) {
    throw createHttpError(
      "INVALID_CONTENT_ID",
      "contentId 不能为空、包含控制字符或超过 128 个字符。",
      400,
    );
  }

  return { contentType: type, contentId: id };
}

function normalizeAnalyticsCount(value) {
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
}

function normalizeAnalyticsStatsQuery(url) {
  const contentType = String(url.searchParams.get("contentType") || "").trim();
  const requestedIds = url.searchParams.getAll("contentId");

  if (!contentType && requestedIds.length === 0) {
    return { contentType: "", contentIds: [] };
  }

  if (!ANALYTICS_CONTENT_TYPES.has(contentType)) {
    throw createHttpError(
      "INVALID_CONTENT_TYPE",
      "contentType 仅支持 article 或 novel。",
      400,
    );
  }

  if (requestedIds.length > ANALYTICS_CONTENT_BATCH_MAX) {
    throw createHttpError(
      "TOO_MANY_CONTENT_IDS",
      `单次最多查询 ${ANALYTICS_CONTENT_BATCH_MAX} 个 contentId。`,
      400,
    );
  }

  const contentIds = [];
  const seen = new Set();
  for (const requestedId of requestedIds) {
    const { contentId } = normalizeAnalyticsContent(
      contentType,
      requestedId,
      true,
    );
    if (seen.has(contentId)) continue;
    seen.add(contentId);
    contentIds.push(contentId);
  }

  return { contentType, contentIds };
}

function createAnalyticsSnapshot(
  results,
  { contentType = "", contentIds = [] } = {},
) {
  const totals = results[0]?.results?.[0] || {};
  const daily = results[1]?.results?.[0] || {};
  const snapshot = {
    todayVisits: normalizeAnalyticsCount(daily.visits),
    totalVisits: normalizeAnalyticsCount(totals.total_visits),
    totalReads: normalizeAnalyticsCount(totals.total_reads),
    startedAt: String(totals.started_at || ""),
  };

  let resultIndex = 2;

  if (contentType) {
    snapshot.contentTypeReads = normalizeAnalyticsCount(
      results[resultIndex]?.results?.[0]?.reads,
    );
    resultIndex += 1;
  }

  if (contentType && contentIds.length > 0) {
    const contentReadsById = Object.fromEntries(
      contentIds.map((contentId) => [contentId, 0]),
    );

    for (const row of results[resultIndex]?.results || []) {
      const contentId = String(row?.content_id || "");
      if (Object.hasOwn(contentReadsById, contentId)) {
        contentReadsById[contentId] = normalizeAnalyticsCount(row.reads);
      }
    }

    snapshot.contentReadsById = contentReadsById;
    if (contentIds.length === 1) {
      snapshot.contentReads = contentReadsById[contentIds[0]];
    }
  }

  return snapshot;
}

function createAnalyticsSnapshotStatements(
  env,
  statDate,
  contentType = "",
  contentIds = [],
) {
  const statements = [
    env.ANALYTICS_DB.prepare(
      `SELECT total_visits, total_reads, started_at
       FROM analytics_totals
       WHERE id = 1`,
    ),
    env.ANALYTICS_DB.prepare(
      `SELECT visits, reads
       FROM analytics_daily
       WHERE stat_date = ?1`,
    ).bind(statDate),
  ];

  if (contentType) {
    statements.push(
      env.ANALYTICS_DB.prepare(
        `SELECT COALESCE(SUM(reads), 0) AS reads
         FROM analytics_content
         WHERE content_type = ?1`,
      ).bind(contentType),
    );
  }

  if (contentType && contentIds.length > 0) {
    const placeholders = contentIds.map(() => "?").join(", ");
    statements.push(
      env.ANALYTICS_DB.prepare(
        `SELECT content_id, reads
         FROM analytics_content
         WHERE content_type = ? AND content_id IN (${placeholders})`,
      ).bind(contentType, ...contentIds),
    );
  }

  return statements;
}

export async function handleAnalyticsStats(request, env, corsOrigin) {
  if (request.method !== "GET") {
    return analyticsJsonResponse(
      { error: "METHOD_NOT_ALLOWED", message: "该接口仅接受 GET 请求。" },
      405,
      corsOrigin,
    );
  }

  if (!isOriginAllowed(request, env.ALLOWED_ORIGIN)) {
    return analyticsJsonResponse(
      { error: "ORIGIN_NOT_ALLOWED", message: "请求来源不在允许列表中。" },
      403,
      corsOrigin,
    );
  }

  if (!env.ANALYTICS_DB) {
    return analyticsJsonResponse(
      { error: "ANALYTICS_UNAVAILABLE", message: "缺少 ANALYTICS_DB 绑定。" },
      503,
      corsOrigin,
    );
  }

  try {
    const url = new URL(request.url);
    const { contentType, contentIds } = normalizeAnalyticsStatsQuery(url);
    const statDate = getAnalyticsDateKey(env);
    const results = await env.ANALYTICS_DB.batch(
      createAnalyticsSnapshotStatements(
        env,
        statDate,
        contentType,
        contentIds,
      ),
    );

    return analyticsJsonResponse(
      createAnalyticsSnapshot(results, { contentType, contentIds }),
      200,
      corsOrigin,
    );
  } catch (error) {
    const status = Number(error?.status) || 500;
    console.error(
      JSON.stringify({
        message: "analytics stats failed",
        path: new URL(request.url).pathname,
        error: String(error?.message || error),
      }),
    );
    return analyticsJsonResponse(
      {
        error: error?.code || "ANALYTICS_STATS_FAILED",
        message:
          status >= 500 ? "暂时无法读取访问统计。" : String(error.message),
      },
      status,
      corsOrigin,
    );
  }
}

export async function handleAnalyticsEvents(request, env, corsOrigin) {
  if (request.method !== "POST") {
    return analyticsJsonResponse(
      { error: "METHOD_NOT_ALLOWED", message: "该接口仅接受 POST 请求。" },
      405,
      corsOrigin,
    );
  }

  if (!isOriginAllowed(request, env.ALLOWED_ORIGIN)) {
    return analyticsJsonResponse(
      { error: "ORIGIN_NOT_ALLOWED", message: "请求来源不在允许列表中。" },
      403,
      corsOrigin,
    );
  }

  if (!env.ANALYTICS_DB) {
    return analyticsJsonResponse(
      { error: "ANALYTICS_UNAVAILABLE", message: "缺少 ANALYTICS_DB 绑定。" },
      503,
      corsOrigin,
    );
  }

  try {
    const body = await readAnalyticsJsonBody(request);
    const eventType = String(body.eventType || "").trim();
    const sessionId = String(body.sessionId || "").trim();

    if (!ANALYTICS_SESSION_ID_PATTERN.test(sessionId)) {
      throw createHttpError(
        "INVALID_SESSION_ID",
        "sessionId 必须是有效的随机 UUID。",
        400,
      );
    }

    if (!["visit", "read"].includes(eventType)) {
      throw createHttpError(
        "INVALID_EVENT_TYPE",
        "eventType 仅支持 visit 或 read。",
        400,
      );
    }

    const { contentType, contentId } = normalizeAnalyticsContent(
      body.contentType,
      body.contentId,
      eventType === "read",
    );
    const statDate = getAnalyticsDateKey(env);
    const createdAt = Date.now();
    const insert = env.ANALYTICS_DB.prepare(
      `INSERT OR IGNORE INTO analytics_events (
        session_id,
        event_type,
        content_type,
        content_id,
        stat_date,
        created_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    ).bind(
      sessionId,
      eventType,
      eventType === "read" ? contentType : "",
      eventType === "read" ? contentId : "",
      statDate,
      createdAt,
    );
    const results = await env.ANALYTICS_DB.batch([
      insert,
      ...createAnalyticsSnapshotStatements(
        env,
        statDate,
        eventType === "read" ? contentType : "",
        eventType === "read" ? [contentId] : [],
      ),
    ]);
    const accepted = normalizeAnalyticsCount(results[0]?.meta?.changes) > 0;

    return analyticsJsonResponse(
      {
        accepted,
        ...createAnalyticsSnapshot(results.slice(1), {
          contentType: eventType === "read" ? contentType : "",
          contentIds: eventType === "read" ? [contentId] : [],
        }),
      },
      200,
      corsOrigin,
    );
  } catch (error) {
    const status = Number(error?.status) || 500;
    console.error(
      JSON.stringify({
        message: "analytics event failed",
        path: new URL(request.url).pathname,
        error: String(error?.message || error),
      }),
    );
    return analyticsJsonResponse(
      {
        error: error?.code || "ANALYTICS_EVENT_FAILED",
        message:
          status >= 500 ? "暂时无法记录访问统计。" : String(error.message),
      },
      status,
      corsOrigin,
    );
  }
}

export async function cleanupAnalyticsEvents(env) {
  if (!env.ANALYTICS_DB) return;

  const cutoff = Date.now() - ANALYTICS_EVENT_RETENTION_MS;
  const result = await env.ANALYTICS_DB.prepare(
    `DELETE FROM analytics_events
     WHERE id IN (
       SELECT id
       FROM analytics_events
       WHERE created_at < ?1
       ORDER BY created_at
       LIMIT ?2
     )`,
  )
    .bind(cutoff, ANALYTICS_CLEANUP_LIMIT)
    .run();

  console.log(
    JSON.stringify({
      message: "analytics event cleanup completed",
      changes: normalizeAnalyticsCount(result.meta?.changes),
    }),
  );
}
