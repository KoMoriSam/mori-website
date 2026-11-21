import { nextTick, onBeforeUnmount, onMounted } from "vue";

function resizeTextarea(textarea) {
  const borderHeight = textarea.offsetHeight - textarea.clientHeight;
  if (textarea.scrollHeight > textarea.clientHeight + 1) {
    return textarea.scrollHeight + borderHeight;
  }
  const scrollTop = textarea.scrollTop;
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight + borderHeight}px`;
  textarea.scrollTop = scrollTop;
  return textarea.offsetHeight;
}

function controlViewportTop(element) {
  return (
    element.getBoundingClientRect().top -
    (window.visualViewport?.offsetTop ?? 0)
  );
}

export function useTextPaneLayout({ inputMode, getPaneElements }) {
  let resizeFrame = null;
  let resizeRequest = 0;
  let viewportWidth = 0;
  let viewportHeight = 0;
  let pendingControlViewport = null;
  let stopControlViewportRestore = null;
  let lastTextScrollSide = "unicode";
  let expectedSyncedScroll = null;

  function syncTextScroll(side) {
    const { unicodeViewport, fmViewport } = getPaneElements();
    const source = side === "unicode" ? unicodeViewport : fmViewport;
    const target = side === "unicode" ? fmViewport : unicodeViewport;
    if (!source || !target) return;
    if (
      expectedSyncedScroll?.side === side &&
      Math.abs(source.scrollTop - expectedSyncedScroll.top) < 1
    ) {
      expectedSyncedScroll = null;
      return;
    }
    expectedSyncedScroll = null;
    lastTextScrollSide = side;
    const sourceRange = Math.max(0, source.scrollHeight - source.clientHeight);
    const targetRange = Math.max(0, target.scrollHeight - target.clientHeight);
    const targetTop = sourceRange
      ? (source.scrollTop / sourceRange) * targetRange
      : 0;
    if (Math.abs(target.scrollTop - targetTop) < 1) return;
    target.scrollTop = targetTop;
    expectedSyncedScroll = {
      side: side === "unicode" ? "legacy" : "unicode",
      top: target.scrollTop,
    };
  }

  function resizeAllTextareas() {
    if (inputMode.value !== "text") return;
    const { unicodeField, unicodeViewport, fmField, fmViewport } =
      getPaneElements();
    if (!unicodeViewport || !fmViewport || !unicodeField || !fmField) {
      return;
    }

    unicodeField.style.height = "";
    fmField.style.height = "";
    const unicodeFieldExtra =
      unicodeField.offsetHeight - unicodeViewport.offsetHeight;
    const fmFieldExtra = fmField.offsetHeight - fmViewport.offsetHeight;
    const unicodeHeight = resizeTextarea(unicodeViewport);
    const fmPreviewHeight = resizeTextarea(fmViewport);
    const maxFieldHeight = Math.max(
      256,
      Math.min(512, (viewportHeight || window.innerHeight) * 0.25),
    );
    const sharedFieldHeight = Math.min(
      maxFieldHeight,
      Math.ceil(
        Math.max(
          unicodeHeight + unicodeFieldExtra,
          fmPreviewHeight + fmFieldExtra,
        ),
      ),
    );

    unicodeViewport.style.height = `${sharedFieldHeight - unicodeFieldExtra}px`;
    fmViewport.style.height = `${sharedFieldHeight - fmFieldExtra}px`;

    unicodeField.style.height = `${sharedFieldHeight}px`;
    fmField.style.height = `${sharedFieldHeight}px`;
    syncTextScroll(lastTextScrollSide);
  }

  function scheduleTextareaResize() {
    const request = ++resizeRequest;
    nextTick(() => {
      if (request !== resizeRequest) return;
      if (resizeFrame !== null) return;
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = null;
        resizeAllTextareas();
      });
    });
  }

  function cancelScheduledTextareaResize() {
    resizeRequest++;
    if (resizeFrame !== null) {
      window.cancelAnimationFrame(resizeFrame);
      resizeFrame = null;
    }
  }

  function handleWindowResize() {
    if (window.innerWidth === viewportWidth) return;
    viewportWidth = window.innerWidth;
    viewportHeight = window.innerHeight;
    scheduleTextareaResize();
  }

  function captureControlViewport(event) {
    if (
      event instanceof KeyboardEvent &&
      ![" ", "Enter", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
        event.key,
      )
    ) {
      return;
    }

    const target = event.target instanceof Element ? event.target : null;
    const element =
      event.currentTarget?.id === "swap-direction"
        ? event.currentTarget
        : target?.closest("label");
    if (element) {
      pendingControlViewport = { element, top: controlViewportTop(element) };
    }
  }

  function stabilizeControlViewport(event) {
    stopControlViewportRestore?.();
    if (!event) {
      pendingControlViewport = null;
      return;
    }
    const target = event.target instanceof Element ? event.target : null;
    const element = target?.closest("label, button") ?? event.currentTarget;
    const anchor = pendingControlViewport?.element.isConnected
      ? pendingControlViewport
      : element instanceof Element
        ? { element, top: controlViewportTop(element) }
        : null;
    pendingControlViewport = null;
    if (!anchor) return;

    const restore = () => {
      if (!anchor.element.isConnected) return;
      const delta = controlViewportTop(anchor.element) - anchor.top;
      if (Math.abs(delta) > 1) {
        window.scrollTo({ top: window.scrollY + delta, behavior: "instant" });
      }
    };
    const viewport = window.visualViewport;
    const restoreAfterViewportResize = () =>
      window.requestAnimationFrame(restore);
    viewport?.addEventListener("resize", restoreAfterViewportResize);
    const timer = window.setTimeout(() => {
      viewport?.removeEventListener("resize", restoreAfterViewportResize);
      stopControlViewportRestore = null;
    }, 600);
    stopControlViewportRestore = () => {
      window.clearTimeout(timer);
      viewport?.removeEventListener("resize", restoreAfterViewportResize);
      stopControlViewportRestore = null;
    };

    nextTick(() => {
      window.requestAnimationFrame(() => {
        restore();
        window.requestAnimationFrame(restore);
      });
    });
  }

  onMounted(() => {
    viewportWidth = window.innerWidth;
    viewportHeight = window.innerHeight;
    document.fonts?.ready.then(scheduleTextareaResize);
    window.addEventListener("resize", handleWindowResize);
  });

  onBeforeUnmount(() => {
    stopControlViewportRestore?.();
    window.removeEventListener("resize", handleWindowResize);
    if (resizeFrame !== null) {
      window.cancelAnimationFrame(resizeFrame);
      resizeFrame = null;
    }
  });

  return {
    resizeAllTextareas,
    scheduleTextareaResize,
    cancelScheduledTextareaResize,
    syncTextScroll,
    captureControlViewport,
    stabilizeControlViewport,
  };
}
