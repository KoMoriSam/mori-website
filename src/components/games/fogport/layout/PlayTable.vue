<template>
  <div
    v-if="game"
    ref="tableRoot"
    class="flex h-full min-h-0 min-w-0 flex-col gap-2 overflow-hidden pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0"
  >
    <TableHeader
      :game="game"
      :room-players="room.players"
      :active-kind="activeKind"
      :header-actions="headerActions"
      :toolbar-target-id="toolbarTargetId"
      :toolbar-width="toolbarWidth"
      @measure-assets="assetWidth = $event"
    />
    <div
      v-if="game.boardVersion !== BOARD_VERSION"
      class="alert alert-warning shrink-0 text-sm"
      role="status"
    >
      <i class="ri-information-line" aria-hidden="true"></i
      ><span>{{ t("fogport.errors.BOARD_VERSION") }}</span>
    </div>
    <div class="relative flex min-h-0 flex-1 flex-col gap-2 lg:flex-row">
      <section
        v-show="desktop || !mobileHandPanel"
        class="relative flex min-h-0 min-w-0 flex-1 flex-col gap-2"
      >
        <Board
          v-if="game.boardVersion === BOARD_VERSION"
          :id="`${panelId}-board`"
          v-show="desktop || panel === 'board'"
          class="min-h-0 flex-1"
          :game="game"
          :targets="targets"
          :liquidation-offers="activeKind === 'liquidate' ? commands : []"
          :selected-targets="selectedTargets"
          :active-mode="activeKind"
          :hover-target="hoverTarget"
          :dragging="!!ghost"
          @hover="hover"
          @select="boardSelect"
          @drag="startDrag"
        />
        <div
          v-show="
            !headerActions &&
            game.phase === 'turn' &&
            (desktop || panel === 'board')
          "
          class="absolute left-2 right-28 top-2 z-10 w-fit rounded-field bg-base-100/95 p-1 shadow-sm"
        >
          <Teleport
            :to="`#${toolbarTargetId}`"
            :disabled="!headerActions"
            defer
          >
            <ActionToolbar
              :compact="!desktop"
              :icons-only="!headerActions"
              :actions="ACTIONS"
              :can-act="canPlay"
              :active="activeKind"
              @measure="toolbarWidth = $event"
              @action="open"
            />
          </Teleport>
        </div>
        <div
          v-if="mode && (desktop || panel === 'board')"
          :class="
            !headerActions && game.phase === 'turn'
              ? desktop
                ? 'top-14'
                : 'top-12'
              : 'top-2 right-28'
          "
          class="absolute inset-x-2 z-10 flex items-center gap-2 rounded-field border border-success/50 bg-base-100/95 px-2 py-1.5 text-xs shadow-sm"
          role="status"
        >
          <button
            v-if="mode.adding"
            class="btn btn-square btn-xs"
            :aria-label="t('fogport.mode.back')"
            @click="backMode"
          >
            <i class="ri-arrow-left-line" aria-hidden="true"></i></button
          ><i
            :class="ACTION_ICONS[mode.kind]"
            class="text-success"
            aria-hidden="true"
          ></i
          ><span class="min-w-0 flex-1">{{ modeHint }}</span
          ><span
            v-if="activeKind !== 'liquidate'"
            class="hidden gap-2 whitespace-nowrap sm:flex"
            ><span class="text-success"
              ><i class="ri-checkbox-blank-circle-fill" aria-hidden="true"></i>
              {{ t("fogport.mode.legal") }}</span
            ><span class="text-primary"
              ><i class="ri-checkbox-circle-line" aria-hidden="true"></i>
              {{ t("fogport.mode.selected") }}</span
            ></span
          ><span
            v-if="activeKind === 'liquidate' && submitting"
            class="loading loading-spinner loading-xs"
          ></span
          ><button
            v-else-if="activeKind !== 'liquidate'"
            class="btn btn-square btn-xs"
            :aria-label="t('fogport.cancel')"
            @click="clearMode"
          >
            <i class="ri-close-line" aria-hidden="true"></i>
          </button>
        </div>
        <ScrollableContainer
          v-if="!desktop && ['players', 'market', 'history'].includes(panel)"
          class="h-full"
        >
          <section
            :id="`${panelId}-${panel}`"
            class="h-full overflow-y-auto overscroll-contain scrollbar-thin"
          >
            <PlayerList
              v-if="panel === 'players'"
              :game="game"
              :players="room.players"
            /><Market v-else-if="panel === 'market'" :game="game" /><History
              v-else
              in-context
              :game="game"
            />
          </section>
        </ScrollableContainer>
        <ActionReview
          v-if="
            mode?.command &&
            mode.kind !== 'liquidate' &&
            !mode.adding &&
            (desktop || panel === 'board')
          "
          class="absolute inset-x-2 bottom-2 z-30 lg:left-auto lg:w-[calc(100%_-_1rem)] lg:max-w-md"
          :game="game"
          :kind="mode.kind"
          :command="mode.command"
          :can-act="canAct && !ghost"
          :run="runCore"
          :error="error"
          @change="replace"
          @close="clearMode"
          @add="addTarget"
        />
        <section
          v-if="
            activeKind === 'liquidate' &&
            (desktop || panel === 'board') &&
            (liquidationHover || error)
          "
          class="pointer-events-none absolute inset-x-2 bottom-10 z-20 rounded-box border border-warning/40 bg-base-100/95 p-3 text-xs shadow-lg lg:left-auto lg:max-w-sm"
          role="status"
        >
          <template v-if="liquidationHover"
            ><b>{{ liquidationHover.name }}</b>
            <p class="mt-1">
              {{ t("fogport.liquidationDetails", liquidationHover) }}
            </p></template
          >
          <p v-if="error" class="mt-1 text-error" role="alert">{{ error }}</p>
        </section>
        <ActionMenu
          v-if="menu && (desktop || panel === 'board')"
          class="absolute inset-x-2 bottom-2 z-40"
          :title="menu.title"
          :options="menu.options"
          @choose="chooseMenu"
          @close="clearMode"
        />
      </section>
      <Teleport :to="`#${inventoryTargetId}`" :disabled="!midDesktop" defer>
        <InventoryTray
          v-show="showInventoryTray"
          :id="!desktop ? `${panelId}-hand` : undefined"
          v-model:tray="tray"
          :dragging="!!ghost"
          :game="game"
          :selected="selected"
          :active-mode="activeKind"
          :legal-cards="cards"
          :legal-industries="industries"
          :legal-targets="targets"
          :selected-targets="selectedTargets"
          :drag-payload="ghost?.payload"
          :chosen-command="mode?.command"
          :detail="mobileHandPanel"
          :compact="!desktop && !mobileHandPanel"
          :class="
            mobileHandPanel
              ? 'h-full flex-1'
              : 'absolute inset-x-2 bottom-2 z-20 shrink-0 lg:static lg:inset-auto lg:z-auto lg:h-full 2xl:w-90'
          "
          @pick="pick"
          @drag="startDrag"
        />
      </Teleport>
    </div>
    <MobileDock
      :items="panels"
      :panel="panel"
      :panel-id="panelId"
      :label="t('fogport.visual.views')"
      @select-panel="selectPanel"
    />
    <ActionEditor
      v-if="draft && myTurn && game.phase === 'turn'"
      :key="editorKey"
      :game="game"
      :initial="draft"
      :can-act="canAct"
      :run="runCore"
      :error="error"
      @close="clearMode"
    />
    <DragPreview
      :ghost="ghost"
      :game="game"
      :valid="dropValid"
      :hint="dropHint"
    />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, useId, watch } from "vue";
