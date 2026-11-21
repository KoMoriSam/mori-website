<template>
  <section ref="nightSection" class="card">
    <div
      class="card-body items-center gap-3 px-0 py-2 text-center lg:gap-4 lg:py-4"
    >
      <hgroup class="flex shrink-0 flex-col items-center gap-2 lg:gap-4">
        <div class="flex flex-wrap items-center justify-center gap-2">
          <h2 class="card-title font-serif text-xl sm:text-2xl">
            <i class="ri-moon-clear-line font-normal" aria-hidden="true"></i>
            {{ t("avalon.phases.night") }}
          </h2>
        </div>
        <p class="max-w-lg text-sm text-base-content/70">
          {{ t("avalon.night.invitation") }}
          <button
            type="button"
            class="link link-hover link-primary text-xs"
            @click="reviewConfiguration"
          >
            {{ t("avalon.config.title") }}
            <i class="ri-external-link-line" aria-hidden="true"></i>
          </button>
        </p>
      </hgroup>
      <div
        ref="nightCards"
        class="grid w-full min-w-0 grid-cols-[repeat(var(--night-card-count),minmax(0,1fr))] gap-3"
        :class="nightCardCount === 3 ? 'max-sm:grid-cols-2' : ''"
        :style="{
          '--night-card-count': nightCardCount,
          maxWidth: `${nightCardGridWidth}px`,
        }"
      >
        <IdentityCard
          :class="
            nightCardCount === 3
              ? 'col-start-1 col-span-2 row-start-1 justify-self-center sm:col-start-2 sm:col-span-1'
              : ''
          "
          :self="room.self"
          :game-config="room.gameConfig"
          :self-id="room.selfId"
          :player-name="playerName"
          :face-up="showRole"
          :disabled="!room.self.roleRevealed && !canAct"
          :back-title="
            t(
              room.self.nightConfirmed
                ? 'avalon.night.confirmed'
                : 'avalon.night.sealed',
            )
          "
          :back-hint="
            t(
              room.self.nightConfirmed
                ? 'avalon.night.wait'
                : 'avalon.night.peek',
            )
          "
          @flip="emit('flip-identity')"
        />
        <LoyaltyReply
          inline
          :request="room.self.loyaltyRequest"
          :can-act="canAct"
          :run="run"
        />
      </div>
      <p
        v-if="room.self.loyaltyPending && !room.self.loyaltyRequest"
        role="status"
        class="shrink-0 text-xs text-base-content/60"
      >
        {{ t("avalon.loyalty.wait") }}
      </p>
      <button
        type="button"
        class="btn shrink-0"
        :class="{
          invisible:
            !room.self.role || (!showRole && !room.self.nightConfirmed),
        }"
        :disabled="
          !canAct ||
          !showRole ||
          room.self.nightConfirmed ||
          room.self.loyaltyPending
        "
        @click="run('confirm_role')"
      >
        {{
          t(
            room.self.nightConfirmed
              ? "avalon.night.confirmed"
              : "avalon.night.confirm",
          )
        }}
      </button>
    </div>
  </section>
</template>

<script setup>
import { computed, h, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useMediaQuery, useResizeObserver, useWindowSize } from "@vueuse/core";
import { useLocale } from "@/i18n";
import { useModal } from "@/composables/useModal";
import ConfigurationSummary from "../display/ConfigurationSummary.vue";
import IdentityCard from "../display/IdentityCard.vue";
import LoyaltyReply from "../interaction/LoyaltyReply.vue";

const props = defineProps({
  room: { type: Object, required: true },
  canAct: Boolean,
  run: { type: Function, required: true },
  playerName: { type: Function, required: true },
  showRole: Boolean,
});
const emit = defineEmits(["flip-identity"]);

const { t } = useLocale();
const modal = useModal();

const nightCardCount = computed(
  () => 1 + (props.room.self.loyaltyRequest?.choices.length ?? 0),
);
const nightSection = ref(null);
const nightCards = ref(null);
const nightCardSpace = ref(null);
const nightCardGap = ref(12);
const narrowNight = useMediaQuery("(max-width: 639px)");
const { height: viewportHeight } = useWindowSize();

const nightCardGridWidth = computed(() => {
  const height =
    nightCardSpace.value ?? Math.max(120, viewportHeight.value - 260);
  if (narrowNight.value && nightCardCount.value === 3)
    return Math.max(1, ((height - nightCardGap.value / 4) * 4) / 9);
  return (
    Math.min(320, (height * 2) / 3) * nightCardCount.value +
    nightCardGap.value * (nightCardCount.value - 1)
  );
});

function fitNightCards() {
  const section = nightSection.value;
  const cards = nightCards.value;
  const main = section?.closest("main");
  if (!section || !cards || !main) return;
  const sectionBounds = section.getBoundingClientRect();
  const cardBounds = cards.getBoundingClientRect();
  const beforeCards = cardBounds.top - main.getBoundingClientRect().top;
  const afterCards =
    sectionBounds.bottom -
    cardBounds.bottom +
    (parseFloat(getComputedStyle(main).paddingBottom) || 0);
  nightCardGap.value = parseFloat(getComputedStyle(cards).rowGap) || 0;
  nightCardSpace.value = Math.max(
    1,
    Math.floor(viewportHeight.value - beforeCards - afterCards),
  );
}

useResizeObserver(
  [
    nightSection,
    nightCards,
    computed(() => nightSection.value?.closest("main")),
  ],
  fitNightCards,
);

watch(
  [viewportHeight, narrowNight, nightCardCount],
  () => {
    void nextTick(fitNightCards);
  },
  { immediate: true, flush: "post" },
);

let configurationModal = null;
function closeConfigurationModal() {
  configurationModal?.close();
  configurationModal = null;
}

function reviewConfiguration() {
  closeConfigurationModal();
  configurationModal = modal.info(
    t("avalon.config.title"),
    h(ConfigurationSummary, { room: props.room }),
    {
      scrollContent: true,
      buttonText: t("common.modal.close"),
    },
  );
}

watch(
  [() => props.room.code, () => props.room.game, () => props.room.selfId],
  closeConfigurationModal,
);
onBeforeUnmount(closeConfigurationModal);
</script>
