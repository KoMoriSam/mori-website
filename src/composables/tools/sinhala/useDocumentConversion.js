import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import { useLocale } from "@/i18n";
import { downloadBlob } from "@/utils/dom/download";
import {
  buildConjunctOptions,
  buildUnicodeToFmOptions,
} from "@/utils/sinhala/conversion-options";
import {
  detectSinhalaEncoding,
  fmToUnicodePreservingNonSinhala,
  unicodeToFmSegments,
} from "@/utils/sinhala/converter";
import { convertSinhalaDocx } from "@/utils/sinhala/convert-docx";
import { createSinhalaDocx } from "@/utils/sinhala/create-docx";
import { isFmAbabldFont } from "@/utils/sinhala/font-catalog";
import { readSinhalaDocument } from "@/utils/sinhala/read-document";

async function systemDocumentFont(serifFonts) {
  for (const family of serifFonts) {
    try {
      await new FontFace(family, `local(${JSON.stringify(family)})`).load();
      return family;
    } catch {
      // Continue to the next installed system font.
    }
  }
  return null;
}

async function unicodeDocumentFonts() {
  const [western, eastAsia, sinhala] = await Promise.all([
    systemDocumentFont([
      "Times New Roman",
      "Times",
      "Liberation Serif",
      "Noto Serif",
    ]),
    systemDocumentFont(["SimSun", "Songti SC", "Noto Serif CJK SC"]),
    systemDocumentFont([
      "Iskoola Pota",
      "Sinhala MN",
      "Noto Serif Sinhala",
      "LKLUG",
    ]),
  ]);
  return western && eastAsia && sinhala
    ? { ascii: western, hAnsi: western, eastAsia, cs: sinhala }
    : {
        ascii: "Times New Roman",
        hAnsi: "Times New Roman",
        eastAsia: "SimSun",
        cs: "Iskoola Pota",
      };
}

function convertedUnicodeDocumentSegments(text, fontFamilies) {
  return text
    .split(/([\u0D80-\u0DFF\u200C\u200D]+)/gu)
    .filter(Boolean)
    .map((part) => {
      const isSinhala = /^[\u0D80-\u0DFF\u200C\u200D]+$/u.test(part);
      return {
        text: part,
        fontFamilies,
        sizeHalfPoints: 24,
        complexSizeHalfPoints: 28,
        complexScript: isSinhala,
        language: "en-US",
        eastAsiaLanguage: "zh-CN",
        bidiLanguage: "si-LK",
      };
    });
}

