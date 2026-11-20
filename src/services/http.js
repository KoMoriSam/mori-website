export const normalizeEndpoint = (value = "") =>
  String(value || "")
    .trim()
    .replace(/\/+$/, "");

export class HttpError extends Error {
  constructor(message, { status = 0, payload = null } = {}) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.payload = payload;
  }
}

export async function fetchJson(
  url,
  { timeout = 6000, errorMessage, signal, ...options } = {},
) {
  const timeoutSignal = timeout > 0 ? AbortSignal.timeout(timeout) : null;
  const requestSignal =
    signal && timeoutSignal
      ? AbortSignal.any([signal, timeoutSignal])
      : signal || timeoutSignal || undefined;

  const response = await fetch(url, {
    ...options,
    ...(requestSignal ? { signal: requestSignal } : {}),
  });
  const payload =
    typeof response.json === "function"
      ? await response.json().catch(() => null)
      : null;

  if (!response.ok) {
    const message =
      typeof errorMessage === "function"
        ? errorMessage(response.status, payload)
        : String(
            payload?.message ||
              payload?.error ||
              (errorMessage
                ? `${errorMessage}：${response.status}`
                : `HTTP ${response.status}`),
          );
    throw new HttpError(message, { status: response.status, payload });
  }

  return payload;
}
