<template>
  <client-only>
    <section class="flex min-h-0 flex-1 flex-col overflow-hidden bg-base-100">
      <header
        v-if="showHeader && !controlsOnly"
        class="flex shrink-0 items-start gap-3 border-b border-base-300 px-3 py-3"
      >
        <div class="min-w-0 flex-1">
          <h3 class="m-0 text-base font-semibold tracking-wide">
            {{ translate("reader.format.title") }}
          </h3>
          <p class="mt-0.5 text-xs text-base-content/55">
            {{ translate("reader.format.previewHint") }}
          </p>
        </div>
        <button
          type="button"
          class="btn btn-ghost btn-sm shrink-0"
          :disabled="isLayoutDefault"
          @click="resetLayout"
        >
          <i class="ri-reset-left-line" aria-hidden="true"></i>
          {{ translate("reader.format.reset") }}
        </button>
      </header>

      <div
        v-if="!controlsOnly"
        class="shrink-0 border-b border-base-300 px-3 py-2.5"
      >
        <ScrollableContainer>
          <div
            class="overflow-y-auto overscroll-contain rounded-box h-36 md:h-48 p-4 bg-base-200 scrollbar-none shadow-inner"
            :class="styleConfigs.fontClass"
            :data-theme="mobile ? previewTheme || undefined : undefined"
            :style="previewStyle"
            :aria-label="
              mobile
                ? translate('reader.format.mobilePreview')
                : translate('reader.format.desktopPreview')
            "
          >
            <p class="m-0 indent-(--para-text-indent) text-justify text-pretty">
              {{ translate("reader.format.previewText") }}
            </p>
            <p
              class="mb-0 indent-(--para-text-indent) text-justify text-pretty"
              :style="{ marginBlockStart: previewParagraphGap }"
            >
              {{ translate("reader.format.previewNext") }}
            </p>
          </div>
        </ScrollableContainer>
      </div>

      <ScrollableContainer class="flex-1">
        <div
          class="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-thin p-3"
        >
          <div
            v-if="mobile"
            role="tablist"
            class="tabs tabs-sm tabs-box mb-3 w-full"
          >
            <button
              v-for="mode in MOBILE_READING_MODE_OPTIONS"
              :key="mode.value"
              type="button"
              role="tab"
              class="tab min-w-0 flex-1 gap-1"
              :class="{ 'tab-active': mobileReadingMode === mode.value }"
              :aria-selected="mobileReadingMode === mode.value"
              @click="store.setMobileReadingMode(mode.value)"
            >
              <i :class="mode.icon" aria-hidden="true"></i
              >{{ localizeText(mode.label) }}
            </button>
          </div>
          <div class="grid grid-cols-2 gap-x-4 gap-y-2">
            <div
              class="min-w-0"
              :class="controlsOnly ? 'col-span-1' : 'col-span-2'"
            >
              <span class="label block text-xs md:text-sm">
                {{ translate("reader.format.textFont") }}
                <Tooltip
                  as="small"
                  trigger-class="inline"
                  :text="translate('reader.format.sessionFontHint')"
                  :aria-label="translate('reader.format.sessionFontHint')"
                >
                  {{ translate("reader.format.savedFontHint") }}
                </Tooltip>
              </span>
              <FontSelect
                ref="readerFontSelect"
                :model-value="styleConfigs.fontStyle"
                :fallback-font-id="readerFallbackFontId"
                :website-fonts="readerWebsiteFonts"
                :aria-label="translate('reader.format.textFont')"
                @update:model-value="selectReaderFont"
                @update:fallback-font-id="selectReaderFallbackFont"
              />
            </div>
            <button
              v-if="controlsOnly"
              type="button"
              class="btn btn-ghost btn-sm xl:btn-md shrink-0 col-span-1 mb-0 mt-auto"
              :disabled="isLayoutDefault"
              @click="resetLayout"
            >
              <i class="ri-reset-left-line" aria-hidden="true"></i>
              {{ translate("reader.format.reset") }}
            </button>
            <label
              v-for="control in READER_TYPOGRAPHY_CONTROLS"
              :key="control.key"
              class="col-span-1 xl:col-span-2 md:my-1 min-w-0"
            >
              <span class="label block text-xs md:text-sm">
                {{ localizeText(control.shortLabel) }}
                {{ formatNumericValue(control) }}
              </span>
              <input
                type="range"
                :min="control.min"
                :max="control.max"
                :step="control.step"
                class="range range-xs xl:range-sm mt-1 w-full"
                :value="styleConfigs[control.key]"
                @input="
                  store.setStyle(control.key, Number($event.target.value))
                "
              />
            </label>
          </div>
          <template v-if="mobile">
            <fieldset class="mt-4">
              <legend class="label text-xs">
                {{ translate("reader.format.readingColors") }}
              </legend>
              <div class="mt-2 grid grid-cols-5 gap-2">
                <button
                  v-for="theme in MOBILE_READER_COLOR_THEMES"
                  :key="theme.value"
                  type="button"
                  class="btn btn-sm h-auto min-h-12 flex-col gap-0.5 px-1 py-1.5"
                  :class="{
                    'outline-2 outline-primary':
                      selectedColorTheme === theme.value,
                  }"
                  :data-theme="theme.value === 'site' ? undefined : theme.value"
                  @click="selectColorTheme(theme.value)"
                >
                  <i :class="theme.icon" aria-hidden="true"></i>
                  <span class="text-[0.625rem]">{{
                    localizeText(theme.label)
                  }}</span>
                </button>
              </div>
            </fieldset>
            <fieldset class="mt-4">
              <legend
                class="label text-xs w-full flex items-center justify-between"
              >
                <span>{{ translate("reader.format.customize") }}</span>
                <div
                  role="tablist"
                  class="tabs tabs-box tabs-xs"
                  :aria-label="translate('reader.format.backgroundType')"
                >
                  <button
                    v-for="option in backgroundTypeOptions"
                    :key="option.value"
                    type="button"
                    role="tab"
                    class="tab gap-1"
                    :class="{
                      'tab-active': selectedBackgroundType === option.value,
                    }"
                    :aria-selected="selectedBackgroundType === option.value"
                    @click="setBackgroundType(option.value)"
                  >
                    <i :class="option.icon" aria-hidden="true"></i>
                    {{ localizeText(option.label) }}
                  </button>
                </div>
              </legend>
              <div class="mt-2 w-full space-y-2">
                <div
                  v-if="selectedBackgroundType === 'color'"
                  class="mt-2 grid grid-cols-2 gap-2"
                >
                  <label
                    class="input input-sm flex w-full items-center justify-between gap-2"
                  >
                    <span class="text-xs">{{
                      translate("reader.format.textColor")
                    }}</span>
                    <input
                      type="color"
                      class="size-7 cursor-pointer border-0 bg-transparent p-0"
                      :value="styleConfigs.textColor || '#1f2937'"
                      @input="setCustomColor('textColor', $event.target.value)"
                    />
                  </label>
                  <label
                    class="input input-sm flex w-full items-center justify-between gap-2"
                  >
                    <span class="text-xs">{{
                      translate("reader.format.backgroundColor")
                    }}</span>
                    <input
                      type="color"
                      class="size-7 cursor-pointer border-0 bg-transparent p-0"
                      :value="styleConfigs.backgroundColor || '#ffffff'"
                      @input="
                        setCustomColor('backgroundColor', $event.target.value)
                      "
                    />
                  </label>
                </div>
                <div
                  v-if="selectedBackgroundType === 'image'"
                  class="grid grid-cols-4 gap-2"
                >
                  <button
                    v-for="image in READER_BACKGROUND_IMAGES"
                    :key="image.id"
                    type="button"
                    class="btn btn-sm relative overflow-hidden border-base-300 bg-cover bg-center p-1"
                    :class="{
                      'outline-2 outline-primary outline-offset-2':
                        styleConfigs.backgroundImage === image.id,
                    }"
                    :style="{
                      backgroundImage: formatCssBackgroundImage(
                        getReaderBackgroundImageUrl(image.id),
                      ),
                    }"
                    :aria-label="
                      translate('reader.format.chooseBackground', {
                        p0: localizeText(image.label),
                      })
                    "
                    :aria-pressed="styleConfigs.backgroundImage === image.id"
                    @click="selectBackgroundImage(image)"
                  >
                    <span
                      class="bg-transparent"
                      :data-theme="image?.colorTheme"
                      :style="image.textColor ? { color: image.textColor } : {}"
                    >
                      {{ localizeText(image.label) }}
                    </span>
                  </button>
                </div>
              </div>
            </fieldset>
          </template>
          <fieldset v-else class="mt-4">
            <legend class="label block text-xs md:text-sm">
              {{ translate("reader.format.siteTheme") }}
            </legend>
            <div class="mt-2 grid grid-cols-5 gap-2">
              <Tooltip as="button" trigger-class="inline-flex"
                v-for="theme in siteThemeOptions"
                :key="theme.value"
                type="button"
                class="btn btn-sm h-auto min-h-12 flex-col gap-0.5 px-1 py-1.5"
                :class="{
                  'outline-2 outline-primary':
                    selectedSiteTheme === theme.value,
                }"
                :data-theme="
                  theme.value === 'default' ? systemTheme : theme.value
                "
                :text="localizeText(theme.description)"
                :aria-label="
                  translate('reader.format.switchTheme', {
                    p0: localizeText(theme.label),
                    p1: localizeText(theme.description),
                  })
                "
                :aria-pressed="selectedSiteTheme === theme.value"
                @click="themeStore.setTheme(theme.value)"
              >
                <i :class="theme.icon" aria-hidden="true"></i>
                <span class="max-w-full truncate text-[0.625rem]">
                  {{ localizeText(theme.label) }}
                </span>
              </Tooltip>
            </div>
          </fieldset>
        </div>
      </ScrollableContainer>

      <FormatPresetBar
        :mobile="mobile"
        :system-theme="systemTheme"
        @apply="handlePresetApply"
      />
    </section>
  </client-only>
