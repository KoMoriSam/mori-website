import {
  getMermaidShareScale,
  loadContentImage,
} from "./share-canvas-assets.js";
import {
  collectFontFaceRules,
  getReaderSnapshotFontCSS,
} from "./share-font-embed.js";
import {
  prepareReaderShareSnapshot,
  yieldReaderShareTask,
} from "./share-snapshot.js";
import {
  SHARE_CARD_LAYOUT,
  isCjkDominant,
  setCanvasFont,
  wrapPlainText,
  wrapRuns,
} from "./share-text-layout.js";

const BODY_FONT_SIZES = [48, 46, 44, 42, 40, 38, 36];
const { PADDING: CARD_PADDING, TEXT_WIDTH, TEXT_HEIGHT } = SHARE_CARD_LAYOUT;

export const assertShareActive = (signal) => {
  if (signal?.aborted) throw new DOMException("分享生成已取消", "AbortError");
};

export const getBlockConfig = (block, baseSize, appearance) => {
  const common = {
    x: CARD_PADDING,
    width: TEXT_WIDTH,
    fontSize: baseSize,
    lineHeight: Math.round(baseSize * 1.5),
    family: block.style?.fontFamily || appearance.contentFontFamily,
    bold: false,
    italic: false,
    paddingTop: 0,
    paddingBottom: 0,
    gap: Math.round(baseSize * 0.45),
    align: block.style?.textAlign || "start",
    justify: !["center", "right", "end"].includes(block.style?.textAlign),
  };

  if (block.snapshotAsset) return { ...common, justify: false };

  if (block.type === "heading") {
    const level = Math.min(6, Math.max(1, Number(block.level) || 1));
    const fontSize = Math.round(baseSize * (level <= 2 ? 1.16 : 1.08));
    return {
      ...common,
      fontSize,
      lineHeight: Math.round(fontSize * 1.34),
      bold: true,
      gap: Math.round(baseSize * 0.5),
      justify: false,
    };
  }
  if (block.type === "list-item") {
    const depth = Math.min(Math.max(0, block.depth || 0), 4);
    const indent = 48 + depth * 28;
    return {
      ...common,
      x: CARD_PADDING + indent,
      width: TEXT_WIDTH - indent,
      markerX: CARD_PADDING + depth * 28,
    };
  }
  if (block.type === "quote") {
    const quoteDepth = Math.max(1, Math.min(4, block.depth || 0));
    const indent = 34 + (quoteDepth - 1) * 24;
    return {
      ...common,
      x: CARD_PADDING + indent,
      width: TEXT_WIDTH - indent,
      fontSize: Math.round(baseSize * 0.96),
      lineHeight: Math.round(baseSize * 1.48),
      quoteBarX: CARD_PADDING,
      quoteDepth,
    };
  }
  if (block.type === "code") {
    const fontSize = Math.round(baseSize * 0.74);
    const labelHeight = block.language ? Math.round(fontSize * 0.82) : 0;
    return {
      ...common,
      x: CARD_PADDING + 28,
      width: TEXT_WIDTH - 56,
      fontSize,
      lineHeight: Math.round(fontSize * 1.5),
      family: appearance.monoFamily,
      paddingTop: 20 + labelHeight,
      paddingBottom: 20,
      gap: Math.round(baseSize * 0.45),
      justify: false,
      codeBlock: true,
      labelHeight,
    };
  }
  if (["callout", "chat", "moment", "link-card"].includes(block.type)) {
    const isLinkCard = block.type === "link-card";
    const fontSize = Math.round(baseSize * (isLinkCard ? 0.72 : 0.9));
    const labelHeight = block.label ? Math.round(fontSize * 0.82) : 0;
    const coverWidth = isLinkCard ? Math.round(baseSize * 4) : 0;
    const coverOffset = coverWidth ? coverWidth + 24 : 0;
    return {
      ...common,
      x: CARD_PADDING + 28 + coverOffset,
      width: TEXT_WIDTH - 56 - coverOffset,
      coverWidth,
      fontSize,
      lineHeight: Math.round(fontSize * 1.48),
      paddingTop: 20 + labelHeight,
      paddingBottom: 20,
      gap: Math.round(baseSize * 0.45),
      labelHeight,
      labelFontSize: isLinkCard
        ? Math.round(baseSize * 0.85)
        : Math.max(22, Math.round(fontSize * 0.5)),
      panel: block.type,
      justify: block.type === "callout" && common.justify,
    };
  }
  if (block.type === "table") {
    const fontSize = Math.round(baseSize * 0.8);
    return {
      ...common,
      x: CARD_PADDING + 24,
      width: TEXT_WIDTH - 48,
      fontSize,
      lineHeight: Math.round(fontSize * 1.45),
      paddingTop: 20,
      paddingBottom: 20,
      gap: Math.round(baseSize * 0.45),
      justify: false,
    };
  }
  if (block.type === "mermaid" && block.imageAsset) {
    const scale = getMermaidShareScale(block.imageAsset);
    const imageWidth = block.imageAsset.width * scale;
    const imageHeight = block.imageAsset.height * scale;
    return {
      ...common,
      x: CARD_PADDING + (TEXT_WIDTH - imageWidth) / 2,
      width: imageWidth,
      paddingTop: 24,
      paddingBottom: 24,
      gap: Math.round(baseSize * 0.45),
      justify: false,
      imageWidth,
      imageHeight,
    };
  }
  if (block.type === "image") {
    const fontSize = Math.round(baseSize * 0.68);
    const imageGap = block.imageAsset && block.runs.length ? 18 : 0;
    if (!block.imageAsset) {
      return {
        ...common,
        fontSize,
        lineHeight: Math.round(fontSize * 1.42),
        justify: false,
      };
    }
    const scale = Math.min(
      TEXT_WIDTH / block.imageAsset.width,
      SHARE_CARD_LAYOUT.MERMAID_MAX_HEIGHT / block.imageAsset.height,
    );
    const imageWidth = block.imageAsset.width * scale;
    const imageHeight = block.imageAsset.height * scale;
    return {
      ...common,
      fontSize,
      lineHeight: Math.round(fontSize * 1.42),
      paddingTop: 12,
      paddingBottom: 8,
      justify: false,
      imageX: CARD_PADDING + (TEXT_WIDTH - imageWidth) / 2,
      imageWidth,
      imageHeight,
      imageGap,
    };
  }
  return common;
};

