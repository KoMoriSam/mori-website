import {
  DEFAULT_WATERMARK_TEXT,
  calculateWatermarkBaseSize,
  calculateWatermarkGraphicSize,
} from "./watermark";

const MAX_WATERMARK_STAMP_PIXELS = 16_000_000;
const MAX_WATERMARK_STAMP_SIDE = 8192;

const svgWatermarkImagePromises = new WeakMap();
const svgWatermarkRasterPromises = new WeakMap();

export function isSvgWatermark(blob) {
  return (
    blob?.type?.split(";", 1)[0].toLowerCase() === "image/svg+xml" ||
    /\.svg$/i.test(blob?.name || "")
  );
}

export function readSvgAspectRatio(svgText) {
  const root = new DOMParser().parseFromString(
    svgText,
    "image/svg+xml",
  ).documentElement;
  if (root.localName !== "svg") return null;
  const viewBox = root
    .getAttribute("viewBox")
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  if (
    viewBox?.length === 4 &&
    Number.isFinite(viewBox[2]) &&
    Number.isFinite(viewBox[3]) &&
    viewBox[2] > 0 &&
    viewBox[3] > 0
  ) {
    return viewBox[2] / viewBox[3];
  }
  const width = Number.parseFloat(root.getAttribute("width"));
  const height = Number.parseFloat(root.getAttribute("height"));
  return width > 0 && height > 0 ? width / height : null;
}

export function canvasToBlob(canvas, errorMessage) {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error(errorMessage))),
      "image/png",
    ),
  );
}

export function loadSvgWatermarkImage(blob, readFailedMessage) {
  const cached = svgWatermarkImagePromises.get(blob);
  if (cached) return cached;
  const promise = (async () => {
    const aspectRatio = readSvgAspectRatio(await blob.text());
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image();
      image.decoding = "async";
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error(readFailedMessage));
        image.src = url;
      });
      if (aspectRatio) {
        image.width = Math.max(1, Math.round(aspectRatio * 1000));
        image.height = 1000;
      }
      return image;
    } finally {
      URL.revokeObjectURL(url);
    }
  })();
  svgWatermarkImagePromises.set(blob, promise);
  promise.catch(() => svgWatermarkImagePromises.delete(blob));
  return promise;
}

export function createWatermarkDrawable(blob, { readFailedMessage }) {
  return isSvgWatermark(blob)
    ? loadSvgWatermarkImage(blob, readFailedMessage)
    : createImageBitmap(blob);
}

