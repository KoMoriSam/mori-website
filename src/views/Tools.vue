<template>
  <ContentPage
    eyebrow="Tool List"
    :title="translate('tools.title')"
    :description="translate('tools.description')"
    :metas-label="translate('tools.info')"
  >
    <template #meta>
      <span class="inline-flex items-center gap-1.5">
        <i class="ri-tools-line" aria-hidden="true"></i>
        {{ translate("tools.count", { count: TOOLS.length }) }}
      </span>
    </template>
    <section
      class="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 xl:gap-6"
      :aria-label="translate('tools.available')"
    >
      <CatalogCard
        v-for="tool in TOOLS"
        :key="tool.name"
        :to="tool.to"
        :title="translate(tool.titleKey)"
        :description="translate(tool.descriptionKey)"
        :cover="{
          src: tool.cover,
          icon: tool.icon,
          class: 'min-h-44 flex-1 sm:min-h-56',
        }"
        :tags="[translate(tool.categoryKey)]"
        layout="responsive"
        :action="translate('tools.open')"
      />
    </section>
  </ContentPage>
</template>

<script setup>
import { useLocale } from "@/i18n";
const { t: translate } = useLocale();
import { TOOLS } from "@/constants/tools";

import ContentPage from "@/components/layout/ContentPage.vue";
import CatalogCard from "@/components/interaction/navigation/CatalogCard.vue";
</script>
