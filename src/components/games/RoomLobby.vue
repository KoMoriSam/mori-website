<template>
  <section class="card">
    <div class="card-body gap-3 p-0">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
        <PlayerAvatars :room="room" />
        <div class="min-w-0 flex-1 basis-56">
          <h2 class="card-title font-serif" aria-live="polite" aria-atomic="true">
            {{ lobbySummary.title }}
          </h2>
          <p class="mt-1 text-sm text-base-content/70">
            {{ lobbySummary.description }}
          </p>
        </div>
      </div>
      <p
        v-if="room.lobbyStartsAt"
        role="timer"
        aria-live="polite"
        class="flex items-center gap-2 text-sm font-medium"
      >
        <i class="ri-timer-line" aria-hidden="true"></i>
        <I18nT keypath="games.lobbyStatus.seconds" tag="span" scope="global">
          <template #n>
            <span class="countdown font-mono text-lg">
              <span :style="{ '--value': startSeconds }">{{ startSeconds }}</span>
            </span>
          </template>
        </I18nT>
      </p>
      <ol class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <li
          v-for="(player, index) in lobbySeats"
          :key="index"
          class="flex h-16 min-w-0 items-center gap-2 rounded-box border p-2"
          :class="
            player
              ? player.ready
                ? 'bg-success/10 border-success'
                : 'border-base-300'
              : 'border-dashed border-base-300'
          "
        >
          <span class="font-mono text-sm text-base-content/50">{{
            index + 1
          }}</span>
          <template v-if="player">
            <Tooltip
              trigger-class="block"
              :as="player.id === room.selfId ? 'button' : 'div'"
              :type="player.id === room.selfId ? 'button' : undefined"
              class="shrink-0 rounded-full border-0 bg-transparent p-0"
              :class="
                player.id === room.selfId
                  ? 'indicator cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
                  : ''
              "
              :aria-label="
                player.id === room.selfId ? t('auth.editProfile') : undefined
              "
              :text="
                player.id === room.selfId ? t('auth.editProfile') : undefined
              "
              :disabled="player.id === room.selfId ? !canAct : undefined"
              @click="player.id === room.selfId && emit('edit-profile')"
            >
              <span
                v-if="player.id === room.selfId"
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
              <Avatar
                ring
                :ring-dashed="!player.ready"
                :src="player.avatarUrl"
                :name="player.nickname"
                :class="player.online ? 'avatar-online' : 'avatar-offline'"
              />
            </Tooltip>
            <div class="min-w-0 flex-1">
              <div class="flex min-w-0 items-center gap-1">
                <Tooltip
                  overflow-only
                  placement="bottom"
                  align="start"
                  as="p"
                  trigger-class="block"
                  class="min-w-0 text-sm font-medium"
                  :text="player.nickname"
                  :aria-label="player.nickname"
                  ><span class="block min-w-0 truncate">
                    {{ player.nickname }}
                    <span
                      v-if="player.id === room.selfId"
                      class="text-base-content/50"
                      >{{ t("games.you") }}</span
                    >
                  </span></Tooltip
                >
              </div>
              <div
                class="mt-1 flex min-w-0 gap-2 overflow-hidden whitespace-nowrap text-xs text-base-content/60"
              >
                <span v-if="player.id === room.hostId">{{
                  t("games.host")
                }}</span>
                <span v-if="player.ready">{{ t("games.ready") }}</span>
                <span v-else>{{ t("games.notReady") }}</span>
                <span v-if="!player.online">{{ t("games.disconnected") }}</span>
              </div>
            </div>
            <button
              v-if="player.id === room.selfId"
              class="btn btn-ghost btn-xs shrink-0"
              :disabled="!canAct"
              @click="run('ready', { ready: !player.ready })"
            >
              {{ player.ready ? t("games.unready") : t("games.prepare") }}
            </button>
            <Tooltip
              v-else-if="isHost"
              as="button"
              trigger-class="inline-flex"
              type="button"
              class="btn btn-ghost btn-xs shrink-0"
              :disabled="!canAct"
              :aria-label="t('games.kickPlayer', { name: player.nickname })"
              :text="t('games.kickPlayer', { name: player.nickname })"
              @click="emit('kick-player', player)"
            >
              {{ t("games.kickPlayer") }}
            </Tooltip>
          </template>
          <button
            v-else
            type="button"
            class="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-1 rounded-field text-left text-sm text-base-content/60 hover:text-base-content focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed"
            :disabled="!canAct"
            :aria-label="t('games.moveSeat', { n: index + 1 })"
            @click="run('move_seat', { seat: index })"
          >
            <i class="ri-add-line text-base" aria-hidden="true"></i>
            {{ t("games.emptySeat") }}
          </button>
        </li>
      </ol>
      <slot name="lobby-guide" :room="room" :can-act="canAct" :run="run"></slot>
      <slot name="settings" :room="room" :can-act="canAct" :run="run"></slot>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Translation as I18nT } from "vue-i18n";
