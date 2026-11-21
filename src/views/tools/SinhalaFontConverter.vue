<template>
  <ContentPage
    :title="translate('sinhala.title')"
    :metas-label="translate('tools.info')"
  >
    <template #meta>
      <span class="inline-flex items-center gap-1.5">
        <i class="ri-repeat-2-line" aria-hidden="true"></i>
        {{ translate("sinhala.directions") }}
      </span>
      <span class="inline-flex items-center gap-1.5">
        <i class="ri-device-line" aria-hidden="true"></i>
        {{ translate("common.localOnly") }}
      </span>
    </template>
    <template #actions>
      <div role="tablist" class="tabs tabs-box w-fit">
        <button
          type="button"
          role="tab"
          class="tab gap-1"
          :class="{ 'tab-active': inputMode === 'text' }"
          :aria-selected="inputMode === 'text'"
          @click="inputMode = 'text'"
        >
          <i class="ri-t-box-line" aria-hidden="true"></i>
          {{ translate("common.text") }}
        </button>
        <button
          type="button"
          role="tab"
          class="tab gap-1"
          :class="{ 'tab-active': inputMode === 'document' }"
          :aria-selected="inputMode === 'document'"
          @click="inputMode = 'document'"
        >
          <i class="ri-file-text-line" aria-hidden="true"></i>
          {{ translate("common.documents") }}
        </button>
      </div>
    </template>

    <section>
      <DocumentDropzone
        v-if="inputMode === 'document'"
        v-model:pdf-automatic="documentPdfAutomatic"
        v-model:pdf-selected-format="documentPdfSelectedFormat"
        :is-direction-reversed="isDirectionReversed"
        :document="documentView"
        @swap="swapPanels"
        @select-file="setDocumentFile"
        @convert="convertUploadedDocument"
      />

      <div
        v-show="inputMode === 'text'"
        class="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-x-2"
      >
        <ConversionPane
          ref="unicodePaneRef"
          side="unicode"
          :is-input="!isDirectionReversed"
          :font="unicodeFont"
          :character-count="unicodeText.length"
          :has-text="hasText"
          :clipboard-status="clipboardStatusFor('unicode')"
          :downloading="downloadingField === 'unicode'"
          :encoding-suggestion="encodingSuggestion"
          @select-font="onUnicodeFontSelected"
          @toggle-bold="toggleUnicodeBold"
          @scroll="syncTextScroll('unicode')"
          @clear="clearText"
          @copy="handleCopy('unicode')"
          @paste="handlePaste('unicode')"
          @download="handleDownload('unicode')"
          @apply-suggestion="applyEncodingSuggestion"
        >
          <div
            id="sinhala-unicode-text"
            ref="unicodeInput"
            role="textbox"
            tabindex="0"
            aria-multiline="true"
            :aria-label="translate('sinhala.unicodeText')"
            class="min-h-32 w-full whitespace-pre-wrap wrap-break-word bg-transparent px-3 py-2 font-abhaya text-lg leading-7 outline-none empty:after:pointer-events-none empty:after:font-serif empty:after:text-base-content/40 empty:after:content-[attr(data-placeholder)] lg:min-h-48"
            :class="{
              'before:float-right before:ml-2 before:h-8 before:w-8 before:content-[\'\']':
                hasText && !isDirectionReversed,
              'cursor-text': !isDirectionReversed,
            }"
            :style="{
              fontFamily: unicodeFont.family,
              fontWeight: unicodeFont.bold ? 700 : 400,
              fontSize: unicodeFont.previewSize,
            }"
            :contenteditable="
              isDirectionReversed ? 'false' : 'plaintext-only'
            "
            :aria-readonly="isDirectionReversed"
            :data-placeholder="
              !isDirectionReversed
                ? translate('sinhala.unicodePlaceholder')
                : translate('sinhala.unicodePreview')
            "
            lang="si"
            spellcheck="false"
            @input="handleUnicodeEditableInput"
            @compositionstart="isUnicodeComposing = true"
            @compositionend="handleUnicodeCompositionEnd"
          ></div>
        </ConversionPane>

        <Tooltip
          as="label"
          trigger-class=""
          activation-class="tooltip"
          content-class="max-w-[calc(100vw-3rem)]"
          for="swap-direction"
          class="order-2 justify-self-center self-start md:mt-1.5"
          :text="translate('sinhala.swapShortcut')"
        >
          <button
            id="swap-direction"
            type="button"
            class="btn btn-ghost btn-circle"
            :aria-label="translate('sinhala.swap')"
            @pointerdown.capture="captureControlViewport"
            @keydown.capture="captureControlViewport"
            @click="swapPanels"
          >
            <i
              class="ri-arrow-left-right-line block rotate-90 text-lg lg:rotate-0"
              aria-hidden="true"
            ></i>
          </button>
        </Tooltip>

        <ConversionPane
          ref="legacyPaneRef"
          side="legacy"
          :is-input="isDirectionReversed"
          :font="legacyFont"
          :controls-disabled="showLegacySource"
          :character-count="fmText.length"
          :has-text="hasText"
          :clipboard-status="clipboardStatusFor('fm')"
          :downloading="downloadingField === 'legacy'"
          :encoding-suggestion="encodingSuggestion"
          @select-font="onLegacyFontSelected"
          @toggle-bold="toggleLegacyBold"
          @scroll="syncTextScroll('legacy')"
          @clear="clearText"
          @copy="handleCopy('fm')"
          @paste="handlePaste('fm')"
          @download="handleDownload('legacy')"
          @apply-suggestion="applyEncodingSuggestion"
        >
          <div
            id="sinhala-fm-text-preview"
            ref="fmPreviewInput"
            role="textbox"
            :contenteditable="
              isDirectionReversed ? 'plaintext-only' : 'false'
            "
            :aria-readonly="!isDirectionReversed"
            aria-multiline="true"
            aria-labelledby="sinhala-legacy-label"
            :data-placeholder="
              showLegacySource
                ? isDirectionReversed
                  ? translate('sinhala.sourcePlaceholder')
                  : translate('sinhala.sourcePreview')
                : isDirectionReversed
                  ? translate('sinhala.legacyPlaceholder')
                  : translate('sinhala.legacyPreview')
            "
            class="min-h-32 w-full whitespace-pre-wrap wrap-break-word bg-transparent px-3 py-2 text-lg leading-7 empty:after:pointer-events-none empty:after:font-serif empty:after:text-base-content/40 empty:after:content-[attr(data-placeholder)] lg:min-h-48"
            :class="{
              'before:float-right before:ml-2 before:h-8 before:w-8 before:content-[\'\']':
                hasText && isDirectionReversed,
              'cursor-text outline-none': isDirectionReversed,
              'font-mono [font-variant-ligatures:none]': showLegacySource,
              'empty:after:font-bold': legacyFont.bold && !showLegacySource,
            }"
            :style="{
              '--legacy-preview-font': legacyFont.family,
              '--legacy-preview-non-sinhala-font':
                legacyFont.nonSinhalaFontFamily,
              '--legacy-preview-non-sinhala-weight':
                legacyFont.bold || legacyFont.nonSinhalaBold ? 700 : 400,
              '--legacy-preview-size': legacyFont.previewSize,
              '--legacy-preview-weight': legacyFont.bold ? 700 : 400,
            }"
            lang="si"
            spellcheck="false"
            v-html="renderedFmPreviewHtml"
            v-on="fmEditorHandlers"
          ></div>

          <template #toolbar-extra>
            <label
              class="label min-w-0 max-w-full whitespace-normal cursor-pointer gap-2 p-0"
            >
              <input
                v-model="showLegacySource"
                type="checkbox"
                class="toggle toggle-sm"
                aria-controls="sinhala-fm-text-preview"
                @change="handleLegacySourceChange"
              />
              <span class="text-xs">{{ translate("sinhala.showSource") }}</span>
            </label>
          </template>
        </ConversionPane>
      </div>

      <p
        v-if="inputMode === 'text' && sourceTextLength >= LONG_TEXT_THRESHOLD"
        class="mt-3 text-sm text-base-content/70"
      >
        <I18nT keypath="sinhala.longText" tag="span" scope="global">
          <template #count>{{ sourceTextLength }}</template>
          <template #documentMode>
            <button
              type="button"
              class="link link-primary"
              @click="inputMode = 'document'"
            >
              {{ translate("sinhala.documentMode") }}
            </button>
          </template>
        </I18nT>
      </p>

      <ConversionOptions
        :options="conversionOptions"
        :is-direction-reversed="isDirectionReversed"
        :disabled="inputMode === 'document' && documentConverting"
        @change="handleConversionOptionsChange"
        @capture-viewport="captureControlViewport"
      />
    </section>

    <Notes />

    <Info @announcement="liveMessage = $event" />

    <p class="sr-only" aria-live="polite">{{ liveMessage }}</p>
  </ContentPage>
