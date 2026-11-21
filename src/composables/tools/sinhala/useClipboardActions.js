import { nextTick, onBeforeUnmount, ref } from "vue";
import { useLocale } from "@/i18n";

async function writeClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const fallback = document.createElement("textarea");
  fallback.value = text;
  fallback.setAttribute("readonly", "");
  fallback.style.position = "fixed";
  fallback.style.opacity = "0";
  document.body.appendChild(fallback);
  fallback.select();
  const copied = document.execCommand("copy");
  fallback.remove();
  if (!copied) throw new Error("Clipboard copy was rejected");
}

async function readClipboard() {
  if (!navigator.clipboard?.readText) {
    throw new Error("Clipboard read is unavailable");
  }

  return navigator.clipboard.readText();
}

export function useClipboardActions({ announce }) {
  const { t: translate } = useLocale();
  const copiedField = ref("");
  const copyFailedField = ref("");
  const pastedField = ref("");
  const pasteFailedField = ref("");
  let resetCopyTimer = null;

  function resetCopyStatus() {
    copiedField.value = "";
    copyFailedField.value = "";
    pastedField.value = "";
    pasteFailedField.value = "";
    window.clearTimeout(resetCopyTimer);
  }

  function clipboardStatusFor(field) {
    if (copiedField.value === field) return "copied";
    if (copyFailedField.value === field) return "copy-failed";
    if (pastedField.value === field) return "pasted";
    if (pasteFailedField.value === field) return "paste-failed";
    return "";
  }

  async function copyToClipboard(field, text) {
    resetCopyStatus();

    try {
      await writeClipboard(text);
      copiedField.value = field;
      announce(
        field === "unicode"
          ? translate("sinhala.unicodeCopied")
          : translate("sinhala.legacyCopied"),
      );
    } catch {
      copyFailedField.value = field;
      announce(translate("sinhala.clipboardFailed"));
    }

    resetCopyTimer = window.setTimeout(resetCopyStatus, 1800);
  }

  async function pasteFromClipboard(field, { onApply, onAfterPaste }) {
    resetCopyStatus();

    try {
      const text = await readClipboard();
      onApply(text);
      pastedField.value = field;
      announce(
        field === "unicode"
          ? translate("sinhala.unicodePasted")
          : translate("sinhala.legacyPasted"),
      );
      await nextTick();
      onAfterPaste?.(text);
    } catch {
      pasteFailedField.value = field;
      announce(translate("sinhala.clipboardDenied"));
    }

    resetCopyTimer = window.setTimeout(resetCopyStatus, 1800);
  }

  onBeforeUnmount(() => {
    window.clearTimeout(resetCopyTimer);
  });

  return {
    clipboardStatusFor,
    resetCopyStatus,
    copyToClipboard,
    pasteFromClipboard,
  };
}
