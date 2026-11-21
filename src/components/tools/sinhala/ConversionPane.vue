<template>
  <section class="min-w-0 space-y-2" :class="isInput ? 'order-1' : 'order-3'">
    <div class="min-w-0 flex flex-wrap items-center justify-between gap-2">
      <hgroup class="min-w-0">
        <h2 :id="config.labelId" class="block font-serif text-lg font-bold">
          {{ translate(config.titleKey) }}
        </h2>
        <p class="text-xs text-base-content/55">
          {{ translate(config.subtitleKey) }}
        </p>
      </hgroup>
      <div class="flex min-w-0 shrink-0 items-end gap-2">
        <label class="label block text-xs w-24 sm:w-42">
          {{ translate("common.fontSelect.font") }}
          <FontSelect
            ref="fontSelect"
            v-model="font.id"
            v-model:fallback-font-id="font.fallbackId"
            :website-fonts="config.websiteFonts"
            :preview="config.preview"
            :local-font-filter="config.localFontFilter"
            :probe-local-fonts="config.probeLocalFonts"
            :resolve-css-font-matcher="config.resolveCssFontMatcher"
            size="xs"
            :aria-label="translate(config.fontAriaKey)"
            :disabled="controlsDisabled"
            @select="emit('select-font', $event)"
          />
        </label>
        <Tooltip
          as="div"
          trigger-class=""
          activation-class="tooltip"
          :text="translate(config.boldKey)"
        >
          <button
            type="button"
            class="btn btn-ghost btn-square btn-sm"
            :class="{ 'btn-active': font.bold }"
            :aria-pressed="font.bold"
            :aria-label="translate(config.boldKey)"
            :disabled="controlsDisabled"
            @click="emit('toggle-bold')"
          >
            <i
              class="ri-bold"
              :class="{ 'font-bold!': font.bold }"
              aria-hidden="true"
            ></i>
          </button>
        </Tooltip>
      </div>
    </div>

    <div
      ref="fieldEl"
      class="textarea relative flex w-full flex-col p-0 [overflow-anchor:none] lg:w-[calc(100%+1.5rem)]"
      :class="{
        'border-primary/25 bg-primary/5 lg:-ml-6 focus-within:outline-0 focus-within:outline-offset-0':
          !isInput,
      }"
    >
      <div
        ref="viewportEl"
        class="relative min-h-32 w-full overflow-y-auto lg:min-h-48"
        @scroll.passive="emit('scroll')"
      >
        <slot />

        <Tooltip
          v-if="hasText && isInput"
          as="label"
          trigger-class=""
          activation-class="tooltip"
          :for="config.clearId"
          class="tooltip-left absolute right-2 top-2"
          :text="translate('sinhala.clearAll')"
        >
          <button
            :id="config.clearId"
            type="button"
            class="btn btn-ghost btn-circle btn-sm"
            :aria-label="translate('sinhala.clearAll')"
            @click="emit('clear')"
          >
            <i class="ri-close-line" aria-hidden="true"></i>
          </button>
        </Tooltip>
      </div>

      <div
        class="flex min-h-10 flex-wrap items-end justify-between gap-2 pt-0 p-2"
      >
        <section class="flex min-w-0 flex-wrap gap-2 items-center">
          <Tooltip
            as="label"
            trigger-class=""
            activation-class="tooltip"
            :for="config.actionId"
            class="tooltip-right"
            :text="actionLabel"
          >
            <button
              :id="config.actionId"
              type="button"
              class="btn btn-ghost btn-circle btn-sm"
              :disabled="!isInput && !characterCount"
              :aria-label="actionLabel"
              @click="isInput ? emit('paste') : emit('copy')"
            >
              <i :class="actionIcon" aria-hidden="true"></i>
            </button>
          </Tooltip>

          <Tooltip
            v-if="!isInput"
            as="div"
            trigger-class=""
            activation-class="tooltip"
            class="tooltip-right"
            :text="translate(config.downloadKey)"
          >
            <button
              type="button"
              class="btn btn-ghost btn-circle btn-sm"
              :disabled="!characterCount || downloading"
              :aria-label="translate(config.downloadKey)"
              @click="emit('download')"
            >
              <i class="ri-download-line" aria-hidden="true"></i>
            </button>
          </Tooltip>

          <slot name="toolbar-extra" />

          <span
            v-if="isInput && encodingSuggestion"
            role="alert"
            class="flex gap-2 items-center"
          >
            <i
              class="ri-sparkling-2-fill text-primary text-lg"
              aria-hidden="true"
            ></i>
            <span class="min-w-0 text-sm text-pretty">
              {{ encodingSuggestion.message }}
            </span>
            <button
              type="button"
              class="link link-primary link-hover"
              @click="emit('apply-suggestion')"
            >
              {{ encodingSuggestion.actionLabel }}
            </button>
          </span>
        </section>

        <span class="text-xs tabular-nums text-base-content/75">
          {{
            translate(
              "sinhala.characterCount",
              { count: characterCount },
              characterCount,
            )
          }}
        </span>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, ref } from "vue";
