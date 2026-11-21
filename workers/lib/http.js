import { buildCorsHeaders } from "./cors.js";

export function jsonResponse(
  body,
  status = 200,
  corsOrigin = "*",
  additionalHeaders = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...buildCorsHeaders(corsOrigin),
      ...additionalHeaders,
    },
  });
}

export function createHttpError(code, message = code, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

export async function readJsonObject(
  request,
  {
    maxBytes = 2048,
    requireJsonContentType = false,
    unsupportedMediaCode = "INVALID_CONTENT_TYPE",
    unsupportedMediaMessage = unsupportedMediaCode,
    tooLargeCode = "PAYLOAD_TOO_LARGE",
    tooLargeMessage = tooLargeCode,
    invalidCode = "INVALID_JSON",
    emptyMessage = invalidCode,
    invalidMessage = invalidCode,
  } = {},
) {
  if (requireJsonContentType) {
    const contentType = request.headers
      .get("Content-Type")
      ?.split(";")[0]
      .trim();
    if (contentType !== "application/json") {
      throw createHttpError(
        unsupportedMediaCode,
        unsupportedMediaMessage,
        415,
      );
    }
  }

  const contentLength = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw createHttpError(tooLargeCode, tooLargeMessage, 413);
  }

  const reader = request.body?.getReader();
  if (!reader) {
    throw createHttpError(invalidCode, emptyMessage, 400);
  }

  const chunks = [];
  let receivedBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      receivedBytes += value.byteLength;
      if (receivedBytes > maxBytes) {
        await reader.cancel();
        throw createHttpError(tooLargeCode, tooLargeMessage, 413);
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let body;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw createHttpError(invalidCode, invalidMessage, 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw createHttpError(invalidCode, invalidMessage, 400);
  }

  return body;
}

export function normalizeGithubImageUrl(
  value,
  {
    hosts = ["avatars.githubusercontent.com"],
    maxLength = 0,
    pathnamePattern = null,
  } = {},
) {
  if (
    typeof value !== "string" ||
    (maxLength > 0 && value.length > maxLength)
  ) {
    return "";
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    return "";
  }

  if (
    url.protocol !== "https:" ||
    url.port ||
    url.username ||
    url.password ||
    url.hash ||
    !hosts.includes(url.hostname) ||
    (pathnamePattern && !pathnamePattern.test(url.pathname))
  ) {
    return "";
  }

  return url.href;
}
