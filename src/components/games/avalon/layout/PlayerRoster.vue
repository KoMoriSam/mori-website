<template>
  <div
    class="flex min-h-0 min-w-0 flex-col lg:h-full xl:order-1"
    :class="mobilePanel === 'players' ? 'max-lg:flex-1' : 'max-lg:hidden'"
  >
    <div
      :id="`${mobilePanelId}-players`"
      class="flex min-h-0 flex-1 flex-col"
      :class="midDesktop || mobilePanel === 'players' ? '' : 'hidden lg:flex'"
    >
      <section class="card min-h-0 flex-1">
        <div class="card-body min-h-0 flex-1 gap-3 p-0 lg:gap-4">
          <div
            v-if="!midDesktop"
            class="flex shrink-0 items-center justify-between gap-3"
          >
            <h2 class="card-title font-serif max-lg:text-lg max-lg:leading-7">
              <i class="ri-group-line font-normal" aria-hidden="true"></i>
              {{ t("avalon.players", { n: room.players.length }) }}
            </h2>
          </div>
          <DiscussionTimerBar
            v-if="['discussion', 'evil_discussion'].includes(room.phase)"
            :display-class="
              room.phase === 'discussion' &&
              room.discussion?.mode === 'fast' &&
              !room.discussion.partnerId
                ? 'flex'
                : 'hidden lg:flex'
            "
            :discussion="room.discussion"
            :server-now="room.serverNow"
            :can-end="canEndDiscussion"
            :can-act="canAct"
            @end="emit('end-discussion')"
          />
          <div
            v-if="selectionMode === 'team'"
            role="status"
            class="flex shrink-0 items-start gap-1.5 border-l-2 border-info pl-2 text-xs leading-5 text-base-content/80 lg:hidden"
          >
            <i
              class="ri-information-line shrink-0 text-info"
              aria-hidden="true"
            ></i>
            <span class="min-w-0">{{
              t("avalon.mobileHints.team", {
                n: selected.length,
                total: teamSize,
              })
            }}</span>
          </div>
          <div
            v-else-if="selectionMode === 'invite'"
            role="status"
            class="flex shrink-0 items-start gap-1.5 border-l-2 border-info pl-2 text-xs leading-5 text-base-content/80 lg:hidden"
          >
            <i
              class="ri-information-line shrink-0 text-info"
              aria-hidden="true"
            ></i>
            <span class="min-w-0">{{ t("avalon.mobileHints.invite") }}</span>
          </div>
          <div
            v-else-if="
              ['assassinate', 'recruit', 'lady'].includes(selectionMode)
            "
            role="status"
            class="flex shrink-0 items-start gap-1.5 border-l-2 border-info pl-2 text-xs leading-5 text-base-content/80 lg:hidden"
          >
            <i
              class="ri-information-line shrink-0 text-info"
              aria-hidden="true"
            ></i>
            <span class="min-w-0">{{
              t(
                selectionMode === "lady"
                  ? "avalon.lady.choose"
                  : `avalon.mobileHints.${selectionMode}`,
              )
            }}</span>
          </div>
          <LoyaltyReply
            v-if="room.phase === 'lady'"
            popover
            :request="room.self.loyaltyRequest"
            :can-act="canAct"
            :run="run"
          />
          <ScrollableContainer class="flex-1">
            <ol
              class="grid min-h-0 flex-1 content-start gap-2 overflow-y-auto overscroll-contain p-1 scrollbar-thin sm:grid-cols-2 lg:grid-cols-1"
            >
              <li
                v-for="(player, index) in room.players"
                :key="player.id"
                class="flex items-center gap-3 rounded-box border p-3"
                :class="playerClasses(player)"
              >
                <input
                  v-if="room.phase === 'team' && isLeader"
                  :id="`seat-${player.id}`"
                  type="checkbox"
                  class="checkbox checkbox-sm shrink-0"
                  :checked="selected.includes(player.id)"
                  :disabled="
                    !canAct ||
                    (!selected.includes(player.id) &&
                      selected.length >= teamSize)
                  "
                  @change="emit('toggle-player', player.id)"
                />
                <input
                  v-else-if="canSelectPlayer(player)"
                  :id="`seat-${player.id}`"
                  type="radio"
                  class="radio radio-sm shrink-0"
                  :name="`${mobilePanelId}-${selectionMode}`"
                  :value="player.id"
                  :checked="
                    selectionMode === 'invite'
                      ? discussionPartner === player.id
                      : target === player.id
                  "
                  :disabled="!canAct"
                  @change="choosePlayer(player.id)"
                />
                <span
                  v-else
                  class="w-5 shrink-0 text-center font-mono text-sm text-base-content/50"
                  >{{ index + 1 }}</span
                >
                <component
                  :is="guessable[player.id] ? 'button' : 'div'"
                  :type="guessable[player.id] ? 'button' : undefined"
                  class="shrink-0 border-0 bg-transparent p-0"
                  :class="
                    guessable[player.id]
                      ? 'indicator cursor-pointer rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
                      : ''
                  "
                  :role="guessable[player.id] ? undefined : 'img'"
                  :aria-label="
                    guessable[player.id]
                      ? t('avalon.notes.player', { name: player.nickname })
                      : portraits[player.id]
                        ? t(`avalon.roles.${portraits[player.id].role}`)
                        : t('avalon.knowledge.unknown')
                  "
                  @click="
                    guessable[player.id] && notesMenu.open(player, $event)
                  "
                >
                  <span
                    v-if="guessable[player.id]"
                    class="indicator-item indicator-bottom indicator-end badge badge-xs z-10 size-4! rounded-full! p-0! text-[10px] ring-1 ring-base-100"
                    style="
                      --indicator-e: 0;
                      --indicator-b: 0;
                      --indicator-x: 0;
                      --indicator-y: 0;
                    "
                    aria-hidden="true"
                    ><i class="ri-pencil-line" aria-hidden="true"></i
                  ></span>
                  <div
                    class="avatar"
                    :class="player.online ? 'avatar-online' : 'avatar-offline'"
                  >
                    <div
                      class="relative size-12 overflow-hidden rounded-full bg-base-200 ring-2 ring-offset-2 ring-offset-base-100"
                      :class="
                        portraits[player.id]?.guessed
                          ? 'ring-base-content/30'
                          : knowledge[player.id]?.tone === 'evil'
                            ? 'ring-error'
                            : knowledge[player.id]?.tone === 'good'
                              ? 'ring-success'
                              : 'ring-base-300'
                      "
                    >
                      <img
                        v-if="portraits[player.id]"
                        v-bind="
                          getImageAttrs(
                            roleImage(portraits[player.id].role),
                            '96px',
                          )
                        "
                        @error="$event.currentTarget.style.opacity = '0'"
                        @load="$event.currentTarget.style.opacity = ''"
                        alt=""
                        class="absolute inset-0 h-full w-full origin-top scale-150 object-cover object-top"
                        :class="
                          portraits[player.id].guessed
                            ? 'grayscale opacity-70'
                            : ''
                        "
                      />
                      <img
                        v-else
                        v-bind="
                          getImageAttrs(
                            '/assets/images/games/avalon/card.webp',
                            '96px',
                          )
                        "
                        alt=""
                        class="h-full w-full object-cover"
                      />
                    </div>
                  </div>
                </component>
                <div class="min-w-0 flex-1">
                  <label
                    :for="
                      canSelectPlayer(player) ? `seat-${player.id}` : undefined
                    "
                    class="block wrap-break-word text-sm font-medium"
                    >{{ player.nickname }}
                    <span
                      v-if="player.id === room.selfId"
                      class="text-base-content/50"
                      >{{ t("games.you") }}</span
                    ></label
                  >
                  <div
                    class="mt-1 flex flex-wrap items-center gap-1 text-xs text-base-content/60"
                  >
                    <span v-if="player.id === room.hostId">{{
                      t("games.host")
                    }}</span>
                    <span
                      v-if="
                        player.id === room.leaderId &&
                        room.phase !== 'finished'
                      "
                      >{{ t("avalon.leader") }}</span
                    >
                    <span
                      v-if="
                        room.team.includes(player.id) && room.phase !== 'team'
                      "
                      >{{ t("avalon.onTeam") }}</span
                    >
                    <span v-if="!player.online">{{
                      t(
                        player.departed
                          ? "games.departed"
                          : "games.disconnected",
                      )
                    }}</span>
                    <span
                      v-if="
                        knowledge[player.id] &&
                        !(
                          loyaltyReports[player.id] &&
                          [
                            'avalon.loyalty.reportedGood',
                            'avalon.loyalty.reportedEvil',
                          ].includes(knowledge[player.id].label)
                        )
                      "
                      class="inline-flex items-center gap-1"
                      :class="
                        knowledge[player.id].tone === 'evil'
                          ? 'text-error'
                          : knowledge[player.id].tone === 'good'
                            ? ''
                            : 'text-warning'
                      "
                    >
                      <i
                        :class="knowledge[player.id].icon"
                        aria-hidden="true"
                      ></i>
                      {{ t(knowledge[player.id].label) }}
                    </span>
                    <span
                      v-else-if="!knowledge[player.id]"
                      class="inline-flex items-center gap-1"
                    >
                      <i class="ri-question-line" aria-hidden="true"></i>
                      {{ t("avalon.knowledge.unknown") }}
                    </span>
                    <button
                      v-if="loyaltyReports[player.id]"
                      type="button"
                      class="badge badge-ghost badge-xs gap-1"
                      :aria-label="
                        t('avalon.loyalty.result', {
                          name: player.nickname,
                          side: t(
                            `avalon.night.${loyaltyReports[player.id].alignment}`,
                          ),
                        })
                      "
                      @click="
                        emit('show-loyalty-result', loyaltyReports[player.id])
                      "
                    >
                      <i class="ri-eye-line" aria-hidden="true"></i>
                      {{
                        t(
                          loyaltyReports[player.id].alignment === "good"
                            ? "avalon.loyalty.reportedGood"
                            : "avalon.loyalty.reportedEvil",
                        )
                      }}
                    </button>
                    <button
                      v-if="player.id === room.selfId && lancelotStatus"
                      type="button"
                      class="badge badge-xs gap-1"
                      :class="lancelotStatus.tone"
                      :aria-label="lancelotStatus.description"
                      @click="reviewLancelotStatus"
                    >
                      <i :class="lancelotStatus.icon" aria-hidden="true"></i>
                      {{ t(`avalon.lancelot.states.${lancelotStatus.label}`) }}
                    </button>
                    <button
                      v-if="room.lady?.holderId === player.id"
                      type="button"
                      class="badge badge-ghost badge-xs h-auto min-h-5 gap-1"
                      :aria-label="
                        t('avalon.config.viewRole', {
                          name: t('avalon.lady.title'),
                        })
                      "
                      @click="skillPopover?.open()"
                    >
                      <img
                        v-bind="getImageAttrs(SKILL_CARDS.lady.image, '96px')"
                        alt=""
                        class="size-4 shrink-0 rounded-full object-cover object-top"
                      />
                      {{ t("avalon.lady.holder") }}
                    </button>
                    <span
                      v-if="marks[player.id]"
                      class="inline-flex items-center gap-1"
                    >
                      <i class="ri-pencil-line" aria-hidden="true"></i>
                      {{
                        t("avalon.notes.guess", {
                          role: t(markLabel(marks[player.id])),
                        })
                      }}
                    </span>
                  </div>
                </div>
              </li>
            </ol>
          </ScrollableContainer>
          <button
            v-if="isLeader && room.phase === 'team'"
            class="btn shrink-0"
            :disabled="!canAct || selected.length !== teamSize"
            @click="emit('propose-team')"
          >
            {{ t("avalon.propose") }}
          </button>
          <button
            v-if="selectionMode === 'lady'"
            type="button"
            class="btn shrink-0"
            :disabled="!canAct || !target"
            @click="emit('inspect-loyalty')"
          >
            {{ t("avalon.lady.inspect") }}
          </button>
          <button
            v-if="['assassinate', 'recruit'].includes(selectionMode)"
            type="button"
            class="btn shrink-0"
            :disabled="!canAct || !target"
            @click="emit('assassinate')"
          >
            {{
              t(
                selectionMode === "recruit"
                  ? "avalon.untrustworthy.recruit"
                  : "avalon.assassinate",
              )
            }}
          </button>
        </div>
      </section>
    </div>
    <NotesMenu ref="notesMenu" :room="room" :marks="marks" @mark="markPlayer" />
    <RolePreviewPopover ref="skillPopover" skill="lady" />
  </div>