export function useDocumentConversion({
  options,
  legacyFont,
  resolveLegacyDocumentFontPair,
  announce,
}) {
  const {
    t: translate,
    text: localizeText,
    message: localeMessage,
  } = useLocale();

  const file = ref(null);
  const text = ref("");
  const sourceDocx = shallowRef(null);
  const pdfPages = shallowRef(null);
  const pdfFormat = ref("auto");
  const pdfSuggestedFormat = ref(null);
  const detectedEncoding = ref(null);
  const error = ref("");
  const reading = ref(false);
  const readStage = ref("reading");
  const converting = ref(false);
  const result = ref(null);
  const hasConverted = ref(false);
  const directionReversed = ref(false);
  const directionManual = ref(false);
  const downloadingField = ref("");

  let readRequest = 0;
  let conversionRequest = 0;

  const isPdf = computed(() =>
    Boolean(file.value?.name.toLowerCase().endsWith(".pdf")),
  );
  const isPptx = computed(() =>
    Boolean(file.value?.name.toLowerCase().endsWith(".pptx")),
  );
  const pdfOutputFormat = computed(() =>
    pdfFormat.value === "auto"
      ? pdfSuggestedFormat.value || "docx"
      : pdfFormat.value,
  );
  const pdfSelectedFormat = computed({
    get: () => pdfOutputFormat.value,
    set: (format) => {
      pdfFormat.value = format;
    },
  });
  const pdfAutomatic = computed({
    get: () => pdfFormat.value === "auto",
    set: (automatic) => {
      pdfFormat.value = automatic ? "auto" : pdfOutputFormat.value;
    },
  });
  const busy = computed(() => reading.value || converting.value);

  const sourceStatus = computed(() => {
    if (reading.value) {
      const messages = {
        reading: "readFile",
        parsing: "parseFile",
        detecting: "detectEncoding",
      };
      return translate(`sinhala.${messages[readStage.value]}`);
    }
    if (!text.value && error.value) {
      return translate("sinhala.readFailed");
    }
    return detectedEncoding.value
      ? translate("sinhala.detectedEncoding", {
          p0: detectedEncoding.value === "legacy" ? "Legacy" : "Unicode",
        })
      : translate("sinhala.unknownEncoding");
  });

  const fileStatus = computed(() =>
    translate(
      `sinhala.${
        reading.value
          ? "reading"
          : converting.value
            ? "converting"
            : error.value
              ? text.value
                ? "conversionFailed"
                : "readFailed"
              : result.value
                ? "success"
                : "fileReady"
      }`,
    ),
  );

  const documentView = computed(() => ({
    file: file.value,
    textLength: text.value.length,
    canConvert: Boolean(text.value.trim()),
    isPdf: isPdf.value,
    isPptx: isPptx.value,
    reading: reading.value,
    converting: converting.value,
    busy: busy.value,
    error: error.value,
    result: result.value,
    hasConverted: hasConverted.value,
    fileStatus: fileStatus.value,
    sourceStatus: sourceStatus.value,
  }));

  function clearDocumentResult() {
    if (result.value) URL.revokeObjectURL(result.value.url);
    result.value = null;
    if (text.value) error.value = "";
  }

  const conversionKey = computed(() =>
    JSON.stringify({
      format: pdfPages.value
        ? pdfOutputFormat.value
        : isPptx.value
          ? "pptx"
          : "docx",
      reversed: directionReversed.value,
      options: buildUnicodeToFmOptions(options),
      legacyFont: legacyFont.id,
      legacyBold: legacyFont.bold,
    }),
  );
  watch(conversionKey, clearDocumentResult, { flush: "sync" });

  async function setDocumentFile(selectedFile) {
    if (converting.value) return;
    const request = ++readRequest;
    clearDocumentResult();
    hasConverted.value = false;
    file.value = selectedFile;
    text.value = "";
    sourceDocx.value = null;
    pdfPages.value = null;
    pdfSuggestedFormat.value = null;
    detectedEncoding.value = null;
    error.value = "";
    readStage.value = "reading";
    reading.value = Boolean(selectedFile);
    if (!selectedFile) return;

    try {
      const extension = selectedFile.name.split(".").pop()?.toLowerCase();
      if (extension === "doc" || extension === "ppt") {
        throw new Error(
          translate("sinhala.legacyDocumentUnsupported", {
            p0: extension.toUpperCase(),
            p1: `${extension}x`.toUpperCase(),
          }),
        );
      }
      await nextTick();
      if (request !== readRequest) return;
      const loaded = await readSinhalaDocument(selectedFile, {
        includeLayout: true,
        onStage: (stage) => {
          if (request === readRequest) readStage.value = stage;
        },
      });
      if (request !== readRequest) return;
      if (!loaded.text.trim()) {
        throw new Error(
          translate(
            isPdf.value
              ? "sinhala.noSelectableText"
              : "sinhala.noConvertibleText",
          ),
        );
      }
      readStage.value = "detecting";
      await nextTick();
      if (request !== readRequest) return;
      const encoding = detectSinhalaEncoding(loaded.text);
      text.value = loaded.text;
      sourceDocx.value = loaded.sourceDocx;
      pdfPages.value = loaded.pdfPages || null;
      pdfSuggestedFormat.value = loaded.pdfSuggestedFormat || null;
      detectedEncoding.value = encoding;
      if (encoding && !directionManual.value) {
        directionReversed.value = encoding === "legacy";
      }
      announce(
        encoding
          ? translate("sinhala.encodingDetected", {
              p0: selectedFile.name,
              p1: encoding === "legacy" ? "Legacy" : "Unicode",
            })
          : translate("sinhala.encodingUndetected", { p0: selectedFile.name }),
      );
    } catch (caughtError) {
      if (request === readRequest) {
        error.value =
          caughtError instanceof Error
            ? caughtError.message
            : translate("sinhala.readFailed");
        announce(localizeText(error.value));
      }
    } finally {
      if (request === readRequest) reading.value = false;
    }
  }

  async function convertUploadedDocument() {
    if (!file.value || !text.value.trim() || busy.value) return;
    const request = ++conversionRequest;
    const currentFile = file.value;
    const source = sourceDocx.value || currentFile;
    const pages = pdfPages.value;
    const format = pages
      ? pdfOutputFormat.value
      : isPptx.value
        ? "pptx"
        : "docx";
    const key = conversionKey.value;
    const target = directionReversed.value ? "unicode" : "legacy";
    const conversionOptions = buildUnicodeToFmOptions(options);
    clearDocumentResult();
    converting.value = true;
    error.value = "";

    try {
      const legacyFonts =
        target === "legacy" ? await resolveLegacyDocumentFontPair() : null;
      const settings = {
        target,
        options: conversionOptions,
        legacyFontFamily:
          legacyFonts && isFmAbabldFont(legacyFonts.sinhala)
            ? "FMAbhaya"
            : legacyFonts?.sinhala,
        unicodeFontFamilies:
          target === "unicode" ? await unicodeDocumentFonts() : null,
      };
      const blob = isPptx.value
        ? await (
            await import("@/utils/sinhala/convert-pptx.js")
          ).convertSinhalaPptx(currentFile, settings)
        : format === "pptx"
          ? await (
              await import("@/utils/sinhala/create-pdf-pptx.js")
            ).createPdfPptx(pages, settings)
          : await convertSinhalaDocx(source, settings);
      if (request !== conversionRequest || key !== conversionKey.value) return;
      result.value = {
        url: URL.createObjectURL(blob),
        filename: `${currentFile.name.replace(/\.(docx|pptx|pdf)$/iu, "")}-${target}.${format}`,
        format,
      };
      hasConverted.value = true;
      announce(translate("sinhala.documentReady"));
    } catch {
      if (request !== conversionRequest || key !== conversionKey.value) return;
      error.value = localeMessage("sinhala.documentFailed");
      announce(localizeText(error.value));
    } finally {
      if (request === conversionRequest) converting.value = false;
    }
  }

  async function convertedLegacyDocumentSegments(unicodeSourceText) {
    const { sinhala, other, otherBold } = await resolveLegacyDocumentFontPair();
    const sinhalaBold = legacyFont.bold && !isFmAbabldFont(sinhala);
    return unicodeToFmSegments(
      unicodeSourceText,
      buildUnicodeToFmOptions(options),
    ).flatMap(({ text: segmentText, useLegacyFont }) =>
      segmentText
        .split(/([0-9]+)/gu)
        .filter(Boolean)
        .map((part) => {
          const isNumber = /^[0-9]+$/u.test(part);
          const isNonSinhala = !useLegacyFont && !isNumber;
          return {
            text: part,
            fontFamily: useLegacyFont || isNumber ? sinhala : other,
            bold: isNonSinhala ? legacyFont.bold || otherBold : sinhalaBold,
            sizeHalfPoints: useLegacyFont || isNumber ? 28 : 24,
            noProof: true,
          };
        }),
    );
  }

  async function downloadTextAsDocx(
    field,
    { unicodeText, fmText, beforeDownload },
  ) {
    if (downloadingField.value) return;
    beforeDownload?.();
    if (!unicodeText.value && !fmText.value) return;

    downloadingField.value = field;
    try {
      const segments =
        field === "unicode"
          ? convertedUnicodeDocumentSegments(
              fmToUnicodePreservingNonSinhala(
                fmText.value,
                buildConjunctOptions(options),
              ),
              await unicodeDocumentFonts(),
            )
          : await convertedLegacyDocumentSegments(unicodeText.value);
      const blob = await createSinhalaDocx(segments);
      downloadBlob(blob, `sinhala-${field}.docx`, { revokeDelay: 60_000 });
      announce(
        translate("sinhala.documentDownloaded", {
          p0: field === "unicode" ? "Unicode" : "Legacy",
        }),
      );
    } catch {
      announce(translate("sinhala.exportFailed"));
    } finally {
      downloadingField.value = "";
    }
  }

  onBeforeUnmount(() => {
    readRequest++;
    conversionRequest++;
    clearDocumentResult();
  });

  return {
    documentView,
    pdfAutomatic,
    pdfSelectedFormat,
    directionReversed,
    directionManual,
    busy,
    converting,
    downloadingField,
    setDocumentFile,
    convertUploadedDocument,
    downloadTextAsDocx,
  };
}
