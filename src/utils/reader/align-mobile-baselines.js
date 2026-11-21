import { nextTick } from "vue";

import { waitForReaderLayout } from "./dom.js";
import {
  calculateReaderFlowBaseline,
  calculateTextRectBaseline,
  collectMarkdownBodyChildren,
  collectReaderBodyTextRects,
  collectReaderPageFlowRects,
  createFootnoteLayoutSignature,
  resetTextBaselineMetrics,
} from "./measure-mobile-pages.js";

const IGNORED_GAP_SELECTOR =
  ".footnotes, .footnotes-sep, .mobile-footnote-continuation, .mobile-footnote-split-empty, [aria-hidden='true']";

const sortRectsInReadingOrder = (rects) =>
  rects.sort((left, right) => left.top - right.top || left.left - right.left);

const groupRectsByPage = (rects, viewport, getRectPage) =>
  rects.reduce((grouped, rect) => {
    const page = getRectPage(rect, viewport);
    (grouped[page] ||= []).push(rect);
    return grouped;
  }, {});

const findReferenceBodyRect = (article, bodyRects) => {
  const regularParagraph = article.querySelector(":scope > p");
  return (
    bodyRects.find(
      (rect) => rect.textElement?.closest("p") === regularParagraph,
    ) || bodyRects[0]
  );
};

const findLowestFlowRect = (rects, baselineOffset) =>
  rects.reduce(
    (lowest, rect) =>
      !lowest ||
      calculateReaderFlowBaseline(rect, baselineOffset) >
        calculateReaderFlowBaseline(lowest, baselineOffset)
        ? rect
        : lowest,
    null,
  );

export const clearPageBaselineAdjustments = (article) => {
  article
    .querySelectorAll(
      ".mobile-page-baseline-adjusted, .mobile-page-edge-adjusted",
    )
    .forEach((element) => {
      element.style.removeProperty("--reader-page-baseline-adjust");
      element.style.removeProperty("--reader-page-baseline-base-margin");
      element.style.removeProperty("--reader-page-edge-margin");
      element.classList.remove("mobile-page-baseline-adjusted");
      element.classList.remove("mobile-page-edge-adjusted");
    });
};

export const clearPageFlowGridAdjustments = (article) => {
  article
    .querySelectorAll(".mobile-page-flow-grid-adjusted")
    .forEach((element) => {
      element.style.removeProperty("--reader-flow-grid-base-padding");
      element.style.removeProperty("--reader-flow-grid-adjust");
      element.classList.remove("mobile-page-flow-grid-adjusted");
    });
};

