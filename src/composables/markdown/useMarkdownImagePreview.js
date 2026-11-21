const PREVIEW_SVG_FILTER = "invert(1) hue-rotate(180deg)";
const FALLBACK_IMAGE_WIDTH = 1200;
const FALLBACK_IMAGE_HEIGHT = 800;

export function useMarkdownImagePreview({
  articleRef,
  imagePreviewRef,
  translate,
}) {
  const isPreviewImage = (image) => {
    if (!(image instanceof HTMLImageElement)) return false;
    if (image.closest("[data-reader-link-icon]")) return false;

    return Boolean(
      image.matches("img.preview-image") ||
      image.closest("[data-markdown-chat], [data-markdown-moment]"),
    );
  };

  const getPreviewImages = (root = articleRef.value) =>
    root ? Array.from(root.querySelectorAll("img")).filter(isPreviewImage) : [];

  const syncPreviewImages = (root = articleRef.value) => {
    getPreviewImages(root).forEach((image) => {
      image.classList.add("preview-image");
      image.setAttribute("role", "button");
      image.setAttribute("tabindex", "0");

      if (!image.hasAttribute("aria-label")) {
        const alt = image.getAttribute("alt")?.trim();
        image.setAttribute(
          "aria-label",
          alt
            ? translate("markdown.content.previewLabel", { p0: alt })
            : translate("markdown.content.preview"),
        );
      }
    });
  };

  const getPreviewImage = (target) => {
    const image = target instanceof Element ? target.closest("img") : null;
    return isPreviewImage(image) ? image : null;
  };

  const getPreviewCaption = (image) => {
    const figure = image.closest("figure.markdown-figure");
    return (
      figure?.querySelector(":scope > figcaption")?.textContent?.trim() ||
      image.getAttribute("alt")?.trim() ||
      ""
    );
  };

  const getPreviewDimensions = (image) => {
    const originalWidth = Number(image.getAttribute("data-original-width"));
    const originalHeight = Number(image.getAttribute("data-original-height"));
    if (originalWidth > 0 && originalHeight > 0) {
      return { width: originalWidth, height: originalHeight };
    }
    if (image.naturalWidth && image.naturalHeight) {
      return { width: image.naturalWidth, height: image.naturalHeight };
    }

    const width = Number(image.getAttribute("width"));
    const height = Number(image.getAttribute("height"));
    if (width > 0 && height > 0) return { width, height };

    const bounds = image.getBoundingClientRect();
    if (bounds.width >= 160 && bounds.height >= 120) {
      return {
        width: Math.round(bounds.width),
        height: Math.round(bounds.height),
      };
    }

    return {
      width: FALLBACK_IMAGE_WIDTH,
      height: FALLBACK_IMAGE_HEIGHT,
    };
  };

  const createPreviewSlide = (image, index) => {
    const src =
      image.getAttribute("data-original-src") || image.currentSrc || image.src;
    const imageStyle = window.getComputedStyle(image);
    const inheritedFilter = imageStyle.filter;
    const isSvg =
      image.classList.contains("markdown-svg-image") ||
      /\.svg(?:[?#]|$)/iu.test(src);
    const sourceFilterFrom =
      inheritedFilter && inheritedFilter !== "none" ? inheritedFilter : "none";
    const sourceFilter = isSvg
      ? PREVIEW_SVG_FILTER
      : inheritedFilter && inheritedFilter !== "none"
        ? inheritedFilter
        : "";

    return {
      id: image.id || `${src}-${index}`,
      src,
      msrc: image.currentSrc || image.src,
      ...getPreviewDimensions(image),
      alt: image.getAttribute("alt") || "",
      caption: getPreviewCaption(image),
      thumbCropped: imageStyle.objectFit === "cover",
      sourceFilter,
      sourceFilterFrom:
        isSvg && sourceFilterFrom !== sourceFilter ? sourceFilterFrom : "",
      element: image,
    };
  };

  const openImagePreview = (image, pointer = null) => {
    const root = articleRef.value;
    if (!image || !root?.contains(image)) return;

    const images = getPreviewImages(root);
    const index = images.indexOf(image);
    if (index < 0) return;

    const slides = images.map(createPreviewSlide);
    imagePreviewRef.value?.open({ slides, index, pointer });
  };

  const handleArticleClick = (event) => {
    if (
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.shiftKey
    ) {
      return;
    }

    const image = getPreviewImage(event.target);
    if (!image) return;

    event.preventDefault();
    event.stopPropagation();
    openImagePreview(image, { x: event.clientX, y: event.clientY });
  };

  const handleArticleKeydown = (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;

    const image = getPreviewImage(event.target);
    if (!image || image !== event.target) return;

    event.preventDefault();
    event.stopPropagation();
    openImagePreview(image);
  };

  return {
    syncPreviewImages,
    handleArticleClick,
    handleArticleKeydown,
  };
}
