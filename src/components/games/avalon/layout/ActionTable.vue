<template>
  <div
    class="min-w-0 lg:h-full lg:min-h-0 xl:order-3"
    :class="
      mobilePanel === 'players'
        ? 'max-lg:hidden'
        : 'max-lg:min-h-0 max-lg:flex-1'
    "
  >
    <div class="flex h-full min-h-0 min-w-0 flex-col lg:gap-5">
      <div
        :id="`${mobilePanelId}-agenda`"
        class="min-h-0 flex-1 flex-col gap-3 lg:pr-2"
        :class="mobilePanel === 'agenda' ? 'flex' : 'hidden lg:flex'"
      >
        <section class="card shrink-0">
          <div class="card-body gap-3 p-0">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <h2
                class="card-title font-serif max-lg:text-lg max-lg:leading-7"
              >
                <i
                  class="ri-question-answer-line font-normal"
                  aria-hidden="true"
                ></i>
                {{ t(`avalon.phases.${room.phase}`) }}
              </h2>
              <span
                v-if="agendaStatus"
                class="badge badge-soft max-md:badge-sm ml-auto h-auto max-w-full shrink-0 py-1 text-right whitespace-normal"
                :class="agendaStatus.tone"
                >{{ agendaStatus.text }}</span
              >
            </div>
            <template v-if="room.phase === 'discussion'">
              <p
                v-if="!room.history.length"
                class="font-serif text-xl leading-8"
              >
                {{ t("avalon.night.daybreak") }}
              </p>
              <p class="text-sm leading-7">
                {{
                  t(
                    isLeader
                      ? "avalon.discussionHintSelf"
                      : "avalon.discussionHint",
                    { name: playerName(room.leaderId) },
                  )
                }}
              </p>
              <p class="text-sm text-base-content/60">
                {{ discussionHint }}
              </p>
            </template>
            <template v-else-if="room.phase === 'team'">
              <p class="text-sm leading-6">
                {{
                  t(isLeader ? "avalon.teamHintSelf" : "avalon.teamHint", {
                    name: playerName(room.leaderId),
                    n: teamSize,
                  })
                }}
              </p>
              <p v-if="!isLeader" class="text-sm text-base-content/60">
                {{ t("avalon.waitLeader") }}
              </p>
            </template>
            <template v-else-if="room.phase === 'vote'">
              <p v-if="!room.self.voted" class="text-sm leading-6">
                {{ t("avalon.voteHint") }}
              </p>
              <p v-else class="text-sm leading-6">
                {{
                  t(
                    room.self.autoApproved
                      ? "avalon.ballot.leaderApproved"
                      : "avalon.submitted",
                  )
                }}
              </p>
            </template>
            <template v-else-if="room.phase === 'quest'">
              <p class="text-sm leading-6">
                {{ t(isQuestMember ? questHintKey : "avalon.questHint") }}
              </p>
              <p v-if="room.twoFails" class="text-sm text-warning">
                {{ t("avalon.twoFails") }}
              </p>
              <p
                v-if="!isQuestMember || room.self.questSubmitted"
                class="text-sm"
              >
                {{
                  room.self.questSubmitted
                    ? t("avalon.submitted")
                    : t("avalon.waitQuest")
                }}
              </p>
            </template>
            <template v-else-if="room.phase === 'evil_discussion'">
              <p class="text-sm leading-6">
                {{ t("avalon.evilDiscussion.hint") }}
              </p>
              <p class="text-sm text-base-content/60">
                {{ t("avalon.evilDiscussion.next") }}
              </p>
            </template>
            <template v-else-if="room.phase === 'lady'">
              <p class="text-sm leading-6">
                {{
                  t(
                    selectionMode === "lady"
                      ? "avalon.lady.choose"
                      : room.self.loyaltyRequest
                        ? "avalon.loyalty.title"
                        : "avalon.lady.wait",
                    { name: playerName(room.lady.holderId) },
                  )
                }}
              </p>
            </template>
            <template v-else-if="room.phase === 'recruit'">
              <p class="text-sm leading-6">
                {{
                  t(
                    room.self.role === "assassin"
                      ? "avalon.untrustworthy.hintSelf"
                      : "avalon.untrustworthy.hintWait",
                  )
                }}
              </p>
            </template>
            <template v-else-if="room.phase === 'assassinate'">
              <p class="text-sm leading-6">
                {{
                  t(
                    canAssassinate
                      ? "avalon.assassinateHintSelf"
                      : "avalon.assassinateHint",
                  )
                }}
              </p>
              <p v-if="!canAssassinate" class="text-sm text-base-content/60">
                {{ t("avalon.waitAssassin") }}
              </p>
            </template>
          </div>
        </section>
        <ScrollableContainer class="flex-1">
          <div
            data-avalon-summary-scroll
            class="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-2 scrollbar-thin"
          >
            <AgendaSummary :room="room" :player-name="playerName" />
          </div>
        </ScrollableContainer>
        <DiscussionTimerBar
          v-if="['discussion', 'evil_discussion'].includes(room.phase)"
          display-class="flex lg:hidden"
          :discussion="room.discussion"
          :server-now="room.serverNow"
          :can-end="canEndDiscussion"
          :can-act="canAct"
          @end="emit('end-discussion')"
        />
      </div>
      <div
        :id="`${mobilePanelId}-table`"
        class="min-h-0 space-y-5 max-lg:flex-1 max-lg:flex-col max-lg:gap-3 max-lg:space-y-0 max-lg:overflow-hidden lg:shrink-0"
        :class="mobilePanel === 'table' ? 'max-lg:flex' : 'hidden lg:block'"
      >
        <ScrollableContainer class="max-lg:flex-1 lg:hidden">
          <div
            data-avalon-summary-scroll
            class="min-h-0 max-lg:flex-1 max-lg:overflow-x-hidden max-lg:overflow-y-auto max-lg:overscroll-contain max-lg:scrollbar-thin lg:hidden"
          >
            <AgendaSummary :room="room" :player-name="playerName" />
          </div>
        </ScrollableContainer>
        <div class="flex max-h-full min-h-0 shrink-0 flex-col gap-3 lg:gap-5">
          <QuestList v-if="room.game > 0" :room="room" />

          <div
            v-if="
              (room.phase === 'vote' && !room.self.voted) ||
              (isQuestMember && !room.self.questSubmitted)
            "
            role="status"
            class="flex shrink-0 items-start gap-1.5 border-l-2 border-info pl-2 text-xs leading-5 text-base-content/80 lg:hidden"
          >
            <i
              class="ri-information-line shrink-0 text-info"
              aria-hidden="true"
            ></i>
            <span class="min-w-0">
              {{
                room.phase === "vote"
                  ? t("avalon.mobileHints.vote")
                  : t("avalon.mobileHints.quest")
              }}
            </span>
          </div>

          <ScrollableContainer v-if="room.self.role">
            <section
              class="min-h-0 min-w-0 overflow-y-auto overscroll-contain scrollbar-thin"
            >
              <ResultCard
                v-if="room.phase === 'finished'"
                :result="room.result"
                :won="room.self.won"
                :alignment="room.self.alignment"
                :self-id="room.selfId"
                :player-name="playerName"
              />
              <BallotCards
                v-else-if="isQuestMember"
                :self="room.self"
                :game-config="room.gameConfig"
                :self-id="room.selfId"
                :player-name="playerName"
                mode="quest"
                active
                :allow-fail="allowedQuestCards.includes(false)"
                :allowed-choices="allowedQuestCards"
                :can-submit="!room.self.questSubmitted && canAct"
                :submitted="room.self.questSubmitted"
                :context="`${room.code}:${room.game}:${room.stage}`"
                @quest="emit('quest', $event)"
              />
              <BallotCards
                v-else
                :self="room.self"
                :game-config="room.gameConfig"
                :self-id="room.selfId"
                :player-name="playerName"
                :active="room.phase === 'vote'"
                :can-submit="
                  room.phase === 'vote' && !room.self.voted && canAct
                "
                :submitted="room.phase === 'vote' && room.self.voted"
                :auto-approved="
                  room.phase === 'vote' && room.self.autoApproved
                "
                :context="`${room.code}:${room.game}:${room.stage}`"
                @vote="emit('vote', $event)"
              />
            </section>
          </ScrollableContainer>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import ScrollableContainer from "@/components/layout/ScrollableContainer.vue";
