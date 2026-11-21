import {
  drawRoundedRect,
  mixColors,
  withAlpha,
} from "./share-canvas-assets.js";
import {
  SHARE_CARD_LAYOUT,
  fitEllipsis,
  getRunFont,
  getTokenPositions,
  setCanvasFont,
} from "./share-text-layout.js";

const { PADDING: CARD_PADDING, TEXT_TOP, TEXT_WIDTH } = SHARE_CARD_LAYOUT;

const SYNTAX_ALIASES = {
  built_in: "title",
  class: "title",
  function: "title",
  params: "variable",
  property: "attr",
  "selector-tag": "tag",
  template_variable: "variable",
};

const drawTokenBackgrounds = (
  context,
  positions,
  baseline,
  config,
  appearance,
) => {
  let group = null;
  const flush = () => {
    if (!group) return;
    context.fillStyle = withAlpha(appearance.warning, 0.88);
    drawRoundedRect(
      context,
      group.x - 3,
      baseline - config.fontSize * 0.84,
      group.width + 6,
      config.fontSize * 1.08,
      5,
    );
    context.fill();
    group = null;
  };

  positions.forEach(({ token, x }, index) => {
    const kind = token.style.mark ? "mark" : "";
    const nextX = positions[index + 1]?.x ?? x + token.width;
    if (!kind) {
      flush();
      return;
    }
    if (!group || group.kind !== kind) {
      flush();
      group = { kind, x, width: nextX - x };
    } else {
      group.width = nextX - group.x;
    }
  });
  flush();
};

const resolveSyntaxColor = (syntax, appearance) =>
  syntax
    ? appearance.syntax[syntax] ||
      appearance.syntax[SYNTAX_ALIASES[syntax]] ||
      ""
    : "";

const drawInlineLinkIcon = (context, token, x, baseline, config, appearance) => {
  const iconSize = token.iconSize;
  const imageSize = config.fontSize * 0.5;
  const iconY = baseline - iconSize * 0.86;
  const image = token.style.linkIconAsset;
  const naturalWidth = image.naturalWidth || image.width || 1;
  const naturalHeight = image.naturalHeight || image.height || 1;
  const scale = Math.min(imageSize / naturalWidth, imageSize / naturalHeight);
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;

  context.save();
  context.fillStyle = "#ffffff";
  context.strokeStyle = mixColors(
    appearance.primaryContent,
    appearance.accent,
    0.5,
  );
  context.lineWidth = Math.max(1, config.fontSize / 48);
  drawRoundedRect(context, x, iconY, iconSize, iconSize, iconSize / 2);
  context.fill();
  context.stroke();
  context.clip();
  context.drawImage(
    image,
    x + (iconSize - width) / 2,
    iconY + (iconSize - height) / 2,
    width,
    height,
  );
  context.restore();
};

