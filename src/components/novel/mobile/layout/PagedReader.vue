<template>
  <section
    ref="sectionRef"
    class="relative flex min-h-0 flex-1 flex-col overflow-hidden"
    :aria-label="translate('reader.paged.label')"
    :aria-busy="showChapterLoadingOverlay"
    :style="readerTypography"
  >
    <div
      ref="viewportRef"
      class="mobile-page-viewport relative min-h-0 shrink-0 overflow-hidden overscroll-none"
      :class="{
        'opacity-60': isMeasuring && !hasMeasured && !chapterSnapshotVisible,
        'pagination-measuring': isMeasuring,
        'pagination-layout-resetting': paginationLayoutResetting,
        'chapter-transition-preparing':
          chapterSnapshotVisible && !chapterSnapshotLeaving,
      }"
      :style="viewportStyle"
      @pointerdown.capture="handlePointerDown"
      @pointermove.capture="handlePointerMove"
      @pointerup.capture="handlePointerUp"
      @pointercancel.capture="resetPointer"
      @click="handleViewportClick"
      @contextmenu.capture.prevent="handleContextMenu"
    >
      <Renderer
        layout="reading"
        :content="content"
        :is-loading="isLoading"
        :show-loading="false"
        :header-data="headerData"
        :style-configs="styleConfigs"
        use-reader-colors
        :manage-route-anchor="false"
        class="mobile-page-article"
        @render-ready="scheduleMeasure"
      >
        <template #before>
          <ChapterHeader
            v-if="chapter"
            :chapter="chapter"
            :stats="chapterStats"
            class="mobile-chapter-header not-prose break-inside-avoid-column"
            @open-comments="emit('open-comments', $event)"
          />
        </template>
        <template #after>
          <span
            ref="endMarkerRef"
            class="mobile-pagination-end"
            aria-hidden="true"
          ></span>
        </template>
      </Renderer>

      <PageFootnotes
        v-show="!chapterSnapshotVisible"
        :notes="currentPageFootnotes"
      />

      <div
        v-if="isDevelopment"
        class="mobile-page-baseline-grid pointer-events-none absolute inset-0 z-20"
        aria-hidden="true"
      ></div>

      <div
        v-show="chapterSnapshotVisible"
        ref="chapterSnapshotRef"
        class="pointer-events-none absolute inset-0 z-30 overflow-hidden bg-base-100 transition-[transform,opacity] duration-220ms ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none"
        :class="{
          'opacity-0':
            chapterSnapshotLeaving && chapterTransitionDirection === 0,
        }"
        :style="{
          ...chapterSnapshotSurfaceStyle,
          transform: chapterSnapshotTransform,
        }"
        aria-hidden="true"
      ></div>

      <MobileReaderHint
        :visible="showNavigationHint"
        mode="paged"
        @dismiss="dismissReaderHint"
      />
    </div>

    <ChapterToc
      mobile
      progress-only
      viewport-pagination
      :page-progress="pageProgress"
      @progress-change="handleReadingProgressChange"
    />

    <div
      ref="footnoteMeasureRef"
      class="pointer-events-none invisible fixed top-0 left-[-10000px]"
      :style="{
        width: `${pageWidth}px`,
      }"
      aria-hidden="true"
    >
      <PageFootnotes :notes="measuringFootnotes" measure />
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, toRef, watch } from "vue";
import { useRoute } from "vue-router";