</template>

<script setup>
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import { usePreferredDark } from "@vueuse/core";

import Tooltip from "@/components/display/Tooltip.vue";
import ScrollableContainer from "@/components/layout/ScrollableContainer.vue";
import FontSelect from "@/components/interaction/controls/FontSelect.vue";
import FormatPresetBar from "@/components/reader/interaction/FormatPresetBar.vue";
import { useLocale } from "@/i18n";
import { useReaderStore } from "@/stores/reader";
import { useThemeStore } from "@/stores/theme";
import { readerTypographyMetrics } from "@/utils/reader/reader-typography";
import {
  formatCssBackgroundImage,
  getReaderSurfaceStyle,
  resolveReaderAppearance,
} from "@/utils/reader/reader-appearance";
import {
  FONTS,
  MOBILE_READING_MODE_OPTIONS,
  MOBILE_READER_COLOR_THEMES,
  getReaderBackgroundImage,
  getReaderBackgroundImageUrl,
  READER_BACKGROUND_IMAGES,
  READER_TYPOGRAPHY_CONTROLS,
  DEFAULT_READER_FALLBACK_FONT,
} from "@/constants/reader";

const props = defineProps({
  showHeader: {
    type: Boolean,
    default: true,
  },
  mobile: {
    type: Boolean,
    default: false,
  },
  controlsOnly: {
    type: Boolean,
    default: false,
  },
});