export const alignPageFlowBlocksToGrid = async ({
  article,
  viewport,
  pageHeight,
  lineHeight,
  pageVerticalPadding,
  getRectPage,
  isCurrent,
}) => {
  clearPageFlowGridAdjustments(article);
  await nextTick();
  await waitForReaderLayout();
  if (!isCurrent()) return false;

  if (!viewport || lineHeight <= 0) return true;

  resetTextBaselineMetrics();
  const bodyRects = collectReaderBodyTextRects(article);
  const referenceRect = findReferenceBodyRect(article, bodyRects);
  const baselineOffset = referenceRect
    ? calculateTextRectBaseline(referenceRect) - referenceRect.top
    : 0;
  const gridOrigin =
    viewport.getBoundingClientRect().top + pageVerticalPadding + baselineOffset;

  // 正文直接挂在 article 下（渲染层不再包裹 div）。直接遍历 article 的
  // 子元素，排除章节头与末尾定位点这些非正文成员。
  const flowBlocks = collectMarkdownBodyChildren(article).flatMap((element) => {
    if (element.classList.contains("moments-card")) return [];
    if (!element.matches("[data-markdown-chat]")) return [element];
    return Array.from(
      element.querySelectorAll(":scope > :is(.chat-bar, .chat-info, .chat)"),
    );
  });

  // 本轮统一读取所有块的几何信息。后面的容量判断只查缓存，避免每处理一个
  // 聊天气泡都重新测量其余气泡，长聊天记录也保持线性布局读取次数。
  const flowMeasurements = flowBlocks.map((element) => ({
    element,
    style: window.getComputedStyle(element),
    rects: Array.from(element.getClientRects()).filter(
      (rect) => rect.width > 0 && rect.height > 0,
    ),
  }));
  const followingPageExtents = new Array(flowMeasurements.length);
  const lowestFollowingByPage = new Map();
  const lowestFollowingChatByPage = new Map();

  for (let index = flowMeasurements.length - 1; index >= 0; index -= 1) {
    const measurement = flowMeasurements[index];
    const currentPage = measurement.rects[0]
      ? getRectPage(measurement.rects[0], viewport)
      : 0;
    followingPageExtents[index] = {
      lastFollowingEntry: lowestFollowingByPage.get(currentPage) || null,
      lastFollowingChatEntry:
        lowestFollowingChatByPage.get(currentPage) || null,
    };

    const isChatBlock = measurement.element.matches(
      ".chat-bar, .chat-info, .chat",
    );
    measurement.rects.forEach((rect) => {
      const page = getRectPage(rect, viewport);
      const entry = { element: measurement.element, rect };
      const lowestEntry = lowestFollowingByPage.get(page);
      if (!lowestEntry || rect.bottom > lowestEntry.rect.bottom) {
        lowestFollowingByPage.set(page, entry);
      }
      const lowestChatEntry = lowestFollowingChatByPage.get(page);
      if (
        isChatBlock &&
        (!lowestChatEntry || rect.bottom > lowestChatEntry.rect.bottom)
      ) {
        lowestFollowingChatByPage.set(page, entry);
      }
    });
  }

  const adjustments = [];
  const plannedPageShift = new Map();
  const viewportBottom =
    viewport.getBoundingClientRect().top + pageHeight - pageVerticalPadding;
  for (const [elementIndex, measurement] of flowMeasurements.entries()) {
    const { element, rects, style } = measurement;
    if (
      element.matches(
        `p, blockquote, .markdown-table-wrapper, ${IGNORED_GAP_SELECTOR}`,
      )
    ) {
      continue;
    }

    // 聊天气泡同样必须只有一个外框 rect；若单条消息高于整页而被浏览器
    // 强制拆开，就不能把多个 fragment 的高度相加后补到其中一栏。
    if (
      rects.length !== 1 ||
      style.display === "none" ||
      style.position === "absolute" ||
      style.position === "fixed"
    ) {
      continue;
    }

    const blockHeight = rects[0].height;
    const marginStart = Number.parseFloat(style.marginBlockStart) || 0;
    const marginEnd = Number.parseFloat(style.marginBlockEnd) || 0;
    const blockAdvance = blockHeight + marginStart + marginEnd;
    const remainder = ((blockAdvance % lineHeight) + lineHeight) % lineHeight;
    let adjustment = remainder < 0.5 ? 0 : lineHeight - remainder;

    // 正文标题使用大字号衬线字体，其文字基线偏移与普通正文不同。只将
    // h1/h2 的外框高度补成整行仍可能让标题后的正文落在半格位置，因此
    // 直接检查它之后第一条正文基线的相位，和引用块一样按实际流位移补齐。
    if (element.matches("h1, h2, h3, h4, h5, h6") && referenceRect) {
      const followingRect = bodyRects.find(
        (rect) =>
          rect.textElement &&
          !element.contains(rect.textElement) &&
          Boolean(
            element.compareDocumentPosition(rect.textElement) &
              Node.DOCUMENT_POSITION_FOLLOWING,
          ),
      );
      if (followingRect) {
        const baseline = calculateTextRectBaseline(followingRect);
        const phase =
          (((baseline - gridOrigin) % lineHeight) + lineHeight) % lineHeight;
        adjustment =
          phase < 0.5 || lineHeight - phase < 0.5 ? 0 : lineHeight - phase;
      }
    }

    if (adjustment < 0.5 || adjustment > lineHeight - 0.5) continue;

    const isChatBlock = element.matches(".chat-bar, .chat-info, .chat");
    const elementPage = getRectPage(rects[0], viewport);
    const currentPageShift = plannedPageShift.get(elementPage) || 0;
    const { lastFollowingEntry, lastFollowingChatEntry } =
      followingPageExtents[elementIndex];
    const exceedsPage = (rect) =>
      rect &&
      rect.bottom + currentPageShift + adjustment > viewportBottom + 0.5;
    const movesCurrentBlock = exceedsPage(rects[0]);
    const movesFollowingChatBlock = exceedsPage(lastFollowingChatEntry?.rect);
    const changesNaturalPageBreak = exceedsPage(lastFollowingEntry?.rect);

    if (
      movesFollowingChatBlock ||
      (isChatBlock && (movesCurrentBlock || changesNaturalPageBreak))
    ) {
      // 外框补齐不能改变自然分页归属。若不足一行的 padding 会把当前气泡
      // 或本页后续内容挤到下一页，本页不补；前置特殊块也不能挤走后续 chat。
      continue;
    }

    const basePadding = Number.parseFloat(style.paddingBlockEnd) || 0;
    adjustments.push({ element, basePadding, adjustment });
    plannedPageShift.set(elementPage, currentPageShift + adjustment);
  }

  adjustments.forEach(({ element, basePadding, adjustment }) => {
    element.classList.add("mobile-page-flow-grid-adjusted");
    element.style.setProperty(
      "--reader-flow-grid-base-padding",
      `${basePadding}px`,
    );
    element.style.setProperty("--reader-flow-grid-adjust", `${adjustment}px`);
  });
  if (adjustments.length) {
    await nextTick();
    await waitForReaderLayout();
  }

  return isCurrent();
};

