<template>
  <client-only
    ><div
      v-if="!actions.length && mainOnClick"
      class="fab"
      :class="[
        fabClass,
        !mobileFloating && 'max-lg:hidden',
        mainVisible ? 'opacity-100' : 'opacity-0 pointer-events-none',
      ]"
    >
      <Tooltip
        as="div"
        trigger-class=""
        activation-class="tooltip"
        class="tooltip-left"
        :text="localizeText(mainLabel)"
      >
        <button
          type="button"
          :class="['btn btn-lg', mainShapeClass, mainButtonClass]"
          :disabled="!mainVisible"
          :aria-label="localizeText(mainLabel)"
          @click="mainVisible && mainOnClick()"
        >
          <i :class="[mainIcon, 'text-xl']"></i>
        </button>
      </Tooltip>
    </div>

    <div v-else :class="['fab', !mobileFloating && 'max-lg:hidden', fabClass]">
      <div
        tabindex="0"
        role="button"
        :class="['btn btn-lg', mainShapeClass, mainButtonClass]"
        :aria-label="localizeText(mainLabel)"
      >
        <i :class="[mainIcon, 'text-xl']"></i>
      </div>

      <div class="fab-close">
        <span class="btn btn-circle btn-lg btn-error">
          <i class="ri-close-large-line"></i>
        </span>
      </div>

      <template
        v-for="(action, index) in actions"
        :key="action.key ?? `${action.label}-${index}`"
      >
        <Tooltip
          as="div"
          trigger-class=""
          activation-class="tooltip"
          class="tooltip-left"
          :text="action.label"
        >
          <label
            v-if="action.for"
            :for="action.disabled ? undefined : action.for"
            :aria-disabled="action.disabled || undefined"
            :class="[
              'btn btn-lg btn-circle',
              action.buttonClass ?? 'btn-primary',
            ]"
            @click="!action.disabled && action.onClick?.()"
          >
            <i :class="[action.icon, 'text-xl']"></i>
          </label>

          <button
            v-else
            type="button"
            :disabled="action.disabled"
            :aria-label="action.label"
            :class="[
              'btn btn-lg btn-circle',
              action.buttonClass ?? 'btn-primary',
            ]"
            @click="!action.disabled && action.onClick?.()"
          >
            <i :class="[action.icon, 'text-xl']"></i>
          </button>
        </Tooltip>
      </template>
    </div>

    <Tooltip as="label" trigger-class="" activation-class="tooltip"
      v-if="!mobileFloating && !actions.length && mainOnClick"
      class="lg:hidden tooltip-left fixed right-6 bottom-18 z-1 transition-opacity duration-500"
      :class="mainVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'"
      :aria-label="localizeText(mainLabel)"
      :aria-hidden="!mainVisible"
      :text="localizeText(mainLabel)"
      @click="mainVisible && mainOnClick?.()"
    >
      <div
        :tabindex="mainVisible ? 0 : -1"
        role="button"
        :class="[
          'btn btn-soft btn-lg btn-info drawer-button shadow-sm',
          mainShapeClass,
          !mainVisible && 'pointer-events-none',
        ]"
        :aria-disabled="!mainVisible"
      >
        <i :class="['m-4', mainIcon]"></i>
      </div>
    </Tooltip>

    <template v-if="!mobileFloating">
      <template
        v-for="(action, index) in actions"
        :key="`mobile-${action.key ?? `${action.label}-${index}`}`"
      >
        <label
          :for="action.disabled ? undefined : action.for || undefined"
          class="lg:hidden"
          :aria-label="action.label"
          :aria-disabled="action.disabled || undefined"
          @click="!action.disabled && action.onClick?.()"
        >
          <Tooltip
            as="div"
            trigger-class=""
            activation-class="lg:tooltip"
            class="lg:tooltip-left"
            :text="action.label"
          >
            <div
              :tabindex="action.disabled ? -1 : 0"
              role="button"
              class="lg:btn lg:btn-soft lg:btn-circle lg:btn-lg lg:shadow-sm"
            >
              <i :class="['m-4', action.icon]"></i>
            </div>
          </Tooltip>
          <span class="dock-label lg:hidden">{{ action.label }}</span>
        </label>
      </template>
    </template>
  </client-only>
</template>

<script setup>
import Tooltip from "@/components/display/Tooltip.vue";

import { useLocale } from '@/i18n';
const { text: localizeText } = useLocale();
defineProps({
  mobileFloating: {
    type: Boolean,
    default: false,
  },
  actions: {
    type: Array,
    default: () => [],
  },
  mainIcon: {
    type: String,
    default: "ri-menu-line",
  },
  mainButtonClass: {
    type: String,
    default: "btn-primary",
  },
  mainShapeClass: {
    type: String,
    default: "btn-circle",
  },
  mainLabel: {
    type: String,
    default: "操作",
  },
  mainOnClick: {
    type: Function,
    default: undefined,
  },
  mainVisible: {
    type: Boolean,
    default: true,
  },
  fabClass: {
    type: String,
    default: "fixed right-6 bottom-12 z-1",
  },
});
</script>
