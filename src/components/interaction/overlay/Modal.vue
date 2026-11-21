<template>
  <dialog
    v-if="rendered"
    ref="dialogRef"
    class="modal modal-bottom sm:modal-middle"
    @cancel="handleNativeCancel"
    @keydown.esc.capture="handleEscapeKeydown"
  >
    <section
      ref="modalRef"
      class="modal-box relative scrollbar-thin"
      :class="[panelClass, {
        'flex max-h-[82dvh] flex-col overflow-hidden p-0': scrollContent,
      }]"
    >
      <header
        :class="{
          'mb-4': !scrollContent,
          'shrink-0 border-b border-base-300 px-5 py-4': scrollContent,
        }"
      >
        <div class="flex min-w-0 items-center gap-2">
          <button
            v-if="hasBack"
            type="button"
            class="btn btn-ghost btn-circle btn-sm shrink-0"
            :aria-label="resolvedBackLabel"
            @click="emit('back')"
          >
            <i class="ri-arrow-left-line text-lg" aria-hidden="true"></i>
          </button>

          <div class="min-w-0 flex-1">
            <slot name="title">
              <h3 class="font-serif text-lg font-bold">{{ localizeText(title) }}</h3>
            </slot>
          </div>

          <button
            v-if="buttonMode === 'close'"
            class="btn btn-sm btn-circle btn-ghost shrink-0"
            type="button"
            :aria-label="translate('common.modal.close')"
            @click="close"
          >
            <i class="ri-close-line text-lg" aria-hidden="true"></i>
          </button>
        </div>

        <slot name="header-details"></slot>
      </header>
      <ScrollableContainer :class="{ 'flex-1': scrollContent }">
        <section
          :class="{
            'min-h-0 flex-1 p-5': scrollContent,
            'scrollbar-thin overflow-y-auto': scrollContent === true,
            'flex flex-col': scrollContent === 'nested',
          }"
        >
          <slot name="description">
            {{ localizeText(description) || translate('common.modal.defaultDescription') }}
          </slot>
        </section>
      </ScrollableContainer>
      <form
        v-if="isConfirm"
        method="dialog"
        class="modal-action"
        :class="{
          'm-0 shrink-0 border-t border-base-300 px-5 py-4': scrollContent,
        }"
      >
        <slot name="leading-action"></slot>
        <button class="btn btn-primary" type="button" @click="handleSubmit">
          {{ localizeText(buttonText) }}
        </button>
        <button
          v-if="hasCancel"
          class="btn"
          type="button"
          @click="handleCancel"
        >
          {{ resolvedCancelText }}
        </button>
      </form>
      <form
        v-else-if="buttonMode === 'footer'"
        method="dialog"
        class="modal-action"
        :class="{
          'm-0 shrink-0 border-t border-base-300 px-5 py-4': scrollContent,
        }"
      >
        <slot name="leading-action"></slot>
        <button class="btn" type="button" @click="handleSubmit">
          {{ localizeText(buttonText) }}
        </button>
      </form>
    </section>
  </dialog>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { onClickOutside } from "@vueuse/core";
import ScrollableContainer from "@/components/layout/ScrollableContainer.vue";
import { useModalClose } from "@/composables/useModal";
import { useLocale } from "@/i18n";
import {
  animateBlockedDismiss,
  cancelBlockedDismissAnimation,
} from "@/utils/layout/modal-history";

const MODAL_EXIT_DURATION_MS = 300;
const { t: translate, text: localizeText } = useLocale();

const props = defineProps({
  title: {
    type: [String, Object],
    default: "Hello!",
  },
  description: {
    type: [String, Object],
    default: "",
  },
  buttonText: {
    type: String,
    default: "关闭",
  },
  cancelText: {
    type: [String, Boolean],
    default: "取消",
  },
  buttonMode: {
    type: String,
    default: "footer",
    validator: (value) =>
      ["none", "close", "footer", "confirm"].includes(value),
  },
  visible: {
    type: Boolean,
    default: false,
  },
  scrollContent: {
    type: [Boolean, String],
    default: false,
    validator: (value) => typeof value === "boolean" || value === "nested",
  },
  panelClass: { type: [String, Array], default: undefined },
  showBack: {
    type: [Boolean, String],
    default: false,
  },
  onSubmit: {
    type: Function,
    default: () => {},
  },
});

