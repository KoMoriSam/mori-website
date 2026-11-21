<template>
  <ScrollableContainer class="flex-1">
    <div
      id="global-search-results"
      class="min-h-0 flex-1 overflow-y-auto overscroll-contain"
    >
      <template v-if="hasCriteria">
        <div
          v-if="isLoading"
          class="space-y-3 p-4 sm:p-5"
          :aria-label="translate('common.search.searching')"
        >
          <div
            v-for="index in 4"
            :key="index"
            class="flex gap-3 rounded-box border border-base-300 p-4"
          >
            <div class="skeleton mt-1 size-8 shrink-0 rounded-full"></div>
            <div class="min-w-0 flex-1 space-y-2">
              <div class="skeleton h-5 w-2/5"></div>
              <div class="skeleton h-4 w-full"></div>
            </div>
          </div>
        </div>
        <div
          v-else-if="errorMessage"
          class="px-6 py-14 text-center"
          role="alert"
        >
          <i
            class="ri-error-warning-line mb-3 block text-4xl text-error/65"
            aria-hidden="true"
          ></i>
          <p class="font-medium">{{ translate("common.search.indexUnavailable") }}</p>
          <p class="mt-1 text-sm text-base-content/50">
            {{ localizeText(errorMessage) }}
          </p>
          <button
            type="button"
            class="btn btn-outline btn-sm mt-5"
            @click="emit('retry')"
          >
            {{ translate("announcements.retry") }}
          </button>
        </div>
        <ul
          v-else-if="results.length"
          class="menu w-full gap-1 p-2 sm:p-3"
          role="listbox"
          :aria-label="translate('common.search.resultsLabel')"
        >
          <li v-for="(result, index) in results" :key="result.url">
            <button
              :id="`global-search-result-${index}`"
              type="button"
              role="option"
              :aria-selected="activeIndex === index"
              class="group block w-full rounded-box px-3 py-3 text-left sm:px-4"
              :class="{ 'bg-primary/10': activeIndex === index }"
              @mouseenter="emit('update:activeIndex', index)"
              @focus="emit('update:activeIndex', index)"
              @click="emit('select', result)"
            >
              <span class="flex min-w-0 items-start gap-3">
                <span
                  class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
                >
                  <i :class="result.typeIcon" aria-hidden="true"></i>
                </span>
                <span class="min-w-0 flex-1">
                  <span
                    class="block text-balance font-serif text-base font-bold leading-snug sm:text-lg"
                  >
                    <HighlightedText
                      :text="
                        result.type === 'licenses'
                          ? localizeText(result.title)
                          : result.title
                      "
                      :keyword="keyword"
                    />
                  </span>
                  <span
                    v-if="shouldShowResultSummary(result)"
                    class="mt-1 line-clamp-2 text-pretty text-sm leading-relaxed text-base-content/60"
                  >
                    <HighlightedText
                      :text="getResultSummary(result)"
                      :keyword="keyword"
                      mark-class="rounded-sm bg-primary/60 px-0.5 text-primary-content"
                    />
                  </span>
                  <span
                    class="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-base-content/45"
                  >
                    <time
                      v-if="
                        result.date &&
                        !result.metadata?.length &&
                        !shouldMoveChangelogDateToSummary(result)
                      "
                    >
                      {{ formatLocalizedDate(result.date) }}
                    </time>
                    <span
                      v-for="tag in result.tags"
                      :key="`${result.url}-${tag}`"
                      class="badge badge-ghost badge-xs truncate"
                    >
                      #<HighlightedText
                        :text="formatArticleTag(tag)"
                        :keyword="keyword"
                        mark-class="rounded-sm bg-primary/60 px-0.5 text-primary-content"
                      />
                    </span>
                    <Tooltip
                      v-for="meta in result.metadata"
                      :key="`${result.url}-${meta.key}`"
                      as="span"
                      trigger-class=""
                      overflow-only
                      adaptive
                      placement="top"
                      align="end"
                      content-class="max-w-56 sm:max-w-80"
                      class="inline-flex min-w-0 max-w-full items-center gap-1"
                      :text="`${localizeText(meta.label)}: ${metadataValue(meta)}`"
                      :aria-label="`${localizeText(meta.label)}: ${metadataValue(meta)}`"
                    >
                      <i
                        class="shrink-0"
                        :class="meta.icon"
                        aria-hidden="true"
                      ></i>
                      <span class="shrink-0">{{ localizeText(meta.label) }}</span>
                      <span class="max-w-48 truncate">
                        {{ metadataValue(meta) }}
                      </span>
                    </Tooltip>
                  </span>
                </span>
                <i
                  class="ri-arrow-right-line mt-2 shrink-0 text-base-content/25 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary motion-reduce:transition-none"
                  aria-hidden="true"
                ></i>
              </span>
            </button>
          </li>
        </ul>
        <div v-else class="px-6 py-16 text-center" role="status">
          <i
            class="ri-search-eye-line mb-3 block text-4xl text-base-content/20"
            aria-hidden="true"
          ></i>
          <p class="font-medium">{{ translate("common.search.noMatches") }}</p>
          <p class="mt-1 text-sm text-base-content/45">
            {{ translate("common.search.noMatchesHint") }}
          </p>
        </div>
      </template>
    </div>
  </ScrollableContainer>
