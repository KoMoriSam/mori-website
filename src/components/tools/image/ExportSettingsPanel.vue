<template>
  <fieldset
    class="fieldset rounded-box border border-base-300 bg-base-100 p-4 md:sticky md:top-4 md:col-start-2 md:row-span-2 md:row-start-1"
  >
    <legend class="fieldset-legend p-0">
      {{ translate("image.settings") }}
    </legend>

    <div
      class="flex min-h-0 flex-col gap-1.5 md:max-h-[calc(100dvh-var(--navbar-height)-1rem)]"
    >
      <div class="grid shrink-0 grid-cols-4 gap-x-4 gap-y-3">
        <div
          class="grid min-w-0 content-start"
          :class="
            hasQualityControl ||
            settings.format === 'png' ||
            !IMAGE_FORMATS[settings.format].alpha ||
            settings.format === 'gif'
              ? 'col-span-2'
              : staticOutput && hasAnimatedInput
                ? 'col-span-2'
                : 'col-span-4'
          "
        >
          <label class="label" for="format">{{
            translate("image.outputFormat")
          }}</label>
          <select
            id="format"
            v-model="settings.format"
            class="select max-sm:select-sm w-full"
            :disabled="isRunning"
          >
            <option
              v-for="(meta, value) in IMAGE_FORMATS"
              :key="value"
              :value="value"
            >
              {{ meta.label }}
            </option>
          </select>
        </div>

        <div
          v-if="hasQualityControl"
          class="col-span-2 grid min-w-0 content-start"
        >
          <label class="label" for="quality">
            <span>{{ translate("image.quality") }}</span>
            <span class="tabular-nums">
              {{
                settings.format !== "jpeg" && settings.lossless
                  ? translate("image.lossless")
                  : settings.quality
              }}
            </span>
          </label>
          <input
            id="quality"
            v-model.number="settings.quality"
            class="range sm:range-xl mt-1 w-full"
            type="range"
            min="1"
            max="100"
            :disabled="
              isRunning || (settings.format !== 'jpeg' && settings.lossless)
            "
          />
        </div>

        <div
          v-if="settings.format === 'png'"
          class="col-span-2 grid min-w-0 content-start"
        >
          <label class="label" for="png-level">
            <span v-if="!settings.pngOptimize">{{
              translate("image.optimizationDisabled")
            }}</span>
            <span v-else>
              {{ translate("image.optimizationLevel") }}
              <span class="tabular-nums">{{ settings.pngLevel }}</span>
            </span>
          </label>
          <input
            id="png-level"
            v-model.number="settings.pngLevel"
            class="range sm:range-xl mt-1 w-full"
            type="range"
            min="0"
            max="6"
            :disabled="isRunning || !settings.pngOptimize"
          />
        </div>

        <div
          v-if="settings.format === 'gif'"
          class="col-span-2 grid min-w-0 content-start"
        >
          <label class="label" for="gif-colors">
            <span>{{ translate("image.paletteColors") }}</span>
            <span class="tabular-nums">{{ settings.gifColors }}</span>
          </label>
          <input
            id="gif-colors"
            v-model.number="settings.gifColors"
            class="range sm:range-xl mt-1 w-full"
            type="range"
            min="16"
            max="256"
            step="16"
            :disabled="isRunning"
          />
        </div>

        <div
          v-if="staticOutput && hasAnimatedInput"
          class="grid min-w-0 content-start"
          :class="
            ['avif', 'png'].includes(settings.format) ||
            (!IMAGE_FORMATS[settings.format].alpha &&
              settings.format !== 'jpeg')
              ? 'col-span-4'
              : 'col-span-2'
          "
        >
          <label class="label" for="animation-mode">{{
            translate("image.animationSource")
          }}</label>
          <select
            id="animation-mode"
            v-model="settings.animationMode"
            class="select max-sm:select-sm w-full"
            :disabled="isRunning"
          >
            <option value="frames">
              {{ translate("image.exportFramesAsZip") }}
            </option>
            <option value="first">
              {{ translate("image.firstFrameOnly") }}
            </option>
          </select>
        </div>

        <div
          v-if="!IMAGE_FORMATS[settings.format].alpha"
          class="grid min-w-0 content-start"
          :class="
            settings.format === 'bmp'
              ? 'col-span-2 col-start-3 row-start-1'
              : staticOutput && hasAnimatedInput
                ? 'col-span-2 col-start-3 row-start-2'
                : 'col-span-2'
          "
        >
          <label class="label" for="background-color">
            {{ translate("image.transparencyFill") }}
            <span class="font-mono text-xs">
              {{ settings.backgroundColor }}
            </span>
          </label>
          <input
            id="background-color"
            v-model="settings.backgroundColor"
            class="input max-sm:input-sm p-0"
            type="color"
            :disabled="isRunning"
          />
        </div>
      </div>

      <div class="grid shrink-0 gap-2 [&>*+.label]:mt-2">
        <div class="divider mt-2 mb-0">
          {{ translate("common.moreSettings") }}
        </div>

        <div class="grid grid-flow-col auto-cols-fr gap-3 sm:gap-6">
          <label
            v-if="['webp', 'avif'].includes(settings.format)"
            class="label"
            for="lossless"
          >
            <input
              id="lossless"
              v-model="settings.lossless"
              class="toggle toggle-sm"
              type="checkbox"
              :disabled="isRunning"
            />
            {{ translate("image.losslessCompression") }}
          </label>

          <label
            v-if="settings.format === 'png'"
            class="label"
            for="png-optimize"
          >
            <input
              id="png-optimize"
              v-model="settings.pngOptimize"
              class="toggle toggle-sm"
              type="checkbox"
              :disabled="isRunning"
            />
            {{ translate("image.losslessOptimization") }}
          </label>

          <label class="label" for="resize">
            <input
              id="resize"
              v-model="settings.resize.enabled"
              class="toggle toggle-sm"
              type="checkbox"
              :disabled="isRunning"
            />
            {{ translate("image.resize") }}
          </label>

          <label class="label" for="watermark">
            <input
              id="watermark"
              v-model="watermark.enabled"
              class="toggle toggle-sm"
              type="checkbox"
              :disabled="isRunning"
            />
            {{ translate("image.addWatermark") }}
          </label>
        </div>
      </div>

      <ScrollableContainer class="flex-1">
        <div
          class="-m-1 grid min-h-0 flex-1 content-start gap-2 p-1 md:overflow-x-hidden md:overflow-y-auto md:overscroll-contain md:scrollbar-thin [&>*+.label]:mt-2"
        >
          <section
            v-if="settings.resize.enabled"
            class="grid gap-1"
            aria-labelledby="resize-settings"
          >
            <div id="resize-settings" class="divider mt-2 mb-0">
              {{ translate("image.sizeSettings") }}
            </div>
            <div
              class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2"
            >
              <div class="min-w-0">
                <label class="label" for="resize-width">{{
                  translate("image.width")
                }}</label>
                <label class="input max-sm:input-sm w-full">
                  <input
                    id="resize-width"
                    class="min-w-0 grow"
                    type="number"
                    min="1"
                    max="32768"
                    :value="settings.resize.width"
                    :disabled="isRunning"
                    @input="updateResizeDimension('width', $event.target.value)"
                  />
                  <span class="text-xs text-base-content/50">px</span>
                </label>
              </div>
              <Tooltip
                as="span"
                trigger-class=""
                activation-class="tooltip"
                class="tooltip-top"
                :text="
                  settings.resize.lockAspectRatio
                    ? translate('image.aspectRatioLocked')
                    : translate('image.aspectRatioUnlocked')
                "
              >
                <button
                  id="resize-lock-aspect-ratio"
                  class="btn btn-square btn-xs sm:btn-sm mb-1 sm:mb-1.25"
                  :class="
                    settings.resize.lockAspectRatio ? 'btn-active' : 'btn-ghost'
                  "
                  type="button"
                  :aria-label="
                    settings.resize.lockAspectRatio
                      ? translate('image.unlockAspectRatio')
                      : translate('image.lockOriginalAspectRatio')
                  "
                  :aria-pressed="settings.resize.lockAspectRatio"
                  :disabled="isRunning"
                  @click="toggleResizeAspectRatio"
                >
                  <i
                    :class="
                      settings.resize.lockAspectRatio
                        ? 'ri-link-m'
                        : 'ri-link-unlink-m'
                    "
                    aria-hidden="true"
                  ></i>
                </button>
              </Tooltip>
              <div class="min-w-0">
                <label class="label" for="resize-height">{{
                  translate("image.height")
                }}</label>
                <label class="input max-sm:input-sm w-full">
                  <input
                    id="resize-height"
                    class="min-w-0 grow"
                    type="number"
                    min="1"
                    max="32768"
                    :value="settings.resize.height"
                    :disabled="isRunning"
                    @input="
                      updateResizeDimension('height', $event.target.value)
                    "
                  />
                  <span class="text-xs text-base-content/50">px</span>
                </label>
              </div>
            </div>
            <label class="label">
              <input
                v-model="settings.resize.preventUpscale"
                class="toggle toggle-sm"
                type="checkbox"
                :disabled="isRunning"
              />
              {{ translate("image.limitSize") }}
            </label>
          </section>

          <WatermarkPanel
            v-show="watermark.enabled"
            ref="watermarkPanel"
            :watermark="watermark"
            :disabled="isRunning"
          />
        </div>
      </ScrollableContainer>

      <div class="mt-2 grid shrink-0 grid-cols-1 gap-2">
        <button
          v-if="isRunning"
          class="btn"
          type="button"
          @click="emit('cancel')"
        >
          <i class="ri-stop-circle-line" aria-hidden="true"></i
          >{{ translate("image.cancelConversion") }}
        </button>
        <button
          v-else
          class="btn btn-primary"
          type="button"
          :disabled="!canStart"
          @click="emit('start')"
        >
          <i class="ri-magic-line" aria-hidden="true"></i
          >{{ translate("image.startConversion") }}
        </button>
      </div>
    </div>
  </fieldset>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import Tooltip from "@/components/display/Tooltip.vue";
