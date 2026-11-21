import { waitForReaderLayout } from "./dom.js";

const PAGE_INDEX_EPSILON = 0.5;

export const roundLayoutPixel = (value) => Math.max(0, Math.round(value));

export { waitForReaderLayout };

export const findLastTextRect = (article) => {
  const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
  let lastTextNode = null;
  let node = walker.nextNode();

  while (node) {
    if (
      node.textContent?.trim() &&
      !node.parentElement?.closest(".footnotes")
    ) {
      lastTextNode = node;
    }
    node = walker.nextNode();
  }
  if (!lastTextNode) return null;

  const range = document.createRange();
  const endOffset = lastTextNode.textContent.length;
  range.setStart(lastTextNode, Math.max(0, endOffset - 1));
  range.setEnd(lastTextNode, endOffset);
  const rects = range.getClientRects();
  const rect = rects[rects.length - 1] || null;
  range.detach?.();
  return rect;
};

export const collectReaderBodyTextRects = (article) => {
  if (!article) return [];

  // 正文直接挂在 article 下（渲染层不再包裹额外 div）。章节头不是正文，
  // 其文字不能混入正文基线集合，否则第一页的首末行定位会被标题带偏。
  const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.textContent?.trim()) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (
        !parent ||
        parent.closest(
          ".mobile-chapter-header, [data-markdown-chat], .footnotes, .footnote-ref, .mobile-footnote-page-break, button, [aria-hidden='true']",
        )
      ) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const range = document.createRange();
  const rects = [];
  let node = walker.nextNode();

  while (node) {
    range.selectNodeContents(node);
    Array.from(range.getClientRects()).forEach((rect) => {
      if (rect.width > 0 && rect.height > 0) {
        rects.push({
          bottom: rect.bottom,
          height: rect.height,
          left: rect.left,
          right: rect.right,
          top: rect.top,
          width: rect.width,
          textElement: node.parentElement,
        });
      }
    });
    node = walker.nextNode();
  }
  range.detach?.();
  return rects;
};

export const collectReaderChatFlowRects = (article) =>
  Array.from(
    article.querySelectorAll(
      ":scope > [data-markdown-chat] > :is(.chat-bar, .chat-info, .chat)",
    ),
  ).flatMap((element) => {
    const style = window.getComputedStyle(element);
    const marginEnd = Number.parseFloat(style.marginBlockEnd) || 0;
    return Array.from(element.getClientRects())
      .filter((rect) => rect.width > 0 && rect.height > 0)
      .map((rect) => ({
        bottom: rect.bottom,
        height: rect.height,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        width: rect.width,
        textElement: element,
        flowBlock: true,
        flowMarginEnd: marginEnd,
      }));
  });

export const collectReaderPageFlowRects = (article) => [
  ...collectReaderBodyTextRects(article),
  ...collectReaderChatFlowRects(article),
];

// Markdown 渲染层不再为正文包裹额外 div（RenderedContent 以 Fragment 直接
// 挂载到 article）。移动分页遍历“正文顶层块”时直接使用 article 的直接
// 子元素，但排除章节头与末尾定位点这两个非正文成员。
export const collectMarkdownBodyChildren = (article) =>
  Array.from(article?.children || []).filter(
    (element) =>
      !element.classList.contains("mobile-chapter-header") &&
      !element.classList.contains("mobile-pagination-end"),
  );

// 正文直接挂在 article 下，媒体元素可能出现在任意深度（p、figure、div 等）。
// 旧结构用 `:scope > div img` 这样的后代选择器；现在以 article 为根做后代
// 查询即可得到同样的集合。
export const collectReaderMediaElements = (article) =>
  Array.from(
    article.querySelectorAll(
      "img, video, svg, canvas, table, pre, [data-markdown-chat] > :is(.chat-bar, .chat-info, .chat)",
    ),
  );

let metricsContext;
let baselineMetricsCache = new WeakMap();

export const resetTextBaselineMetrics = () => {
  baselineMetricsCache = new WeakMap();
};

export const calculateTextRectBaseline = (rect) => {
  const element = rect?.textElement;
  if (!metricsContext) {
    metricsContext = document.createElement("canvas").getContext("2d");
  }
  if (!element || !metricsContext) return rect?.bottom || 0;

  let fontMetrics = baselineMetricsCache.get(element);
  if (!fontMetrics) {
    const style = window.getComputedStyle(element);
    metricsContext.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const metrics = metricsContext.measureText("国Ag");
    const ascent =
      metrics.fontBoundingBoxAscent || metrics.actualBoundingBoxAscent || 0;
    const descent =
      metrics.fontBoundingBoxDescent || metrics.actualBoundingBoxDescent || 0;
    fontMetrics = { descent, height: ascent + descent };
    baselineMetricsCache.set(element, fontMetrics);
  }

  const halfLeading = Math.max(0, rect.height - fontMetrics.height) / 2;
  return fontMetrics.height > 0
    ? rect.bottom - fontMetrics.descent - halfLeading
    : rect.bottom;
};

