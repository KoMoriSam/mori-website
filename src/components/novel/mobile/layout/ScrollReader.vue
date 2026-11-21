<template>
  <section
    ref="scrollContainerRef"
    class="scroll-reader absolute inset-x-0 top-0 bottom-6 touch-pan-y overflow-x-hidden overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]"
    :aria-label="translate('reader.scroll.label')"
    :aria-busy="showChapterLoadingOverlay"
    @pointerdown.capture="handleTextPointerDown"
    @pointermove.capture="handleTextPointerMove"
    @pointerup.capture="handleTextPointerUp"
    @pointercancel.capture="handleTextPointerCancel"
    @scroll.passive="handleScroll"
    @click="handleTapClick"
    @contextmenu.capture.prevent="handleContextMenu"
    @wheel.passive="markReadingInteraction"
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
      class="scroll-reader-article"
      @render-ready="handleMarkdownRenderReady"
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
    </Renderer>

    <ChapterToc
      mobile
      progress-only
      viewport-pagination
      :page-progress="chapterScrollProgress"
      @progress-change="totalReadingProgress = $event"
    />

    <MobileReaderHint
      :visible="showNavigationHint"
      mode="scroll"
      @dismiss="dismissReaderHint"
    />
  </section>
</template>

<script setup>
import { useLocale } from "@/i18n";
const { t: translate } = useLocale();

import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useRoute } from "vue-router";

import ChapterHeader from "@/components/novel/ChapterHeader.vue";
import ChapterToc from "@/components/novel/ChapterToc.vue";
import MobileReaderHint from "@/components/novel/mobile/display/MobileReaderHint.vue";
import Renderer from "@/components/markdown/Renderer.vue";
import { useChapters } from "@/composables/novel/useChapters";
import { useReadingStateStorage } from "@/composables/storage/useReadingStateStorage";
import { readerTypographyMetrics } from "@/utils/reader/reader-typography";
import { alignMobileChapterHeaderBlock } from "@/utils/reader/align-header";
import { decodeAnchor, waitForReaderLayout } from "@/utils/reader/dom";
import { useReaderHint } from "@/composables/novel/useReaderHint";
import { useReaderTextContext } from "@/composables/reader/useReaderTextContext";

const props = defineProps({
  content: {
    type: String,
    default: "",
  },
  chapter: {
    type: Object,
    default: null,
  },
  chapterStats: {
    type: Array,
    default: () => [],
  },
  headerData: {
    type: Object,
    required: true,
  },
  styleConfigs: {
    type: Object,
    required: true,
  },
  isLoading: {
    type: Boolean,
    default: false,
  },
  controlsOpen: {
    type: Boolean,
    default: false,
  },
  restoreChapterStart: {
    type: Boolean,
    default: false,
  },
  tapZones: { type: Array, default: () => [] },
});

const emit = defineEmits([
  "controller-state",
  "reader-action",
  "text-context",
  "chapter-start-restored",
  "open-comments",
  "loading-overlay-change",
]);
const route = useRoute();
const { getState, setState } = useReadingStateStorage();
const { handlePrev, handleNext } = useChapters();

const scrollContainerRef = ref(null);
const chapterScrollProgress = ref(0);
const totalReadingProgress = ref(0);
const currentViewportPage = ref(1);
const totalViewportPages = ref(1);
const {
  visible: showNavigationHint,
  show: triggerReaderHint,
  dismiss: dismissReaderHint,
} = useReaderHint();
const renderedChapterUuid = ref("");
const showChapterLoadingOverlay = computed(
  () =>
    props.isLoading ||
    renderedChapterUuid.value !== String(props.chapter?.uuid || ""),
);
watch(
  showChapterLoadingOverlay,
  (visible) => emit("loading-overlay-change", visible),
  { immediate: true },
);

let scrollFrame = 0;
let persistTimer = 0;
let restoreToken = 0;
let restoreOnRender = true;
let restoredChapterUuid = "";
let lastScrollAt = 0;

