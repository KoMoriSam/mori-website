import { configuredDiscussionScopes } from "../../shared/discussions.js";
import { attachmentLimits, attachmentVideoLimit, isGithubAttachmentAsset, matchesMediaSignature, mediaAttachmentType } from "../../shared/comment-attachments.js";
import { SITE } from "../auth/http.js";

const failure = (status, code) => Object.assign(new Error(code), { status, code });
const headersFor = (token) => ({
  Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "MoriWebsite-Attachments/1.0",
});

async function githubResponse(response) {
  if (response.status === 429 || response.headers.has("Retry-After") || response.headers.get("X-RateLimit-Remaining") === "0") {
    throw Object.assign(failure(429, "ATTACHMENT_RATE_LIMITED"), {
      retryAfter: response.headers.get("Retry-After") || "60",
    });
  }
  if ([401, 403, 404].includes(response.status)) throw failure(503, "ATTACHMENT_AUTHORIZATION_FAILED");
  if (response.status === 422) throw failure(422, "ATTACHMENT_REJECTED");
  if (!response.ok) throw failure(502, "ATTACHMENT_UPLOAD_FAILED");
  return response.json();
}

// Only a small prefix is buffered. The rest passes through a counted stream,
// including 100 MiB videos on explicitly configured eligible repositories.
export async function attachmentBody(request, name, size) {
  const reader = request.body?.getReader();
  if (!reader) throw failure(400, "ATTACHMENT_INVALID_FILE");
  let prefix = new Uint8Array();
  const initial = [];
  let received = 0;
  try {
    while (prefix.length < Math.min(size, 4096)) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      if (received > size) throw failure(413, "ATTACHMENT_TOO_LARGE");
      initial.push(value);
      const next = new Uint8Array(Math.min(4096, prefix.length + value.length));
      next.set(prefix);
      next.set(value.subarray(0, next.length - prefix.length), prefix.length);
      prefix = next;
    }
    if (!matchesMediaSignature(name, prefix)) throw failure(400, "ATTACHMENT_INVALID_FILE");
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  }
  return new ReadableStream({
    async pull(controller) {
      if (initial.length) {
        controller.enqueue(initial.shift());
        return;
      }
      try {
        const { done, value } = await reader.read();
        if (done) {
          if (received !== size) throw failure(400, "ATTACHMENT_INVALID_FILE");
          controller.close();
        } else {
          received += value.length;
          if (received > size) throw failure(413, "ATTACHMENT_TOO_LARGE");
          controller.enqueue(value);
        }
      } catch (error) {
        await reader.cancel().catch(() => {});
        controller.error(error);
      }
    },
    cancel: (reason) => reader.cancel(reason),
  });
}

