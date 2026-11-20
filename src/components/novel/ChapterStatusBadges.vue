<template>
  <span v-if="showLatest" class="badge badge-warning badge-xs shrink-0">
    {{ localizeText(latestLabel) }}
  </span>
  <Tooltip placement="bottom" align="end" as="span" trigger-class="inline-flex"
    v-if="chapter.modifiedDate"
    class="badge badge-info badge-xs shrink-0"
    :text="translate('reader.badges.revisedHint')" :aria-label="translate('reader.badges.revisedHint')"
  >
    {{ localizeText(revisionLabel) }}
  </Tooltip>
  <Tooltip placement="bottom" align="end" as="span" trigger-class="inline-flex"
    v-else
    class="badge badge-ghost badge-xs shrink-0"
    :text="translate('reader.badges.originalHint')" :aria-label="translate('reader.badges.originalHint')"
  >
    {{ translate('reader.badges.original') }}
  </Tooltip>
  <span v-if="showRecent" class="badge badge-warning badge-xs shrink-0">
    {{ recentLabel }}
  </span>
</template>

<script setup>
import Tooltip from "@/components/display/Tooltip.vue";

import { useLocale } from '@/i18n';
const { t: translate, text: localizeText } = useLocale();

import { computed } from "vue";

const props = defineProps({
  chapter: {
    type: Object,
    required: true,
  },
  latestChapterUuid: {
    type: String,
    default: "",
  },
  read: {
    type: Boolean,
    default: false,
  },
  recent: {
    type: Boolean,
    default: false,
  },
  latestLabel: {
    type: String,
    default: "最新",
  },
  revisionLabel: {
    type: String,
    default: "有修订",
  },
  recentLabel: {
    type: String,
    default: "NEW",
  },
});

const isLatest = computed(() => props.chapter.uuid === props.latestChapterUuid);
const showLatest = computed(() => isLatest.value && !props.read);
const showRecent = computed(
  () => props.recent && !isLatest.value && !props.read,
);
</script>
