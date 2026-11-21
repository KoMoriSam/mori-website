import {
  renderMermaidSource,
  styleMermaidSvg,
} from "@/utils/markdown/markdown-it-mermaid";
import { createLatexSvg, loadLatexSvgImage } from "./latex.js";
import { embedSvgFonts } from "./share-font-embed.js";
import { SHARE_CARD_LAYOUT } from "./share-text-layout.js";

const DEFAULT_BACKGROUND = "#ffffff";
const DEFAULT_FOREGROUND = "#1f2937";
const DEFAULT_ACCENT = "#6b7280";
const FAVICON_PATH = "/favicon.webp";
const MERMAID_FONT_SIZE = 24;
const IMAGE_LOAD_TIMEOUT_MS = 8000;

const SYNTAX_COLOR_KEYS = [
  "keyword",
  "title",
  "constant",
  "string",
  "symbol",
  "comment",
  "tag",
  "bullet",
  "addition",
  "deletion",
  "attr",
  "attribute",
  "number",
  "literal",
  "meta",
  "name",
  "regexp",
  "selector-class",
  "selector-id",
  "type",
  "variable",
];

let colorProbeContext;
let faviconPromise;
const linkIconPromises = new Map();
const contentImagePromises = new Map();

// 纯色探针仅填充 CSS 颜色，不绘制外部图像，永不产生跨域污染，可安全复用。
const getColorProbeContext = () => {
  if (colorProbeContext !== undefined) return colorProbeContext;
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  colorProbeContext = canvas.getContext("2d", { willReadFrequently: true });
  return colorProbeContext;
};

const toCanvasColor = (value, fallback) => {
  const context = getColorProbeContext();
  if (!context) return fallback;

  context.clearRect(0, 0, 1, 1);
  context.fillStyle = fallback;
  context.fillStyle = String(value || fallback).trim();
  context.fillRect(0, 0, 1, 1);

  const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
  if (!alpha) return fallback;
  return `#${[red, green, blue]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
};

const hexToRgb = (color) => ({
  red: Number.parseInt(color.slice(1, 3), 16),
  green: Number.parseInt(color.slice(3, 5), 16),
  blue: Number.parseInt(color.slice(5, 7), 16),
});

const rgbToHex = ({ red, green, blue }) =>
  `#${[red, green, blue]
    .map((channel) => Math.round(channel).toString(16).padStart(2, "0"))
    .join("")}`;

export const mixColors = (from, to, amount) => {
  const left = hexToRgb(from);
  const right = hexToRgb(to);
  return rgbToHex({
    red: left.red + (right.red - left.red) * amount,
    green: left.green + (right.green - left.green) * amount,
    blue: left.blue + (right.blue - left.blue) * amount,
  });
};

export const withAlpha = (color, alpha) =>
  `${color}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0")}`;

export const drawRoundedRect = (context, x, y, width, height, radius) => {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
};

const relativeLuminance = (color) => {
  const { red, green, blue } = hexToRgb(color);
  const channels = [red, green, blue].map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
};

const resolveQrColors = ({ background, foreground }) => {
  const [qrDark, qrLight] = [background, foreground].sort(
    (left, right) => relativeLuminance(left) - relativeLuminance(right),
  );
  return { qrDark, qrLight };
};

export const resolveShareAppearance = () => {
  const rootComputed = getComputedStyle(document.documentElement);
  const themeColor = (property, fallback) =>
    toCanvasColor(rootComputed.getPropertyValue(property), fallback);
  const background = themeColor("--color-base-100", DEFAULT_BACKGROUND);
  const foreground = themeColor("--color-base-content", DEFAULT_FOREGROUND);
  const accent = themeColor("--color-primary", DEFAULT_ACCENT);
  const primaryContent = themeColor("--color-primary-content", background);
  const serifFontFamily =
    rootComputed.getPropertyValue("--font-serif").trim() ||
    'ui-serif, "Noto Serif SC", "Source Han Serif SC", serif';
  const syntax = Object.fromEntries(
    SYNTAX_COLOR_KEYS.map((key) => [
      key,
      themeColor(`--hljs-${key}`, foreground),
    ]),
  );

  return {
    background,
    foreground,
    accent,
    primaryContent,
    base200: themeColor("--color-base-200", background),
    base300: themeColor("--color-base-300", background),
    warning: themeColor("--color-warning", accent),
    warningContent: themeColor("--color-warning-content", foreground),
    info: themeColor("--color-info", accent),
    infoContent: themeColor("--color-info-content", foreground),
    success: themeColor("--color-success", accent),
    successContent: themeColor("--color-success-content", foreground),
    error: themeColor("--color-error", accent),
    errorContent: themeColor("--color-error-content", foreground),
    syntax,
    markdownSvgFilter:
      rootComputed.getPropertyValue("--markdown-svg-filter").trim() || "none",
    ...resolveQrColors({ background, foreground }),
    contentFontFamily: serifFontFamily,
    uiFontFamily:
      rootComputed.getPropertyValue("--font-sans").trim() ||
      "ui-sans-serif, system-ui, sans-serif",
    serifFontFamily,
    monoFamily:
      rootComputed.getPropertyValue("--font-mono").trim() ||
      'ui-monospace, "Cascadia Code", monospace',
    contentFontWeight: "400",
  };
};

