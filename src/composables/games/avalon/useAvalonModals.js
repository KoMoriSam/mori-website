import { h, onBeforeUnmount, ref, watch } from "vue";
import { useLocale } from "@/i18n";
import { useModal } from "@/composables/useModal";
import { useToast } from "@/composables/useToast";
import {
  LANCELOTS,
  selfAlignment,
} from "../../../../shared/games/avalon/index.js";

export function useAvalonModals({ room, playerName }) {
  const { t } = useLocale();
  const modal = useModal();
  const toast = useToast();

  let questResultModal = null;
  let voteResultModal = null;
  let recruitmentModal = null;
  let voteModalPhase = null;

  const switchPopover = ref(null);
  const switchFaceUp = ref(false);
  const switchSelf = ref(null);
  const switchFromAlignment = ref(null);
  let switchPresenting = false;
  let switchPresentation = 0;
  let switchFlipTimer = 0;
  let switchCloseTimer = 0;
  let switchResumeTimer = 0;
  let pendingQuestResult = null;
  let pendingLoyaltyResult = null;

  const loyaltyPopover = ref(null);
  const loyaltyResult = ref(null);

  async function showLoyaltyResult(entry) {
    loyaltyResult.value = entry;
    await loyaltyPopover.value?.open();
  }

  function clearSwitchTimers() {
    clearTimeout(switchFlipTimer);
    clearTimeout(switchCloseTimer);
    clearTimeout(switchResumeTimer);
  }

  function resetSwitchPresentation() {
    clearSwitchTimers();
    switchPresentation += 1;
    switchPresenting = false;
    pendingQuestResult = null;
    pendingLoyaltyResult = null;
    loyaltyPopover.value?.close();
    loyaltyResult.value = null;
    switchPopover.value?.close();
  }

  function finishSwitchPresentation() {
    if (!switchPresenting) return;
    clearSwitchTimers();
    const presentation = switchPresentation;
    switchResumeTimer = window.setTimeout(() => {
      if (presentation !== switchPresentation) return;
      switchPresenting = false;
      const showResult = pendingQuestResult;
      pendingQuestResult = null;
      showResult?.();
      const showLoyalty = pendingLoyaltyResult;
      pendingLoyaltyResult = null;
      showLoyalty?.();
    }, 300);
  }

  async function presentLancelotSwitch() {
    if (!LANCELOTS.includes(room.value.self.role)) return;
    resetSwitchPresentation();
    const presentation = switchPresentation;
    switchFaceUp.value = false;
    const self = room.value.self;
    switchSelf.value =
      self.lancelotMode === "switching" && LANCELOTS.includes(self.role)
        ? { role: self.role, alignment: selfAlignment(self) }
        : null;
    // Snapshot both faces of the most recent switch; role identity stays unchanged.
    switchFromAlignment.value = switchSelf.value
      ? switchSelf.value.alignment === "evil"
        ? "good"
        : "evil"
      : null;
    switchPresenting = true;
    questResultModal?.close();
    questResultModal = null;
    voteResultModal?.close();
    voteResultModal = null;
    voteModalPhase = null;
    await switchPopover.value?.open();
    if (presentation !== switchPresentation || !switchPresenting) return;
    switchFlipTimer = window.setTimeout(() => {
      switchFaceUp.value = true;
    }, 1000);
    switchCloseTimer = window.setTimeout(() => {
      switchPopover.value?.close();
    }, 4400);
  }

  watch(
    () => [room.value.code, room.value.game, room.value.self.alignment],
    (value, previous) => {
      if (
        !previous ||
        value[0] !== previous[0] ||
        value[1] !== previous[1] ||
        !previous[2] ||
        value[2] === previous[2] ||
        !LANCELOTS.includes(room.value.self.role)
      )
        return;
      toast.info(
        t("avalon.lancelot.changed", { side: t(`avalon.night.${value[2]}`) }),
        { duration: 6000 },
      );
    },
  );

  // 必须先于 loyaltyObservations 与 quests 注册，确保同帧切换时先置 switchPresenting 排队后续弹窗。
  watch(
    [
      () => room.value.code,
      () => room.value.game,
      () => room.value.selfId,
      () => room.value.self.lancelotDraws ?? [],
      () => room.value.phase,
    ],
    ([code, game, selfId, history, phase], previous) => {
      if (
        !previous ||
        code !== previous[0] ||
        game !== previous[1] ||
        selfId !== previous[2] ||
        phase === "finished"
      ) {
        resetSwitchPresentation();
        return;
      }
      // Private draw snapshots are never replayed on a reconnect.
      if (history.slice(previous[3].length).some((entry) => entry.switched)) {
        void presentLancelotSwitch();
      } else if (history.length > previous[3].length) {
        toast.info(t("avalon.lancelot.privateStay"));
      }
    },
    { immediate: true },
  );

  watch(
    [
      () => room.value.code,
      () => room.value.game,
      () => room.value.self.loyaltyObservations ?? [],
    ],
    ([code, game, observations], previous) => {
      if (
        !previous ||
        code !== previous[0] ||
        game !== previous[1] ||
        observations.length <= previous[2].length
      )
        return;
      const entry = observations.at(-1);
      if (!["lady", "cleric"].includes(entry.source)) return;
      const showResult = () => {
        void showLoyaltyResult(entry);
      };
      if (switchPresenting) pendingLoyaltyResult = showResult;
      else showResult();
    },
  );

  watch(
    [() => room.value.code, () => room.value.game, () => room.value.quests],
    ([code, game, quests], previous) => {
      if (!previous || code !== previous[0] || game !== previous[1]) {
        questResultModal?.close();
        questResultModal = null;
        pendingQuestResult = null;
        return;
      }
      if (quests.length <= previous[2].length) return;
      const result = quests.at(-1);
      const successes = quests.filter((quest) => quest.success).length;
      const failures = quests.length - successes;
      const outlook =
        failures === 3
          ? [t("avalon.questResult.evilVictory")]
          : successes === 3
            ? [
                t(
                  room.value.gameConfig?.specialRoles?.includes(
                    "untrustworthy_servant",
                  )
                    ? "avalon.untrustworthy.endgameHint"
                    : "avalon.questResult.assassination",
                ),
              ]
            : [
                t("avalon.questResult.goodRemaining", 3 - successes),
                t("avalon.questResult.evilRemaining", 3 - failures),
              ];
      const description = h("div", { class: "space-y-4" }, [
        h("div", { class: "flex items-center gap-3" }, [
          h("i", {
            class: result.success
              ? "ri-shield-check-line text-4xl text-success"
              : "ri-close-circle-line text-4xl text-error",
            "aria-hidden": true,
          }),
          h("div", { class: "min-w-0 space-y-1" }, [
            h(
              "p",
              { class: "font-semibold" },
              t("avalon.records.cards", {
                passed: result.team.length - result.failures,
                failed: result.failures,
              }),
            ),
            h(
              "p",
              { class: "text-sm text-base-content/60" },
              t("avalon.teamNames", {
                names: result.team.map(playerName).join(", "),
              }),
            ),
          ]),
        ]),
        h(
          "div",
          { class: "space-y-1 text-sm" },
          outlook.map((line) => h("p", line)),
        ),
      ]);
      voteResultModal?.close();
      voteResultModal = null;
      voteModalPhase = null;
      questResultModal?.close();
      const showResult = () => {
        questResultModal = modal.info(
          t(
            result.success
              ? "avalon.questResult.success"
              : "avalon.questResult.failure",
            { n: result.quest + 1 },
          ),
          description,
        );
      };
      if (switchPresenting) pendingQuestResult = showResult;
      else showResult();
    },
    { immediate: true },
  );

  watch(
    [() => room.value.code, () => room.value.game, () => room.value.history],
    ([code, game, history], previous) => {
      if (!previous || code !== previous[0] || game !== previous[1]) {
        voteResultModal?.close();
        voteResultModal = null;
        voteModalPhase = null;
        return;
      }
      const votes = history.filter((entry) => entry.type === "vote");
      if (
        votes.length <=
        previous[2].filter((entry) => entry.type === "vote").length
      )
        return;
      const result = votes.at(-1);
      const state = room.value;
      if (
        (result.approved && state.phase !== "quest") ||
        (!result.approved &&
          !["discussion", "team", "finished"].includes(state.phase))
      )
        return;
      const yes = result.votes.filter((vote) => vote.approve).length;
      const no = result.votes.length - yes;
      const needed = Math.floor(result.votes.length / 2) + 1;
      const reason = t(
        result.approved
          ? "avalon.voteResult.approvedReason"
          : yes === no
            ? "avalon.voteResult.tieReason"
            : "avalon.voteResult.rejectedReason",
        { needed },
      );
      const next = result.approved
        ? t(
            result.team.includes(state.selfId)
              ? "avalon.voteResult.nextMember"
              : "avalon.voteResult.nextObserver",
          )
        : state.phase === "finished"
          ? t("avalon.reasons.rejections")
          : t(
              state.phase === "team"
                ? state.leaderId === state.selfId
                  ? "avalon.voteResult.nextLeaderTeam"
                  : "avalon.voteResult.nextTeam"
                : state.leaderId === state.selfId
                  ? "avalon.voteResult.nextLeaderDiscussion"
                  : "avalon.voteResult.nextDiscussion",
              { name: playerName(state.leaderId) },
            );
      const description = h("div", { class: "space-y-4 text-sm" }, [
        h("div", { class: "flex items-center gap-3" }, [
          h("i", {
            class: result.approved
              ? "ri-checkbox-circle-line text-4xl text-success"
              : "ri-close-circle-line text-4xl text-error",
            "aria-hidden": true,
          }),
          h("div", { class: "min-w-0 space-y-1" }, [
            h(
              "p",
              { class: "font-semibold" },
              t("avalon.records.tally", { yes, no }),
            ),
            h(
              "p",
              { class: "text-base-content/60" },
              t("avalon.teamNames", {
                names: result.team.map(playerName).join(", "),
              }),
            ),
          ]),
        ]),
        h("p", reason),
        h("p", { class: "rounded-box bg-base-200/60 p-3 font-medium" }, next),
      ]);
      questResultModal?.close();
      questResultModal = null;
      voteResultModal?.close();
      voteModalPhase = state.phase;
      voteResultModal = modal.info(
        t(
          result.approved
            ? "avalon.voteResult.approved"
            : "avalon.voteResult.rejected",
        ),
        description,
      );
    },
    { immediate: true },
  );

  watch(
    () => room.value.phase,
    (phase) => {
      if (!voteResultModal || phase === voteModalPhase) return;
      voteResultModal.close();
      voteResultModal = null;
      voteModalPhase = null;
    },
  );

  watch(
    [() => room.value.code, () => room.value.game, () => room.value.history],
    ([code, game, history], previous) => {
      if (!previous || code !== previous[0] || game !== previous[1]) {
        recruitmentModal?.close();
        recruitmentModal = null;
        return;
      }
      const result = history
        .slice(previous[2].length)
        .find((entry) => entry.type === "recruit");
      if (!result) return;
      questResultModal?.close();
      recruitmentModal?.close();
      recruitmentModal = modal.info(
        t("avalon.untrustworthy.recruit"),
        t(
          result.success
            ? "avalon.untrustworthy.success"
            : "avalon.untrustworthy.failure",
          { name: playerName(result.targetId) },
        ),
      );
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    resetSwitchPresentation();
    questResultModal?.close();
    voteResultModal?.close();
    recruitmentModal?.close();
  });

  return {
    loyaltyPopover,
    loyaltyResult,
    switchPopover,
    switchFaceUp,
    switchSelf,
    switchFromAlignment,
    showLoyaltyResult,
    finishSwitchPresentation,
  };
}
