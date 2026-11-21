import { createApp, inject, ref, h, onBeforeUnmount } from "vue";
import { routerKey } from "vue-router";
import Modal from "@/components/interaction/overlay/Modal.vue";
import { useLocale } from "@/i18n";
import {
  captureTrackedPosition,
  restoreTrackedPosition,
} from "@/composables/usePosTracker";
import {
  beginModalFallback,
  createModalHistoryFallback,
  endModalFallback,
  finishModalFallbackRestore,
} from "@/utils/layout/modal-history";

const createHistoryFallback = (onBack, options = {}) =>
  createModalHistoryFallback(onBack, {
    ...options,
    capturePosition: captureTrackedPosition,
    restorePosition: restoreTrackedPosition,
  });

export function useModalClose({
  onClose = () => {},
  shouldCloseFromFallback = () => true,
  onBlockedFallback = () => {},
} = {}) {
  let active = false;
  let historyFallback = null;
  let platformCloseTimer = 0;

  const clearPlatformClose = ({ retireFallback = false } = {}) => {
    if (retireFallback) historyFallback?.retire();
    else historyFallback?.release();
    historyFallback = null;
  };

  const closeImmediately = ({
    retireFallback = false,
    close = true,
  } = {}) => {
    if (!active) return;
    active = false;
    endModalFallback();
    window.clearTimeout(platformCloseTimer);
    clearPlatformClose({ retireFallback });
    if (close) onClose();
  };

  const closeFromFallback = () => {
    if (!shouldCloseFromFallback()) {
      const fallback = historyFallback;
      historyFallback = createHistoryFallback(closeFromFallback, {
        snapshot: fallback?.snapshot,
        scrollRestoration: fallback?.scrollRestoration,
      });
      onBlockedFallback();
      return;
    }

    const wasActive = active;
    active = false;
    window.clearTimeout(platformCloseTimer);
    historyFallback = null;
    if (wasActive) {
      endModalFallback();
      onClose();
    }
  };

  const activate = () => {
    if (active || import.meta.env.SSR) return;
    active = true;
    beginModalFallback();

    // 无法可靠探测宿主是否把系统返回接入原生 dialog；始终建立同 URL 的回退拦截项。
    historyFallback = createHistoryFallback(closeFromFallback);
  };

  // 主动关闭不执行 history.back，只把本次拦截项标记为待跳过。
  const requestClose = () => closeImmediately({ retireFallback: true });

  const requestPlatformClose = () => {
    if (!active) return;

    const fallback = historyFallback;
    const restorePosition = () =>
      restoreTrackedPosition({
        snapshot: fallback?.snapshot,
        suppressNavigationRestore: true,
      });
    active = false;
    endModalFallback();
    onClose();
    finishModalFallbackRestore(
      restorePosition,
      fallback?.scrollRestoration || "auto",
      fallback?.snapshot,
    );

    window.clearTimeout(platformCloseTimer);
    platformCloseTimer = window.setTimeout(() => {
      if (historyFallback !== fallback) return;
      fallback?.retire();
      historyFallback = null;
    }, 250);
  };

  const discard = ({ close = true } = {}) =>
    closeImmediately({ retireFallback: true, close });

  const isActive = () => active;

  onBeforeUnmount(() => discard({ close: false }));

  return {
    activate,
    requestClose,
    requestPlatformClose,
    discard,
    isActive,
  };
}

const modal = {
  show(options = {}) {
    const {
      title = "Hello!",
      description = "这是一个提示弹窗。",
      buttonText = "关闭",
      cancelText = "取消",
      localeService,
      router,
      buttonMode = "footer",
      variant = "default",
      scrollContent = false,
      panelClass,
      showBack = false,
      backLabel = "返回",
      leadingAction = null,
      onSubmit = () => {},
      onCancel = () => {},
      onBack = () => {},
    } = options;

    const resolvedButtonMode =
      variant === "confirm" ? "confirm" : buttonMode;
    const resolvedShowBack =
      typeof showBack === "string"
        ? localeService.text(showBack)
        : showBack
          ? localeService.text(backLabel) || true
          : false;
    const resolvedCancelText =
      cancelText === false ? false : localeService.text(cancelText);

    const container = document.createElement("div");
    document.body.appendChild(container);
    let requestClose = () => {};

    const modalApp = createApp({
      setup() {
        const visible = ref(true);
        const modalRef = ref(null);

        const cleanup = () => {
          if (!visible.value) return;
          visible.value = false;
          setTimeout(() => {
            modalApp.unmount();
            if (document.body.contains(container)) {
              document.body.removeChild(container);
            }
          }, 500);
        };
        requestClose = () => modalRef.value?.close();

        return () =>
          h(
            Modal,
            {
              ref: modalRef,
              title,
              description,
              buttonText: localeService.text(buttonText),
              cancelText: resolvedCancelText,
              buttonMode: resolvedButtonMode,
              scrollContent,
              panelClass,
              showBack: resolvedShowBack,
              onSubmit,
              onCancel,
              onBack,
              onClose: cleanup,
              visible: visible.value,
            },
            {
              title: () =>
                typeof title === "string"
                  ? h(
                      "h3",
                      { class: "text-lg font-serif font-bold" },
                      localeService.text(title),
                    )
                  : h(
                      "hgroup",
                      { class: "text-lg font-serif font-bold" },
                      title,
                    ),
              description: () =>
                typeof description === "string"
                  ? h("p", localeService.text(description))
                  : h(
                      "article",
                      {
                        class:
                          scrollContent === "nested"
                            ? "flex min-h-0 flex-1 flex-col"
                            : undefined,
                      },
                      description,
                    ),
              "leading-action": () => leadingAction,
            },
          );
      },
    });

    localeService.provide(modalApp);
    if (router) modalApp.use(router);
    modalApp.mount(container);

    return {
      close: () => requestClose(),
    };
  },
};

export function useModal() {
  const localeService = useLocale();
  const router = inject(routerKey, null);
  return {
    show: (options) => modal.show({ ...options, localeService, router }),
    info: (title, description, options = {}) =>
      modal.show({ title, description, ...options, localeService, router }),
    confirm: (title, description, options = {}) =>
      modal.show({
        title,
        description,
        ...options,
        localeService,
        router,
        buttonMode: "confirm",
        buttonText: options.buttonText || "确认",
        cancelText: options.cancelText ?? "取消",
      }),
  };
}
