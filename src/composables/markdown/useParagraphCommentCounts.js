import { computed, nextTick, ref, watch } from "vue";
import {
  fetchDiscussionCountsBatch,
  fetchParagraphCountsBatch,
  hasParagraphCountsApi,
} from "@/services/api-paragraph-comments";

export function useParagraphCommentCounts({
  articleRef,
  headerData,
  isLoading,
  markdownPreparing,
  combinedContent,
  enabled,
  fetchEnabled,
}) {
  const latestBatchToken = ref(0);
  const headerParagraphId = computed(() => {
    const uuid = String(headerData.value?.uuid || "").trim();
    return uuid ? `${uuid}-0` : "";
  });

  const collectPrefetchParagraphIds = () => {
    if (!articleRef.value) return [];

    const commentableNodes = articleRef.value.querySelectorAll(
      "[data-reader-paragraph-id]:not([data-reader-comment-scope='chapter'])",
    );
    const paragraphIds = Array.from(commentableNodes)
      .map(
        (node) => node.dataset.readerParagraphId || node.getAttribute("id") || "",
      )
      .filter(Boolean);

    if (
      headerParagraphId.value &&
      headerData.value?.commentScope !== "chapter" &&
      document.getElementById(headerParagraphId.value)
    ) {
      paragraphIds.unshift(headerParagraphId.value);
    }

    return [...new Set(paragraphIds)];
  };

  const emitBatchCounts = (paragraphIds, counts) => {
    paragraphIds.forEach((paragraphId) => {
      const totalCommentCount = Number(counts?.[paragraphId] ?? 0);

      document.dispatchEvent(
        new CustomEvent("paragraph-comment-metadata", {
          detail: {
            paragraphId,
            sourceType: headerData.value.sourceType,
            totalCommentCount: Number.isFinite(totalCommentCount)
              ? Math.max(0, totalCommentCount)
              : 0,
          },
        }),
      );
    });
  };

  const loadBatchCounts = async (paragraphIds, token) => {
    if (!hasParagraphCountsApi || !paragraphIds.length) {
      return false;
    }

    try {
      const counts = await fetchParagraphCountsBatch({
        sourceType: headerData.value.sourceType,
        paragraphIds,
      });

      if (token !== latestBatchToken.value || !counts) {
        return false;
      }

      emitBatchCounts(paragraphIds, counts);
      return true;
    } catch (error) {
      console.error("段评批量查询失败（未回退元数据模式）", error);
      return false;
    }
  };

  const loadHeaderDiscussionCount = async (token) => {
    const paragraphId = headerParagraphId.value;
    const discussionTerm = String(headerData.value?.commentTerm || "").trim();
    if (
      !hasParagraphCountsApi ||
      headerData.value?.commentScope !== "chapter" ||
      !paragraphId ||
      !discussionTerm
    ) {
      return false;
    }

    try {
      const counts = await fetchDiscussionCountsBatch({
        sourceType: headerData.value.sourceType,
        discussionTerms: [discussionTerm],
      });

      if (token !== latestBatchToken.value || !counts) return false;

      emitBatchCounts([paragraphId], {
        [paragraphId]: counts[discussionTerm] ?? 0,
      });
      return true;
    } catch (error) {
      console.error("本章说评论数量查询失败", error);
      return false;
    }
  };

  watch(
    () => [
      isLoading.value,
      markdownPreparing.value,
      combinedContent.value,
      headerData.value.uuid,
      headerData.value.sourceType,
      headerData.value.commentScope,
      headerData.value.commentTerm,
      enabled.value,
      fetchEnabled.value,
    ],
    async ([loading, preparing]) => {
      if (import.meta.env.SSR) return;

      if (!enabled.value || !fetchEnabled.value) {
        latestBatchToken.value += 1;
        return;
      }

      if (loading || preparing) return;

      if (!hasParagraphCountsApi) {
        console.warn("未配置 VITE_COMMENT_COUNTS_API，已禁用段评批量查询");
        return;
      }

      const token = latestBatchToken.value + 1;
      latestBatchToken.value = token;

      await nextTick();
      window.requestAnimationFrame(async () => {
        const paragraphIds = collectPrefetchParagraphIds();
        await Promise.all([
          loadBatchCounts(paragraphIds, token),
          loadHeaderDiscussionCount(token),
        ]);
      });
    },
    { immediate: true },
  );
}