</template>

<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from "vue";
import { Translation as I18nT } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import Tooltip from "@/components/display/Tooltip.vue";
import ContentPage from "@/components/layout/ContentPage.vue";
import ConversionOptions from "@/components/tools/sinhala/ConversionOptions.vue";
import ConversionPane from "@/components/tools/sinhala/ConversionPane.vue";
import DocumentDropzone from "@/components/tools/sinhala/DocumentDropzone.vue";
import Info from "@/components/tools/sinhala/Info.vue";
import Notes from "@/components/tools/sinhala/Notes.vue";
import { useClipboardActions } from "@/composables/tools/sinhala/useClipboardActions";
import { useContentEditableHistory } from "@/composables/tools/sinhala/useContentEditableHistory";
import { useDocumentConversion } from "@/composables/tools/sinhala/useDocumentConversion";
import { useSinhalaFonts } from "@/composables/tools/sinhala/useSinhalaFonts";
import { useTextPaneLayout } from "@/composables/tools/sinhala/useTextPaneLayout";
import { useLocale } from "@/i18n";
import {
  buildConjunctOptions,
  buildUnicodeToFmOptions,
  createDefaultConversionOptions,
} from "@/utils/sinhala/conversion-options";
import {
  detectSinhalaEncoding,
  fmToUnicodePreservingNonSinhala,
  fmToUnicodeSegments,
  unicodeToFmPreservingNonSinhala,
  unicodeToFmSegments,
} from "@/utils/sinhala/converter";
import {
  editablePlainText,
  restoreEditableSelection,
} from "@/utils/sinhala/editor";

