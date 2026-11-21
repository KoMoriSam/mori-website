<template>
  <section
    class="min-w-0 space-y-2 overflow-hidden max-sm:sticky max-sm:top-2 max-sm:z-20 max-sm:rounded-box max-sm:border max-sm:border-base-300 max-sm:bg-base-100/95 max-sm:p-2 max-sm:shadow-sm max-sm:backdrop-blur"
  >
    <header class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="card-title font-serif">
        {{ translate("markdown.mermaid.preview") }}
      </h2>
      <span class="text-xs text-base-content/55">
        {{ item.width || "—" }} × {{ item.height || "—" }}
        <template
          v-if="
            previewDimensions &&
            (previewDimensions.width !== item.width ||
              previewDimensions.height !== item.height)
          "
        >
          → {{ previewDimensions.width }} ×
          {{ previewDimensions.height }}</template
        >
      </span>
    </header>
    <div
      class="image-checker h-[clamp(12rem,25dvh,16rem)] overflow-hidden rounded-box border border-base-300 sm:h-[clamp(20rem,60vh,32rem)]"
    >
      <ImagePreview
        v-model:index="previewIndex"
        mode="inline"
        class="size-full"
        :slides="slides"
        :aria-label="translate('image.preview', { p0: item.file.name })"
      >
        <template #overlay>
          <canvas
            v-if="watermarkEnabled"
            :ref="handleCanvasRef"
            class="pointer-events-none absolute inset-0 size-full"
            aria-hidden="true"
          ></canvas>
        </template>
      </ImagePreview>
    </div>
    <div v-if="item.frameCount > 1" class="space-y-1 text-xs text-base-content/60">
      <div class="flex gap-2">
        <i class="ri-movie-2-line" aria-hidden="true"></i>
        <input
          v-model.number="framePosition"
          class="range range-xs w-full"
          type="range"
          min="0"
          :max="Math.max(0, framesLength - 1)"
          :disabled="!framesLength"
          :aria-label="translate('image.frameProgress')"
        />
        <span class="tabular-nums"
          >{{ framePosition + 1 }}/{{ item.frameCount }}</span
        >
      </div>
      <div class="flex flex-wrap items-center justify-center gap-2">
        <button
          class="btn btn-ghost btn-sm btn-circle"
          type="button"
          :aria-label="translate('image.previousFrame')"
          :disabled="!framesLength"
          @click="emit('step-frame', -1)"
        >
          <i class="ri-skip-back-mini-line" aria-hidden="true"></i>
        </button>
        <button
          class="btn btn-ghost btn-circle"
          type="button"
          :aria-label="
            isPlaying ? translate('image.pause') : translate('image.play')
          "
          :disabled="!framesLength"
          @click="emit('toggle-animation')"
        >
          <i
            :class="isPlaying ? 'ri-pause-line' : 'ri-play-line'"
            aria-hidden="true"
          ></i>
        </button>
        <button
          class="btn btn-ghost btn-sm btn-circle"
          type="button"
          :aria-label="translate('image.nextFrame')"
          :disabled="!framesLength"
          @click="emit('step-frame', 1)"
        >
          <i class="ri-skip-forward-mini-line" aria-hidden="true"></i>
        </button>
      </div>
    </div>
  </section>
</template>

<script setup>
import "@/assets/image-checker.css";
import ImagePreview from "@/components/interaction/overlay/ImagePreview.vue";
import { useLocale } from "@/i18n";

const previewIndex = defineModel("index", { type: Number, required: true });
const framePosition = defineModel("framePosition", {
  type: Number,
  default: 0,
});

defineProps({
  item: { type: Object, required: true },
  slides: { type: Array, required: true },
  previewDimensions: { type: Object, default: null },
  watermarkEnabled: { type: Boolean, default: false },
  framesLength: { type: Number, default: 0 },
  isPlaying: { type: Boolean, default: false },
});

const emit = defineEmits(["step-frame", "toggle-animation", "canvas-change"]);

const { t: translate } = useLocale();

function handleCanvasRef(element) {
  emit("canvas-change", element);
}
</script>
