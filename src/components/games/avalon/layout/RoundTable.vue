<template>
  <div
    class="min-w-0"
    :class="
      !isRevealPhase
        ? 'flex h-full min-h-0 flex-col overflow-hidden pb-[calc(4rem+env(safe-area-inset-bottom))] lg:block lg:overflow-visible lg:pb-0'
        : 'space-y-5'
    "
  >
    <OpeningPhase
      v-if="room.phase === 'opening'"
      :room="room"
      :can-act="canAct"
      :run="run"
      :player-name="playerName"
    />
    <NightPhase
      v-else-if="room.phase === 'night'"
      :room="room"
      :can-act="canAct"
      :run="run"
      :player-name="playerName"
      :show-role="showRole"
      @flip-identity="flipIdentity"
    />
    <template v-else>
      <div
        class="min-w-0 lg:grid lg:h-full lg:min-h-0 lg:grid-cols-1 xl:grid-cols-[minmax(16rem,1fr)_auto_minmax(0,1.5fr)] lg:grid-rows-[minmax(0,1fr)] lg:items-start"
        :class="
          ['discussion', 'history'].includes(mobilePanel)
            ? 'max-lg:hidden'
            : 'max-lg:flex max-lg:min-h-0 max-lg:flex-1 max-lg:flex-col'
        "
      >
        <ActionTable
          :room="room"
          :can-act="canAct"
          :mobile-panel="mobilePanel"
          :mobile-panel-id="mobilePanelId"
          :player-name="playerName"
          :selection-mode="selectionMode"
          :selected-count="selected.length"
          :has-target="Boolean(target)"
          :allowed-quest-cards="allowedQuestCards"
          @vote="castVote"
          @quest="playQuest"
          @end-discussion="endCurrentDiscussion"
        />
        <div
          class="divider divider-horizontal hidden xl:order-2 xl:flex"
          aria-hidden="true"
        ></div>
        <Teleport :to="`#${playersTargetId}`" :disabled="!midDesktop" defer>
          <PlayerRoster
            :room="room"
            :can-act="canAct"
            :run="run"
            :mobile-panel="mobilePanel"
            :mobile-panel-id="mobilePanelId"
            :selection-mode="selectionMode"
            :selected="selected"
            :target="target"
            @toggle-player="togglePlayer"
            @select-target="target = $event"
            @propose-team="run('team', { team: selected })"
            @inspect-loyalty="inspectLoyalty"
            @assassinate="assassinate"
            @end-discussion="endCurrentDiscussion"
            @show-loyalty-result="showLoyaltyResult"
          />
        </Teleport>
      </div>

      <div
        v-if="!desktop"
        :id="`${mobilePanelId}-discussion`"
        class="min-h-0 flex-1 flex-col gap-3"
        :class="mobilePanel === 'discussion' ? 'flex' : 'hidden'"
      >
        <Discussion
          class="min-h-0 flex-1"
          :room="room"
          :can-act="canAct && canSpeak"
          :active="mobilePanel === 'discussion'"
          fill-height
          :run="run"
        >
          <template #discussion-timer>
            <div
              v-if="
                ['discussion', 'evil_discussion'].includes(room.phase) &&
                canSpeak
              "
              role="status"
              class="flex shrink-0 items-start gap-1.5 border-l-2 border-info pl-2 text-xs leading-5 text-base-content/80"
            >
              <i
                class="ri-information-line shrink-0 text-info"
                aria-hidden="true"
              ></i>
              <span class="min-w-0">{{ mobileDiscussionHint }}</span>
            </div>
            <DiscussionTimerBar
              v-if="['discussion', 'evil_discussion'].includes(room.phase)"
              display-class="flex lg:hidden"
              :discussion="room.discussion"
              :server-now="room.serverNow"
              :can-end="canEndDiscussion"
              :can-act="canAct"
              @end="endCurrentDiscussion"
            />
          </template>
        </Discussion>
      </div>

      <section
        v-if="!desktop"
        :id="`${mobilePanelId}-history`"
        class="min-h-0 flex-1"
        :class="mobilePanel === 'history' ? 'flex' : 'hidden'"
      >
        <div class="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <h2 class="card-title shrink-0 font-serif text-lg leading-7">
            <i class="ri-history-line font-normal" aria-hidden="true"></i>
            {{ t("avalon.history") }}
          </h2>
          <p
            v-if="!room.history.length"
            class="pb-5 text-sm text-base-content/50"
          >
            {{ t("avalon.mobile.historyEmpty") }}
          </p>
          <ScrollableContainer class="flex-1">
            <ol
              class="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain scrollbar-thin"
            >
              <li
                v-for="quest in recordedQuests"
                :key="quest"
                class="min-w-0 border-t border-base-300 pt-4 first:border-t-0 first:pt-0"
              >
                <QuestHistory :room="room" :quest="quest" />
              </li>
            </ol>
          </ScrollableContainer>
        </div>
      </section>

      <MobileDock
        :items="dockItems"
        :panel="mobilePanel"
        :panel-id="mobilePanelId"
        :label="t('avalon.mobile.navigation')"
        @select-panel="mobilePanel = $event"
      />
    </template>

    <RolePreviewPopover
      ref="loyaltyPopover"
      :dialog-label="
        t(
          loyaltyResult?.source === 'cleric'
            ? 'avalon.opening.title'
            : 'avalon.lady.title',
        )
      "
      :close-on-card-click="false"
      @closed="loyaltyResult = null"
    >
      <LoyaltyReply
        v-if="loyaltyResult"
        preview
        :result="loyaltyResult"
        :game-config="room.gameConfig"
        :player-name="playerName"
        :run="run"
        @dismiss="loyaltyPopover?.close()"
      />
    </RolePreviewPopover>
    <RolePreviewPopover
      ref="switchPopover"
      allegiance-switch
      :self="switchSelf"
      :switch-from-alignment="switchFromAlignment"
      :face-up="switchFaceUp"
      @closed="finishSwitchPresentation"
    />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, useId, watch } from "vue";