const { t: translate, text: localizeText } = useLocale();
const store = useReaderStore();
const themeStore = useThemeStore();
const {
  styleConfigs,
  mobileReadingMode,
  isMobileLayoutDefault,
  isReaderLayoutDefault,
} = storeToRefs(store);
const { theme: selectedSiteTheme, themeList: siteThemeList } =
  storeToRefs(themeStore);
const prefersDark = usePreferredDark();
const readerFontSelect = ref(null);
const readerFallbackFontId = ref(DEFAULT_READER_FALLBACK_FONT);
let readerFontRequestId = 0;

const readerWebsiteFonts = FONTS.map(({ name, style }) => ({
  id: style,
  label: name,
  style,
  cssVariable: `--${style}`,
  supportsFontWeight: ["font-sans", "font-serif", "font-kai"].includes(style),
}));
const backgroundTypeOptions = Object.freeze([
  {
    value: "color",
    get label() {
      return translate("reader.format.solidColor");
    },
    icon: "ri-palette-line",
  },
  {
    value: "image",
    get label() {
      return translate("reader.format.backgroundImage");
    },
    icon: "ri-image-line",
  },
]);

const systemTheme = computed(() => (prefersDark.value ? "forest" : "lemonade"));

const siteThemeOptions = computed(() => [
  {
    value: "default",
    get label() {
      return translate("reader.format.system");
    },
    get description() {
      return translate("reader.format.systemHint");
    },
    icon: "ri-contrast-line",
  },
  ...siteThemeList.value.map((theme) => ({
    ...theme,
    label: theme.name,
  })),
]);