import Renderer from "@/components/markdown/Renderer.vue";
import ChapterHeader from "@/components/novel/ChapterHeader.vue";
import ChapterToc from "@/components/novel/ChapterToc.vue";
import MobileReaderHint from "@/components/novel/mobile/display/MobileReaderHint.vue";
import PageFootnotes from "./PageFootnotes.vue";
import { useChapters } from "@/composables/novel/useChapters";
import { usePagedChapterTransition } from "@/composables/novel/usePagedChapterTransition";
import { usePagedFootnoteLayout } from "@/composables/novel/usePagedFootnoteLayout";
import { usePagedGeometry } from "@/composables/novel/usePagedGeometry";
import { usePagedReaderInput } from "@/composables/novel/usePagedReaderInput";
import { usePagedReadingPosition } from "@/composables/novel/usePagedReadingPosition";
import { usePaginationKeyboardFreeze } from "@/composables/novel/usePaginationKeyboardFreeze";
import { usePaginationObservers } from "@/composables/novel/usePaginationObservers";
import { usePaginationScheduler } from "@/composables/novel/usePaginationScheduler";
import { useReaderHint } from "@/composables/novel/useReaderHint";
import { useReaderTextContext } from "@/composables/reader/useReaderTextContext";
import { useReadingStateStorage } from "@/composables/storage/useReadingStateStorage";
import { useLocale } from "@/i18n";
import { waitForReaderLayout } from "@/utils/reader/dom";
import {
  getReaderSurfaceStyle,
  resolveReaderAppearance,
} from "@/utils/reader/reader-appearance";
import {
  readerTypographyMetrics,
  readerTypographyStyle,
} from "@/utils/reader/reader-typography";
import { restoreMobileTables } from "@/utils/reader/split-mobile-tables";

const isDevelopment = import.meta.env.DEV;
const MAX_EMPTY_PAGE_RECOVERY_PASSES = 3;
const SWIPE_DISTANCE = 26;
const VIEWPORT_SETTLE_DELAY = 120;
const TYPOGRAPHY_SETTLE_DELAY = 90;
const KEYBOARD_MIN_HEIGHT_DELTA = 80;

const props = defineProps({
  content: { type: String, default: "" },
  chapter: { type: Object, default: null },
  chapterStats: { type: Array, default: () => [] },
  headerData: { type: Object, required: true },
  styleConfigs: { type: Object, required: true },
  isLoading: { type: Boolean, default: false },
  controlsOpen: { type: Boolean, default: false },
  tapZones: { type: Array, default: () => [] },
  wheelPagination: { type: Boolean, default: false },
});

const emit = defineEmits([
  "progress",
  "controls-open-change",
  "controller-state",
  "reader-action",
  "text-context",
  "open-comments",
  "loading-overlay-change",
]);

const { t: translate } = useLocale();
const route = useRoute();
const { getState, setState } = useReadingStateStorage();
const { hasPrevious, hasNext, handlePrev, handleNext } = useChapters();

const sectionRef = ref(null);
const viewportRef = ref(null);
const endMarkerRef = ref(null);
const chapterSnapshotRef = ref(null);
const footnoteMeasureRef = ref(null);

const isMeasuring = ref(true);
const hasMeasured = ref(false);
const measuredChapterUuid = ref("");
const {
  visible: showNavigationHint,
  show: showReaderHint,
  dismiss: dismissReaderHint,
} = useReaderHint();

let measureToken = 0;
let emptyPageRecoveryPasses = 0;
let forcePaginationResetPending = true;

const typography = computed(() => readerTypographyMetrics(props.styleConfigs));
const readerAppearance = computed(() =>
  resolveReaderAppearance(props.styleConfigs),
);
const chapterSnapshotSurfaceStyle = computed(() => {
  const { color: _color, ...surface } = getReaderSurfaceStyle(
    props.styleConfigs,
  );
  return surface;
});
const readerTypography = computed(() =>
  readerTypographyStyle(props.styleConfigs),
);
const paginationReady = computed(
  () =>
    hasMeasured.value &&
    !isMeasuring.value &&
    measuredChapterUuid.value === String(props.chapter?.uuid || ""),
);

const getArticleElement = () =>
  viewportRef.value?.querySelector(":scope > .markdown-reading");

const geometry = usePagedGeometry({
  sectionRef,
  viewportRef,
  endMarkerRef,
  typography,
});
const {
  currentPage,
  totalPages,
  pageWidth,
  pageHeight,
  leadingEmptyPages,
  pageProgress,
  normalizePage,
  measureViewportLayout,
  getViewportCssVars,
} = geometry;

