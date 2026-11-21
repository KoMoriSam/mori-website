import { jsonResponse } from "./http.js";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export async function handleKvJsonResource(
  request,
  env,
  corsOrigin,
  {
    binding,
    kvKey,
    cacheControl,
    unavailableError,
    invalidError,
    methodNotAllowedMessage,
    missingBindingMessage,
    uninitializedMessage,
    invalidJsonMessage,
    invalidShapeMessage,
    unavailableMessage,
    lookupFailedLogMessage,
    normalize,
  },
) {
  if (request.method !== "GET") {
    return jsonResponse(
      { error: "METHOD_NOT_ALLOWED", message: methodNotAllowedMessage },
      405,
      corsOrigin,
      { Allow: "GET" },
    );
  }

  const kv = env[binding];
  if (!kv) {
    return jsonResponse(
      { error: unavailableError, message: missingBindingMessage },
      503,
      corsOrigin,
      NO_STORE_HEADERS,
    );
  }

  try {
    const rawPayload = await kv.get(kvKey);
    if (rawPayload === null) {
      return jsonResponse(
        { error: unavailableError, message: uninitializedMessage },
        503,
        corsOrigin,
        NO_STORE_HEADERS,
      );
    }

    let payload;
    try {
      payload = JSON.parse(rawPayload.replace(/^\uFEFF/, ""));
    } catch {
      return jsonResponse(
        { error: invalidError, message: invalidJsonMessage },
        503,
        corsOrigin,
        NO_STORE_HEADERS,
      );
    }

    let normalized;
    try {
      normalized = normalize(payload);
    } catch {
      return jsonResponse(
        { error: invalidError, message: invalidShapeMessage },
        503,
        corsOrigin,
        NO_STORE_HEADERS,
      );
    }

    return jsonResponse(normalized, 200, corsOrigin, {
      "Cache-Control": cacheControl,
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        message: lookupFailedLogMessage,
        error: String(error?.message || error),
      }),
    );
    return jsonResponse(
      { error: unavailableError, message: unavailableMessage },
      503,
      corsOrigin,
      NO_STORE_HEADERS,
    );
  }
}
