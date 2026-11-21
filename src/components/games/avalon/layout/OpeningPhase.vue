<template>
  <ScrollableContainer class="flex-1">
    <section class="flex min-h-0 flex-1 flex-col overflow-y-auto text-center">
      <div class="my-auto flex w-full shrink-0 flex-col items-center gap-4 py-6">
        <h2 class="text-sm text-base-content/60">
          {{ t("avalon.opening.title") }}
        </h2>
        <Avatar
          ring
          :src="openingLeader?.avatarUrl || ''"
          :name="playerName(room.openingLeaderId)"
          :class="openingLeader?.online ? 'avatar-online' : 'avatar-offline'"
          class="[&>div]:size-20 sm:[&>div]:size-24 [&_i]:text-4xl [&_span]:text-4xl"
        />
        <p
          class="max-w-full wrap-break-word font-serif text-2xl font-semibold sm:text-3xl"
        >
          {{ playerName(room.openingLeaderId) }}
          <span
            v-if="room.openingLeaderId === room.selfId"
            class="text-base font-normal text-base-content/50 sm:text-lg"
            >{{ t("games.you") }}</span
          >
        </p>
        <p class="text-sm text-base-content/60">
          {{ t("avalon.opening.hint") }}
        </p>
        <button
          type="button"
          class="btn"
          :disabled="!canAct || room.self.openingConfirmed"
          @click="run('confirm_opening')"
        >
          {{
            t(
              room.self.openingConfirmed
                ? "avalon.opening.confirmed"
                : "avalon.opening.confirm",
            )
          }}
        </button>
        <section class="mt-2 w-full max-w-xl space-y-4 text-left">
          <h3 class="font-serif text-lg font-semibold">
            {{ t("avalon.config.title") }}
          </h3>
          <ConfigurationSummary :room="room" />
        </section>
      </div>
    </section>
  </ScrollableContainer>
</template>

<script setup>
import { computed } from "vue";
import Avatar from "@/components/auth/Avatar.vue";
import ScrollableContainer from "@/components/layout/ScrollableContainer.vue";
import { useLocale } from "@/i18n";
import ConfigurationSummary from "../display/ConfigurationSummary.vue";

const props = defineProps({
  room: { type: Object, required: true },
  canAct: Boolean,
  run: { type: Function, required: true },
  playerName: { type: Function, required: true },
});

const { t } = useLocale();
const openingLeader = computed(() =>
  props.room.players.find(
    (player) => player.id === props.room.openingLeaderId,
  ),
);
</script>
