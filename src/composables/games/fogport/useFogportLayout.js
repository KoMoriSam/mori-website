import { inject, provide, ref, useId } from "vue";

export const FOGPORT_DESKTOP_QUERY = "(min-width: 1024px)";
export const FOGPORT_MID_DESKTOP_QUERY =
  "(min-width: 1024px) and (max-width: 1535px)";

const fogportLayoutKey = Symbol("fogport-layout");

function createDefaultFogportLayout() {
  return {
    inventoryTargetId: "fogport-inventory",
    sidebarPanel: ref("players"),
    setSidebarPanel() {},
    registerMobilePanelSync() {
      return () => {};
    },
    syncMobilePanel() {},
  };
}

export function provideFogportLayout() {
  const inventoryTargetId = `fogport-inventory-${useId()}`;
  const sidebarPanel = ref("players");
  let mobilePanelSync = null;

  const context = {
    inventoryTargetId,
    sidebarPanel,
    setSidebarPanel(panel) {
      sidebarPanel.value = panel;
    },
    registerMobilePanelSync(handler) {
      mobilePanelSync = handler;
      return () => {
        if (mobilePanelSync === handler) mobilePanelSync = null;
      };
    },
    syncMobilePanel(panel) {
      mobilePanelSync?.(panel);
    },
  };

  provide(fogportLayoutKey, context);
  return context;
}

export function useFogportLayout() {
  return inject(fogportLayoutKey, createDefaultFogportLayout, true);
}
