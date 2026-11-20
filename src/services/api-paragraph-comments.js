import { fetchGithubDiscussionCounts, hasGithubDiscussionCountsApi } from "./api-github.js";

const TIMEOUT = 8000;
export const hasParagraphCountsApi = hasGithubDiscussionCountsApi;

async function fetchCountsBatch({ body, identifiers = [] }) {
  if (!hasParagraphCountsApi) {
    return null;
  }

  const ids = [...new Set((identifiers || []).filter(Boolean))];
  if (!ids.length) {
    return {};
  }

  const payload = await fetchGithubDiscussionCounts(body(ids), {
    timeout: TIMEOUT,
    errorMessage: "评论批量接口请求失败",
  });
  const counts = payload?.counts;

  if (!counts || typeof counts !== "object") {
    return {};
  }

  return Object.fromEntries(
    ids.map((id) => {
      const count = Number(Object.hasOwn(counts, id) ? counts[id] : 0);
      return [id, Number.isFinite(count) ? Math.max(0, count) : 0];
    }),
  );
}

export function fetchParagraphCountsBatch({
  sourceType = "article",
  paragraphIds = [],
}) {
  return fetchCountsBatch({
    identifiers: paragraphIds,
    body: (ids) => ({ sourceType, paragraphIds: ids }),
  });
}

export function fetchDiscussionCountsBatch({
  sourceType = "novel",
  scope = sourceType === "novel" ? "chapter" : "content",
  discussionTerms = [],
}) {
  return fetchCountsBatch({
    identifiers: discussionTerms,
    body: (terms) => ({
      sourceType,
      scope,
      discussionTerms: terms,
    }),
  });
}

export function fetchContentCommentTotalsBatch({
  sourceType = "article",
  contents = [],
}) {
  return fetchCountsBatch({
    identifiers: contents.map(({ contentId }) => contentId),
    body: () => ({
      sourceType,
      scope: "content-total",
      contents,
    }),
  });
}
