<template>
  <CatalogCard
    class="cursor-pointer"
    data-project-card=""
    data-card-motion="card"
    :layout="expanded ? 'default' : 'compact'"
    :title="title"
    :title-tag="titleTag"
    :description="description"
    :cover="resolvedCover"
    :tags="tags"
    :action="action"
  >
    <template #header-before="{ detailsId }">
      <input
        type="radio"
        :name="groupName"
        :value="value"
        :checked="expanded"
        :disabled="expanded"
        :aria-label="title"
        :aria-expanded="expanded"
        :aria-controls="detailsId"
        class="peer absolute inset-0 z-20 size-full cursor-pointer opacity-0"
        @change="$emit('select')"
      />
    </template>

    <template v-if="$slots.meta" #meta>
      <slot name="meta"></slot>
    </template>

    <template #overlay>
      <RouterLink
        v-if="expanded"
        :to="to"
        :aria-label="title"
        class="absolute inset-0 z-30 focus-visible:outline-none"
      />
    </template>
  </CatalogCard>
</template>

<script setup>
import { computed, provide } from "vue";
import { RouterLink } from "vue-router";
import CatalogCard from "./CatalogCard.vue";
import { CATALOG_CARD_INTERACTION_KEY } from "./catalog-card-context";

const props = defineProps({
  expanded: Boolean,
  groupName: { type: String, required: true },
  value: { type: String, required: true },
  to: { type: [String, Object], required: true },
  title: { type: String, default: "" },
  titleTag: {
    type: String,
    default: "h4",
    validator: (value) => ["h2", "h3", "h4", "div"].includes(value),
  },
  description: { type: String, default: "" },
  action: { type: String, default: "" },
  tags: { type: Array, default: () => [] },
  cover: { type: [String, Object], default: "" },
});

defineEmits(["select"]);

provide(CATALOG_CARD_INTERACTION_KEY, {
  interactiveOverlay: true,
  hideActionsWhenCompact: true,
});

const resolvedCover = computed(() =>
  typeof props.cover === "string"
    ? { src: props.cover, fixedSizes: true }
    : { ...props.cover, fixedSizes: true },
);
</script>
