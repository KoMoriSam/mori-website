<template>
  <div class="min-w-0 w-full">
    <button
      ref="trigger"
      class="select flex min-w-0 w-full items-center justify-between gap-2 text-left"
      :class="size ? selectSizeClasses[size] : 'max-sm:select-sm'"
      type="button"
      role="combobox"
      aria-haspopup="listbox"
      :aria-controls="popoverId"
      :aria-expanded="isOpen"
      :disabled="disabled"
      :popovertarget="popoverId"
      :style="{ anchorName }"
    >
      <span
        class="min-w-0 flex-1 truncate text-base-content"
        :class="selectedFont?.style"
        :style="selectedFontStyle"
      >
        {{ selectedFontLabel }}
      </span>
    </button>

    <div
      :id="popoverId"
      ref="popover"
      popover="auto"
      class="dropdown dropdown-center dropdown-bottom m-0 max-h-72 min-w-56 overscroll-contain overflow-y-auto [overflow-anchor:none] scrollbar-thin rounded-box border border-base-300 bg-base-100! p-1 shadow-lg"
      :style="{ positionAnchor: anchorName, width: 'anchor-size(width)' }"
      role="listbox"
      :aria-label="resolvedAriaLabel"
      @scroll.passive="onScroll"
      @wheel="onWheel"
      @touchstart.passive="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="resetTouchPosition"
      @touchcancel="resetTouchPosition"
      @keydown="onKeydown"
      @toggle="onPopoverToggle"
    >
      <div class="sticky top-0 z-20 bg-base-100 p-1">
        <input
          v-model="fontSearchQuery"
          type="search"
          class="input input-sm w-full"
          :aria-label="translate('common.fontSelect.search')"
          :placeholder="translate('common.fontSelect.search')"
          @keydown.stop
        />
      </div>

      <div
        v-if="filteredWebsiteFonts.length"
        role="group"
        :aria-label="translate('common.fontSelect.site')"
      >
        <div
          class="bg-base-100 border-b border-base-200 sticky -top-1 z-10 grid grid-cols-[minmax(0,1fr)_2.5rem] items-center gap-1 py-1.5 text-xs leading-4 font-medium text-base-content/55"
        >
          <span class="px-3">{{ translate("common.fontSelect.site") }}</span>
          <Tooltip
            adaptive
            placement="left"
            content-class="max-w-56 sm:max-w-80"
            as="span"
            trigger-class=""
            class="border-base-200 flex self-stretch items-center justify-center border-l text-[0.625rem]"
            :text="translate('common.fontSelect.defaultFallback')"
            :aria-label="translate('common.fontSelect.defaultFallback')"
          >
            {{ translate("common.fontSelect.fallback") }}
          </Tooltip>
        </div>
        <div
          v-for="font in filteredWebsiteFonts"
          :key="font.id"
          class="grid grid-cols-[minmax(0,1fr)_2.5rem] items-center gap-1"
        >
          <FontSelectOption
            :font="font"
            :selected="modelValue === font.id"
            @select="selectFont"
          />
          <Tooltip
            as="label"
            trigger-class=""
            adaptive
            placement="left"
            content-class="max-w-56 sm:max-w-80"
            :text="translate('common.fontSelect.setFallback', { p0: font.label })"
            class="border-base-200 flex h-8 w-10 cursor-pointer items-center justify-center border-l"
          >
            <input
              class="radio radio-xs"
              type="radio"
              :name="fallbackRadioName"
              :value="font.id"
              :checked="effectiveFallbackFontId === font.id"
              :aria-label="translate('common.fontSelect.setFallback', { p0: font.label })"
              :disabled="disabled"
              @change="selectFallbackFont(font.id)"
            />
          </Tooltip>
        </div>
      </div>

      <div role="group" :aria-label="translate('common.fontSelect.custom')">
        <div
          class="bg-base-100 border-b border-base-200 sticky -top-1 z-10 px-3 py-1.5 text-xs leading-4 font-medium text-base-content/55"
        >
          {{ translate("common.fontSelect.custom") }}
        </div>
        <FontSelectOption
          v-for="font in filteredUploadedFonts"
          :key="font.id"
          :font="font"
          :selected="modelValue === font.id"
          @select="selectFont"
        />
        <button
          class="btn btn-ghost btn-sm w-full justify-start"
          type="button"
          :disabled="disabled || isUploadingFont"
          aria-live="polite"
          @click="openFontPicker"
        >
          <span
            v-if="isUploadingFont"
            class="loading loading-dots loading-xs"
            aria-hidden="true"
          ></span>
          <i v-else class="ri-upload-2-line" aria-hidden="true"></i>
          <span class="ml-0.5">{{
            isUploadingFont
              ? translate("common.fontSelect.loadingLabel")
              : translate("common.fontSelect.upload")
          }}</span>
          <span class="ml-1 font-normal text-xs text-base-content/55">
            {{ translate("common.fontSelect.localOnly") }}
          </span>
        </button>
      </div>

      <div role="group" :aria-label="deviceGroupLabel">
        <div
          class="bg-base-100 border-b border-base-200 sticky -top-1 z-10 px-3 py-1.5 text-xs leading-4 font-medium text-base-content/55"
        >
          {{ deviceGroupLabel }}
        </div>
        <button
          class="btn btn-ghost btn-sm w-full justify-start"
          type="button"
          :disabled="
            disabled ||
            isReadingLocalFonts ||
            isLoadingMoreLocalFonts ||
            hasReadLocalFonts ||
            !supportsLocalFontAccess
          "
          aria-live="polite"
          @click="readLocalFonts"
        >
          <span
            v-if="showLocalFontLoading && localFontLoadingPhase === 'initial'"
            class="loading loading-dots loading-xs"
            aria-hidden="true"
          ></span>
          <i v-else class="ri-computer-line" aria-hidden="true"></i>
          <span class="ml-0.5">{{ localFontActionLabel }}</span>
        </button>
        <div
          v-if="virtualFonts.length"
          ref="virtualContainer"
          class="relative [overflow-anchor:none]"
          :style="{
            contain: 'layout paint',
            height: `${virtualFonts.length * FONT_ROW_HEIGHT}px`,
          }"
        >
          <div
            class="absolute inset-x-0 top-0 flex flex-col will-change-transform"
            :style="virtualWindowStyle"
          >
            <FontSelectOption
              v-for="entry in visibleVirtualFonts"
              :key="entry.font.id"
              :font="entry.font"
              :selected="modelValue === entry.font.id"
              :position="{ index: entry.index + 1, size: virtualFonts.length }"
              @select="selectFont"
            />
          </div>
        </div>
        <button
          v-if="
            !normalizedFontSearch &&
            localFontLoadingPhase !== 'initial' &&
            (pendingLocalFontCount > 0 || isLoadingMoreLocalFonts || showLocalFontLoading)
          "
          class="btn btn-ghost btn-sm btn-block pointer-events-none justify-start"
          type="button"
          tabindex="-1"
          aria-disabled="true"
          aria-live="polite"
        >
          <span
            v-if="showLocalFontLoading && localFontLoadingPhase === 'more'"
            class="loading loading-dots loading-xs"
            aria-hidden="true"
          ></span>
          <i v-else class="ri-arrow-down-line" aria-hidden="true"></i>
          <span class="ml-0.5">
            {{
              showLocalFontLoading && localFontLoadingPhase === "more"
                ? translate("common.fontSelect.loading", { p0: deviceGroupLabel })
                : translate("common.fontSelect.loadMore")
            }}
          </span>
        </button>
      </div>

      <p
        v-if="normalizedFontSearch && !hasSearchResults"
        class="px-3 py-2 text-sm text-base-content/55"
        role="status"
      >
        {{ translate("common.fontSelect.noMatches") }}
      </p>
    </div>

    <input
      ref="fontInput"
      class="hidden"
      type="file"
      :accept="DEFAULT_FONT_ACCEPT"
      :disabled="disabled || isUploadingFont"
      @change="onFontFile"
    />
  </div>
