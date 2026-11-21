import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { useLocale } from "@/i18n";
import { useToast } from "@/composables/useToast";
import {
  localFontFamilySupportsWeight,
  localizeKnownFontFamily,
  quoteFontFamily,
  readLocalFontFaceWeight,
  readLocalizedFontFamilyBlob,
  shouldAvoidLocalFontPreview,
  stripLocalFontStyleSuffix,
} from "@/utils/font-name";

const LOCAL_FONT_BATCH_SIZE = 256;
const LOADING_INDICATOR_DELAY = 180;
const LOADING_INDICATOR_MIN_DURATION = 240;
const HAN_TEXT_PATTERN = /[\u3400-\u9fff\uf900-\ufaff]/u;

function waitForPaint() {
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );
}

export function useLocalFonts({
  componentId,
  getModelValue,
  getWebsiteFonts,
  getEffectiveFallbackFontId,
  getPreview,
  getLocalFontFilter,
  getProbeLocalFonts,
  getCssFontMatcher,
  onBatchLoaded,
}) {
  const { t: translate } = useLocale();
  const toast = useToast();

  const localFonts = shallowRef([]);
  const uploadedFonts = ref([]);
  const supportsLocalFontAccess = ref(false);
  const isReadingLocalFonts = ref(false);
  const isLoadingMoreLocalFonts = ref(false);
  const showLocalFontLoading = ref(false);
  const localFontLoadingPhase = ref(null);
  const isUploadingFont = ref(false);
  const hasReadLocalFonts = ref(false);
  const pendingLocalFontCount = ref(0);
  const totalLocalFontCount = ref(0);

  let pendingLocalFonts = [];
  let uploadedFontId = 0;
  let loadedFontFamilyId = 0;
  let localFontLoadingDelayTimer = 0;
  let localFontLoadingHideTimer = 0;
  let localFontLoadingShownAt = 0;
  let localFontStyle = null;

  const customFontSources = new Map();
  const localFontFamilies = new Map();
  const registeredCssLocalFonts = new Map();
  const localFontSources = new Map();
  const registeredLocalFonts = new Set();
  const loadedFontFaces = new Map();
  const pendingFontLoads = new Map();

  const isLocalFontLoading = computed(
    () => isReadingLocalFonts.value || isLoadingMoreLocalFonts.value,
  );

  const localFontActionLabel = computed(() => {
    if (!supportsLocalFontAccess.value) {
      return translate("common.fontSelect.deviceUnsupported");
    }
    if (showLocalFontLoading.value && localFontLoadingPhase.value === "initial") {
      return translate("common.fontSelect.readingDevice");
    }
    if (isReadingLocalFonts.value) {
      return translate("common.fontSelect.readDevice");
    }
    if (pendingLocalFontCount.value) {
      return translate("common.fontSelect.loadProgress", {
        p0: localFonts.value.length,
        p1: totalLocalFontCount.value,
      });
    }
    if (localFonts.value.length) {
      return translate("common.fontSelect.deviceLoaded", {
        p0: localFonts.value.length,
      });
    }
    if (hasReadLocalFonts.value) {
      return translate("common.fontSelect.noDeviceFonts");
    }
    return translate("common.fontSelect.readDevice");
  });

  function updateLocalFontLoadingIndicator(loading) {
    clearTimeout(localFontLoadingDelayTimer);
    clearTimeout(localFontLoadingHideTimer);
    if (loading) {
      if (showLocalFontLoading.value) return;
      localFontLoadingDelayTimer = setTimeout(() => {
        localFontLoadingShownAt = performance.now();
        showLocalFontLoading.value = true;
      }, LOADING_INDICATOR_DELAY);
      return;
    }
    if (!showLocalFontLoading.value) {
      localFontLoadingPhase.value = null;
      return;
    }
    const elapsed = performance.now() - localFontLoadingShownAt;
    localFontLoadingHideTimer = setTimeout(
      () => {
        showLocalFontLoading.value = false;
        localFontLoadingPhase.value = null;
      },
      Math.max(0, LOADING_INDICATOR_MIN_DURATION - elapsed),
    );
  }

  watch(isLocalFontLoading, updateLocalFontLoadingIndicator, {
    flush: "sync",
  });

  onMounted(() => {
    supportsLocalFontAccess.value =
      window.isSecureContext && typeof window.queryLocalFonts === "function";
  });

  onBeforeUnmount(() => {
    clearTimeout(localFontLoadingDelayTimer);
    clearTimeout(localFontLoadingHideTimer);
    for (const { face } of loadedFontFaces.values()) {
      document.fonts?.delete(face);
    }
    localFontStyle?.remove();
  });

  function getPendingLocalFontEntries() {
    return pendingLocalFonts.map(({ entry }) => entry);
  }

  async function uploadFontFile(file) {
    const id = `upload:${++uploadedFontId}`;
    const preview = getPreview?.();
    const entry = {
      id,
      label: file.name.replace(/\.[^.]+$/, "") || file.name,
      supportsFontWeight: false,
      previewText: preview?.text || "",
      previewLanguage: preview?.language || "",
    };
    customFontSources.set(id, file);
    isUploadingFont.value = true;
    try {
      entry.fontFamily = await loadCustomFont(id);
      uploadedFonts.value.unshift(entry);
      return id;
    } catch (error) {
      customFontSources.delete(id);
      toast.error(
        `${file.name}：${error instanceof Error ? error.message : translate("common.fontSelect.loadFailed")}`,
      );
      return null;
    } finally {
      isUploadingFont.value = false;
    }
  }

  async function readLocalFonts() {
    if (
      !supportsLocalFontAccess.value ||
      isReadingLocalFonts.value ||
      isLoadingMoreLocalFonts.value ||
      hasReadLocalFonts.value
    ) {
      return;
    }
    localFontLoadingPhase.value = "initial";
    isReadingLocalFonts.value = true;
    try {
      const fonts = await window.queryLocalFonts();
      hasReadLocalFonts.value = true;
      const uniqueFonts = new Map();
      const nextLocalFontFamilies = new Map();
      const matchCssFont = getCssFontMatcher?.()?.() || null;
      registeredCssLocalFonts.clear();

      const probe = getProbeLocalFonts?.();
      const readableFonts = probe
        ? [...fonts, ...(await probe(fonts))]
        : fonts;

      const filter = getLocalFontFilter?.();
      const availableFonts = filter ? filter(readableFonts) : readableFonts;
      const preview = getPreview?.();

      for (const font of availableFonts) {
        const family =
          font.family ||
          font.fullName ||
          font.postscriptName ||
          translate("common.fontSelect.unnamed");
        const sourceKey = family.toLocaleLowerCase();
        const existing = uniqueFonts.get(sourceKey);
        if (existing) {
          existing.faces.push(font);
          continue;
        }
        const id = `local:${encodeURIComponent(sourceKey)}`;
        const registeredCssFont = matchCssFont ? matchCssFont(family) : null;
        const fontFamily = quoteFontFamily(
          `Mori Device Font ${componentId} ${uniqueFonts.size}`,
        );
        const metadataLabel = [font.family, font.fullName].find((name) =>
          HAN_TEXT_PATTERN.test(name || ""),
        );
        const fallbackLabel =
          metadataLabel || localizeKnownFontFamily(family) || family;
        const avoidPreview = shouldAvoidLocalFontPreview(font);
        nextLocalFontFamilies.set(id, fontFamily);
        if (registeredCssFont) {
          registeredCssLocalFonts.set(id, {
            family: quoteFontFamily(registeredCssFont.family),
            inputFallbackFamily: registeredCssFont.sizeAdjust
              ? quoteFontFamily(
                  `Mori Device Input Font ${componentId} ${uniqueFonts.size}`,
                )
              : fontFamily,
            sizeAdjust: registeredCssFont.sizeAdjust,
          });
        }
        uniqueFonts.set(sourceKey, {
          faces: [font],
          entry: {
            id,
            label: stripLocalFontStyleSuffix(fallbackLabel, font),
            fontFamily,
            previewFontFamily: avoidPreview ? null : fontFamily,
            previewText:
              preview?.alwaysShowLocal || !avoidPreview
                ? preview?.text || ""
                : "",
            previewLanguage: preview?.language || "",
          },
        });
      }

      const nextLocalFonts = [...uniqueFonts.values()].map(
        ({ entry, faces }) => ({
          entry: {
            ...entry,
            supportsFontWeight: localFontFamilySupportsWeight(faces),
          },
        }),
      );
      if (!filter) {
        nextLocalFonts.sort((a, b) =>
          a.entry.label.localeCompare(b.entry.label),
        );
      }
      localFontFamilies.clear();
      localFontSources.clear();
      for (const { entry, faces } of uniqueFonts.values()) {
        localFontSources.set(entry.id, faces);
      }
      for (const { entry } of nextLocalFonts) {
        localFontFamilies.set(entry.id, nextLocalFontFamilies.get(entry.id));
      }
      localFonts.value = [];
      pendingLocalFonts = nextLocalFonts;
      pendingLocalFontCount.value = nextLocalFonts.length;
      totalLocalFontCount.value = nextLocalFonts.length;
      await loadMoreLocalFonts();
      if (totalLocalFontCount.value) {
        toast.success(
          translate("common.fontSelect.deviceLoaded", {
            p0: totalLocalFontCount.value,
          }),
        );
      } else {
        toast.info(translate("common.fontSelect.noUsableFonts"));
      }
    } catch (error) {
      if (error?.name === "NotAllowedError") {
        toast.warning(translate("common.fontSelect.accessDenied"));
      } else {
        toast.error(
          error instanceof Error
            ? error.message
            : translate("common.fontSelect.readFailed"),
        );
      }
    } finally {
      isReadingLocalFonts.value = false;
    }
  }

  async function loadMoreLocalFonts() {
    if (isLoadingMoreLocalFonts.value || !pendingLocalFonts.length) return;
    if (!isReadingLocalFonts.value) localFontLoadingPhase.value = "more";
    isLoadingMoreLocalFonts.value = true;
    const batch = pendingLocalFonts.slice(0, LOCAL_FONT_BATCH_SIZE);
    try {
      await waitForPaint();
      pendingLocalFonts = pendingLocalFonts.slice(batch.length);
      pendingLocalFontCount.value = pendingLocalFonts.length;
      localFonts.value = [
        ...localFonts.value,
        ...batch.map(({ entry }) => entry),
      ];
      await nextTick();
      onBatchLoaded?.();
      await waitForPaint();
    } finally {
      isLoadingMoreLocalFonts.value = false;
    }
  }

  function ensureLocalFontAlias(fontId) {
    if (registeredLocalFonts.has(fontId)) return;
    const family = localFontFamilies.get(fontId);
    const faces = localFontSources.get(fontId);
    const registeredCssFont = registeredCssLocalFonts.get(fontId);
    if (!family || !faces?.length) return;
    if (!localFontStyle) {
      localFontStyle = document.createElement("style");
      document.head.append(localFontStyle);
    }
    for (const face of faces) {
      const names = [
        ...new Set([face.postscriptName, face.fullName].filter(Boolean)),
      ];
      if (!names.length && face.family) names.push(face.family);
      if (!names.length) continue;
      const sources = names.map((name) => `local(${quoteFontFamily(name)})`);
      const style = /\bitalic\b/i.test(face.style || "")
        ? "italic"
        : /\boblique\b/i.test(face.style || "")
          ? "oblique"
          : "normal";
      const weight = /\b(?:variable|wght)\b/i.test(face.style || "")
        ? "100 900"
        : readLocalFontFaceWeight(face.style) || 400;
      localFontStyle.sheet?.insertRule(
        `@font-face { font-family: ${family}; src: ${sources.join(", ")}; font-style: ${style}; font-weight: ${weight}; }`,
      );
      if (registeredCssFont?.sizeAdjust) {
        localFontStyle.sheet?.insertRule(
          `@font-face { font-family: ${registeredCssFont.inputFallbackFamily}; src: ${sources.join(", ")}; font-style: ${style}; font-weight: ${weight}; size-adjust: ${registeredCssFont.sizeAdjust}; }`,
        );
      }
    }
    registeredLocalFonts.add(fontId);
  }

  async function loadCustomFont(id) {
    const loaded = loadedFontFaces.get(id);
    if (loaded) return quoteFontFamily(loaded.family);
    const pending = pendingFontLoads.get(id);
    if (pending) return pending;
    const promise = (async () => {
      const source = customFontSources.get(id);
      if (!(source instanceof Blob)) {
        throw new Error(translate("common.fontSelect.customUnavailable"));
      }
      const family = `Mori Custom Font ${++loadedFontFamilyId}`;
      const face = new FontFace(family, await source.arrayBuffer());
      await face.load();
      document.fonts.add(face);
      loadedFontFaces.set(id, { face, family });
      return quoteFontFamily(family);
    })();
    pendingFontLoads.set(id, promise);
    try {
      return await promise;
    } finally {
      pendingFontLoads.delete(id);
    }
  }

  async function resolveFontFamily(fontId = getModelValue(), _text = "") {
    const websiteFont = getWebsiteFonts().find(({ id }) => id === fontId);
    if (websiteFont) {
      if (websiteFont.inputFontFamily) return websiteFont.inputFontFamily;
      const family = getComputedStyle(document.documentElement)
        .getPropertyValue(websiteFont.cssVariable)
        .trim();
      return family || "sans-serif";
    }
    const localFontFamily = localFontFamilies.get(fontId);
    if (localFontFamily) {
      ensureLocalFontAlias(fontId);
      const registeredCssFont = registeredCssLocalFonts.get(fontId);
      return registeredCssFont
        ? `${registeredCssFont.family}, ${registeredCssFont.inputFallbackFamily}`
        : localFontFamily;
    }
    return loadCustomFont(fontId);
  }

  function findFontEntry(fontId) {
    return (
      uploadedFonts.value.find(({ id }) => id === fontId) ||
      getWebsiteFonts().find(({ id }) => id === fontId) ||
      localFonts.value.find(({ id }) => id === fontId) ||
      null
    );
  }

  async function resolveFont(
    fontId = getModelValue(),
    text = "",
    requestedWeight = "normal",
    fallbackFontId = getEffectiveFallbackFontId(),
    fallbackFamily = "",
  ) {
    const primaryFamily = await resolveFontFamily(fontId, text);
    const secondaryFallbackFamily =
      fallbackFontId && fallbackFontId !== fontId
        ? await resolveFontFamily(fallbackFontId, text)
        : "";
    const family = [primaryFamily, fallbackFamily, secondaryFallbackFamily]
      .filter(Boolean)
      .join(", ");
    const font = findFontEntry(fontId);
    const weight = font?.supportsFontWeight ? requestedWeight : "normal";
    try {
      await document.fonts?.load(
        `${weight} 200px ${family}`,
        text || translate("common.fontSelect.font"),
      );
    } catch {
      // Consumers can continue through the font stack's fallbacks.
    }
    return {
      family,
      weight,
      sourceFamily: localFontSources.get(fontId)?.[0]?.family || "",
      usesRegisteredCssFont: registeredCssLocalFonts.has(fontId),
    };
  }

  async function selectedDocumentFontInfo() {
    const fontId = getModelValue();
    const source = customFontSources.get(fontId);
    const family =
      (source && (await readLocalizedFontFamilyBlob(source, ["en-US"]))) ||
      localFontSources.get(fontId)?.[0]?.family ||
      findFontEntry(fontId)?.label ||
      "";
    return { family };
  }

  return {
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
  };
}
