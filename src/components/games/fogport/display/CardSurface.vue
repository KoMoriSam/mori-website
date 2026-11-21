<template>
  <div
    class="relative isolate flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-neutral text-left text-neutral-content"
  >
    <div class="absolute inset-0 flex">
      <ArtImage
        v-for="art in artwork"
        :key="art.asset"
        :asset="art.asset"
        :label="art.label"
        :icon="art.icon"
        :fit="fit"
        class="min-h-0 min-w-0 flex-1 self-stretch text-neutral-content/40"
      />
    </div>
    <!-- Reserve readable artwork space without splitting the illustration into two panels. -->
    <div v-if="natural" class="pointer-events-none aspect-square shrink-0" aria-hidden="true"></div>
    <Tooltip
      as="div"
      trigger-class="block"
      :text="title"
      :disabled="!title"
      placement="top"
      align="start"
      class="z-10 shrink-0 bg-linear-to-t from-neutral/95 via-neutral/75 to-transparent px-2 pb-2 pt-10 text-neutral-content"
      :class="natural ? 'relative -mt-10' : 'absolute inset-x-0 bottom-0'"
    >
      <slot />
    </Tooltip>
    <slot name="overlay" />
  </div>
</template>
<script setup>
import Tooltip from "@/components/display/Tooltip.vue";
import ArtImage from "./ArtImage.vue";
defineProps({
  artwork: { type: Array, required: true },
  title: String,
  fit: { type: String, default: "cover" },
  natural: Boolean,
});
</script>