const {
  beginChapterNavigation,
  cancelChapterNavigation,
  captureChapterSnapshot,
  chapterEnterOffset,
  chapterLoadingOverlayVisible,
  chapterNavigationPending,
  chapterSnapshotLeaving,
  chapterSnapshotTransform,
  chapterSnapshotVisible,
  chapterTransitionDirection,
  handleReadingProgressChange,
  revealMeasuredChapter,
  totalReadingProgress,
} = usePagedChapterTransition({
  chapterSnapshotRef,
  getArticleElement,
  getSnapshotStyles: () =>
    getViewportCssVars({
      footnoteReserve: footnoteReserve.value,
      snapshot: true,
    }),
  pageStride: geometry.pageStride,
  paginationReady,
  canCapture: hasMeasured,
});

const pageCoords = geometry.createPageCoordinates(chapterEnterOffset);

const {
  persistPosition,
  resetRestoredChapter,
  restorePage,
  restoredChapterUuid,
} = usePagedReadingPosition({
  route,
  chapter: toRef(props, "chapter"),
  currentPage,
  totalPages,
  viewportRef,
  getArticleElement,
  getElementPage: pageCoords.getElementPage,
  getState,
  setState,
});

const {
  clearFootnotes,
  currentPageFootnotes,
  footnoteReserve,
  measuringFootnotes,
  paginatePageFootnotes,
  paginationLayoutResetting,
  resetPaginationLayout,
  rollbackIncompleteFootnoteLayout,
} = usePagedFootnoteLayout({
  footnoteMeasureRef,
  geometry,
  pageCoords,
  isCurrent: (token) => token === measureToken,
});

const viewportStyle = computed(() => ({
  ...getViewportCssVars({
    footnoteReserve: footnoteReserve.value,
    chapterEnterOffset: chapterEnterOffset.value,
  }),
  height: `${pageHeight.value}px`,
  backgroundColor: readerAppearance.value.backgroundColor || undefined,
}));

const showChapterLoadingOverlay = computed(
  () =>
    props.isLoading ||
    chapterLoadingOverlayVisible.value ||
    !hasMeasured.value ||
    measuredChapterUuid.value !== String(props.chapter?.uuid || ""),
);

watch(
  showChapterLoadingOverlay,
  (visible) => emit("loading-overlay-change", visible),
  { immediate: true },
);

const measurePages = async () => {
  if (isKeyboardPaginationFrozen()) return;
  const viewport = viewportRef.value;
  if (!viewport || props.isLoading) return;

  if (viewport.clientWidth <= 1 || viewport.clientHeight <= 1) {
    isMeasuring.value = false;
    return;
  }

  const token = ++measureToken;
  const chapterUuid = String(props.chapter?.uuid || "");
  isMeasuring.value = true;
  const previousProgress =
    totalPages.value > 1 ? (currentPage.value - 1) / (totalPages.value - 1) : 0;

  measureViewportLayout(viewport);
  await nextTick();
  await waitForReaderLayout();

  if (isKeyboardPaginationFrozen()) {
    isMeasuring.value = false;
    return;
  }

  if (
    token !== measureToken ||
    chapterUuid !== String(props.chapter?.uuid || "")
  ) {
    return;
  }

  const article = getArticleElement();
  const hasBodyContent = Boolean(
    article?.textContent?.trim() ||
      article?.querySelector("img, video, svg, canvas, table, pre"),
  );
  if (!article || (String(props.content || "").trim() && !hasBodyContent)) {
    isMeasuring.value = false;
    return;
  }

  if (forcePaginationResetPending) {
    const resetReady = await resetPaginationLayout(article, token);
    if (!resetReady || token !== measureToken) {
      forcePaginationResetPending = true;
      return;
    }
    forcePaginationResetPending = false;
  }

  const footnotesReady = await runIgnoringMutations(() =>
    paginatePageFootnotes(article, viewport, token),
  );
  if (!footnotesReady || token !== measureToken) return;

  measuredChapterUuid.value = chapterUuid;

  if (restoredChapterUuid.value !== chapterUuid) {
    restorePage();
  } else {
    currentPage.value = normalizePage(
      Math.round(previousProgress * (totalPages.value - 1)) + 1,
    );
  }

  await nextTick();
  await waitForReaderLayout();
  if (token !== measureToken) return;

  const firstPageHasContent = pageCoords.pageHasVisibleContent(
    article,
    viewport,
    1,
  );
  const currentPageHasContent = pageCoords.pageHasVisibleContent(
    article,
    viewport,
    currentPage.value,
  );
  if (!firstPageHasContent || !currentPageHasContent) {
    if (emptyPageRecoveryPasses < MAX_EMPTY_PAGE_RECOVERY_PASSES) {
      emptyPageRecoveryPasses += 1;
      hasMeasured.value = false;
      rollbackIncompleteFootnoteLayout(article);
      forcePaginationResetPending = true;
      requestMeasureRerun();
      return;
    }

    if (!currentPageHasContent) {
      currentPage.value = pageCoords.findNearestContentPage(
        article,
        viewport,
        currentPage.value,
      );
    }
  }

  emptyPageRecoveryPasses = 0;
  hasMeasured.value = true;
  isMeasuring.value = false;
  emitProgress();
  void revealMeasuredChapter();
};

