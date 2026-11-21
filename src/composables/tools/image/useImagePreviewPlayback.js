import { computed, onBeforeUnmount, watch } from "vue";
import { calculateOutputDimensions } from "@/utils/image/converter";

export function useImagePreviewPlayback({
  queue,
  selectedId,
  selectedItem,
  settings,
  watermark,
}) {
  let animationPreviewTimer = null;

  const selectedItemIndex = computed(() =>
    queue.value.findIndex((item) => item.id === selectedId.value),
  );

  function getPreviewFrames(item) {
    if (!item) return [];
    if (
      !watermark.enabled &&
      item.status === "done" &&
      item.resultPreviewFrames.length
    ) {
      return item.resultPreviewFrames;
    }
    return item.previewFrames;
  }

  const selectedPreviewFrames = computed(() =>
    getPreviewFrames(selectedItem.value),
  );
  const isAnimationPlaying = computed(
    () =>
      Boolean(selectedItem.value?.previewPlaying) &&
      selectedPreviewFrames.value.length > 1,
  );
  const previewFramePosition = computed({
    get: () => Math.max(0, selectedItem.value?.previewFrameIndex || 0),
    set: (index) => {
      if (!selectedItem.value || !selectedPreviewFrames.value.length) return;
      selectedItem.value.previewPlaying = false;
      selectedItem.value.previewFrameIndex = Math.min(
        selectedPreviewFrames.value.length - 1,
        Math.max(0, Math.round(index)),
      );
    },
  });

  function getPreviewSource(item) {
    if (!item) return "";
    const previewFrames = getPreviewFrames(item);
    if (previewFrames.length) {
      const frameIndex = Math.min(
        previewFrames.length - 1,
        Math.max(0, item.previewFrameIndex),
      );
      return previewFrames[frameIndex].url;
    }
    const resultIsAnimated =
      item.frameCount > 1 &&
      ["image/gif", "image/webp"].includes(item.outputs[0]?.type);
    if (watermark.enabled) return item.previewUrl || "";
    if (!item.resultPreviewUrl) return item.previewUrl || "";
    if (item.frameCount > 1 && !resultIsAnimated) {
      return item.previewUrl || item.resultPreviewUrl;
    }
    return item.resultPreviewUrl;
  }

  function isShowingResultPreview(item, src) {
    return Boolean(
      src &&
        (src === item.resultPreviewUrl ||
          item.resultPreviewFrames.some((frame) => frame.url === src)),
    );
  }

  function getPreviewDimensions(item, showingResult) {
    if (showingResult) {
      return {
        width: item.outputWidth || item.width,
        height: item.outputHeight || item.height,
      };
    }
    return calculateOutputDimensions(item.width, item.height, settings.resize);
  }

  const previewSlides = computed(() =>
    queue.value.map((item) => {
      const src = getPreviewSource(item);
      const showingResult = isShowingResultPreview(item, src);
      const dimensions = getPreviewDimensions(item, showingResult);
      return {
        id: item.id,
        src,
        width: dimensions.width,
        height: dimensions.height,
        alt: item.file.name,
        preserveDeclaredDimensions:
          item.frameCount > 1 || (settings.resize.enabled && !showingResult),
        revision: `${item.previewNonce}:${item.previewFrameIndex}:${src}`,
      };
    }),
  );

  const selectedPreviewDimensions = computed(
    () => previewSlides.value[selectedItemIndex.value] || null,
  );

  const previewIndex = computed({
    get: () => Math.max(0, selectedItemIndex.value),
    set: (index) => {
      const item = queue.value[index];
      if (item) selectedId.value = item.id;
    },
  });

  function clearAnimationPreviewTimer() {
    if (animationPreviewTimer === null) return;
    window.clearTimeout(animationPreviewTimer);
    animationPreviewTimer = null;
  }

  function syncAnimationPreviewTimer() {
    clearAnimationPreviewTimer();
    const item = selectedItem.value;
    const previewFrames = selectedPreviewFrames.value;
    if (!item?.previewPlaying || previewFrames.length < 2) return;

    const frameIndex = Math.min(
      previewFrames.length - 1,
      Math.max(0, item.previewFrameIndex),
    );
    animationPreviewTimer = window.setTimeout(
      () => {
        if (selectedItem.value?.id !== item.id || !item.previewPlaying) return;
        const currentFrames = getPreviewFrames(item);
        if (currentFrames.length < 2) return;
        item.previewFrameIndex = (frameIndex + 1) % currentFrames.length;
      },
      Math.max(10, Number(previewFrames[frameIndex]?.duration) || 100),
    );
  }

  function toggleAnimation() {
    const item = selectedItem.value;
    if (!item || !selectedPreviewFrames.value.length) return;
    item.previewPlaying = !item.previewPlaying;
  }

  function stepFrame(direction) {
    const item = selectedItem.value;
    const previewFrames = selectedPreviewFrames.value;
    if (!item || !previewFrames.length) return;
    item.previewPlaying = false;
    const current = Math.max(0, item.previewFrameIndex);
    item.previewFrameIndex =
      (current + direction + previewFrames.length) % previewFrames.length;
  }

  watch(
    [
      () => selectedItem.value?.id,
      () => selectedItem.value?.previewPlaying,
      () => selectedItem.value?.previewFrameIndex,
      () => selectedPreviewFrames.value,
    ],
    syncAnimationPreviewTimer,
    { flush: "post" },
  );

  onBeforeUnmount(() => {
    clearAnimationPreviewTimer();
  });

  return {
    previewSlides,
    selectedPreviewDimensions,
    previewIndex,
    selectedPreviewFrames,
    isAnimationPlaying,
    previewFramePosition,
    toggleAnimation,
    stepFrame,
  };
}