import { useMediaQuery } from "@vueuse/core";
import ScrollableContainer from "@/components/layout/ScrollableContainer.vue";
import { useLocale } from "@/i18n";
import { useModal } from "@/composables/useModal";
import {
  useAvalonRoom,
  useAvalonUnread,
} from "@/composables/games/avalon/useAvalonRoom";
import {
  AVALON_DESKTOP_QUERY,
  AVALON_MID_DESKTOP_QUERY,
  useAvalonLayout,
} from "@/composables/games/avalon/useAvalonLayout";
import { useAvalonModals } from "@/composables/games/avalon/useAvalonModals";
import MobileDock from "../../layout/MobileDock.vue";
import DiscussionTimerBar from "../display/DiscussionTimerBar.vue";
import QuestHistory from "../display/QuestHistory.vue";
import Discussion from "../interaction/Discussion.vue";
import LoyaltyReply from "../interaction/LoyaltyReply.vue";
import RolePreviewPopover from "../interaction/RolePreviewPopover.vue";
import ActionTable from "./ActionTable.vue";
import NightPhase from "./NightPhase.vue";
import OpeningPhase from "./OpeningPhase.vue";
import PlayerRoster from "./PlayerRoster.vue";

const props = defineProps({
  room: { type: Object, required: true },
  canAct: Boolean,
  run: { type: Function, required: true },
});

const { t } = useLocale();
const modal = useModal();
const desktop = useMediaQuery(AVALON_DESKTOP_QUERY);
const midDesktop = useMediaQuery(AVALON_MID_DESKTOP_QUERY);
const { playersTargetId, setSidebarPanel, registerEndDiscussion } =
  useAvalonLayout();

const {
  room,
  playerName,
  recordedQuests,
  isLeader,
  canSpeak,
  canEndEvilDiscussion,
  canEndDiscussion,
  teamSize,
  isQuestMember,
  allowedQuestCards,
  canAssassinate,
} = useAvalonRoom(() => props.room);