// 外部或 SVG 图像可能触发画布跨域污染；探针必须每次独立创建并立即释放，
// 避免一次失败的跨域绘制永久污染后续正常图像的导出校验。
export const verifyCanvasExportable = (image, contextErrorMessage) => {
  const probe = document.createElement("canvas");
  probe.width = 1;
  probe.height = 1;
  try {
    const context = probe.getContext("2d");
    if (!context) throw new Error(contextErrorMessage);
    context.drawImage(image, 0, 0, 1, 1);
    probe.toDataURL("image/png");
  } finally {
    probe.width = 0;
    probe.height = 0;
  }
};

export const loadFavicon = () => {
  if (faviconPromise) return faviconPromise;
  faviconPromise = new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = FAVICON_PATH;
  });
  return faviconPromise;
};

const loadLinkIcon = (src) => {
  if (!src) return Promise.resolve(null);
  if (linkIconPromises.has(src)) return linkIconPromises.get(src);
  const promise = new Promise((resolve) => {
    const image = new Image();
    const timer = window.setTimeout(() => {
      image.onload = image.onerror = null;
      image.src = "";
      resolve(null);
    }, IMAGE_LOAD_TIMEOUT_MS);
    image.crossOrigin = "anonymous";
    image.referrerPolicy = "no-referrer";
    image.onload = () => {
      window.clearTimeout(timer);
      resolve(image);
    };
    image.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    image.src = src;
  });
  linkIconPromises.set(src, promise);
  return promise;
};