</template>

<script setup>
import { computed, nextTick, ref, useId, watch } from "vue";
import Tooltip from "@/components/display/Tooltip.vue";
import FontSelectOption from "./FontSelectOption.vue";
import { useLocale } from "@/i18n";
import { useLocalFonts } from "@/composables/useLocalFonts";
import {
  FONT_ROW_HEIGHT,
  useFontVirtualWindow,
} from "@/composables/useFontVirtualWindow";
import { getFontPreviewStyle } from "@/utils/font-name";

const DEFAULT_FONT_ACCEPT =
  ".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2";

const selectSizeClasses = {
  xs: "select-xs",
  sm: "select-sm",
  md: "select-md",
  lg: "select-lg",
  xl: "select-xl",
};

const props = defineProps({
  modelValue: { type: String, required: true },
  fallbackFontId: { type: String, default: "" },
  websiteFonts: { type: Array, default: () => [] },
  preview: { type: Object, default: null },
  localFontFilter: { type: Function, default: null },
  probeLocalFonts: { type: Function, default: null },
  resolveCssFontMatcher: { type: Function, default: null },
  disabled: { type: Boolean, default: false },
  size: {
    type: String,
    default: "",
    validator: (value) => ["", "xs", "sm", "md", "lg", "xl"].includes(value),
  },
  ariaLabel: { type: String, default: "" },
});

