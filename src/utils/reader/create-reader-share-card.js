import { assertShareActive, resolveBodyLayout } from "./share-block-layout.js";
import { drawBodyLayout } from "./share-block-renderers.js";
import {
  drawRoundedRect,
  loadFavicon,
  prepareShareBlockAssets,
  resolveShareAppearance,
  withAlpha,
} from "./share-canvas-assets.js";
import {
  SHARE_CARD_LAYOUT,
  fitEllipsis,
  normalizeShareText,
  setCanvasFont,
  wrapPlainText,
} from "./share-text-layout.js";

export const READER_SHARE_CARD_WIDTH = SHARE_CARD_LAYOUT.WIDTH;
export const READER_SHARE_CARD_HEIGHT = SHARE_CARD_LAYOUT.HEIGHT;

const { PADDING: CARD_PADDING, TEXT_TOP, TEXT_WIDTH, TEXT_HEIGHT } =
  SHARE_CARD_LAYOUT;

const normalizeContentKey = (value = "") =>
  normalizeShareText(value).replace(/\s+/gu, "");

const cloneRun = (run) => ({
  ...run,
  text: String(run.text || ""),
  mathAsset: null,
  mathAssets: [],
  linkIconAsset: null,
  inlineImageAsset: null,
});

const cloneRuns = (runs) =>
  Array.isArray(runs) ? runs.map(cloneRun).filter(({ text }) => text) : [];

const cloneTableRows = (rows) =>
  Array.isArray(rows)
    ? rows.map((row) => ({
        cells: (row.cells || []).map((cell) => ({
          ...cell,
          runs: cloneRuns(cell.runs),
          header: Boolean(cell.header),
          align: cell.align || "left",
          colSpan: Math.max(1, Number(cell.colSpan) || 1),
        })),
      }))
    : [];

const cloneBlock = (block) => {
  const rows = cloneTableRows(block.rows);
  const runs = rows.length
    ? rows.flatMap((row) => row.cells.flatMap((cell) => cell.runs))
    : cloneRuns(block.runs);
  return {
    ...block,
    type: block.type || "paragraph",
    depth: block.depth || 0,
    taskStatus: block.taskStatus ?? null,
    taskTone: block.taskTone || "muted",
    tone: block.tone || "accent",
    width: block.width || 1,
    height: block.height || 1,
    imageAsset: null,
    snapshotAsset: null,
    runs,
    rows,
  };
};

// 信任 create-reader-share-content.js 输出结构；仅做浅拷贝隔离渲染期资产字段、
// 补齐手写测试样本的稀疏默认值，并按 excludeFromContent 过滤重复元信息。
export const prepareShareBlocks = (
  shareContent,
  fallbackText,
  excludeFromContent = [],
) => {
  const excludedContent = new Set(
    (Array.isArray(excludeFromContent) ? excludeFromContent : [])
      .map(normalizeContentKey)
      .filter(Boolean),
  );
  const hasSerializedContent = Array.isArray(shareContent?.blocks);
  const blocks = hasSerializedContent
    ? shareContent.blocks
        .map(cloneBlock)
        .filter(
          ({ type, svg, mermaid, src, runs, label, snapshot }) =>
            Boolean(snapshot) ||
            type === "separator" ||
            (type === "link-card" && label) ||
            (type === "mermaid" && (mermaid?.source || svg)) ||
            (["image", "link-card"].includes(type) && src) ||
            runs.some(({ text }) => text.trim()),
        )
        .filter(
          ({ type, runs }) =>
            type === "image" ||
            !excludedContent.has(
              normalizeContentKey(runs.map(({ text }) => text).join("")),
            ),
        )
    : [];

  if (blocks.length || hasSerializedContent) return blocks;
  const text = String(fallbackText || "").trim();
  return text && !excludedContent.has(normalizeContentKey(text))
    ? [cloneBlock({ type: "paragraph", runs: [{ text }] })]
    : [];
};

const drawWrappedTitle = (context, title, appearance) => {
  setCanvasFont(context, {
    size: 38,
    family: appearance.serifFontFamily,
    weight: "700",
  });
  const lines = wrapPlainText(context, title, 610, 2);
  lines.forEach((line, index) =>
    context.fillText(line, CARD_PADDING, 1082 + index * 50),
  );
  return 1082 + Math.max(0, lines.length - 1) * 50;
};

