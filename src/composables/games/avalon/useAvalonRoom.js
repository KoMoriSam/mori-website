import { computed, ref, toValue, watch } from "vue";
import { useLocale } from "@/i18n";
import { selfAlignment } from "../../../../shared/games/avalon/index.js";
import { canDiscuss } from "../../../../shared/games/avalon/discussion.js";

export function flattenAvalonRoom(raw) {
  return {
    ...raw,
    ...raw.game,
    game: raw.round,
    players: raw.players.map((player) => ({
      ...player,
      ...(raw.game.revealedRoles
        ? { role: raw.game.revealedRoles[player.id] }
        : {}),
    })),
  };
}

export function useAvalonRoom(rawRoom) {
  const { t } = useLocale();
  const room = computed(() => {
    const value = toValue(rawRoom);
    return value.game && typeof value.game === "object"
      ? flattenAvalonRoom(value)
      : value;
  });

  const participantsById = computed(
    () =>
      new Map(
        room.value.participants.map((player) => [player.id, player.nickname]),
      ),
  );
  const playerName = (id) =>
    participantsById.value.get(id) || t("games.departed");

  const recordedQuests = computed(() =>
    [...new Set(room.value.history.map((entry) => entry.quest))].sort(
      (a, b) => a - b,
    ),
  );
  const isLeader = computed(() => room.value.leaderId === room.value.selfId);
  const evil = computed(() => selfAlignment(room.value.self) === "evil");
  const canSpeak = computed(() => canDiscuss(room.value, room.value.selfId));
  const canEndEvilDiscussion = computed(
    () => evil.value && room.value.self.role !== "oberon",
  );
  const canEndDiscussion = computed(() =>
    room.value.phase === "discussion"
      ? isLeader.value
      : room.value.phase === "evil_discussion" && canEndEvilDiscussion.value,
  );
  const teamSize = computed(
    () => room.value.teamSizes[room.value.questIndex] || 0,
  );
  const isQuestMember = computed(
    () =>
      room.value.phase === "quest" &&
      room.value.team.includes(room.value.selfId),
  );
  const allowedQuestCards = computed(() =>
    room.value.self.questChoices?.length
      ? room.value.self.questChoices
      : evil.value
        ? [true, false]
        : [true],
  );
  const canAssassinate = computed(
    () =>
      room.value.phase === "assassinate" &&
      (room.value.assassinationActorId
        ? room.value.assassinationActorId === room.value.selfId
        : room.value.self.role === "assassin"),
  );

  return {
    room,
    playerName,
    recordedQuests,
    isLeader,
    evil,
    canSpeak,
    canEndEvilDiscussion,
    canEndDiscussion,
    teamSize,
    isQuestMember,
    allowedQuestCards,
    canAssassinate,
  };
}

export function useAvalonUnread(room, { shouldSkip, onReset } = {}) {
  const unread = ref(0);

  watch(
    [
      () => room.value.code,
      () => room.value.game,
      () => room.value.selfId,
      () => room.value.messages ?? [],
    ],
    ([code, game, selfId, messages], previous) => {
      if (
        !previous ||
        code !== previous[0] ||
        game !== previous[1] ||
        selfId !== previous[2]
      ) {
        unread.value = 0;
        if (previous) onReset?.();
        return;
      }
      if (shouldSkip?.()) return;
      const seen = new Set(previous[3].map((message) => message.id));
      unread.value += messages.filter(
        (message) => !seen.has(message.id) && message.playerId !== selfId,
      ).length;
    },
    { immediate: true },
  );

  return {
    unread,
    clearUnread() {
      unread.value = 0;
    },
  };
}
