import { onBeforeUnmount, onMounted } from "vue";

export const usePaginationObservers = ({
  viewportRef,
  sectionRef,
  getArticleElement,
  scheduleMeasure,
  scheduleViewportMeasure,
}) => {
  let resizeObserver;
  let mutationObserver;
  let suppressDepth = 0;
  let active = true;

  const runIgnoringMutations = async (task) => {
    suppressDepth += 1;
    try {
      return await task();
    } finally {
      mutationObserver?.takeRecords();
      suppressDepth = Math.max(0, suppressDepth - 1);
    }
  };

  onMounted(() => {
    const viewport = viewportRef.value;
    if (!viewport) return;

    resizeObserver = new ResizeObserver(scheduleViewportMeasure);
    resizeObserver.observe(viewport);
    if (sectionRef.value) resizeObserver.observe(sectionRef.value);

    mutationObserver = new MutationObserver((records) => {
      if (suppressDepth > 0) return;
      const article = getArticleElement();
      if (
        article &&
        records.some(
          (record) =>
            record.target === article || article.contains(record.target),
        )
      ) {
        scheduleMeasure();
      }
    });
    mutationObserver.observe(viewport, { childList: true, subtree: true });

    viewport.addEventListener("load", scheduleMeasure, true);
    document.fonts?.ready.then(() => {
      if (active) scheduleMeasure();
    });
    scheduleMeasure();
  });

  onBeforeUnmount(() => {
    active = false;
    resizeObserver?.disconnect();
    mutationObserver?.disconnect();
    viewportRef.value?.removeEventListener("load", scheduleMeasure, true);
  });

  return { runIgnoringMutations };
};