import ScrollableContainer from "@/components/layout/ScrollableContainer.vue";
import WatermarkPanel from "./WatermarkPanel.vue";
import { useLocale } from "@/i18n";
import { IMAGE_FORMATS } from "@/utils/image/converter";

const props = defineProps({
  settings: { type: Object, required: true },
  watermark: { type: Object, required: true },
  selectedImage: { type: Object, default: null },
  hasAnimatedInput: { type: Boolean, default: false },
  isRunning: { type: Boolean, default: false },
  canStart: { type: Boolean, default: false },
});

const emit = defineEmits(["start", "cancel"]);

const { t: translate } = useLocale();
const watermarkPanel = ref(null);
let resizeAspectAnchor = "width";
let resizeDimensionsModified = false;

const hasQualityControl = computed(() =>
  ["jpeg", "webp", "avif"].includes(props.settings.format),
);
const staticOutput = computed(
  () => !["gif", "webp"].includes(props.settings.format),
);

function syncResizeAspectRatio(dimension) {
  const item = props.selectedImage;
  if (
    !props.settings.resize.enabled ||
    !props.settings.resize.lockAspectRatio ||
    !item?.width ||
    !item.height
  ) {
    return;
  }
  const value = Number(props.settings.resize[dimension]);
  if (!Number.isFinite(value) || value <= 0) return;
  const ratio = item.width / item.height;
  if (dimension === "height") {
    props.settings.resize.width = Math.max(1, Math.round(value * ratio));
  } else {
    props.settings.resize.height = Math.max(1, Math.round(value / ratio));
  }
}