const isRevealPhase = computed(() =>
  ["opening", "night"].includes(room.value.phase),
);

const {
  loyaltyPopover,
  loyaltyResult,
  switchPopover,
  switchFaceUp,
  switchSelf,
  switchFromAlignment,
  showLoyaltyResult,
  finishSwitchPresentation,
} = useAvalonModals({ room, playerName });

const mobilePanelId = `avalon-panels-${useId()}`;
const mobilePanel = ref("agenda");
const { unread: unreadMessages, clearUnread } = useAvalonUnread(room, {
  shouldSkip: () => desktop.value || mobilePanel.value === "discussion",
});
watch([mobilePanel, desktop], ([panel, isDesktop]) => {
  if (panel === "discussion" || isDesktop) clearUnread();
});

const mobilePanels = [
  {
    id: "agenda",
    icon: "ri-question-answer-line",
    label: "avalon.mobile.agenda",
  },
  { id: "table", icon: "ri-layout-grid-line", label: "avalon.mobile.table" },
  { id: "players", icon: "ri-group-line", label: "avalon.mobile.players" },
  {
    id: "discussion",
    icon: "ri-user-voice-line",
    label: "avalon.mobile.discussion",
  },
  { id: "history", icon: "ri-history-line", label: "avalon.mobile.history" },
];
const dockItems = computed(() =>
  mobilePanels.map((item) => ({
    ...item,
    badge: item.id === "discussion" ? unreadMessages.value : 0,
    badgeLabel: t("avalon.phrases.unread", { n: unreadMessages.value }),
  })),
);

const selected = ref([]);
const target = ref("");
const showRole = ref(false);

const mobileDiscussionHint = computed(() =>
  t(
    room.value.phase === "evil_discussion"
      ? "avalon.mobileHints.evilDiscussion"
      : room.value.discussion?.mode === "slow"
        ? "avalon.mobileHints.slowDiscussion"
        : "avalon.mobileHints.fastDiscussion",
  ),
);

const selectionMode = computed(() => {
  if (
    room.value.phase === "lady" &&
    room.value.lady?.holderId === room.value.selfId &&
    !room.value.lady.targetId
  )
    return "lady";
  if (room.value.phase === "team" && isLeader.value) return "team";
  if (
    room.value.phase === "discussion" &&
    isLeader.value &&
    room.value.discussion?.mode === "fast" &&
    !room.value.discussion.partnerId
  )
    return "invite";
  if (room.value.phase === "recruit" && room.value.self.role === "assassin")
    return "recruit";
  if (canAssassinate.value) return "assassinate";
  return "";
});

const requiredPanel = computed(() => {
  if (selectionMode.value || room.value.self.loyaltyRequest) return "players";
  if (room.value.phase === "evil_discussion") return "discussion";
  if (room.value.phase === "discussion" && canSpeak.value) return "discussion";
  if (
    (room.value.phase === "vote" && !room.value.self.voted) ||
    (isQuestMember.value && !room.value.self.questSubmitted) ||
    room.value.phase === "finished"
  )
    return "table";
  return "agenda";
});

watch(
  [
    () => room.value.code,
    () => room.value.game,
    () => room.value.stage,
    () => room.value.phase,
    () => room.value.selfId,
    requiredPanel,
    desktop,
    midDesktop,
  ],
  ([, , , phase, , panel, isDesktop, isMidDesktop]) => {
    if (["opening", "night"].includes(phase)) return;
    if (isDesktop) {
      setSidebarPanel(
        isMidDesktop && panel === "players" ? "players" : "discussion",
      );
      return;
    }
    mobilePanel.value = panel;
  },
  { immediate: true },
);

watch([() => room.value.code, () => room.value.stage], () => {
  selected.value = [];
  target.value = "";
});

