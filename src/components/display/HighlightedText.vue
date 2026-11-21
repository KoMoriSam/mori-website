<template>
  <template v-for="(part, index) in parts" :key="`${part.text}-${index}`">
    <mark v-if="part.match" :class="markClass">{{ part.text }}</mark>
    <template v-else>{{ part.text }}</template>
  </template>
</template>

<script setup>
import { computed } from "vue";
import { splitArticleHighlight } from "@/utils/blog/article-fields";

const props = defineProps({
  text: {
    type: String,
    default: "",
  },
  keyword: {
    type: String,
    default: "",
  },
  markClass: {
    type: String,
    default: "rounded-sm bg-primary/75 px-0.5 text-primary-content",
  },
});

const parts = computed(() => splitArticleHighlight(props.text, props.keyword));
</script>