const LONG_TEXT_THRESHOLD = 5000;

const { t: translate } = useLocale();
const route = useRoute();
const router = useRouter();

const unicodeText = ref("");
const fmText = ref("");
const showLegacySource = ref(false);
// Retain source-script provenance while a generated Unicode/Legacy pair only
// changes position, so sequences such as `ys` remain associated with `හි`.
const fmTextDerivedFromUnicode = ref(false);
const textDirectionReversed = ref(false);
const liveMessage = ref("");
const conversionOptions = reactive(createDefaultConversionOptions());

const unicodePaneRef = ref(null);
const legacyPaneRef = ref(null);
const unicodeInput = ref(null);
const fmPreviewInput = ref(null);
let isUnicodeComposing = false;

const announce = (message) => {
  liveMessage.value = message;
};

const inputMode = computed({
  get: () => (route.query.mode === "document" ? "document" : "text"),
  set: (mode) => {
    if (route.query.mode === mode) return;
    void router.replace({ query: { ...route.query, mode } });
  },
});

const {
  resizeAllTextareas,
  scheduleTextareaResize,
  cancelScheduledTextareaResize,
  syncTextScroll,
  captureControlViewport,
  stabilizeControlViewport,
} = useTextPaneLayout({
  inputMode,
  getPaneElements: () => ({
    unicodeField: unicodePaneRef.value?.fieldEl,
    unicodeViewport: unicodePaneRef.value?.viewportEl,
    fmField: legacyPaneRef.value?.fieldEl,
    fmViewport: legacyPaneRef.value?.viewportEl,
  }),
});

const {
  unicodeFont,
  legacyFont,
  onUnicodeFontSelected,
  onLegacyFontSelected,
  toggleUnicodeBold,
  toggleLegacyBold,
  resolveLegacyDocumentFontPair,
} = useSinhalaFonts({
  unicodePaneRef,
  legacyPaneRef,
  unicodeText,
  fmText,
  onLayoutChange: scheduleTextareaResize,
  announce,
});

const {
  documentView,
  pdfAutomatic: documentPdfAutomatic,
  pdfSelectedFormat: documentPdfSelectedFormat,
  directionReversed: documentDirectionReversed,
  directionManual: documentDirectionManual,
  busy: documentBusy,
  converting: documentConverting,
  downloadingField,
  setDocumentFile,
  convertUploadedDocument,
  downloadTextAsDocx,
} = useDocumentConversion({
  options: conversionOptions,
  legacyFont,
  resolveLegacyDocumentFontPair,
  announce,
});

