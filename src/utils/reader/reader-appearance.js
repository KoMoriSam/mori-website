import {
  MOBILE_READER_COLOR_THEMES,
  READER_STYLE_DEFAULTS,
  getReaderBackgroundImage,
  getReaderBackgroundImageUrl,
} from "../../constants/reader.js";

export const SEMANTIC_READER_THEMES = new Set(
  MOBILE_READER_COLOR_THEMES.map(({ value }) => value).filter(
    (value) => value !== "site",
  ),
);

export const DARK_READER_THEMES = new Set(["forest", "dim"]);

export function formatCssBackgroundImage(url) {
  return url ? `url("${String(url).replaceAll('"', '\\"')}")` : undefined;
}

export function resolveReaderAppearance(styles = {}) {
  const rawColorTheme = styles?.colorTheme;
  const colorTheme =
    rawColorTheme === "custom" || SEMANTIC_READER_THEMES.has(rawColorTheme)
      ? rawColorTheme
      : READER_STYLE_DEFAULTS.colorTheme;

  const requestedBackgroundImage =
    styles?.backgroundType === "image" && styles?.backgroundImage
      ? getReaderBackgroundImage(styles.backgroundImage)
      : undefined;
  const backgroundType = requestedBackgroundImage
    ? "image"
    : READER_STYLE_DEFAULTS.backgroundType;

  const hasCustomAppearance = Boolean(
    styles?.textColor || styles?.backgroundColor || requestedBackgroundImage,
  );
  const usesCustomColors = colorTheme === "custom" || hasCustomAppearance;

  const resolvedThemeCandidate =
    backgroundType === "image"
      ? requestedBackgroundImage?.colorTheme
      : colorTheme;
  const semanticTheme = SEMANTIC_READER_THEMES.has(resolvedThemeCandidate)
    ? resolvedThemeCandidate
    : "";

  const textColor = usesCustomColors
    ? styles?.textColor || requestedBackgroundImage?.textColor || ""
    : "";
  const backgroundColor =
    usesCustomColors && backgroundType !== "image"
      ? styles?.backgroundColor || ""
      : "";
  const backgroundImageConfig = usesCustomColors
    ? requestedBackgroundImage
    : undefined;
  const backgroundImageUrl = backgroundImageConfig?.id
    ? getReaderBackgroundImageUrl(backgroundImageConfig.id)
    : "";
  const backgroundImageStyle = formatCssBackgroundImage(backgroundImageUrl);
  const isDarkBackgroundImage = DARK_READER_THEMES.has(
    backgroundImageConfig?.colorTheme,
  );

  return {
    colorTheme,
    backgroundType,
    backgroundImageConfig,
    backgroundImageUrl,
    backgroundImageStyle,
    hasCustomAppearance,
    usesCustomColors,
    semanticTheme,
    textColor,
    backgroundColor,
    isDarkBackgroundImage,
  };
}

export function getReaderSurfaceStyle(
  styles = {},
  {
    includeThemeVars = false,
    fallbackTextColor,
    alwaysApplyBackgroundImageProps = false,
  } = {},
) {
  const {
    textColor,
    backgroundColor,
    backgroundImageConfig,
    backgroundImageStyle,
    isDarkBackgroundImage,
  } = resolveReaderAppearance(styles);

  const hasBackgroundImage = Boolean(backgroundImageConfig);
  const surfaceStyle = {
    color: textColor || fallbackTextColor || undefined,
    backgroundColor: backgroundColor || undefined,
    backgroundImage: backgroundImageStyle,
    backgroundPosition:
      hasBackgroundImage || alwaysApplyBackgroundImageProps
        ? "center"
        : undefined,
    backgroundRepeat:
      hasBackgroundImage || alwaysApplyBackgroundImageProps
        ? "no-repeat"
        : undefined,
    backgroundSize:
      hasBackgroundImage || alwaysApplyBackgroundImageProps
        ? "cover"
        : undefined,
  };

  if (!includeThemeVars) {
    return surfaceStyle;
  }

  return {
    ...surfaceStyle,
    "--reader-text-color": textColor || "var(--color-base-content)",
    "--color-base-content": textColor || undefined,
    "--color-base-100": backgroundColor || undefined,
    "--color-base-200": backgroundColor
      ? `color-mix(in oklab, ${backgroundColor} 94%, ${textColor || "black"})`
      : undefined,
    "--color-base-300": backgroundColor
      ? `color-mix(in oklab, ${backgroundColor} 88%, ${textColor || "black"})`
      : undefined,
    "--reader-loading-overlay-color": hasBackgroundImage
      ? isDarkBackgroundImage
        ? "rgb(0 0 0 / 0.8)"
        : "rgb(255 255 255 / 0.8)"
      : undefined,
    "--reader-loading-overlay-content": hasBackgroundImage
      ? isDarkBackgroundImage
        ? "rgb(255 255 255 / 0.75)"
        : "rgb(0 0 0 / 0.7)"
      : undefined,
  };
}