</template>

<script setup>
import { computed, h, ref, watch } from "vue";
import { useMediaQuery } from "@vueuse/core";
import ScrollableContainer from "@/components/layout/ScrollableContainer.vue";
import { useLocale } from "@/i18n";
import { useModal } from "@/composables/useModal";
import { useAvalonNotes } from "@/composables/games/avalon/useAvalonNotes";
import { AVALON_MID_DESKTOP_QUERY } from "@/composables/games/avalon/useAvalonLayout";
import { useAvalonRoom } from "@/composables/games/avalon/useAvalonRoom";
import { getImageAttrs } from "@/utils/images/responsive-images";
import {
  LANCELOTS,
  ladyTargetIds,
  roleAlignment,
  selfAlignment,
} from "../../../../../shared/games/avalon/index.js";
import {
  knownPlayer,
  playerAlignment,
  possibleRoles,
  ROLE_ICONS,
  roleImage,
  SKILL_CARDS,
} from "@/games/avalon/presentation";
import { possibleMarks } from "@/games/avalon/notes";
import DiscussionTimerBar from "../display/DiscussionTimerBar.vue";
import LoyaltyReply from "../interaction/LoyaltyReply.vue";
import NotesMenu from "../interaction/NotesMenu.vue";
import RolePreviewPopover from "../interaction/RolePreviewPopover.vue";