const createBlockLayout = (context, block, baseSize, appearance) => {
  const config = getBlockConfig(block, baseSize, appearance);
  if (block.snapshotAsset) {
    return {
      block,
      config,
      lines: [],
      height: block.snapshotAsset.fullHeight,
      cjkDominant: false,
    };
  }
  if (block.type === "link-card" && block.label) {
    setCanvasFont(context, {
      size: config.labelFontSize,
      family: config.family,
      weight: "700",
    });
    config.labelLines = wrapPlainText(context, block.label, config.width, 2);
    config.labelHeight =
      config.labelLines.length * Math.round(config.labelFontSize * 1.2);
    config.paddingTop = 30 + config.labelHeight;
  }
  if (block.type === "separator") {
    return {
      block,
      config,
      lines: [],
      height: Math.round(baseSize * 0.65),
      cjkDominant: false,
    };
  }
  if (block.type === "table" && block.rows?.length) {
    const columns = Math.max(
      ...block.rows.map((row) =>
        row.cells.reduce((sum, cell) => sum + cell.colSpan, 0),
      ),
    );
    const columnWidth = config.width / columns;
    const padding = Math.round(config.fontSize * 0.35);
    const tableRows = block.rows.map((row) => {
      let column = 0;
      const cells = row.cells.map((cell) => {
        const width = columnWidth * cell.colSpan;
        const cellConfig = {
          ...config,
          x: config.x + column * columnWidth + padding,
          width: width - padding * 2,
          paddingTop: 0,
          paddingBottom: 0,
          bold: cell.header,
        };
        column += cell.colSpan;
        return {
          ...cell,
          config: cellConfig,
          width,
          lines: wrapRuns(context, cell.runs, cellConfig, appearance),
        };
      });
      return {
        cells,
        height:
          padding * 2 +
          Math.max(
            ...cells.map((cell) =>
              cell.lines.reduce((height, line) => height + line.height, 0),
            ),
          ),
      };
    });
    return {
      block,
      config,
      lines: [],
      tableRows,
      cellPadding: padding,
      height:
        config.paddingTop +
        config.paddingBottom +
        tableRows.reduce((sum, row) => sum + row.height, 0),
      cjkDominant: false,
    };
  }
  if (block.type === "mermaid" && block.imageAsset) {
    return {
      block,
      config,
      lines: [],
      height: config.paddingTop + config.paddingBottom + config.imageHeight,
      cjkDominant: false,
    };
  }
  const lines =
    block.type === "image" && !block.runs.length
      ? []
      : wrapRuns(context, block.runs, config, appearance);
  const imageHeight = block.type === "image" ? config.imageHeight || 0 : 0;
  const imageGap = imageHeight && lines.length ? config.imageGap || 0 : 0;
  return {
    block,
    config,
    lines,
    height: Math.max(
      config.coverWidth ? config.coverWidth + 40 : 0,
      config.paddingTop +
        config.paddingBottom +
        imageHeight +
        imageGap +
        lines.reduce((height, line) => height + line.height, 0),
    ),
    cjkDominant: isCjkDominant(block),
  };
};

