<template>
  <ContentPage
    :title="t('games.title')"
    :description="t('games.description')"
    :metas-label="t('games.info')"
  >
    <template #meta>
      <span class="inline-flex items-center gap-1.5">
        <i class="ri-gamepad-line" aria-hidden="true"></i>
        {{ t("games.count", { count: GAMES.length }) }}
      </span>
    </template>
    <section
      class="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 xl:gap-6"
      :aria-label="t('games.available')"
    >
      <CatalogCard
        v-for="game in GAMES"
        :key="game.id"
        :to="{ name: game.name }"
        :title="t(game.titleKey)"
        :description="t(game.descriptionKey)"
        :cover="{
          src: game.cover,
          icon: game.icon,
          class: 'min-h-44 flex-1 sm:min-h-56',
        }"
        layout="responsive"
        :action="t('games.play')"
      >
        <template #tags>
          <CatalogBadge
            v-for="info in game.metadata"
            :key="info.labelKey"
            :icon="info.icon"
          >
            {{ t(info.labelKey) }}
          </CatalogBadge>
        </template>
        <template #meta>
          <span class="flex min-w-0 max-w-full items-center gap-1.5">
            <i class="ri-group-line shrink-0" aria-hidden="true"></i>
            <span class="min-w-0 break-words">{{
              t("games.playerRange", {
                min: game.minPlayers,
                max: game.maxPlayers,
              })
            }}</span>
          </span>
        </template>
      </CatalogCard>
    </section>
  </ContentPage>
</template>
<script setup>
import ContentPage from "@/components/layout/ContentPage.vue";
import CatalogBadge from "@/components/interaction/navigation/CatalogBadge.vue";
import CatalogCard from "@/components/interaction/navigation/CatalogCard.vue";
import { GAMES } from "@/games/catalog";
import { useLocale } from "@/i18n";
const { t } = useLocale();
</script>