import { useElementSize, useMediaQuery } from "@vueuse/core";
import ScrollableContainer from "@/components/layout/ScrollableContainer.vue";
import MobileDock from "../../layout/MobileDock.vue";
import TableHeader from "./TableHeader.vue";
import ActionToolbar from "../interaction/ActionToolbar.vue";
import Board from "../display/Board.vue";
import InventoryTray from "../interaction/InventoryTray.vue";
import ActionMenu from "../interaction/ActionMenu.vue";
import ActionReview from "../interaction/ActionReview.vue";
import DragPreview from "../interaction/DragPreview.vue";
import PlayerList from "../display/PlayerList.vue";
import Market from "../display/Market.vue";
import History from "../display/History.vue";
import ActionEditor from "../interaction/ActionEditor.vue";
import { BOARD_VERSION } from "../../../../../shared/games/fogport/data.js";
import { ACTIONS } from "../../../../../shared/games/fogport/options.js";
import { ACTION_ICONS } from "@/games/fogport/presentation";
import {
  FOGPORT_DESKTOP_QUERY,
  FOGPORT_MID_DESKTOP_QUERY,
  useFogportLayout,
} from "@/composables/games/fogport/useFogportLayout";
import { useFogportInteraction } from "@/composables/games/fogport/useFogportInteraction";
import { useLocale } from "@/i18n";

