import { computed, onBeforeUnmount, onMounted, ref, toValue, watch } from "vue";
import { BOARD_VERSION } from "../../../../shared/games/fogport/data.js";
import {
  actorId,
  previewAction,
} from "../../../../shared/games/fogport/engine.js";
import {
  ACTIONS,
  legalActions,
  unavailableReason,
} from "../../../../shared/games/fogport/options.js";
import {
  CORE_ACTIONS,
  cardName,
  placeName,
  tileName,
} from "@/games/fogport/presentation";
import {
  buildTargetFilter,
  findBuildingAt,
  findBuildingById,
  formatDropObject,
  formatModeHint,
  parseDropTarget,
} from "@/games/fogport/interaction";
import {
  actionFilterFor,
  useActionMode,
} from "@/composables/games/fogport/useActionMode";
import { usePointerDrag } from "@/composables/games/fogport/usePointerDrag";
import { useToast } from "@/composables/useToast";
import { useLocale } from "@/i18n";

const SIDEBAR_SYNC_PANELS = new Set(["players", "market", "history", "hand"]);
const DEFAULT_DRAG_KIND = {
  card: "build",
  industry: "build",
  building: "sell",
  link: "network",
};

export function useFogportInteraction({
  room,
  canAct,
  run,
  midDesktop = () => false,
  setSidebarPanel = () => {},
}) {
  const { t } = useLocale();
  const toast = useToast({
    position: "center-top",
    duration: 2800,
    closable: false,
    soft: true,
  });

  const panel = ref("board");
  const tray = ref("cards");
  const editorKey = ref(0);

  const game = computed(() => toValue(room).game);
  const selfId = computed(() => toValue(room).selfId);
  const self = computed(() =>
    game.value.players.find((player) => player.id === selfId.value),
  );
  const myTurn = computed(() => actorId(game.value) === selfId.value);
  const canPlay = computed(
    () =>
      Boolean(toValue(canAct)) && myTurn.value && game.value.phase === "turn",
  );
  const focusHandSidebar = () => {
    if (toValue(midDesktop)) setSidebarPanel("hand");
  };

  const action = useActionMode(game, selfId);

  function guard(kind = "turn") {
    if (game.value.boardVersion !== BOARD_VERSION) {
      toast.warning(t("fogport.errors.BOARD_VERSION"));
      return false;
    }
    if (action.submitting.value) {
      toast.warning(t("fogport.mode.pending"));
      return false;
    }
    if (!toValue(canAct)) {
      toast.warning(t("fogport.ui.offline"));
      return false;
    }
    const allowed =
      kind === "liquidate"
        ? myTurn.value && action.activeKind.value === "liquidate"
        : canPlay.value;
    if (!allowed) {
      toast.warning(t("fogport.errors.TURN"));
      return false;
    }
    return true;
  }

  function warn(kind, filter = {}) {
    toast.warning(
      t(
        "fogport.errors." +
          unavailableReason(game.value, selfId.value, kind, filter),
      ),
    );
  }

  function request(kind, filter = {}, selection = null) {
    if (!action.begin(kind, filter, selection)) {
      warn(kind, filter);
      return false;
    }
    if (CORE_ACTIONS.includes(kind)) {
      panel.value = "board";
      if (["build", "develop", "sell"].includes(kind)) {
        tray.value = "industry";
        focusHandSidebar();
      }
    } else {
      editorKey.value++;
    }
    return true;
  }

  function failureReason(target) {
    const currentMode = action.mode.value;
    if (!currentMode || !action.acceptsTarget(target)) {
      return t("fogport.mode.invalidObject");
    }
    if (
      currentMode.adding ||
      (currentMode.kind === "sell" && currentMode.building)
    ) {
      return t("fogport.mode.invalidObject");
    }
    const filter = buildTargetFilter(currentMode.filter, target);
    return t(
      "fogport.errors." +
        unavailableReason(game.value, selfId.value, currentMode.kind, filter),
    );
  }

  function drop(payload, value) {
    if (!guard()) return false;
    const target = parseDropTarget(game.value, action.mode.value?.kind, value);
    if (!target || !action.matching(target).length) {
      toast.warning(
        target ? failureReason(target) : t("fogport.mode.invalidDrop"),
      );
      return false;
    }
    return action.chooseTarget(target);
  }

  const {
    ghost,
    start: startDrag,
    cancel,
    clickAllowed,
  } = usePointerDrag(
    drop,
    (payload) => {
      if (!guard()) return false;
      if (!action.acceptsPayload(payload)) {
        toast.warning(t("fogport.mode.invalidObject"));
        return false;
      }
      const kind = action.mode.value?.kind ?? DEFAULT_DRAG_KIND[payload.kind];
      if (!action.beginDrag(payload)) {
        warn(kind, actionFilterFor(kind, payload));
        return false;
      }
      panel.value = "board";
      focusHandSidebar();
      return true;
    },
    (position) =>
      action.dragOver(
        position
          ? parseDropTarget(
              game.value,
              action.mode.value?.kind,
              position.value,
            )
          : null,
      ),
    action.finishDrag,
  );

  function selectPanel(value) {
    if (value === "reference" || ghost.value) return;
    panel.value = value;
    if (SIDEBAR_SYNC_PANELS.has(value)) setSidebarPanel(value);
  }

  function syncPanelFromSidebar(value) {
    if (value === "reference" || ghost.value) return;
    panel.value = value;
  }

  function open(kind) {
    if (!clickAllowed() || !guard()) return;
    if (action.activeKind.value === kind) {
      clearMode();
      return;
    }
    request(kind);
  }

  function pick(payload) {
    if (!clickAllowed() || !guard()) return;
    if (!action.acceptsPayload(payload)) {
      toast.warning(t("fogport.mode.invalidObject"));
      return;
    }
    const currentMode = action.mode.value;
    if (currentMode && payload.kind === "card") {
      if (!action.chooseCard(payload.id)) {
        toast.warning(t("fogport.mode.invalidObject"));
      }
      return;
    }
    if (
      currentMode &&
      payload.kind === "industry" &&
      ["build", "develop"].includes(currentMode.kind)
    ) {
      if (!action.chooseIndustry(payload.industry)) {
        warn(currentMode.kind, actionFilterFor(currentMode.kind, payload));
        return;
      }
      if (action.mode.value.command) panel.value = "board";
      return;
    }
    if (currentMode) {
      if (!action.chooseTarget(payload)) {
        toast.warning(t("fogport.mode.invalidObject"));
      }
      return;
    }
    const kinds =
      payload.kind === "industry"
        ? ["build", "develop"]
        : payload.kind === "building"
          ? ["sell"]
          : ACTIONS;
    const options = kinds.flatMap((kind) => {
      const filter = actionFilterFor(kind, payload);
      return legalActions(game.value, selfId.value, kind, filter).length
        ? [{ kind, filter }]
        : [];
    });
    if (!options.length) {
      warn(kinds[0], actionFilterFor(kinds[0], payload));
      return;
    }
    if (options.length === 1) {
      request(options[0].kind, options[0].filter, payload);
      return;
    }
    panel.value = "board";
    action.inspect(
      payload,
      payload.kind === "card"
        ? cardName(
            self.value.hand.find((card) => card.id === payload.id),
            t,
          )
        : tileName(self.value.inventory[payload.industry]?.[0], t),
      options,
    );
  }

  function chooseMenu(option) {
    if (guard()) request(option.kind, option.filter, action.selected.value);
  }

  function boardSelect(target) {
    if (!clickAllowed()) return;
    if (action.activeKind.value === "liquidate") {
      void liquidate(
        target.kind === "slot"
          ? parseDropTarget(
              game.value,
              "liquidate",
              `slot:${target.location}:${target.slot}`,
            )
          : target,
      );
      return;
    }
    if (!guard()) return;
    if (action.context.value.kind === "idle") {
      if (target.kind === "slot") {
        const tile = findBuildingAt(game.value, target.location, target.slot);
        if (tile?.owner === selfId.value && !tile.flipped) {
          request(
            "sell",
            { building: tile.id },
            { kind: "building", id: tile.id },
          );
          return;
        }
        request("build", { location: target.location, slot: target.slot });
      } else if (target.kind === "link") {
        if (request("network")) action.chooseTarget(target);
      } else if (target.kind === "place" && !target.id.startsWith("p")) {
        request("build", { location: target.id });
      } else if (target.kind === "merchant") {
        request("sell", { merchant: target.id });
      } else {
        toast.warning(t("fogport.mode.chooseAction"));
      }
      return;
    }
    if (target.kind === "slot" && action.mode.value?.kind === "sell") {
      const tile = findBuildingAt(game.value, target.location, target.slot);
      target = tile ? { kind: "building", id: tile.id } : target;
    }
    if (!action.chooseTarget(target)) toast.warning(failureReason(target));
  }

  const dropRows = computed(() =>
    action.dragTarget.value ? action.matching(action.dragTarget.value) : [],
  );
  const dropValid = computed(() => dropRows.value.length > 0);
  const dropHint = computed(() => {
    if (!dropValid.value) {
      return action.dragTarget.value
        ? t("fogport.mode.invalidDrop") +
            " · " +
            failureReason(action.dragTarget.value)
        : t("fogport.mode.dragHint");
    }
    const command = dropRows.value[0] ?? action.commands.value[0];
    const preview = previewAction(game.value, selfId.value, command);
    return t("fogport.mode.drop", {
      action: t("fogport.actions." + action.mode.value.kind),
      object: formatDropObject(game.value, action.mode.value.kind, command, t),
      cost: Math.max(0, -(preview.delta?.money ?? 0)),
    });
  });

  const liquidationHover = computed(() => {
    const hoverKey = action.hoverTarget.value;
    if (
      action.activeKind.value !== "liquidate" ||
      !hoverKey?.startsWith("building:")
    ) {
      return null;
    }
    const offer = action.commands.value.find(
      (command) => "building:" + command.building === hoverKey,
    );
    if (!offer) return null;
    const tile = findBuildingById(game.value, offer.building);
    return {
      ...offer,
      name: placeName(tile.location, t) + " · " + tileName(tile.tileId, t),
    };
  });

  const modeHint = computed(() =>
    formatModeHint(
      action.mode.value,
      action.activeKind.value,
      game.value,
      self.value,
      t,
    ),
  );

  async function runCore(type, command) {
    const token = action.beginSubmit(type);
    if (!token) return false;
    let saved = false;
    try {
      saved = await run(type, command);
      return saved;
    } finally {
      action.endSubmit(token, saved);
    }
  }

  function backMode() {
    if (ghost.value) {
      clearMode();
      return;
    }
    action.back();
  }

  function addTarget() {
    if (action.add() && action.mode.value.kind === "develop") {
      tray.value = "industry";
      focusHandSidebar();
    }
  }

  function clearMode() {
    cancel();
    action.reset();
  }

  async function liquidate(target) {
    if (!guard("liquidate")) return;
    if (!target || !action.chooseTarget(target)) {
      toast.warning(t("fogport.mode.invalidObject"));
      return;
    }
    await runCore("fogport_liquidate", {
      building: action.mode.value.command.building,
    });
  }

  function escapeMode(event) {
    if (event.key === "Escape" && !action.draft.value) backMode();
  }
  onMounted(() => window.addEventListener("keydown", escapeMode));
  onBeforeUnmount(() => window.removeEventListener("keydown", escapeMode));

  watch(() => {
    const current = toValue(room);
    return [current.code, current.round, current.stage];
  }, clearMode);

  watch(
    () => {
      const current = toValue(room);
      return [current.code, current.round];
    },
    () => {
      panel.value = "board";
      tray.value = "cards";
    },
  );

  watch(canPlay, (value) => {
    if (!value) clearMode();
  });

  watch(
    () => action.activeKind.value,
    (kind) => {
      if (kind === "liquidate") {
        cancel();
        panel.value = "board";
      }
    },
    { immediate: true },
  );

  return {
    game,
    myTurn,
    canPlay,
    panel,
    tray,
    editorKey,
    mode: action.mode,
    activeKind: action.activeKind,
    selected: action.selected,
    menu: action.menu,
    draft: action.draft,
    hoverTarget: action.hoverTarget,
    commands: action.commands,
    targets: action.targets,
    cards: action.cards,
    industries: action.industries,
    selectedTargets: action.selectedTargets,
    submitting: action.submitting,
    ghost,
    dropValid,
    dropHint,
    liquidationHover,
    modeHint,
    hover: action.hover,
    replace: action.replace,
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
  };
}