const layoutBlocks = (context, blocks, baseSize, appearance, maxHeight) => {
  const layouts = [];
  let usedHeight = 0;
  let truncated = false;

  for (const block of blocks) {
    const layout = createBlockLayout(context, block, baseSize, appearance);
    const gap = layouts.length ? layout.config.gap : 0;
    const available = maxHeight - usedHeight - gap;
    if (layout.height <= available) {
      layouts.push(layout);
      usedHeight += gap + layout.height;
      continue;
    }

    if (block.snapshotAsset) {
      if (available > 48) {
        layout.height = available;
        layouts.push(layout);
        usedHeight += gap + available;
      }
      truncated = true;
      break;
    }

    if (layout.tableRows) {
      let height = layout.config.paddingTop + layout.config.paddingBottom;
      const rows = [];
      for (const row of layout.tableRows) {
        if (height + row.height > available) break;
        rows.push(row);
        height += row.height;
      }
      if (rows.length) {
        layout.tableRows = rows;
        layout.height = height;
        layouts.push(layout);
        usedHeight += gap + height;
      }
      truncated = true;
      break;
    }

    if (
      block.type === "mermaid" &&
      block.imageAsset &&
      available > layout.config.paddingTop + layout.config.paddingBottom + 80
    ) {
      const imageRoom =
        available - layout.config.paddingTop - layout.config.paddingBottom;
      const scale = Math.min(1, imageRoom / layout.config.imageHeight);
      layout.config.imageWidth *= scale;
      layout.config.imageHeight *= scale;
      layout.config.width = layout.config.imageWidth;
      layout.config.x =
        CARD_PADDING + (TEXT_WIDTH - layout.config.imageWidth) / 2;
      layout.height = available;
      layouts.push(layout);
      usedHeight += gap + layout.height;
      break;
    }

    if (
      block.type === "image" &&
      block.imageAsset &&
      available > layout.config.paddingTop + layout.config.paddingBottom + 80
    ) {
      const captionHeight = layout.lines.reduce(
        (height, line) => height + line.height,
        0,
      );
      const imageGap = layout.lines.length ? layout.config.imageGap : 0;
      const imageRoom = Math.max(
        80,
        available -
          layout.config.paddingTop -
          layout.config.paddingBottom -
          imageGap -
          captionHeight,
      );
      const scale = Math.min(1, imageRoom / layout.config.imageHeight);
      layout.config.imageWidth *= scale;
      layout.config.imageHeight *= scale;
      layout.config.imageX =
        CARD_PADDING + (TEXT_WIDTH - layout.config.imageWidth) / 2;
      layout.height =
        layout.config.paddingTop +
        layout.config.paddingBottom +
        layout.config.imageHeight +
        imageGap +
        captionHeight;
      if (layout.height <= available) {
        layouts.push(layout);
        usedHeight += gap + layout.height;
        break;
      }
    }

    truncated = true;
    const lineHeightRoom =
      available -
      layout.config.paddingTop -
      layout.config.paddingBottom -
      (layout.config.imageHeight || 0) -
      (layout.lines.length ? layout.config.imageGap || 0 : 0);
    let lineRoom = 0;
    let visibleLineHeight = 0;
    while (
      lineRoom < layout.lines.length &&
      visibleLineHeight + layout.lines[lineRoom].height <= lineHeightRoom
    ) {
      visibleLineHeight += layout.lines[lineRoom].height;
      lineRoom += 1;
    }
    if (lineRoom > 0) {
      layout.lines = layout.lines.slice(0, lineRoom);
      layout.lines.at(-1).isLast = true;
      layout.height =
        layout.config.paddingTop +
        layout.config.paddingBottom +
        (layout.config.imageHeight || 0) +
        (layout.lines.length ? layout.config.imageGap || 0 : 0) +
        layout.lines.reduce((height, line) => height + line.height, 0);
      layouts.push(layout);
      usedHeight += gap + layout.height;
    }
    break;
  }

  if (layouts.length < blocks.length) truncated = true;
  return { layouts, usedHeight, truncated };
};

export const resolveBodyLayout = async (context, blocks, appearance, signal) => {
  const snapshots = new Map();
  let fontFaces;
  const fontCSS = (root, include) =>
    getReaderSnapshotFontCSS(
      root,
      (fontFaces ||= collectFontFaceRules()),
      include,
    );
  try {
    for (const block of blocks.filter((item) => item.snapshot)) {
      snapshots.set(
        block,
        prepareReaderShareSnapshot(block.snapshot, {
          width: TEXT_WIDTH,
          maxHeight: TEXT_HEIGHT,
          loadImage: loadContentImage,
          fontCSS,
        }),
      );
    }
    let selectedSize = BODY_FONT_SIZES.at(-1);
    let result;
    for (const fontSize of BODY_FONT_SIZES) {
      for (const [block, snapshot] of snapshots) {
        block.snapshotAsset = snapshot.measure(fontSize);
      }
      const full = layoutBlocks(context, blocks, fontSize, appearance, Infinity);
      if (full.usedHeight <= TEXT_HEIGHT) {
        selectedSize = fontSize;
        result = full;
        break;
      }
    }
    result ||= layoutBlocks(context, blocks, selectedSize, appearance, TEXT_HEIGHT);
    // 试排阶段只读取 DOM 尺寸；确认字号后再串行栅格化可见快照并主动让出主线程。
    for (const { block } of result.layouts) {
      const snapshot = snapshots.get(block);
      if (!snapshot) continue;
      await yieldReaderShareTask();
      assertShareActive(signal);
      block.snapshotAsset = await snapshot.render(selectedSize);
      assertShareActive(signal);
    }
    return result;
  } finally {
    for (const snapshot of snapshots.values()) snapshot.dispose();
  }
};