const isDirectionReversed = computed({
  get: () =>
    inputMode.value === "document"
      ? documentDirectionReversed.value
      : textDirectionReversed.value,
  set: (reversed) => {
    if (inputMode.value === "document") {
      documentDirectionManual.value = true;
      documentDirectionReversed.value = reversed;
    } else {
      textDirectionReversed.value = reversed;
    }
  },
});

const hasText = computed(() => Boolean(unicodeText.value || fmText.value));
const sourceTextLength = computed(() =>
  isDirectionReversed.value ? fmText.value.length : unicodeText.value.length,
);

const fmPreviewSegments = computed(() => {
  if (isDirectionReversed.value && !fmTextDerivedFromUnicode.value) {
    return fmToUnicodeSegments(
      fmText.value,
      buildConjunctOptions(conversionOptions),
    ).map(({ source, useLegacyFont }) => ({
      text: source,
      useLegacyFont,
    }));
  }

  return unicodeToFmSegments(
    unicodeText.value,
    buildUnicodeToFmOptions(conversionOptions),
  );
});

const encodingSuggestion = computed(() => {
  const sourceText = isDirectionReversed.value
    ? fmText.value
    : unicodeText.value;
  if (!sourceText.trim()) return null;

  const detectedEncoding = detectSinhalaEncoding(sourceText);
  const expectedEncoding = isDirectionReversed.value ? "legacy" : "unicode";
  if (!detectedEncoding || detectedEncoding === expectedEncoding) return null;

  return {
    message: translate("sinhala.sourceLabel"),
    actionLabel: isDirectionReversed.value ? "Unicode" : "Legacy",
  };
});

const {
  clipboardStatusFor,
  resetCopyStatus,
  copyToClipboard,
  pasteFromClipboard,
} = useClipboardActions({ announce });

function convertUnicodeToFm() {
  fmText.value = unicodeToFmPreservingNonSinhala(
    unicodeText.value,
    buildUnicodeToFmOptions(conversionOptions),
  );
  fmTextDerivedFromUnicode.value = true;
}

function convertFmToUnicode() {
  unicodeText.value = fmToUnicodePreservingNonSinhala(
    fmText.value,
    buildConjunctOptions(conversionOptions),
  );
}

const {
  isEditing: isFmPreviewEditing,
  renderedHtml: renderedFmPreviewHtml,
  refreshPreview: refreshFmPreview,
  resetHistory: resetFmHistory,
  cancelPendingConversion: cancelPendingFmConversion,
  clearTransientState: clearFmTransientState,
  flushConversion: flushFmPreviewConversion,
  handlers: fmEditorHandlers,
} = useContentEditableHistory({
  elementRef: fmPreviewInput,
  fmText,
  isEditable: isDirectionReversed,
  showSource: showLegacySource,
  segments: fmPreviewSegments,
  onConvert: convertFmToUnicode,
  onResetCopyStatus: resetCopyStatus,
  onMarkLegacySource: () => {
    fmTextDerivedFromUnicode.value = false;
  },
  onLayoutChange: scheduleTextareaResize,
});

watch(inputMode, (mode) => {
  if (mode === "text") {
    handleConversionOptionsChange();
    scheduleTextareaResize();
  } else {
    cancelScheduledTextareaResize();
  }
});

watch(
  unicodeText,
  () => {
    const element = unicodeInput.value;
    if (
      element &&
      !isUnicodeComposing &&
      editablePlainText(element) !== unicodeText.value
    ) {
      element.textContent = unicodeText.value;
    }
  },
  { flush: "post" },
);

function handleUnicodeEditableInput(event) {
  if (isDirectionReversed.value || isUnicodeComposing || event?.isComposing)
    return;
  unicodeText.value = editablePlainText(unicodeInput.value);
  handleUnicodeInput();
}

function handleUnicodeCompositionEnd() {
  isUnicodeComposing = false;
  handleUnicodeEditableInput();
}

function handleUnicodeInput() {
  resetCopyStatus();
  convertUnicodeToFm();
  resetFmHistory();
  refreshFmPreview();
  scheduleTextareaResize();
}

