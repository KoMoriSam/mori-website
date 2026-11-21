import { computed, nextTick, ref } from "vue";

import { alignMobileChapterHeaderBlock } from "@/utils/reader/align-header";
import {
  alignPageEdgeBaselines,
  alignPageFlowBlocksToGrid,
  alignPageStartBaselines,
  clearPageBaselineAdjustments,
  clearPageFlowGridAdjustments,
} from "@/utils/reader/align-mobile-baselines";
import { waitForReaderLayout } from "@/utils/reader/dom";
import {
  collectPageFootnotes,
  extractParagraphCommentText,
  removeFootnotePageBreaks,
  restoreFootnoteParagraphSplits,
} from "@/utils/reader/layout-mobile-footnotes";
import {
  prepareMobileTables,
  restoreMobileTables,
  splitMobileTables,
} from "@/utils/reader/split-mobile-tables";

const DEFAULT_MIN_BODY_LINES = 3;
const DEFAULT_MAX_LAYOUT_PASSES = 64;

export const usePagedFootnoteLayout = ({
  footnoteMeasureRef,
  geometry,
  pageCoords,
  isCurrent,
  minimumBodyLines = DEFAULT_MIN_BODY_LINES,
  maximumPasses = DEFAULT_MAX_LAYOUT_PASSES,
}) => {
  const footnotesByPage = ref({});
  const footnoteReservesByPage = ref({});
  const measuringFootnotes = ref([]);
  const paginationLayoutResetting = ref(false);
  let splitSequence = 0;

  const footnoteReserve = computed(
    () => footnoteReservesByPage.value[geometry.currentPage.value] || 0,
  );
  const currentPageFootnotes = computed(
    () => footnotesByPage.value[geometry.currentPage.value] || [],
  );

  const clearFootnotes = () => {
    footnotesByPage.value = {};
    footnoteReservesByPage.value = {};
    measuringFootnotes.value = [];
  };

  const collect = (article) =>
    collectPageFootnotes({ article, getElementPage: pageCoords.getElementPage });

  const measureReserve = async (notes) => {
    if (!notes.length) return 0;
    measuringFootnotes.value = notes;
    await nextTick();
    await waitForReaderLayout();

    const measuredHeight = footnoteMeasureRef.value?.scrollHeight || 0;
    const lineHeight = geometry.pageLineHeight.value;
    const contentLines = Math.max(
      1,
      Math.floor(
        (geometry.pageHeight.value - geometry.pageVerticalPadding * 2) /
          lineHeight,
      ),
    );
    const maximumHeight =
      Math.max(1, contentLines - minimumBodyLines) * lineHeight;
    return Math.min(
      Math.max(lineHeight, Math.ceil(measuredHeight / lineHeight) * lineHeight),
      maximumHeight,
    );
  };

  const findBreakPosition = (article, viewport, page, reserve) => {
    const footerTop =
      viewport.getBoundingClientRect().top +
      geometry.pageHeight.value -
      geometry.pageVerticalPadding -
      reserve;
    const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.textContent?.trim()) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (
          !parent ||
          parent.closest(
            "[data-markdown-chat], .footnotes, .mobile-footnote-page-break, button, [aria-hidden='true']",
          )
        ) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const range = document.createRange();
    let node = walker.nextNode();

    while (node) {
      range.selectNodeContents(node);
      const overflows = Array.from(range.getClientRects()).some(
        (rect) =>
          pageCoords.getRectPage(rect, viewport) === page &&
          rect.bottom > footerTop,
      );
      if (overflows) {
        for (let offset = 0; offset < node.textContent.length; offset += 1) {
          range.setStart(node, offset);
          range.setEnd(node, offset + 1);
          const rect = range.getClientRects()[0];
          if (
            rect &&
            pageCoords.getRectPage(rect, viewport) === page &&
            rect.bottom > footerTop
          ) {
            range.detach?.();
            return { node, offset };
          }
        }
      }
      node = walker.nextNode();
    }
    range.detach?.();
    return null;
  };

  const splitParagraphAtBreak = ({ node, offset }) => {
    const footnoteReference = node.parentElement?.closest(".footnote-ref");
    const paragraph = (footnoteReference || node.parentElement)?.closest("p");
    if (!paragraph?.parentNode || !node.parentNode) return false;
    // 渲染层不再包裹额外 div，正文段落直接挂在 .mobile-page-article 下。
    const article = paragraph.closest(".mobile-page-article");
    if (paragraph.parentElement !== article) return false;

    const sourceWasContinuation = paragraph.classList.contains(
      "mobile-footnote-continuation",
    );
    const paragraphStartIndent = window.getComputedStyle(paragraph).textIndent;
    let splitToken = paragraph.dataset.mobileFootnoteSplit;
    if (!splitToken) {
      splitToken = `footnote-split-${(splitSequence += 1)}`;
      paragraph.dataset.mobileFootnoteSplit = splitToken;
      paragraph.classList.add("mobile-footnote-split-source");
      if (paragraph.id) {
        paragraph.dataset.readerFullParagraphText =
          extractParagraphCommentText(paragraph);
      }
    }

    const range = document.createRange();
    if (footnoteReference) range.setStartBefore(footnoteReference);
    else range.setStart(node, offset);
    range.setEndAfter(paragraph.lastChild);
    const trailingContent = range.extractContents();
    range.detach?.();
    if (!trailingContent.hasChildNodes()) return false;

    const continuation = paragraph.cloneNode(false);
    continuation.removeAttribute("id");
    continuation.classList.remove(
      "mobile-footnote-split-source",
      "mobile-footnote-split-empty",
      "mobile-footnote-paragraph-start",
      "mobile-page-baseline-adjusted",
    );
    continuation.classList.add("mobile-footnote-continuation");
    continuation.style.removeProperty("--reader-page-baseline-adjust");
    continuation.style.removeProperty("--reader-page-baseline-base-margin");
    continuation.style.removeProperty("--reader-footnote-continuation-indent");
    continuation.dataset.mobileFootnoteSplit = splitToken;
    delete continuation.dataset.readerFullParagraphText;
    continuation.appendChild(trailingContent);
    paragraph.after(continuation);

    if (!extractParagraphCommentText(paragraph).trim()) {
      paragraph.classList.add("mobile-footnote-split-empty");
      if (!sourceWasContinuation) {
        continuation.classList.add("mobile-footnote-paragraph-start");
        continuation.style.setProperty(
          "--reader-footnote-continuation-indent",
          paragraphStartIndent,
        );
      }
    }
    return true;
  };

  const insertPageBreak = (breakPosition) => {
    if (splitParagraphAtBreak(breakPosition)) return;
    const { node, offset } = breakPosition;
    const footnoteReference = node.parentElement?.closest(".footnote-ref");
    const breakElement = document.createElement("span");
    breakElement.className = "mobile-footnote-page-break";
    breakElement.setAttribute("aria-hidden", "true");

    if (footnoteReference?.parentNode) {
      footnoteReference.parentNode.insertBefore(
        breakElement,
        footnoteReference,
      );
    } else if (node.parentNode && offset <= 0) {
      node.parentNode.insertBefore(breakElement, node);
    } else if (node.parentNode) {
      const trailingText = node.splitText(offset);
      trailingText.parentNode?.insertBefore(breakElement, trailingText);
    }
  };

  const rollback = (article) => {
    if (!article?.isConnected) return;
    clearPageBaselineAdjustments(article);
    clearPageFlowGridAdjustments(article);
    restoreMobileTables(article);
    removeFootnotePageBreaks(article);
    restoreFootnoteParagraphSplits(article);
    clearFootnotes();
  };

  const resetPaginationLayout = async (article, token) => {
    if (!article?.isConnected) return false;
    rollback(article);
    geometry.leadingEmptyPages.value = 0;
    paginationLayoutResetting.value = true;
    try {
      await nextTick();
      await waitForReaderLayout();
      if (!isCurrent(token) || !article.isConnected) return false;
    } finally {
      paginationLayoutResetting.value = false;
    }
    await nextTick();
    await waitForReaderLayout();
    return isCurrent(token) && article.isConnected;
  };

  const paginate = async (article, viewport, token) => {
    const current = () => isCurrent(token);
    const setBaselineOffset = (offset) => {
      geometry.pageBaselineOffset.value = offset;
    };
    let completed = false;
    try {
      clearPageBaselineAdjustments(article);
      removeFootnotePageBreaks(article);
      restoreFootnoteParagraphSplits(article);
      prepareMobileTables(article);

      const headerAligned = await alignMobileChapterHeaderBlock({
        article,
        lineHeight: geometry.pageLineHeight.value,
        waitForLayout: waitForReaderLayout,
        isCurrent: current,
      });
      if (!headerAligned) return false;

      const flowAligned = await alignPageFlowBlocksToGrid({
        article,
        viewport,
        pageHeight: geometry.pageHeight.value,
        lineHeight: geometry.pageLineHeight.value,
        pageVerticalPadding: geometry.pageVerticalPadding,
        getRectPage: pageCoords.getRectPage,
        isCurrent: current,
      });
      if (!flowAligned) return false;

      try {
        const splitOk = splitMobileTables({
          article,
          viewport,
          pageHeight: geometry.pageHeight.value,
          pageVerticalPadding: geometry.pageVerticalPadding,
          lineHeight: geometry.pageLineHeight.value,
          isCurrent: current,
        });
        if (!splitOk) {
          console.warn("splitMobileTables returned false", { token });
          return false;
        }
      } catch (error) {
        console.error("splitMobileTables threw", error);
        return false;
      }

      const startAligned = await alignPageStartBaselines({
        article,
        viewport,
        lineHeight: geometry.pageLineHeight.value,
        pageVerticalPadding: geometry.pageVerticalPadding,
        getRectPage: pageCoords.getRectPage,
        getMeasuredPageCount: pageCoords.getMeasuredPageCount,
        onBaselineOffset: setBaselineOffset,
        isCurrent: current,
      });
      if (!startAligned) return false;

      if (!(await pageCoords.normalizeLeadingEmptyPages(article, viewport, current))) {
        return false;
      }

      clearFootnotes();
      await nextTick();
      await waitForReaderLayout();

      const reserveCache = new Map();
      let page = 1;
      let insertedBreaks = 0;
      while (insertedBreaks < maximumPasses) {
        if (!current()) return false;
        geometry.totalPages.value = pageCoords.getMeasuredPageCount(
          article,
          viewport,
        );
        if (page > geometry.totalPages.value) break;

        const notes = collect(article)[page] || [];
        if (notes.length) {
          const cacheKey = notes.map((note) => note.id).join("|");
          let reserve = reserveCache.get(cacheKey);
          if (reserve == null) {
            reserve = await measureReserve(notes);
            reserveCache.set(cacheKey, reserve);
          }
          if (!current()) return false;
          const breakPosition = findBreakPosition(
            article,
            viewport,
            page,
            reserve,
          );
          if (breakPosition) {
            insertPageBreak(breakPosition);
            insertedBreaks += 1;
            await nextTick();
            await waitForReaderLayout();
          }
        }
        page += 1;
      }

      const startRealigned = await alignPageStartBaselines({
        article,
        viewport,
        lineHeight: geometry.pageLineHeight.value,
        pageVerticalPadding: geometry.pageVerticalPadding,
        getRectPage: pageCoords.getRectPage,
        getMeasuredPageCount: pageCoords.getMeasuredPageCount,
        onBaselineOffset: setBaselineOffset,
        isCurrent: current,
      });
      if (!startRealigned) return false;
      if (!(await pageCoords.normalizeLeadingEmptyPages(article, viewport, current))) {
        return false;
      }

      geometry.totalPages.value = pageCoords.getMeasuredPageCount(
        article,
        viewport,
      );
      const finalFootnotes = collect(article);
      const finalReserves = {};
      for (const [pageNumber, notes] of Object.entries(finalFootnotes)) {
        const cacheKey = notes.map((note) => note.id).join("|");
        let reserve = reserveCache.get(cacheKey);
        if (reserve == null) {
          reserve = await measureReserve(notes);
          reserveCache.set(cacheKey, reserve);
        }
        finalReserves[pageNumber] = reserve;
      }

      if (!current()) return false;
      await alignPageEdgeBaselines({
        article,
        viewport,
        reserves: finalReserves,
        pageHeight: geometry.pageHeight.value,
        lineHeight: geometry.pageLineHeight.value,
        pageVerticalPadding: geometry.pageVerticalPadding,
        getRectPage: pageCoords.getRectPage,
        getMeasuredPageCount: pageCoords.getMeasuredPageCount,
        collectPageFootnotes: collect,
        onBaselineOffset: setBaselineOffset,
        isCurrent: current,
      });
      if (!current()) return false;
      if (!(await pageCoords.normalizeLeadingEmptyPages(article, viewport, current))) {
        return false;
      }

      geometry.totalPages.value = pageCoords.getMeasuredPageCount(
        article,
        viewport,
      );
      footnotesByPage.value = collect(article);
      footnoteReservesByPage.value = finalReserves;
      measuringFootnotes.value = [];
      completed = true;
      return true;
    } finally {
      if (!completed) rollback(article);
    }
  };

  return {
    clearFootnotes,
    currentPageFootnotes,
    footnoteReserve,
    footnotesByPage,
    footnoteReservesByPage,
    measuringFootnotes,
    paginatePageFootnotes: paginate,
    paginationLayoutResetting,
    resetPaginationLayout,
    rollbackIncompleteFootnoteLayout: rollback,
  };
};
