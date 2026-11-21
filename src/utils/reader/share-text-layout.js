export const SHARE_CARD_LAYOUT = Object.freeze({
  WIDTH: 1080,
  HEIGHT: 1350,
  PADDING: 96,
  TEXT_TOP: 208,
  TEXT_BOTTOM: 928,
  TEXT_WIDTH: 1080 - 96 * 2,
  TEXT_HEIGHT: 928 - 208,
  MERMAID_MAX_HEIGHT: 640,
});

const KINSOKU_LINE_START = new Set(
  Array.from(
    "、。，．？！‼⁇⁈⁉：；…‥—～ー·）〕］｝〉》」』】〗〙〛’”»％‰℃°′″!?;:,.%)]}",
  ),
);
const KINSOKU_LINE_END = new Set(Array.from("（〔［｛〈《「『【〖〘〚‘“«([{"));
const SPACED_WORD_CORE = /[\p{L}\p{N}\p{M}]/u;
const UNSPACED_WORD_SCRIPT =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Bopomofo}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;
const WORD_CONNECTOR = /^[\u0026'\u002b,\-./:=?@_\u2019%#]$/u;

export const normalizeShareText = (value = "") =>
  String(value).replace(/\s+/gu, " ").trim();

export const setCanvasFont = (
  context,
  { size, family, weight = "400", italic = false },
) => {
  context.font = `${italic ? "italic " : ""}${weight} ${size}px ${family}`;
};

export const getGraphemes = (value = "") => {
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    const lang =
      (typeof document !== "undefined" && document.documentElement?.lang) ||
      "zh";
    return Array.from(
      new Intl.Segmenter(lang, { granularity: "grapheme" }).segment(value),
      ({ segment }) => segment,
    );
  }
  return Array.from(value);
};

const getFirstGrapheme = (value = "") => getGraphemes(value)[0] || "";
const getLastGrapheme = (value = "") => getGraphemes(value).at(-1) || "";
const isKinsokuLineStart = (value) =>
  KINSOKU_LINE_START.has(getFirstGrapheme(value));
const isKinsokuLineEnd = (value) =>
  KINSOKU_LINE_END.has(getLastGrapheme(value));

const isSpacedWordCore = (value) =>
  SPACED_WORD_CORE.test(value) && !UNSPACED_WORD_SCRIPT.test(value);

const getSpacedWordStart = (items, nextValue, getValue) => {
  const nextIsCore = isSpacedWordCore(nextValue);
  const nextIsConnector = WORD_CONNECTOR.test(nextValue);
  if (
    !nextIsCore &&
    !(nextIsConnector && isSpacedWordCore(getValue(items.at(-1))))
  ) {
    return items.length;
  }

  let index = items.length - 1;
  while (index >= 0) {
    if (isSpacedWordCore(getValue(items[index]))) {
      index -= 1;
      continue;
    }
    if (
      WORD_CONNECTOR.test(getValue(items[index])) &&
      index > 0 &&
      isSpacedWordCore(getValue(items[index - 1]))
    ) {
      index -= 1;
      continue;
    }
    break;
  }
  return index + 1;
};

export const takeLineCarry = (
  items,
  nextValue,
  getValue,
  applyKinsoku = true,
) => {
  const wordBoundary = items.length && /^\s+$/u.test(getValue(items.at(-1)));
  while (items.length && /^\s+$/u.test(getValue(items.at(-1)))) items.pop();
  const carry = [];
  const wordStart = wordBoundary
    ? items.length
    : getSpacedWordStart(items, nextValue, getValue);
  if (wordStart > 0 && wordStart < items.length) {
    carry.unshift(...items.splice(wordStart));
  }
  if (applyKinsoku && isKinsokuLineStart(nextValue) && items.length > 1) {
    carry.unshift(items.pop());
  }
  while (
    applyKinsoku &&
    items.length > 1 &&
    isKinsokuLineEnd(getValue(items.at(-1)))
  ) {
    carry.unshift(items.pop());
  }
  return carry;
};

