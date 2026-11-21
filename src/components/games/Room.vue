<template>
  <div
    ref="roomRoot"
    class="min-w-0 flex-1"
    :class="[
      entryBackdropVisible ? 'relative isolate' : '',
      showSidebar
        ? 'drawer drawer-end max-lg:fixed max-lg:inset-0 max-lg:grid-rows-[minmax(0,1fr)] max-lg:overflow-hidden lg:drawer-open'
        : fullscreenPhase
          ? 'flex min-h-dvh flex-col'
          : 'flex flex-col',
    ]"
  >
    <Transition
      enter-active-class="transition-opacity duration-400 ease-out motion-reduce:transition-none"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-400 ease-in-out motion-reduce:transition-none"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
      @before-enter="entryBackdropVisible = true"
      @after-leave="entryBackdropVisible = !room"
    >
      <EntryBackdrop
        v-if="!room"
        ref="entryBackdrop"
        :definition="definition"
      />
    </Transition>
    <input
      v-if="showSidebar"
      :id="sidebarId"
      type="checkbox"
      class="drawer-toggle"
      :checked="sidebarExpanded && desktopViewport"
    />
    <div
      class="flex min-w-0 flex-1 flex-col"
      :class="
        showSidebar ? 'drawer-content min-h-0 overflow-hidden lg:h-dvh' : ''
      "
    >
      <ContentPage
        ref="contentPage"
        :title="t(definition.titleKey)"
        :description="t(definition.descriptionKey)"
        :viewport-section="!room"
        :show-footer="!showSidebar"
        :fill-height="showSidebar"
        :compact-header="!!room && room.status !== 'lobby'"
        :actions-end="!!room"
        hide-mobile-footer
      >
        <template v-if="$slots['page-notice'] && room" #header-notice>
          <slot name="page-notice"></slot>
        </template>
        <template #meta>
          <template v-if="!room">
            <span class="inline-flex items-center gap-1.5">
              <i class="ri-group-line" aria-hidden="true"></i>
              {{
                t("games.playerRange", {
                  min: definition.minPlayers,
                  max: definition.maxPlayers,
                })
              }}
            </span>
            <span
              v-for="info in definition.metadata"
              :key="info.labelKey"
              class="inline-flex items-center gap-1.5"
            >
              <i :class="info.icon" aria-hidden="true"></i>
              {{ t(info.labelKey) }}
            </span>
          </template>
          <template v-else>
            <div class="inline-flex shrink-0 items-center gap-3">
              <span class="inline-flex items-center gap-1.5">
                <i class="ri-door-open-line" aria-hidden="true"></i>
                <span class="hidden sm:block">{{ t("games.roomCode") }}</span>
                <span class="font-mono tracking-widest">{{ room.code }}</span>
              </span>
              <span
                class="inline-flex items-center gap-1.5 whitespace-nowrap"
                role="status"
                aria-live="polite"
              >
                <span
                  v-if="connectionLoading"
                  class="loading loading-spinner loading-xs"
                  aria-hidden="true"
                ></span>
                <i v-else :class="connectionIcon" aria-hidden="true"></i>
                {{ t(`games.connections.${connection}`) }}
              </span>
            </div>
            <div
              v-if="room.status !== 'lobby'"
              class="inline-flex min-w-min max-w-full flex-1 items-center gap-2 sm:basis-0 max-sm:min-w-0 max-sm:w-full max-sm:basis-full"
              :aria-label="avatarSummary.label"
            >
              <PlayerAvatars
                :room="room"
                :active-ids="roomProgress?.playerIds"
                :submissions="roomProgress?.submissions"
                :label="avatarSummary.label"
                compact
              />
              <Tooltip
                as="span"
                trigger-class="inline-flex"
                placement="bottom"
                align="end"
                :text="avatarSummary.label"
                class="inline-flex shrink-0 items-center gap-1 whitespace-nowrap"
                role="status"
                aria-live="polite"
              >
                <i
                  v-if="roomProgress"
                  :class="roomProgress.icon"
                  aria-hidden="true"
                ></i>
                <span aria-hidden="true">{{
                  roomProgress
                    ? t(roomProgress.textKey)
                    : t("games.progress.online")
                }}</span>
                <span class="font-mono tabular-nums" aria-hidden="true"
                  >{{ avatarSummary.count }}/{{ avatarSummary.total }}</span
                >
                <span class="sr-only">{{ avatarSummary.label }}</span>
              </Tooltip>
            </div>
          </template>
        </template>
        <template #actions>
          <div
            v-if="!room"
            role="tablist"
            class="tabs tabs-box w-fit bg-base-100/60 backdrop-blur-sm"
          >
            <button
              v-for="mode in ['create', 'join']"
              :key="mode"
              :id="`game-entry-${mode}`"
              type="button"
              role="tab"
              class="tab"
              :class="{ 'tab-active': entryMode === mode }"
              :aria-selected="entryMode === mode"
              aria-controls="game-entry-panel"
              :tabindex="entryMode === mode ? 0 : -1"
              :disabled="entryDisabled"
              @click="selectEntryMode(mode)"
              @keydown.left.prevent="
                selectEntryMode(mode === 'create' ? 'join' : 'create', $event)
              "
              @keydown.right.prevent="
                selectEntryMode(mode === 'create' ? 'join' : 'create', $event)
              "
            >
              {{ t(`games.${mode}`) }}
            </button>
          </div>
          <div
            v-else
            class="flex items-center justify-end gap-1 max-sm:has-[>:nth-child(5_of_:not(dialog))]:w-20 max-sm:has-[>:nth-child(5_of_:not(dialog))]:flex-wrap max-sm:has-[>:nth-child(7_of_:not(dialog))]:w-27"
          >
            <Tooltip
              as="div"
              trigger-class=""
              activation-class="tooltip"
              class="tooltip-bottom"
              :text="
                t(audioEnabled ? 'games.audio.disable' : 'games.audio.enable')
              "
            >
              <button
                type="button"
                class="btn btn-square btn-xs"
                :aria-label="
                  t(audioEnabled ? 'games.audio.disable' : 'games.audio.enable')
                "
                :aria-pressed="audioEnabled"
                @click="toggleAudio"
              >
                <i
                  :class="
                    audioEnabled ? 'ri-volume-up-line' : 'ri-volume-mute-line'
                  "
                  aria-hidden="true"
                ></i>
              </button>
            </Tooltip>
            <slot name="page-actions" :room="room"></slot>
            <Tooltip
              v-for="action in roomActions"
              :key="action.key"
              as="div"
              trigger-class=""
              activation-class="tooltip"
              class="tooltip-bottom"
              :text="action.label"
            >
              <button
                type="button"
                class="btn btn-square btn-xs"
                :aria-label="action.label"
                :disabled="action.disabled"
                @click="action.onClick()"
              >
                <i :class="action.icon" aria-hidden="true"></i>
              </button>
            </Tooltip>
          </div>
        </template>
        <div
          v-if="room && error"
          role="alert"
          class="alert alert-error alert-soft alert-vertical mb-4 sm:alert-horizontal"
        >
          <span class="min-w-0 flex-1 text-sm">{{ errorText }}</span>
          <button
            v-if="canReconnect && connection !== 'online'"
            type="button"
            class="btn btn-sm"
            @click="confirmReconnect"
          >
            <i class="ri-cloud-line" aria-hidden="true"></i>
            {{ t("games.reconnect") }}
          </button>
        </div>
        <p
          v-if="room && !storageAvailable"
          role="status"
          class="mb-4 text-sm text-warning"
        >
          {{ t("games.storageWarning") }}
        </p>
        <EntryLayout v-if="!room">
          <template #form>
            <RoomEntryForm
              :mode="entryMode"
              v-model:nickname="nickname"
              v-model:code="code"
              :github="useGithubProfile"
              :disabled="entryDisabled"
              :loading="entryLoading"
              :can-reconnect="canReconnect && connection !== 'online'"
              @update:github="chooseProfile"
              @submit="handleEnterRoom"
              @reconnect="confirmReconnect"
              @before-code-leave="freezeCodeLayout"
              @code-leave-cancelled="restoreCodeLayout"
            />
          </template>
          <template #instructions>
            <slot name="instructions"></slot>
          </template>
        </EntryLayout>
        <div
          v-else
          :class="
            showSidebar ? 'flex min-h-0 flex-1 flex-col gap-5' : 'space-y-5'
          "
        >
          <label v-if="showInvite" class="block text-sm">
            {{ t("games.invite") }}
            <input
              class="input mt-2 w-full text-xs"
              readonly
              :value="inviteUrl"
              @focus="$event.target.select()"
            />
          </label>
          <RoomLobby
            v-if="room.status === 'lobby'"
            :room="room"
            :connection="connection"
            :can-act="canAct"
            :is-host="isHost"
            :run="run"
            @edit-profile="editProfile"
            @kick-player="kickPlayer"
          >
            <template #lobby-guide="slotProps">
              <slot name="lobby-guide" v-bind="slotProps"></slot>
            </template>
            <template #settings="slotProps">
              <slot name="settings" v-bind="slotProps"></slot>
            </template>
          </RoomLobby>
          <div
            v-else
            :class="showSidebar ? 'min-h-0 flex-1 max-lg:overflow-hidden' : ''"
          >
            <slot
              :room="room"
              :can-act="canAct"
              :run="run"
              :error="error ? errorText : ''"
            ></slot>
          </div>
        </div>
      </ContentPage>
    </div>
    <aside
      v-if="showSidebar"
      class="drawer-side lg:overflow-y-hidden! lg:shadow-md lg:[clip-path:inset(0_-8px_0_-20rem)] lg:is-drawer-close:overflow-visible!"
    >
      <label
        :for="sidebarId"
        class="drawer-overlay"
        :aria-label="t('common.modal.close')"
      ></label>
      <div
        class="min-w-0 w-96 h-dvh bg-base-100 lg:sticky lg:top-0 lg:is-drawer-close:w-14"
      >
        <div
          class="relative flex h-full min-h-0 flex-col px-4 py-2 lg:is-drawer-close:px-1"
        >
          <Tooltip
            as="button"
            trigger-class=""
            activation-class="lg:is-drawer-close:tooltip"
            type="button"
            class="btn btn-ghost btn-sm btn-square text-base mb-2 hidden shrink-0 self-end lg:inline-flex lg:is-drawer-open:absolute lg:is-drawer-open:right-4 lg:is-drawer-open:top-2 lg:is-drawer-open:z-10 lg:is-drawer-open:mb-0 lg:is-drawer-close:self-center lg:is-drawer-close:tooltip-left"
            :aria-label="
              t(
                sidebarExpanded
                  ? 'common.sidebar.close'
                  : 'common.sidebar.open',
              )
            "
            :text="
              t(
                sidebarExpanded
                  ? 'common.sidebar.close'
                  : 'common.sidebar.open',
              )
            "
            @click="sidebarExpanded = !sidebarExpanded"
          >
            <i
              :class="
                sidebarExpanded
                  ? 'ri-sidebar-unfold-line'
                  : 'ri-sidebar-fold-line'
              "
              aria-hidden="true"
            ></i>
          </Tooltip>
          <div class="min-h-0 flex-1">
            <slot
              name="sidebar"
              :room="room"
              :can-act="canAct"
              :run="run"
              :expand-sidebar="expandSidebar"
            ></slot>
          </div>
        </div>
      </div>
    </aside>
  </div>
  <Footer v-if="showSidebar" class="hidden lg:grid" />
