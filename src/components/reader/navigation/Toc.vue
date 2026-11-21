<template>
  <TocFrame
    ref="tocFrame"
    :mobile="mobile"
    :compact="compact"
    :title="localizeText(resolvedTitle)"
    :progress="progressValue"
    :progress-label="`${progressValue}%`"
    :current-label="activeText"
    :aria-label="translate('reader.body.contents')"
    icon-class="ri-list-unordered"
    @toggle-compact="emit('toggle-compact')"
    @menu-open-change="emit('menu-open-change', $event)"
    @visibility-change="tocVisible = $event"
  >
    <ScrollableContainer :class="mobile ? '' : 'h-full'">
      <ol
        ref="listElement"
        :class="[
          'space-y-0.5 overflow-y-auto overscroll-contain pr-1 scrollbar-none',
          mobile ? 'max-h-[min(55vh,32rem)]' : 'h-full min-h-0',
        ]"
      >
        <li
          v-for="(heading, headingIndex) in resolvedHeadings"
          :key="heading.id"
        >
          <Tooltip
            overflow-only
            placement="bottom"
            align="start"
            as="button"
            trigger-class=""
            type="button"
            :text="heading.text"
            :aria-label="heading.text"
            :aria-current="heading.id === resolvedActiveId ? 'location' : undefined"
            :data-current="heading.id === resolvedActiveId ? 'true' : undefined"
            class="block w-full rounded-lg py-1.5 pr-2 text-left text-sm leading-snug transition-[background-color,color,opacity] duration-150"
            :class="[
              heading.level === 1 ? 'pl-2 font-bold' : '',
              heading.level === 2 ? 'pl-4 font-medium' : '',
              heading.level === 3 ? 'pl-6 text-xs' : '',
              heading.level >= 4 ? 'pl-8 font-light text-xs' : '',
              heading.id === resolvedActiveId
                ? 'border-primary bg-primary/10 text-primary font-black!'
                : 'border-transparent text-base-content/80 hover:bg-base-200 hover:text-base-content',
              isRead(headingIndex) && heading.id !== resolvedActiveId
                ? 'opacity-50 hover:opacity-80'
                : '',
            ]"
            @click="selectHeading(heading.id)"
          >
            {{ heading.text }}
          </Tooltip>
        </li>
      </ol>
    </ScrollableContainer>
  </TocFrame>
</template>

<script setup>
import { computed, ref } from "vue";

import Tooltip from "@/components/display/Tooltip.vue";
import ScrollableContainer from "@/components/layout/ScrollableContainer.vue";
import TocFrame from "@/components/reader/navigation/TocFrame.vue";
import { useReadingLayoutContext } from "@/composables/reader/useReadingLayoutContext";
import { useRevealCurrentItem } from "@/composables/useRevealCurrentItem";
import { useLocale } from "@/i18n";

const props = defineProps({
  mobile: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
  title: { type: String, default: undefined },
  headings: { type: Array, default: undefined },
  activeId: { type: String, default: undefined },
  progress: { type: Number, default: undefined },
});

const emit = defineEmits(["select", "toggle-compact", "menu-open-change"]);

const { t: translate, text: localizeText } = useLocale();
const layoutContext = useReadingLayoutContext();

const resolvedTitle = computed(
  () => props.title ?? layoutContext?.tocTitle.value ?? "阅读进度",
);
const resolvedHeadings = computed(
  () => props.headings ?? layoutContext?.headings.value ?? [],
);
const resolvedActiveId = computed(
  () => props.activeId ?? layoutContext?.activeHeadingId.value ?? "",
);
const resolvedProgress = computed(
  () => props.progress ?? layoutContext?.readingProgress.value ?? 0,
);

const tocFrame = ref(null);
const listElement = ref(null);
const tocVisible = ref(!props.mobile);

useRevealCurrentItem({
  containerRef: listElement,
  currentKey: resolvedActiveId,
  enabled: tocVisible,
});

const activeIndex = computed(() =>
  resolvedHeadings.value.findIndex(
    (heading) => heading.id === resolvedActiveId.value,
  ),
);
const activeText = computed(
  () =>
    resolvedHeadings.value.find(
      (heading) => heading.id === resolvedActiveId.value,
    )?.text,
);
const progressValue = computed(() =>
  Math.min(100, Math.max(0, Math.round(resolvedProgress.value || 0))),
);

const isRead = (headingIndex) => activeIndex.value > headingIndex;

const selectHeading = (id) => {
  if (layoutContext) {
    layoutContext.scrollToHeading(id);
  }
  emit("select", id);
  tocFrame.value?.closeMenu();
};
</script>
