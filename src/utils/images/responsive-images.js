import { shallowRef } from "vue";
import {
  canonicalAssetUrl,
  createManifestRegistry,
} from "./create-manifest-registry.js";

const entries = shallowRef(new Map());
let imageReads;
export function trackImageReads() {
  imageReads = new Set();
  return imageReads;
}
export function stopTrackingImageReads() {
  imageReads = undefined;
}
export function imageDependency(src) {
  return entries.value.get(src) || null;
}
const DEFAULT_SIZES = "(max-width: 768px) calc(100vw - 2rem), 960px";

const registry = createManifestRegistry({
  manifestPath: "_optimized/manifest.json",
  field: "images",
  applyManifest({ base, records, resolveAsset }) {
    const next = new Map(
      [...entries.value].filter(([key]) => !key.startsWith(base)),
    );
    for (const [source, entry] of Object.entries(records)) {
      const original = resolveAsset(source);
      if (
        !original ||
        !Number.isInteger(entry?.width) ||
        entry.width <= 0 ||
        !Number.isInteger(entry.height) ||
        entry.height <= 0 ||
        !Array.isArray(entry.variants)
      )
        continue;
      const variants = entry.variants
        .flatMap((variant) => {
          const src = resolveAsset(variant?.src);
          return src &&
            Number.isInteger(variant.width) &&
            variant.width > 0 &&
            variant.width <= entry.width
            ? [{ src, width: variant.width }]
            : [];
        })
        .sort((a, b) => a.width - b.width);
      if (variants.length) {
        const value = {
          original,
          width: entry.width,
          height: entry.height,
          variants,
        };
        next.set(original, value);
        variants.forEach(({ src }) => next.set(src, value));
      }
    }
    entries.value = next;
  },
});

export function registerImageManifest(manifest, base) {
  registry.register(base, manifest);
}

export const loadImageManifest = registry.load;

export function getImageAttrs(src, sizes = DEFAULT_SIZES) {
  const key = canonicalAssetUrl(src);
  imageReads?.add(key);
  const entry = entries.value.get(key);
  if (!entry) return { src };
  const fallback =
    entry.variants.find((variant) => variant.width >= 640) ||
    entry.variants.at(-1);
  return {
    src: fallback.src,
    srcset: entry.variants
      .map((variant) => `${variant.src} ${variant.width}w`)
      .join(", "),
    sizes,
    decoding: "async",
    "data-original-src": entry.original,
    "data-original-width": entry.width,
    "data-original-height": entry.height,
    onError: restoreOriginalImage,
  };
}

export function restoreOriginalImage(event) {
  const image = event.currentTarget;
  const original = image?.getAttribute("data-original-src");
  if (!original || image.getAttribute("src") === original) return;
  event.stopImmediatePropagation?.();
  image.removeAttribute("srcset");
  image.removeAttribute("sizes");
  image.src = original;
}

export function getImageUrl(src, width = 1440) {
  const key = canonicalAssetUrl(src);
  imageReads?.add(key);
  const entry = entries.value.get(key);
  return entry
    ? (
        entry.variants.find((variant) => variant.width >= width) ||
        entry.variants.at(-1)
      ).src
    : src;
}