</template>

<script setup>
import { computed, onMounted, ref, useId, useSlots, watch } from "vue";
import Tooltip from "@/components/display/Tooltip.vue";
import ContentPage from "@/components/layout/ContentPage.vue";
import Footer from "@/components/layout/Footer.vue";
import EntryLayout from "@/components/games/layout/EntryLayout.vue";
import EntryBackdrop from "@/components/games/display/EntryBackdrop.vue";
import PlayerAvatars from "@/components/games/display/PlayerAvatars.vue";
import RoomEntryForm from "@/components/games/RoomEntryForm.vue";
import RoomLobby from "@/components/games/RoomLobby.vue";
import { useViewportSection } from "@/composables/layout/useViewportSection";
import { useGameRoom } from "@/composables/games/useGameRoom";
import { useRoomViewport } from "@/composables/games/useRoomViewport";
import { useRoomProfile } from "@/composables/games/useRoomProfile";
import { useEntryTransition } from "@/composables/games/useEntryTransition";
import { useEntryFeedback } from "@/composables/games/useEntryFeedback";
import { usePlayerAvatarColors } from "@/composables/games/usePlayerAvatarColors";
import { useGameAudio } from "@/composables/games/useGameAudio";
import { useGameRoomActivity } from "@/composables/games/useGameRoomActivity";
import { useModal } from "@/composables/useModal";
import { useLocale } from "@/i18n";
import { findGame } from "@/games/catalog";

