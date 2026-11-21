<template>
  <div class="flex h-full min-h-0 min-w-0 flex-col">
    <SidebarNavigation
      :items="items"
      :panel="sidebarPanel"
      :panel-id="panelId"
      :label="t('fogport.visual.views')"
      @select-panel="selectPanel"
    />
    <ScrollableContainer
      v-show="sidebarPanel === 'players'"
      class="flex-1 lg:is-drawer-close:hidden"
    >
      <section
        :id="`${panelId}-players`"
        role="region"
        :aria-labelledby="`${panelId}-menu-players`"
        class="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-thin lg:is-drawer-close:hidden"
      >
        <PlayerList :game="room.game" :players="room.players" />
      </section>
    </ScrollableContainer>
    <ScrollableContainer
      v-show="sidebarPanel === 'market'"
      class="flex-1 lg:is-drawer-close:hidden"
    >
      <section
        :id="`${panelId}-market`"
        role="region"
        :aria-labelledby="`${panelId}-menu-market`"
        class="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-thin lg:is-drawer-close:hidden"
      >
        <Market :game="room.game" />
      </section>
    </ScrollableContainer>
    <section
      v-show="midDesktop && sidebarPanel === 'hand'"
      :id="`${panelId}-hand`"
      class="min-h-0 flex-1 lg:is-drawer-close:hidden"
      :aria-labelledby="`${panelId}-menu-hand`"
    >
      <div :id="inventoryTargetId" class="flex h-full min-h-0 flex-col"></div>
    </section>
    <ScrollableContainer
      v-show="sidebarPanel === 'history'"
      class="flex-1 lg:is-drawer-close:hidden"
    >
      <section
        :id="`${panelId}-history`"
        role="region"
        :aria-labelledby="`${panelId}-menu-history`"
        class="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-thin lg:is-drawer-close:hidden"
      >
        <History in-context :game="room.game" />
      </section>
    </ScrollableContainer>
    <section
      v-show="sidebarPanel === 'reference'"
      :id="`${panelId}-reference`"
      role="region"
      :aria-labelledby="`${panelId}-menu-reference`"
      class="min-h-0 flex-1 lg:is-drawer-close:hidden"
    >
      <Rulebook in-sidebar class="h-full" />
    </section>
  </div>
</template>

<script setup>
import { computed, useId, watch } from "vue";
import { useMediaQuery } from "@vueuse/core";
import ScrollableContainer from "@/components/layout/ScrollableContainer.vue";
import SidebarNavigation from "../../layout/SidebarNavigation.vue";
import PlayerList from "../display/PlayerList.vue";
import Market from "../display/Market.vue";
import History from "../display/History.vue";
import Rulebook from "../display/Rulebook.vue";
import {
  FOGPORT_MID_DESKTOP_QUERY,
  useFogportLayout,
} from "@/composables/games/fogport/useFogportLayout";
import { useLocale } from "@/i18n";

defineProps({
  room: { type: Object, required: true },
});
const emit = defineEmits(["expand"]);

const { t } = useLocale();
const panelId = `fogport-sidebar-${useId()}`;
const { inventoryTargetId, sidebarPanel, setSidebarPanel, syncMobilePanel } =
  useFogportLayout();

const baseItems = [
  { id: "players", icon: "ri-group-line", label: "fogport.players" },
  { id: "market", icon: "ri-exchange-line", label: "fogport.market" },
  { id: "history", icon: "ri-history-line", label: "fogport.history" },
  {
    id: "reference",
    icon: "ri-book-2-line",
    label: "fogport.visual.reference",
  },
];

const midDesktop = useMediaQuery(FOGPORT_MID_DESKTOP_QUERY);
const items = computed(() =>
  midDesktop.value
    ? [
        { id: "hand", icon: "ri-stack-line", label: "fogport.hand" },
        ...baseItems,
      ]
    : baseItems,
);

function selectPanel(panel) {
  setSidebarPanel(panel);
  syncMobilePanel(panel);
  emit("expand");
}

watch(midDesktop, (value) => {
  if (!value && sidebarPanel.value === "hand") setSidebarPanel("players");
});
</script>
