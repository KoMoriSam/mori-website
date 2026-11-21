import { computed, onBeforeUnmount, ref } from "vue";
import { useLocale } from "@/i18n";
import { useToast } from "@/composables/useToast";
import { downloadBlob } from "@/utils/dom/download";
import {
  MAX_IMAGE_QUEUE_FILES,
  detectImageFormat,
  estimateDecodedBytes,
  formatBytes,
  getDefaultMemoryLimit,
  makeUniqueName,
} from "@/utils/image/converter";
import { usesWatermarkImageFile } from "@/utils/image/watermark";

function baseName(name) {
  return name.replace(/\.[^.]*$/, "") || "image";
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function createPreviewFrameUrls(frames = []) {
  return frames.map((frame) => {
    const blob = new Blob([frame.buffer], { type: frame.type });
    return { ...frame, blob, url: URL.createObjectURL(blob) };
  });
}

function releasePreviewFrameUrls(frames) {
  for (const frame of frames || []) URL.revokeObjectURL(frame.url);
}

function releaseResultUrls(item) {
  if (item.resultPreviewUrl) URL.revokeObjectURL(item.resultPreviewUrl);
  releasePreviewFrameUrls(item.resultPreviewFrames);
  item.resultPreviewUrl = null;
  item.outputs = [];
  item.resultPreviewFrames = [];
}

function releaseItemUrls(item) {
  if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  releasePreviewFrameUrls(item.previewFrames);
  item.previewFrames = [];
  releaseResultUrls(item);
}

async function createZip(outputs) {
  const { BlobReader, BlobWriter, ZipWriter } = await import("@zip.js/zip.js");
  const writer = new ZipWriter(new BlobWriter("application/zip"));
  for (const output of outputs) {
    await writer.add(output.name, new BlobReader(output.blob), { level: 0 });
  }
  return writer.close();
}

export function useImageQueue({ settings, watermark, worker }) {
  const { t: translate } = useLocale();
  const toast = useToast();

  const queue = ref([]);
  const selectedId = ref(null);
  const isRunning = ref(false);
  const isLoadingFiles = ref(false);
  const loadedFileCount = ref(0);
  const loadingFileTotal = ref(0);
  const currentJobId = ref(null);

  let nextId = 1;

  const loadingState = computed(() => ({
    active: isLoadingFiles.value,
    loaded: loadedFileCount.value,
    total: loadingFileTotal.value,
  }));

  const selectedItem = computed(
    () => queue.value.find((item) => item.id === selectedId.value) || null,
  );
  const readyItems = computed(() =>
    queue.value.filter((item) =>
      ["ready", "error", "cancelled"].includes(item.status),
    ),
  );
  const successfulItems = computed(() =>
    queue.value.filter((item) => item.status === "done"),
  );
  const canStart = computed(
    () =>
      queue.value.length > 0 &&
      readyItems.value.length > 0 &&
      !isLoadingFiles.value,
  );
  const conversionProgress = computed(() => {
    if (!queue.value.length) return 0;
    const totalProgress = queue.value.reduce((total, item) => {
      if (["done", "error"].includes(item.status)) return total + 100;
      return total + (item.status === "processing" ? item.progress : 0);
    }, 0);
    return Math.round(totalProgress / queue.value.length);
  });
  const hasAnimatedInput = computed(() =>
    queue.value.some((item) => item.frameCount > 1 || item.animated),
  );
  const queueSummary = computed(() =>
    translate(
      queue.value.some((item) => item.status === "error")
        ? "image.filesWithFailures"
        : "image.filesCompleted",
      {
        total: queue.value.length,
        completed: successfulItems.value.length,
      },
    ),
  );

  async function loadAnimationPreview(item, bytes) {
    const jobId = `preview-${Date.now()}-${item.id}`;
    try {
      const buffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      );
      const result = await worker.requestPreview(jobId, {
        buffer,
        sourceFormat: item.format,
        memoryLimit: getDefaultMemoryLimit(navigator.userAgent),
      });
      if (!queue.value.includes(item)) return;
      releasePreviewFrameUrls(item.previewFrames);
      item.previewFrames = createPreviewFrameUrls(result.previewFrames);
      item.previewFrameIndex = 0;
      item.previewNonce += 1;
    } catch (error) {
      console.warn(
        "动画逐帧预览解码失败，已回退原生播放",
        item.file.name,
        error,
      );
    }
  }

  async function addFile(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const format = detectImageFormat(bytes);
    if (!format) {
      toast.error(translate("image.unsupportedFormat", { p0: file.name }));
      return;
    }
    const item = {
      id: nextId++,
      file,
      format,
      previewUrl: URL.createObjectURL(file),
      resultPreviewUrl: null,
      width: 0,
      height: 0,
      frameCount: 1,
      animated: false,
      status: "reading",
      progress: 0,
      messageDescriptor: { key: "image.readingInfo" },
      warnings: [],
      message: "",
      outputs: [],
      previewFrames: [],
      resultPreviewFrames: [],
      previewFrameIndex: -1,
      previewPlaying: true,
      resultSize: 0,
      outputWidth: 0,
      outputHeight: 0,
      outputFormat: null,
      previewNonce: 0,
    };
    queue.value.push(item);
    const queueItem = queue.value.at(-1);
    if (!selectedId.value) selectedId.value = queueItem.id;
    try {
      const metadata = await worker.readMetadata(format, bytes);
      Object.assign(queueItem, metadata);
      const estimated = estimateDecodedBytes(
        queueItem.width,
        queueItem.height,
        queueItem.frameCount,
      );
      const limit = getDefaultMemoryLimit(navigator.userAgent);
      if (estimated > limit) {
        Object.assign(queueItem, {
          status: "error",
          message: "",
          messageDescriptor: {
            key: "image.memoryLimit",
            params: { p0: formatBytes(estimated), p1: formatBytes(limit) },
          },
        });
      } else {
        if (queueItem.frameCount > 1) {
          queueItem.message = "";
          queueItem.messageDescriptor = { key: "image.loadingPreview" };
          await loadAnimationPreview(queueItem, bytes);
        }
        if (queue.value.includes(queueItem)) {
          Object.assign(queueItem, {
            status: "ready",
            message: "",
            messageDescriptor: null,
          });
        }
      }
    } catch (error) {
      Object.assign(queueItem, {
        status: "error",
        message: error instanceof Error ? error.message : "",
        messageDescriptor:
          error instanceof Error ? null : { key: "image.imageReadFailed" },
      });
    }
  }

  async function addFiles(fileList) {
    const available = MAX_IMAGE_QUEUE_FILES - queue.value.length;
    const files = [...fileList].slice(0, Math.max(0, available));
    if (fileList.length > available) {
      toast.warning(
        translate("image.batchLimit", { p0: MAX_IMAGE_QUEUE_FILES }),
      );
    }
    if (!files.length) return;
    isLoadingFiles.value = true;
    loadedFileCount.value = 0;
    loadingFileTotal.value = files.length;
    try {
      for (const file of files) {
        try {
          await addFile(file);
        } catch (error) {
          toast.error(
            `${file.name}：${error instanceof Error ? error.message : translate("image.fileReadFailed")}`,
          );
        } finally {
          loadedFileCount.value += 1;
        }
      }
    } finally {
      isLoadingFiles.value = false;
    }
  }

  async function convertItem(item, makeWatermarkPayload) {
    releaseResultUrls(item);
    const jobSettings = structuredClone({
      ...settings,
      resize: { ...settings.resize },
      sourceWidth: item.width,
      sourceHeight: item.height,
    });
    Object.assign(item, {
      status: "processing",
      warnings: [],
      messageDescriptor: { key: "image.preparing" },
      progress: 1,
      message: "",
      outputs: [],
      resultSize: 0,
      outputFormat: jobSettings.format,
    });
    const jobId = `${Date.now()}-${item.id}`;
    currentJobId.value = jobId;
    try {
      const watermarkPayload = await makeWatermarkPayload(item, jobSettings);
      const buffer = await item.file.arrayBuffer();
      const result = await worker.requestConvert(
        jobId,
        {
          buffer,
          name: item.file.name,
          sourceFormat: item.format,
          sourceAnimatedHint: item.animated,
          settings: jobSettings,
          watermark: watermarkPayload,
          memoryLimit: getDefaultMemoryLimit(navigator.userAgent),
        },
        [buffer],
        {
          onProgress: (data) => {
            item.progress = data.value;
            item.message = data.stage;
            item.messageDescriptor = data.stageMessage;
          },
          onMetadata: (data) => {
            item.width = data.width;
            item.height = data.height;
            item.frameCount = Math.max(item.frameCount, data.frames);
            item.animated = item.animated || data.animated;
          },
        },
      );
      item.outputs = result.outputs.map((output) => ({
        ...output,
        blob: new Blob([output.buffer], { type: output.type }),
      }));
      releasePreviewFrameUrls(item.resultPreviewFrames);
      item.resultPreviewFrames = createPreviewFrameUrls(result.previewFrames);
      item.previewFrameIndex = 0;
      item.previewPlaying = true;
      item.resultSize = item.outputs.reduce(
        (sum, output) => sum + output.blob.size,
        0,
      );
      item.outputWidth = result.width;
      item.outputHeight = result.height;
      item.outputFormat = jobSettings.format;
      const previewOutput = item.outputs.find((output) =>
        output.type.startsWith("image/"),
      );
      item.resultPreviewUrl = previewOutput
        ? URL.createObjectURL(previewOutput.blob)
        : null;
      item.status = "done";
      item.progress = 100;
      item.warnings = (result.warnings || []).map(
        (warning, index) => result.warningMessages?.[index] || warning,
      );
      item.message = "";
      item.messageDescriptor = { key: "image.conversionComplete" };
    } catch (error) {
      if (error?.name === "AbortError") {
        Object.assign(item, {
          status: "cancelled",
          message: "",
          messageDescriptor: { key: "image.canceled" },
        });
      } else {
        Object.assign(item, {
          status: "error",
          message: error instanceof Error ? error.message : "",
          messageDescriptor:
            error?.uiMessage ||
            (error instanceof Error ? null : { key: "image.conversionFailed" }),
        });
      }
    }
  }

  async function startConversion(makeWatermarkPayload) {
    if (!worker.isWorkerReady.value || isRunning.value) return;
    if (
      watermark.enabled &&
      usesWatermarkImageFile(watermark) &&
      !watermark.file
    ) {
      toast.warning(translate("image.watermarkRequired"));
      return;
    }
    isRunning.value = true;
    const batch = readyItems.value.slice();
    for (const item of batch) {
      if (!isRunning.value) break;
      await convertItem(item, makeWatermarkPayload);
    }
    const failed = batch.filter((item) => item.status === "error").length;
    const cancelled = batch.filter(
      (item) => item.status === "cancelled",
    ).length;
    isRunning.value = false;
    currentJobId.value = null;
    if (cancelled) toast.info(translate("image.cancelNotice"));
    else if (failed === batch.length) toast.error(translate("image.batchFailed"));
    else if (failed) {
      toast.warning(
        translate("image.partialFailure", { count: failed }, failed),
      );
    } else if (batch.length) toast.success(translate("image.doneNotice"));
  }

  function cancelConversion() {
    isRunning.value = false;
    worker.cancelJob(currentJobId.value);
  }

  function retryItem(item, makeWatermarkPayload) {
    item.status = "ready";
    item.message = "";
    item.messageDescriptor = null;
    item.warnings = [];
    void startConversion(makeWatermarkPayload);
  }

  function removeItem(id) {
    const index = queue.value.findIndex((item) => item.id === id);
    if (index < 0) return;
    releaseItemUrls(queue.value[index]);
    queue.value.splice(index, 1);
    if (selectedId.value === id) selectedId.value = queue.value[0]?.id || null;
  }

  function clearQueue() {
    for (const item of queue.value) releaseItemUrls(item);
    queue.value = [];
    selectedId.value = null;
  }

  function resetQueue() {
    for (const item of queue.value) {
      releaseResultUrls(item);
      Object.assign(item, {
        status: "ready",
        progress: 0,
        message: "",
        messageDescriptor: null,
        warnings: [],
        resultSize: 0,
        outputWidth: 0,
        outputHeight: 0,
        outputFormat: null,
        previewNonce: item.previewNonce + 1,
      });
    }
  }

  async function downloadItem(item) {
    if (item.outputs.length === 1) {
      downloadBlob(item.outputs[0].blob, item.outputs[0].name);
    } else {
      downloadBlob(
        await createZip(item.outputs),
        `${baseName(item.file.name)}-${item.outputFormat}-frames.zip`,
      );
    }
  }

  async function downloadAll() {
    const outputs = [];
    const usedNames = new Set();
    for (const item of successfulItems.value) {
      for (const output of item.outputs) {
        outputs.push({
          ...output,
          name: makeUniqueName(output.name, usedNames),
        });
      }
    }
    if (outputs.length === 1) {
      downloadBlob(outputs[0].blob, outputs[0].name);
    } else {
      downloadBlob(
        await createZip(outputs),
        `image-converter-${timestamp()}.zip`,
      );
    }
  }

  onBeforeUnmount(() => {
    for (const item of queue.value) releaseItemUrls(item);
  });

  return {
    queue,
    selectedId,
    selectedItem,
    isRunning,
    loadingState,
    canStart,
    conversionProgress,
    hasAnimatedInput,
    queueSummary,
    addFiles,
    startConversion,
    cancelConversion,
    retryItem,
    removeItem,
    clearQueue,
    resetQueue,
    downloadItem,
    downloadAll,
  };
}
