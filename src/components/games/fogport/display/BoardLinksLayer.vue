<template>
  <g>
    <g
      v-for="item in links"
      :key="item.id"
      :opacity="item.opacity"
      :data-fogport-drop="item.available ? item.key : undefined"
      class="outline-none"
      role="button"
      :tabindex="item.canInteract ? 0 : -1"
      :aria-disabled="!item.canInteract"
      :pointer-events="item.canInteract ? undefined : 'none'"
      :aria-label="item.label"
      @pointerenter="emit('hover', item.key)"
      @pointerleave="emit('hover', null)"
      @click.stop="selectLink(item)"
      @focusin="emit('hover', item.key)"
      @focusout="emit('hover', null)"
      @keydown.enter.prevent="selectLink(item)"
      @keydown.space.prevent="selectLink(item)"
    >
      <path
        v-if="item.legal || item.chosen || hoverTarget === item.key"
        :d="item.path"
        fill="none"
        stroke="currentColor"
        :stroke-width="hoverTarget === item.key ? 24 : 17"
        :class="
          item.chosen
            ? 'text-primary/45'
            : item.legal
              ? hoverTarget === item.key
                ? 'text-secondary/65'
                : 'text-secondary/35'
              : 'text-base-content/25'
        "
        stroke-linecap="round"
        stroke-linejoin="round"
        pointer-events="none"
      />
      <path
        :d="item.path"
        fill="none"
        stroke="currentColor"
        stroke-width="24"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="text-base-content/0"
        :pointer-events="item.canInteract ? 'stroke' : 'none'"
      />
      <path
        :d="item.path"
        fill="none"
        stroke="currentColor"
        :stroke-width="(hoverTarget === item.key ? 10 : item.baseWidth) + 6"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="text-base-100"
        pointer-events="none"
      />
      <path
        :d="item.path"
        fill="none"
        stroke="currentColor"
        :stroke-width="hoverTarget === item.key ? 10 : item.baseWidth"
        :stroke-dasharray="item.kind === 'canal' ? '7 6' : undefined"
        stroke-linecap="round"
        stroke-linejoin="round"
        :class="item.toneClass"
        pointer-events="none"
      />
      <g v-if="item.segments" pointer-events="none">
        <rect
          v-for="(segment, i) in item.segments"
          :key="i"
          :transform="`translate(${segment.x},${segment.y}) rotate(${segment.angle})`"
          y="-5"
          :width="segment.length"
          height="10"
          :fill="`url(#${routePatternId})`"
          opacity="0.8"
        />
      </g>
      <foreignObject
        v-if="!item.built && !item.chosen && item.kind === 'railway'"
        :x="item.mid.x - 11"
        :y="item.mid.y - 11"
        width="22"
        height="22"
        pointer-events="none"
        ><div
          xmlns="http://www.w3.org/1999/xhtml"
          class="flex h-full items-center justify-center rounded-full bg-base-100/95 text-base"
          :class="item.toneClass"
        >
          <i :class="item.transportIcon" aria-hidden="true"></i></div
      ></foreignObject>
      <circle
        v-if="item.built"
        :cx="item.mid.x"
        :cy="item.mid.y"
        r="13"
        stroke="currentColor"
        stroke-width="2"
        class="fill-base-100"
        :class="item.ownerTone"
        pointer-events="none"
      />
      <foreignObject
        v-if="item.built"
        :x="item.mid.x - 9"
        :y="item.mid.y - 9"
        width="18"
        height="18"
        pointer-events="none"
        ><div
          xmlns="http://www.w3.org/1999/xhtml"
          class="flex h-full items-center justify-center text-[15px] font-bold"
          :class="item.ownerTone"
        >
          <ArtIcon :asset="item.ownerCompanyArt" :icon="item.ownerIcon" /></div
      ></foreignObject>
      <foreignObject
        v-if="item.chosen"
        :x="item.mid.x - 12"
        :y="item.mid.y - 12"
        width="24"
        height="24"
        pointer-events="none"
        ><div
          xmlns="http://www.w3.org/1999/xhtml"
          class="flex h-full items-center justify-center rounded-full bg-primary text-lg text-primary-content"
        >
          <i class="ri-check-line" aria-hidden="true"></i></div
      ></foreignObject>
      <title>{{ item.label }}</title>
    </g>
  </g>
</template>

<script setup>
import ArtIcon from "./ArtIcon.vue";

defineProps({
  links: { type: Array, required: true },
  hoverTarget: { type: String, default: null },
  routePatternId: { type: String, required: true },
});

const emit = defineEmits(["hover", "select"]);

function selectLink(item) {
  if (!item.canInteract) return;
  emit("select", { kind: "link", id: item.id });
}
</script>