const props = defineProps({
  room: { type: Object, required: true },
  canAct: Boolean,
  run: { type: Function, required: true },
  error: { type: String, default: "" },
});

const { t } = useLocale();
const { inventoryTargetId, setSidebarPanel, registerMobilePanelSync } =
  useFogportLayout();

const desktop = useMediaQuery(FOGPORT_DESKTOP_QUERY);
const midDesktop = useMediaQuery(FOGPORT_MID_DESKTOP_QUERY);

watch(
  midDesktop,
  (value) => {
    if (value) setSidebarPanel("hand");
  },
  { immediate: true },
);

const tableRoot = ref(null);
const assetWidth = ref(0);
const toolbarWidth = ref(0);
const { width: tableWidth } = useElementSize(tableRoot);
// Reserve readable player information and divider spacing; measure full labels independently of icon mode.
const headerActions = computed(
  () =>
    desktop.value &&
    toolbarWidth.value > 0 &&
    tableWidth.value >= toolbarWidth.value + assetWidth.value + 240 + 72,
);

const panelId = "fogport-panels-" + useId();
const toolbarTargetId = panelId + "-actions";
const panels = [
  { id: "board", icon: "ri-route-line", label: "fogport.board" },
  { id: "hand", icon: "ri-stack-line", label: "fogport.hand" },
  { id: "players", icon: "ri-group-line", label: "fogport.players" },
  { id: "market", icon: "ri-exchange-line", label: "fogport.market" },
  { id: "history", icon: "ri-history-line", label: "fogport.history" },
];

const {
  game,
  myTurn,
  canPlay,
  panel,
  tray,
  editorKey,
  mode,
  activeKind,
  selected,
  menu,
  draft,
  hoverTarget,
  commands,
  targets,
  cards,
  industries,
  selectedTargets,
  submitting,
  ghost,
  dropValid,
  dropHint,
  liquidationHover,
  modeHint,
  hover,
  replace,
  selectPanel,
  syncPanelFromSidebar,
  open,
  pick,
  chooseMenu,
  boardSelect,
  startDrag,
  runCore,
  backMode,
  addTarget,
  clearMode,
} = useFogportInteraction({
  room: () => props.room,
  canAct: () => props.canAct,
  run: (type, command) => props.run(type, command),
  midDesktop,
  setSidebarPanel,
});

const unregisterPanelSync = registerMobilePanelSync(syncPanelFromSidebar);
onBeforeUnmount(unregisterPanelSync);

const mobileHandPanel = computed(
  () => !desktop.value && panel.value === "hand",
);
const showInventoryTray = computed(
  () =>
    mobileHandPanel.value ||
    (activeKind.value !== "liquidate" &&
      (desktop.value ||
        (panel.value === "board" &&
          (!mode.value?.command || mode.value?.adding)))),
);
</script>
