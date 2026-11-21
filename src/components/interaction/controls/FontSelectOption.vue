<template>
  <button
    class="btn btn-sm btn-block relative shrink-0 justify-start ps-7.5 font-normal before:pointer-events-none before:absolute before:left-4 before:font-mono before:opacity-0 before:content-['✓']"
    :class="[font.style, selected ? 'btn-active before:opacity-100' : 'btn-ghost']"
    :style="previewStyle"
    type="button"
    role="option"
    :aria-selected="selected"
    :aria-posinset="position?.index"
    :aria-setsize="position?.size"
    @click="$emit('select', font.id)"
  >
    <span class="min-w-0 truncate">{{ font.label }}</span>
    <span
      v-if="showPreview"
      class="ml-auto shrink-0"
      :style="sampleStyle"
      :lang="preview.language"
      aria-hidden="true"
      >{{ preview.text }}</span
    >
  </button>
</template>

<script setup>
import { computed } from "vue";
import {
  getFontLanguagePreview,
  getFontPreviewStyle,
  shouldShowFontPreview,
} from "@/utils/font-name";

const props = defineProps({
  font: { type: Object, required: true },
  selected: Boolean,
  position: { type: Object, default: null },
});

defineEmits(["select"]);

const previewStyle = computed(() => getFontPreviewStyle(props.font));
const sampleStyle = computed(() => getFontPreviewStyle(props.font, true));
const showPreview = computed(() => shouldShowFontPreview(props.font));
const preview = computed(() => getFontLanguagePreview(props.font));
</script>
