import { onBeforeUnmount, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useLocale } from "@/i18n";
import { useMoriAuth } from "@/composables/auth/useMoriAuth";
import { formatArticleTag } from "@/utils/blog/article-fields";
import {
  CONTENT_TYPES,
  fetchGlobalSearchIndex,
  fetchNovelSearchCatalog,
} from "@/services/search-content";
import {
  searchPagefindBundle,
  segmentPagefindQuery,
} from "@/services/search-access";
import { loadNovelPagefind } from "@/services/novel-release";
import {
  buildSearchFacets,
  filterLocalSearchEntries,
  normalizePagefindExcerpt,
  parsePagefindMetadata,
  sameList,
  sortSiteSearchResults,
} from "@/utils/site-search";

export function useSiteSearchEngine({
  isOpen,
  keyword,
  selectedTypes,
  selectedTags,
  selectedYears,
  hasSearchCriteria,
}) {
  const {
    t: translate,
    text: localizeText,
    message: localeMessage,
    locale: uiLocale,
  } = useLocale();
  const auth = useMoriAuth();
  const router = useRouter();

  const isLoading = ref(false);
  const errorMessage = ref("");
  const availableTypes = ref(
    CONTENT_TYPES.map((type) => ({ ...type, count: 0 })),
  );
  const availableTags = ref([]);
  const availableYears = ref([]);
  const availableTagGroupCounts = ref(new Map());
  const results = ref([]);
  const activeIndex = ref(-1);

  let searchEntries = [];
  let pagefindEngine = null;
  let novelPagefindEngine = null;
  let initializationId = 0;
  let engineType = "";
  let searchTimer;
  let searchRequestId = 0;

  const getTypeLabel = (type) =>
    localizeText(CONTENT_TYPES.find((option) => option.value === type)?.label) ||
    String(type || "");

  const getAvailableTag = (value) =>
    availableTags.value.find((tag) => tag.value === value);

  const serializeSelectedTags = () => [
    ...new Set(
      selectedTags.value
        .map((value) => {
          const tag = getAvailableTag(value);
          return tag?.rawValue || String(value).replace(/^[^:]+:/, "");
        })
        .filter(Boolean),
    ),
  ];

  const getSelectedTagLabel = (value) => {
    const tag = getAvailableTag(value);
    if (!tag) return formatArticleTag(String(value).replace(/^[^:]+:/, ""));

    const shouldShowType =
      selectedTypes.value.length !== 1 ||
      selectedTypes.value[0] !== tag.contentType;

    return shouldShowType
      ? `${getTypeLabel(tag.contentType)} · ${tag.label}`
      : tag.label;
  };

  const reconcileSelectedTags = () => {
    if (!availableTags.value.length || !selectedTags.value.length) return;

    const validTags = new Set(availableTags.value.map((tag) => tag.value));
    const selectedTypeSet = new Set(selectedTypes.value);
    const nextTags = selectedTags.value
      .flatMap((value) => {
        if (validTags.has(value)) return [value];

        const candidates = availableTags.value.filter(
          (tag) =>
            tag.rawValue === value &&
            (selectedTypeSet.size === 0 || selectedTypeSet.has(tag.contentType)),
        );

        if (candidates.length === 1) return [candidates[0].value];
        if (selectedTypeSet.size > 0) {
          return candidates.map((candidate) => candidate.value);
        }
        return [];
      })
      .filter(Boolean);
    const uniqueTags = [...new Set(nextTags)];

    if (!sameList(selectedTags.value, uniqueTags)) {
      selectedTags.value = uniqueTags;
    }
  };

  const loadPagefindEngine = async () => {
    if (import.meta.env.SSR) return null;

    const baseUrl = String(import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");
    const module = await import(
      /* @vite-ignore */ `${baseUrl}pagefind/pagefind.js?isolation=2`
    );

    const engine = module.createInstance({
      basePath: `${baseUrl}pagefind/`,
      excerptLength: 42,
      language: uiLocale.value === "zh-CN" ? "zh" : uiLocale.value,
    });
    try {
      await engine.init();
      return engine;
    } catch (error) {
      await engine.destroy();
      throw error;
    }
  };

  const mapPagefindResult = async (result) => {
    const data = await result.data();
    const meta = data?.meta || {};
    const type = String(meta.type || data?.filters?.type?.[0] || "blog");
    const typeDefinition =
      CONTENT_TYPES.find((definition) => definition.value === type) ||
      CONTENT_TYPES[0];
    const catalogOrder = Number(meta.catalogOrder);

    const excerpt = normalizePagefindExcerpt(data?.plain_excerpt);
    const summary = /[\p{Script=Han}]/u.test(keyword.value)
      ? String(meta.summary || excerpt)
      : excerpt || String(meta.summary || "");

    return {
      url: String(data?.url || result.url || "/"),
      title: String(meta.title || translate("common.search.untitled")),
      summary,
      content: excerpt,
      tags: parsePagefindMetadata(meta.tags),
      filterTags: [],
      metadata: parsePagefindMetadata(meta.metadata),
      metadataText: "",
      date: String(meta.date || ""),
      year: String(meta.year || ""),
      catalogOrder: Number.isFinite(catalogOrder) ? catalogOrder : 0,
      type,
      typeLabel: String(meta.typeLabel || typeDefinition.label),
      typeIcon: String(meta.typeIcon || typeDefinition.icon),
      pagefindScore: Number.isFinite(result.score) ? result.score : 0,
    };
  };

  const searchIndex = () =>
    filterLocalSearchEntries(searchEntries, {
      selectedTypes: selectedTypes.value,
      selectedTags: selectedTags.value,
      selectedYears: selectedYears.value,
      keyword: keyword.value,
      canReadNovel: auth.state.canReadNovel,
    });

  const searchPagefindIndex = async () => {
    const query = keyword.value.trim();

    // 没有关键词时只是浏览筛选结果，不需要启动全文检索。
    if (!query) return searchIndex();

    const filters = {};
    if (selectedTypes.value.length) filters.type = [...selectedTypes.value];
    if (selectedTags.value.length) filters.tag = [...selectedTags.value];
    if (selectedYears.value.length) filters.year = [...selectedYears.value];

    const segmentedQuery = segmentPagefindQuery(query);
    const revision = auth.state.revision;
    const canReadNovel = () =>
      auth.state.canReadNovel && auth.state.revision === revision;
    const selected = selectedTypes.value;
    const searchPublic =
      !selected.length || selected.some((type) => type !== "novel");
    const searchNovel =
      canReadNovel() && (!selected.length || selected.includes("novel"));
    const responses = await Promise.all([
      searchPublic
        ? searchPagefindBundle(pagefindEngine, segmentedQuery, filters)
        : [],
      searchNovel
        ? searchPagefindBundle(
            novelPagefindEngine,
            segmentedQuery,
            filters,
            canReadNovel,
          )
        : [],
    ]);
    const mappedResults = await Promise.all(
      responses.flat().map(mapPagefindResult),
    );
    // 某一个 bundle 不可用时，仅该内容类型使用本地回退。
    const local = searchIndex().filter((entry) =>
      entry.type === "novel"
        ? searchNovel && !novelPagefindEngine
        : searchPublic &&
          (!pagefindEngine ||
            (uiLocale.value !== "zh-CN" &&
              (entry.type !== "blog" || entry.lang !== uiLocale.value))),
    );
    mappedResults.push(...local);
    const seenReaderPages = new Set();
    const seenUrls = new Set();

    return mappedResults.filter((result) => {
      if (result.type === "novel" && !canReadNovel()) return false;
      if (!["blog", "novel"].includes(result.type)) {
        if (seenUrls.has(result.url)) return false;
        seenUrls.add(result.url);
        return true;
      }

      const resolved = router.resolve(result.url || "/");
      const readerKey =
        result.type === "blog"
          ? `blog:${resolved.path.split("/")[2]}`
          : `${result.type}:${resolved.path}`;
      if (seenReaderPages.has(readerKey)) return false;

      seenReaderPages.add(readerKey);
      return true;
    });
  };

  const loadSearchEngine = async () => {
    const id = ++initializationId;
    const revision = auth.state.revision;
    const includeNovel = auth.state.canReadNovel;
    const [
      entriesResult,
      pagefindResult,
      novelEntriesResult,
      novelPagefindResult,
    ] = await Promise.allSettled([
      fetchGlobalSearchIndex(uiLocale.value),
      loadPagefindEngine(),
      includeNovel ? fetchNovelSearchCatalog() : [],
      includeNovel ? loadNovelPagefind() : null,
    ]);
    const novelEntries =
      novelEntriesResult.status === "fulfilled" ? novelEntriesResult.value : [];
    if (
      id !== initializationId ||
      revision !== auth.state.revision ||
      includeNovel !== auth.state.canReadNovel
    ) {
      if (pagefindResult.status === "fulfilled") {
        void pagefindResult.value?.destroy();
      }
      return false;
    }

    searchEntries = (
      entriesResult.status === "fulfilled" ? entriesResult.value : []
    ).concat(novelEntries);
    void pagefindEngine?.destroy();
    pagefindEngine =
      pagefindResult.status === "fulfilled" ? pagefindResult.value : null;

    novelPagefindEngine =
      novelPagefindResult.status === "fulfilled"
        ? novelPagefindResult.value
        : null;
    if (!searchEntries.length && !pagefindEngine && !novelPagefindEngine) {
      throw (
        entriesResult.reason ||
        pagefindResult.reason ||
        new Error(translate("common.search.noIndex"))
      );
    }

    const facets = buildSearchFacets(searchEntries);
    availableTypes.value = facets.availableTypes;
    availableTags.value = facets.availableTags;
    availableYears.value = facets.availableYears;
    availableTagGroupCounts.value = facets.availableTagGroupCounts;
    reconcileSelectedTags();
    engineType = pagefindEngine || novelPagefindEngine ? "pagefind" : "local";
    return true;
  };

  async function runSearch() {
    if (!isOpen.value || !engineType) return;

    const requestId = ++searchRequestId;

    if (!hasSearchCriteria.value) {
      isLoading.value = false;
      errorMessage.value = "";
      results.value = [];
      activeIndex.value = -1;
      return;
    }

    isLoading.value = true;
    errorMessage.value = "";

    try {
      const matches =
        engineType === "pagefind" ? await searchPagefindIndex() : searchIndex();

      if (requestId !== searchRequestId) return;

      results.value = sortSiteSearchResults(matches, {
        keyword: keyword.value,
        selectedTypes: selectedTypes.value,
      });
      activeIndex.value = results.value.length ? 0 : -1;
    } catch (error) {
      if (requestId !== searchRequestId) return;

      console.error("全局搜索失败:", error);
      errorMessage.value = localeMessage("common.search.loadFailed");
      results.value = [];
      activeIndex.value = -1;
    } finally {
      if (requestId === searchRequestId) isLoading.value = false;
    }
  }

  const initializeSearch = async (force = false) => {
    if (engineType && !force) return;

    errorMessage.value = "";
    engineType = "";

    try {
      if ((await loadSearchEngine()) === false) return;
    } catch (error) {
      console.error("初始化全局搜索失败:", error);
      errorMessage.value = localeMessage("common.search.retryHint");
      return;
    }

    await runSearch();
  };

  const scheduleSearch = () => {
    if (!isOpen.value || !engineType) return;

    clearTimeout(searchTimer);

    if (!hasSearchCriteria.value) {
      void runSearch();
      return;
    }

    searchTimer = setTimeout(runSearch, 140);
  };

  const moveActiveResult = (direction) => {
    if (!results.value.length) return;

    activeIndex.value =
      (activeIndex.value + direction + results.value.length) %
      results.value.length;
  };

  watch(
    () => [auth.state.authenticated, auth.state.revision],
    () => {
      initializationId++;
      searchRequestId++;
      clearTimeout(searchTimer);
      novelPagefindEngine = null;
      searchEntries = searchEntries.filter((entry) => entry.type !== "novel");
      results.value = results.value.filter((entry) => entry.type !== "novel");
      selectedTags.value = selectedTags.value.filter(
        (tag) => !tag.startsWith("novel:"),
      );
      selectedYears.value = [];
      availableTypes.value = CONTENT_TYPES.map((type) => ({
        ...type,
        count: 0,
      }));
      availableTags.value = [];
      availableYears.value = [];
      availableTagGroupCounts.value = new Map();
      activeIndex.value = -1;
      isLoading.value = false;
      engineType = "";
      if (isOpen.value) void initializeSearch(true);
    },
    { flush: "sync" },
  );

  watch(uiLocale, () => {
    engineType = "";
    initializationId++;
    searchRequestId++;
    results.value = [];
    if (isOpen.value) void initializeSearch(true);
  });

  onBeforeUnmount(() => {
    initializationId++;
    searchRequestId++;
    void pagefindEngine?.destroy();
    clearTimeout(searchTimer);
  });

  return {
    isLoading,
    errorMessage,
    results,
    activeIndex,
    availableTypes,
    availableTags,
    availableYears,
    availableTagGroupCounts,
    getTypeLabel,
    getAvailableTag,
    serializeSelectedTags,
    getSelectedTagLabel,
    reconcileSelectedTags,
    initializeSearch,
    scheduleSearch,
    moveActiveResult,
  };
}