export async function handleCommentAttachment(request, env, token, target, {
  fetchGithub = fetch,
  upload,
  fixedLength = (size) => new FixedLengthStream(size),
} = {}) {
  try {
    const configured = configuredDiscussionScopes(env)[target.scope];
    if (configured?.repo.name !== target.repo.name || configured.repo.id !== target.repo.id || configured.category.id !== target.category.id)
      throw failure(404, "DISCUSSION_NOT_FOUND");
    if (request.method === "POST" && request.headers.get("Origin") !== (env.MORI_SITE_ORIGIN || SITE))
      throw failure(403, "INVALID_ORIGIN");
    const user = token && await env.MORI_COMMENT_AUTH.user(token);
    if (!user?.id || !user.login) throw failure(401, "LOGIN_REQUIRED");
    const limiter = request.method === "GET" ? env.COMMENT_READ_LIMIT : env.COMMENT_WRITE_LIMIT;
    for (const key of [`attachment:ip:${request.headers.get("CF-Connecting-IP") || "unknown"}`, `attachment:user:${user.id}`]) {
      if (!limiter || !(await limiter.limit({ key })).success) throw failure(429, "ATTACHMENT_RATE_LIMITED");
    }
    const videoMaxBytes = attachmentVideoLimit(env, target);
    if (request.method === "GET") return { status: 200, body: {
      imageMaxBytes: attachmentLimits.image, videoMaxBytes, available: Boolean(upload || env.GITHUB_ATTACHMENTS_TOKEN),
    } };
    if (request.method !== "POST") throw failure(405, "METHOD_NOT_ALLOWED");
    let name;
    try { name = decodeURIComponent(request.headers.get("X-Attachment-Name") || ""); }
    catch { throw failure(400, "ATTACHMENT_INVALID_FILE"); }
    if (!name || name.length > 255 || /[\x00-\x1f\x7f/\\]/u.test(name))
      throw failure(400, "ATTACHMENT_INVALID_FILE");
    const type = mediaAttachmentType(name);
    if (!type) throw failure(415, "ATTACHMENT_USE_GITHUB");
    const mime = (request.headers.get("Content-Type") || "").split(";", 1)[0].trim().toLowerCase();
    if (mime !== type.mime && mime !== "application/octet-stream") throw failure(415, "ATTACHMENT_INVALID_FILE");
    const size = Number(request.headers.get("X-Attachment-Size"));
    const maximum = type.kind === "image" ? attachmentLimits.image : videoMaxBytes;
    if (!Number.isSafeInteger(size) || size <= 0) throw failure(400, "ATTACHMENT_INVALID_FILE");
    if (size > maximum) throw failure(413, "ATTACHMENT_TOO_LARGE");
    const secret = env.GITHUB_ATTACHMENTS_TOKEN;
    if (!upload && !secret) throw failure(503, "ATTACHMENT_NOT_CONFIGURED");

    let repositoryId;
    if (!upload) {
      const repo = await githubResponse(await fetchGithub(`https://api.github.com/repos/${target.repo.name}`, {
        headers: headersFor(secret), redirect: "manual", signal: AbortSignal.timeout(15_000),
      }));
      if (repo.node_id !== target.repo.id || repo.full_name?.toLowerCase() !== target.repo.name.toLowerCase() ||
          repo.private !== Boolean(target.privateRepository) || !repo.permissions?.push || !Number.isSafeInteger(repo.id) || repo.id <= 0)
        throw failure(503, "ATTACHMENT_AUTHORIZATION_FAILED");
      repositoryId = repo.id;
    }
    const stream = await attachmentBody(request, name, size);
    let result;
    if (upload) {
      result = await upload({ name, size, ...type, body: stream });
    } else {
      const endpoint = new URL("https://uploads.github.com/user-attachments/assets");
      endpoint.search = new URLSearchParams({ name, content_type: type.mime, repository_id: String(repositoryId) });
      const counted = fixedLength(size);
      const controller = new AbortController();
      const signal = AbortSignal.any([controller.signal, request.signal, AbortSignal.timeout(180_000)]);
      const sending = stream.pipeTo(counted.writable, { signal });
      let streamFailure;
      void sending.catch((error) => {
        streamFailure = error;
        controller.abort();
      });
      try {
        // A FixedLengthStream gives Workers the exact Content-Length GitHub expects.
        const response = await fetchGithub(endpoint.href, {
          method: "POST", headers: { ...headersFor(secret), "Content-Type": "application/octet-stream" },
          body: counted.readable, redirect: "manual", signal,
        });
        result = await githubResponse(response);
        await sending;
      } catch (error) {
        throw streamFailure || error;
      } finally {
        controller.abort();
        await sending.catch(() => {});
      }
    }
    if (!isGithubAttachmentAsset(result?.url) && !upload) throw failure(502, "ATTACHMENT_INVALID_RESPONSE");
    return { status: 201, body: { name, size, ...type, url: result.url } };
  } catch (error) {
    return {
      status: error.status || 502, body: { error: typeof error.code === "string" ? error.code : "ATTACHMENT_UPLOAD_FAILED" },
      ...(error.status === 429 && { headers: { "Retry-After": error.retryAfter || "60" } }),
    };
  }
}