const drawWrappedDetail = (
  context,
  detail,
  detailLines,
  detailList,
  detailLineLimit,
  baseline,
  appearance,
) => {
  setCanvasFont(context, {
    size: 25,
    family: appearance.serifFontFamily,
    weight: "400",
  });
  const defaultLineLimit = detailList ? 3 : 2;
  const lineLimit = Math.min(
    3,
    Math.max(1, Math.trunc(Number(detailLineLimit)) || defaultLineLimit),
  );
  const explicitLines = Array.isArray(detailLines)
    ? detailLines.map(normalizeShareText).filter(Boolean).slice(0, lineLimit)
    : [];
  const lines = explicitLines.length
    ? explicitLines.map((line) =>
        fitEllipsis(context, detailList ? `• ${line}` : line, 650),
      )
    : wrapPlainText(context, detail, 650, 2);
  lines.forEach((line, index) => {
    context.fillText(
      line,
      CARD_PADDING,
      baseline + index * (detailList ? 32 : 34),
    );
  });
};

const drawBrandSignature = (context, favicon, appearance) => {
  const iconSize = favicon ? 28 : 0;
  const gap = favicon ? 8 : 0;
  setCanvasFont(context, {
    size: 23,
    family: appearance.uiFontFamily,
    weight: "600",
  });
  const label = "komori.cc";
  const labelWidth = context.measureText(label).width;
  const startX = 904 - (iconSize + gap + labelWidth) / 2;

  if (favicon) {
    context.save();
    drawRoundedRect(context, startX, 1231, iconSize, iconSize, 6);
    context.clip();
    context.imageSmoothingEnabled = false;
    context.drawImage(favicon, startX, 1231, iconSize, iconSize);
    context.restore();
  }

  context.fillStyle = appearance.foreground;
  context.fillText(label, startX + iconSize + gap, 1253);
};

const drawQrCode = async (context, shareUrl, appearance) => {
  const { default: QRCode } = await import("qrcode");
  const qrCanvas = document.createElement("canvas");
  await QRCode.toCanvas(qrCanvas, shareUrl, {
    width: 164,
    margin: 1,
    errorCorrectionLevel: "M",
    color: {
      dark: `${appearance.qrDark}ff`,
      light: `${appearance.qrLight}ff`,
    },
  });

  context.save();
  context.fillStyle = appearance.qrLight;
  drawRoundedRect(context, 812, 1040, 184, 184, 18);
  context.fill();
  context.strokeStyle = withAlpha(appearance.qrDark, 0.25);
  context.lineWidth = 2;
  context.stroke();
  context.imageSmoothingEnabled = false;
  context.drawImage(qrCanvas, 822, 1050, 164, 164);
  context.restore();
};

const canvasToBlob = (canvas) =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("无法生成分享卡片图片"));
    }, "image/png");
  });

const sanitizeFileName = (value) =>
  normalizeShareText(value)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^[.\s-]+|[.\s-]+$/g, "")
    .slice(0, 48);

export const buildReaderShareUrl = ({ path, paragraphId } = {}) => {
  const url = new URL(path || window.location.pathname, window.location.origin);
  const normalizedParagraphId = normalizeShareText(paragraphId);
  const shortParagraphId = normalizedParagraphId.match(/-(\d+)$/u)?.[1];
  url.search = "";
  url.hash = shortParagraphId || normalizedParagraphId;
  return url.href;
};