const getPageBlockGapCandidates = (
  article,
  viewport,
  page,
  firstRect,
  getRectPage,
) => {
  const flowBlocks = [
    ...collectMarkdownBodyChildren(article).flatMap((element) =>
      element.matches("[data-markdown-chat]")
        ? Array.from(
            element.querySelectorAll(
              ":scope > :is(.chat-bar, .chat-info, .chat)",
            ),
          )
        : [element],
    ),
    ...Array.from(
      article.querySelectorAll(
        "blockquote > p, blockquote > ul, blockquote > ol",
      ),
    ),
  ];

  return [...new Set(flowBlocks)].filter((element) => {
    const isFirstChatBlock =
      element.matches(".chat-bar, .chat-info, .chat") &&
      !element.previousElementSibling &&
      element.parentElement?.matches("[data-markdown-chat]");
    if (
      (!element.previousElementSibling &&
        !(isFirstChatBlock && element.parentElement.previousElementSibling)) ||
      element.matches(IGNORED_GAP_SELECTOR)
    ) {
      return false;
    }

    const computedStyle = window.getComputedStyle(element);
    if (
      computedStyle.display === "none" ||
      computedStyle.display === "inline" ||
      computedStyle.position === "absolute" ||
      computedStyle.position === "fixed" ||
      element.getClientRects()[0]?.height <= 0
    ) {
      return false;
    }

    const firstElementRect = element.getClientRects()[0];
    return (
      firstElementRect &&
      getRectPage(firstElementRect, viewport) === page &&
      firstElementRect.top > firstRect.top + 1
    );
  });
};

const getPageStartGapElement = (
  article,
  firstRect,
  viewport,
  page,
  getRectPage,
) => {
  let element = firstRect.textElement;
  while (element && element !== article) {
    const parent = element.parentElement;
    const isTopLevelGap =
      parent === article &&
      element.previousElementSibling &&
      !element.matches(IGNORED_GAP_SELECTOR);
    const isNestedGap =
      parent?.matches("blockquote, li") &&
      element.matches("p, ul, ol, blockquote") &&
      element.previousElementSibling;
    const firstElementRect = element.getClientRects()[0];

    if (
      (isTopLevelGap || isNestedGap) &&
      firstElementRect &&
      getRectPage(firstElementRect, viewport) === page
    ) {
      return element;
    }
    element = parent;
  }
  return null;
};

export const getFeasibleGridAdjustment = (
  baseline,
  targetBaseline,
  lineHeight,
  currentGap,
  {
    minBaseline = Number.NEGATIVE_INFINITY,
    maxBaseline = Number.POSITIVE_INFINITY,
  } = {},
) => {
  const rawAdjustment = targetBaseline - baseline;
  const approximateGridStep = Math.round(-rawAdjustment / lineHeight);
  const candidates = [];

  for (
    let step = approximateGridStep - 2;
    step <= approximateGridStep + 2;
    step += 1
  ) {
    const adjustment = rawAdjustment + step * lineHeight;
    const adjustedBaseline = baseline + adjustment;
    if (
      currentGap + adjustment >= -0.5 &&
      adjustedBaseline >= minBaseline &&
      adjustedBaseline <= maxBaseline
    ) {
      candidates.push(adjustment);
    }
  }

  return candidates.sort((left, right) => Math.abs(left) - Math.abs(right))[0];
};

