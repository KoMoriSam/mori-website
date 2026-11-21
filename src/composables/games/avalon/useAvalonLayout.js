import { inject, provide, ref, useId } from "vue";

export const AVALON_DESKTOP_QUERY = "(min-width: 1024px)";
export const AVALON_MID_DESKTOP_QUERY =
  "(min-width: 1024px) and (max-width: 1279px)";

const avalonLayoutKey = Symbol("avalon-layout");

export function provideAvalonLayout() {
  const playersTargetId = `avalon-sidebar-players-${useId()}`;
  const sidebarPanel = ref("discussion");
  let endDiscussionHandler = null;

  const context = {
    playersTargetId,
    sidebarPanel,
    setSidebarPanel(panel) {
      sidebarPanel.value = panel;
    },
    registerEndDiscussion(handler) {
      endDiscussionHandler = handler;
      return () => {
        if (endDiscussionHandler === handler) endDiscussionHandler = null;
      };
    },
    endCurrentDiscussion() {
      endDiscussionHandler?.();
    },
  };

  provide(avalonLayoutKey, context);
  return context;
}

export function useAvalonLayout() {
  return inject(avalonLayoutKey, {
    playersTargetId: "avalon-sidebar-players",
    sidebarPanel: ref("discussion"),
    setSidebarPanel() {},
    registerEndDiscussion() {
      return () => {};
    },
    endCurrentDiscussion() {},
  });
}
