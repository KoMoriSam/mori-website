<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="translate-y-2 opacity-0"
    enter-to-class="translate-y-0 opacity-100"
    leave-active-class="transition duration-150 ease-in"
    leave-from-class="translate-y-0 opacity-100"
    leave-to-class="translate-y-2 opacity-0"
  >
    <div
      v-if="visible"
      class="pointer-events-none inset-0 grid place-items-center"
      :class="isPaged ? 'absolute z-20' : 'fixed z-40'"
    >
      <button
        type="button"
        data-reader-interactive
        :aria-label="translate(isPaged ? 'reader.paged.help' : 'reader.scroll.help')"
        class="alert alert-soft pointer-events-auto block w-[calc(100%-1.5rem)] max-w-sm cursor-pointer border border-base-300 bg-base-100/95 p-3 text-left text-sm shadow-lg backdrop-blur-md"
        @pointerdown.stop
        @click.stop="emit('dismiss')"
      >
        <span class="block w-full">
          <span class="flex items-baseline justify-between gap-3">
            <span class="text-sm font-semibold">{{
              translate("reader.paged.controls")
            }}</span>
            <span class="text-[0.6875rem] text-base-content/45">
              {{ translate("reader.paged.dismissHint") }}
            </span>
          </span>

          <span class="mt-2.5 grid grid-cols-2 gap-2">
            <span
              v-for="item in hintCards"
              :key="item.titleKey"
              class="rounded-box bg-base-200/75 px-2.5 py-2 text-center"
            >
              <i
                :class="item.icon"
                class="block text-xl leading-none text-base-content/75"
                aria-hidden="true"
              ></i>
              <span class="mt-1.5 block text-xs font-semibold">
                {{ translate(item.titleKey) }}
              </span>
              <span class="mt-0.5 block text-[0.6875rem] text-base-content/55">
                {{ translate(item.line1Key) }}<br />{{ translate(item.line2Key) }}
              </span>
            </span>
          </span>

          <span
            class="mt-2.5 flex items-baseline gap-2 border-t border-base-300 pt-2 text-xs"
          >
            <span class="shrink-0 font-semibold">{{
              translate("reader.paged.moreControls")
            }}</span>
            <span class="text-base-content/60">
              {{ translate("reader.paged.zonesHint") }}
            </span>
          </span>
        </span>
      </button>
    </div>
  </Transition>
</template>

<script setup>
import { computed } from "vue";
import { useLocale } from "@/i18n";

const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
  mode: {
    type: String,
    default: "paged",
    validator: (value) => ["paged", "scroll"].includes(value),
  },
});

const emit = defineEmits(["dismiss"]);

const { t: translate } = useLocale();
const isPaged = computed(() => props.mode === "paged");

const TAP_ACTIONS_CARD = {
  icon: "ri-grid-line",
  titleKey: "reader.paged.tapActions",
  line1Key: "reader.paged.centerHint",
  line2Key: "reader.paged.edgeHint",
};

const hintCards = computed(() =>
  isPaged.value
    ? [
        TAP_ACTIONS_CARD,
        {
          icon: "ri-drag-move-line",
          titleKey: "reader.paged.swipe",
          line1Key: "reader.paged.textArea",
          line2Key: "reader.paged.swipeHint",
        },
      ]
    : [
        {
          icon: "ri-arrow-up-down-line",
          titleKey: "reader.scroll.scroll",
          line1Key: "reader.paged.textArea",
          line2Key: "reader.scroll.swipeHint",
        },
        TAP_ACTIONS_CARD,
      ],
);
</script>
