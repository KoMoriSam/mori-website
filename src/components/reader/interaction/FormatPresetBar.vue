<template>
  <footer
    class="shrink-0 border-t border-base-300 px-3 pt-2"
    :class="
      mobile ? 'pb-[max(0.75rem,env(safe-area-inset-bottom))]' : 'pb-3'
    "
  >
    <ScrollableContainer>
      <div
        class="flex gap-3 overflow-x-auto px-1 py-1.5 scrollbar-thin"
        :aria-label="translate('reader.format.presetsHint')"
      >
        <Tooltip
          v-for="{ preset, label } in systemPresets"
          :key="preset.id"
          as="button"
          trigger-class="inline-flex"
          type="button"
          class="btn btn-circle shrink-0 flex-col gap-1 border-base-300 size-12 p-1 leading-tight shadow-sm"
          :class="[
            preset.styles.fontStyle,
            mobile ? '' : presetSiteTheme(preset) ? 'bg-base-100' : '',
            {
              'btn-active outline-2 outline-primary outline-offset-2':
                isPresetActive(preset),
            },
          ]"
          :data-theme="
            (mobile ? presetTheme(preset) : presetDisplayTheme(preset)) ||
            undefined
          "
          :style="presetSampleStyle(preset)"
          :text="localizeText(preset.description)"
          :aria-label="
            translate('reader.format.applyDefaultPreset', {
              p0: localizeText(preset.name),
              p1: localizeText(preset.description),
            })
          "
          :aria-pressed="isPresetActive(preset)"
          @click="applyPreset(preset)"
        >
          <span class="font-sans text-[0.5rem]">{{ label }}</span>
          <span class="max-w-11 truncate text-[0.75rem]">
            {{ localizeText(preset.name) }}
          </span>
        </Tooltip>
        <div
          v-for="preset in readerLayoutPresets"
          :key="preset.id"
          class="relative shrink-0"
        >
          <Tooltip
            overflow-only
            as="button"
            trigger-class="inline-flex"
            type="button"
            class="min-w-0 btn btn-circle size-12 border-base-300 p-1 text-[0.625rem] leading-tight shadow-sm"
            :class="[
              preset.styles.fontStyle,
              mobile ? '' : presetSiteTheme(preset) ? 'bg-base-100' : '',
              {
                'btn-active outline-2 outline-primary outline-offset-2':
                  isPresetActive(preset),
              },
            ]"
            :data-theme="
              (mobile ? presetTheme(preset) : presetDisplayTheme(preset)) ||
              undefined
            "
            :style="presetSampleStyle(preset)"
            :text="localizeText(preset.name)"
            :aria-label="
              translate('reader.format.applySavedPreset', {
                p0: localizeText(preset.name),
              })
            "
            :aria-pressed="isPresetActive(preset)"
            @click="applyPreset(preset)"
          >
            <span class="line-clamp-2 max-w-11 whitespace-normal break-all">
              {{ localizeText(preset.name) }}
            </span>
          </Tooltip>
          <button
            type="button"
            class="btn btn-circle btn-xs absolute -right-1 -top-1 size-5 min-h-0 border-base-300 bg-base-100 p-0 shadow-sm"
            :aria-label="
              translate('reader.format.deletePreset', {
                p0: localizeText(preset.name),
              })
            "
            @click="store.removeReaderLayoutPreset(preset.id)"
          >
            <i class="ri-close-line" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    </ScrollableContainer>

    <form class="join mt-1 flex" @submit.prevent="savePreset">
      <input
        v-model="presetName"
        class="input input-sm join-item min-w-0 flex-1"
        maxlength="24"
        :placeholder="translate('reader.format.savePreset')"
        :aria-label="translate('reader.format.presetName')"
      />
      <button class="btn btn-sm join-item" type="submit">
        {{ translate("reader.format.save") }}
      </button>
    </form>
  </footer>
</template>

<script setup>
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";