const isLayoutDefault = computed(() =>
  props.mobile ? isMobileLayoutDefault.value : isReaderLayoutDefault.value,
);

const formatNumericValue = (control) => {
  const value = Number(styleConfigs.value[control.key]);
  const normalizedValue = Number.isFinite(value) ? value : control.default;
  const count = Number(normalizedValue.toFixed(control.places));
  return control.key === "paraHeight"
    ? translate("reader.settings.lineCount", { count }, count)
    : `${count} ${localizeText(control.unit)}`;
};

const readerAppearance = computed(() =>
  resolveReaderAppearance(styleConfigs.value),
);
const selectedColorTheme = computed(() => readerAppearance.value.colorTheme);
const selectedBackgroundType = computed(
  () => readerAppearance.value.backgroundType,
);
const previewTheme = computed(() => readerAppearance.value.semanticTheme);

const previewTypography = computed(() =>
  readerTypographyMetrics(styleConfigs.value),
);
const previewStyle = computed(() => ({
  ...(props.mobile
    ? getReaderSurfaceStyle(styleConfigs.value, {
        fallbackTextColor: "var(--color-base-content)",
        alwaysApplyBackgroundImageProps: true,
      })
    : {}),
  fontFamily: styleConfigs.value.fontFamily || undefined,
  fontSize: `${previewTypography.value.fontSize}px`,
  letterSpacing: previewTypography.value.letterSpacing,
  lineHeight: previewTypography.value.lineHeight,
  "--para-text-indent": previewTypography.value.textIndent,
}));
const previewParagraphGap = computed(
  () => `${previewTypography.value.paragraphGap}px`,
);

const handlePresetApply = (preset) => {
  if (preset?.styles?.fontStyle !== undefined) readerFontRequestId += 1;
};

const resetLayout = () => {
  readerFallbackFontId.value = DEFAULT_READER_FALLBACK_FONT;
  readerFontRequestId += 1;
  store.resetReaderLayout({ mobile: props.mobile });
};
const selectReaderFont = async (fontId) => {
  const requestId = ++readerFontRequestId;
  const websiteFont = readerWebsiteFonts.some(({ id }) => id === fontId);
  if (websiteFont) {
    store.setReaderFont(fontId);
    if (readerFallbackFontId.value === DEFAULT_READER_FALLBACK_FONT) return;
  }

  try {
    const resolved = await readerFontSelect.value?.resolveFont(
      fontId,
      translate("reader.format.previewTitle"),
      "normal",
      readerFallbackFontId.value,
    );
    if (requestId !== readerFontRequestId || !resolved?.family) return;
    store.setReaderFont(fontId, resolved.family);
  } catch {
    // 网站字体仍可通过原有 class 生效；自定义字体由选择器反馈加载错误。
  }
};
const selectReaderFallbackFont = (fontId) => {
  readerFallbackFontId.value = fontId;
  void selectReaderFont(styleConfigs.value.fontStyle);
};
const selectColorTheme = (theme) => {
  store.setStyle("colorTheme", theme);
  if (theme === "custom") return;

  store.resetStyle("textColor");
  store.resetStyle("backgroundColor");
  store.resetStyle("backgroundType");
  store.resetStyle("backgroundImage");
};
const setCustomColor = (key, value) => {
  store.setStyle("colorTheme", "custom");
  if (key === "backgroundColor") {
    store.setStyle("backgroundType", "color");
    store.resetStyle("backgroundImage");
  }
  store.setStyle(key, value);
};
const selectBackgroundImage = (image) => {
  store.setStyle("colorTheme", "custom");
  store.setStyle("backgroundType", "image");
  store.setStyle("backgroundImage", image.id);
  store.resetStyle("backgroundColor");
  if (image.textColor) {
    store.setStyle("textColor", image.textColor);
  } else {
    store.resetStyle("textColor");
  }
};
const setBackgroundType = (type) => {
  store.setStyle("colorTheme", "custom");
  store.setStyle("backgroundType", type);
  if (type === "color") {
    store.resetStyle("backgroundImage");
    return;
  }

  const selectedImage =
    getReaderBackgroundImage(styleConfigs.value.backgroundImage) ||
    READER_BACKGROUND_IMAGES[0];
  if (selectedImage) selectBackgroundImage(selectedImage);
};
</script>
