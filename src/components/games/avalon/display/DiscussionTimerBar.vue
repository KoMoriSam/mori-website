<template>
  <div class="shrink-0 items-center gap-2" :class="displayClass">
    <DiscussionTimer
      class="min-w-0 flex-1"
      :discussion="discussion"
      :server-now="serverNow"
    />
    <button
      v-if="canEnd"
      type="button"
      class="btn shrink-0"
      :disabled="!canAct"
      @click="emit('end')"
    >
      {{ t("avalon.discussionTimer.endEarly") }}
    </button>
  </div>
</template>

<script setup>
import { useLocale } from "@/i18n";
import DiscussionTimer from "./DiscussionTimer.vue";

defineProps({
  discussion: { type: Object, default: null },
  serverNow: { type: Number, default: undefined },
  canEnd: Boolean,
  canAct: Boolean,
  displayClass: { type: String, default: "flex" },
});
const emit = defineEmits(["end"]);
const { t } = useLocale();
</script>