import Avatar from "@/components/auth/Avatar.vue";
import Tooltip from "@/components/display/Tooltip.vue";
import PlayerAvatars from "@/components/games/display/PlayerAvatars.vue";
import { useLocale } from "@/i18n";

const props = defineProps({
  room: { type: Object, required: true },
  connection: { type: String, required: true },
  canAct: Boolean,
  isHost: Boolean,
  run: { type: Function, required: true },
});
const emit = defineEmits(["edit-profile", "kick-player"]);

const { t } = useLocale();
const now = ref(Date.now());
let clockOffset = 0;
let clockTimer;

function syncCountdownTimer(startsAt) {
  clearInterval(clockTimer);
  if (startsAt) {
    clockTimer = setInterval(() => {
      now.value = Date.now() + clockOffset;
    }, 250);
  }
}

watch(
  () => props.room.serverNow,
  (serverNow) => {
    clockOffset = (serverNow ?? Date.now()) - Date.now();
    now.value = Date.now() + clockOffset;
  },
  { immediate: true },
);
watch(() => props.room.lobbyStartsAt, syncCountdownTimer);
onMounted(() => syncCountdownTimer(props.room.lobbyStartsAt));
onBeforeUnmount(() => clearInterval(clockTimer));

const startSeconds = computed(() =>
  Math.min(
    5,
    Math.max(
      0,
      Math.ceil(((props.room.lobbyStartsAt ?? 0) - now.value) / 1000),
    ),
  ),
);

const canStart = computed(
  () =>
    props.room.players.length >= props.room.limits.minPlayers &&
    props.room.players.length <= props.room.limits.maxPlayers &&
    props.room.players.every((p) => p.ready && p.online),
);

const lobbySeats = computed(() => {
  const seats = Array(props.room.limits.maxPlayers).fill(null);
  props.room.players.forEach((player, index) => {
    seats[player.seat ?? index] = player;
  });
  return seats;
});

const lobbySummary = computed(() => {
  const { players, limits } = props.room;
  const current = players.length;
  const min = limits.minPlayers;
  const max = limits.maxPlayers;
  const offline = players.filter((player) => !player.online).length;
  const unready = players.filter((player) => !player.ready).length;
  if (current < min) {
    return {
      title: t("games.lobbyStatus.needPlayers", { min }),
      description: t("games.lobbyStatus.missingHint", {
        current,
        n: min - current,
      }),
    };
  }
  const title = offline
    ? t("games.lobbyStatus.offline", { n: offline })
    : unready
      ? t("games.lobbyStatus.unready", { n: unready })
      : props.connection !== "online"
        ? t("games.lobbyStatus.connection")
        : t("games.lobbyStatus.starting");
  const capacity =
    current < max
      ? t("games.lobbyStatus.morePlayers", { n: max - current })
      : t("games.lobbyStatus.full");
  return {
    title,
    description: canStart.value
      ? t("games.lobbyStatus.countdownHint")
      : capacity,
  };
});
</script>
