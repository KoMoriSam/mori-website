import { isGithubAttachmentAsset, isLocalCommentAttachment, mediaAttachmentType } from "../../shared/comment-attachments.js";

const endpoint = (target) => "/api/comments/attachments?" + new URLSearchParams({ scope: target.scope, target: target.target });
const rejected = (error, status, retryAfter) => Object.assign(new Error(error || "ATTACHMENT_UPLOAD_FAILED"), {
  status, retryAt: Date.now() + (Number(retryAfter) || 0) * 1000,
});

export async function fetchAttachmentCapabilities(target, signal) {
  const response = await fetch(endpoint(target), { credentials: "same-origin", cache: "no-store", signal });
  const data = await response.json();
  if (!response.ok) throw rejected(data.error, response.status, response.headers.get("Retry-After"));
  return data;
}

export function uploadCommentAttachment(file, target, { signal, onProgress }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const cleanup = () => signal.removeEventListener("abort", abort);
    xhr.open("POST", endpoint(target));
    xhr.responseType = "json";
    xhr.timeout = 180_000;
    xhr.setRequestHeader("Content-Type", mediaAttachmentType(file.name).mime);
    xhr.setRequestHeader("X-Attachment-Name", encodeURIComponent(file.name));
    xhr.setRequestHeader("X-Attachment-Size", String(file.size));
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100));
    };
    xhr.onload = () => {
      cleanup();
      const data = xhr.response;
      if (xhr.status !== 201) {
        reject(rejected(data?.error, xhr.status, xhr.getResponseHeader("Retry-After")));
        return;
      }
      const localAttachment = import.meta.env?.DEV && isLocalCommentAttachment(data?.url) && new URL(data.url).origin === location.origin;
      if ((!isGithubAttachmentAsset(data?.url) && !localAttachment) ||
          data.name !== file.name || data.size !== file.size || data.kind !== mediaAttachmentType(file.name).kind) {
        reject(rejected("ATTACHMENT_INVALID_RESPONSE", 502));
        return;
      }
      resolve(data);
    };
    xhr.onerror = xhr.ontimeout = () => { cleanup(); reject(rejected("ATTACHMENT_UPLOAD_FAILED", 0)); };
    xhr.onabort = () => { cleanup(); reject(new DOMException("Upload cancelled", "AbortError")); };
    if (signal.aborted) {
      reject(new DOMException("Upload cancelled", "AbortError"));
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    xhr.send(file);
  });
}