export const fitEllipsis = (context, value, maxWidth, force = false) => {
  if (!force && context.measureText(value).width <= maxWidth) return value;
  const graphemes = getGraphemes(value.trimEnd());
  while (
    graphemes.length &&
    context.measureText(`${graphemes.join("")}…`).width > maxWidth
  ) {
    graphemes.pop();
  }
  while (graphemes.length && isKinsokuLineEnd(graphemes.at(-1))) {
    graphemes.pop();
  }
  return `${graphemes.join("").trimEnd()}…`;
};

export const wrapPlainText = (context, value, maxWidth, maxLines) => {
  const graphemes = getGraphemes(value);
  const lines = [];
  let line = [];
  let lineWidth = 0;
  let consumed = 0;

  for (const grapheme of graphemes) {
    const graphemeWidth = context.measureText(grapheme).width;
    if (line.length && lineWidth + graphemeWidth > maxWidth) {
      const carry = takeLineCarry(line, grapheme, (item) => item);
      lineWidth = context.measureText(line.join("")).width;
      if (line.length) {
        lines.push(line.join("").trimEnd());
        if (lines.length >= maxLines) break;
        line = carry;
        lineWidth = context.measureText(line.join("")).width;
      }
    }
    if (!line.length && /^\s$/u.test(grapheme)) {
      consumed += 1;
      continue;
    }
    line.push(grapheme);
    lineWidth += graphemeWidth;
    consumed += 1;
  }
  if (lines.length < maxLines && line.length) {
    lines.push(line.join("").trimEnd());
  }
  if (consumed < graphemes.length && lines.length) {
    lines[lines.length - 1] = fitEllipsis(context, lines.at(-1), maxWidth, true);
  }
  return lines;
};

export const getRunFont = (run, config, appearance, size = config.fontSize) => {
  size *= run.fontScale || 1;
  const inlineCode = run.code && !config.codeBlock;
  return {
    size: run.externalLinkIcon
      ? Math.round(size * 0.625)
      : run.baseline
        ? Math.round(size * 0.68)
        : inlineCode
          ? Math.round(size * 0.875)
          : size,
    family:
      run.fontFamily ||
      (run.code
        ? appearance.monoFamily
        : config.family || appearance.contentFontFamily),
    weight:
      run.fontWeight ||
      (run.bold || config.bold
        ? "700"
        : inlineCode
          ? "600"
          : appearance.contentFontWeight),
    italic:
      run.italic || /italic|oblique/u.test(run.fontStyle) || config.italic,
  };
};

const createToken = (context, grapheme, run, config, appearance) => {
  const style = { ...run };
  if (style.inlineImageAsset) {
    const naturalWidth =
      style.inlineImageAsset.naturalWidth || style.inlineImageAsset.width || 1;
    const naturalHeight =
      style.inlineImageAsset.naturalHeight ||
      style.inlineImageAsset.height ||
      1;
    const height = (style.inlineImageHeightEm || 1) * config.fontSize;
    const width =
      (style.inlineImageWidthEm ||
        (height / config.fontSize) * (naturalWidth / naturalHeight)) *
      config.fontSize;
    const scale = Math.min(
      1,
      config.width / width,
      SHARE_CARD_LAYOUT.TEXT_HEIGHT / height,
    );
    const inlineImageWidth = width * scale;
    const inlineImageHeight = height * scale;
    const inlineImageAscent = inlineImageHeight / 2 + config.fontSize * 0.25;
    return {
      text: grapheme,
      style,
      textWidth: inlineImageWidth,
      rubyWidth: 0,
      width: inlineImageWidth,
      inlineImageWidth,
      inlineImageHeight,
      inlineImageAscent,
      inlineImageDescent: Math.max(0, inlineImageHeight - inlineImageAscent),
    };
  }
  if (style.mathAsset) {
    const bodyScale = config.fontSize / style.mathAsset.fontSize;
    const naturalWidth = style.mathAsset.width * bodyScale;
    const naturalHeight = style.mathAsset.height * bodyScale;
    const scale = Math.min(
      1,
      config.width / naturalWidth,
      (SHARE_CARD_LAYOUT.TEXT_HEIGHT - config.paddingTop - config.paddingBottom) /
        naturalHeight,
    );
    const mathWidth = naturalWidth * scale;
    const height = naturalHeight * scale;
    const mathLeadingWidth = style.mathDisplay
      ? 0
      : Math.max(0, Number(style.mathAsset.spaceBefore) || 0) * config.fontSize;
    return {
      text: grapheme,
      style,
      textWidth: mathWidth,
      rubyWidth: 0,
      width: mathLeadingWidth + mathWidth,
      mathWidth,
      mathLeadingWidth,
      mathHeight: height,
      mathBaselineShift:
        style.mathAsset.baselineShiftEm * config.fontSize * scale,
    };
  }
  setCanvasFont(context, getRunFont(style, config, appearance));
  const textWidth = context.measureText(grapheme).width;
  let rubyWidth = 0;
  if (style.ruby) {
    setCanvasFont(
      context,
      getRunFont(
        { ...style, baseline: "", fontWeight: "" },
        config,
        appearance,
        Math.round(config.fontSize * 0.46),
      ),
    );
    rubyWidth = context.measureText(style.ruby).width;
  }
  return {
    text: grapheme,
    style,
    textWidth,
    rubyWidth,
    width:
      Math.max(textWidth, rubyWidth) +
      (style.externalLinkIcon ? config.fontSize * 0.15625 : 0),
  };
};

