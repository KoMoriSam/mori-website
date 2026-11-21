<template>
  <span
    class="badge badge-sm h-auto min-h-5 max-w-full py-0.5 transition-colors duration-300 motion-reduce:transition-none"
    :class="
      isOverlay
        ? [
            'border-white/20 bg-black/20 text-white backdrop-blur-sm',
            isResponsiveCompact
              ? 'max-md:border-transparent max-md:bg-primary/8 max-md:text-primary max-md:backdrop-blur-none'
              : '',
          ]
        : 'badge-primary badge-soft'
    "
  >
    <i v-if="icon" :class="icon" class="shrink-0" aria-hidden="true"></i>
    <span class="min-w-0 wrap-break-word"><slot></slot></span>
  </span>
</template>

<script setup>
import { computed, inject } from "vue";
import { CATALOG_CARD_CONTEXT_KEY } from "./catalog-card-context";

const props = defineProps({
  overlay: { type: Boolean, default: undefined },
  responsiveCompact: { type: Boolean, default: undefined },
  icon: { type: String, default: "" },
});

const cardContext = inject(CATALOG_CARD_CONTEXT_KEY, null);
const isOverlay = computed(() =>
  props.overlay !== undefined
    ? props.overlay
    : Boolean(cardContext?.overlay.value),
);
const isResponsiveCompact = computed(() =>
  props.responsiveCompact !== undefined
    ? props.responsiveCompact
    : Boolean(cardContext?.responsiveCompact.value),
);
</script>
