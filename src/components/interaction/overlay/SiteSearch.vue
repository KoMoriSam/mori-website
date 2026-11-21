<template>
  <Teleport to="body">
    <Transition name="global-search">
      <div
        v-if="isOpen"
        class="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 px-3 pt-[8vh] sm:px-6 sm:pt-[10vh]"
        role="presentation"
        @mousedown.self="closeSearch"
      >
        <section
          ref="dialogPanel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="global-search-title"
          class="flex max-h-[82vh] w-full max-w-3xl flex-col rounded-box border border-base-300 bg-base-100 shadow-2xl"
          @keydown="handleDialogKeydown"
        >
          <h2 id="global-search-title" class="sr-only">
            {{ translate("common.search.title") }}
          </h2>

          <div class="border-base-300 p-2 pt-1 sm:p-4 sm:pt-2">
            <div ref="searchBox" class="relative">
              <div
                class="input input-lg flex h-auto min-h-12 w-full min-w-0 flex-wrap items-center gap-2 border-0 bg-transparent px-1 shadow-none focus-within:outline-0 sm:gap-3"
              >
                <i
                  class="ri-search-line shrink-0 text-xl text-base-content/45"
                  aria-hidden="true"
                ></i>

                <div
                  v-if="hasFilters"
                  class="flex max-w-full flex-wrap items-center gap-1.5"
                >
                  <button
                    v-for="type in selectedTypes"
                    :key="`type-${type}`"
                    type="button"
                    class="badge badge-info pl-2.5 pr-1.5"
                    :aria-label="
                      translate('common.search.removeType', {
                        p0: getTypeLabel(type),
                      })
                    "
                    @click="removeSelectedType(type)"
                  >
                    <span class="truncate">{{ getTypeLabel(type) }}</span>
                    <i class="ri-close-line shrink-0" aria-hidden="true"></i>
                  </button>

                  <button
                    v-for="tag in selectedTags"
                    :key="`tag-${tag}`"
                    type="button"
                    class="badge badge-primary badge-soft pl-2.5 pr-1.5"
                    :aria-label="
                      translate('common.search.removeFilter', {
                        p0: getSelectedTagLabel(tag),
                      })
                    "
                    @click="removeSelectedTag(tag)"
                  >
                    <span class="truncate">{{ getSelectedTagLabel(tag) }}</span>
                    <i class="ri-close-line shrink-0" aria-hidden="true"></i>
                  </button>

                  <button
                    v-for="year in selectedYears"
                    :key="`year-${year}`"
                    type="button"
                    class="badge badge-secondary badge-soft pl-2.5 pr-1.5"
                    :aria-label="
                      translate('common.search.removeYear', { p0: year })
                    "
                    @click="removeSelectedYear(year)"
                  >
                    {{ year }}
                    <i class="ri-close-line" aria-hidden="true"></i>
                  </button>
                </div>

                <label for="global-article-search" class="sr-only">
                  {{ translate("common.search.placeholder") }}
                </label>
                <input
                  id="global-article-search"
                  ref="searchInput"
                  v-model="searchText"
                  type="search"
                  role="combobox"
                  class="min-w-32 flex-1 text-base sm:text-lg"
                  :placeholder="translate('common.search.label')"
                  autocomplete="off"
                  spellcheck="false"
                  aria-autocomplete="list"
                  :aria-expanded="isFilterMenuOpen"
                  :aria-controls="
                    isFilterMenuOpen
                      ? 'global-filter-suggestions'
                      : 'global-search-results'
                  "
                  :aria-activedescendant="
                    isFilterMenuOpen &&
                    activeFilterIndex >= 0 &&
                    filteredFilterOptions.length
                      ? `global-filter-option-${activeFilterIndex}`
                      : activeIndex >= 0
                        ? `global-search-result-${activeIndex}`
                        : null
                  "
                  @input="handleInput"
                  @focus="updateFilterQuery()"
                  @click="updateFilterQuery()"
                  @keydown.down="handleArrow($event, 1)"
                  @keydown.up="handleArrow($event, -1)"
                  @keydown.enter="handleEnter"
                  @keydown.tab="handleTab"
                  @keydown.backspace="handleBackspace"
                  @keydown.esc="handleEscape"
                  @compositionstart="handleCompositionStart"
                  @compositionend="handleCompositionEnd"
                />

                <button
                  v-if="searchText || hasFilters"
                  type="button"
                  class="btn btn-circle btn-ghost btn-sm shrink-0"
                  :aria-label="translate('common.search.clearFilters')"
                  @click="resetSearch"
                >
                  <i class="ri-delete-bin-line" aria-hidden="true"></i>
                </button>

                <kbd class="kbd kbd-sm hidden sm:inline-flex">Esc</kbd>
              </div>

              <FilterTokenSuggestions
                v-if="isFilterMenuOpen"
                class="z-40 flex max-h-[calc(82vh-6rem)] flex-col"
                id-prefix="global-filter"
                :header="suggestionHeader"
                :groups="suggestionGroups"
                :active-index="activeFilterIndex"
                :empty-text="suggestionEmptyText"
                scrollable-class="flex-1"
                list-class="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-1.5"
                @update:active-index="activeFilterIndex = $event"
                @select="selectFilterOption"
              />
            </div>

            <p class="my-1 px-1 text-xs text-base-content/40">
              {{ translate("common.search.enter") }}
              <kbd class="kbd kbd-xs">@</kbd>
              {{ translate("common.search.typeHint") }}
              <kbd class="kbd kbd-xs">#</kbd>
              {{ translate("common.search.categoryHint") }}
              <kbd class="kbd kbd-xs">/</kbd>
              {{ translate("common.search.yearHint") }}
            </p>
          </div>

          <SearchResultList
            :has-criteria="hasSearchCriteria"
            :is-loading="isLoading"
            :error-message="errorMessage"
            :results="results"
            :active-index="activeIndex"
            :keyword="keyword"
            :tag-only-search="isTagOnlySearch"
            @retry="initializeSearch(true)"
            @select="openResult"
            @update:active-index="activeIndex = $event"
          />

          <footer
            v-if="hasSearchCriteria"
            class="flex items-center justify-between gap-3 border-t border-base-300 bg-base-200/45 px-4 py-2 text-xs text-base-content/45"
          >
            <span>{{
              translate(
                "common.counts.results",
                { count: results.length },
                results.length,
              )
            }}</span>
            <span class="hidden items-center gap-3 sm:flex">
              <span>
                <kbd class="kbd kbd-xs">↑</kbd>
                <kbd class="kbd kbd-xs">↓</kbd>
                {{ translate("common.search.select") }}
              </span>
              <span>
                <kbd class="kbd kbd-xs">Enter</kbd>
                {{ translate("common.search.open") }}
              </span>
            </span>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useLocale } from "@/i18n";
