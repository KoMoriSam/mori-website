export function rangeIntersectsNode(range, node) {
  if (!range) return true;
  try {
    return range.intersectsNode(node);
  } catch {
    return false;
  }
}

export function decodeAnchor(value) {
  const raw = String(value || "").replace(/^#/, "");
  if (!raw) return "";

  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function waitForReaderLayout() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
  });
}