const props = defineProps({
  room: { type: Object, required: true },
  canAct: Boolean,
  run: { type: Function, required: true },
  mobilePanel: { type: String, required: true },
  mobilePanelId: { type: String, required: true },
  selectionMode: { type: String, default: "" },
  selected: { type: Array, required: true },
  target: { type: String, default: "" },
});
const emit = defineEmits([
  "toggle-player",
  "select-target",
  "propose-team",
  "inspect-loyalty",
  "assassinate",
  "end-discussion",
  "show-loyalty-result",
]);

const { t } = useLocale();
const modal = useModal();
const midDesktop = useMediaQuery(AVALON_MID_DESKTOP_QUERY);
const { room, isLeader, canEndDiscussion, teamSize } = useAvalonRoom(
  () => props.room,
);
const { marks, markPlayer } = useAvalonNotes(room);

const notesMenu = ref(null);
const skillPopover = ref(null);
const discussionPartner = ref("");

watch([() => room.value.code, () => room.value.stage], () => {
  discussionPartner.value = "";
});

const markLabel = (mark) =>
  ({ good: "avalon.night.good", evil: "avalon.night.evil" })[mark] ||
  `avalon.roles.${mark}`;

const lancelotStatus = computed(() => {
  const self = room.value.self;
  if (self.lancelotMode !== "switching" || !LANCELOTS.includes(self.role))
    return null;
  const count = (self.lancelotDraws ?? []).filter(
    (entry) => entry.switched,
  ).length;
  const state =
    count === 0 ? "unchanged" : count === 1 ? "switched" : "returned";
  const current = selfAlignment(self);
  return {
    count,
    initial: roleAlignment(self.role),
    current,
    state,
    label:
      state === "switched"
        ? current === "good"
          ? "redeemed"
          : "fallen"
        : state,
    tone: {
      unchanged: "badge-ghost",
      switched: current === "good" ? "badge-success" : "badge-error",
      returned: "badge-success",
    }[state],
    icon: {
      unchanged: "ri-time-line",
      switched: current === "good" ? "ri-shield-check-line" : "ri-skull-line",
      returned: "ri-arrow-go-back-line",
    }[state],
    description: t(`avalon.lancelot.stateHints.${state}`, {
      n: count,
      side: t(`avalon.night.${current}`),
    }),
  };
});