import FilterTokenSuggestions from "@/components/interaction/controls/FilterTokenSuggestions.vue";
import SearchResultList from "@/components/interaction/overlay/SearchResultList.vue";
import { useFilterTokenInput } from "@/composables/useFilterTokenInput";
import { useSiteSearchEngine } from "@/composables/useSiteSearchEngine";
import { CONTENT_TYPES } from "@/services/search-content";
import { buildSiteFilterOptions, sameList } from "@/utils/site-search";

const FILTER_TRIGGERS = { "@": "type", "#": "tag", "/": "year" };
const VALID_CONTENT_TYPES = new Set(CONTENT_TYPES.map((type) => type.value));

const queryList = (value) => {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [
    ...new Set(values.map((item) => String(item).trim()).filter(Boolean)),
  ];
};

const queryText = (value) =>
  Array.isArray(value)
    ? String(value[0] || "").trim()
    : String(value || "").trim();

const { t: translate, text: localizeText } = useLocale();
const route = useRoute();
const router = useRouter();
const emit = defineEmits(["restore-focus"]);

const dialogPanel = ref(null);
const searchBox = ref(null);
const searchInput = ref(null);
const isOpen = ref(false);
const keyword = ref("");
const selectedTypes = ref([]);
const selectedTags = ref([]);
const selectedYears = ref([]);

let urlSyncTimer;
let syncingFromRoute = false;
let previousBodyOverflow = "";
let bodyScrollLocked = false;

const hasFilters = computed(
  () =>
    selectedTypes.value.length > 0 ||
    selectedTags.value.length > 0 ||
    selectedYears.value.length > 0,
);

const hasSearchCriteria = computed(
  () => Boolean(keyword.value.trim()) || hasFilters.value,
);

const isTagOnlySearch = computed(
  () =>
    !keyword.value.trim() &&
    selectedTags.value.length > 0 &&
    selectedYears.value.length === 0,
);

const {
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
} = useSiteSearchEngine({
  isOpen,
  keyword,
  selectedTypes,
  selectedTags,
  selectedYears,
  hasSearchCriteria,
});

const removeSelectedTag = (tag) => {
  selectedTags.value = selectedTags.value.filter((item) => item !== tag);
};

const removeSelectedType = (type) => {
  selectedTypes.value = selectedTypes.value.filter((item) => item !== type);
  selectedTags.value = selectedTags.value.filter(
    (tag) => getAvailableTag(tag)?.contentType !== type,
  );
};

const removeSelectedYear = (year) => {
  selectedYears.value = selectedYears.value.filter((item) => item !== year);
};

