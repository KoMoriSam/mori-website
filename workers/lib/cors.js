export function normalizeOrigin(value = "") {
  return String(value || "")
    .trim()
    .replace(/\/$/, "");
}

export function parseAllowedOrigins(configured = "") {
  return String(configured || "")
    .split(",")
    .map((item) => normalizeOrigin(item))
    .filter(Boolean);
}

export function isOriginAllowed(
  request,
  configured = "*",
  { allowWildcard = true } = {},
) {
  const trimmed = String(configured || "").trim();
  if (!trimmed || (allowWildcard && trimmed === "*")) {
    return true;
  }

  const requestOrigin = normalizeOrigin(request.headers.get("Origin") || "");
  if (!requestOrigin) {
    return false;
  }

  return parseAllowedOrigins(trimmed).includes(requestOrigin);
}

export function resolveCorsOrigin(request, env) {
  const allowed = String(env.ALLOWED_ORIGIN || "*").trim();
  if (!allowed || allowed === "*") {
    return "*";
  }

  const allowedOrigins = parseAllowedOrigins(allowed);
  if (!allowedOrigins.length) {
    return "*";
  }

  const requestOrigin = normalizeOrigin(request.headers.get("Origin") || "");
  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }

  return allowedOrigins[0];
}

export function buildCorsHeaders(origin = "*") {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, If-None-Match",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
