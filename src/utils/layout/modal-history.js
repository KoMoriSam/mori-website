const MODAL_FALLBACK_STATE_KEY = "__moriModalFallback";
const retiredFallbackListeners = new Map();
const modalPopstateHandlers = [];
const blockedDismissAnimations = new WeakMap();

let modalFallbackSequence = 0;
let activeModalFallbacks = 0;
let modalFallbackRestoreFrame = 0;
let modalFallbackRestoring = false;
let dispatcherInstalled = false;

export function installModalHistoryDispatcher() {
  if (import.meta.env.SSR || dispatcherInstalled) return;
  dispatcherInstalled = true;
  window.addEventListener(
    "popstate",
    (event) => {
      const handleModalFallback = modalPopstateHandlers.at(-1);
      if (typeof handleModalFallback !== "function") return;

      event.stopImmediatePropagation();
      handleModalFallback(event);
    },
    { capture: true },
  );
}

export function isModalFallbackActive() {
  return activeModalFallbacks > 0;
}

export function isModalFallbackRestoring() {
  return modalFallbackRestoring;
}

export function isModalHistoryBusy() {
  return activeModalFallbacks > 0 || modalFallbackRestoring;
}

export function beginModalFallback() {
  activeModalFallbacks += 1;
}

export function endModalFallback() {
  activeModalFallbacks = Math.max(0, activeModalFallbacks - 1);
}

export function finishModalFallbackRestore(
  restore,
  scrollRestoration,
  snapshot = null,
) {
  window.cancelAnimationFrame(modalFallbackRestoreFrame);
  modalFallbackRestoring = true;
  const restoreViewport = () => {
    const scrollX = Number(snapshot?.scrollX);
    const scrollY = Number(snapshot?.scrollY);
    if (Number.isFinite(scrollX) && Number.isFinite(scrollY)) {
      document.scrollingElement?.scrollTo(scrollX, scrollY);
    } else {
      restore();
    }
  };
  const finish = () => {
    window.history.scrollRestoration = scrollRestoration;
    modalFallbackRestoring = false;
  };

  restoreViewport();
  restore();
  modalFallbackRestoreFrame = window.requestAnimationFrame(() => {
    restoreViewport();
    modalFallbackRestoreFrame = window.requestAnimationFrame(finish);
  });
}

const getFallbackState = (state = window.history.state) =>
  state?.[MODAL_FALLBACK_STATE_KEY] ?? null;

const setModalPopstateHandler = (handler) => {
  const index = modalPopstateHandlers.indexOf(handler);
  if (index !== -1) modalPopstateHandlers.splice(index, 1);
  modalPopstateHandlers.push(handler);
};

const clearModalPopstateHandler = (handler) => {
  const index = modalPopstateHandlers.indexOf(handler);
  if (index !== -1) modalPopstateHandlers.splice(index, 1);
};

const withoutFallbackState = (state = window.history.state) => {
  if (!state || typeof state !== "object") return {};
  const { [MODAL_FALLBACK_STATE_KEY]: _fallback, ...rest } = state;
  return rest;
};

const removeRetiredFallbackListener = (token, { restore = false } = {}) => {
  const fallback = retiredFallbackListeners.get(token);
  if (!fallback) return;
  clearModalPopstateHandler(fallback.listener);
  retiredFallbackListeners.delete(token);
  if (restore) window.history.scrollRestoration = fallback.scrollRestoration;
};

const retireHistoryFallback = (token, scrollRestoration) => {
  const fallback = getFallbackState();
  if (fallback?.token !== token || fallback.status !== "active") return;

  window.history.replaceState(
    {
      ...withoutFallbackState(),
      [MODAL_FALLBACK_STATE_KEY]: { token, status: "retired" },
    },
    "",
    `${window.location.pathname}${window.location.search}${window.location.hash}`,
  );

  const skipRetiredEntry = () => {
    removeRetiredFallbackListener(token);
    window.history.back();
    window.setTimeout(() => {
      window.history.scrollRestoration = scrollRestoration;
    }, 0);
  };
  retiredFallbackListeners.set(token, {
    listener: skipRetiredEntry,
    scrollRestoration,
  });
  setModalPopstateHandler(skipRetiredEntry);
};

export function createModalHistoryFallback(
  onBack,
  {
    snapshot: preservedSnapshot,
    scrollRestoration: preservedRestoration,
    capturePosition,
    restorePosition,
  } = {},
) {
  installModalHistoryDispatcher();
  const currentFallback = getFallbackState();
  if (currentFallback?.status === "retired") {
    removeRetiredFallbackListener(currentFallback.token, { restore: true });
  }

  const scrollRestoration =
    preservedRestoration ?? window.history.scrollRestoration;
  window.history.scrollRestoration = "manual";

  const token = `modal-${Date.now()}-${modalFallbackSequence++}`;
  const fallbackUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const fallbackAnchorToken = window.location.hash;
  const fallbackPosition =
    preservedSnapshot ||
    capturePosition?.() || {
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    };
  const nextState = {
    ...withoutFallbackState(),
    [MODAL_FALLBACK_STATE_KEY]: { token, status: "active" },
  };

  if (currentFallback?.status === "retired") {
    window.history.replaceState(nextState, "", fallbackUrl);
  } else {
    window.history.pushState(nextState, "", fallbackUrl);
  }

  const handlePopState = () => {
    clearModalPopstateHandler(handlePopState);
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (currentUrl !== fallbackUrl) {
      window.history.replaceState(window.history.state, "", fallbackUrl);
    }
    onBack();
    const runRestore = (suppressNavigationRestore = false) =>
      restorePosition?.({
        anchorToken: fallbackAnchorToken,
        snapshot: fallbackPosition,
        suppressNavigationRestore,
      });

    if (!runRestore(true)) {
      finishModalFallbackRestore(() => {}, scrollRestoration, fallbackPosition);
      return;
    }

    finishModalFallbackRestore(
      () => runRestore(false),
      scrollRestoration,
      fallbackPosition,
    );
  };
  setModalPopstateHandler(handlePopState);

  return {
    snapshot: fallbackPosition,
    scrollRestoration,
    retire: () => {
      clearModalPopstateHandler(handlePopState);
      if (getFallbackState()?.token === token) {
        retireHistoryFallback(token, scrollRestoration);
      } else {
        window.history.scrollRestoration = scrollRestoration;
      }
    },
    release: () => {
      clearModalPopstateHandler(handlePopState);
      window.history.scrollRestoration = scrollRestoration;
    },
  };
}

export function animateBlockedDismiss(element, { focus = false } = {}) {
  if (!element) return;
  if (focus) element.focus?.({ preventScroll: true });
  if (
    typeof element.animate !== "function" ||
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  ) {
    return;
  }

  blockedDismissAnimations.get(element)?.cancel();
  const animation = element.animate(
    [
      { transform: "translateX(0)" },
      { transform: "translateX(-0.5rem)" },
      { transform: "translateX(0.4rem)" },
      { transform: "translateX(-0.25rem)" },
      { transform: "translateX(0.15rem)" },
      { transform: "translateX(0)" },
    ],
    { duration: 280, easing: "ease-out" },
  );
  blockedDismissAnimations.set(element, animation);
}

export function cancelBlockedDismissAnimation(element) {
  if (!element) return;
  blockedDismissAnimations.get(element)?.cancel();
  blockedDismissAnimations.delete(element);
}