const openActiveResult = () => {
  const result = results.value[activeIndex.value];
  if (result) openResult(result);
};

const {
  searchText,
  activeFilterQuery,
  activeFilterIndex,
  isFilterMenuOpen,
  filteredFilterOptions,
  filterOptionGroups,
  updateFilterQuery,
  closeFilterMenu,
  syncSearchText,
  resetSearchText,
  selectFilterOption,
  handleInput,
  handleCompositionStart,
  handleCompositionEnd,
  handleArrow,
  handleEnter,
  handleTab,
  handleBackspace,
  handleEscape,
} = useFilterTokenInput({
  inputRef: searchInput,
  containerRef: searchBox,
  keyword,
  triggers: FILTER_TRIGGERS,
  getOptions: (filterQuery, normalizedQuery) =>
    buildSiteFilterOptions({
      filterQuery,
      normalizedQuery,
      availableTypes: availableTypes.value,
      availableTags: availableTags.value,
      availableYears: availableYears.value,
      selectedTypes: selectedTypes.value,
      selectedTags: selectedTags.value,
      selectedYears: selectedYears.value,
      translate,
      localizeText,
      getTypeLabel,
    }),
  getGroupCount: (groupKey) => availableTagGroupCounts.value.get(groupKey) || 0,
  onSelectOption: (option) => {
    if (option.type === "type" && !selectedTypes.value.includes(option.value)) {
      selectedTypes.value = [...selectedTypes.value, option.value];
    }

    if (option.type === "tag" && !selectedTags.value.includes(option.value)) {
      selectedTags.value = [...selectedTags.value, option.value];

      if (
        selectedTypes.value.length === 0 &&
        option.contentType &&
        !selectedTypes.value.includes(option.contentType)
      ) {
        selectedTypes.value = [option.contentType];
      }
    }

    if (option.type === "year" && !selectedYears.value.includes(option.value)) {
      selectedYears.value = [...selectedYears.value, option.value];
    }
  },
  onBackspaceEmpty: () => {
    const lastYear = selectedYears.value.at(-1);
    const lastTag = selectedTags.value.at(-1);
    const lastType = selectedTypes.value.at(-1);

    if (lastYear) {
      removeSelectedYear(lastYear);
      return true;
    }
    if (lastTag) {
      removeSelectedTag(lastTag);
      return true;
    }
    if (lastType) {
      removeSelectedType(lastType);
      return true;
    }
    return false;
  },
  onArrowClosed: (event, direction) => {
    event.preventDefault();
    moveActiveResult(direction);
  },
  onEnterClosed: (event) => {
    event.preventDefault();
    openActiveResult();
  },
  preventEnterWhenMenuOpen: true,
  stopTabPropagation: true,
  stopEscapePropagation: true,
});

const suggestionHeader = computed(() => {
  const type = activeFilterQuery.value?.type;
  if (type === "tag") {
    return {
      icon: "ri-price-tag-3-line",
      label: translate("common.search.chooseCategory"),
      ariaLabel: translate("common.search.tagSuggestions"),
    };
  }
  if (type === "year") {
    return {
      icon: "ri-calendar-line",
      label: translate("common.search.chooseYear"),
      ariaLabel: translate("common.search.yearSuggestions"),
    };
  }
  return {
    icon: "ri-layout-grid-line",
    label: translate("common.search.chooseType"),
    ariaLabel: translate("common.search.typeSuggestions"),
  };
});

const suggestionGroups = computed(() =>
  filterOptionGroups.value.map((group) => ({
    ...group,
    countText: translate(
      "common.counts.items",
      { count: group.count },
      group.count,
    ),
  })),
);

const suggestionEmptyText = computed(() =>
  activeFilterQuery.value?.query
    ? translate("common.search.noOptions", {
        p0: activeFilterQuery.value.query,
      })
    : translate("common.search.noFilters"),
);

const setBodyScrollLocked = (locked) => {
  if (locked === bodyScrollLocked) return;
  bodyScrollLocked = locked;

  if (locked) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  } else {
    document.body.style.overflow = previousBodyOverflow;
  }
};

const enterOpenState = async ({
  syncRoute = false,
  selectInput = false,
} = {}) => {
  if (isOpen.value) return;

  isOpen.value = true;
  setBodyScrollLocked(true);

  if (syncRoute) {
    router.replace({ query: { ...route.query, search: "1" } });
  }

  await nextTick();
  searchInput.value?.focus();
  if (selectInput) searchInput.value?.select();
  await initializeSearch();
};

