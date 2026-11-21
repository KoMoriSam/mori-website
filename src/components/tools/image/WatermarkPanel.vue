<template>
  <section class="grid gap-1" aria-labelledby="watermark-settings-heading">
    <div id="watermark-settings-heading" class="divider mt-2 mb-0">
      {{ translate("image.watermarkSettings") }}
    </div>
    <div class="grid gap-y-2">
      <div
        class="grid grid-cols-[minmax(0,1fr)_auto] justify-between gap-x-3 gap-y-2"
      >
        <div
          class="min-w-0"
          :class="watermark.mode === 'single' ? '' : 'col-span-2'"
        >
          <span id="watermark-content-label" class="label">{{
            translate("image.watermarkContent")
          }}</span>
          <div
            class="mt-1 mb-3 flex sm:mt-1.5 sm:mb-3.5"
            :class="watermark.mode === 'single' ? 'justify-between' : 'gap-4'"
            role="group"
            aria-labelledby="watermark-content-label"
          >
            <label class="label" for="watermark-text-toggle">
              <input
                id="watermark-text-toggle"
                class="checkbox max-sm:checkbox-sm"
                type="checkbox"
                :checked="watermarkContainsText(watermark)"
                :disabled="disabled"
                @change="setWatermarkTextEnabled"
              />
              {{ translate("image.text") }}
            </label>
            <label class="label" for="watermark-image-toggle">
              <input
                id="watermark-image-toggle"
                class="checkbox max-sm:checkbox-sm"
                type="checkbox"
                :checked="watermarkUsesGraphicKind('image', watermark)"
                :disabled="disabled"
                @change="setWatermarkGraphicEnabled('image', $event)"
              />
              {{ translate("reader.contextMenu.image") }}
            </label>
            <label class="label" for="watermark-icon-toggle">
              <input
                id="watermark-icon-toggle"
                class="checkbox max-sm:checkbox-sm"
                type="checkbox"
                :checked="watermarkUsesGraphicKind('icon', watermark)"
                :disabled="disabled"
                @change="setWatermarkGraphicEnabled('icon', $event)"
              />
              {{ translate("image.icon") }}
            </label>
          </div>
        </div>
        <div
          v-if="watermark.mode === 'single'"
          class="row-span-2 min-w-0 border-l border-base-300 pl-3"
        >
          <span class="label">{{ translate("image.position") }}</span>
          <div
            class="grid w-fit grid-cols-3 gap-1"
            role="radiogroup"
            :aria-label="translate('image.watermarkPosition')"
          >
            <input
              v-for="position in WATERMARK_POSITIONS"
              :key="position.value"
              class="radio radio-lg sm:radio-xl"
              :class="
                watermark.position === position.value ? 'radio-primary' : ''
              "
              type="radio"
              role="radio"
              name="watermark-position"
              :checked="watermark.position === position.value"
              :aria-checked="watermark.position === position.value"
              :aria-label="translate(position.key)"
              :disabled="disabled"
              @click="watermark.position = position.value"
            />
          </div>
        </div>
        <div
          class="min-w-0"
          :class="watermark.mode === 'single' ? 'col-start-1' : 'col-span-2'"
        >
          <label class="label" for="watermark-mode">{{
            translate("image.arrangement")
          }}</label>
          <select
            id="watermark-mode"
            v-model="watermark.mode"
            class="select max-sm:select-sm w-full"
            :disabled="disabled"
          >
            <option value="single">
              {{ translate("image.single") }}
            </option>
            <option value="tile">
              {{ translate("image.tile") }}
            </option>
          </select>
        </div>
      </div>

      <div
        v-if="watermarkContainsText(watermark)"
        class="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2"
      >
        <div class="min-w-0">
          <label class="label" for="watermark-text">{{
            translate("common.text")
          }}</label>
          <input
            id="watermark-text"
            v-model="watermark.text"
            class="input max-sm:input-sm w-full"
            type="text"
            maxlength="80"
            :placeholder="translate('image.enterWatermarkText')"
            :disabled="disabled"
          />
        </div>
        <div>
          <label class="label" for="watermark-text-color">{{
            translate("image.color")
          }}</label>
          <input
            id="watermark-text-color"
            v-model="watermark.color"
            class="input block size-10 p-0 max-sm:size-8"
            type="color"
            :disabled="disabled"
          />
        </div>
      </div>

      <div v-if="watermarkContainsText(watermark)" class="min-w-0">
        <span class="label">{{ translate("common.fontSelect.font") }}</span>
        <FontSelect
          ref="watermarkFontSelect"
          v-model="watermark.fontId"
          v-model:fallback-font-id="watermark.fallbackFontId"
          :website-fonts="websiteWatermarkFonts"
          :disabled="disabled"
          :aria-label="translate('image.watermarkFont')"
        />
      </div>

      <div v-if="watermarkNeedsGraphic(watermark)" class="min-w-0">
        <div v-if="usesWatermarkImageFile(watermark)">
          <label class="label" for="watermark-graphic-image">
            {{ translate("image.defaultIcon") }}
          </label>
          <input
            id="watermark-graphic-image"
            class="file-input max-sm:file-input-sm w-full"
            type="file"
            accept="image/*,.svg,image/svg+xml"
            :disabled="disabled"
            @change="onWatermarkFile"
          />
        </div>
        <div v-else class="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
          <RemixIconPicker v-model="watermark.icon" :disabled="disabled" />
          <div v-if="!watermarkContainsText(watermark)">
            <label class="label" for="watermark-graphic-color">
              {{ translate("image.color") }}
            </label>
            <input
              id="watermark-graphic-color"
              v-model="watermark.color"
              class="input block size-10 p-0 max-sm:size-8"
              type="color"
              :disabled="disabled"
            />
          </div>
        </div>
      </div>
    </div>

    <div class="mt-2">
      <div class="grid gap-x-4 gap-y-3 sm:grid-cols-2 md:grid-cols-1">
        <div class="min-w-0">
          <label class="label" for="watermark-opacity">
            <span>{{ translate("image.opacity") }}</span>
            <span class="tabular-nums">
              {{ Math.round(watermark.opacity * 100) }}%
            </span>
          </label>
          <input
            id="watermark-opacity"
            v-model.number="watermark.opacity"
            class="range max-sm:range-sm"
            type="range"
            min="0.05"
            max="1"
            step="0.05"
            :disabled="disabled"
          />
        </div>
        <div class="min-w-0">
          <label class="label" for="watermark-scale">
            <span>{{ translate("image.scale") }}</span>
            <span class="tabular-nums">
              {{ Math.round(watermark.scale * 100) }}%
            </span>
          </label>
          <input
            id="watermark-scale"
            v-model.number="watermark.scale"
            class="range max-sm:range-sm"
            type="range"
            min="0.02"
            max="0.5"
            step="0.01"
            :disabled="disabled"
          />
        </div>
        <div v-if="watermark.mode === 'single'" class="min-w-0">
          <label class="label" for="watermark-margin">
            <span>{{ translate("image.margin") }}</span>
            <span class="tabular-nums">{{ watermark.margin }} px</span>
          </label>
          <input
            id="watermark-margin"
            v-model.number="watermark.margin"
            class="range max-sm:range-sm"
            type="range"
            min="0"
            max="160"
            :disabled="disabled"
          />
        </div>
        <div class="min-w-0">
          <label class="label" for="watermark-offset-x">
            <span>{{ translate("image.xOffset") }}</span>
            <span class="tabular-nums">{{ watermark.offsetX }} px</span>
          </label>
          <input
            id="watermark-offset-x"
            v-model.number="watermark.offsetX"
            class="range max-sm:range-sm"
            type="range"
            min="-1000"
            max="1000"
            :disabled="disabled"
          />
        </div>
        <div class="min-w-0">
          <label class="label" for="watermark-offset-y">
            <span>{{ translate("image.yOffset") }}</span>
            <span class="tabular-nums">{{ watermark.offsetY }} px</span>
          </label>
          <input
            id="watermark-offset-y"
            v-model.number="watermark.offsetY"
            class="range max-sm:range-sm"
            type="range"
            min="-1000"
            max="1000"
            :disabled="disabled"
          />
        </div>
        <div v-if="watermark.mode === 'tile'" class="min-w-0">
          <label class="label" for="watermark-gap">
            <span>{{ translate("image.spacing") }}</span>
            <span class="tabular-nums">{{ watermark.gap }} px</span>
          </label>
          <input
            id="watermark-gap"
            v-model.number="watermark.gap"
            class="range max-sm:range-sm"
            type="range"
            min="8"
            max="320"
            :disabled="disabled"
          />
        </div>
        <div class="min-w-0">
          <label class="label" for="watermark-rotation">
            <span>{{ translate("image.rotation") }}</span>
            <span class="tabular-nums">{{ watermark.rotation }}°</span>
          </label>
          <input
            id="watermark-rotation"
            v-model.number="watermark.rotation"
            class="range max-sm:range-sm"
            type="range"
            min="-90"
            max="90"
            step="5"
            :disabled="disabled"
          />
        </div>
        <span id="watermark-other-label" class="label">{{
          translate("image.otherSettings")
        }}</span>
        <div
          class="min-w-0"
          role="group"
          aria-labelledby="watermark-other-label"
        >
          <label class="label" for="watermark-shadow">
            <input
              id="watermark-shadow"
              v-model="watermark.shadow"
              class="toggle toggle-sm"
              type="checkbox"
              :disabled="disabled"
            />
            {{ translate("image.watermarkShadow") }}
          </label>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref } from "vue";