const props = defineProps({
  gameType: { type: String, required: true },
  entryNotice: { type: String, default: "" },
});
const emit = defineEmits(["room-state", "room-activity"]);

const slots = useSlots();
const definition = findGame(props.gameType);
const { t, i18n } = useLocale();
const modal = useModal();

const roomRoot = ref(null);
const contentPage = ref(null);
const entryBackdrop = ref(null);
const sidebarId = `game-sidebar-${useId()}`;

useViewportSection({
  target: computed(() => contentPage.value?.mainElement ?? null),
});

const {
  room,
  code,
  error,
  connection,
  canReconnect,
  busy,
  sending,
  storageAvailable,
  openRoom,
  run,
  leave,
  reconnect,
} = useGameRoom(props.gameType);

const entryBackdropVisible = ref(!room.value);
watch(
  () => !!room.value,
  (entered) => {
    if (entered) entryBackdrop.value?.freezeLayout();
  },
  { flush: "pre" },
);

usePlayerAvatarColors(room, code);

const {
  enabled: audioEnabled,
  observe: observeAudio,
  toggle: toggleAudio,
  playActivity,
} = useGameAudio(props.gameType);
const roomActivity = useGameRoomActivity((kind) => {
  playActivity(kind);
  emit("room-activity", kind);
});
watch(
  [room, connection],
  ([state, status]) => {
    observeAudio(state, status);
    emit("room-state", state, status);
    roomActivity.observe(state, status);
  },
  { immediate: true },
);

