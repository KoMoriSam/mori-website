<template>
  <header
    class="flex shrink-0 items-center justify-between gap-2 rounded-box border border-base-300 bg-base-100 px-2 py-1.5 lg:h-16 lg:gap-3 lg:px-3 lg:py-2"
  >
    <div class="flex min-w-0 flex-1 items-center gap-2 lg:gap-3">
      <Avatar
        v-if="acting"
        ring
        class="[&>div]:size-7 lg:[&>div]:size-9"
        :src="actingProfile?.avatarUrl"
        :name="acting.nickname"
        :class="actingProfile?.online ? 'avatar-online' : 'avatar-offline'"
      />
      <div class="min-w-0">
        <div
          class="hidden items-center gap-2 text-[10px] text-base-content/60 lg:flex"
        >
          <span
            class="flex items-center gap-1"
            :class="game.era === 'canal' ? 'text-primary font-bold' : ''"
            ><i class="ri-ship-line" aria-hidden="true"></i
            >{{ t("fogport.canal") }}</span
          ><i class="ri-arrow-right-s-line" aria-hidden="true"></i
          ><span
            class="flex items-center gap-1"
            :class="game.era === 'rail' ? 'text-secondary font-bold' : ''"
            ><i class="ri-train-line" aria-hidden="true"></i
            >{{ t("fogport.rail") }}</span
          ><span>· {{ t("fogport.round", { n: game.eraRound }) }}</span>
        </div>
        <p class="truncate text-[10px] text-base-content/60 lg:hidden">
          <i
            :class="game.era === 'canal' ? 'ri-ship-line' : 'ri-train-line'"
            aria-hidden="true"
          ></i>
          {{ t("fogport." + game.era) }} ·
          {{ t("fogport.round", { n: game.eraRound }) }}
        </p>
        <div class="flex min-w-0 items-center gap-2 lg:mt-1">
          <Tooltip
            overflow-only
            placement="bottom"
            align="start"
            as="h2"
            trigger-class="block"
            class="min-w-0 font-serif text-xs font-bold lg:text-base"
            :text="turnLabel"
            :aria-label="turnLabel"
            ><span class="block min-w-0 truncate">
              {{ turnLabel }}
            </span></Tooltip
          >
          <span
            v-if="headerActions && CORE_ACTIONS.includes(activeKind)"
            class="badge badge-sm shrink-0"
            ><i :class="ACTION_ICONS[activeKind]" aria-hidden="true"></i
            >{{ t("fogport.actions." + activeKind) }}</span
          >
        </div>
      </div>
    </div>
    <div
      ref="assetSummary"
      class="flex shrink-0 items-center gap-2 whitespace-nowrap text-xs lg:gap-3 lg:text-sm"
    >
      <Tooltip
        placement="bottom"
        align="start"
        as="span"
        trigger-class="inline"
        class="text-[10px] text-base-content/60"
        :text="self.nickname"
        :aria-label="self.nickname"
        >{{ t("fogport.info.you") }}</Tooltip
      ><Tooltip
        placement="bottom"
        align="start"
        as="span"
        trigger-class="inline"
        :text="t('fogport.cash')"
        :aria-label="t('fogport.cash')"
        ><i class="ri-coins-line text-warning" aria-hidden="true"></i>
        <b>{{ self.money }}</b></Tooltip
      ><Tooltip
        placement="bottom"
        align="start"
        as="span"
        trigger-class="inline"
        :text="
          t('fogport.info.roundIncome') + ' · ' + t('fogport.info.incomeHint')
        "
        :aria-label="
          t('fogport.info.roundIncome') + ' · ' + t('fogport.info.incomeHint')
        "
        ><i class="ri-arrow-up-circle-line text-success" aria-hidden="true"></i>
        <b>{{ incomeLevel(self.income) }}</b></Tooltip
      ><Tooltip
        placement="bottom"
        align="start"
        as="span"
        trigger-class="inline"
        :text="t('fogport.info.scored')"
        :aria-label="t('fogport.info.scored')"
        ><i class="ri-star-line text-primary" aria-hidden="true"></i>
        <b>{{ self.vp }}</b></Tooltip
      ><Tooltip
        v-if="game.phase === 'turn'"
        align="start"
        as="span"
        trigger-class=""
        activation-class="tooltip"
        class="tooltip-bottom flex items-center gap-1 border-l border-base-300 pl-2"
        :text="t('fogport.actionPointsHint')"
        :aria-label="
          t('fogport.actionPointsCount', {
            name: acting?.nickname,
            n: game.actionsLeft,
          })
        "
        ><i class="ri-flashlight-line text-primary" aria-hidden="true"></i
        ><b class="tabular-nums">{{ game.actionsLeft }}</b
        ><span class="text-[10px] text-base-content/60">{{
          t("fogport.actionPoints")
        }}</span></Tooltip
      >
    </div>
    <div
      :id="toolbarTargetId"
      v-show="headerActions && game.phase === 'turn'"
      :style="{ width: toolbarWidth + 14 + 'px' }"
      class="min-w-0 shrink-0 border-l border-base-300 pl-3"
    ></div>
  </header>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { useElementSize } from "@vueuse/core";
import Avatar from "@/components/auth/Avatar.vue";
import Tooltip from "@/components/display/Tooltip.vue";
import { incomeLevel } from "../../../../../shared/games/fogport/data.js";
import { actorId } from "../../../../../shared/games/fogport/engine.js";
import { ACTION_ICONS, CORE_ACTIONS } from "@/games/fogport/presentation";
import { useLocale } from "@/i18n";

const props = defineProps({
  game: { type: Object, required: true },
  roomPlayers: { type: Array, required: true },
  activeKind: { type: String, default: "" },
  headerActions: Boolean,
  toolbarTargetId: { type: String, required: true },
  toolbarWidth: { type: Number, default: 0 },
});

const emit = defineEmits(["measure-assets"]);
const { t } = useLocale();

const assetSummary = ref(null);
const { width: assetWidth } = useElementSize(assetSummary);
watch(
  assetWidth,
  (value) => {
    emit("measure-assets", value);
  },
  { immediate: true },
);

const playersById = computed(
  () => new Map(props.game.players.map((player) => [player.id, player])),
);
const self = computed(() => playersById.value.get(props.game.selfId));
const acting = computed(() => playersById.value.get(actorId(props.game)));
const actingProfile = computed(() =>
  acting.value
    ? props.roomPlayers.find((player) => player.id === acting.value.id)
    : null,
);

const resultLabel = computed(() =>
  props.game.result?.reason === "aborted"
    ? t("fogport.aborted")
    : t("fogport.winners", {
        names: props.game.result?.winners
          .map((id) => playersById.value.get(id).nickname)
          .join(" / "),
      }),
);

const turnLabel = computed(() =>
  props.game.phase === "finished"
    ? resultLabel.value
    : props.game.phase === "liquidation"
      ? t("fogport.debtTurn", { name: acting.value?.nickname })
      : t("fogport.actingPlayer", { name: acting.value?.nickname }),
);
</script>
