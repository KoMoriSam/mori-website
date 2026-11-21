import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useLocale } from "@/i18n";
import {
  countWebPFrames,
  isAnimatedWebP,
  readImageDimensions,
} from "@/utils/image/converter";

export function useImageWorker() {
  const { t: translate } = useLocale();
  const worker = ref(null);
  const pendingJobs = new Map();

  const isWorkerReady = computed(() => Boolean(worker.value));

  function rejectPendingJobs(error) {
    for (const pending of pendingJobs.values()) {
      pending.reject(error);
    }
    pendingJobs.clear();
  }

  function onWorkerMessage({ data }) {
    const pending = pendingJobs.get(data.jobId);
    if (!pending) return;
    if (data.type === "progress") {
      pending.onProgress?.(data);
      return;
    }
    if (data.type === "metadata") {
      pending.onMetadata?.(data);
      return;
    }
    pendingJobs.delete(data.jobId);
    if (["result", "previewResult"].includes(data.type)) {
      pending.resolve(data);
    } else if (data.type === "cancelled") {
      pending.reject(
        new DOMException(translate("image.canceled"), "AbortError"),
      );
    } else {
      pending.reject(
        Object.assign(
          new Error(data.message || translate("image.conversionFailed")),
          {
            uiMessage:
              data.errorMessage ||
              (data.message ? null : { key: "image.conversionFailed" }),
          },
        ),
      );
    }
  }

  function onWorkerError(event) {
    console.error("图片处理线程异常", event);
    rejectPendingJobs(
      new Error(event?.message || translate("image.workerFailed")),
    );
  }

  function requestWorker(message, transfer = [], callbacks = {}) {
    if (!worker.value) {
      return Promise.reject(new Error(translate("image.workerFailed")));
    }
    return new Promise((resolve, reject) => {
      pendingJobs.set(message.jobId, {
        resolve,
        reject,
        onProgress: callbacks.onProgress,
        onMetadata: callbacks.onMetadata,
      });
      worker.value.postMessage(message, transfer);
    });
  }

  function requestPreview(jobId, { buffer, sourceFormat, memoryLimit }) {
    return requestWorker(
      {
        type: "preview",
        jobId,
        buffer,
        sourceFormat,
        memoryLimit,
      },
      [buffer],
    );
  }

  function requestConvert(jobId, payload, transfer = [], callbacks = {}) {
    return requestWorker(
      {
        type: "convert",
        jobId,
        ...payload,
      },
      transfer,
      callbacks,
    );
  }

  function cancelJob(jobId) {
    if (jobId) {
      worker.value?.postMessage({ type: "cancel", jobId });
    }
  }

  async function readMetadata(format, bytes) {
    let dimensions = readImageDimensions(bytes, format);
    if (!dimensions && format === "avif") {
      const { default: decode } = await import("@jsquash/avif/decode");
      const image = await decode(bytes.buffer);
      if (image) dimensions = { width: image.width, height: image.height };
    }
    if (!dimensions?.width || !dimensions?.height) {
      throw new Error(translate("image.dimensionsFailed"));
    }
    const { width, height } = dimensions;
    let frameCount = 1;
    let animated = false;
    if (format === "gif") {
      const { parseGIF, decompressFrames } = await import("gifuct-js");
      frameCount = decompressFrames(parseGIF(bytes.buffer), false).length || 1;
      animated = frameCount > 1;
    } else if (format === "webp") {
      animated = isAnimatedWebP(bytes);
      frameCount = animated ? Math.max(1, countWebPFrames(bytes)) : 1;
    } else if (format === "avif") {
      const brand = new TextDecoder("ascii").decode(bytes.subarray(0, 64));
      animated = brand.includes("avis");
    }
    return { width, height, frameCount, animated };
  }

  onMounted(() => {
    worker.value = new Worker(
      new URL("../../../workers/image-converter.worker.js", import.meta.url),
      { type: "module" },
    );
    worker.value.addEventListener("message", onWorkerMessage);
    worker.value.addEventListener("error", onWorkerError);
    worker.value.addEventListener("messageerror", onWorkerError);
  });

  onBeforeUnmount(() => {
    rejectPendingJobs(
      new DOMException(translate("image.canceled"), "AbortError"),
    );
    worker.value?.terminate();
    worker.value = null;
  });

  return {
    isWorkerReady,
    requestPreview,
    requestConvert,
    cancelJob,
    readMetadata,
  };
}