import { useLocale } from "@/i18n";
import { useAvalonRoom } from "@/composables/games/avalon/useAvalonRoom";
import AgendaSummary from "../display/AgendaSummary.vue";
import DiscussionTimerBar from "../display/DiscussionTimerBar.vue";
import QuestList from "../display/QuestList.vue";
import ResultCard from "../display/ResultCard.vue";
import BallotCards from "../interaction/BallotCards.vue";

const props = defineProps({
  room: { type: Object, required: true },
  canAct: Boolean,
  mobilePanel: { type: String, required: true },
  mobilePanelId: { type: String, required: true },
  playerName: { type: Function, required: true },
  selectionMode: { type: String, default: "" },
  selectedCount: { type: Number, default: 0 },
  hasTarget: Boolean,
  allowedQuestCards: { type: Array, required: true },
});
const emit = defineEmits(["vote", "quest", "end-discussion"]);

const { t } = useLocale();
const {
  isLeader,
  evil,
  canSpeak,
  canEndDiscussion,
  teamSize,
  isQuestMember,
  canAssassinate,
} = useAvalonRoom(() => props.room);

const discussionHint = computed(() => {
  const discussion = props.room.discussion;
  if (!discussion) return t("avalon.discussionTimer.syncing");
  if (discussion.mode === "evil") return t("avalon.evilDiscussion.hint");
  if (discussion.mode === "slow") return t("avalon.discussionTimer.slowHint");
  if (!discussion.partnerId)
    return t(
      isLeader.value
        ? "avalon.discussionTimer.inviteSelf"
        : "avalon.discussionTimer.inviteWait",
    );
  return t(
    isLeader.value
      ? "avalon.discussionTimer.dialogueSelf"
      : discussion.partnerId === props.room.selfId
        ? "avalon.discussionTimer.dialoguePartner"
        : "avalon.discussionTimer.dialogueWait",
    {
      leader: props.playerName(props.room.leaderId),
      partner: props.playerName(discussion.partnerId),
    },
  );
});

