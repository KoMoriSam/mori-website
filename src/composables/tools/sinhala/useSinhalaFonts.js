import { onBeforeUnmount, reactive, watch } from "vue";
import { useLocale } from "@/i18n";
import {
  stripCssFontQuotes,
  walkDocumentStyleRules,
} from "@/utils/dom/stylesheets";
import { unicodeToFm } from "@/utils/sinhala/converter";
import {
  SINHALA_UNICODE_FALLBACK_FAMILY,
  isFmAbabldFont,
} from "@/utils/sinhala/font-catalog";

const CORRESPONDING_LEGACY_FONT_IDS = {
  abhaya: "abhaya-legacy",
  gemunu: "gemunu-legacy",
};
const CORRESPONDING_UNICODE_FONT_IDS = {
  "abhaya-legacy": "abhaya",
  "gemunu-legacy": "gemunu",
};
const FONT_SIZE_SAMPLE = "සිංහල අකුරු";
const LEGACY_FONT_SIZE_SAMPLE = unicodeToFm(FONT_SIZE_SAMPLE);
const localFontScaleCache = new Map();

function registeredFontScale(family) {
  const target = family.trim().toLocaleLowerCase();
  let matchedScale = null;
  walkDocumentStyleRules((rule) => {
    if (rule.type !== CSSRule.FONT_FACE_RULE) return;
    const name = stripCssFontQuotes(
      rule.style.getPropertyValue("font-family"),
    ).toLocaleLowerCase();
    const scale = Number.parseFloat(rule.style.getPropertyValue("size-adjust"));
    if (name === target && Number.isFinite(scale) && scale > 0) {
      matchedScale = scale / 100;
      return false;
    }
  });
  return matchedScale;
}

async function localFontScale(fontId, font, referenceFamily, sample) {
  if (!font.sourceFamily || font.usesRegisteredCssFont) return 1;
  const registered = registeredFontScale(font.sourceFamily);
  if (registered) return registered;
  const key = `${fontId}:${referenceFamily}`;
  if (!localFontScaleCache.has(key)) {
    localFontScaleCache.set(
      key,
      (async () => {
        await Promise.all([
          document.fonts.load(`100px ${font.family}`, sample),
          document.fonts.load(`100px "${referenceFamily}"`, sample),
        ]);
        const context = document.createElement("canvas").getContext("2d");
        if (!context) return 1;
        context.font = `100px "${referenceFamily}"`;
        const reference = context.measureText(sample);
        context.font = `100px ${font.family}`;
        const selected = context.measureText(sample);
        const referenceHeight =
          reference.actualBoundingBoxAscent +
          reference.actualBoundingBoxDescent;
        const selectedHeight =
          selected.actualBoundingBoxAscent + selected.actualBoundingBoxDescent;
        if (!referenceHeight || !selectedHeight) return 1;
        const scale = Math.max(
          0.75,
          Math.min(1.8, referenceHeight / selectedHeight),
        );
        return /^UN[-_\s]+/iu.test(font.sourceFamily)
          ? Math.min(1.4, scale * 0.9)
          : scale;
      })().catch(() => 1),
    );
  }
  return localFontScaleCache.get(key);
}

