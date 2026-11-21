import { computed, nextTick, ref, unref } from "vue";

import { waitForReaderLayout } from "@/utils/reader/dom";
import {
  calculateRawColumnPage,
  findFirstContentRawPage,
  findNearestVisibleContentPage,
  hasVisibleContentOnPage,
  measureColumnPageCount,
  roundLayoutPixel,
} from "@/utils/reader/measure-mobile-pages";

export const MOBILE_PAGE_GAP = 32;
export const MOBILE_PAGE_VERTICAL_PADDING = 8;
export const MOBILE_MIN_PAGE_HEIGHT = 160;

export const usePagedGeometry = ({
  sectionRef,
  viewportRef,
  endMarkerRef,
  typography,
  pageGap = MOBILE_PAGE_GAP,
  pageVerticalPadding = MOBILE_PAGE_VERTICAL_PADDING,
  minPageHeight = MOBILE_MIN_PAGE_HEIGHT,
}) => {
  const getPageLineHeight = () =>
    Math.max(1, roundLayoutPixel(typography.value.linePixels));

  const currentPage = ref(1);
  const totalPages = ref(1);
  const pageWidth = ref(1);
  const pageHeight = ref(minPageHeight);
  const pageLineHeight = ref(getPageLineHeight());
  const pageBaselineOffset = ref(0);
  const leadingEmptyPages = ref(0);

  const pageStride = computed(() => pageWidth.value + pageGap);
  const pageOffset = computed(() => (currentPage.value - 1) * pageStride.value);
  // 移动端浏览器偶尔会在多栏布局稳定前保留一个没有内容的首栏。
  // 该偏移只折叠浏览器生成的空栏，不改变对外暴露的章节页码。
  const renderedPageOffset = computed(
    () => pageOffset.value + leadingEmptyPages.value * pageStride.value,
  );
  const paragraphGap = computed(
    () => typography.value.paraHeight * pageLineHeight.value,
  );
  const pageProgress = computed(() =>
    totalPages.value <= 1
      ? 100
      : ((currentPage.value - 1) / (totalPages.value - 1)) * 100,
  );

  const normalizePage = (page) =>
    Math.min(totalPages.value, Math.max(1, Math.trunc(Number(page) || 1)));

  const measureViewportLayout = (viewport) => {
    const viewportRect = viewport.getBoundingClientRect();
    const sectionRect = sectionRef.value?.getBoundingClientRect();
    const visualViewport = window.visualViewport;
    const visualBottom = visualViewport
      ? visualViewport.offsetTop + visualViewport.height
      : window.innerHeight;
    const readerBottom = sectionRect?.bottom ?? visualBottom;
    const availableHeight = Math.max(
      minPageHeight,
      Math.floor(Math.min(readerBottom, visualBottom) - viewportRect.top),
    );
    pageWidth.value = Math.max(1, Math.floor(viewport.clientWidth));
    pageHeight.value = availableHeight;
    // 保持整章行高恒定；不足一行的余量自然留在页面底部。
    pageLineHeight.value = getPageLineHeight();
  };

  const getViewportCssVars = ({
    footnoteReserve = 0,
    chapterEnterOffset = 0,
    snapshot = false,
  } = {}) => ({
    "--reader-page-gap": `${pageGap}px`,
    "--reader-page-width": `${pageWidth.value}px`,
    "--reader-page-height": `${pageHeight.value}px`,
    "--reader-page-line-height": `${pageLineHeight.value}px`,
    ...(snapshot
      ? {}
      : { "--reader-page-baseline-offset": `${pageBaselineOffset.value}px` }),
    "--reader-paragraph-gap": `${paragraphGap.value}px`,
    "--reader-footnote-reserve": `${footnoteReserve}px`,
    "--reader-page-font-size": `${typography.value.fontSize}px`,
    "--reader-page-padding-block": snapshot
      ? `${pageVerticalPadding}px`
      : "var(--mobile-reader-content-padding-block)",
    "--reader-page-offset": `${renderedPageOffset.value}px`,
    "--reader-chapter-offset": snapshot ? "0px" : `${chapterEnterOffset}px`,
  });

  const createPageCoordinates = (chapterEnterOffset) => {
    const getRawRectPage = (rect, viewport = viewportRef.value) =>
      // CSS 多栏会把整数列宽折算成带小数的布局像素。例如声明 343px 时，
      // 后续栏的实际起点可能比理论 stride 小约 0.01px；直接 floor 会把整栏
      // 误判为前一页，继而令脚注归属和页内基线校正全部错页。
      calculateRawColumnPage({
        rect,
        viewport,
        renderedOffset: renderedPageOffset.value,
        chapterOffset: unref(chapterEnterOffset),
        stride: pageStride.value,
      });

    const getRectPage = (rect, viewport = viewportRef.value) => {
      if (!viewport || !rect) return 1;
      return normalizePage(
        getRawRectPage(rect, viewport) - leadingEmptyPages.value,
      );
    };

    const getElementPage = (element) => {
      const viewport = viewportRef.value;
      if (!viewport || !element) return 1;
      const rect =
        element.getClientRects()[0] || element.getBoundingClientRect();
      return getRectPage(rect, viewport);
    };

    const getMeasuredPageCount = (article, viewport) =>
      measureColumnPageCount({
        article,
        endMarker: endMarkerRef.value,
        pageGap,
        stride: pageStride.value,
        leadingEmptyPages: leadingEmptyPages.value,
        getRawRectPage: (rect) => getRawRectPage(rect, viewport),
      });

    const normalizeLeadingEmptyPages = async (article, viewport, isCurrent) => {
      const firstRawPage = findFirstContentRawPage({
        article,
        getRawRectPage: (rect) => getRawRectPage(rect, viewport),
      });
      const nextLeadingEmptyPages = Math.max(0, firstRawPage - 1);
      if (nextLeadingEmptyPages === leadingEmptyPages.value) return true;

      leadingEmptyPages.value = nextLeadingEmptyPages;
      await nextTick();
      await waitForReaderLayout();
      return isCurrent();
    };

    const pageHasVisibleContent = (article, viewport, page) =>
      hasVisibleContentOnPage({
        article,
        page,
        getRectPage: (rect) => getRectPage(rect, viewport),
      });

    const findNearestContentPage = (article, viewport, requestedPage) =>
      findNearestVisibleContentPage({
        article,
        requestedPage,
        totalPages: totalPages.value,
        getRectPage: (rect) => getRectPage(rect, viewport),
      });

    return {
      getRawRectPage,
      getRectPage,
      getElementPage,
      getMeasuredPageCount,
      normalizeLeadingEmptyPages,
      pageHasVisibleContent,
      findNearestContentPage,
    };
  };

  return {
    currentPage,
    totalPages,
    pageWidth,
    pageHeight,
    pageLineHeight,
    pageBaselineOffset,
    leadingEmptyPages,
    pageVerticalPadding,
    pageStride,
    renderedPageOffset,
    paragraphGap,
    pageProgress,
    normalizePage,
    measureViewportLayout,
    getViewportCssVars,
    createPageCoordinates,
  };
};
