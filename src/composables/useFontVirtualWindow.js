import { computed, onBeforeUnmount, ref } from "vue";

export const FONT_ROW_HEIGHT = 32;
const GROUP_HEADER_HEIGHT = 28;
const SEARCH_HEADER_HEIGHT = 40;
const POPOVER_PADDING = 4;
const POPOVER_VIEWPORT_HEIGHT = 288;
const FONT_WINDOW_SIZE = 10;
const FONT_OVERSCAN = 1;
const UPLOAD_ACTION_HEIGHT = 32;
const UPLOAD_HINT_HEIGHT = 20;
const DEVICE_ACTION_HEIGHT = 32;

function centerRow(rowTop) {
  return Math.max(
    0,
    rowTop -
      SEARCH_HEADER_HEIGHT -
      (POPOVER_VIEWPORT_HEIGHT - SEARCH_HEADER_HEIGHT - FONT_ROW_HEIGHT) / 2,
  );
}

export function useFontVirtualWindow({
  virtualContainer,
  filteredWebsiteFonts,
  filteredUploadedFonts,
  virtualFonts,
  getModelValue,
  canLoadMore,
  loadMore,
}) {
  const virtualStart = ref(0);
  let pendingVirtualStart = 0;
  let scrollFrame = 0;
  let lastTouchY = null;

  const visibleVirtualFonts = computed(() =>
    virtualFonts.value
      .slice(virtualStart.value, virtualStart.value + FONT_WINDOW_SIZE)
      .map((font, offset) => ({ font, index: virtualStart.value + offset })),
  );

  const virtualWindowStyle = computed(() => ({
    transform: `translate3d(0, ${virtualStart.value * FONT_ROW_HEIGHT}px, 0)`,
  }));

  function cancelPendingWork() {
    if (scrollFrame) cancelAnimationFrame(scrollFrame);
    scrollFrame = 0;
  }

  function getVirtualListTop() {
    if (virtualContainer.value) return virtualContainer.value.offsetTop;
    return (
      POPOVER_PADDING +
      SEARCH_HEADER_HEIGHT +
      (filteredWebsiteFonts.value.length
        ? GROUP_HEADER_HEIGHT +
          filteredWebsiteFonts.value.length * FONT_ROW_HEIGHT
        : 0) +
      GROUP_HEADER_HEIGHT +
      filteredUploadedFonts.value.length * FONT_ROW_HEIGHT +
      UPLOAD_ACTION_HEIGHT +
      UPLOAD_HINT_HEIGHT +
      GROUP_HEADER_HEIGHT +
      DEVICE_ACTION_HEIGHT
    );
  }

  function syncVirtualWindow(list, immediate = false) {
    if (!list) return;
    const virtualScrollTop = Math.max(0, list.scrollTop - getVirtualListTop());
    const maxStart = Math.max(0, virtualFonts.value.length - FONT_WINDOW_SIZE);
    pendingVirtualStart = Math.min(
      maxStart,
      Math.max(
        0,
        Math.floor(virtualScrollTop / FONT_ROW_HEIGHT) - FONT_OVERSCAN,
      ),
    );
    if (immediate) {
      cancelPendingWork();
      virtualStart.value = pendingVirtualStart;
      return;
    }
    if (!scrollFrame) {
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = 0;
        virtualStart.value = pendingVirtualStart;
      });
    }
  }

  function resetVirtualWindow() {
    cancelPendingWork();
    virtualStart.value = 0;
    pendingVirtualStart = 0;
  }

  function prepareSelectedFontPosition() {
    const modelValue = getModelValue();
    let contentTop = POPOVER_PADDING + SEARCH_HEADER_HEIGHT;
    if (filteredWebsiteFonts.value.length) {
      contentTop += GROUP_HEADER_HEIGHT;
      const websiteIndex = filteredWebsiteFonts.value.findIndex(
        ({ id }) => id === modelValue,
      );
      if (websiteIndex >= 0) {
        virtualStart.value = 0;
        pendingVirtualStart = 0;
        return centerRow(contentTop + websiteIndex * FONT_ROW_HEIGHT);
      }
      contentTop += filteredWebsiteFonts.value.length * FONT_ROW_HEIGHT;
    }

    contentTop += GROUP_HEADER_HEIGHT;
    const uploadedIndex = filteredUploadedFonts.value.findIndex(
      ({ id }) => id === modelValue,
    );
    if (uploadedIndex >= 0) {
      virtualStart.value = 0;
      pendingVirtualStart = 0;
      return centerRow(contentTop + uploadedIndex * FONT_ROW_HEIGHT);
    }

    const selectedIndex = virtualFonts.value.findIndex(
      ({ id }) => id === modelValue,
    );
    if (selectedIndex < 0) {
      virtualStart.value = 0;
      pendingVirtualStart = 0;
      return 0;
    }
    const maxStart = Math.max(0, virtualFonts.value.length - FONT_WINDOW_SIZE);
    const nextStart = Math.max(
      0,
      Math.min(maxStart, selectedIndex - Math.floor(FONT_WINDOW_SIZE / 2)),
    );
    virtualStart.value = nextStart;
    pendingVirtualStart = nextStart;
    return centerRow(getVirtualListTop() + selectedIndex * FONT_ROW_HEIGHT);
  }

  function tryLoadMoreAtEnd(list) {
    if (
      !list ||
      !canLoadMore() ||
      list.scrollHeight - list.clientHeight - list.scrollTop > 2
    ) {
      return false;
    }
    loadMore();
    return true;
  }

  function onScroll(event) {
    syncVirtualWindow(event.currentTarget);
  }

  function onWheel(event) {
    if (event.deltaY <= 0 || !tryLoadMoreAtEnd(event.currentTarget)) return;
    event.preventDefault();
  }

  function onTouchStart(event) {
    lastTouchY = event.touches[0]?.clientY ?? null;
  }

  function onTouchMove(event) {
    const touchY = event.touches[0]?.clientY;
    if (touchY == null) return;
    const pullingDown = lastTouchY != null && lastTouchY - touchY > 2;
    lastTouchY = touchY;
    if (!pullingDown || !tryLoadMoreAtEnd(event.currentTarget)) return;
    event.preventDefault();
  }

  function resetTouchPosition() {
    lastTouchY = null;
  }

  function onKeydown(event) {
    if (
      !["ArrowDown", "PageDown", "End"].includes(event.key) ||
      !tryLoadMoreAtEnd(event.currentTarget)
    ) {
      return;
    }
    event.preventDefault();
  }

  onBeforeUnmount(cancelPendingWork);

  return {
    visibleVirtualFonts,
    virtualWindowStyle,
    cancelPendingWork,
    resetVirtualWindow,
    syncVirtualWindow,
    prepareSelectedFontPosition,
    onScroll,
    onWheel,
    onTouchStart,
    onTouchMove,
    resetTouchPosition,
    onKeydown,
  };
}