const drawRichLine = (context, line, baseline, layout, appearance) => {
  const { config } = layout;
  const shouldJustify =
    config.justify && layout.cjkDominant && !line.isLast && !line.hardBreak;
  const positions = getTokenPositions(line, config, shouldJustify);
  drawTokenBackgrounds(context, positions, baseline, config, appearance);

  positions.forEach(({ token, x }, positionIndex) => {
    if (token.style.inlineImageAsset) {
      context.save();
      if (token.style.inlineImageSvg) {
        context.filter = appearance.markdownSvgFilter;
      }
      context.drawImage(
        token.style.inlineImageAsset,
        x,
        baseline - token.inlineImageAscent,
        token.inlineImageWidth,
        token.inlineImageHeight,
      );
      context.restore();
      return;
    }
    if (token.style.linkIcon && token.style.linkIconAsset) {
      drawInlineLinkIcon(context, token, x, baseline, config, appearance);
      return;
    }
    if (token.style.mathAsset) {
      context.drawImage(
        token.style.mathAsset.image,
        x + token.mathLeadingWidth,
        baseline - token.mathHeight - token.mathBaselineShift,
        token.mathWidth,
        token.mathHeight,
      );
      return;
    }
    setCanvasFont(context, getRunFont(token.style, config, appearance));
    const syntaxColor = resolveSyntaxColor(token.style.syntax, appearance);
    context.fillStyle = token.style.mark
      ? appearance.warningContent
      : token.style.link
        ? appearance.accent
        : syntaxColor || appearance.foreground;
    const textX =
      x +
      (token.width - token.textWidth) / (token.style.externalLinkIcon ? 1 : 2);
    const textY =
      token.style.baseline === "sup"
        ? baseline - config.fontSize * 0.38
        : token.style.baseline === "sub"
          ? baseline + config.fontSize * 0.2
          : baseline;
    context.fillText(token.text, textX, textY);

    if (token.style.ruby) {
      setCanvasFont(
        context,
        getRunFont(
          { ...token.style, baseline: "", fontWeight: "" },
          config,
          appearance,
          Math.round(config.fontSize * 0.46),
        ),
      );
      context.fillText(
        token.style.ruby,
        x + (token.width - token.rubyWidth) / 2,
        baseline - config.fontSize * 0.82,
      );
    }

    if (
      token.style.link ||
      token.style.underline ||
      token.style.abbr ||
      token.style.strike
    ) {
      context.save();
      context.strokeStyle = context.fillStyle;
      context.lineWidth = Math.max(1.5, config.fontSize / 28);
      if (token.style.abbr) {
        context.setLineDash([context.lineWidth, context.lineWidth * 1.5]);
      }
      const y = token.style.strike
        ? textY - config.fontSize * 0.3
        : textY + config.fontSize * 0.12;
      context.beginPath();
      context.moveTo(textX, y);
      const next = positions[positionIndex + 1];
      const continues =
        next &&
        ((token.style.link &&
          next.token.style.link &&
          token.style.linkHref === next.token.style.linkHref) ||
          (token.style.underline && next.token.style.underline));
      context.lineTo(continues ? next.x : textX + token.textWidth, y);
      context.stroke();
      context.restore();
    }
  });
};

const getTaskMarkerColor = (block, appearance) =>
  block.taskTone === "muted"
    ? appearance.foreground
    : appearance[block.taskTone] || appearance.accent;

const drawTaskMarker = (context, block, config, baseline, appearance) => {
  const color = getTaskMarkerColor(block, appearance);
  const centerX = config.markerX + config.fontSize * 0.3;
  const centerY = baseline - config.fontSize * 0.34;
  const radius = config.fontSize * 0.27;
  const completed = block.taskStatus === "x" || block.taskStatus === "X";
  const cancelled = block.taskStatus === "-";
  const opacity = block.taskTone === "muted" ? 0.58 : 1;

  context.save();
  if (block.markerGlyph && block.markerFontFamily) {
    setCanvasFont(context, {
      size: Math.round(config.fontSize * 0.82),
      family: block.markerFontFamily,
    });
    context.fillStyle = withAlpha(color, opacity);
    context.textAlign = "left";
    context.textBaseline = "middle";
    const bounds = context.measureText(block.markerGlyph);
    context.fillText(
      block.markerGlyph,
      config.markerX + 3 + Math.max(0, bounds.actualBoundingBoxLeft || 0),
      centerY + 1,
    );
    context.restore();
    return;
  }

  context.lineWidth = Math.max(2.5, config.fontSize * 0.065);
  context.strokeStyle = withAlpha(color, opacity);
  context.fillStyle = withAlpha(color, opacity);
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  if (completed) {
    context.fill();
  } else {
    if (block.taskStatus !== " ") {
      context.fillStyle = withAlpha(color, opacity * 0.14);
      context.fill();
    }
    context.stroke();
  }

  if (completed) {
    context.strokeStyle = appearance.successContent;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(centerX - radius * 0.48, centerY);
    context.lineTo(centerX - radius * 0.12, centerY + radius * 0.34);
    context.lineTo(centerX + radius * 0.52, centerY - radius * 0.4);
    context.stroke();
  } else if (block.taskStatus !== " ") {
    setCanvasFont(context, {
      size: Math.round(config.fontSize * (cancelled ? 0.62 : 0.5)),
      family: appearance.uiFontFamily,
      weight: "700",
    });
    context.fillStyle = withAlpha(color, opacity);
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(block.marker || "•", centerX, centerY + 1);
  }
  context.restore();
};