const {
  sidebarExpanded,
  desktopViewport,
  fullscreenPhase,
  showSidebar,
  expandSidebar,
} = useRoomViewport({
  roomRoot,
  room,
  connection,
  hasSidebar: computed(() => !!slots.sidebar),
  fullscreenPhases: definition.fullscreenPhases ?? [],
});

const errorText = computed(() => {
  const common = `games.errors.${error.value}`;
  const specific = `${props.gameType}.errors.${error.value}`;
  return t(
    i18n.global.te(common)
      ? common
      : i18n.global.te(specific)
        ? specific
        : "games.errors.SERVER",
  );
});

useEntryFeedback({
  room,
  error,
  errorText,
  storageAvailable,
  notice: () => props.entryNotice,
});

const canAct = computed(() => connection.value === "online" && !sending.value);
const selfPlayer = computed(() =>
  room.value?.players.find((p) => p.id === room.value.selfId),
);
const isHost = computed(() => room.value?.hostId === room.value?.selfId);

const {
  auth,
  nickname,
  useGithubProfile,
  selectedProfile,
  chooseProfile,
  editProfile,
} = useRoomProfile({
  room,
  selfPlayer,
  canAct,
  error,
  errorText,
  storageAvailable,
  run,
});

const entryMode = ref("create");
const { freezeCodeLayout, restoreCodeLayout } = useEntryTransition(
  roomRoot,
  entryMode,
);
onMounted(() => {
  if (code.value) entryMode.value = "join";
});

const connectionLoading = computed(
  () =>
    connection.value === "connecting" || connection.value === "reconnecting",
);
const connectionIcon = computed(
  () =>
    ({
      online: "ri-wifi-line",
      offline: "ri-wifi-off-line",
      replaced: "ri-device-line",
    })[connection.value] || "ri-wifi-off-line",
);
const entryDisabled = computed(() => busy.value || auth.state.checking);
const entryLoading = computed(
  () => entryDisabled.value || connectionLoading.value,
);

function selectEntryMode(mode, event) {
  if (entryDisabled.value) return;
  entryMode.value = mode;
  error.value = "";
  if (event) {
    event.currentTarget.parentElement
      .querySelector(`#game-entry-${mode}`)
      ?.focus();
  }
}

function handleEnterRoom(join) {
  if (entryDisabled.value) return;
  void openRoom(join, nickname.value, selectedProfile.value);
}

const copied = ref(false);
const showInvite = ref(false);
const onlinePlayerCount = computed(
  () => room.value?.players.filter((player) => player.online).length ?? 0,
);
const roomProgress = computed(
  () => definition.playerProgress?.(room.value) ?? null,
);
const avatarSummary = computed(() => {
  const progress = roomProgress.value;
  return progress
    ? {
        count: progress.count,
        total: progress.total,
        label: t(progress.labelKey, {
          n: progress.count,
          total: progress.total,
        }),
      }
    : {
        count: onlinePlayerCount.value,
        total: room.value?.players.length ?? 0,
        label: t("games.onlinePlayers", { n: onlinePlayerCount.value }),
      };
});