import "@/assets/font/reader-fonts.css";
import FontSelect from "@/components/interaction/controls/FontSelect.vue";
import RemixIconPicker from "./RemixIconPicker.vue";
import { FONTS } from "@/constants/reader";
import { useLocale } from "@/i18n";
import {
  WATERMARK_POSITIONS,
  usesWatermarkImageFile,
  watermarkContainsText,
  watermarkNeedsGraphic,
  watermarkUsesGraphicKind,
} from "@/utils/image/watermark";

const websiteWatermarkFonts = FONTS.map(({ name, style }) => ({
  id: `site:${style}`,
  label: name,
  style,
  cssVariable: `--${style}`,
  supportsFontWeight: ["font-sans", "font-serif", "font-kai"].includes(style),
}));

const props = defineProps({
  watermark: { type: Object, required: true },
  disabled: { type: Boolean, default: false },
});

const { t: translate } = useLocale();
const watermarkFontSelect = ref(null);

function setWatermarkTextEnabled(event) {
  const enabled = event.target.checked;
  if (enabled && props.watermark.kind === "image") {
    props.watermark.kind = "image-text";
  } else if (!enabled) {
    props.watermark.kind = "image";
  }
}

function setWatermarkGraphicEnabled(graphicKind, event) {
  const enabled = event.target.checked;
  if (enabled) {
    props.watermark.graphicKind = graphicKind;
    if (props.watermark.kind === "text") props.watermark.kind = "image-text";
  } else if (props.watermark.graphicKind === graphicKind) {
    props.watermark.kind = "text";
  }
}

function onWatermarkFile(event) {
  props.watermark.file = event.target.files?.[0] || null;
}

function resolveFont(fontId, text, weight, fallbackFontId) {
  const selector = watermarkFontSelect.value;
  if (!selector) throw new Error(translate("image.fontNotReady"));
  return selector.resolveFont(fontId, text, weight, fallbackFontId);
}

defineExpose({ resolveFont });
</script>