const drawBlockFrame = (context, layout, y, appearance) => {
  const { block, config } = layout;
  if (config.codeBlock) {
    context.fillStyle = appearance.base200;
    drawRoundedRect(context, CARD_PADDING, y, TEXT_WIDTH, layout.height, 16);
    context.fill();
  }
  if (config.panel) {
    const toneColor =
      config.panel === "callout"
        ? appearance[block.tone] || appearance.accent
        : appearance.base300;
    context.fillStyle =
      config.panel === "callout"
        ? withAlpha(toneColor, 0.14)
        : withAlpha(appearance.base200, 0.92);
    drawRoundedRect(context, CARD_PADDING, y, TEXT_WIDTH, layout.height, 16);
    context.fill();
    if (config.panel === "callout") {
      context.fillStyle = toneColor;
      drawRoundedRect(context, CARD_PADDING, y, 7, layout.height, 4);
      context.fill();
    }
  }
  if (config.quoteBarX !== undefined) {
    context.fillStyle = withAlpha(appearance.accent, 0.72);
    for (let depth = 0; depth < (config.quoteDepth || 1); depth += 1) {
      drawRoundedRect(
        context,
        config.quoteBarX + depth * 24,
        y,
        7,
        layout.height,
        4,
      );
      context.fill();
    }
  }
};

const drawBlockLabel = (context, block, config, y, appearance) => {
  if (!config.labelHeight || (!block.label && !block.language)) return;
  const label = block.label || block.language;
  const labelColor =
    block.type === "callout"
      ? appearance[block.tone] || appearance.accent
      : appearance.accent;
  setCanvasFont(context, {
    size: config.labelFontSize || Math.max(22, Math.round(config.fontSize * 0.5)),
    family: config.family,
    weight: "700",
  });
  context.fillStyle = labelColor;
  if (config.labelLines) {
    config.labelLines.forEach((line, index) =>
      context.fillText(
        line,
        config.x,
        y + 20 + config.labelFontSize * (1 + index * 1.2),
      ),
    );
  } else {
    context.fillText(
      fitEllipsis(context, label, config.width),
      config.x,
      y + 20 + config.fontSize * 0.48,
    );
  }
};

const drawLinkCardCover = (context, block, config, y, appearance) => {
  if (!config.coverWidth) return;
  const size = config.coverWidth;
  const left = CARD_PADDING + 20;
  const top = y + 20;
  context.save();
  context.fillStyle = appearance.base300;
  drawRoundedRect(context, left, top, size, size, 12);
  context.fill();
  context.clip();
  if (block.imageAsset) {
    const asset = block.imageAsset;
    const scale = Math.max(size / asset.width, size / asset.height);
    context.drawImage(
      asset.image,
      left + (size - asset.width * scale) / 2,
      top + (size - asset.height * scale) / 2,
      asset.width * scale,
      asset.height * scale,
    );
  } else if (block.coverIcon?.glyph) {
    setCanvasFont(context, {
      size: size * 0.45,
      family: block.coverIcon.fontFamily || "remixicon",
    });
    context.fillStyle = appearance.accent;
    context.fillText(
      block.coverIcon.glyph,
      left + size * 0.275,
      top + size * 0.65,
    );
  }
  context.restore();
};

const drawTableBlock = (context, layout, startY, appearance) => {
  let lineY = startY;
  for (const [rowIndex, row] of layout.tableRows.entries()) {
    for (const cell of row.cells) {
      const left = cell.config.x - layout.cellPadding;
      if (cell.header || rowIndex % 2) {
        context.fillStyle = withAlpha(
          appearance.base300,
          cell.header ? 0.75 : 0.3,
        );
        context.fillRect(left, lineY, cell.width, row.height);
      }
      context.strokeStyle = appearance.base300;
      context.lineWidth = 1.5;
      context.strokeRect(left, lineY, cell.width, row.height);
      let cellY = lineY + layout.cellPadding;
      for (const line of cell.lines) {
        const shift = ["right", "end"].includes(cell.align)
          ? cell.config.width - line.width
          : cell.align === "center"
            ? (cell.config.width - line.width) / 2
            : 0;
        drawRichLine(
          context,
          line,
          cellY + line.ascent,
          {
            config: {
              ...cell.config,
              x: cell.config.x + Math.max(0, shift),
              justify: false,
            },
            cjkDominant: false,
          },
          appearance,
        );
        cellY += line.height;
      }
    }
    lineY += row.height;
  }
};