import Tooltip from "@/components/display/Tooltip.vue";
import FontSelect from "@/components/interaction/controls/FontSelect.vue";
import { useLocale } from "@/i18n";
import {
  createSinhalaUnicodeCssFontMatcher,
  filterSinhalaLegacyLocalFonts,
  filterSinhalaUnicodeLocalFonts,
  probeSinhalaLegacyLocalFonts,
} from "@/utils/sinhala/font-catalog";
import {
  legacyFontPreviewText,
  legacyWebsiteFonts,
  sinhalaFontPreviewText,
  unicodeWebsiteFonts,
} from "@/utils/sinhala/fonts";

const PANE_CONFIG = {
  unicode: {
    labelId: "sinhala-unicode-label",
    clearId: "clear-text-1",
    actionId: "unicode-field-action",
    titleKey: "sinhala.unicodeText",
    subtitleKey: "sinhala.unicodeLabel",
    fontAriaKey: "sinhala.unicodeFont",
    boldKey: "sinhala.unicodeBold",
    copyKey: "sinhala.copyUnicode",
    downloadKey: "sinhala.unicodeDownload",
    websiteFonts: unicodeWebsiteFonts,
    preview: {
      text: sinhalaFontPreviewText,
      language: "si",
      alwaysShowLocal: true,
    },
    localFontFilter: filterSinhalaUnicodeLocalFonts,
    probeLocalFonts: null,
    resolveCssFontMatcher: createSinhalaUnicodeCssFontMatcher,
  },
  legacy: {
    labelId: "sinhala-legacy-label",
    clearId: "clear-text-2",
    actionId: "fm-field-action",
    titleKey: "sinhala.legacyText",
    subtitleKey: "sinhala.legacyLabel",
    fontAriaKey: "sinhala.legacyFont",
    boldKey: "sinhala.legacyBold",
    copyKey: "sinhala.copyLegacy",
    downloadKey: "sinhala.legacyDownload",
    websiteFonts: legacyWebsiteFonts,
    preview: {
      text: legacyFontPreviewText,
      language: "si",
    },
    localFontFilter: filterSinhalaLegacyLocalFonts,
    probeLocalFonts: probeSinhalaLegacyLocalFonts,
    resolveCssFontMatcher: null,
  },
};

const props = defineProps({
  side: {
    type: String,
    required: true,
    validator: (value) => value === "unicode" || value === "legacy",
  },
  isInput: { type: Boolean, required: true },
  font: { type: Object, required: true },
  controlsDisabled: { type: Boolean, default: false },
  characterCount: { type: Number, default: 0 },
  hasText: { type: Boolean, default: false },
  clipboardStatus: { type: String, default: "" },
  downloading: { type: Boolean, default: false },
  encodingSuggestion: { type: Object, default: null },
});

const emit = defineEmits([
  "select-font",
  "toggle-bold",
  "scroll",
  "clear",
  "copy",
  "paste",
  "download",
  "apply-suggestion",
]);

const { t: translate } = useLocale();
const fontSelect = ref(null);
const fieldEl = ref(null);
const viewportEl = ref(null);

const config = computed(() => PANE_CONFIG[props.side]);

const actionLabel = computed(() => {
  if (props.isInput) {
    if (props.clipboardStatus === "pasted") return translate("sinhala.pasted");
    if (props.clipboardStatus === "paste-failed")
      return translate("sinhala.pasteFailed");
    return translate("common.actions.paste");
  }
  if (props.clipboardStatus === "copied") return translate("sinhala.copied");
  if (props.clipboardStatus === "copy-failed")
    return translate("sinhala.copyFailed");
  return translate(config.value.copyKey);
});

const actionIcon = computed(() => {
  if (props.isInput) {
    if (props.clipboardStatus === "pasted") return "ri-check-line";
    if (props.clipboardStatus === "paste-failed") return "ri-error-warning-line";
    return "ri-clipboard-line";
  }
  return props.clipboardStatus === "copied"
    ? "ri-check-line"
    : "ri-file-copy-line";
});

function resolveFont(...args) {
  return fontSelect.value?.resolveFont(...args);
}

function selectedDocumentFontInfo() {
  return fontSelect.value?.selectedDocumentFontInfo();
}

defineExpose({
  fieldEl,
  viewportEl,
  resolveFont,
  selectedDocumentFontInfo,
});
</script>
