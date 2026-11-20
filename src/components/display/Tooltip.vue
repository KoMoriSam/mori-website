<template>
  <slot v-if="$slots.trigger" name="trigger" :bindings="triggerBindings" :content="TooltipContent" />
  <component
    v-else
    :is="as || 'span'"
    :ref="setTrigger"
    v-bind="$attrs"
    :class="[!as && 'min-w-0', triggerClass, rootClasses]"
    :style="tooltipStyle"
    data-tooltip-trigger
    :aria-describedby="descriptionId"
    :disabled="['button', 'input', 'select', 'textarea'].includes(as) ? disabled : undefined"
    @pointerenter="enter"
    @pointerleave="leave"
    @focusin="enter"
    @focusout="leave"
  ><slot /><TooltipContent /></component>
</template>

<script setup>
import { computed, h, nextTick, normalizeClass, onBeforeUnmount, onMounted, onUpdated, ref, useAttrs, useId, useSlots, watch } from "vue";
import { getFloatingSize, isAnchorVisible, observeFloatingPosition } from "@/utils/layout/observe-floating-position";

defineOptions({ inheritAttrs: false });
const props = defineProps({
  as: [String, Object, Function],
  text: String,
  disabled: Boolean,
  overflowOnly: Boolean,
  adaptive: Boolean,
  triggerClass: { type: [String, Array, Object], default: "inline-flex" },
  activationClass: { type: [String, Array, Object], default: "tooltip" },
  placement: String,
  align: String,
  color: String,
  tooltipClass: [String, Array, Object],
  contentClass: [String, Array, Object],
  contentTag: { type: String, default: "span" },
  contentAttrs: Object,
  tooltipStyle: [String, Object, Array],
});
const emit = defineEmits(["position"]);
const open = defineModel("open", { type: Boolean, default: false });
const slots = useSlots();
const attrs = useAttrs();
const trigger = ref(null);
const content = ref(null);
const layer = ref(null);
const enabled = ref(false);
const dismissed = ref(false);
const layerActive = ref(false);
const visible = ref(false);
const fittedPosition = ref(null);
const generatedId = `tooltip-${useId()}`;
const descriptionId = computed(() => enabled.value && !props.disabled && !dismissed.value ? props.contentAttrs?.id || generatedId : undefined);
const placements = {
  top: "tooltip-top",
  bottom: "tooltip-bottom",
  left: "tooltip-left",
  right: "tooltip-right",
};
const alignments = {
  start: "tooltip-start",
  center: "tooltip-center",
  end: "tooltip-end",
};
const colors = {
  primary: "tooltip-primary",
  secondary: "tooltip-secondary",
  accent: "tooltip-accent",
  info: "tooltip-info",
  success: "tooltip-success",
  warning: "tooltip-warning",
  error: "tooltip-error",
};
const rootClasses = computed(() => [
  props.activationClass,
  placements[props.adaptive ? fittedPosition.value?.placement || props.placement : props.placement],
  alignments[props.adaptive ? fittedPosition.value?.align || props.align : props.align],
  colors[props.color],
  props.tooltipClass,
  { "tooltip-open": open.value },
]);

const frameStyle = {
  position: "fixed", margin: "0", padding: "0", border: "0",
  background: "transparent", color: "inherit", overflow: "visible",
  boxShadow: "none", outline: "none",
  pointerEvents: "none", minWidth: "0", minHeight: "0", maxWidth: "none", maxHeight: "none",
};
function floatingClasses() {
  const decorations = normalizeClass(attrs.class).split(/\s+/u).filter((name) =>
    /(?:^|:)tooltip(?:-|$)/u.test(name) || /(?:^|:)(?:before|after):/u.test(name) || name.includes("--tt-"),
  );
  return [
    "tooltip",
    placements[props.adaptive ? fittedPosition.value?.placement || props.placement : props.placement],
    alignments[props.adaptive ? fittedPosition.value?.align || props.align : props.align],
    colors[props.color],
    ...normalizeClass([props.tooltipClass, decorations]).split(/\s+/u).filter((name) => name !== "tooltip-open"),
    { "tooltip-open": visible.value },
  ];
}
// Only the native tooltip surface enters the top layer. The trigger always
// stays in its original formatting context; no placeholder or trigger clone.
const TooltipContent = () => h("span", {
  ref: layer,
  inert: !visible.value,
  popover: "manual",
  "data-tooltip-surface": "",
  "data-tooltip-layer": layerActive.value ? "" : undefined,
  class: floatingClasses(),
  style: [frameStyle, !layerActive.value ? { display: "none !important" } : undefined],
}, [h(props.contentTag, {
  ...props.contentAttrs,
  ref: content,
  id: props.contentAttrs?.id || generatedId,
  role: "tooltip",
  class: ["tooltip-content", props.contentAttrs?.class, props.contentClass],
  style: [props.contentAttrs?.style, !enabled.value || props.disabled ? { display: "none" } : undefined],
}, enabled.value && !props.disabled ? (slots["tooltip-content"]?.() ?? props.text ?? attrs["data-tip"]) : null)]);
const setTrigger = (element) => { trigger.value = element?.$el || element; };
const triggerBindings = computed(() => ({
  ref: setTrigger,
  class: [props.triggerClass, rootClasses.value],
  style: props.tooltipStyle,
  "data-tooltip-trigger": "",
  "aria-describedby": descriptionId.value,
  onPointerenter: enter, onPointerleave: leave, onFocusin: enter, onFocusout: leave,
}));
let observer;
let listeners;
let timer;
let closeFrame;
let stopPositioning;
let opening;