const drawImageBlock = (context, block, config, lineY, appearance) => {
  context.save();
  if (block.svgImage) context.filter = appearance.markdownSvgFilter;
  drawRoundedRect(
    context,
    config.imageX,
    lineY,
    config.imageWidth,
    config.imageHeight,
    14,
  );
  context.clip();
  context.drawImage(
    block.imageAsset.image,
    config.imageX,
    lineY,
    config.imageWidth,
    config.imageHeight,
  );
  context.restore();
};

const drawBlockLines = (context, layout, startY, appearance) => {
  const { block, config, lines } = layout;
  let lineY = startY;
  lines.forEach((line, lineIndex) => {
    const baseline = lineY + line.ascent;
    if (block.type === "list-item" && lineIndex === 0) {
      if (block.taskStatus !== null) {
        drawTaskMarker(context, block, config, baseline, appearance);
      } else {
        setCanvasFont(context, {
          size: config.fontSize,
          family: config.family,
          weight: "600",
        });
        context.fillStyle = appearance.accent;
        context.fillText(block.marker || "•", config.markerX, baseline);
      }
    }
    context.save();
    if (["x", "X", "-"].includes(block.taskStatus)) {
      context.globalAlpha *= 0.5;
    }
    const lineLayout =
      block.type === "image"
        ? {
            ...layout,
            config: {
              ...config,
              x: config.x + Math.max(0, config.width - line.width) / 2,
              justify: false,
              align: "start",
            },
          }
        : layout;
    if (block.type === "image") context.globalAlpha *= 0.72;
    drawRichLine(context, line, baseline, lineLayout, appearance);
    context.restore();
    lineY += line.height;
  });
};

export const drawBodyLayout = (context, bodyLayout, appearance) => {
  let y = TEXT_TOP;
  bodyLayout.layouts.forEach((layout, blockIndex) => {
    const { block, config, lines } = layout;
    if (blockIndex) y += config.gap;

    if (block.snapshotAsset) {
      const image = block.snapshotAsset.image;
      const scale = TEXT_WIDTH / image.width;
      context.drawImage(
        image,
        0,
        0,
        image.width,
        Math.min(image.height, layout.height / scale),
        CARD_PADDING,
        y,
        TEXT_WIDTH,
        layout.height,
      );
      y += layout.height;
      return;
    }

    if (block.type === "separator") {
      context.save();
      context.strokeStyle = appearance.base300;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(CARD_PADDING, y + layout.height / 2);
      context.lineTo(CARD_PADDING + TEXT_WIDTH, y + layout.height / 2);
      context.stroke();
      context.restore();
      y += layout.height;
      return;
    }

    drawBlockFrame(context, layout, y, appearance);
    drawBlockLabel(context, block, config, y, appearance);
    drawLinkCardCover(context, block, config, y, appearance);

    if (block.type === "mermaid" && block.imageAsset) {
      context.drawImage(
        block.imageAsset.image,
        config.x,
        y + config.paddingTop,
        config.imageWidth,
        config.imageHeight,
      );
      y += layout.height;
      return;
    }

    let lineY = y + config.paddingTop;
    if (layout.tableRows) {
      drawTableBlock(context, layout, lineY, appearance);
      y += layout.height;
      return;
    }

    if (block.type === "image" && block.imageAsset) {
      drawImageBlock(context, block, config, lineY, appearance);
      lineY += config.imageHeight + (lines.length ? config.imageGap : 0);
    }

    drawBlockLines(context, layout, lineY, appearance);
    y += layout.height;
  });
};