export const calculateReaderFlowBaseline = (rect, baselineOffset) =>
  rect.flowBlock
    ? rect.bottom + (rect.flowMarginEnd || 0) + baselineOffset
    : calculateTextRectBaseline(rect);

export const calculateRawColumnPage = ({
  rect,
  viewport,
  renderedOffset,
  chapterOffset,
  stride,
}) => {
  if (!viewport || !rect || !stride) return 1;
  const rawLogicalLeft =
    rect.left -
    viewport.getBoundingClientRect().left +
    renderedOffset -
    chapterOffset;
  return (
    Math.floor((Math.max(0, rawLogicalLeft) + PAGE_INDEX_EPSILON) / stride) + 1
  );
};

export const createFootnoteLayoutSignature = (grouped) =>
  Object.entries(grouped)
    .map(([page, notes]) => `${page}:${notes.map((note) => note.id).join(",")}`)
    .join("|");

export const measureColumnPageCount = ({
  article,
  endMarker,
  pageGap,
  stride,
  leadingEmptyPages = 0,
  getRawRectPage,
}) => {
  if (!stride) return 1;

  const lastTextRect = findLastTextRect(article);
  const markerRect = endMarker?.getBoundingClientRect();
  const lastTextPage = lastTextRect
    ? Math.max(1, getRawRectPage(lastTextRect) - leadingEmptyPages)
    : 1;
  const markerPage = markerRect
    ? Math.max(1, getRawRectPage(markerRect) - leadingEmptyPages)
    : 1;

  // scrollWidth 在部分移动浏览器的多栏布局中只会返回第一栏宽度；最后一个
  // 正文字符和末尾定位点能直接指出内容最终落在哪一栏。
  const scrollWidthPages = Math.max(
    1,
    Math.ceil((article.scrollWidth + pageGap - 1) / stride) - leadingEmptyPages,
  );

  // 末尾定位点恰好换栏时会落到一个没有正文的额外列；有文本时以最后一个
  // 实际字符为准，避免生成可翻入的空白末页。
  if (lastTextRect) return Math.max(1, lastTextPage);

  return Math.max(1, markerPage, scrollWidthPages);
};

export const findFirstContentRawPage = ({ article, getRawRectPage }) => {
  const contentRects = [
    ...collectReaderBodyTextRects(article),
    ...Array.from(
      article
        .querySelector(":scope > .mobile-chapter-header")
        ?.getClientRects() || [],
    ),
    ...collectReaderMediaElements(article).flatMap((element) =>
      Array.from(element.getClientRects()),
    ),
  ].filter((rect) => rect.width > 0 && rect.height > 0);

  if (!contentRects.length) return 1;
  return Math.min(...contentRects.map((rect) => getRawRectPage(rect)));
};

export const hasVisibleContentOnPage = ({ article, page, getRectPage }) => {
  if (
    collectReaderBodyTextRects(article).some(
      (rect) => getRectPage(rect) === page,
    )
  ) {
    return true;
  }

  const header = article.querySelector(":scope > .mobile-chapter-header");
  if (
    header &&
    Array.from(header.getClientRects()).some(
      (rect) => rect.width > 0 && rect.height > 0 && getRectPage(rect) === page,
    )
  ) {
    return true;
  }

  return collectReaderMediaElements(article).some((element) =>
    Array.from(element.getClientRects()).some(
      (rect) => rect.width > 0 && rect.height > 0 && getRectPage(rect) === page,
    ),
  );
};

export const findNearestVisibleContentPage = ({
  article,
  requestedPage,
  totalPages,
  getRectPage,
}) => {
  const requested = Math.min(
    totalPages,
    Math.max(1, Math.trunc(Number(requestedPage) || 1)),
  );
  if (hasVisibleContentOnPage({ article, page: requested, getRectPage })) {
    return requested;
  }

  for (let distance = 1; distance < totalPages; distance += 1) {
    const after = requested + distance;
    if (
      after <= totalPages &&
      hasVisibleContentOnPage({ article, page: after, getRectPage })
    ) {
      return after;
    }

    const before = requested - distance;
    if (
      before >= 1 &&
      hasVisibleContentOnPage({ article, page: before, getRectPage })
    ) {
      return before;
    }
  }

  return requested;
};
