import { nextTick, onBeforeUnmount, ref } from "vue";
import {
  editablePlainText,
  editableRange,
  editableSelection,
  restoreEditableSelection,
} from "@/utils/sinhala/editor";

const HISTORY_LIMIT = 200;
const HISTORY_GROUP_DELAY = 1000;
const GROUPABLE_INPUT_TYPES = new Set([
  "insertText",
  "deleteContentBackward",
  "deleteContentForward",
]);

function escapePreviewHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setClipboardText(event, text) {
  if (!event.clipboardData) return false;
  try {
    event.clipboardData.setData("text/plain", text);
    event.preventDefault();
    return true;
  } catch {
    return false;
  }
}

export function useContentEditableHistory({
  elementRef,
  fmText,
  isEditable,
  showSource,
  segments,
  onConvert,
  onResetCopyStatus,
  onMarkLegacySource,
  onLayoutChange,
}) {
  const isEditing = ref(false);
  const isComposing = ref(false);
  const renderedHtml = ref("");

  let conversionTimer = null;
  let compositionCommitTimer = null;
  let compositionHistoryEntry = null;
  let clipboardInputResetTimer = null;
  let pendingClipboardInputType = "";
  let pendingHistoryEntry = null;
  let pendingHistoryInputType = "";
  let historyGroup = null;
  let renderToken = 0;
  const undoStack = [];
  const redoStack = [];

  function previewHtml() {
    if (showSource.value) return escapePreviewHtml(fmText.value);

    return segments.value
      .map(
        ({ text, useLegacyFont }) =>
          `<span class="leading-none" style="${useLegacyFont ? "font-family:var(--legacy-preview-font);font-size:var(--legacy-preview-size);font-weight:var(--legacy-preview-weight)" : "font-family:var(--legacy-preview-non-sinhala-font);font-weight:var(--legacy-preview-non-sinhala-weight)"}">${escapePreviewHtml(text)}</span>`,
      )
      .join("");
  }

  function refreshPreview({ preserveSelection = false, selection = null } = {}) {
    if (isComposing.value) return;

    const element = elementRef.value;
    const savedSelection =
      selection ??
      (preserveSelection && element ? editableSelection(element) : null);
    const html = previewHtml();
    const htmlChanged = renderedHtml.value !== html;
    const token = ++renderToken;
    renderedHtml.value = html;

    if (htmlChanged) {
      nextTick(() => {
        if (token !== renderToken) return;
        restoreEditableSelection(elementRef.value, savedSelection);
      });
      return;
    }

    if (element && element.innerHTML !== html) {
      element.innerHTML = html;
    }
    restoreEditableSelection(element, savedSelection);
  }

  function resetHistory() {
    pendingHistoryEntry = null;
    pendingHistoryInputType = "";
    historyGroup = null;
    compositionHistoryEntry = null;
    undoStack.length = 0;
    redoStack.length = 0;
  }

  function pushHistory(stack, entry) {
    if (!entry) return;
    stack.push(entry);
    if (stack.length > HISTORY_LIMIT) stack.shift();
  }

  function clearExpectedClipboardInput() {
    window.clearTimeout(clipboardInputResetTimer);
    clipboardInputResetTimer = null;
    pendingClipboardInputType = "";
  }

  function expectClipboardInput(inputType) {
    clearExpectedClipboardInput();
    pendingClipboardInputType = inputType;
    clipboardInputResetTimer = window.setTimeout(() => {
      clearExpectedClipboardInput();
    }, 0);
  }

  function cancelPendingConversion() {
    window.clearTimeout(conversionTimer);
    conversionTimer = null;
  }

  function clearTransientState() {
    cancelPendingConversion();
    window.clearTimeout(compositionCommitTimer);
    compositionCommitTimer = null;
    clearExpectedClipboardInput();
    isComposing.value = false;
    compositionHistoryEntry = null;
  }

  function scheduleConversion() {
    window.clearTimeout(conversionTimer);
    onResetCopyStatus();
    onMarkLegacySource();
    if (isComposing.value || compositionCommitTimer !== null) {
      onConvert();
      return;
    }

    conversionTimer = window.setTimeout(() => {
      conversionTimer = null;
      refreshPreview({ preserveSelection: true });
      onConvert();
      onLayoutChange();
    }, 120);

    const preview = elementRef.value;
    if (preview && preview.scrollHeight > preview.clientHeight) {
      onLayoutChange();
    }
  }

  function commitComposition() {
    window.clearTimeout(compositionCommitTimer);
    compositionCommitTimer = null;
    clearExpectedClipboardInput();
    isComposing.value = false;

    const element = elementRef.value;
    if (!element || !isEditable.value) {
      compositionHistoryEntry = null;
      return;
    }

    const nextText = editablePlainText(element);
    if (compositionHistoryEntry && compositionHistoryEntry.text !== nextText) {
      pushHistory(undoStack, compositionHistoryEntry);
      redoStack.length = 0;
    }
    compositionHistoryEntry = null;
    fmText.value = nextText;
    onMarkLegacySource();
    onConvert();
    refreshPreview({ preserveSelection: true });
    onLayoutChange();
  }

  function flushConversion() {
    if (isComposing.value || compositionCommitTimer !== null) {
      commitComposition();
    }
    if (conversionTimer === null) return;
    window.clearTimeout(conversionTimer);
    conversionTimer = null;
    refreshPreview({ preserveSelection: true });
    onConvert();
  }

  function applyHistory(sourceStack, targetStack) {
    const element = elementRef.value;
    const entry = sourceStack.pop();
    if (!element || !entry) return;

    pushHistory(targetStack, {
      text: editablePlainText(element),
      selection: editableSelection(element),
    });
    pendingHistoryEntry = null;
    pendingHistoryInputType = "";
    historyGroup = null;
    clearTransientState();
    fmText.value = entry.text;
    onMarkLegacySource();
    onConvert();
    refreshPreview({ selection: entry.selection });
    onLayoutChange();
  }

  function selectedText(element) {
    const selection = editableSelection(element);
    if (!selection || selection.start === selection.end) return null;
    return {
      selection,
      text: fmText.value.slice(selection.start, selection.end),
    };
  }

  function replaceSelection(element, selection, replacement) {
    const currentText = fmText.value;
    const nextText = `${currentText.slice(0, selection.start)}${replacement}${currentText.slice(selection.end)}`;
    const nextCaret = selection.start + replacement.length;

    pushHistory(undoStack, {
      text: currentText,
      selection,
    });
    redoStack.length = 0;
    pendingHistoryEntry = null;
    pendingHistoryInputType = "";
    historyGroup = null;
    compositionHistoryEntry = null;
    window.clearTimeout(compositionCommitTimer);
    compositionCommitTimer = null;
    isComposing.value = false;
    fmText.value = nextText;
    onMarkLegacySource();

    const range = editableRange(element);
    const currentSelection = window.getSelection();
    if (range && currentSelection) {
      range.deleteContents();
      if (replacement) {
        const textNode = document.createTextNode(replacement);
        range.insertNode(textNode);
        range.setStartAfter(textNode);
      }
      range.collapse(true);
      currentSelection.removeAllRanges();
      currentSelection.addRange(range);
    } else {
      refreshPreview({
        selection: { start: nextCaret, end: nextCaret },
      });
    }

    scheduleConversion();
  }

  function onFocus() {
    isEditing.value = true;
  }

  function onBlur() {
    commitComposition();
    flushConversion();
    pendingHistoryEntry = null;
    pendingHistoryInputType = "";
    historyGroup = null;
    isEditing.value = false;
    onLayoutChange();
  }

  function onBeforeInput(event) {
    if (!isEditable.value) return;
    if (pendingClipboardInputType) {
      event.preventDefault();
      clearExpectedClipboardInput();
      return;
    }
    if (
      isComposing.value ||
      event.isComposing ||
      compositionCommitTimer !== null
    ) {
      return;
    }
    if (event.inputType === "historyUndo") {
      event.preventDefault();
      applyHistory(undoStack, redoStack);
      return;
    }
    if (event.inputType === "historyRedo") {
      event.preventDefault();
      applyHistory(redoStack, undoStack);
      return;
    }

    const element = event.currentTarget;
    const selection = editableSelection(element);
    const now = window.performance.now();
    const continuesHistoryGroup =
      GROUPABLE_INPUT_TYPES.has(event.inputType) &&
      historyGroup?.inputType === event.inputType &&
      now - historyGroup.updatedAt <= HISTORY_GROUP_DELAY &&
      historyGroup.selection?.start === selection?.start &&
      historyGroup.selection?.end === selection?.end;

    pendingHistoryEntry = continuesHistoryGroup
      ? null
      : {
          text: editablePlainText(element),
          selection,
        };
    pendingHistoryInputType = event.inputType;
  }

  function onInput(event) {
    const element = elementRef.value;
    if (!element || !isEditable.value) return;
    if (pendingClipboardInputType) {
      clearExpectedClipboardInput();
      refreshPreview({ preserveSelection: true });
      return;
    }
    const nextText = editablePlainText(element);
    if (nextText === fmText.value) {
      pendingHistoryEntry = null;
      pendingHistoryInputType = "";
      return;
    }

    if (
      isComposing.value ||
      event.isComposing ||
      compositionCommitTimer !== null
    ) {
      onResetCopyStatus();
      onMarkLegacySource();
      fmText.value = nextText;
      onConvert();
      return;
    }

    if (pendingHistoryEntry?.text !== nextText) {
      pushHistory(undoStack, pendingHistoryEntry);
    }
    redoStack.length = 0;
    historyGroup = GROUPABLE_INPUT_TYPES.has(pendingHistoryInputType)
      ? {
          inputType: pendingHistoryInputType,
          selection: editableSelection(element),
          updatedAt: window.performance.now(),
        }
      : null;
    pendingHistoryEntry = null;
    pendingHistoryInputType = "";
    fmText.value = nextText;
    scheduleConversion();
  }

  function onCompositionStart(event) {
    if (!isEditable.value) return;
    cancelPendingConversion();
    window.clearTimeout(compositionCommitTimer);
    compositionCommitTimer = null;
    isComposing.value = true;
    compositionHistoryEntry = {
      text: editablePlainText(event.currentTarget),
      selection: editableSelection(event.currentTarget),
    };
    pendingHistoryEntry = null;
    pendingHistoryInputType = "";
    historyGroup = null;
  }

  function onCompositionEnd() {
    isComposing.value = false;
    window.clearTimeout(compositionCommitTimer);
    clearExpectedClipboardInput();
    compositionCommitTimer = window.setTimeout(commitComposition, 0);
  }

  function onCopy(event) {
    const selected = selectedText(event.currentTarget);
    if (!selected) return;
    setClipboardText(event, selected.text);
  }

  function onCut(event) {
    if (!isEditable.value) return;
    const selected = selectedText(event.currentTarget);
    if (!selected || !setClipboardText(event, selected.text)) return;
    expectClipboardInput("deleteByCut");
    replaceSelection(event.currentTarget, selected.selection, "");
  }

  function onPaste(event) {
    if (!isEditable.value || !event.clipboardData) return;
    const selection = editableSelection(event.currentTarget);
    if (!selection) return;
    const text = event.clipboardData
      .getData("text/plain")
      .replace(/\r\n?/gu, "\n");
    event.preventDefault();
    expectClipboardInput("insertFromPaste");
    replaceSelection(event.currentTarget, selection, text);
  }

  function onKeydown(event) {
    if (!isEditable.value || !(event.ctrlKey || event.metaKey) || event.altKey)
      return;
    const key = event.key.toLowerCase();
    if (key === "a") {
      event.preventDefault();
      const range = document.createRange();
      range.selectNodeContents(event.currentTarget);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    } else if (key === "z") {
      event.preventDefault();
      applyHistory(
        event.shiftKey ? redoStack : undoStack,
        event.shiftKey ? undoStack : redoStack,
      );
    } else if (key === "y" && !event.shiftKey) {
      event.preventDefault();
      applyHistory(redoStack, undoStack);
    }
  }

  onBeforeUnmount(() => {
    clearTransientState();
  });

  return {
    isEditing,
    renderedHtml,
    refreshPreview,
    resetHistory,
    cancelPendingConversion,
    clearTransientState,
    flushConversion,
    handlers: {
      focus: onFocus,
      blur: onBlur,
      beforeinput: onBeforeInput,
      input: onInput,
      compositionstart: onCompositionStart,
      compositionend: onCompositionEnd,
      copy: onCopy,
      cut: onCut,
      paste: onPaste,
      keydown: onKeydown,
    },
  };
}
