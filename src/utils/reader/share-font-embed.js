import { walkDocumentStyleRules } from "@/utils/dom/stylesheets";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const MAX_EMBEDDED_FONT_RULE_CACHE = 128;

const fontDataUrlPromises = new Map();
const embeddedFontRulePromises = new Map();

export const collectFontFaceRules = () => {
  const entries = [];
  walkDocumentStyleRules((rule) => {
    if (rule.type === 5) {
      entries.push({
        rule,
        baseUrl: rule.parentStyleSheet?.href || document.baseURI,
      });
    }
  });
  return entries;
};

const normalizeFontFamilyName = (value = "") =>
  String(value)
    .trim()
    .replace(/^(["'])(.*)\1$/u, "$2")
    .toLowerCase();

const getSvgFontContext = (root) => {
  const textElements = [
    root,
    ...root.querySelectorAll("text, tspan, textPath, foreignObject *"),
  ];
  const familyValues = textElements
    .map((element) => element.style?.fontFamily || "")
    .filter(Boolean)
    .map((value) => value.toLowerCase());
  const fontStyles = new Set(
    textElements
      .map((element) => element.style?.fontStyle || "normal")
      .map((value) => value.toLowerCase()),
  );
  const text = [...root.querySelectorAll("text, foreignObject")]
    .map((element) => element.textContent || "")
    .join("");
  const codePoints = new Set(
    Array.from(text, (character) => character.codePointAt(0)),
  );
  return { familyValues, fontStyles, codePoints };
};

const parseUnicodeRange = (value) => {
  const token = String(value).trim().replace(/^U\+/iu, "");
  if (!token) return null;
  if (token.includes("?")) {
    return {
      start: Number.parseInt(token.replaceAll("?", "0"), 16),
      end: Number.parseInt(token.replaceAll("?", "F"), 16),
    };
  }
  const [start, end = start] = token.split("-");
  const parsedStart = Number.parseInt(start, 16);
  const parsedEnd = Number.parseInt(end, 16);
  return Number.isFinite(parsedStart) && Number.isFinite(parsedEnd)
    ? { start: parsedStart, end: parsedEnd }
    : null;
};

const fontRuleCoversText = (unicodeRange, codePoints) => {
  if (!unicodeRange || !codePoints.size) return true;
  const ranges = unicodeRange
    .split(",")
    .map(parseUnicodeRange)
    .filter(Boolean);
  if (!ranges.length) return true;
  return [...codePoints].some((codePoint) =>
    ranges.some(({ start, end }) => start <= codePoint && codePoint <= end),
  );
};

const fontRuleMatchesContext = (rule, context) => {
  const family = normalizeFontFamilyName(
    rule.style.getPropertyValue("font-family"),
  );
  if (
    !family ||
    !context.familyValues.some((value) => value.includes(family))
  ) {
    return false;
  }

  const faceStyle = (
    rule.style.getPropertyValue("font-style") || "normal"
  ).toLowerCase();
  const styleMatches = faceStyle.includes("italic")
    ? [...context.fontStyles].some((value) => value.includes("italic"))
    : faceStyle.includes("oblique")
      ? [...context.fontStyles].some((value) => value.includes("oblique"))
      : [...context.fontStyles].some(
          (value) => !value.includes("italic") && !value.includes("oblique"),
        );
  return (
    styleMatches &&
    fontRuleCoversText(
      rule.style.getPropertyValue("unicode-range"),
      context.codePoints,
    )
  );
};

const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

const loadFontDataUrl = (url) => {
  if (!fontDataUrlPromises.has(url)) {
    fontDataUrlPromises.set(
      url,
      fetch(url)
        .then((response) => {
          if (!response.ok) throw new Error(`无法加载字体：${response.status}`);
          return response.blob();
        })
        .then(blobToDataUrl)
        .catch(() => ""),
    );
  }
  return fontDataUrlPromises.get(url);
};

const buildEmbeddedFontRule = async ({ rule, baseUrl }) => {
  const cssText = rule.cssText;
  const matches = [
    ...cssText.matchAll(/url\(\s*(?:(["'])(.*?)\1|([^"')]+))\s*\)/giu),
  ];
  if (!matches.length) return "";

  const replacements = await Promise.all(
    matches.map(async (match) => {
      const source = String(match[2] || match[3] || "").trim();
      if (!source) return "";
      if (source.startsWith("data:")) return source;
      try {
        return await loadFontDataUrl(new URL(source, baseUrl).href);
      } catch {
        return "";
      }
    }),
  );
  if (replacements.some((value) => !value)) return "";

  let embedded = cssText;
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const match = matches[index];
    embedded = `${embedded.slice(0, match.index)}url("${replacements[index]}")${embedded.slice(
      match.index + match[0].length,
    )}`;
  }
  return embedded;
};

const embedFontRuleSources = (entry) => {
  const key = `${entry.baseUrl}:${entry.rule.cssText}`;
  if (!embeddedFontRulePromises.has(key)) {
    const embedding = buildEmbeddedFontRule(entry);
    embeddedFontRulePromises.set(key, embedding);
    while (embeddedFontRulePromises.size > MAX_EMBEDDED_FONT_RULE_CACHE) {
      embeddedFontRulePromises.delete(embeddedFontRulePromises.keys().next().value);
    }
    embedding.catch(() => {
      if (embeddedFontRulePromises.get(key) === embedding) {
        embeddedFontRulePromises.delete(key);
      }
    });
  }
  return embeddedFontRulePromises.get(key);
};

export const embedSvgFonts = async (svg) => {
  const documentNode = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = documentNode.documentElement;
  if (root.localName !== "svg") return svg;

  const context = getSvgFontContext(root);
  const matchingRules = collectFontFaceRules().filter(({ rule }) =>
    fontRuleMatchesContext(rule, context),
  );
  const embeddedRules = (
    await Promise.all(matchingRules.map(embedFontRuleSources))
  ).filter(Boolean);
  if (!embeddedRules.length) return svg;

  const style = documentNode.createElementNS(SVG_NAMESPACE, "style");
  style.setAttribute("data-reader-embedded-fonts", "");
  style.textContent = embeddedRules.join("\n");
  root.prepend(style);
  return new XMLSerializer().serializeToString(root);
};

export const getReaderSnapshotFontCSS = async (root, fontFaces, include) => {
  const elements = [root, ...root.querySelectorAll("*")].filter(include);
  const styles = elements.flatMap((element) => [
    getComputedStyle(element),
    getComputedStyle(element, "::before"),
    getComputedStyle(element, "::after"),
  ]);
  const text =
    elements
      .flatMap((element) =>
        [...element.childNodes]
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent),
      )
      .join("") + styles.map((style) => style.content || "").join("");
  const fontContext = {
    familyValues: [
      ...new Set(styles.map((style) => style.fontFamily.toLowerCase())),
    ],
    fontStyles: new Set(styles.map((style) => style.fontStyle || "normal")),
    codePoints: new Set(
      Array.from(text, (character) => character.codePointAt(0)),
    ),
  };
  return (
    await Promise.all(
      fontFaces
        .filter(({ rule }) => fontRuleMatchesContext(rule, fontContext))
        .map(embedFontRuleSources),
    )
  ).join("\n");
};