// 恰好落在栏顶的段落可能保留了小数段前距；先修正页首相位，
// 后续页尾对齐只需分摊剩余的底部误差。
export const alignPageStartBaselines = async ({
  article,
  viewport,
  lineHeight,
  pageVerticalPadding,
  getRectPage,
  getMeasuredPageCount,
  onBaselineOffset,
  isCurrent,
}) => {
  const bodyRects = collectReaderBodyTextRects(article);
  const referenceRect = findReferenceBodyRect(article, bodyRects);
  if (!referenceRect || lineHeight <= 0) return true;

  const viewportTop = viewport.getBoundingClientRect().top;
  const baselineOffset =
    calculateTextRectBaseline(referenceRect) - referenceRect.top;
  const targetBaseline = viewportTop + pageVerticalPadding + baselineOffset;
  onBaselineOffset?.(baselineOffset);

  for (let pass = 0; pass < 3; pass += 1) {
    const adjustments = [];
    const pageCount = getMeasuredPageCount(article, viewport);
    const pageRects = groupRectsByPage(
      collectReaderBodyTextRects(article),
      viewport,
      getRectPage,
    );

    for (let page = 1; page <= pageCount; page += 1) {
      if (!isCurrent()) return false;
      const firstRect = pageRects[page]
        ? sortRectsInReadingOrder(pageRects[page])[0]
        : null;
      if (!firstRect) continue;

      const gapElement = getPageStartGapElement(
        article,
        firstRect,
        viewport,
        page,
        getRectPage,
      );
      if (!gapElement) continue;

      const currentGap =
        Number.parseFloat(
          window.getComputedStyle(gapElement).marginBlockStart,
        ) || 0;
      const firstFlowElement = firstRect.textElement?.closest(
        "h1, h2, h3, h4, h5, h6",
      );
      const alignsSpecialBlockTop = firstFlowElement?.parentElement === article;
      const measuredBaseline = alignsSpecialBlockTop
        ? firstFlowElement.getClientRects()[0]?.top
        : calculateTextRectBaseline(firstRect);
      const expectedBaseline = alignsSpecialBlockTop
        ? viewportTop + pageVerticalPadding
        : targetBaseline;
      const adjustment = getFeasibleGridAdjustment(
        measuredBaseline,
        expectedBaseline,
        lineHeight,
        currentGap,
        {
          minBaseline: expectedBaseline - 0.5,
          maxBaseline: expectedBaseline + 0.5,
        },
      );
      if (!Number.isFinite(adjustment) || Math.abs(adjustment) < 0.25) {
        continue;
      }

      adjustments.push({ gapElement, currentGap, adjustment });
    }

    if (!adjustments.length) break;
    adjustments.forEach(({ gapElement, currentGap, adjustment }) => {
      gapElement.classList.add("mobile-page-baseline-adjusted");
      gapElement.style.setProperty(
        "--reader-page-baseline-base-margin",
        `${currentGap}px`,
      );
      gapElement.style.setProperty(
        "--reader-page-baseline-adjust",
        `${adjustment}px`,
      );
    });
    await nextTick();
    await waitForReaderLayout();
  }

  return isCurrent();
};

const distributePageGapAdjustment = (candidates, adjustment) => {
  const records = candidates.map((element) => ({
    element,
    baseMargin:
      Number.parseFloat(window.getComputedStyle(element).marginBlockStart) || 0,
  }));
  if (!records.length) return [];

  const totalCurrentGap = records.reduce(
    (total, record) => total + record.baseMargin,
    0,
  );
  const targetMargin =
    (totalCurrentGap + adjustment) / Math.max(1, records.length);
  if (targetMargin < -0.5) return [];

  // 不论本轮是扩张还是压缩，都让本页所有实际块间距落到同一个值。
  // 这样被压进页尾的新段落不会保留原始段距，形成末尾忽松忽紧。
  return records.map((record) => ({
    ...record,
    targetMargin: Math.max(0, targetMargin),
  }));
};