const {
  cancelPending: cancelPendingMeasure,
  requestRerun: requestMeasureRerun,
  scheduleDelayedMeasure,
  scheduleFreshMeasure,
  scheduleMeasure,
  scheduleViewportMeasure,
} = usePaginationScheduler({
  measure: measurePages,
  isFrozen: () => isKeyboardPaginationFrozen(),
  onInvalidate: () => {
    measureToken += 1;
  },
  viewportDelay: VIEWPORT_SETTLE_DELAY,
});

const { isFrozen: isKeyboardPaginationFrozen, isKeyboardInput } =
  usePaginationKeyboardFreeze({
    settleDelay: VIEWPORT_SETTLE_DELAY,
    minimumHeightDelta: KEYBOARD_MIN_HEIGHT_DELTA,
    onFreeze: () => {
      cancelPendingMeasure({ invalidate: true });
      isMeasuring.value = false;
    },
    onRelease: scheduleViewportMeasure,
    onViewportChange: scheduleViewportMeasure,
  });

const { runIgnoringMutations } = usePaginationObservers({
  viewportRef,
  sectionRef,
  getArticleElement,
  scheduleMeasure,
  scheduleViewportMeasure,
});

onBeforeUnmount(() => restoreMobileTables(getArticleElement()));

const emitProgress = () => {
  emit("progress", pageProgress.value);
};

const triggerReaderHint = () => {
  setState("MOBILE_PAGE_HINT_SEEN", true);
  showReaderHint();
};

const setReaderControlsOpen = (open) => {
  const nextOpen = Boolean(open);
  if (!nextOpen && isKeyboardInput(document.activeElement)) {
    document.activeElement?.blur();
  }
  emit("controls-open-change", nextOpen);
};

const goToPage = (page) => {
  const target = normalizePage(page);
  if (target === currentPage.value) return;
  currentPage.value = target;
  emitProgress();
  persistPosition();
};

const turnChapter = (direction) => {
  const normalizedDirection = direction < 0 ? -1 : 1;
  const canNavigate =
    normalizedDirection < 0 ? hasPrevious.value : hasNext.value;
  if (
    !paginationReady.value ||
    chapterNavigationPending.value ||
    !canNavigate
  ) {
    return;
  }

  beginChapterNavigation(normalizedDirection);

  const navigation =
    normalizedDirection < 0 ? handlePrev({ lastPage: true }) : handleNext();
  Promise.resolve(navigation).catch(cancelChapterNavigation);
};

const turnPage = (direction) => {
  if (showChapterLoadingOverlay.value) return;

  dismissReaderHint();
  if (!paginationReady.value) {
    scheduleMeasure();
    return;
  }

  const target = currentPage.value + direction;
  if (target < 1) {
    turnChapter(-1);
    return;
  }

  if (target > totalPages.value) {
    turnChapter(1);
    return;
  }

  goToPage(target);
};

const {
  getSelectionContext,
  handleContextMenu,
  handlePointerCancel: handleTextPointerCancel,
  handlePointerDown: handleTextPointerDown,
  handlePointerMove: handleTextPointerMove,
  handlePointerUp: handleTextPointerUp,
  isInteractiveEvent: isInteractiveTarget,
} = useReaderTextContext({ getRoot: getArticleElement, emit });

