<template>
  <div class="flex h-full min-h-0 min-w-0 flex-col">
    <SidebarNavigation
      :items="navigationItems"
      :panel="sidebarPanel"
      :panel-id="panelId"
      :label="t('avalon.mobile.navigation')"
      @select-panel="selectPanel"
    />
    <div
      ref="discussionPanel"
      :id="`${panelId}-discussion`"
      role="region"
      :aria-labelledby="`${panelId}-menu-discussion`"
      class="min-h-0 flex-1 lg:is-drawer-close:hidden"
      :class="sidebarPanel === 'discussion' ? '' : 'hidden'"
      @focusin="clearUnread"
    >
      <Discussion
        :room="gameRoom"
        :can-act="canAct && canSpeak"
        :active="sidebarPanel === 'discussion'"
        compact
        :run="run"
      >
        <template #discussion-timer>
          <DiscussionTimerBar
            v-if="
              midDesktop &&
              ['discussion', 'evil_discussion'].includes(gameRoom.phase)
            "
            :discussion="gameRoom.discussion"
            :server-now="gameRoom.serverNow"
            :can-end="canEndDiscussion"
            :can-act="canAct"
            @end="endCurrentDiscussion"
          />
        </template>
      </Discussion>
    </div>
    <ScrollableContainer
      class="flex-1 lg:is-drawer-close:hidden"
      :class="sidebarPanel === 'history' ? '' : 'hidden'"
    >
      <section
        :id="`${panelId}-history`"
        role="region"
        :aria-labelledby="`${panelId}-menu-history`"
        class="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-thin lg:is-drawer-close:hidden"
        :class="sidebarPanel === 'history' ? '' : 'hidden'"
      >
        <div class="min-w-0">
          <p
            v-if="!gameRoom.history.length"
            class="py-5 text-sm text-base-content/50"
          >
            {{ t("avalon.mobile.historyEmpty") }}
          </p>
          <ol class="space-y-4">
            <li
              v-for="quest in recordedQuests"
              :key="quest"
              class="min-w-0 border-t border-base-300 pt-4 first:border-t-0 first:pt-0"
            >
              <QuestHistory :room="gameRoom" :quest="quest" />
            </li>
          </ol>
        </div>
      </section>
    </ScrollableContainer>
    <section
      :id="`${panelId}-players`"
      role="region"
      :aria-labelledby="`${panelId}-menu-players`"
      class="min-h-0 flex-1 flex-col lg:is-drawer-close:hidden"
      :class="midDesktop && sidebarPanel === 'players' ? 'flex' : 'hidden'"
    >
      <div
        :id="playersTargetId"
        class="flex min-h-0 min-w-0 flex-1 flex-col"
      ></div>
    </section>
    <section
      :id="`${panelId}-reference`"
      role="region"
      :aria-labelledby="`${panelId}-menu-reference`"
      class="min-h-0 flex-1 lg:is-drawer-close:hidden"
      :class="sidebarPanel === 'reference' ? '' : 'hidden'"
    >
      <ReferenceContent :room="room" in-sidebar />
    </section>
  </div>
</template>

<script setup>
import { computed, ref, useId, watch } from "vue";
import { useMediaQuery } from "@vueuse/core";
import ScrollableContainer from "@/components/layout/ScrollableContainer.vue";
import { useLocale } from "@/i18n";
import {
  AVALON_MID_DESKTOP_QUERY,
  useAvalonLayout,
} from "@/composables/games/avalon/useAvalonLayout";
import {
  useAvalonRoom,
  useAvalonUnread,
} from "@/composables/games/avalon/useAvalonRoom";
import SidebarNavigation from "../../layout/SidebarNavigation.vue";
import DiscussionTimerBar from "../display/DiscussionTimerBar.vue";
import QuestHistory from "../display/QuestHistory.vue";
import ReferenceContent from "../display/ReferenceContent.vue";
import Discussion from "../interaction/Discussion.vue";

const props = defineProps({
  room: { type: Object, required: true },
  canAct: Boolean,
  run: { type: Function, required: true },
});
const emit = defineEmits(["expand"]);

const { t } = useLocale();
const panelId = `avalon-sidebar-${useId()}`;
const midDesktop = useMediaQuery(AVALON_MID_DESKTOP_QUERY);
const {
  playersTargetId,
  sidebarPanel,
  setSidebarPanel,
  endCurrentDiscussion,
} = useAvalonLayout();

const {
  room: gameRoom,
  recordedQuests,
  canSpeak,
  canEndDiscussion,
} = useAvalonRoom(() => props.room);

function selectPanel(panel) {
  setSidebarPanel(panel);
  emit("expand");
}

const discussionPanel = ref(null);
const { unread, clearUnread } = useAvalonUnread(gameRoom, {
  shouldSkip: () =>
    sidebarPanel.value === "discussion" &&
    !import.meta.env.SSR &&
    discussionPanel.value?.contains(document.activeElement),
  onReset: () => selectPanel("discussion"),
});

watch(midDesktop, (isMidDesktop) => {
  if (!isMidDesktop && sidebarPanel.value === "players")
    selectPanel("discussion");
});

const menuItems = [
  { id: "players", icon: "ri-group-line", label: "avalon.mobile.players" },
  {
    id: "discussion",
    icon: "ri-user-voice-line",
    label: "avalon.mobile.discussion",
  },
  { id: "history", icon: "ri-history-line", label: "avalon.mobile.history" },
  { id: "reference", icon: "ri-book-2-line", label: "avalon.reference" },
];
const visibleMenuItems = computed(() =>
  midDesktop.value
    ? menuItems
    : menuItems.filter((item) => item.id !== "players"),
);
const navigationItems = computed(() =>
  visibleMenuItems.value.map((item) => ({
    ...item,
    badge: item.id === "discussion" ? unread.value : 0,
    badgeLabel: t("avalon.phrases.unread", { n: unread.value }),
  })),
);
</script>
