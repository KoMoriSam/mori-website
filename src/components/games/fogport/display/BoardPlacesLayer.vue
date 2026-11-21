<template>
  <g>
    <g
      v-for="place in places"
      :key="place.id"
      :opacity="place.opacity"
      :transform="place.transform"
      :data-fogport-drop="place.key"
      @pointerenter="emit('hover', place.key)"
      @pointerleave="emit('hover', null)"
    >
      <circle
        v-if="place.active || (!activeMode && hoveredPlaceId === place.id)"
        :r="hoveredPlaceId === place.id ? 56 : 49"
        stroke="none"
        :class="
          place.chosen
            ? 'fill-primary/50'
            : place.active
              ? hoveredPlaceId === place.id
                ? 'fill-success/65'
                : 'fill-success/40'
              : 'fill-base-content/20'
        "
        pointer-events="none"
      />
      <g
        class="outline-none"
        role="button"
        :tabindex="place.canInteract ? 0 : -1"
        :aria-disabled="!place.canInteract"
        :pointer-events="place.canInteract ? undefined : 'none'"
        :aria-label="place.name"
        @focusin="emit('hover', place.key)"
        @focusout="emit('hover', null)"
        @click.stop="emit('select', { kind: 'place', id: place.id })"
        @keydown.enter.stop.prevent="
          emit('select', { kind: 'place', id: place.id })
        "
        @keydown.space.stop.prevent="
          emit('select', { kind: 'place', id: place.id })
        "
      >
        <rect
          x="-62"
          :y="place.labelTop"
          width="124"
          height="23"
          rx="11"
          stroke-width="1.5"
          class="fill-base-100 stroke-base-content/25"
        />
        <text
          :y="place.labelTop + 17"
          text-anchor="middle"
          class="fill-base-content text-[17px] font-bold"
        >
          {{ place.name }}
        </text>
      </g>
      <g v-if="place.isPort" :data-fogport-drop="place.key">
        <image
          v-if="place.merchantArtSrc"
          :href="place.merchantArtSrc"
          x="-20"
          y="-18"
          width="40"
          height="40"
          preserveAspectRatio="xMidYMid meet"
          pointer-events="none"
          opacity="0.65"
          @error="emit('art-error', $event)"
        />
        <circle
          r="16"
          stroke-width="2"
          class="fill-base-100 stroke-base-content/60"
        />
        <foreignObject x="-21" y="-12" width="42" height="24"
          ><div
            xmlns="http://www.w3.org/1999/xhtml"
            class="flex h-full items-center justify-center gap-1 text-[17px] text-base-content"
          >
            <i class="ri-route-line" aria-hidden="true"></i><span>2</span>
          </div></foreignObject
        >
        <g
          v-for="merchant in place.merchants"
          :key="merchant.id"
          :opacity="merchant.opacity"
          :transform="merchant.transform"
          :data-fogport-drop="merchant.key"
          class="outline-none"
          role="button"
          :tabindex="merchant.canInteract ? 0 : -1"
          :aria-disabled="!merchant.canInteract"
          :pointer-events="merchant.canInteract ? undefined : 'none'"
          :aria-label="merchant.label"
          @pointerenter.stop="emit('hover', merchant.key)"
          @pointerleave.stop="emit('hover', null)"
          @click.stop="emit('select', { kind: 'merchant', id: merchant.id })"
          @focusin="emit('hover', merchant.key)"
          @focusout="emit('hover', null)"
          @keydown.enter.prevent="
            emit('select', { kind: 'merchant', id: merchant.id })
          "
          @keydown.space.prevent="
            emit('select', { kind: 'merchant', id: merchant.id })
          "
        >
          <rect
            x="-27"
            y="-13"
            width="54"
            height="48"
            rx="6"
            class="fill-base-100"
          />
          <rect
            x="-27"
            y="-13"
            width="54"
            height="48"
            rx="6"
            :stroke-width="hoverTarget === merchant.key ? 4 : 3"
            :class="
              boxTone(merchant, 'fill-transparent stroke-base-content/60')
            "
          />
          <foreignObject
            v-if="merchant.buys.length"
            x="-26"
            y="-12"
            width="52"
            height="23"
            ><div
              xmlns="http://www.w3.org/1999/xhtml"
              class="flex h-full items-center justify-center gap-0.5 text-base-content"
            >
              <i
                v-for="type in merchant.buys"
                :key="type"
                :class="INDUSTRY_ICONS[type]"
                class="text-[17px]"
                aria-hidden="true"
              ></i></div
          ></foreignObject>
          <text
            v-else
            text-anchor="middle"
            class="fill-base-content text-[16px]"
          >
            —
          </text>
          <foreignObject x="-24" y="10" width="48" height="23"
            ><div
              xmlns="http://www.w3.org/1999/xhtml"
              class="flex h-full items-center justify-center gap-1 text-[16px] text-base-content"
            >
              <ArtIcon
                asset="resource-beer"
                icon="ri-goblet-line"
              /><span>{{ merchant.beer ? 1 : 0 }}</span>
            </div></foreignObject
          >
          <title>{{ merchant.label }}</title>
        </g>
      </g>
      <g
        v-for="slot in place.slots"
        :key="slot.index"
        :opacity="slot.opacity"
        :transform="slot.transform"
        :data-fogport-drop="slot.dropValue"
        class="outline-none"
        role="button"
        :tabindex="slot.canInteract ? 0 : -1"
        :aria-disabled="!slot.canInteract"
        :pointer-events="slot.canInteract ? undefined : 'none'"
        :aria-label="slot.label"
        @pointerenter.stop="emit('hover', slot.key)"
        @pointerleave.stop="emit('hover', null)"
        @pointerdown="onSlotPointerDown($event, slot)"
        @click.stop="
          emit('select', {
            kind: 'slot',
            location: place.id,
            slot: slot.index,
          })
        "
        @focusin="emit('hover', slot.key)"
        @focusout="emit('hover', null)"
        @keydown.enter.prevent="
          emit('select', {
            kind: 'slot',
            location: place.id,
            slot: slot.index,
          })
        "
        @keydown.space.prevent="
          emit('select', {
            kind: 'slot',
            location: place.id,
            slot: slot.index,
          })
        "
      >
        <rect
          v-if="slot.legal || slot.chosen"
          :x="hoverTarget === slot.key ? -25 : -22"
          :y="hoverTarget === slot.key ? -25 : -22"
          :width="hoverTarget === slot.key ? 50 : 44"
          :height="hoverTarget === slot.key ? 50 : 44"
          rx="8"
          stroke="none"
          :class="
            slot.chosen
              ? 'fill-primary/50'
              : hoverTarget === slot.key
                ? 'fill-success/60'
                : 'fill-success/40'
          "
          pointer-events="none"
        />
        <rect
          x="-18"
          y="-18"
          width="36"
          height="36"
          rx="5"
          class="fill-base-100"
        />
        <rect
          x="-18"
          y="-18"
          width="36"
          height="36"
          rx="5"
          stroke-width="1.5"
          :class="boxTone(slot, slot.ownerTileTone)"
        />
        <template v-if="slot.building">
          <foreignObject x="-16" y="-16" width="32" height="19"
            ><div
              xmlns="http://www.w3.org/1999/xhtml"
              class="flex h-full items-center justify-center gap-1"
              :class="slot.ownerTone"
            >
              <ArtIcon
                :asset="`industry-${slot.tileType}`"
                :icon="INDUSTRY_ICONS[slot.tileType]"
                class="text-[16px]"
              /><span class="text-[11px] font-bold">{{
                slot.tileLevel
              }}</span>
            </div></foreignObject
          >
          <foreignObject x="-16" y="4" width="32" height="12"
            ><div
              xmlns="http://www.w3.org/1999/xhtml"
              class="flex h-full items-center justify-center gap-1 text-[11px] text-base-content"
            >
              <span
                v-if="slot.liquidationOffer"
                class="flex items-center gap-0.5 font-bold text-warning"
                ><i class="ri-coins-line" aria-hidden="true"></i>+{{
                  slot.liquidationOffer.amount
                }}</span
              >
              <template v-else
                ><ArtIcon
                  :asset="slot.ownerCompanyArt"
                  :icon="slot.ownerIcon"
                /><i
                  v-if="slot.building.flipped"
                  class="ri-check-line"
                  aria-hidden="true"
                ></i
                ><span v-else-if="slot.building.resources">{{
                  slot.building.resources
                }}</span
                ><i v-else class="ri-time-line" aria-hidden="true"></i
              ></template></div
          ></foreignObject>
        </template>
        <foreignObject v-else x="-16" y="-14" width="32" height="28"
          ><div
            xmlns="http://www.w3.org/1999/xhtml"
            class="flex h-full items-center justify-center gap-0.5 text-base-content/75"
          >
            <i
              v-for="type in slot.types"
              :key="type"
              :class="INDUSTRY_ICONS[type]"
              class="text-[16px]"
              aria-hidden="true"
            ></i></div
        ></foreignObject>
        <foreignObject
          v-if="slot.chosen"
          x="10"
          y="-29"
          width="22"
          height="22"
          pointer-events="none"
          ><div
            xmlns="http://www.w3.org/1999/xhtml"
            class="flex h-full items-center justify-center rounded-full bg-primary text-base text-primary-content"
          >
            <i class="ri-check-line" aria-hidden="true"></i></div
        ></foreignObject>
        <title>{{ slot.label }}</title>
      </g>
    </g>
  </g>
</template>

<script setup>
import ArtIcon from "./ArtIcon.vue";
import { INDUSTRY_ICONS } from "@/games/fogport/presentation";

const props = defineProps({
  places: { type: Array, required: true },
  activeMode: { type: String, default: "" },
  hoverTarget: { type: String, default: null },
  hoveredPlaceId: { type: String, default: null },
});

const emit = defineEmits(["hover", "select", "drag", "art-error"]);

function boxTone(item, normal) {
  if (item.chosen) return "fill-primary/25 stroke-primary";
  if (props.hoverTarget === item.key && item.legal) {
    return "fill-success/40 stroke-success";
  }
  if (item.legal) return "fill-success/20 stroke-success";
  return normal;
}

function onSlotPointerDown(event, slot) {
  if (!slot.canDrag) return;
  emit(
    "drag",
    event,
    { kind: "building", id: slot.building.id },
    slot.label,
  );
}
</script>