export function rasterizeSvgWatermark(
  blob,
  size,
  scale,
  { readFailedMessage, unsupportedMessage, failedMessage },
) {
  let cache = svgWatermarkRasterPromises.get(blob);
  if (!cache) {
    cache = new Map();
    svgWatermarkRasterPromises.set(blob, cache);
  }
  const key = `${size.width}x${size.height}:${scale}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const promise = (async () => {
    const image = await loadSvgWatermarkImage(blob, readFailedMessage);
    const { width: stampWidth, height: stampHeight } =
      calculateWatermarkGraphicSize(size, scale, image.width, image.height);
    const density = Math.min(
      2,
      MAX_WATERMARK_STAMP_SIDE / stampWidth,
      MAX_WATERMARK_STAMP_SIDE / stampHeight,
      Math.sqrt(MAX_WATERMARK_STAMP_PIXELS / (stampWidth * stampHeight)),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(stampWidth * density));
    canvas.height = Math.max(1, Math.ceil(stampHeight * density));
    const context = canvas.getContext("2d");
    if (!context) throw new Error(unsupportedMessage);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvasToBlob(canvas, failedMessage);
  })();
  cache.set(key, promise);
  while (cache.size > 3) cache.delete(cache.keys().next().value);
  promise.catch(() => cache.delete(key));
  return promise;
}

export async function renderRemixIconBlob(
  icon,
  color,
  { readFailedMessage, failedMessage },
) {
  await document.fonts?.load("200px remixicon");
  const element = document.createElement("i");
  element.className = icon;
  element.style.cssText =
    "position:fixed;inset:auto auto 0 0;opacity:0;pointer-events:none";
  document.body.append(element);
  let content;
  let fontFamily;
  try {
    const style = getComputedStyle(element, "::before");
    content = style.content;
    fontFamily = style.fontFamily || "remixicon";
  } finally {
    element.remove();
  }
  if (!content || ["none", "normal"].includes(content)) {
    throw new Error(readFailedMessage);
  }
  const glyph = content
    .replace(/^['"]|['"]$/g, "")
    .replace(/\\([0-9a-f]{1,6})\s?/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );
  const canvas = document.createElement("canvas");
  let context = canvas.getContext("2d");
  context.font = `200px ${fontFamily}`;
  const metrics = context.measureText(glyph);
  const padding = 8;
  const glyphLeft = Math.max(0, metrics.actualBoundingBoxLeft);
  const glyphRight = Math.max(1, metrics.actualBoundingBoxRight);
  const glyphAscent = Math.max(1, metrics.actualBoundingBoxAscent);
  const glyphDescent = Math.max(0, metrics.actualBoundingBoxDescent);
  canvas.width = Math.ceil(glyphLeft + glyphRight) + padding * 2;
  canvas.height = Math.ceil(glyphAscent + glyphDescent) + padding * 2;
  context = canvas.getContext("2d");
  context.fillStyle = color || "#ffffff";
  context.font = `200px ${fontFamily}`;
  context.textBaseline = "alphabetic";
  context.fillText(glyph, padding + glyphLeft, padding + glyphAscent);
  return canvasToBlob(canvas, failedMessage);
}

export async function createTextWatermarkStamp(
  size,
  config,
  { resolveFont, getGraphicSource, messages },
) {
  const isCombined = config.kind === "image-text";
  const graphicSource = isCombined ? await getGraphicSource(config) : null;
  const graphic = graphicSource
    ? await createWatermarkDrawable(graphicSource.blob, {
        readFailedMessage: messages.svgReadFailed,
      })
    : null;
  if (isCombined && !graphic) return null;
  try {
    const { family, weight } = await resolveFont(
      config.fontId,
      config.text,
      config.fallbackFontId,
    );
    const text = config.text || DEFAULT_WATERMARK_TEXT;
    const fontSize = Math.round(calculateWatermarkBaseSize(size, config.scale));
    const measureCanvas = document.createElement("canvas");
    const measureContext = measureCanvas.getContext("2d");
    if (!measureContext) throw new Error(messages.textUnsupported);
    measureContext.font = `${weight} ${fontSize}px ${family}`;
    const metrics = measureContext.measureText(text);
    const textLeft = Math.max(0, metrics.actualBoundingBoxLeft || 0);
    const textRight = Math.max(
      1,
      metrics.actualBoundingBoxRight || metrics.width,
    );
    const textWidth = Math.max(1, textLeft + textRight);
    const textAscent = Math.max(
      1,
      metrics.actualBoundingBoxAscent || fontSize * 0.8,
    );
    const textDescent = Math.max(
      0,
      metrics.actualBoundingBoxDescent || fontSize * 0.2,
    );
    const textHeight = textAscent + textDescent;
    let graphicWidth = 0;
    let graphicHeight = 0;
    let contentGap = 0;
    if (isCombined) {
      const graphicSize = calculateWatermarkGraphicSize(
        size,
        config.scale,
        graphic.width,
        graphic.height,
      );
      graphicWidth = graphicSize.width;
      graphicHeight = graphicSize.height;
      contentGap = Math.max(4, fontSize * 0.35);
    }
    const contentWidth = graphicWidth + contentGap + textWidth;
    const contentHeight = Math.max(textHeight, graphicHeight);
    const padding = Math.max(2, Math.ceil(fontSize * 0.12));
    const stampWidth = Math.max(1, Math.ceil(contentWidth + padding * 2));
    const stampHeight = Math.max(1, Math.ceil(contentHeight + padding * 2));
    const renderScale = Math.min(
      1,
      MAX_WATERMARK_STAMP_SIDE / stampWidth,
      MAX_WATERMARK_STAMP_SIDE / stampHeight,
      Math.sqrt(MAX_WATERMARK_STAMP_PIXELS / (stampWidth * stampHeight)),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(stampWidth * renderScale));
    canvas.height = Math.max(1, Math.ceil(stampHeight * renderScale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error(messages.textUnsupported);
    context.font = `${weight} ${fontSize * renderScale}px ${family}`;
    context.textBaseline = "alphabetic";
    context.fillStyle = config.color || "#ffffff";
    if (isCombined) {
      context.drawImage(
        graphic,
        padding * renderScale,
        (padding + (contentHeight - graphicHeight) / 2) * renderScale,
        graphicWidth * renderScale,
        graphicHeight * renderScale,
      );
    }
    context.fillText(
      text,
      (padding + graphicWidth + contentGap + textLeft) * renderScale,
      (padding + (contentHeight - textHeight) / 2 + textAscent) * renderScale,
    );
    const blob = await canvasToBlob(canvas, messages.textFailed);
    return { blob, width: stampWidth, height: stampHeight };
  } finally {
    graphic?.close?.();
  }
}