const applyPageGapRecords = (records) => {
  records.forEach(({ element, targetMargin }) => {
    element.classList.add("mobile-page-edge-adjusted");
    element.style.setProperty("--reader-page-edge-margin", `${targetMargin}px`);
  });
};

// CSS 多栏会在每栏顶部重新排正文，但段距和脚注会留下不足一行的剩余空间。
// 把任意段距产生的相位差平均分摊到页内已有块间距，不移动首行，
// 也不制造额外页或改变脚注归属。
export const alignPageEdgeBaselines = async ({
  article,
  viewport,
  reserves,
  pageHeight,
  lineHeight,
  pageVerticalPadding,
  getRectPage,
  getMeasuredPageCount,
  collectPageFootnotes,
  onBaselineOffset,
  isCurrent,
}) => {
  if (lineHeight <= 0) return;
  resetTextBaselineMetrics();

  const pageCount = getMeasuredPageCount(article, viewport);
  const viewportTop = viewport.getBoundingClientRect().top;
  const bodyRects = collectReaderBodyTextRects(article);
  const pageRects = groupRectsByPage(
    collectReaderPageFlowRects(article),
    viewport,
    getRectPage,
  );
  const referenceRect = findReferenceBodyRect(article, bodyRects);
  if (!referenceRect) return;

  // 整章网格必须由普通正文定义。若第一页先出现小字号引用块，不能用它的
  // 字体基线偏移带偏后续所有普通正文页面。
  const baselineOffset =
    calculateTextRectBaseline(referenceRect) - referenceRect.top;
  onBaselineOffset?.(baselineOffset);
  const pendingAdjustments = [];

  for (let page = 1; page <= pageCount; page += 1) {
    if (!isCurrent()) return;

    const rects = sortRectsInReadingOrder(pageRects[page] || []);
    if (!rects.length) continue;

    const firstRect = rects[0];
    const lastRect = findLowestFlowRect(rects, baselineOffset);
    const bodyBottom =
      viewportTop + pageHeight - pageVerticalPadding - (reserves[page] || 0);
    const firstGridBottom = viewportTop + pageVerticalPadding + baselineOffset;
    const availableGridHeight = bodyBottom - firstGridBottom;
    if (availableGridHeight < 0) continue;

    // baseline 本身不能贴到正文底边：不同字号、字体和引用块在 baseline
    // 下方仍有不同高度。先扣除当前末行的真实下沿，避免算出一个视觉上
    // 已越界的目标，随后又被校验逻辑回滚，造成校正时有时无。
    const lastBaselineToBottom = lastRect.flowBlock
      ? 0
      : Math.max(0, lastRect.bottom - calculateTextRectBaseline(lastRect));
    const targetLastBaseline =
      firstGridBottom +
      Math.floor(
        (availableGridHeight - lastBaselineToBottom + 0.5) / lineHeight,
      ) *
        lineHeight;
    const candidates = getPageBlockGapCandidates(
      article,
      viewport,
      page,
      firstRect,
      getRectPage,
    );
    if (!candidates.length) continue;

    const totalGapCapacity = candidates.reduce(
      (total, element) =>
        total +
        (Number.parseFloat(window.getComputedStyle(element).marginBlockStart) ||
          0),
      0,
    );
    // 页尾需要命中本页最下方的目标基线，而不是任意一条同相位网格线。
    // 旧逻辑会在 target - 1/2 个行高处优先选中 0 调整量，导致页面虽然
    // “在网格上”，末行却高低不一；直接使用到目标末基线的实际距离。
    const adjustment =
      targetLastBaseline -
      calculateReaderFlowBaseline(lastRect, baselineOffset);

    if (
      !Number.isFinite(adjustment) ||
      Math.abs(adjustment) < 0.25 ||
      adjustment < -totalGapCapacity - 0.5 ||
      // 末页保持自然收尾，避免把少量正文拉伸到整页高度；其余页面允许
      // 引用块等不可拆分元素造成的多行留白被均匀分摊到现有块间距。
      (page === pageCount && adjustment > lineHeight * 1.05)
    ) {
      continue;
    }

    const adjustmentRecords = distributePageGapAdjustment(
      candidates,
      adjustment,
    );
    if (!adjustmentRecords.length) continue;
    pendingAdjustments.push({
      page,
      bodyBottom,
      targetLastBaseline,
      adjustmentRecords,
    });
  }

  if (!pendingAdjustments.length || !isCurrent()) return;
  const footnotesBefore = createFootnoteLayoutSignature(
    collectPageFootnotes(article),
  );
  pendingAdjustments.forEach(({ adjustmentRecords }) =>
    applyPageGapRecords(adjustmentRecords),
  );
  await nextTick();
  await waitForReaderLayout();
  if (!isCurrent()) return;

  // 负向校正可能把原本位于下一栏的末段（甚至连续短段）拉回本页。
  // 这些新进入本页的块不在首次候选集合中，需要按分页后的真实成员重新
  // 计算统一段距；否则页尾保留原段距，而前面的段距已经被收紧。
  for (let pass = 0; pass < 3; pass += 1) {
    const convergingPageRects = groupRectsByPage(
      collectReaderPageFlowRects(article),
      viewport,
      getRectPage,
    );
    let changed = false;

    pendingAdjustments.forEach((record) => {
      const rects = sortRectsInReadingOrder(
        convergingPageRects[record.page] || [],
      );
      if (!rects.length) return;

      const firstRect = rects[0];
      const lastRect = findLowestFlowRect(rects, baselineOffset);
      const remainingAdjustment =
        record.targetLastBaseline -
        calculateReaderFlowBaseline(lastRect, baselineOffset);
      const candidates = getPageBlockGapCandidates(
        article,
        viewport,
        record.page,
        firstRect,
        getRectPage,
      );
      const nextRecords = distributePageGapAdjustment(
        candidates,
        remainingAdjustment,
      );
      if (!nextRecords.length) return;

      const targetMargin = nextRecords[0].targetMargin;
      const hasNewCandidate = nextRecords.some(
        ({ element }) =>
          !record.adjustmentRecords.some(
            ({ element: currentElement }) => currentElement === element,
          ),
      );
      const hasUnevenMargin = nextRecords.some(
        ({ element }) =>
          Math.abs(
            (Number.parseFloat(
              window.getComputedStyle(element).marginBlockStart,
            ) || 0) - targetMargin,
          ) > 0.25,
      );
      if (
        Math.abs(remainingAdjustment) <= 0.75 &&
        !hasNewCandidate &&
        !hasUnevenMargin
      ) {
        return;
      }

      const elements = new Map(
        record.adjustmentRecords.map((item) => [item.element, item]),
      );
      nextRecords.forEach((item) => elements.set(item.element, item));
      record.adjustmentRecords = [...elements.values()];
      applyPageGapRecords(nextRecords);
      changed = true;
    });

    if (!changed) break;
    await nextTick();
    await waitForReaderLayout();
    if (!isCurrent()) return;
  }

  const adjustedPageRects = groupRectsByPage(
    collectReaderPageFlowRects(article),
    viewport,
    getRectPage,
  );
  const footnotesChanged =
    createFootnoteLayoutSignature(collectPageFootnotes(article)) !==
    footnotesBefore;
  const invalidRecords = pendingAdjustments.filter(
    ({ page, bodyBottom, targetLastBaseline }) => {
      const adjustedLastRect = findLowestFlowRect(
        adjustedPageRects[page] || [],
        baselineOffset,
      );
      return (
        footnotesChanged ||
        !adjustedLastRect ||
        Math.abs(
          calculateReaderFlowBaseline(adjustedLastRect, baselineOffset) -
            targetLastBaseline,
        ) > 0.75 ||
        adjustedLastRect.bottom > bodyBottom + 1
      );
    },
  );

  if (!invalidRecords.length) return;
  invalidRecords.forEach(({ adjustmentRecords }) => {
    adjustmentRecords.forEach(({ element }) => {
      element.style.removeProperty("--reader-page-edge-margin");
      element.classList.remove("mobile-page-edge-adjusted");
    });
  });
  await nextTick();
  await waitForReaderLayout();
};