const createLinkIconToken = (run, config) => {
  const iconSize = config.fontSize * 0.75;
  return {
    text: "\ufffc",
    style: { ...run, linkIcon: true },
    textWidth: iconSize,
    rubyWidth: 0,
    width: iconSize + config.fontSize * 0.25,
    iconSize,
  };
};

const trimLineEnd = (tokens) => {
  const trimmed = [...tokens];
  while (trimmed.length && /^\s+$/u.test(trimmed.at(-1).text)) trimmed.pop();
  return trimmed;
};

const createLine = (tokens, config, hardBreak = false) => {
  const trimmed = trimLineEnd(tokens);
  const mathTokens = trimmed.filter(({ style }) => style.mathAsset);
  const inlineImageTokens = trimmed.filter(
    ({ style }) => style.inlineImageAsset,
  );
  const ascent = Math.max(
    config.fontSize,
    ...mathTokens.map(
      ({ mathHeight, mathBaselineShift }) => mathHeight + mathBaselineShift,
    ),
    ...inlineImageTokens.map(({ inlineImageAscent }) => inlineImageAscent),
  );
  const descent = Math.max(
    config.lineHeight - config.fontSize,
    ...mathTokens.map(({ mathBaselineShift }) => -mathBaselineShift),
    ...inlineImageTokens.map(({ inlineImageDescent }) => inlineImageDescent),
  );
  return {
    tokens: trimmed,
    width: trimmed.reduce((total, token) => total + token.width, 0),
    ascent,
    descent,
    height: ascent + descent,
    hardBreak,
    isLast: false,
  };
};

