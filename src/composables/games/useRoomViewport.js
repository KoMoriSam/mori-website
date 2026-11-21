import "@/assets/game-room.css";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { gameNavbarMode } from "@/composables/useMobileNavbar";

const DESKTOP_VIEWPORT_QUERY = "(min-width: 1024px)";

export function useRoomViewport({
  roomRoot,
  room,
  connection,
  hasSidebar,
  fullscreenPhases = [],
}) {
  const sidebarExpanded = ref(true);
  const desktopViewport = ref(false);
  let sidebarMedia;
  let scrollFrame = 0;
  let pendingGameScroll = false;

  const fullscreenPhase = computed(() =>
    fullscreenPhases.includes(room.value?.game?.phase),
  );
  const showSidebar = computed(
    () => hasSidebar.value && !!room.value?.game && !fullscreenPhase.value,
  );
  const mobileGameViewport = computed(
    () => showSidebar.value && !desktopViewport.value,
  );

  function scrollPastNavbar() {
    if (
      !pendingGameScroll ||
      (!desktopViewport.value && !fullscreenPhase.value) ||
      !roomRoot.value
    )
      return;
    const top = Math.ceil(
      roomRoot.value.getBoundingClientRect().top + window.scrollY,
    );
    window.scrollTo({
      top,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
    const pageHeight = Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight,
    );
    if (pageHeight - window.innerHeight >= top - 1) pendingGameScroll = false;
  }

  function scheduleScrollPastNavbar() {
    cancelAnimationFrame(scrollFrame);
    scrollFrame = requestAnimationFrame(scrollPastNavbar);
  }

  function expandSidebar() {
    sidebarExpanded.value = true;
  }

  function updateSidebarViewport() {
    const wasDesktop = desktopViewport.value;
    desktopViewport.value = sidebarMedia.matches;
    if (desktopViewport.value && !wasDesktop) sidebarExpanded.value = true;
  }

  function setMobileGameViewport(active) {
    document.documentElement.classList.toggle("game-room-viewport", active);
    document.body.classList.toggle("game-room-viewport", active);
    if (active) {
      pendingGameScroll = false;
      cancelAnimationFrame(scrollFrame);
      window.scrollTo(0, 0);
    }
  }

  watch(
    () => room.value?.status,
    (status) => {
      if (!import.meta.env.SSR)
        gameNavbarMode.value = ["playing", "finished"].includes(status);
    },
    { immediate: true },
  );

  watch(
    mobileGameViewport,
    (active, wasActive) => {
      setMobileGameViewport(active);
      if (!active && wasActive && showSidebar.value && desktopViewport.value) {
        pendingGameScroll = true;
        scheduleScrollPastNavbar();
      }
    },
    { flush: "post" },
  );

  watch(
    [
      () => room.value?.status,
      () => room.value?.code,
      connection,
      () => room.value?.game?.phase,
    ],
    (
      [status, roomCode, connectionState, phase],
      [previousStatus, previousCode, previousConnection, previousPhase],
    ) => {
      if (!status) {
        pendingGameScroll = false;
        return;
      }
      if (!["playing", "finished"].includes(status)) return;
      const enteredGame = !["playing", "finished"].includes(previousStatus);
      const changedRoom = roomCode !== previousCode;
      const reconnected =
        connectionState === "online" && previousConnection !== "online";
      const enteredReveal =
        fullscreenPhases.includes(phase) && phase !== previousPhase;
      if (enteredGame || changedRoom || reconnected || enteredReveal) {
        pendingGameScroll = true;
        scheduleScrollPastNavbar();
      }
    },
    { flush: "post" },
  );

  watch(
    showSidebar,
    (visible) => {
      if (visible && pendingGameScroll) scheduleScrollPastNavbar();
    },
    { flush: "post" },
  );

  onMounted(() => {
    sidebarMedia = window.matchMedia(DESKTOP_VIEWPORT_QUERY);
    updateSidebarViewport();
    sidebarMedia.addEventListener("change", updateSidebarViewport);
    setMobileGameViewport(mobileGameViewport.value);
  });

  onBeforeUnmount(() => {
    sidebarMedia?.removeEventListener("change", updateSidebarViewport);
    cancelAnimationFrame(scrollFrame);
    setMobileGameViewport(false);
    gameNavbarMode.value = false;
  });

  return {
    sidebarExpanded,
    desktopViewport,
    fullscreenPhase,
    showSidebar,
    expandSidebar,
  };
}