const questHintKey = computed(() =>
  props.allowedQuestCards.length === 1 && !props.allowedQuestCards[0]
    ? "avalon.questHintLunatic"
    : props.room.self.role === "brute" &&
        !props.allowedQuestCards.includes(false)
      ? "avalon.questHintBrute"
      : evil.value
        ? "avalon.questHintEvil"
        : "avalon.questHintGood",
);

const agendaStatus = computed(() => {
  const state = props.room;
  const status = (key, tone = "badge-ghost", params = {}) => ({
    text: t(`avalon.agendaStatus.${key}`, params),
    tone,
  });

  if (state.phase === "finished")
    return {
      text: t(`avalon.winners.${state.result?.winner || "none"}`),
      tone:
        state.result?.winner === "good"
          ? "badge-success"
          : state.result?.winner === "evil"
            ? "badge-error"
            : "badge-ghost",
    };
  if (
    state.rejected === 4 &&
    ["discussion", "team", "vote"].includes(state.phase)
  )
    return status("lastReject", "badge-error");

  switch (state.phase) {
    case "lady":
      return {
        text: t("avalon.lady.title"),
        tone:
          props.selectionMode === "lady" || state.self.loyaltyRequest
            ? "badge-info"
            : "badge-ghost",
      };
    case "discussion":
      if (!state.discussion)
        return {
          text: t("avalon.discussionTimer.syncing"),
          tone: "badge-ghost",
        };
      if (state.discussion.mode === "slow") return status("slow", "badge-info");
      if (!state.discussion.partnerId)
        return status(
          isLeader.value ? "inviteSelf" : "inviteWait",
          isLeader.value ? "badge-primary" : "badge-ghost",
        );
      return status(
        canSpeak.value ? "dialogueSelf" : "dialogueWait",
        canSpeak.value ? "badge-info" : "badge-ghost",
      );
    case "team":
      if (!isLeader.value) return status("teamWait");
      return props.selectedCount === teamSize.value
        ? status("teamReady", "badge-primary")
        : status("teamSelf", "badge-primary", {
            n: props.selectedCount,
            total: teamSize.value,
          });
    case "evil_discussion":
      return status("evilDiscussion", "badge-error");
    case "vote":
      return status(
        state.self.voted ? "voteWait" : "voteSelf",
        state.self.voted ? "badge-ghost" : "badge-primary",
      );
    case "quest":
      return status(
        isQuestMember.value && !state.self.questSubmitted
          ? "questSelf"
          : "questWait",
        isQuestMember.value && !state.self.questSubmitted
          ? "badge-primary"
          : "badge-ghost",
      );
    case "recruit":
      return state.self.role === "assassin"
        ? status(
            props.hasTarget ? "recruitConfirm" : "recruitSelf",
            "badge-primary",
          )
        : status("recruitWait");
    case "assassinate":
      return canAssassinate.value
        ? status(
            props.hasTarget ? "assassinateConfirm" : "assassinateSelf",
            "badge-primary",
          )
        : status("assassinateWait");
    default:
      return null;
  }
});
</script>