function reviewLancelotStatus() {
  const status = lancelotStatus.value;
  if (!status) return;
  modal.info(
    t(`avalon.lancelot.states.${status.label}`),
    h("div", { class: "space-y-2 text-sm" }, [
      h(
        "p",
        { class: "text-base-content/60" },
        t("avalon.lancelot.opening", {
          side: t(`avalon.night.${status.initial}`),
        }),
      ),
      h("p", status.description),
    ]),
  );
}

const knowledge = computed(() => {
  const faceUp = !!room.value.self.role;
  return Object.fromEntries(
    room.value.players.map((player) => [
      player.id,
      knownPlayer(room.value, player, faceUp),
    ]),
  );
});

const loyaltyReports = computed(() =>
  Object.fromEntries([
    ...Object.entries(room.value.self.knownLoyalties ?? {}).map(
      ([targetId, alignment]) => [
        targetId,
        { targetId, alignment, source: "cleric", quest: 0 },
      ],
    ),
    ...(room.value.self.loyaltyObservations ?? [])
      .filter((entry) => ["lady", "cleric"].includes(entry.source))
      .map((entry) => [entry.targetId, entry]),
  ]),
);

const portraits = computed(() =>
  Object.fromEntries(
    room.value.players.map((player) => {
      const label = knowledge.value[player.id]?.label;
      const knownRole =
        room.value.phase === "finished"
          ? player.role
          : label?.startsWith("avalon.roles.")
            ? label.slice("avalon.roles.".length)
            : null;
      if (knownRole && Object.hasOwn(ROLE_ICONS, knownRole))
        return [player.id, { role: knownRole, guessed: false }];
      const mark = marks.value[player.id];
      return [
        player.id,
        Object.hasOwn(ROLE_ICONS, mark) ? { role: mark, guessed: true } : null,
      ];
    }),
  ),
);