</template>

<script setup>
import HighlightedText from "@/components/display/HighlightedText.vue";
import Tooltip from "@/components/display/Tooltip.vue";
import ScrollableContainer from "@/components/layout/ScrollableContainer.vue";
import { useLocale } from "@/i18n";
import { FULL_DATE_OPTIONS } from "@/i18n/format-date.js";
import { formatArticleTag } from "@/utils/blog/article-fields";

const props = defineProps({
  hasCriteria: {
    type: Boolean,
    default: false,
  },
  isLoading: {
    type: Boolean,
    default: false,
  },
  errorMessage: {
    type: [String, Object],
    default: "",
  },
  results: {
    type: Array,
    default: () => [],
  },
  activeIndex: {
    type: Number,
    default: -1,
  },
  keyword: {
    type: String,
    default: "",
  },
  tagOnlySearch: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["retry", "select", "update:activeIndex"]);

const {
  t: translate,
  text: localizeText,
  date: formatLocalizedDate,
  number: formatNumber,
} = useLocale();

const metadataValue = (meta) => {
  if (
    meta.rawValue != null &&
    /^(date|created|updated|modified|modifiedDate|uploadDate)$/.test(meta.key)
  ) {
    const options = { ...FULL_DATE_OPTIONS };
    if (/[T\s]\d{1,2}:\d{2}/.test(String(meta.rawValue))) {
      Object.assign(options, { hour: "2-digit", minute: "2-digit" });
    }
    return formatLocalizedDate(meta.rawValue, options);
  }
  if (meta.key === "length" && Number.isFinite(Number(meta.rawValue))) {
    return translate(
      "common.counts.characters",
      { count: formatNumber(Number(meta.rawValue)) },
      Number(meta.rawValue),
    );
  }
  return localizeText(meta.value);
};

const shouldMoveChangelogDateToSummary = (result) =>
  result?.type === "changelog" &&
  Boolean(result.date) &&
  props.tagOnlySearch;

const getResultSummary = (result) => {
  if (shouldMoveChangelogDateToSummary(result)) {
    return formatLocalizedDate(result.date);
  }
  if (result.type === "licenses") {
    return localizeText(result.summary || "");
  }
  return result?.summary || "";
};

const shouldShowResultSummary = (result) => {
  if (shouldMoveChangelogDateToSummary(result)) return true;
  if (!result?.summary) return false;
  if (props.keyword.trim()) return true;
  return !["novel", "changelog"].includes(result.type);
};
</script>