export const createReaderShareCard = async (
  { text, shareContent, paragraphId, meta = {} },
  { localize = (value) => value, signal } = {},
) => {
  assertShareActive(signal);
  const blocks = prepareShareBlocks(
    shareContent,
    text,
    meta.excludeFromContent,
  );
  if (!blocks.length) throw new Error("没有可分享的正文");
  for (const block of blocks) {
    if (block.systemLabel) block.label = localize(block.label);
    if (block.type === "mermaid") {
      block.runs = [{ text: localize("Mermaid 图表"), mathAssets: [] }];
    }
  }

  await document.fonts?.ready;
  assertShareActive(signal);
  const appearance = resolveShareAppearance();
  const canvas = document.createElement("canvas");
  canvas.width = READER_SHARE_CARD_WIDTH;
  canvas.height = READER_SHARE_CARD_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器无法生成分享卡片");

  const [favicon] = await Promise.all([
    loadFavicon(),
    prepareShareBlockAssets(blocks, appearance, localize),
  ]);
  assertShareActive(signal);

  context.textBaseline = "alphabetic";
  context.fillStyle = appearance.background;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.save();
  context.globalAlpha = 0.22;
  context.strokeStyle = appearance.accent;
  context.lineWidth = 2;
  drawRoundedRect(context, 54, 54, canvas.width - 108, canvas.height - 108, 30);
  context.stroke();
  context.restore();

  context.fillStyle = appearance.accent;
  drawRoundedRect(context, CARD_PADDING, 108, 78, 8, 4);
  context.fill();

  setCanvasFont(context, {
    size: 30,
    family: appearance.serifFontFamily,
    weight: "600",
  });
  context.fillStyle = appearance.foreground;
  const sourceLabel =
    normalizeShareText(localize(meta.sourceLabel)) || "远方之森";
  context.fillText(
    fitEllipsis(context, sourceLabel, TEXT_WIDTH),
    CARD_PADDING,
    174,
  );

  context.save();
  context.globalAlpha = 0.2;
  context.fillStyle = appearance.accent;
  setCanvasFont(context, {
    size: 150,
    family: appearance.serifFontFamily,
    weight: "700",
  });
  context.fillText("“", 70, 258);
  context.restore();

  const bodyLayout = await resolveBodyLayout(
    context,
    blocks,
    appearance,
    signal,
  );
  assertShareActive(signal);
  context.save();
  context.beginPath();
  context.rect(CARD_PADDING - 12, TEXT_TOP, TEXT_WIDTH + 24, TEXT_HEIGHT);
  context.clip();
  drawBodyLayout(context, bodyLayout, appearance);
  if (bodyLayout.truncated && bodyLayout.usedHeight > 0) {
    const visibleHeight = Math.min(TEXT_HEIGHT, bodyLayout.usedHeight);
    const bottom = TEXT_TOP + visibleHeight;
    const fadeHeight = Math.min(72, visibleHeight / 2);
    const gradient = context.createLinearGradient(
      0,
      bottom - fadeHeight,
      0,
      bottom,
    );
    gradient.addColorStop(0, withAlpha(appearance.background, 0));
    gradient.addColorStop(1, appearance.background);
    context.fillStyle = gradient;
    context.fillRect(
      CARD_PADDING - 12,
      bottom - fadeHeight,
      TEXT_WIDTH + 24,
      fadeHeight,
    );
  }
  context.restore();

  context.save();
  context.globalAlpha = 0.2;
  context.strokeStyle = appearance.foreground;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(CARD_PADDING, 986);
  context.lineTo(canvas.width - CARD_PADDING, 986);
  context.stroke();
  context.restore();

  context.fillStyle = appearance.foreground;
  const titleBaseline = drawWrappedTitle(
    context,
    normalizeShareText(meta.title) ||
      normalizeShareText(meta.sourceLabel) ||
      "远方之森",
    appearance,
  );

  const detail = normalizeShareText(meta.detail);
  const detailLines = Array.isArray(meta.detailLines)
    ? meta.detailLines.map(normalizeShareText).filter(Boolean)
    : [];
  if (detail || detailLines.length) {
    context.save();
    context.globalAlpha = 0.65;
    drawWrappedDetail(
      context,
      detail,
      detailLines,
      Boolean(meta.detailList),
      meta.detailLineLimit,
      titleBaseline + 44,
      appearance,
    );
    context.restore();
  }

  const shareUrl = buildReaderShareUrl({ path: meta.path, paragraphId });
  await drawQrCode(context, shareUrl, appearance);
  drawBrandSignature(context, favicon, appearance);

  const blob = await canvasToBlob(canvas);
  const fileBase =
    sanitizeFileName(meta.title || meta.sourceLabel) || "远方之森";
  return {
    blob,
    canvas,
    fileName: `${fileBase}-${localize("分享卡片")}.png`,
    shareUrl,
    truncated: bodyLayout.truncated,
    warnings: [
      ...blocks.flatMap((block) => block.snapshotAsset?.warnings || []),
      ...blocks
        .filter(
          (block) =>
            ["image", "mermaid"].includes(block.type) && !block.imageAsset,
        )
        .map((block) => `${block.type}: ${block.src || "SVG 无法转换"}`),
      ...blocks.flatMap((block) =>
        block.runs
          .filter((run) => run.assetWarning)
          .map((run) => `image: ${run.assetWarning}`),
      ),
    ],
  };
};