const updateScrollProgress = () => {
  const container = scrollContainerRef.value;
  if (!container) return;

  const scrollRange = Math.max(
    0,
    container.scrollHeight - container.clientHeight,
  );
  chapterScrollProgress.value =
    scrollRange > 0
      ? Math.min(100, Math.max(0, (container.scrollTop / scrollRange) * 100))
      : 100;
  totalViewportPages.value = Math.max(
    1,
    Math.ceil(container.scrollHeight / Math.max(1, container.clientHeight)),
  );
  currentViewportPage.value = Math.min(
    totalViewportPages.value,
    Math.max(
      1,
      Math.floor(container.scrollTop / Math.max(1, container.clientHeight)) + 1,
    ),
  );
};

const findReadingAnchor = () => {
  const container = scrollContainerRef.value;
  if (!container) return null;

  const containerTop = container.getBoundingClientRect().top;
  const anchors = container.querySelectorAll(
    ".markdown-reading :is(h1, h2, h3, h4, h5, h6, p)[id]",
  );
  let current = null;

  anchors.forEach((anchor) => {
    if (anchor.getBoundingClientRect().top <= containerTop + 64) {
      current = anchor;
    }
  });

  return current || anchors[0] || null;
};

const persistCurrentPosition = () => {
  const container = scrollContainerRef.value;
  if (container && container.scrollTop <= 1) {
    setState("READ_POS", "");
    return;
  }

  const anchor = findReadingAnchor();
  if (anchor?.id) setState("READ_POS", anchor.id);
};

const persistPosition = () => {
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(persistCurrentPosition, 240);
};

const handleScroll = () => {
  lastScrollAt = performance.now();
  markReadingInteraction();
  if (!scrollFrame) {
    scrollFrame = window.requestAnimationFrame(() => {
      scrollFrame = 0;
      updateScrollProgress();
    });
  }
  persistPosition();
};

const alignChapterHeaderBlock = async () => {
  const article = getArticleElement();
  return alignMobileChapterHeaderBlock({
    article,
    lineHeight: readerTypographyMetrics(props.styleConfigs).linePixels,
    waitForLayout: waitForReaderLayout,
  });
};

const findAnchorInContainer = (container, anchorId) => {
  if (!container || !anchorId) return null;

  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return container.querySelector(`#${CSS.escape(anchorId)}`);
  }

  return (
    Array.from(container.querySelectorAll("[id]")).find(
      (element) => element.id === anchorId,
    ) || null
  );
};

const clampScrollTop = (container, value = container?.scrollTop || 0) => {
  if (!container) return;
  const maxScrollTop = Math.max(
    0,
    container.scrollHeight - container.clientHeight,
  );
  container.scrollTop = Math.min(maxScrollTop, Math.max(0, value));
};

const restorePosition = async () => {
  if (props.isLoading) return;

  const token = ++restoreToken;

  await nextTick();
  await waitForReaderLayout();

  const container = scrollContainerRef.value;
  if (!container || token !== restoreToken) return;

  await alignChapterHeaderBlock();
  if (token !== restoreToken || container !== scrollContainerRef.value) return;

  const restoreChapterStart = props.restoreChapterStart;
  const anchorId = restoreChapterStart
    ? ""
    : decodeAnchor(route.hash) || String(getState("READ_POS", "") || "").trim();
  const target = findAnchorInContainer(container, anchorId);

  if (target) {
    const containerTop = container.getBoundingClientRect().top;
    const targetTop = target.getBoundingClientRect().top;
    clampScrollTop(container, container.scrollTop + targetTop - containerTop);
  } else {
    container.scrollTop = 0;
  }

  await waitForReaderLayout();
  if (token !== restoreToken || container !== scrollContainerRef.value) return;
  clampScrollTop(container);
  updateScrollProgress();
  if (restoreChapterStart) emit("chapter-start-restored");
};

const markReadingInteraction = () => {
  restoreOnRender = false;
};

const handleMarkdownRenderReady = async () => {
  const container = scrollContainerRef.value;
  if (!container || props.isLoading) return;

  const chapterUuid = String(props.chapter?.uuid || "");
  if (restoreOnRender && chapterUuid !== restoredChapterUuid) {
    restoredChapterUuid = chapterUuid;
    restoreOnRender = false;
    await restorePosition();
    if (chapterUuid === String(props.chapter?.uuid || "") && !props.isLoading) {
      renderedChapterUuid.value = chapterUuid;
    }
    return;
  }

  clampScrollTop(container);
  updateScrollProgress();
  renderedChapterUuid.value = chapterUuid;
};

