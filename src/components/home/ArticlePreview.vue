<template>
  <CatalogCard
    :to="article.routePath"
    :lang="article.lang"
    :layout="featured ? 'default' : 'compact'"
    :class="featured ? 'md:h-full' : ''"
    :title="article.title"
    title-tag="h3"
    :description="article.summary || ''"
    :cover="{
      src: article.banner || '',
      icon: 'ri-article-line',
      sizes: '(min-width: 1280px) 600px, (min-width: 768px) 50vw, calc(100vw - 3rem)',
    }"
    :tags="tags"
    :action="featured ? translate('home.writing.read') : ''"
  >
    <template #meta>
      <CatalogMeta
        v-if="article.displayDate"
        tag="time"
        :datetime="article.displayDate"
        icon="ri-calendar-line"
        >{{ date(article.displayDate) }}</CatalogMeta
      >
      <CatalogMeta v-if="readingTime" icon="ri-time-line">{{
        translate("common.counts.minutes", { count: readingTime }, readingTime)
      }}</CatalogMeta>
    </template>
  </CatalogCard>
</template>

<script setup>
import { computed } from "vue";
import { useLocale } from "@/i18n";
import CatalogCard from "@/components/interaction/navigation/CatalogCard.vue";
import CatalogMeta from "@/components/interaction/navigation/CatalogMeta.vue";
import { formatArticleTag } from "@/utils/blog/article-fields";
import { estimateReadingTime } from "@/utils/blog/reading-time";

const props = defineProps({
  article: { type: Object, required: true },
  featured: Boolean,
});
const { t: translate, date } = useLocale();
const tags = computed(() =>
  (props.article.tags || []).slice(0, 2).map(formatArticleTag),
);
const readingTime = computed(() =>
  Number(props.article.length) > 0
    ? estimateReadingTime(props.article.length)
    : null,
);
</script>