export const loadContentImage = (src) => {
  if (!src) return Promise.resolve(null);
  if (contentImagePromises.has(src)) return contentImagePromises.get(src);
  const promise = new Promise((resolve) => {
    const image = new Image();
    const timer = window.setTimeout(() => {
      image.onload = image.onerror = null;
      image.src = "";
      resolve(null);
    }, IMAGE_LOAD_TIMEOUT_MS);
    image.crossOrigin = "anonymous";
    image.onload = () => {
      window.clearTimeout(timer);
      try {
        verifyCanvasExportable(image, "当前浏览器无法验证正文图片");
        resolve(image);
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    image.src = src;
  });
  contentImagePromises.set(src, promise);
  return promise;
};

export const getMermaidShareScale = ({ width, height }) =>
  Math.min(
    SHARE_CARD_LAYOUT.TEXT_WIDTH / width,
    SHARE_CARD_LAYOUT.MERMAID_MAX_HEIGHT / height,
  );

const loadShareSvgImage = async ({ svg, width, height }) => {
  const embeddedSvg = await embedSvgFonts(svg);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        verifyCanvasExportable(image, "当前浏览器无法验证 Mermaid 图片");
        resolve({ image, width, height });
      } catch {
        reject(new Error("当前浏览器禁止导出 Mermaid 图片"));
      }
    };
    image.onerror = () => reject(new Error("无法渲染 Mermaid 图表"));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(embeddedSvg)}`;
  });
};

const renderShareMermaid = async (
  { source, theme, cornerShape },
  fontFamily,
  index,
) => {
  await document.fonts
    ?.load(`${MERMAID_FONT_SIZE}px ${fontFamily}`, source)
    .catch(() => {});
  const options = {
    fontFamily,
    fontSize: MERMAID_FONT_SIZE,
    maxWidth: SHARE_CARD_LAYOUT.TEXT_WIDTH,
  };
  const id = `share-mermaid-${index}`;
  let result = await renderMermaidSource(id, source, options);
  if (result.width > SHARE_CARD_LAYOUT.TEXT_WIDTH) {
    // 超宽时尝试纵向排版，保留在卡片内缩放比例较大的结果。
    const reflowed = await renderMermaidSource(id, source, {
      ...options,
      autoDirection: true,
      directionBreakpoint: SHARE_CARD_LAYOUT.TEXT_WIDTH + 1,
    });
    if (getMermaidShareScale(reflowed) > getMermaidShareScale(result)) {
      result = reflowed;
    }
  }

  const parsed = new DOMParser().parseFromString(result.svg, "image/svg+xml");
  const svg = document.importNode(parsed.documentElement, true);
  if (svg.localName !== "svg") throw new Error("无法渲染 Mermaid 图表");
  for (const [property, value] of Object.entries(theme || {})) {
    if (property.startsWith("--pele-")) svg.style.setProperty(property, value);
  }
  if (cornerShape) svg.style.setProperty("--corner-shape", cornerShape);
  svg.style.fontFamily = fontFamily;

  // 挂载后读取主题圆角的像素值，再将独立 SVG 交给画布。
  const host = document.createElement("div");
  host.hidden = true;
  host.appendChild(svg);
  document.body.appendChild(host);
  try {
    styleMermaidSvg(svg, getComputedStyle(svg));
    return { ...result, svg: new XMLSerializer().serializeToString(svg) };
  } finally {
    host.remove();
  }
};

const prepareLatexRuns = async (runs, appearance) => {
  await Promise.all(
    runs.map(async (run) => {
      if (!run.latex || !run.svg) return;
      if (!run.mathDisplay && run.svgSegments?.length > 1) {
        try {
          run.mathAssets = await Promise.all(
            run.svgSegments.map(async ({ svg, spaceBefore }) => ({
              ...(await loadLatexSvgImage(
                createLatexSvg({
                  svg,
                  source: run.latex,
                  display: false,
                  color: appearance.foreground,
                }),
              )),
              spaceBefore,
            })),
          );
          return;
        } catch {
          run.mathAssets = [];
        }
      }
      try {
        const svg = createLatexSvg({
          svg: run.svg,
          source: run.latex,
          display: run.mathDisplay,
          color: appearance.foreground,
        });
        run.mathAsset = await loadLatexSvgImage(svg);
      } catch {
        run.mathAsset = null;
      }
    }),
  );
};

const prepareLinkIconRuns = async (runs) => {
  await Promise.all(
    runs.map(async (run) => {
      if (!run.linkIconSrc) return;
      run.linkIconAsset = await loadLinkIcon(run.linkIconSrc);
    }),
  );
};

const prepareInlineImageRuns = async (runs, localize) => {
  await Promise.all(
    runs.map(async (run) => {
      if (!run.inlineImageSrc) return;
      const image = await loadContentImage(run.inlineImageSrc);
      if (image) {
        run.inlineImageAsset = image;
        return;
      }
      run.text = run.inlineImageAlt || localize("图片");
      run.assetWarning = run.inlineImageSrc;
      run.inlineImageSrc = "";
    }),
  );
};

const prepareMermaidBlocks = async (blocks, appearance) => {
  await Promise.all(
    blocks.map(async (block, index) => {
      if (block.type !== "mermaid") return;
      try {
        const rendered = block.mermaid?.source
          ? await renderShareMermaid(block.mermaid, appearance.monoFamily, index)
          : block;
        if (rendered.svg) block.imageAsset = await loadShareSvgImage(rendered);
      } catch {
        if (block.mermaid?.source) {
          block.type = "code";
          block.language = "mermaid";
          block.runs = [{ text: block.mermaid.source, mathAssets: [] }];
        }
      }
    }),
  );
};

const prepareImageBlocks = async (blocks, localize) => {
  await Promise.all(
    blocks.map(async (block) => {
      if (!["image", "link-card"].includes(block.type) || !block.src) return;
      const image = await loadContentImage(block.src);
      if (image) {
        block.imageAsset = {
          image,
          width: image.naturalWidth || block.width,
          height: image.naturalHeight || block.height,
        };
        return;
      }
      if (!block.runs.length) {
        block.runs = [{ text: block.alt || localize("图片"), mathAssets: [] }];
      }
    }),
  );
};

export const prepareShareBlockAssets = async (blocks, appearance, localize) => {
  const activeRuns = blocks
    .filter((block) => !block.snapshot)
    .flatMap(({ runs }) => runs);
  await Promise.all([
    prepareLatexRuns(activeRuns, appearance),
    prepareLinkIconRuns(activeRuns),
    prepareInlineImageRuns(activeRuns, localize),
    prepareMermaidBlocks(blocks, appearance),
    prepareImageBlocks(blocks, localize),
  ]);
};