const inviteUrl = computed(() =>
  import.meta.env.SSR || !room.value
    ? ""
    : `${window.location.origin}${definition.path}?room=${room.value.code}`,
);

async function copyInvite() {
  try {
    await navigator.clipboard.writeText(inviteUrl.value);
    copied.value = true;
  } catch {
    showInvite.value = true;
  }
}

const roomActions = computed(() => {
  if (!room.value) return [];
  const actions = [];
  const add = (key, icon, label, onClick, disabled = false) => {
    actions.push({ key, icon, label, onClick, disabled });
  };
  if (canReconnect.value && connection.value !== "online")
    add("reconnect", "ri-cloud-line", t("games.reconnect"), confirmReconnect);
  add(
    "invite",
    "ri-link",
    t(copied.value ? "games.copied" : "games.invite"),
    copyInvite,
  );
  if (isHost.value && room.value.status === "playing") {
    add("end", "ri-stop-circle-line", t("games.end"), endGame, !canAct.value);
  }
  if (isHost.value && room.value.status === "finished") {
    add(
      "restart",
      "ri-arrow-go-back-line",
      t("games.restart"),
      () =>
        confirmRoomAction("restart", "confirmRestart", "restart", "finished"),
      !canAct.value,
    );
  }
  if (isHost.value && ["playing", "finished"].includes(room.value.status)) {
    const playing = room.value.status === "playing";
    add(
      "quick-start",
      "ri-refresh-line",
      t(playing ? "games.quickRestart" : "games.quickStart"),
      () =>
        confirmRoomAction(
          playing ? "quickRestart" : "quickStart",
          playing ? "confirmQuickRestart" : "confirmQuickStart",
          "quick_start",
          playing ? "playing" : "finished",
        ),
      !canAct.value,
    );
  }
  if (isHost.value)
    add(
      "dissolve",
      "ri-close-circle-line",
      t("games.dissolve"),
      dissolveRoom,
      !canAct.value,
    );
  add(
    "leave",
    "ri-logout-box-line",
    t("games.leave"),
    leaveRoom,
    sending.value,
  );
  return actions;
});

function endGame() {
  confirmRoomAction("end", "confirmEnd", "end", "playing");
}

function kickPlayer(player) {
  const { code: roomCode, stage } = room.value;
  modal.confirm(
    t("games.kickPlayer", { name: player.nickname }),
    t("games.confirmKick", { name: player.nickname }),
    {
      buttonText: t("games.kick"),
      onSubmit: () => {
        if (
          canAct.value &&
          isHost.value &&
          room.value?.code === roomCode &&
          room.value.stage === stage &&
          room.value.status === "lobby" &&
          player.id !== room.value.selfId &&
          room.value.players.some((target) => target.id === player.id)
        )
          void run("kick", { targetId: player.id });
      },
    },
  );
}

function confirmRoomAction(label, message, type, status) {
  const { code: roomCode, round, stage } = room.value;
  modal.confirm(t(`games.${label}`), t(`games.${message}`), {
    buttonText: t(`games.${label}`),
    onSubmit: () => {
      if (
        room.value?.code === roomCode &&
        room.value.round === round &&
        room.value.stage === stage &&
        room.value.status === status &&
        isHost.value &&
        canAct.value
      )
        void run(type);
    },
  });
}

function leaveRoom() {
  const { code: roomCode, round, status } = room.value;
  modal.confirm(
    t("games.leave"),
    t(status === "playing" ? "games.confirmLeave" : "games.confirmLeaveRoom"),
    {
      buttonText: t("games.leave"),
      onSubmit: () => {
        if (
          room.value?.code === roomCode &&
          room.value.round === round &&
          room.value.status === status &&
          !sending.value
        )
          void leave();
      },
    },
  );
}

function dissolveRoom() {
  if (!room.value || !isHost.value || !canAct.value) return;
  confirmRoomAction(
    "dissolve",
    "confirmDissolve",
    "dissolve",
    room.value.status,
  );
}

function confirmReconnect() {
  if (!room.value && entryDisabled.value) return;
  const roomCode = room.value?.code || code.value;
  modal.confirm(t("games.reconnect"), t("games.confirmReconnect"), {
    buttonText: t("games.reconnect"),
    onSubmit: () => {
      if (!room.value && entryDisabled.value) return;
      if (
        code.value === roomCode &&
        canReconnect.value &&
        connection.value !== "online"
      )
        reconnect();
    },
  });
}
</script>