function updateResizeDimension(dimension, value) {
  resizeDimensionsModified = true;
  props.settings.resize[dimension] = value === "" ? "" : Number(value);
  resizeAspectAnchor = dimension;
  if (props.settings.resize.lockAspectRatio) {
    props.settings.resize.mode = dimension;
    syncResizeAspectRatio(dimension);
  } else {
    props.settings.resize.mode = "exact";
  }
}

function toggleResizeAspectRatio() {
  props.settings.resize.lockAspectRatio =
    !props.settings.resize.lockAspectRatio;
  if (!props.settings.resize.lockAspectRatio) {
    props.settings.resize.mode = "exact";
    return;
  }
  props.settings.resize.mode = resizeAspectAnchor;
  syncResizeAspectRatio(resizeAspectAnchor);
}

watch(
  [
    () => props.selectedImage?.id,
    () => props.selectedImage?.width,
    () => props.selectedImage?.height,
  ],
  () => {
    const item = props.selectedImage;
    if (!item) {
      resizeDimensionsModified = false;
      return;
    }
    if (resizeDimensionsModified || !item.width || !item.height) return;
    props.settings.resize.width = item.width;
    props.settings.resize.height = item.height;
  },
);

function resolveWatermarkFont(fontId, text, fallbackFontId) {
  if (!watermarkPanel.value) {
    throw new Error(translate("image.fontNotReady"));
  }
  return watermarkPanel.value.resolveFont(fontId, text, 600, fallbackFontId);
}

defineExpose({ resolveWatermarkFont });
</script>
