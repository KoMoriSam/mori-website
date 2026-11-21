<template>
  <div
    :id="`${idPrefix}-suggestions`"
    class="absolute inset-x-0 top-full overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-xl"
    role="listbox"
    :aria-label="header.ariaLabel"
  >
    <div
      class="flex shrink-0 items-center justify-between gap-3 border-b border-base-300 bg-base-200/45 px-3 py-2 text-xs text-base-content/55"
    >
      <span class="flex items-center gap-1.5">
        <i :class="header.icon" aria-hidden="true"></i>
        {{ header.label }}
      </span>
      <span class="hidden sm:inline">
        <kbd class="kbd kbd-xs">↑</kbd><kbd class="kbd kbd-xs">↓</kbd>
        {{ translate("common.search.selectHint") }}
        <kbd class="kbd kbd-xs">Enter</kbd>
        {{ translate("common.search.confirmHint") }}
        <kbd class="kbd kbd-xs">Esc</kbd>
        {{ translate("common.modal.close") }}
      </span>
    </div>

    <ScrollableContainer v-if="hasOptions" :class="scrollableClass">
      <ul :class="listClass">
        <li v-for="group in groups" :key="group.key" role="presentation">
          <div
            v-if="group.label"
            class="flex items-center gap-2 px-3 pb-1 pt-2 text-xs font-semibold text-base-content/45"
          >
            <i class="ri-folder-3-line" aria-hidden="true"></i>
            <span class="min-w-0 flex-1 truncate">
              {{ group.label }}
            </span>
            <span class="shrink-0 font-normal text-base-content/40">
              {{ group.countText }}
            </span>
          </div>
          <ul
            class="space-y-0.5"
            :role="group.label ? 'group' : 'presentation'"
            :aria-label="group.label || null"
          >
            <li
              v-for="option in group.options"
              :key="`${option.type}-${option.value}`"
              role="presentation"
            >
              <button
                :id="`${idPrefix}-option-${option.index}`"
                type="button"
                role="option"
                :aria-label="option.ariaLabel"
                :aria-selected="activeIndex === option.index"
                class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors"
                :class="[
                  activeIndex === option.index
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-base-200',
                  group.label ? 'pl-5' : '',
                ]"
                @mouseenter="emit('update:activeIndex', option.index)"
                @mousedown.prevent="emit('select', option)"
              >
                <span
                  class="flex size-7 shrink-0 items-center justify-center text-sm text-base-content/40"
                  :class="
                    group.label
                      ? ''
                      : 'rounded-md bg-base-200 font-mono text-base-content/55'
                  "
                  aria-hidden="true"
                >
                  <i
                    v-if="group.label"
                    class="ri-corner-down-right-line"
                  ></i>
                  <template v-else>{{ option.prefix }}</template>
                </span>
                <span class="min-w-0 flex-1 truncate font-medium">
                  {{ option.displayLabel ?? option.label }}
                </span>
                <span class="text-xs text-base-content/40">
                  {{ option.countText }}
                </span>
              </button>
            </li>
          </ul>
        </li>
      </ul>
    </ScrollableContainer>

    <p v-else class="px-4 py-8 text-center text-sm text-base-content/50">
      {{ emptyText }}
    </p>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useLocale } from "@/i18n";
import ScrollableContainer from "@/components/layout/ScrollableContainer.vue";

const props = defineProps({
  idPrefix: {
    type: String,
    required: true,
  },
  header: {
    type: Object,
    required: true,
  },
  groups: {
    type: Array,
    default: () => [],
  },
  activeIndex: {
    type: Number,
    default: -1,
  },
  emptyText: {
    type: String,
    default: "",
  },
  scrollableClass: {
    type: String,
    default: "",
  },
  listClass: {
    type: String,
    default: "max-h-72 space-y-1 overflow-y-auto overscroll-contain p-1.5",
  },
});

const emit = defineEmits(["select", "update:activeIndex"]);
const { t: translate } = useLocale();

const hasOptions = computed(() =>
  props.groups.some((group) => group.options.length > 0),
);
</script>
