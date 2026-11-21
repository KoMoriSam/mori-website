import { computed, nextTick, onBeforeUnmount, reactive, watch } from "vue";
import { attachmentLimits, attachmentMarkdown, isGithubAttachmentAsset, mediaAttachmentType } from "../../shared/comment-attachments.js";
import { fetchAttachmentCapabilities, uploadCommentAttachment } from "../services/api-comment-attachments.js";

export function useCommentAttachments(body, target, {
  capabilities = fetchAttachmentCapabilities,
  upload = uploadCommentAttachment,
} = {}) {
  const items = reactive([]);
  const previews = reactive(new Map());
  const pending = computed(() => items.some((item) => ["queued", "uploading", "inserting"].includes(item.status)));
  let running = false;
  let disposed = false;
  let insertion;
  let sequence = 0;
  let field;
  let previewGeneration = 0;
  const restoring = new Set();

  function previewCacheKey(url) {
    if (typeof location === "undefined") return null;
    const key = new URL("/__comment-attachment-previews", location.origin);
    key.search = new URLSearchParams({ draft: JSON.stringify(target()), url });
    return key.href;
  }

  async function cachePreview(url, file) {
    const key = previewCacheKey(url);
    if (!key || !globalThis.caches || !isGithubAttachmentAsset(url)) return;
    try {
      const cache = await caches.open("mori-comment-draft-previews");
      await cache.put(key, new Response(file, { headers: { "Content-Type": mediaAttachmentType(file.name).mime } }));
    } catch { /* The selected file still supplies the preview when browser storage is unavailable. */ }
  }

  async function restorePreviews(source) {
    if (!globalThis.caches) return;
    const generation = previewGeneration;
    const urls = new Set(source.match(/https:\/\/github\.com\/user-attachments\/assets\/[\da-f-]+/giu));
    for (const url of urls) {
      if (!isGithubAttachmentAsset(url) || previews.has(url) || restoring.has(url)) continue;
      const key = previewCacheKey(url);
      if (!key) continue;
      restoring.add(url);
      try {
        const cache = await caches.open("mori-comment-draft-previews");
        const response = await cache.match(key);
        if (!response) continue;
        const blob = await response.blob();
        if (!disposed && generation === previewGeneration && body.value.includes(url) && !previews.has(url)) {
          previews.set(url, URL.createObjectURL(blob));
        }
      } catch { /* Draft references remain usable when browser storage is unavailable. */ }
      finally { restoring.delete(url); }
    }
  }

  watch(body, (source) => { void restorePreviews(source); }, { immediate: true });

  // Keep insertion positions attached to the draft while the user keeps typing.
  watch(body, (next, previous) => {
    let start = 0;
    while (start < Math.min(next.length, previous.length) && next[start] === previous[start]) start++;
    let end = previous.length;
    let nextEnd = next.length;
    while (end > start && nextEnd > start && previous[end - 1] === next[nextEnd - 1]) { end--; nextEnd--; }
    if (insertion) {
      start = insertion.start;
      end = start;
      nextEnd = start + insertion.length;
    }
    for (const item of items) {
      if (item.status === "success") continue;
      if (item.position < start || (item.position === start && insertion && item.order < insertion.order)) continue;
      item.position = item.position >= end ? item.position + nextEnd - end : nextEnd;
    }
  }, { flush: "sync" });

  function insert(item) {
    const reference = attachmentMarkdown(item.attachment);
    const position = Math.min(item.position, body.value.length);
    const prefix = body.value.slice(0, position);
    const suffix = body.value.slice(position);
    const text = (prefix && !prefix.endsWith("\n\n") ? "\n\n" : "") + reference + "\n\n";
    if (body.value.length + text.length > 10000) throw new Error("ATTACHMENT_BODY_TOO_LONG");
    const activeField = field?.isConnected && field === field.ownerDocument.activeElement ? field : null;
    const selectionStart = activeField?.selectionStart;
    const selectionEnd = activeField?.selectionEnd;
    insertion = { order: item.order, start: position, length: text.length };
    body.value = prefix + text + suffix;
    insertion = undefined;
    item.status = "success";
    item.file = null;
    if (activeField) void nextTick(() => {
      if (activeField !== activeField.ownerDocument.activeElement) return;
      activeField.setSelectionRange(
        selectionStart >= position ? selectionStart + text.length : selectionStart,
        selectionEnd >= position ? selectionEnd + text.length : selectionEnd,
      );
    });
  }

  async function processQueue() {
    if (running || disposed) return;
    running = true;
    try {
      let item;
      while (!disposed && (item = items.find((entry) => entry.status === "queued"))) {
        const controller = new AbortController();
        item.controller = controller;
        item.status = "uploading";
        item.error = "";
        try {
          if (!item.attachment) {
            const limits = await capabilities(target(), controller.signal);
            if (controller.signal.aborted) continue;
            if (!limits.available) throw new Error("ATTACHMENT_NOT_CONFIGURED");
            const maximum = item.kind === "image" ? limits.imageMaxBytes : limits.videoMaxBytes;
            if (item.file.size > maximum) throw Object.assign(new Error("ATTACHMENT_TOO_LARGE"), { maximum });
            item.attachment = await upload(item.file, target(), {
              signal: controller.signal,
              onProgress: (value) => { item.progress = value; },
            });
            if (!disposed && !controller.signal.aborted) {
              previews.set(item.attachment.url, URL.createObjectURL(new Blob([item.file], { type: item.attachment.mime || mediaAttachmentType(item.file.name).mime })));
              await cachePreview(item.attachment.url, item.file);
            }
          }
          if (disposed || controller.signal.aborted) continue;
          item.status = "inserting";
          insert(item);
        } catch (error) {
          if (disposed || controller.signal.aborted) continue;
          item.status = "failed";
          item.error = error.message;
          item.maximum = error.maximum;
          item.retryAt = error.retryAt || 0;
        } finally {
          item.controller = null;
        }
      }
    } finally {
      running = false;
    }
  }

  function add(files, position = body.value.length) {
    const otherFiles = [];
    for (const file of files) {
      const type = mediaAttachmentType(file.name);
      if (!type) { otherFiles.push(file.name); continue; }
      const maximum = type.kind === "image" ? attachmentLimits.image : attachmentLimits.paidVideo;
      const invalidSize = file.size <= 0 || file.size > maximum;
      items.push({
        id: crypto.randomUUID(), order: sequence++, file, name: file.name, kind: type.kind,
        position, progress: 0, status: invalidSize ? "failed" : "queued",
        error: file.size <= 0 ? "ATTACHMENT_INVALID_FILE" : invalidSize ? "ATTACHMENT_TOO_LARGE" : "", maximum,
      });
    }
    void processQueue();
    return otherFiles;
  }

  function cancel(item) {
    item.status = "cancelled";
    item.controller?.abort();
  }

  function retry(item) {
    if (Date.now() < item.retryAt || !["failed", "cancelled"].includes(item.status)) return;
    item.status = "queued";
    item.progress = 0;
    void processQueue();
  }

  function reset({ discardPreviews = true } = {}) {
    previewGeneration++;
    if (discardPreviews && globalThis.caches) {
      const keys = Array.from(previews.keys(), previewCacheKey).filter(Boolean);
      void caches.open("mori-comment-draft-previews").then((cache) =>
        Promise.all(keys.map((key) => cache.delete(key))),
      ).catch(() => {});
    }
    for (const item of items) item.controller?.abort();
    items.splice(0);
    for (const preview of previews.values()) URL.revokeObjectURL(preview);
    previews.clear();
    restoring.clear();
  }

  watch(() => JSON.stringify(target()), () => {
    reset({ discardPreviews: false });
    void restorePreviews(body.value);
  });
  onBeforeUnmount(() => { disposed = true; reset({ discardPreviews: false }); });
  const focusField = (element) => {
    if (element?.matches("textarea, input[type='text']")) field = element;
  };
  return reactive({ items, previews, pending, add, cancel, retry, reset, focusField });
}