const exitOpenState = ({ syncRoute = false, restoreFocus = false } = {}) => {
  if (!isOpen.value) return;

  isOpen.value = false;
  closeFilterMenu();
  setBodyScrollLocked(false);

  if (syncRoute) {
    const query = { ...route.query };
    delete query.search;
    router.replace({ query });
  }

  if (restoreFocus) {
    emit("restore-focus");
  }
};

const activate = async () => {
  if (isOpen.value) {
    searchInput.value?.focus();
    searchInput.value?.select();
    return;
  }

  await enterOpenState({ syncRoute: true, selectInput: true });
};

const closeSearch = ({ restoreFocus = true } = {}) => {
  exitOpenState({ syncRoute: true, restoreFocus });
};

const resetSearch = () => {
  keyword.value = "";
  selectedTypes.value = [];
  selectedTags.value = [];
  selectedYears.value = [];
  resetSearchText();
  nextTick(() => searchInput.value?.focus());
};

const openResult = (result) => {
  const destination = router.resolve(String(result.url || "/"));
  const query = { ...destination.query };
  const serializedTags = serializeSelectedTags();

  if (selectedTypes.value.length) query.type = [...selectedTypes.value];
  if (serializedTags.length) query.tag = serializedTags;
  if (selectedYears.value.length) query.year = [...selectedYears.value];
  if (keyword.value.trim()) query.q = keyword.value.trim();

  exitOpenState();
  router
    .push({
      path: destination.path || "/",
      query,
      hash: destination.hash,
    })
    .then(() => {
      document.dispatchEvent(new CustomEvent("global-search-result-opened"));
    });
};

const handleDialogKeydown = (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    closeSearch();
    return;
  }

  if (event.key !== "Tab") return;

  const focusable = [
    ...dialogPanel.value.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ];

  if (!focusable.length) return;

  const first = focusable[0];
  const last = focusable.at(-1);

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
};

const syncUrlState = () => {
  if (syncingFromRoute || import.meta.env.SSR) return;

  clearTimeout(urlSyncTimer);
  urlSyncTimer = setTimeout(() => {
    const query = Object.fromEntries(
      Object.entries(route.query).filter(
        ([key]) => !["q", "type", "tag", "year"].includes(key),
      ),
    );
    const serializedTags = serializeSelectedTags();

    if (selectedTypes.value.length) query.type = [...selectedTypes.value];
    if (serializedTags.length) query.tag = serializedTags;
    if (selectedYears.value.length) query.year = [...selectedYears.value];
    if (keyword.value.trim()) query.q = keyword.value.trim();

    router.replace({ query });
  }, 120);
};

const applyRouteState = () => {
  const nextKeyword = queryText(route.query.q);
  const nextTypes = queryList(route.query.type).filter((type) =>
    VALID_CONTENT_TYPES.has(type),
  );
  const nextTags = queryList(route.query.tag);
  const nextYears = queryList(route.query.year);

  syncingFromRoute = true;

  if (keyword.value !== nextKeyword) keyword.value = nextKeyword;
  syncSearchText(nextKeyword);
  if (!sameList(selectedTypes.value, nextTypes)) {
    selectedTypes.value = nextTypes;
  }
  if (!sameList(selectedTags.value, nextTags)) selectedTags.value = nextTags;
  if (!sameList(selectedYears.value, nextYears)) {
    selectedYears.value = nextYears;
  }

  reconcileSelectedTags();
  syncingFromRoute = false;
};

watch(
  () => [
    route.query.search,
    route.query.q,
    route.query.type,
    route.query.tag,
    route.query.year,
  ],
  async () => {
    applyRouteState();

    if (route.query.search === "1") {
      await enterOpenState();
    } else {
      exitOpenState();
    }
  },
);

watch(
  [keyword, selectedTypes, selectedTags, selectedYears],
  () => {
    syncUrlState();
    scheduleSearch();
  },
  { deep: true },
);

onMounted(async () => {
  applyRouteState();

  if (route.query.search === "1") {
    await enterOpenState();
  }
});

onBeforeUnmount(() => {
  clearTimeout(urlSyncTimer);
  setBodyScrollLocked(false);
});

defineExpose({ activate });
</script>

<style scoped>
.global-search-enter-active,
.global-search-leave-active {
  transition:
    opacity 180ms ease,
    backdrop-filter 180ms ease;
}

.global-search-enter-active > section,
.global-search-leave-active > section {
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.global-search-enter-from,
.global-search-leave-to {
  opacity: 0;
}

.global-search-enter-from > section,
.global-search-leave-to > section {
  opacity: 0;
  transform: translateY(-0.75rem) scale(0.985);
}

@media (prefers-reduced-motion: reduce) {
  .global-search-enter-active,
  .global-search-leave-active,
  .global-search-enter-active > section,
  .global-search-leave-active > section {
    transition: none;
  }
}
</style>
