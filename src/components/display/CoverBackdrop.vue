<template>
  <div
    class="pointer-events-none absolute inset-0"
    :class="isHero ? 'bg-linear-to-br from-accent/25 to-primary/20' : ''"
    aria-hidden="true"
  >
    <div
      class="absolute rounded-full"
      :class="
        isHero
          ? '-top-20 -right-16 size-64 bg-primary/15 blur-3xl'
          : '-top-14 -right-10 size-40 bg-primary/10 blur-2xl'
      "
    ></div>
    <div
      class="absolute rounded-full"
      :class="
        isHero
          ? '-bottom-24 -left-16 size-72 bg-accent/20 blur-3xl'
          : '-bottom-16 -left-10 size-44 bg-accent/15 blur-2xl'
      "
    ></div>
    <i
      :class="[
        icon,
        isHero
          ? 'top-6 right-6 text-8xl sm:top-8 sm:right-8 sm:text-9xl'
          : 'top-4 right-5 text-7xl',
      ]"
      class="absolute text-base-content/5"
    ></i>
    <div
      class="absolute inset-0 bg-[radial-gradient(currentColor_1px,transparent_1px)] opacity-[0.04]"
      :class="isHero ? 'bg-size-[18px_18px]' : 'bg-size-[16px_16px]'"
    ></div>
  </div>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  icon: { type: String, default: "ri-article-line" },
  variant: {
    type: String,
    default: "card",
    validator: (value) => ["card", "hero"].includes(value),
  },
});

const isHero = computed(() => props.variant === "hero");
</script>
