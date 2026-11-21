import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useLocale } from "@/i18n";
import { useToast } from "@/composables/useToast";
import { calculateOutputDimensions } from "@/utils/image/converter";
import {
  drawImageWatermark,
  usesWatermarkImageFile,
  watermarkContainsText,
  watermarkNeedsGraphic,
} from "@/utils/image/watermark";
import {
  createTextWatermarkStamp,
  createWatermarkDrawable,
  isSvgWatermark,
  rasterizeSvgWatermark,
  renderRemixIconBlob,
} from "@/utils/image/watermark-assets";

const DEFAULT_WATERMARK_URL = `${import.meta.env.BASE_URL}favicon.webp`;

export function useWatermarkPreview({
  watermark,
  resize,
  selectedItem,
  resolveFont,
}) {
  const { t: translate } = useLocale();
  const toast = useToast();

  const watermarkPreviewCanvas = ref(null);
  const watermarkTextStampPromises = new Map();
  let previewRenderVersion = 0;
  let watermarkBitmap = null;
  let watermarkBitmapKey = null;
  let watermarkIconBlob = null;
  let watermarkIconBlobKey = "";
  let lastPreviewErrorKey = "";

  const previewTargetSize = computed(() => {
    const item = selectedItem.value;
    if (!item?.width || !item.height) return null;
    return calculateOutputDimensions(item.width, item.height, resize);
  });

  function watermarkMessages() {
    return {
      svgReadFailed: translate("image.svgReadFailed"),
      svgUnsupported: translate("image.svgUnsupported"),
      svgFailed: translate("image.svgFailed"),
      iconReadFailed: translate("image.iconReadFailed"),
      iconFailed: translate("image.iconFailed"),
      textUnsupported: translate("image.textUnsupported"),
      textFailed: translate("image.textFailed"),
    };
  }

  function currentWatermarkGraphicKey(config = watermark) {
    if (usesWatermarkImageFile(config)) return config.file;
    if (watermarkNeedsGraphic(config) && config.graphicKind === "icon") {
      return `icon:${config.icon}:${config.color}`;
    }
    return null;
  }

  async function getWatermarkGraphicSource(config = watermark) {
    const key = currentWatermarkGraphicKey(config);
    if (!key) return null;
    if (usesWatermarkImageFile(config)) return { key, blob: config.file };
    if (watermarkIconBlob && watermarkIconBlobKey === key) {
      return { key, blob: watermarkIconBlob };
    }
    const messages = watermarkMessages();
    const blob = await renderRemixIconBlob(config.icon, config.color, {
      readFailedMessage: messages.iconReadFailed,
      failedMessage: messages.iconFailed,
    });
    if (key !== currentWatermarkGraphicKey(config)) return null;
    watermarkIconBlob = blob;
    watermarkIconBlobKey = key;
    return { key, blob };
  }

  async function getWatermarkBitmap() {
    const source = await getWatermarkGraphicSource();
    if (!source) return null;
    if (watermarkBitmap && watermarkBitmapKey === source.key) {
      return watermarkBitmap;
    }
    const bitmap = await createWatermarkDrawable(source.blob, {
      readFailedMessage: translate("image.svgReadFailed"),
    });
    if (source.key !== currentWatermarkGraphicKey()) {
      bitmap.close?.();
      return null;
    }
    watermarkBitmap?.close?.();
    watermarkBitmap = bitmap;
    watermarkBitmapKey = source.key;
    return bitmap;
  }

  function renderTextWatermarkStamp(size) {
    const config = {
      kind: watermark.kind,
      text: watermark.text,
      fontId: watermark.fontId,
      fallbackFontId: watermark.fallbackFontId,
      color: watermark.color,
      scale: watermark.scale,
      file: watermark.file,
      graphicKind: watermark.graphicKind,
      icon: watermark.icon,
    };
    const graphicKey = currentWatermarkGraphicKey(config);
    const serializedGraphicKey =
      typeof graphicKey === "string"
        ? graphicKey
        : graphicKey
          ? `${graphicKey.name}:${graphicKey.size}:${graphicKey.lastModified}`
          : "";
    const key = JSON.stringify([
      size.width,
      size.height,
      config.kind,
      config.text,
      config.fontId,
      config.fallbackFontId,
      config.color,
      config.scale,
      serializedGraphicKey,
    ]);
    const cached = watermarkTextStampPromises.get(key);
    if (cached) return cached;
    const promise = createTextWatermarkStamp(size, config, {
      resolveFont,
      getGraphicSource: getWatermarkGraphicSource,
      messages: watermarkMessages(),
    });
    watermarkTextStampPromises.set(key, promise);
    while (watermarkTextStampPromises.size > 3) {
      watermarkTextStampPromises.delete(
        watermarkTextStampPromises.keys().next().value,
      );
    }
    promise.catch(() => watermarkTextStampPromises.delete(key));
    return promise;
  }

  async function renderWatermarkPreview() {
    const version = ++previewRenderVersion;
    const targetSize = previewTargetSize.value;
    const canvas = watermarkPreviewCanvas.value;
    if (!watermark.enabled || !targetSize || !canvas) return;

    const previewScale = Math.min(
      1,
      1600 / Math.max(targetSize.width, targetSize.height),
    );
    const size = {
      width: Math.max(1, Math.round(targetSize.width * previewScale)),
      height: Math.max(1, Math.round(targetSize.height * previewScale)),
    };
    const previewWatermark = {
      ...watermark,
      margin: watermark.margin * previewScale,
      offsetX: watermark.offsetX * previewScale,
      offsetY: watermark.offsetY * previewScale,
      gap: watermark.gap * previewScale,
    };

    let bitmap = null;
    let transientBitmap = false;
    let renderError = null;
    try {
      if (watermarkContainsText(watermark)) {
        const stamp = await renderTextWatermarkStamp(size);
        if (stamp) {
          bitmap = await createImageBitmap(stamp.blob);
          transientBitmap = true;
          Object.assign(previewWatermark, {
            preRenderedText: true,
            stampWidth: stamp.width,
            stampHeight: stamp.height,
          });
        }
      } else if (watermarkNeedsGraphic(watermark)) {
        bitmap = await getWatermarkBitmap();
      }
    } catch (error) {
      renderError = error;
      bitmap = null;
    }

    if (version !== previewRenderVersion) {
      if (transientBitmap) bitmap?.close?.();
      return;
    }

    if (renderError) {
      console.error("水印预览渲染失败", renderError);
      const errorMessage =
        renderError instanceof Error
          ? renderError.message
          : translate("image.textFailed");
      const errorKey = `${watermark.kind}:${watermark.graphicKind}:${errorMessage}`;
      if (lastPreviewErrorKey !== errorKey) {
        lastPreviewErrorKey = errorKey;
        toast.error(errorMessage);
      }
    } else {
      lastPreviewErrorKey = "";
    }

    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) {
      if (transientBitmap) bitmap?.close?.();
      return;
    }
    context.clearRect(0, 0, size.width, size.height);
    if (!renderError) {
      drawImageWatermark(context, size, previewWatermark, bitmap);
    }
    if (transientBitmap) bitmap?.close?.();
  }

  function setWatermarkPreviewCanvas(canvas) {
    if (canvas === watermarkPreviewCanvas.value) return;
    watermarkPreviewCanvas.value = canvas;
    if (canvas) void renderWatermarkPreview();
  }

  async function makeWatermarkPayload(item, jobSettings) {
    const payload = { ...watermark, file: undefined };
    if (!watermark.enabled) return payload;
    const outputSize = calculateOutputDimensions(
      item.width,
      item.height,
      jobSettings.resize,
    );
    if (watermarkContainsText(watermark)) {
      const stamp = await renderTextWatermarkStamp(outputSize);
      if (stamp) {
        payload.buffer = await stamp.blob.arrayBuffer();
        payload.mime = stamp.blob.type || "image/png";
        payload.preRenderedText = true;
        payload.stampWidth = stamp.width;
        payload.stampHeight = stamp.height;
      }
    } else if (watermarkNeedsGraphic(watermark)) {
      const source = await getWatermarkGraphicSource();
      if (source) {
        const messages = watermarkMessages();
        const blob = isSvgWatermark(source.blob)
          ? await rasterizeSvgWatermark(source.blob, outputSize, payload.scale, {
              readFailedMessage: messages.svgReadFailed,
              unsupportedMessage: messages.svgUnsupported,
              failedMessage: messages.svgFailed,
            })
          : source.blob;
        payload.buffer = await blob.arrayBuffer();
        payload.mime = blob.type || "image/png";
      }
    }
    return payload;
  }

  async function loadDefaultWatermark() {
    try {
      const response = await fetch(DEFAULT_WATERMARK_URL);
      if (!response.ok) return;
      const blob = await response.blob();
      const file = new File([blob], "favicon.webp", {
        type: blob.type || "image/webp",
      });
      if (!watermark.file) watermark.file = file;
    } catch (error) {
      console.warn("默认水印加载失败", error);
    }
  }

  watch(
    [
      () => selectedItem.value?.id,
      () => previewTargetSize.value?.width,
      () => previewTargetSize.value?.height,
    ],
    () => {
      if (watermark.enabled) void renderWatermarkPreview();
    },
    { flush: "post" },
  );

  watch(
    watermark,
    () => {
      if (watermark.enabled) void renderWatermarkPreview();
    },
    { deep: 1, flush: "post" },
  );

  onMounted(() => {
    void loadDefaultWatermark();
  });

  onBeforeUnmount(() => {
    watermarkBitmap?.close?.();
    watermarkBitmap = null;
  });

  return {
    setWatermarkPreviewCanvas,
    renderWatermarkPreview,
    makeWatermarkPayload,
  };
}