const turnChapter = (direction) => {
  if (props.isLoading) return;
  if (direction < 0) {
    void handlePrev();
    return;
  }
  void handleNext();
};

const getArticleElement = () =>
  scrollContainerRef.value?.querySelector(":scope > .markdown-reading");
const {
  getSelectionContext,
  handleContextMenu: handleContextMenu,
  handlePointerCancel: handleTextPointerCancel,
  handlePointerDown: handleTextPointerDown,
  handlePointerMove: handleTextPointerMove,
  handlePointerUp: handleTextPointerUp,
  isInteractiveEvent: isInteractiveTarget,
} = useReaderTextContext({ getRoot: getArticleElement, emit });

const handleTapClick = (event) => {
  markReadingInteraction();
  if (
    event.button !== 0 ||
    isInteractiveTarget(event) ||
    performance.now() - lastScrollAt < 180 ||
    getSelectionContext()
  ) {
    return;
  }

  const container = scrollContainerRef.value;
  const rect = container?.getBoundingClientRect();
  if (!rect?.width || !rect.height) return;
  const x = Math.min(
    0.999,
    Math.max(0, (event.clientX - rect.left) / rect.width),
  );
  const y = Math.min(
    0.999,
    Math.max(0, (event.clientY - rect.top) / rect.height),
  );
  const action =
    props.tapZones[Math.floor(y * 3) * 3 + Math.floor(x * 3)] || "none";
  if (action !== "none") emit("reader-action", action);
};

const turnPage = (direction) => {
  const container = scrollContainerRef.value;
  if (!container || props.isLoading) return;

  const maxScrollTop = Math.max(
    0,
    container.scrollHeight - container.clientHeight,
  );
  const atTop = container.scrollTop <= 0;
  const atBottom = maxScrollTop > 0 && container.scrollTop >= maxScrollTop - 1;

  // 到达滚动边界时切换章节；否则在当前章内滚动。
  if (direction < 0 && atTop) {
    void handlePrev();
    return;
  }
  if (direction > 0 && atBottom) {
    void handleNext();
    return;
  }

  container.scrollBy({
    top: direction * container.clientHeight * 0.9,
    behavior: "smooth",
  });
};

watch(
  () => props.chapter?.uuid,
  (chapterUuid, previousChapterUuid) => {
    if (!chapterUuid || chapterUuid === previousChapterUuid) return;
    restoreOnRender = true;
    restoredChapterUuid = "";
    renderedChapterUuid.value = "";
  },
  { flush: "sync" },
);

watch(
  () => props.isLoading,
  (loading, wasLoading) => {
    if (loading) renderedChapterUuid.value = "";
    if (!loading && wasLoading) restoreOnRender = true;
  },
  { flush: "sync" },
);

watch(
  [
    showChapterLoadingOverlay,
    totalReadingProgress,
    chapterScrollProgress,
    currentViewportPage,
    totalViewportPages,
  ],
  ([loading, readingProgress, pageProgress, currentPage, totalPages]) => {
    emit("controller-state", {
      currentPage,
      totalPages,
      paginationReady: !loading,
      readingProgress,
      pageProgress,
    });
  },
  { immediate: true },
);

defineExpose({
  triggerReaderHint,
  turnChapter,
  turnPage,
  goToPage: (progress) => {
    const container = scrollContainerRef.value;
    if (!container) return;
    const range = Math.max(0, container.scrollHeight - container.clientHeight);
    container.scrollTop =
      (range * Math.min(100, Math.max(0, Number(progress) || 0))) / 100;
  },
});

onBeforeUnmount(() => {
  restoreToken += 1;
  window.cancelAnimationFrame(scrollFrame);
  window.clearTimeout(persistTimer);
  persistCurrentPosition();
});
</script>

<style scoped src="@/assets/reader/mobile/scroll.css"></style>