const handleViewportClick = (event) => {
  if (!(event.target instanceof Element)) return;
  if (event.target.closest(".footnote-ref a[href^='#fn']")) {
    event.preventDefault();
  }
};

const {
  handlePointerDown: handlePagedPointerDown,
  handlePointerMove: handlePagedPointerMove,
  handlePointerUp: handlePagedPointerUp,
  resetPointer: resetPagedPointer,
} = usePagedReaderInput({
  viewportRef,
  tapZones: toRef(props, "tapZones"),
  wheelEnabled: toRef(props, "wheelPagination"),
  turnPage,
  emitAction: (action) => emit("reader-action", action),
  isBlocked: showChapterLoadingOverlay,
  isKeyboardInput,
  isInteractiveEvent: isInteractiveTarget,
  getSelectionContext,
  swipeDistance: SWIPE_DISTANCE,
});

const handlePointerDown = (event) => {
  handleTextPointerDown(event);
  handlePagedPointerDown(event);
};
const handlePointerMove = (event) => {
  handleTextPointerMove(event);
  handlePagedPointerMove(event);
};
const handlePointerUp = (event) => {
  handleTextPointerUp(event);
  handlePagedPointerUp(event);
};
const resetPointer = () => {
  handleTextPointerCancel();
  resetPagedPointer();
};

watch(
  () => [route.params.volumeSlug, route.params.chapterSlug],
  ([volumeSlug, chapterSlug], [previousVolumeSlug, previousChapterSlug]) => {
    const hadPreviousRoute = Boolean(previousVolumeSlug || previousChapterSlug);
    const routeChanged =
      volumeSlug !== previousVolumeSlug || chapterSlug !== previousChapterSlug;
    if (!hadPreviousRoute || !routeChanged) return;

    if (!chapterNavigationPending.value) {
      beginChapterNavigation(0);
    } else {
      chapterLoadingOverlayVisible.value = true;
    }
  },
  { flush: "sync" },
);

watch(
  () => props.chapter?.uuid,
  (chapterUuid, previousChapterUuid) => {
    if (
      chapterUuid &&
      previousChapterUuid &&
      chapterUuid !== previousChapterUuid
    ) {
      captureChapterSnapshot();
    }
  },
  { flush: "sync" },
);

watch(
  () => [props.chapter?.uuid, props.content, props.isLoading],
  ([chapterUuid], [previousChapterUuid]) => {
    if (chapterUuid !== previousChapterUuid) {
      setReaderControlsOpen(false);
      measuredChapterUuid.value = "";
      resetRestoredChapter();
      clearFootnotes();
      hasMeasured.value = false;
      leadingEmptyPages.value = 0;
      emptyPageRecoveryPasses = 0;
      forcePaginationResetPending = true;
    }
    scheduleFreshMeasure();
  },
  { flush: "post" },
);

watch(
  () => [
    props.styleConfigs.fontStyle,
    props.styleConfigs.fontSize,
    props.styleConfigs.fontGap,
    props.styleConfigs.lineHeight,
    props.styleConfigs.paraHeight,
  ],
  () => {
    // 排版控件连续变化时保留最后一个完整页面，直到新布局通过首页与当前页校验。
    if (hasMeasured.value && !props.isLoading) captureChapterSnapshot();
    measureToken += 1;
    scheduleDelayedMeasure(TYPOGRAPHY_SETTLE_DELAY);
  },
  { flush: "sync" },
);

watch(hasMeasured, (ready) => {
  if (!ready || getState("MOBILE_PAGE_HINT_SEEN", false)) return;
  triggerReaderHint();
});

watch(
  [
    currentPage,
    totalPages,
    paginationReady,
    totalReadingProgress,
    pageProgress,
  ],
  ([page, pages, ready, readingProgress, chapterProgress]) => {
    emit("controller-state", {
      currentPage: page,
      totalPages: pages,
      paginationReady: ready,
      readingProgress,
      pageProgress: chapterProgress,
    });
  },
  { immediate: true },
);

defineExpose({ triggerReaderHint, goToPage, turnChapter, turnPage });
</script>

<style scoped src="@/assets/reader/mobile/pagination.css"></style>