export const wrapRuns = (context, runs, config, appearance) => {
  const lines = [];
  let tokens = [];
  let width = 0;

  const commitLine = (hardBreak = false) => {
    lines.push(createLine(tokens, config, hardBreak));
    tokens = [];
    width = 0;
  };

  const withoutMathLeadingSpace = (token) =>
    token.mathLeadingWidth
      ? {
          ...token,
          width: token.width - token.mathLeadingWidth,
          mathLeadingWidth: 0,
        }
      : token;

  const pushToken = (nextToken) => {
    let token = tokens.length ? nextToken : withoutMathLeadingSpace(nextToken);
    if (!tokens.length && /^\s+$/u.test(token.text) && !config.codeBlock) {
      return;
    }
    if (tokens.length && width + token.width > config.width) {
      const carry = takeLineCarry(
        tokens,
        token.text,
        ({ text }) => text,
        !config.codeBlock,
      );
      if (token.style.externalLinkIcon && !carry.length && tokens.length > 1) {
        const start = getSpacedWordStart(
          tokens,
          tokens.at(-1).text,
          ({ text }) => text,
        );
        carry.unshift(...tokens.splice(start > 0 ? start : tokens.length - 1));
      }
      if (tokens.at(-1)?.style.linkIcon) {
        carry.unshift(tokens.pop());
      }
      width = tokens.reduce((total, item) => total + item.width, 0);
      if (tokens.length) {
        commitLine();
      }
      tokens = carry;
      width = carry.reduce((total, item) => total + item.width, 0);
      if (!tokens.length) token = withoutMathLeadingSpace(token);
    }
    if (!tokens.length && /^\s+$/u.test(token.text) && !config.codeBlock) {
      return;
    }
    tokens.push(token);
    width += token.width;
  };

  runs.forEach((run) => {
    if (run.linkIconAsset) {
      pushToken(createLinkIconToken(run, config));
    }
    if (run.mathAssets?.length) {
      run.mathAssets.forEach((mathAsset, index) => {
        pushToken(
          createToken(
            context,
            index ? "\ufffc" : run.text,
            { ...run, mathAsset, mathAssets: [] },
            config,
            appearance,
          ),
        );
      });
      return;
    }
    if (run.mathAsset) {
      if (run.mathDisplay && tokens.length) commitLine(true);
      pushToken(createToken(context, run.text, run, config, appearance));
      if (run.mathDisplay) commitLine(true);
      return;
    }
    if (run.ruby) {
      pushToken(createToken(context, run.text, run, config, appearance));
      return;
    }
    if (
      !config.codeBlock &&
      (/[\u0d80-\u0dff]/u.test(run.text) ||
        /abhaya|sinhala/iu.test(run.fontFamily || ""))
    ) {
      for (const word of run.text.match(/\n|[^\S\n]+|\S+/gu) || []) {
        if (word === "\n") {
          commitLine(true);
          continue;
        }
        const token = createToken(context, word, run, config, appearance);
        if (token.width <= config.width) {
          pushToken(token);
          continue;
        }
        let part = "";
        for (const grapheme of getGraphemes(word)) {
          if (
            part &&
            createToken(context, part + grapheme, run, config, appearance)
              .width > config.width
          ) {
            pushToken(createToken(context, part, run, config, appearance));
            part = "";
          }
          part += grapheme;
        }
        if (part) pushToken(createToken(context, part, run, config, appearance));
      }
      return;
    }
    getGraphemes(run.text).forEach((grapheme) => {
      if (grapheme === "\n") {
        commitLine(true);
        return;
      }
      pushToken(createToken(context, grapheme, run, config, appearance));
    });
  });

  if (tokens.length || !lines.length) commitLine();
  lines.at(-1).isLast = true;
  return lines;
};

export const isCjkDominant = (block) => {
  const text = block.runs.map(({ text: value }) => value).join("");
  const han = (text.match(/\p{Script=Han}/gu) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  return han > 0 && han >= latin;
};

const isJustifyGap = (left, right) => {
  if (!left || !right) return false;
  if (
    left.style.linkIcon ||
    right.style.linkIcon ||
    left.style.externalLinkIcon ||
    right.style.externalLinkIcon
  ) {
    return false;
  }
  if (left.style.inlineImageAsset || right.style.inlineImageAsset) return false;
  if (/^\s+$/u.test(left.text) || /^\s+$/u.test(right.text)) return false;
  return /[\p{Script=Han}\u3000-\u303f\uff01-\uff60]/u.test(
    `${left.text}${right.text}`,
  );
};

export const getTokenPositions = (line, config, justify) => {
  const gapIndexes = justify
    ? line.tokens
        .map((token, index) =>
          isJustifyGap(token, line.tokens[index + 1]) ? index : -1,
        )
        .filter((index) => index >= 0)
    : [];
  const extra = gapIndexes.length
    ? Math.max(0, config.width - line.width) / gapIndexes.length
    : 0;
  const gaps = new Set(gapIndexes);
  const alignedShift =
    line.tokens.length === 1 && line.tokens[0].style.mathDisplay
      ? Math.max(0, config.width - line.width) / 2
      : config.align === "center"
        ? Math.max(0, config.width - line.width) / 2
        : ["right", "end"].includes(config.align)
          ? Math.max(0, config.width - line.width)
          : 0;
  let x = config.x + alignedShift;
  return line.tokens.map((token, index) => {
    const position = { token, x };
    x += token.width + (gaps.has(index) ? extra : 0);
    return position;
  });
};
