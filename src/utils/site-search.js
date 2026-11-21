import {
  formatArticleTag,
  getArticleSearchScore,
  normalizeArticleTag,
} from "@/utils/blog/article-fields";
import { CONTENT_TYPES, createSearchExcerpt } from "@/services/search-content";

const TAG_GROUP_LABEL_KEYS = {
  blog: "common.search.blogTags",
  novel: "common.search.novelVolumes",
  changelog: "common.search.changeTypes",
  licenses: "common.search.licenseTypes",
};

export const sameList = (left, right) =>
  left.length === right.length &&
  left.every((item, index) => item === right[index]);

export const parsePagefindMetadata = (value, fallback = []) => {
  try {
    const parsed = JSON.parse(String(value || ""));
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
};

export const normalizePagefindExcerpt = (value) =>
  String(value || "")
    .replace(/([\p{Script=Han}])\s+(?=[\p{Script=Han}])/gu, "$1")
    .replace(/\s+([，。！？；：、）】》])/gu, "$1")
    .replace(/([（【《])\s+/gu, "$1");

const buildTagGroupCounts = (entries) => {
  const counts = new Map();

  for (const entry of entries) {
    const entryGroups = new Set();

    for (const tag of Array.isArray(entry.filterTags) ? entry.filterTags : []) {
      entryGroups.add(`${tag.contentType}:__root`);

      if (tag.contentType !== "blog") continue;

      const segments = normalizeArticleTag(tag.value)
        .split("/")
        .filter(Boolean);

      for (let depth = 1; depth < segments.length; depth += 1) {
        entryGroups.add(`blog:${segments.slice(0, depth).join("/")}`);
      }
    }

    for (const groupKey of entryGroups) {
      counts.set(groupKey, (counts.get(groupKey) || 0) + 1);
    }
  }

  return counts;
};

export const buildSearchFacets = (entries) => {
  const tagDefinitions = new Map();
  const tagCounts = new Map();
  const yearCounts = new Map();
  const typeCounts = new Map();

  for (const entry of entries) {
    typeCounts.set(entry.type, (typeCounts.get(entry.type) || 0) + 1);
    const seenTags = new Set();

    for (const tag of Array.isArray(entry.filterTags) ? entry.filterTags : []) {
      if (!tag?.key || seenTags.has(tag.key)) continue;

      seenTags.add(tag.key);
      tagDefinitions.set(tag.key, tag);
      tagCounts.set(tag.key, (tagCounts.get(tag.key) || 0) + 1);
    }

    const year = String(entry.year || "").trim();
    if (year) yearCounts.set(year, (yearCounts.get(year) || 0) + 1);
  }

  const availableTypes = CONTENT_TYPES.map((type) => ({
    ...type,
    count: typeCounts.get(type.value) || 0,
  }));

  const availableTags = [...tagDefinitions.entries()]
    .map(([value, tag]) => ({
      value,
      rawValue: tag.value,
      label: tag.label,
      contentType: tag.contentType,
      groupPath: tag.groupPath,
      groupKey: `${tag.contentType}:${tag.groupPath || "__root"}`,
      order: Number.isFinite(tag.order) ? tag.order : Number.MAX_SAFE_INTEGER,
      count: tagCounts.get(value) || 0,
    }))
    .sort(
      (a, b) =>
        CONTENT_TYPES.findIndex((type) => type.value === a.contentType) -
          CONTENT_TYPES.findIndex((type) => type.value === b.contentType) ||
        (a.contentType === "novel" ? a.order - b.order : 0) ||
        a.label.localeCompare(b.label, "zh-Hans-CN"),
    );

  const availableYears = [...yearCounts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.value.localeCompare(a.value));

  return {
    availableTypes,
    availableTags,
    availableYears,
    availableTagGroupCounts: buildTagGroupCounts(entries),
  };
};

export const filterLocalSearchEntries = (
  entries,
  { selectedTypes, selectedTags, selectedYears, keyword, canReadNovel },
) => {
  const typeSet = new Set(selectedTypes);
  const tagSet = new Set(selectedTags);
  const yearSet = new Set(selectedYears);
  const query = keyword.trim();

  return entries.flatMap((entry) => {
    if (entry.type === "novel" && !canReadNovel) return [];
    const matchesType = typeSet.size === 0 || typeSet.has(entry.type);
    const entryTagSet = new Set(
      (Array.isArray(entry.filterTags) ? entry.filterTags : []).map(
        (tag) => tag.key,
      ),
    );
    const matchesTag =
      tagSet.size === 0 || [...tagSet].some((tag) => entryTagSet.has(tag));
    const matchesYear = yearSet.size === 0 || yearSet.has(entry.year);

    if (!matchesType || !matchesTag || !matchesYear) return [];
    if (!query) return [entry];

    const blockMatches = (
      Array.isArray(entry.searchBlocks) ? entry.searchBlocks : []
    )
      .map((block, index) => {
        const candidate = {
          ...entry,
          ...block,
          metadataText: entry.metadataText,
        };

        return {
          candidate,
          index,
          score: getArticleSearchScore(candidate, query),
        };
      })
      .filter((match) => match.score !== Number.NEGATIVE_INFINITY)
      .sort((a, b) => b.score - a.score || a.index - b.index);

    if (blockMatches.length) return [blockMatches[0].candidate];

    const score = getArticleSearchScore(entry, query);
    return score === Number.NEGATIVE_INFINITY ? [] : [entry];
  });
};

export const sortSiteSearchResults = (items, { keyword, selectedTypes }) => {
  const isNovelOnly =
    selectedTypes.length === 1 && selectedTypes[0] === "novel";

  return items
    .map((item, index) => {
      const hasPagefindScore = Number.isFinite(item.pagefindScore);
      const rawScore = hasPagefindScore
        ? item.pagefindScore
        : getArticleSearchScore(item, keyword);

      return {
        ...item,
        summary: hasPagefindScore
          ? item.summary
          : createSearchExcerpt(item.content, keyword, item.summary),
        originalIndex: index,
        searchScore: Number.isFinite(rawScore) ? rawScore : 0,
      };
    })
    .sort((a, b) => {
      if (!keyword.trim() && isNovelOnly) {
        return a.catalogOrder - b.catalogOrder;
      }

      return (
        b.searchScore - a.searchScore ||
        (isNovelOnly ? a.catalogOrder - b.catalogOrder : 0) ||
        String(b.date).localeCompare(String(a.date)) ||
        a.originalIndex - b.originalIndex
      );
    });
};

export const buildSiteFilterOptions = ({
  filterQuery,
  normalizedQuery,
  availableTypes,
  availableTags,
  availableYears,
  selectedTypes,
  selectedTags,
  selectedYears,
  translate,
  localizeText,
  getTypeLabel,
}) => {
  const formatItemCount = (count) =>
    translate("common.counts.items", { count }, count);

  if (filterQuery.type === "type") {
    const selected = new Set(selectedTypes);
    return availableTypes
      .filter((type) => type.count > 0 && !selected.has(type.value))
      .filter(
        (type) =>
          !normalizedQuery ||
          localizeText(type.label)
            .normalize("NFKC")
            .toLocaleLowerCase()
            .includes(normalizedQuery) ||
          type.value.includes(normalizedQuery),
      )
      .map((type) => {
        const label = localizeText(type.label);
        return {
          type: "type",
          value: type.value,
          label,
          displayLabel: label,
          fullLabel: label,
          ariaLabel: translate("common.search.type", { p0: label }),
          groupKey: "",
          groupLabel: "",
          prefix: "@",
          count: type.count,
          countText: formatItemCount(type.count),
        };
      });
  }

  if (filterQuery.type === "tag") {
    const selected = new Set(selectedTags);
    const selectedTypeSet = new Set(selectedTypes);
    const hasSingleType = selectedTypeSet.size === 1;

    return availableTags
      .filter((tag) => !selected.has(tag.value))
      .filter(
        (tag) =>
          selectedTypeSet.size === 0 || selectedTypeSet.has(tag.contentType),
      )
      .filter((tag) => {
        if (!normalizedQuery) return true;
        return `${tag.label} ${tag.rawValue}`
          .normalize("NFKC")
          .toLocaleLowerCase()
          .includes(normalizedQuery);
      })
      .map((tag) => {
        const typeLabel = getTypeLabel(tag.contentType);
        const tagSegments = tag.rawValue.split("/").filter(Boolean);
        const optionLabel =
          tag.contentType === "blog"
            ? tagSegments.at(-1) || tag.label
            : tag.label;
        const groupLabelKey = TAG_GROUP_LABEL_KEYS[tag.contentType];
        const nestedGroupLabel =
          tag.contentType === "blog" && tag.groupPath
            ? formatArticleTag(tag.groupPath)
            : groupLabelKey
              ? translate(groupLabelKey)
              : "";
        const groupLabel =
          hasSingleType || !nestedGroupLabel
            ? nestedGroupLabel
            : `${typeLabel} · ${nestedGroupLabel}`;

        return {
          type: "tag",
          value: tag.value,
          label: optionLabel,
          displayLabel: localizeText(optionLabel),
          fullLabel: tag.label,
          ariaLabel: `${typeLabel} ${tag.label}`,
          contentType: tag.contentType,
          typeLabel,
          groupKey: tag.groupKey,
          groupLabel,
          prefix: "#",
          count: tag.count,
          countText: formatItemCount(tag.count),
        };
      });
  }

  const selected = new Set(selectedYears);
  return availableYears
    .filter((year) => !selected.has(year.value))
    .filter((year) => !normalizedQuery || year.value.includes(normalizedQuery))
    .map((year) => ({
      type: "year",
      value: year.value,
      label: year.value,
      displayLabel: year.value,
      fullLabel: year.value,
      ariaLabel: translate("common.search.year", { p0: year.value }),
      groupKey: "",
      groupLabel: "",
      prefix: "/",
      count: year.count,
      countText: formatItemCount(year.count),
    }));
};
