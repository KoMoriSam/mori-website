import { computed, onBeforeUnmount, ref, toValue } from "vue";

const MIN_SCALE = 0.7;
const MAX_SCALE = 3;
const PAN_DRAG_THRESHOLD = 8;

export function useBoardViewport(svgRef, { isDragging = () => false } = {}) {
  const scale = ref(1);
  const offset = ref({ x: 0, y: 0 });
  const pointers = new Map();
  let start = null;
  let travel = 0;
  let resetTravelTimer = null;

  const viewTransform = computed(
    () =>
      `matrix(${scale.value},0,0,${scale.value},${offset.value.x},${offset.value.y})`,
  );

  function clearResetTimer() {
    if (resetTravelTimer !== null) {
      clearTimeout(resetTravelTimer);
      resetTravelTimer = null;
    }
  }

  function changeScale(value, pivot = { x: 500, y: 500 }) {
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
    const ratio = next / scale.value;
    offset.value = {
      x: pivot.x - (pivot.x - offset.value.x) * ratio,
      y: pivot.y - (pivot.y - offset.value.y) * ratio,
    };
    scale.value = next;
  }

  function zoom(amount) {
    changeScale(scale.value + amount);
  }

  function reset() {
    clearResetTimer();
    travel = 0;
    scale.value = 1;
    offset.value = { x: 0, y: 0 };
  }

  function wheel(event) {
    zoom(event.deltaY > 0 ? -0.1 : 0.1);
  }

  function pinchDistance() {
    const ps = [...pointers.values()];
    return ps.length < 2 ? 0 : Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
  }

  function panStart(event) {
    if (toValue(isDragging) || event.button !== 0) return;
    clearResetTimer();
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    travel = 0;
    start = {
      x: event.clientX,
      y: event.clientY,
      offset: { ...offset.value },
      scale: scale.value,
      distance: pinchDistance(),
    };
  }

  function panMove(event) {
    if (!pointers.has(event.pointerId) || !start || toValue(isDragging)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    travel = Math.max(travel, Math.hypot(dx, dy));
    const svg = svgRef.value;
    if (!svg) return;
    if (
      travel >= PAN_DRAG_THRESHOLD &&
      !svg.hasPointerCapture?.(event.pointerId)
    ) {
      svg.setPointerCapture?.(event.pointerId);
    }
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    if (pointers.size === 2 && start.distance) {
      const ps = [...pointers.values()];
      changeScale((start.scale * pinchDistance()) / start.distance, {
        x: ((ps[0].x + ps[1].x) / 2 - matrix.e) / matrix.a,
        y: ((ps[0].y + ps[1].y) / 2 - matrix.f) / matrix.d,
      });
    } else {
      offset.value = {
        x: start.offset.x + dx / matrix.a,
        y: start.offset.y + dy / matrix.d,
      };
    }
  }

  function panEnd(event) {
    pointers.delete(event.pointerId);
    if (!pointers.size) {
      start = null;
      clearResetTimer();
      resetTravelTimer = setTimeout(() => {
        resetTravelTimer = null;
        travel = 0;
      }, 0);
    }
  }

  const clickAllowed = () => travel < PAN_DRAG_THRESHOLD;

  onBeforeUnmount(() => {
    clearResetTimer();
    pointers.clear();
    start = null;
    travel = 0;
  });

  return {
    scale,
    offset,
    viewTransform,
    zoom,
    reset,
    wheel,
    panStart,
    panMove,
    panEnd,
    clickAllowed,
  };
}