function wantsTooltip() {
  return enabled.value && !props.disabled && !dismissed.value && isAnchorVisible(trigger.value) &&
    content.value && !content.value.matches(":empty") &&
    (open.value || trigger.value.matches(":hover, :focus-visible, :has(:focus-visible)") || trigger.value.classList.contains("tooltip-open"));
}
function refreshEnabled() {
  enabled.value = Boolean(trigger.value && getComputedStyle(trigger.value).getPropertyValue("--tt-off") &&
    (!props.overflowOnly || hasClippedText()));
  if (!enabled.value && layerActive.value) hide(true);
}
function hasClippedText() {
  const element = trigger.value;
  return [element, ...element.querySelectorAll("*")].some((candidate) => {
    if (candidate.closest("[data-tooltip-surface]") || !candidate.clientWidth) return false;
    const style = getComputedStyle(candidate);
    if (candidate.tagName === "INPUT" && candidate.value && candidate.type === "text") {
      const context = document.createElement("canvas").getContext("2d");
      context.font = style.font;
      return context.measureText(candidate.value).width > candidate.clientWidth -
        (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
    }
    if (style.textOverflow !== "ellipsis" && !(parseInt(style.webkitLineClamp) > 0)) return false;
    if (candidate.scrollWidth > candidate.clientWidth || candidate.scrollHeight > candidate.clientHeight) return true;
    // DOM widths round to integers, while the ellipsis can begin at a fraction.
    const range = document.createRange();
    range.selectNodeContents(candidate);
    if (layer.value?.parentNode === candidate) range.setEndBefore(layer.value);
    const width = candidate.getBoundingClientRect().width -
      [style.paddingLeft, style.paddingRight, style.borderLeftWidth, style.borderRightWidth]
        .reduce((sum, value) => sum + (parseFloat(value) || 0), 0);
    return range.getBoundingClientRect().width > width + 0.01;
  });
}

function syncLayerVariables() {
  if (!trigger.value || !layer.value) return;
  const css = getComputedStyle(trigger.value);
  for (const name of css) {
    // Keep theme/custom variables live across the extra surface wrapper.
    if (name.startsWith("--tt-")) layer.value.style.setProperty(name, "inherit");
  }
  for (const name of trigger.value.getAttributeNames()) {
    if (name.startsWith("data-v-")) layer.value.setAttribute(name, trigger.value.getAttribute(name));
  }
}
function placeLayer(rect) {
  if (!layer.value) return;
  Object.assign(layer.value.style, {
    left: rect.left + "px", top: rect.top + "px", right: "auto", bottom: "auto",
    width: rect.width + "px", height: rect.height + "px",
  });
  syncLayerVariables();
}
async function updatePosition(rect = trigger.value?.getBoundingClientRect()) {
  if (!layerActive.value || !rect || !trigger.value?.getClientRects().length) return;
  refreshEnabled();
  if (!enabled.value) return;
  placeLayer(rect);
  if (props.adaptive) {
    await fitPosition();
    if (!layerActive.value) return;
    syncLayerVariables();
  }
  emit("position", { trigger: trigger.value, content: content.value });
}
async function enter(event) {
  clearTimeout(timer);
  cancelAnimationFrame(closeFrame);
  if (event?.pointerType === "touch") return;
  dismissed.value = false;
  refreshEnabled();
  if (!wantsTooltip() || opening) return;
  if (layerActive.value) { visible.value = true; return; }
  opening = true;
  layerActive.value = true;
  await nextTick();
  if (!wantsTooltip() || !layer.value || !content.value || content.value.matches(":empty")) {
    opening = false;
    hide(true);
    return;
  }
  placeLayer(trigger.value.getBoundingClientRect());
  layer.value.showPopover();
  await updatePosition();
  if (layerActive.value && wantsTooltip()) {
    // Establish the same native hidden state for both content and arrow, then
    // let daisyUI's tooltip-open rule run their original transition together.
    getComputedStyle(content.value).opacity;
    getComputedStyle(layer.value, "::after").opacity;
    visible.value = true;
    stopPositioning = observeFloatingPosition({
      anchor: () => trigger.value,
      floating: () => content.value,
      update: updatePosition,
      unavailable: () => hide(true),
    });
  } else hide(true);
  opening = false;
}
async function fitPosition() {
  if (!trigger.value?.getClientRects().length || !content.value || content.value.matches(":empty")) return;
  const source = trigger.value.getBoundingClientRect();
  if (source.bottom <= 0 || source.top >= window.innerHeight ||
      source.right <= 0 || source.left >= document.documentElement.clientWidth) return;
  const { width, height } = getFloatingSize(content.value);
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight;
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
  const preferred = props.placement || "top";
  const opposite = { top: "bottom", bottom: "top", left: "right", right: "left" };
  const directions = [...new Set([preferred, opposite[preferred], "bottom", "top", "left", "right"])];
  const aligns = [...new Set([props.align || "center", "center", "start", "end"])];
  let best;
  // Choose a native class before changing it. Measuring each class in turn would
  // observe interpolated CSS transforms and disturb the original animation.
  for (const placement of directions) {
    for (const align of aligns) {
      const horizontal = placement === "left" || placement === "right";
      const crossStart = horizontal ? source.top : source.left;
      const crossSize = horizontal ? source.height : source.width;
      const tooltipSize = horizontal ? height : width;
      const cross = crossStart + (align === "start" ? 0 : align === "end" ? crossSize - tooltipSize : (crossSize - tooltipSize) / 2);
      const left = horizontal
        ? placement === "left" ? source.left - width - rem * 0.75 : source.right + rem * 0.75
        : cross;
      const top = horizontal
        ? cross
        : placement === "top" ? source.top - height - rem * 0.5 : source.bottom + rem * 0.5;
      const overflow = Math.max(0, 8 - left) + Math.max(0, 8 - top) +
        Math.max(0, left + width - viewportWidth + 8) +
        Math.max(0, top + height - viewportHeight + 8);
      if (!best || overflow < best.overflow) best = { placement, align, overflow };
      if (!overflow) break;
    }
    if (!best.overflow) break;
  }
  fittedPosition.value = best;
  await nextTick();
}

function closeLayer() {
  stopPositioning?.();
  stopPositioning = undefined;
  if (layer.value?.matches(":popover-open")) layer.value.hidePopover();
  layerActive.value = false;
}
function hide(immediate = false) {
  clearTimeout(timer);
  cancelAnimationFrame(closeFrame);
  visible.value = false;
  if (immediate) { closeLayer(); return; }
  closeFrame = requestAnimationFrame(() => {
    const css = content.value && getComputedStyle(content.value);
    const seconds = (value) => value.split(",").map((part) => parseFloat(part) || 0);
    const durations = seconds(css?.transitionDuration || "0");
    const delays = seconds(css?.transitionDelay || "0");
    const duration = Math.max(...durations.map((value, index) => value + delays[index % delays.length]));
    timer = setTimeout(() => { if (!visible.value) closeLayer(); }, duration * 1000 + 32);
  });
}
function leave() { void nextTick(() => { if (!wantsTooltip()) hide(); }); }
function refresh() {
  refreshEnabled();
  if (props.disabled) { hide(true); return; }
  if (layerActive.value) void updatePosition();
  else if (wantsTooltip()) void enter();
}
onMounted(() => {
  refreshEnabled();
  observer = new ResizeObserver(refresh);
  observer.observe(trigger.value);
  if (props.overflowOnly) {
    for (const child of trigger.value.querySelectorAll("*")) {
      if (!child.closest("[data-tooltip-surface]")) observer.observe(child);
    }
  }
  for (let parent = trigger.value.parentElement; parent; parent = parent.parentElement) {
    if (getComputedStyle(parent).containerType !== "normal") observer.observe(parent);
  }
  listeners = new AbortController();
  window.addEventListener("resize", refresh, { passive: true, signal: listeners.signal });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && layerActive.value) {
      dismissed.value = true;
      open.value = false;
      hide();
    }
  }, { signal: listeners.signal });
  const closeWithOwner = (event) => {
    if (event.target !== layer.value && event.target.contains?.(trigger.value) &&
        (event.type === "close" || event.newState === "closed")) {
      dismissed.value = true;
      hide(true);
    }
  };
  document.addEventListener("beforetoggle", closeWithOwner, { capture: true, signal: listeners.signal });
  document.addEventListener("close", closeWithOwner, { capture: true, signal: listeners.signal });
  if (wantsTooltip()) void enter();
});
onUpdated(() => {
  refreshEnabled();
  if (layerActive.value) syncLayerVariables();
  else if (wantsTooltip()) void enter();
});
watch(() => [props.disabled, props.adaptive, props.activationClass, props.placement, props.align, props.tooltipClass, props.tooltipStyle], refresh, { flush: "post" });
watch(open, (value) => { if (value) void enter(); else leave(); });
onBeforeUnmount(() => {
  clearTimeout(timer);
  cancelAnimationFrame(closeFrame);
  listeners?.abort();
  observer?.disconnect();
  closeLayer();
});
defineExpose({ element: trigger, content, layer });
</script>

<style>
/* Source pseudo-elements must never participate in scrollable overflow, even
   when disabled, responsive activation is off, or text is not truncated.
   Only the native surface renders daisyUI's content and arrow. */
[data-tooltip-trigger]::after,
[data-tooltip-trigger][data-tip]::before { display: none !important; }
</style>