const emit = defineEmits([
  "update:modelValue",
  "update:fallbackFontId",
  "select",
]);

const { t: translate, text: localizeText } = useLocale();
const trigger = ref(null);
const popover = ref(null);
const fontSearchQuery = ref("");
const fontInput = ref(null);
const virtualContainer = ref(null);
const isOpen = ref(false);
const componentId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
const popoverId = `font-select-${componentId}`;
const anchorName = `--${popoverId}`;
const fallbackRadioName = `font-fallback-${componentId}`;
const localFallbackFontId = ref(props.fallbackFontId);

const effectiveFallbackFontId = computed(
  () =>
    props.fallbackFontId ||
    localFallbackFontId.value ||
    props.websiteFonts[0]?.id ||
    "",
);

const {
  localFonts,
  uploadedFonts,
  supportsLocalFontAccess,
  isReadingLocalFonts,
  isLoadingMoreLocalFonts,
  showLocalFontLoading,
  localFontLoadingPhase,
  isUploadingFont,
  hasReadLocalFonts,
  pendingLocalFontCount,
  isLocalFontLoading,
  localFontActionLabel,
  getPendingLocalFontEntries,
  uploadFontFile,
  readLocalFonts,
  loadMoreLocalFonts,
  ensureLocalFontAlias,
  resolveFontFamily,
  resolveFont,
  selectedDocumentFontInfo,
} = useLocalFonts({
  componentId,
  getModelValue: () => props.modelValue,
  getWebsiteFonts: () => props.websiteFonts,
  getEffectiveFallbackFontId: () => effectiveFallbackFontId.value,
  getPreview: () => props.preview,
  getLocalFontFilter: () => props.localFontFilter,
  getProbeLocalFonts: () => props.probeLocalFonts,
  getCssFontMatcher: () => props.resolveCssFontMatcher,
  onBatchLoaded: () => syncVirtualWindow(popover.value, true),
});

const resolvedAriaLabel = computed(() =>
  props.ariaLabel
    ? localizeText(props.ariaLabel)
    : translate("common.fontSelect.font"),
);
const deviceGroupLabel = computed(() => translate("common.fontSelect.device"));
const normalizedFontSearch = computed(() =>
  fontSearchQuery.value.trim().toLocaleLowerCase(),
);