const emit = defineEmits(["back", "cancel", "close"]);

const modalRef = ref(null);
const dialogRef = ref(null);
const rendered = ref(props.visible);
let closeTimer = 0;

const isConfirm = computed(() => props.buttonMode === "confirm");
const hasBack = computed(() => Boolean(props.showBack));
const resolvedBackLabel = computed(() =>
  typeof props.showBack === "string"
    ? localizeText(props.showBack)
    : localizeText("返回"),
);
const hasCancel = computed(() => Boolean(props.cancelText));
const resolvedCancelText = computed(() =>
  typeof props.cancelText === "string"
    ? localizeText(props.cancelText)
    : localizeText("取消"),
);

const indicateBlockedDismiss = () => animateBlockedDismiss(modalRef.value);

const scheduleUnmount = () => {
  if (import.meta.env.SSR) {
    rendered.value = false;
    return;
  }
  window.clearTimeout(closeTimer);
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    rendered.value = false;
    return;
  }
  closeTimer = window.setTimeout(() => {
    closeTimer = 0;
    if (!props.visible && !dialogRef.value?.open) {
      rendered.value = false;
    }
  }, MODAL_EXIT_DURATION_MS);
};

onBeforeUnmount(() => {
  if (!import.meta.env.SSR) window.clearTimeout(closeTimer);
  cancelBlockedDismissAnimation(modalRef.value);
});

const closeImmediately = () => {
  if (dialogRef.value?.open) {
    dialogRef.value.close();
  }
  scheduleUnmount();
  emit("close");
};
const modalClose = useModalClose({
  onClose: closeImmediately,
  shouldCloseFromFallback: () => !isConfirm.value && !hasBack.value,
  onBlockedFallback: () => {
    if (isConfirm.value) indicateBlockedDismiss();
    else if (hasBack.value) emit("back");
  },
});

const open = async () => {
  if (!import.meta.env.SSR) window.clearTimeout(closeTimer);
  rendered.value = true;
  await nextTick();
  const dialog = dialogRef.value;
  if (!props.visible || !dialog || dialog.open) return;

  // 确保首次挂载的 <dialog> 先完成闭合态样式计算，再进入 [open] 触发入场过渡。
  void dialog.offsetWidth;
  modalClose.activate();
  dialog.showModal();
};

const close = () => modalClose.requestClose();

const handleSubmit = () => {
  if (props.onSubmit() !== false) close();
};

const handleDismiss = () => {
  if (!dialogRef.value?.open) return;
  if (isConfirm.value) return indicateBlockedDismiss();
  if (hasBack.value) return emit("back");
  close();
};

const handleCancel = () => {
  emit("cancel");
  close();
};

const handleEscapeKeydown = (event) => {
  if (!isConfirm.value && !hasBack.value) return;
  event.preventDefault();
  event.stopPropagation();

  if (isConfirm.value) indicateBlockedDismiss();
  else emit("back");
};

const handleNativeCancel = (event) => {
  event.preventDefault();
  if (isConfirm.value) return indicateBlockedDismiss();
  if (hasBack.value) return emit("back");
  modalClose.requestPlatformClose();
};

onClickOutside(modalRef, handleDismiss);

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      void open();
      return;
    }
    if (modalClose.isActive()) {
      modalClose.discard({ close: false });
    }
    if (dialogRef.value?.open) {
      dialogRef.value.close();
    }
    if (rendered.value) {
      scheduleUnmount();
    }
  },
  { immediate: true },
);

defineExpose({
  open,
  close,
});
</script>
