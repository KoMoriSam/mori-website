import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

const escapeCharacterClass = (value) =>
  String(value).replace(/[\\\]^-]/g, "\\$&").replace(/\//g, "\\/");

const createTriggerPattern = (triggers) => {
  const escaped = Object.keys(triggers).map(escapeCharacterClass).join("");
  return new RegExp(`(^|\\s)([${escaped}])([^\\s${escaped}]*)$`, "u");
};

export const getPlainSearchText = (value, filterQuery) => {
  const text = String(value || "");

  if (!filterQuery) return text.trim().replace(/\s+/g, " ");

  return `${text.slice(0, filterQuery.start)}${text.slice(filterQuery.end)}`
    .trim()
    .replace(/\s+/g, " ");
};

export function useFilterTokenInput({
  inputRef,
  containerRef,
  keyword,
  triggers,
  getOptions,
  getGroupCount,
  onSelectOption,
  onBackspaceEmpty,
  onArrowClosed,
  onEnterClosed,
  onEscapeClosed,
  preventEnterWhenMenuOpen = false,
  stopTabPropagation = false,
  stopEscapePropagation = false,
  syncFromKeyword = false,
}) {
  const triggerPattern = createTriggerPattern(triggers);
  const searchText = ref(keyword.value || "");
  const activeFilterQuery = ref(null);
  const activeFilterIndex = ref(0);
  const isComposing = ref(false);

  const isFilterMenuOpen = computed(() => activeFilterQuery.value !== null);

  const filteredFilterOptions = computed(() => {
    const filterQuery = activeFilterQuery.value;
    if (!filterQuery) return [];

    const normalizedQuery = filterQuery.query
      .normalize("NFKC")
      .toLocaleLowerCase()
      .trim();

    return getOptions(filterQuery, normalizedQuery).map((option, index) => ({
      ...option,
      index,
    }));
  });

  const filterOptionGroups = computed(() => {
    const groups = [];
    const groupMap = new Map();

    for (const option of filteredFilterOptions.value) {
      const groupKey = option.groupKey || "";
      const key = `${option.type}:${groupKey}`;
      let group = groupMap.get(key);

      if (!group) {
        group = {
          key,
          label: option.groupLabel || "",
          count: groupKey ? getGroupCount?.(groupKey, option) || 0 : 0,
          options: [],
        };
        groupMap.set(key, group);
        groups.push(group);
      }

      group.options.push(option);
    }

    return groups;
  });

  const getFilterQuery = (value, caretPosition = String(value || "").length) => {
    const text = String(value || "");
    const caret = Math.max(
      0,
      Math.min(caretPosition ?? text.length, text.length),
    );
    const match = text.slice(0, caret).match(triggerPattern);

    if (!match) return null;

    const leadingWhitespace = match[1];
    const trigger = match[2];

    return {
      type: triggers[trigger],
      trigger,
      query: match[3],
      start: (match.index ?? 0) + leadingWhitespace.length,
      end: caret,
    };
  };

  const syncKeywordFromSearch = () => {
    const nextKeyword = getPlainSearchText(
      searchText.value,
      activeFilterQuery.value,
    );

    if (keyword.value !== nextKeyword) keyword.value = nextKeyword;
  };

  const closeFilterMenu = () => {
    activeFilterQuery.value = null;
    activeFilterIndex.value = 0;
  };

  const syncSearchText = (nextKeyword) => {
    const currentPlainText = getPlainSearchText(
      searchText.value,
      activeFilterQuery.value,
    );

    if (currentPlainText !== nextKeyword) {
      searchText.value = nextKeyword;
      closeFilterMenu();
    }
  };

  const resetSearchText = () => {
    searchText.value = "";
    closeFilterMenu();
  };

  const updateFilterQuery = (target = inputRef.value) => {
    const caretPosition = target?.selectionStart ?? searchText.value.length;
    const nextQuery = getFilterQuery(searchText.value, caretPosition);
    const queryChanged =
      nextQuery?.type !== activeFilterQuery.value?.type ||
      nextQuery?.query !== activeFilterQuery.value?.query ||
      nextQuery?.start !== activeFilterQuery.value?.start;

    activeFilterQuery.value = nextQuery;

    if (queryChanged) activeFilterIndex.value = 0;
  };

  const handleInput = (event) => {
    if (isComposing.value) return;

    updateFilterQuery(event.currentTarget);
    syncKeywordFromSearch();
  };

  const handleCompositionStart = () => {
    isComposing.value = true;
  };

  const handleCompositionEnd = (event) => {
    isComposing.value = false;
    updateFilterQuery(event.currentTarget);
    syncKeywordFromSearch();
  };

  const moveActiveFilter = (direction) => {
    const optionCount = filteredFilterOptions.value.length;
    if (!isFilterMenuOpen.value || !optionCount) return;

    activeFilterIndex.value =
      (activeFilterIndex.value + direction + optionCount) % optionCount;
  };

  const selectFilterOption = async (option) => {
    const filterQuery = activeFilterQuery.value;
    if (!filterQuery) return;

    onSelectOption?.(option);

    const textBeforeQuery = searchText.value.slice(0, filterQuery.start);
    const textAfterQuery = searchText.value.slice(filterQuery.end);
    searchText.value = `${textBeforeQuery}${textAfterQuery}`.replace(
      /\s{2,}/g,
      " ",
    );
    const nextCaretPosition = Math.min(
      filterQuery.start,
      searchText.value.length,
    );

    closeFilterMenu();
    syncKeywordFromSearch();

    await nextTick();
    inputRef.value?.focus();
    inputRef.value?.setSelectionRange(nextCaretPosition, nextCaretPosition);
  };

  const selectActiveFilter = () => {
    const option = filteredFilterOptions.value[activeFilterIndex.value];
    if (!option) return false;

    void selectFilterOption(option);
    return true;
  };

  const handleArrow = (event, direction) => {
    if (isFilterMenuOpen.value) {
      event.preventDefault();
      moveActiveFilter(direction);
      return;
    }

    onArrowClosed?.(event, direction);
  };

  const handleEnter = (event) => {
    if (isFilterMenuOpen.value) {
      if (selectActiveFilter() || preventEnterWhenMenuOpen) {
        event.preventDefault();
      }
      return;
    }

    onEnterClosed?.(event);
  };

  const handleTab = (event) => {
    if (!isFilterMenuOpen.value || !selectActiveFilter()) return;

    event.preventDefault();
    if (stopTabPropagation) event.stopPropagation();
  };

  const handleBackspace = (event) => {
    if (isComposing.value) return;

    const target = event.currentTarget;
    if (target.selectionStart !== 0 || target.selectionEnd !== 0) return;

    if (!onBackspaceEmpty?.()) return;

    event.preventDefault();
    closeFilterMenu();
  };

  const handleEscape = (event) => {
    if (isFilterMenuOpen.value) {
      event.preventDefault();
      if (stopEscapePropagation) event.stopPropagation();
      closeFilterMenu();
      return;
    }

    onEscapeClosed?.(event);
  };

  const handleOutsidePointerDown = (event) => {
    if (!containerRef.value?.contains(event.target)) closeFilterMenu();
  };

  watch(filteredFilterOptions, (options) => {
    if (!options.length) {
      activeFilterIndex.value = -1;
      return;
    }

    if (
      activeFilterIndex.value < 0 ||
      activeFilterIndex.value >= options.length
    ) {
      activeFilterIndex.value = 0;
    }
  });

  if (syncFromKeyword) {
    watch(keyword, syncSearchText);
  }

  onMounted(() => {
    document.addEventListener("pointerdown", handleOutsidePointerDown);
  });

  onBeforeUnmount(() => {
    document.removeEventListener("pointerdown", handleOutsidePointerDown);
  });

  return {
    searchText,
    activeFilterQuery,
    activeFilterIndex,
    isComposing,
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
  };
}
