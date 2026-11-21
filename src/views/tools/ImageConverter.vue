<template>
  <ContentPage
    :title="translate('image.title')"
    :metas-label="translate('tools.info')"
  >
    <template #meta>
      <span class="inline-flex items-center gap-1.5">
        <i class="ri-device-line" aria-hidden="true"></i>
        {{ translate("common.localOnly") }}
      </span>
      <span class="inline-flex items-center gap-1.5">
        <i class="ri-stack-line" aria-hidden="true"></i>
        {{ translate("image.fileLimit") }}
      </span>
      <span class="inline-flex items-center gap-1.5">
        <i class="ri-image-line" aria-hidden="true"></i>
        PNG · JPEG · WebP · AVIF · BMP · GIF
      </span>
    </template>

    <div class="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_22rem]">
      <div class="contents">
        <ImagePreviewStage
          v-if="selectedItem"
          v-model:index="previewIndex"
          v-model:frame-position="previewFramePosition"
          :item="selectedItem"
          :slides="previewSlides"
          :preview-dimensions="selectedPreviewDimensions"
          :watermark-enabled="watermark.enabled"
          :frames-length="selectedPreviewFrames.length"
          :is-playing="isAnimationPlaying"
          @step-frame="stepFrame"
          @toggle-animation="toggleAnimation"
          @canvas-change="setWatermarkPreviewCanvas"
        />

        <FileQueuePanel
          v-model:selected-id="selectedId"
          :queue="queue"
          :target-format="settings.format"
          :summary="queueSummary"
          :is-running="isRunning"
          :loading-state="loadingState"
          :conversion-progress="conversionProgress"
          @add-files="addFiles"
          @download-item="downloadItem"
          @retry-item="handleRetryItem"
          @remove-item="removeItem"
          @download-all="downloadAll"
          @reset-queue="resetQueue"
          @clear-queue="clearQueue"
        />
      </div>

      <ExportSettingsPanel
        ref="exportSettingsPanel"
        :settings="settings"
        :watermark="watermark"
        :selected-image="selectedItem"
        :has-animated-input="hasAnimatedInput"
        :is-running="isRunning"
        :can-start="canStart"
        @start="handleStartConversion"
        @cancel="cancelConversion"
      />
    </div>
  </ContentPage>
</template>

<script setup>
import { reactive, ref } from "vue";
import ContentPage from "@/components/layout/ContentPage.vue";
import ExportSettingsPanel from "@/components/tools/image/ExportSettingsPanel.vue";
import FileQueuePanel from "@/components/tools/image/FileQueuePanel.vue";
import ImagePreviewStage from "@/components/tools/image/ImagePreviewStage.vue";
import { useImagePreviewPlayback } from "@/composables/tools/image/useImagePreviewPlayback";
import { useImageQueue } from "@/composables/tools/image/useImageQueue";
import { useImageWorker } from "@/composables/tools/image/useImageWorker";
import { useWatermarkPreview } from "@/composables/tools/image/useWatermarkPreview";
import { useLocale } from "@/i18n";
import { createDefaultExportSettings } from "@/utils/image/converter";
import { createDefaultWatermarkConfig } from "@/utils/image/watermark";

const { t: translate } = useLocale();
const settings = reactive(createDefaultExportSettings());
const watermark = reactive(createDefaultWatermarkConfig());
const exportSettingsPanel = ref(null);

const imageWorker = useImageWorker();
const {
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
} = useImageQueue({
  settings,
  watermark,
  worker: imageWorker,
});

const {
  previewSlides,
  selectedPreviewDimensions,
  previewIndex,
  selectedPreviewFrames,
  isAnimationPlaying,
  previewFramePosition,
  toggleAnimation,
  stepFrame,
} = useImagePreviewPlayback({
  queue,
  selectedId,
  selectedItem,
  settings,
  watermark,
});

function resolveWatermarkFont(fontId, text, fallbackFontId) {
  if (!exportSettingsPanel.value) {
    throw new Error(translate("image.fontNotReady"));
  }
  return exportSettingsPanel.value.resolveWatermarkFont(
    fontId,
    text,
    fallbackFontId,
  );
}

const { setWatermarkPreviewCanvas, makeWatermarkPayload } = useWatermarkPreview(
  {
    watermark,
    resize: settings.resize,
    selectedItem,
    resolveFont: resolveWatermarkFont,
  },
);

function handleStartConversion() {
  void startConversion(makeWatermarkPayload);
}

function handleRetryItem(item) {
  retryItem(item, makeWatermarkPayload);
}
</script>