watch(
  [
    () => room.value.code,
    () => room.value.game,
    () => room.value.selfId,
    () => room.value.phase,
    () => room.value.self.roleRevealed,
    () => room.value.self.nightConfirmed,
  ],
  ([code, game, selfId, phase, revealed, confirmed], previous) => {
    if (phase === "night") showRole.value = revealed && !confirmed;
    else if (
      !previous ||
      code !== previous[0] ||
      game !== previous[1] ||
      selfId !== previous[2] ||
      previous[3] === "night"
    )
      showRole.value = !!room.value.self.role;
  },
  { immediate: true },
);

function togglePlayer(id) {
  selected.value = selected.value.includes(id)
    ? selected.value.filter((value) => value !== id)
    : selected.value.length < teamSize.value
      ? [...selected.value, id]
      : selected.value;
}

function flipIdentity() {
  if (!room.value.self.roleRevealed) {
    if (props.canAct) void props.run("peek_role");
  } else showRole.value = !showRole.value;
}

function confirmGameAction(title, description, type, payload) {
  const { code, stage } = room.value;
  modal.confirm(title, description, {
    buttonText: title,
    onSubmit: () => {
      if (
        type === "begin_team" &&
        (!isLeader.value || room.value.phase !== "discussion")
      )
        return;
      if (type === "vote" && room.value.self.voted) return;
      if (
        type === "end_assassination_discussion" &&
        (!canEndEvilDiscussion.value || room.value.phase !== "evil_discussion")
      )
        return;
      if (
        type === "quest" &&
        (!isQuestMember.value ||
          room.value.self.questSubmitted ||
          !allowedQuestCards.value.includes(payload.success))
      )
        return;
      if (
        props.canAct &&
        room.value.code === code &&
        room.value.stage === stage
      )
        void props.run(type, payload);
    },
  });
}

function playQuest(success) {
  if (
    !isQuestMember.value ||
    room.value.self.questSubmitted ||
    !props.canAct ||
    !allowedQuestCards.value.includes(success)
  )
    return;
  confirmGameAction(
    t(success ? "avalon.questCards.execute" : "avalon.questCards.sabotage"),
    t(success ? "avalon.confirmSuccess" : "avalon.confirmFailure"),
    "quest",
    { success },
  );
}

function castVote(approve) {
  if (room.value.phase !== "vote" || room.value.self.voted || !props.canAct)
    return;
  confirmGameAction(
    t(approve ? "avalon.approve" : "avalon.reject"),
    t("avalon.ballot.confirm", {
      choice: t(approve ? "avalon.approve" : "avalon.reject"),
    }),
    "vote",
    { approve },
  );
}

function inspectLoyalty() {
  if (selectionMode.value !== "lady" || !target.value) return;
  confirmGameAction(
    t("avalon.lady.inspect"),
    t("avalon.lady.confirm", { name: playerName(target.value) }),
    "lady",
    { targetId: target.value },
  );
}

function assassinate() {
  const targetId = target.value;
  const recruiting = room.value.phase === "recruit";
  confirmGameAction(
    t(recruiting ? "avalon.untrustworthy.recruit" : "avalon.assassinate"),
    t(recruiting ? "avalon.untrustworthy.confirm" : "avalon.confirmTarget", {
      name: playerName(targetId),
    }),
    recruiting ? "recruit" : "assassinate",
    { targetId },
  );
}

function endDiscussion() {
  if (!isLeader.value || room.value.phase !== "discussion" || !props.canAct)
    return;
  confirmGameAction(
    t("avalon.discussionTimer.endEarly"),
    t("avalon.discussionTimer.confirmEnd"),
    "begin_team",
  );
}

function endEvilDiscussion() {
  if (
    !canEndEvilDiscussion.value ||
    room.value.phase !== "evil_discussion" ||
    !props.canAct
  )
    return;
  confirmGameAction(
    t("avalon.discussionTimer.endEarly"),
    t("avalon.evilDiscussion.confirmEnd"),
    "end_assassination_discussion",
  );
}

function endCurrentDiscussion() {
  if (room.value.phase === "evil_discussion") endEvilDiscussion();
  else endDiscussion();
}

const unregisterEndDiscussion = registerEndDiscussion(endCurrentDiscussion);
onBeforeUnmount(unregisterEndDiscussion);
</script>
