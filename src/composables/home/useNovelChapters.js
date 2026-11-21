import { onMounted } from "vue";
import { storeToRefs } from "pinia";
import { useRoute } from "vue-router";
import { useNovelStore } from "@/stores/novel";

export function useNovelChapters() {
  const novelStore = useNovelStore();
  const route = useRoute();
  const { visibleChapters: chapters, isLoadingList: loading } =
    storeToRefs(novelStore);
  if (route.meta.pageData?.novelChapters) {
    novelStore.hydrateChapters(route.meta.pageData.novelChapters);
  }

  const refresh = ({ force = true } = {}) =>
    novelStore.setChapters({ force, silent: true });

  onMounted(() => {
    void refresh({ force: false });
  });

  return { chapters, loading, refresh };
}