function matchesFontSearch(font) {
  if (!normalizedFontSearch.value) return true;
  return [font.label, font.fontFamily, font.id].some((value) =>
    String(value || "")
      .toLocaleLowerCase()
      .includes(normalizedFontSearch.value),
  );
}

const filteredWebsiteFonts = computed(() =>
  props.websiteFonts.filter(matchesFontSearch),
);
const filteredUploadedFonts = computed(() =>
  uploadedFonts.value.filter(matchesFontSearch),
);
const virtualFonts = computed(() => {
  if (!normalizedFontSearch.value) return localFonts.value;
  return [...localFonts.value, ...getPendingLocalFontEntries()].filter(
    matchesFontSearch,
  );
});
const hasSearchResults = computed(
  () =>
    filteredWebsiteFonts.value.length > 0 ||
    filteredUploadedFonts.value.length > 0 ||
    virtualFonts.value.length > 0,
);

const {
  visibleVirtualFonts,
  virtualWindowStyle,
  cancelPendingWork,
  resetVirtualWindow,
  syncVirtualWindow,
  prepareSelectedFontPosition,
  onScroll,
  onWheel,
  onTouchStart,
  onTouchMove,
  resetTouchPosition,
  onKeydown,
} = useFontVirtualWindow({
  virtualContainer,
  filteredWebsiteFonts,
  filteredUploadedFonts,
  virtualFonts,
  getModelValue: () => props.modelValue,
  canLoadMore: () =>
    !normalizedFontSearch.value &&
    pendingLocalFontCount.value > 0 &&
    !isLocalFontLoading.value &&
    !showLocalFontLoading.value,
  loadMore: () => {
    void loadMoreLocalFonts();
  },
});

watch(
  visibleVirtualFonts,
  (fonts) => {
    for (const { font } of fonts) ensureLocalFontAlias(font.id);
  },
  { flush: "post" },
);

const selectedFont = computed(() => {
  const targetId = props.modelValue;
  return (
    uploadedFonts.value.find(({ id }) => id === targetId) ||
    props.websiteFonts.find(({ id }) => id === targetId) ||
    localFonts.value.find(({ id }) => id === targetId) ||
    getPendingLocalFontEntries().find(({ id }) => id === targetId) ||
    null
  );
});
const selectedFontStyle = computed(() => getFontPreviewStyle(selectedFont.value));
const selectedFontLabel = computed(() =>
  selectedFont.value
    ? selectedFont.value.label
    : translate("common.fontSelect.choose"),
);

watch(fontSearchQuery, async () => {
  resetVirtualWindow();
  if (popover.value) popover.value.scrollTop = 0;
  await nextTick();
  syncVirtualWindow(popover.value, true);
});

function onPopoverToggle(event) {
  isOpen.value = event.newState === "open";
  if (isOpen.value) {
    const list = event.currentTarget;
    list.scrollTop = prepareSelectedFontPosition();
    syncVirtualWindow(list, true);
    return;
  }
  cancelPendingWork();
  fontSearchQuery.value = "";
}

function openFontPicker() {
  if (props.disabled || isUploadingFont.value) return;
  fontInput.value?.click();
}

async function onFontFile(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  const id = await uploadFontFile(file);
  if (!id) return;
  emit("select", id);
  emit("update:modelValue", id);
}

function selectFont(fontId) {
  cancelPendingWork();
  popover.value?.hidePopover();
  trigger.value?.focus();
  emit("select", fontId);
  if (fontId === props.modelValue) return;
  requestAnimationFrame(() => emit("update:modelValue", fontId));
}

function selectFallbackFont(fontId) {
  if (props.disabled || fontId === effectiveFallbackFontId.value) return;
  localFallbackFontId.value = fontId;
  emit("update:fallbackFontId", fontId);
}

defineExpose({ resolveFont, resolveFontFamily, selectedDocumentFontInfo });
</script>
