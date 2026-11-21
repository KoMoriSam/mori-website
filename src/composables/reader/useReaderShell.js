import { computed, defineAsyncComponent, ref, toValue, watch } from "vue";
import { storeToRefs } from "pinia";
import { useRoute, useRouter } from "vue-router";

import { useContentReadTracking } from "@/composables/reader/useContentReadTracking";
import { useReaderTextContext } from "@/composables/reader/useReaderTextContext";
import { useScrollTo } from "@/composables/useScrollTo";
import { useLocale } from "@/i18n";
import { useCommentCountsStore } from "@/stores/comment-counts";

export const ReaderContextMenu = defineAsyncComponent(
  () => import("@/components/reader/interaction/ContextMenu.vue"),
);

export function buildReaderShareMeta({
  sourceLabel = "",
  title = "",
  publicationInfo = "",
  contentInfo = "",
  engagementItems = [],
  extraExcludes = [],
  path = "",
  detailLineLimit = 3,
} = {}) {
  const filteredEngagement = engagementItems.filter(Boolean);
  const engagementInfo = filteredEngagement.join(" · ");
  const detailLines = [publicationInfo, contentInfo, engagementInfo].filter(
    Boolean,
  );

  return {
    sourceLabel,
    title,
    detail: detailLines.join(" · "),
    detailLines,
    detailLineLimit,
    excludeFromContent: [
      ...extraExcludes,
      publicationInfo,
      contentInfo,
      ...filteredEngagement,
      engagementInfo,
    ].filter(Boolean),
    path,
  };
}

export function useReaderContextMenu({ getRoot, enabled, onSearch } = {}) {
  const route = useRoute();
  const router = useRouter();

  const contextMenuMounted = ref(false);
  const contextMenuOpen = ref(false);
  const textContext = ref({});
  const isEnabled = () => (enabled === undefined ? true : Boolean(toValue(enabled)));

  const openContextMenu = (context) => {
    if (!context) {
      contextMenuOpen.value = false;
      textContext.value = {};
      return;
    }

    contextMenuMounted.value = true;
    textContext.value = context;
    contextMenuOpen.value = true;
  };

  const rawHandlers = useReaderTextContext({
    getRoot: () => (isEnabled() ? getRoot() : null),
    emit: (_eventName, context) =>
      openContextMenu(isEnabled() ? context : null),
  });

  const handleContextMenu = (event) => {
    if (isEnabled()) rawHandlers.handleContextMenu(event);
  };
  const handlePointerDown = (event) => {
    if (isEnabled()) rawHandlers.handlePointerDown(event);
  };
  const handlePointerMove = (event) => {
    if (isEnabled()) rawHandlers.handlePointerMove(event);
  };
  const handlePointerUp = (event) => {
    if (isEnabled()) rawHandlers.handlePointerUp(event);
  };
  const handlePointerCancel = () => {
    rawHandlers.handlePointerCancel();
  };

  const openContextSearch = (keyword) => {
    if (onSearch?.(keyword) === true) return;

    void router.replace({
      query: {
        ...route.query,
        search: "1",
        q: String(keyword || "").trim() || undefined,
      },
    });
  };

  return {
    contextMenuMounted,
    contextMenuOpen,
    textContext,
    openContextMenu,
    openContextSearch,
    handleContextMenu,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
  };
}

export function useReaderShell({
  readerRef,
  contentType,
  contentId,
  discussionTerm,
  ready,
  loading,
  contextEnabled,
  onContextSearch,
  refreshLabelKey,
  onRefresh,
  backKey = "back",
  backLabelKey,
  onBack,
}) {
  const { t: translate, number: formatNumber } = useLocale();
  const { scrollRef, scrollToTop, scrollToBottom } = useScrollTo();

  const contextMenu = useReaderContextMenu({
    getRoot: () => scrollRef.value,
    enabled: contextEnabled,
    onSearch: onContextSearch,
  });

  const commentCountsStore = useCommentCountsStore();
  const { commentCountsAvailable } = storeToRefs(commentCountsStore);
  const contentComments = computed(() =>
    commentCountsStore.getContentCommentTotal(contentType, toValue(contentId)),
  );
  const contentCommentStatus = computed(() =>
    commentCountsStore.getContentCommentStatus(contentType, toValue(contentId)),
  );

  const {
    analyticsAvailable,
    contentReads,
    contentReadStatus,
  } = useContentReadTracking({
    contentType,
    contentId,
    ready,
  });

  watch(
    () => [toValue(contentId), toValue(discussionTerm ?? contentId)],
    ([id, term]) => {
      if (!id || !term) return;
      void commentCountsStore.loadContentCommentTotals(contentType, [
        { contentId: id, discussionTerm: term },
      ]);
    },
    { immediate: true },
  );

  const formatCount = (value) => formatNumber(Number(value));

  const engagementItems = computed(() =>
    [
      analyticsAvailable.value && Number.isFinite(contentReads.value)
        ? translate(
            "common.counts.reads",
            { count: formatCount(contentReads.value) },
            contentReads.value,
          )
        : "",
      commentCountsAvailable.value && Number.isFinite(contentComments.value)
        ? translate(
            "common.counts.comments",
            { count: formatCount(contentComments.value) },
            contentComments.value,
          )
        : "",
    ].filter(Boolean),
  );

  const fabActions = computed(() => [
    {
      key: "bottom",
      get label() {
        return translate("blog.article.toBottom");
      },
      icon: "ri-skip-down-line",
      buttonClass: "btn-info btn-soft",
      onClick: () => scrollToBottom(),
    },
    {
      key: "top",
      get label() {
        return translate("blog.article.toTop");
      },
      icon: "ri-skip-up-line",
      buttonClass: "btn-info btn-soft",
      onClick: () => scrollToTop(),
    },
    {
      key: "settings",
      get label() {
        return translate("reader.format.title");
      },
      icon: "ri-settings-3-line",
      buttonClass: "btn-primary btn-soft",
      onClick: () => readerRef.value?.openFormatSetting(),
    },
    {
      key: "refresh",
      get label() {
        return translate(refreshLabelKey);
      },
      icon: toValue(loading)
        ? "ri-loader-4-line animate-spin"
        : "ri-refresh-line",
      buttonClass: "btn-success btn-soft",
      onClick: onRefresh,
    },
    {
      key: backKey,
      get label() {
        return translate(backLabelKey);
      },
      icon: "ri-arrow-go-back-line",
      buttonClass: "btn-secondary btn-soft",
      onClick: onBack,
    },
  ]);

  return {
    scrollRef,
    scrollToTop,
    scrollToBottom,
    ...contextMenu,
    analyticsAvailable,
    contentReads,
    contentReadStatus,
    commentCountsAvailable,
    contentComments,
    contentCommentStatus,
    formatCount,
    engagementItems,
    fabActions,
  };
}