export function useSinhalaFonts({
  unicodePaneRef,
  legacyPaneRef,
  unicodeText,
  fmText,
  onLayoutChange,
  announce,
}) {
  const { t: translate } = useLocale();

  const unicodeFont = reactive({
    id: "abhaya",
    fallbackId: "abhaya",
    family: "var(--font-abhaya)",
    previewSize: "",
    bold: false,
  });

  const legacyFont = reactive({
    id: "abhaya-legacy",
    fallbackId: "abhaya-legacy",
    family: "var(--font-abhaya-legacy)",
    nonSinhalaFontFamily: '"STIX Two Text for Abhaya", serif',
    nonSinhalaBold: false,
    previewSize: "100%",
    bold: false,
  });

  let unicodeFontRequest = 0;
  let legacyFontRequest = 0;
  let unicodeFontManuallySelected = false;
  let legacyFontManuallySelected = false;

  function onUnicodeFontSelected(fontId) {
    unicodeFontManuallySelected = true;
    if (!legacyFontManuallySelected && CORRESPONDING_LEGACY_FONT_IDS[fontId]) {
      legacyFont.id = CORRESPONDING_LEGACY_FONT_IDS[fontId];
    }
  }

  function onLegacyFontSelected(fontId) {
    legacyFontManuallySelected = true;
    if (
      !unicodeFontManuallySelected &&
      CORRESPONDING_UNICODE_FONT_IDS[fontId]
    ) {
      unicodeFont.id = CORRESPONDING_UNICODE_FONT_IDS[fontId];
    }
  }

  function toggleUnicodeBold() {
    unicodeFont.bold = !unicodeFont.bold;
    onLayoutChange();
  }

  function toggleLegacyBold() {
    legacyFont.bold = !legacyFont.bold;
    onLayoutChange();
  }

  watch(
    [
      () => unicodeFont.id,
      () => unicodeFont.fallbackId,
      () => unicodeFont.bold,
    ],
    async ([fontId, fallbackFontId, bold]) => {
      const request = ++unicodeFontRequest;
      try {
        const font = await unicodePaneRef.value?.resolveFont(
          fontId,
          unicodeText.value,
          bold ? "bold" : "normal",
          fallbackFontId,
          SINHALA_UNICODE_FALLBACK_FAMILY,
        );
        if (request !== unicodeFontRequest || !font) return;
        const scale = await localFontScale(
          fontId,
          font,
          "Abhaya Libre",
          FONT_SIZE_SAMPLE,
        );
        if (request !== unicodeFontRequest) return;
        unicodeFont.family = font.family;
        unicodeFont.previewSize = font.sourceFamily
          ? `calc(1.125rem * ${scale})`
          : "";
        onLayoutChange();
      } catch {
        if (request === unicodeFontRequest) {
          announce(translate("sinhala.unicodeFontFailed"));
        }
      }
    },
  );

  watch(
    [() => legacyFont.id, () => legacyFont.fallbackId],
    async ([fontId, fallbackFontId]) => {
      const request = ++legacyFontRequest;
      try {
        const font = await legacyPaneRef.value?.resolveFont(
          fontId,
          fmText.value,
          "normal",
          fallbackFontId,
        );
        if (request !== legacyFontRequest || !font) return;
        const scale = await localFontScale(
          fontId,
          font,
          "Abhaya Legacy",
          LEGACY_FONT_SIZE_SAMPLE,
        );
        if (request !== legacyFontRequest) return;
        legacyFont.family = font.family;
        const selectedFontName =
          font.sourceFamily ||
          (await legacyPaneRef.value?.selectedDocumentFontInfo())?.family ||
          "";
        if (request !== legacyFontRequest) return;
        legacyFont.nonSinhalaBold = isFmAbabldFont(selectedFontName);
        legacyFont.nonSinhalaFontFamily =
          fontId === "abhaya-legacy" ||
          /^fm[\s_-]*(?:abhaya|abbaya|aba)/iu.test(selectedFontName)
            ? '"STIX Two Text for Abhaya", serif'
            : fontId === "gemunu-legacy" ||
                /^fm[\s_-]*gemunu/iu.test(selectedFontName)
              ? '"Gemunu Libre", sans-serif'
              : "var(--font-sans)";
        legacyFont.previewSize = font.sourceFamily
          ? `${Math.round(scale * 100)}%`
          : fontId.startsWith("upload:")
            ? "125%"
            : "100%";
        onLayoutChange();
      } catch {
        if (request === legacyFontRequest) {
          announce(translate("sinhala.fontFailed"));
        }
      }
    },
  );

  async function resolveLegacyDocumentFontPair() {
    if (legacyFont.id === "abhaya-legacy") {
      return {
        sinhala: legacyFont.bold ? "FMAbabld" : "FMAbhaya",
        other: "Times New Roman",
        otherBold: false,
      };
    }
    if (legacyFont.id === "gemunu-legacy") {
      return { sinhala: "FMGemunu", other: "Arial", otherBold: false };
    }
    const selected = await legacyPaneRef.value?.selectedDocumentFontInfo();
    const sinhala = selected?.family || "FMAbhaya";
    const isAbabld = isFmAbabldFont(sinhala);
    return {
      sinhala,
      other: /abhaya/iu.test(sinhala) || isAbabld ? "Times New Roman" : "Arial",
      otherBold: isAbabld,
    };
  }

  onBeforeUnmount(() => {
    unicodeFontRequest++;
    legacyFontRequest++;
  });

  return {
    unicodeFont,
    legacyFont,
    onUnicodeFontSelected,
    onLegacyFontSelected,
    toggleUnicodeBold,
    toggleLegacyBold,
    resolveLegacyDocumentFontPair,
  };
}