function handleFmInput() {
  cancelPendingFmConversion();
  resetCopyStatus();
  fmTextDerivedFromUnicode.value = false;
  convertFmToUnicode();
  resetFmHistory();
  refreshFmPreview();
  scheduleTextareaResize();
}

function handleLegacySourceChange() {
  flushFmPreviewConversion();
  refreshFmPreview();
  announce(
    showLegacySource.value
      ? translate("sinhala.sourceVisible")
      : translate("sinhala.glyphsVisible"),
  );
  scheduleTextareaResize();
}

function handleConversionOptionsChange(event) {
  if (inputMode.value === "document") {
    announce(translate("sinhala.optionsUpdated"));
    stabilizeControlViewport(event);
    return;
  }
  cancelScheduledTextareaResize();
  flushFmPreviewConversion();
  resetCopyStatus();
  if (isDirectionReversed.value) {
    fmTextDerivedFromUnicode.value = false;
    convertFmToUnicode();
  } else {
    convertUnicodeToFm();
  }
  refreshFmPreview({ preserveSelection: isFmPreviewEditing.value });
  announce(translate("sinhala.optionsUpdated"));
  stabilizeControlViewport(event);
}

function swapPanels(event) {
  if (inputMode.value === "document") {
    if (documentBusy.value) return;
    isDirectionReversed.value = !isDirectionReversed.value;
    announce(translate("sinhala.encodingsSwapped"));
    stabilizeControlViewport(event);
    return;
  }
  cancelScheduledTextareaResize();
  flushFmPreviewConversion();
  isDirectionReversed.value = !isDirectionReversed.value;
  resetFmHistory();
  refreshFmPreview();
  announce(translate("sinhala.encodingsSwapped"));
  stabilizeControlViewport(event);
}

function handleGlobalKeydown(event) {
  if (
    event.repeat ||
    !event.ctrlKey ||
    !event.shiftKey ||
    event.altKey ||
    event.metaKey ||
    event.key.toLowerCase() !== "s"
  ) {
    return;
  }

  event.preventDefault();
  swapPanels();
}

function applyEncodingSuggestion() {
  flushFmPreviewConversion();
  resetCopyStatus();
  if (isDirectionReversed.value) {
    const sourceText = fmText.value;
    isDirectionReversed.value = false;
    unicodeText.value = sourceText;
    convertUnicodeToFm();
  } else {
    const sourceText = unicodeText.value;
    isDirectionReversed.value = true;
    fmText.value = sourceText;
    fmTextDerivedFromUnicode.value = false;
    convertFmToUnicode();
  }
  resetFmHistory();
  refreshFmPreview();
  announce(translate("sinhala.directionSwapped"));
  scheduleTextareaResize();
}

async function clearText() {
  isUnicodeComposing = false;
  clearFmTransientState();
  unicodeText.value = "";
  fmText.value = "";
  fmTextDerivedFromUnicode.value = false;
  resetFmHistory();
  refreshFmPreview();
  resetCopyStatus();
  announce(translate("sinhala.contentCleared"));
  await nextTick();
  resizeAllTextareas();
  if (isDirectionReversed.value) {
    fmPreviewInput.value?.focus();
  } else {
    unicodeInput.value?.focus();
  }
}

function handleCopy(field) {
  if (field === "unicode" && isDirectionReversed.value) {
    flushFmPreviewConversion();
  }
  const text = field === "unicode" ? unicodeText.value : fmText.value;
  void copyToClipboard(field, text);
}

function handlePaste(field) {
  void pasteFromClipboard(field, {
    onApply: (text) => {
      if (field === "unicode") {
        unicodeText.value = text;
        handleUnicodeInput();
      } else {
        fmText.value = text;
        handleFmInput();
      }
    },
    onAfterPaste: (text) => {
      const target =
        field === "unicode" ? unicodeInput.value : fmPreviewInput.value;
      target?.focus();
      restoreEditableSelection(target, {
        start: text.length,
        end: text.length,
      });
    },
  });
}

function handleDownload(field) {
  void downloadTextAsDocx(field, {
    unicodeText,
    fmText,
    beforeDownload: () => {
      if (isDirectionReversed.value) flushFmPreviewConversion();
    },
  });
}

onMounted(() => {
  refreshFmPreview();
  resizeAllTextareas();
  unicodeInput.value?.focus({ preventScroll: true });
  window.addEventListener("keydown", handleGlobalKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleGlobalKeydown);
});
</script>
