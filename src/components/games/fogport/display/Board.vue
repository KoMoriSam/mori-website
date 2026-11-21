<template>
  <div
    class="relative flex min-h-0 flex-col overflow-hidden rounded-box border border-base-300 bg-base-200"
    :aria-label="t('fogport.board')"
  >
    <div class="absolute right-2 top-2 z-10 flex gap-1">
      <button
        class="btn btn-square btn-xs"
        :aria-label="t('fogport.zoomOut')"
        @click="zoom(-0.2)"
      >
        <i class="ri-subtract-line" aria-hidden="true"></i>
      </button>
      <button
        class="btn btn-square btn-xs"
        :aria-label="t('fogport.zoomIn')"
        @click="zoom(0.2)"
      >
        <i class="ri-add-line" aria-hidden="true"></i>
      </button>
      <Tooltip
        placement="bottom"
        align="end"
        as="button"
        trigger-class="inline-flex"
        class="btn btn-square btn-xs"
        :aria-label="t('fogport.reset')"
        :text="t('fogport.reset')"
        @click="reset"
      >
        <i class="ri-focus-3-line" aria-hidden="true"></i>
      </Tooltip>
    </div>
    <span
      v-if="!mapArt"
      class="pointer-events-none absolute left-2 top-2 z-10 truncate max-lg:top-14 rounded bg-base-100/80 px-2 py-1 text-[9px] text-base-content/45 max-sm:max-w-[calc(100%-11rem)]"
      ><i class="ri-image-line" aria-hidden="true"></i>
      {{ t("fogport.visual.mapArt") }} · 1:1 · 1254 × 1254</span
    >
    <svg
      ref="svg"
      viewBox="0 0 1000 1000"
      preserveAspectRatio="xMidYMid meet"
      class="block min-h-0 w-full flex-1 touch-none select-none"
      role="group"
      :aria-label="t('fogport.board')"
      @pointerdown="panStart"
      @pointermove="panMove"
      @pointerup="panEnd"
      @pointercancel="panEnd"
      @wheel.prevent="wheel"
    >
      <defs v-if="routeArt">
        <pattern
          :id="routePatternId"
          patternUnits="userSpaceOnUse"
          width="125"
          height="10"
        >
          <image
            :key="routeArt"
            :href="routeArt"
            width="125"
            height="10"
            preserveAspectRatio="xMidYMid meet"
            @error="onArtError"
          />
        </pattern>
      </defs>
      <g :transform="viewTransform">
        <g v-if="mapArt" pointer-events="none">
          <image
            :key="mapArt"
            :href="mapArt"
            x="0"
            y="0"
            width="1000"
            height="1000"
            preserveAspectRatio="xMidYMid meet"
            @error="onArtError"
          />
          <rect
            x="0"
            y="0"
            width="1000"
            height="1000"
            class="fill-base-100"
            opacity="0.38"
          />
        </g>
        <rect
          v-else
          x="5"
          y="5"
          width="990"
          height="990"
          rx="24"
          fill="none"
          stroke="currentColor"
          stroke-dasharray="12 10"
          class="text-base-content/10"
        />
        <BoardLinksLayer
          :links="linkItems"
          :hover-target="hoveredLinkTarget"
          :route-pattern-id="routePatternId"
          @hover="handleHover"
          @select="handleSelect"
        />
        <BoardPlacesLayer
          :places="placeItems"
          :active-mode="activeMode"
          :hover-target="hoveredPlaceTarget"
          :hovered-place-id="hoveredPlaceId"
          @hover="handleHover"
          @select="handleSelect"
          @drag="handleDrag"
          @art-error="onArtError"
        />
      </g>
    </svg>
    <span
      class="pointer-events-none absolute bottom-8 left-2 rounded-field bg-base-100/85 px-2 py-1 text-[9px] text-base-content/60 sm:hidden"
      ><i class="ri-drag-move-2-line" aria-hidden="true"></i>
      {{ t("fogport.visual.touchMap") }}</span
    >
    <div
      class="pointer-events-none flex shrink-0 flex-wrap gap-x-3 gap-y-1 bg-base-100/85 px-2 py-1 text-[10px]"
    >
      <span
        v-for="kind in visibleKinds"
        :key="kind"
        class="border-r border-base-300 pr-2"
        :class="
          kind === 'railway' && game.era === 'canal'
            ? 'text-base-content/65'
            : TRANSPORT_TONES[kind]
        "
        ><i :class="TRANSPORT_ICONS[kind]" aria-hidden="true"></i>
        {{
          t(
            kind === "railway" && game.era === "canal"
              ? "fogport.visual.railPreview"
              : "fogport.transport." + kind,
          )
        }}</span
      ><span
        v-for="player in game.players"
        :key="player.id"
        :class="PLAYER_TONES[player.seat]"
        ><ArtIcon
          :asset="companyArtName(player.seat)"
          :icon="PLAYER_ICONS[player.seat]"
        />
        {{ player.nickname }}</span
      >
    </div>
  </div>
</template>

<script setup>
import { computed, ref, useId } from "vue";
import Tooltip from "@/components/display/Tooltip.vue";
import ArtIcon from "./ArtIcon.vue";
import BoardLinksLayer from "./BoardLinksLayer.vue";
import BoardPlacesLayer from "./BoardPlacesLayer.vue";
import { companyArtName } from "@/games/fogport/art-assets";
import { useArtAsset } from "@/composables/games/fogport/useArtAsset";
import { useBoardViewport } from "@/composables/games/fogport/useBoardViewport";
import { useBoardIndex } from "@/composables/games/fogport/useBoardIndex";
import {
  PLAYER_ICONS,
  PLAYER_TONES,
  TRANSPORT_ICONS,
  TRANSPORT_TONES,
} from "@/games/fogport/presentation";
import { useLocale } from "@/i18n";

const props = defineProps({
  game: { type: Object, required: true },
  targets: { type: Array, default: () => [] },
  selectedTargets: { type: Array, default: () => [] },
  activeMode: { type: String, default: "" },
  hoverTarget: { type: String, default: null },
  liquidationOffers: { type: Array, default: () => [] },
  dragging: Boolean,
});

const emit = defineEmits(["select", "drag", "hover"]);
const { t } = useLocale();

const { src: mapArt, onError: onArtError } = useArtAsset(() => "map");
const { src: routeArt } = useArtAsset(() => `route-${props.game.era}`);
const routePatternId = `fogport-route-${useId()}`;

const svg = ref(null);
const {
  viewTransform,
  zoom,
  reset,
  wheel,
  panStart,
  panMove,
  panEnd,
  clickAllowed,
} = useBoardViewport(svg, { isDragging: () => props.dragging });

const { hoveredPlaceId, visibleKinds, linkItems, placeItems } = useBoardIndex({
  game: () => props.game,
  targets: () => props.targets,
  selectedTargets: () => props.selectedTargets,
  activeMode: () => props.activeMode,
  hoverTarget: () => props.hoverTarget,
  liquidationOffers: () => props.liquidationOffers,
  routeArt,
});

const hoveredLinkTarget = computed(() =>
  props.hoverTarget?.startsWith("link:") ? props.hoverTarget : null,
);
const hoveredPlaceTarget = computed(() =>
  props.hoverTarget && !props.hoverTarget.startsWith("link:")
    ? props.hoverTarget
    : null,
);

function handleHover(key) {
  if (!props.dragging) emit("hover", key);
}

function handleSelect(target) {
  if (clickAllowed() && !props.dragging) emit("select", target);
}

function handleDrag(event, payload, label) {
  emit("drag", event, payload, label);
}
</script>