const guessable = computed(() =>
  Object.fromEntries(
    room.value.players.map((player) => [
      player.id,
      possibleMarks(room.value, player.id).length > 0,
    ]),
  ),
);

const targets = computed(() =>
  room.value.players.filter(
    (p) =>
      p.id !== room.value.selfId &&
      (room.value.phase === "recruit"
        ? possibleRoles(room.value, p.id).includes("untrustworthy_servant")
        : playerAlignment(room.value, p.id) !== "evil"),
  ),
);

function canSelectPlayer(player) {
  if (props.selectionMode === "lady")
    return ladyTargetIds(room.value.players, room.value.lady).includes(
      player.id,
    );
  return (
    props.selectionMode === "team" ||
    (props.selectionMode === "invite" && player.id !== room.value.selfId) ||
    (["assassinate", "recruit"].includes(props.selectionMode) &&
      targets.value.some((entry) => entry.id === player.id))
  );
}

async function choosePlayer(id) {
  if (
    !props.canAct ||
    !room.value.players.some(
      (player) => player.id === id && canSelectPlayer(player),
    )
  )
    return;
  if (["assassinate", "recruit", "lady"].includes(props.selectionMode))
    emit("select-target", id);
  else if (props.selectionMode === "invite") {
    discussionPartner.value = id;
    await props.run("discussion_partner", { targetId: id });
    if (!room.value.discussion?.partnerId) discussionPartner.value = "";
  }
}

function playerClasses(player) {
  const tone = knowledge.value[player.id]?.tone;
  const background =
    { evil: "bg-error/5", candidate: "bg-warning/5" }[tone] || "";
  const border =
    (props.selectionMode === "team" && props.selected.includes(player.id)) ||
    (props.selectionMode === "invite" &&
      discussionPartner.value === player.id) ||
    (["assassinate", "recruit", "lady"].includes(props.selectionMode) &&
      props.target === player.id)
      ? "border-primary"
      : {
          evil: "border-error/30",
          candidate: "border-warning/30",
        }[tone] || "border-base-300";
  return [background, border];
}
</script>