import Tooltip from "@/components/display/Tooltip.vue";
import ScrollableContainer from "@/components/layout/ScrollableContainer.vue";
import { useLocale } from "@/i18n";
import { useReaderStore } from "@/stores/reader";
import { useThemeStore } from "@/stores/theme";
import {
  READER_LAYOUT_STYLE_KEYS,
  READER_STYLE_DEFAULTS,
  READER_SYSTEM_PRESETS,
  STYLE_CONFIG_KEYS,
  getReaderPresetAppearance,
} from "@/constants/reader";
import {
  getReaderSurfaceStyle,
  resolveReaderAppearance,
} from "@/utils/reader/reader-appearance";

const props = defineProps({
  mobile: {
    type: Boolean,
    default: false,
  },
  systemTheme: {
    type: String,
    required: true,
  },
});

const emit = defineEmits(["apply"]);

const { t: translate, text: localizeText } = useLocale();
const store = useReaderStore();
const themeStore = useThemeStore();
const { styleConfigs, mobileReadingMode, readerLayoutPresets } =
  storeToRefs(store);
const { theme: selectedSiteTheme, themeList: siteThemeList } =
  storeToRefs(themeStore);

const presetName = ref("");

const systemPresets = computed(() =>
  READER_SYSTEM_PRESETS.map((preset, index) => ({
    preset,
    get label() {
      return translate("reader.format.preset", { p0: index + 1 });
    },
  })),
);

const presetTheme = (preset) =>
  resolveReaderAppearance(preset?.styles).semanticTheme;

const presetSiteTheme = (preset) => {
  const appearance = resolveReaderAppearance(preset?.styles);
  const theme = appearance.semanticTheme || preset?.styles?.colorTheme;
  if (theme === "site") return "default";
  return siteThemeList.value.some(({ value }) => value === theme) ? theme : "";
};

const presetDisplayTheme = (preset) => {
  const theme = presetSiteTheme(preset);
  return theme === "default" ? props.systemTheme : theme;
};

const presetSampleStyle = (preset) => {
  const sample = {
    letterSpacing: `${(preset?.styles?.fontGap ?? READER_STYLE_DEFAULTS.fontGap) * 0.125}rem`,
  };
  if (!props.mobile) return sample;

  return {
    ...sample,
    ...getReaderSurfaceStyle(preset?.styles, {
      fallbackTextColor: "var(--color-base-content)",
      alwaysApplyBackgroundImageProps: true,
    }),
  };
};

const isPresetActive = (preset) => {
  const appearance = getReaderPresetAppearance(preset?.styles);
  const expectedStyles = { ...preset?.styles, ...appearance };
  const includesMobileAppearance = Object.hasOwn(appearance, "colorTheme");
  const comparedKeys =
    props.mobile && includesMobileAppearance
      ? STYLE_CONFIG_KEYS.map(({ key }) => key)
      : READER_LAYOUT_STYLE_KEYS;
  const modeMatches =
    !props.mobile ||
    preset?.mode === undefined ||
    preset.mode === mobileReadingMode.value;
  const siteTheme = presetSiteTheme(preset);
  const siteThemeMatches =
    props.mobile || !siteTheme || selectedSiteTheme.value === siteTheme;

  return (
    modeMatches &&
    siteThemeMatches &&
    comparedKeys.every((key) => {
      const defaultValue = READER_STYLE_DEFAULTS[key];
      const expected = expectedStyles[key];
      if (expected === undefined) return false;
      return typeof defaultValue === "number"
        ? Number(styleConfigs.value[key]) === Number(expected)
        : Object.is(styleConfigs.value[key], expected);
    })
  );
};

const applyPreset = (preset) => {
  emit("apply", preset);
  store.applyReaderLayoutPreset(preset, { mobile: props.mobile });
  if (props.mobile) return;

  const siteTheme = presetSiteTheme(preset);
  if (siteTheme) themeStore.setTheme(siteTheme);
};

const savePreset = () => {
  if (store.saveReaderLayoutPreset(presetName.value, { mobile: props.mobile })) {
    presetName.value = "";
  }
};
</script>
