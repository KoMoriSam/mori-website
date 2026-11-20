const observers = new Set();
let frame;

export function isAnchorVisible(element) {
  // Closed details can retain cached layout rectangles. Visibility must be
  // checked separately, including content-visibility on ancestor boxes.
  return Boolean(element?.isConnected && element.getClientRects().length &&
    (element.checkVisibility
      ? element.checkVisibility({ visibilityProperty: true, contentVisibilityAuto: true })
      : getComputedStyle(element).visibility !== "hidden"));
}

// Used CSS sizes retain subpixels without including the opening scale effect.
export function getFloatingSize(element) {
  const css = getComputedStyle(element);
  const dimension = (name, sides, fallback) => {
    const value = parseFloat(css[name]);
    if (!Number.isFinite(value)) return fallback;
    return value + (css.boxSizing === "border-box" ? 0 : sides.reduce((sum, side) =>
      sum + (parseFloat(css[`padding${side}`]) || 0) + (parseFloat(css[`border${side}Width`]) || 0), 0));
  };
  return {
    width: dimension("width", ["Left", "Right"], element.offsetWidth),
    height: dimension("height", ["Top", "Bottom"], element.offsetHeight),
  };
}

function observeFrame() {
  frame = undefined;
  const updates = [];
  // Read all open anchors before updating any floating element. A resize
  // observer alone misses movement caused by siblings and CSS transforms.
  for (const observer of observers) {
    const anchor = observer.anchor();
    const reference = observer.reference?.() ?? anchor;
    const floating = observer.floating();
    if (!anchor || !floating?.isConnected ||
        (reference instanceof Element && !isAnchorVisible(reference))) {
      updates.push(() => observer.unavailable?.());
      continue;
    }
    const rect = anchor instanceof Element ? anchor.getBoundingClientRect() : anchor;
    const size = getFloatingSize(floating);
    const viewport = window.visualViewport;
    const values = [
      rect.left, rect.top, rect.right, rect.bottom,
      size.width, size.height,
      document.documentElement.clientWidth, window.innerHeight,
      viewport?.width, viewport?.height, viewport?.offsetLeft, viewport?.offsetTop,
    ];
    if (!observer.previous || values.some((value, index) => value !== observer.previous[index])) {
      observer.previous = values;
      updates.push(() => observer.update(rect));
    }
  }
  for (const update of updates) update();
  if (observers.size && frame === undefined) frame = requestAnimationFrame(observeFrame);
}

/** Track movement only while a floating surface is open, including animation. */
export function observeFloatingPosition(options) {
  const observer = { ...options, previous: null };
  observers.add(observer);
  if (frame === undefined) frame = requestAnimationFrame(observeFrame);
  return () => {
    observers.delete(observer);
    if (!observers.size && frame !== undefined) {
      cancelAnimationFrame(frame);
      frame = undefined;
    }
  };
}
