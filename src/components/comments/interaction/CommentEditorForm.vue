<template>
  <form
    class="min-w-0 text-sm"
    :class="[
      expanded ? 'flex min-h-0 flex-1 flex-col' : 'flex flex-col',
      !embedded &&
        !expanded &&
        'comment-surface card card-border border-base-300 bg-base-100',
      embedded ? 'border-t border-base-300' : '',
    ]"
    :data-inline-comment-editor="embedded || undefined"
    :inert="loading"
    :aria-hidden="loading || undefined"
    @submit.prevent="emit('submit')"
    @keydown="handleShortcut"
  >
    <div
      class="grid grid-cols-[auto_minmax(0,1fr)] items-end before:pointer-events-none before:col-span-full before:row-start-1 before:self-end before:border-b before:border-base-300"
      :class="[
        !embedded && !expanded && 'comment-surface-top bg-base-200/50',
        expanded && 'shrink-0',
      ]"
    >
      <div
        class="tabs tabs-lift relative col-start-1 row-start-1 px-(--comment-inset) pt-(--comment-inset)"
        role="radiogroup"
        :aria-label="fieldLabel"
      >
        <input
          v-model="preview"
          :name="tabGroup"
          :value="false"
          :aria-label="t('comments.write')"
          type="radio"
          class="tab"
        />
        <input
          v-model="preview"
          :name="tabGroup"
          :value="true"
          :aria-label="t('comments.preview')"
          :disabled="!isAuthenticated"
          type="radio"
          class="tab"
        />
      </div>
      <MarkdownToolbar
        v-if="!preview"
        v-model="monospace"
        :disabled="!isAuthenticated || loading"
        class="col-start-2 row-start-1 justify-end p-(--comment-inset)"
        @format="format"
      />
    </div>
    <div
      class="bg-(--comment-editor-bg) p-(--comment-inset) pb-0"
      :class="{ 'flex min-h-0 flex-1 flex-col': expanded }"
    >
      <div
        class="grid min-w-0 grid-cols-1 rounded-box bg-base-100"
        :class="{
          'focus-within:border-primary': !preview,
          'min-h-0 flex-1 grid-rows-[minmax(0,1fr)]': expanded,
        }"
      >
        <Renderer
          v-if="preview && body.trim()"
          :content="body"
          mode="custom"
          :custom-markdown="COMMENT_MARKDOWN"
          scope-anchors
          prose-size="sm"
          class="col-start-1 row-start-1 max-h-(--comment-editor-max-height,none) max-w-none overflow-y-auto p-3 wrap-anywhere scrollbar-thin"
          :class="{ 'min-h-0 max-h-none': expanded }"
          dir="auto"
        />
        <p
          v-else-if="preview"
          class="col-start-1 row-start-1 p-3 text-base-content/60"
        >
          {{ t("comments.emptyPreview") }}
        </p>
        <textarea
          ref="textarea"
          v-model="body"
          class="textarea col-start-1 row-start-1 block max-h-(--comment-editor-max-height,none) w-full min-w-0 resize-y p-3 enabled:bg-transparent disabled:resize-none field-sizing-content"
          :class="{
            'font-mono': monospace,
            invisible: preview,
            'text-transparent placeholder:text-transparent': loading,
            'min-h-0 max-h-none resize-none overflow-y-auto text-base field-sizing-fixed':
              expanded,
          }"
          :aria-hidden="preview || undefined"
          :disabled="!isAuthenticated"
          :autofocus="expanded || undefined"
          dir="auto"
          rows="4"
          maxlength="10000"
          :aria-label="fieldLabel"
          :placeholder="placeholder"
        />
        <div
          v-if="loading"
          class="pointer-events-none col-start-1 row-start-1 min-w-0 p-3"
        >
          <div class="skeleton h-3.5 w-36 max-w-full rounded-sm"></div>
        </div>
      </div>
    </div>
    <p v-if="expanded && error" role="alert" class="px-2 pt-2 text-error">
      {{ t(error) }}
    </p>
    <footer
      class="m-(--comment-inset) flex flex-wrap items-center justify-between gap-2"
    >
      <Tooltip
        adaptive
        content-class="max-w-[min(20rem,calc(100cqw-2rem))]"
        :text="t('comments.markdownHelp')"
        align="start"
        activation-class="@max-[22rem]/comments:tooltip"
      >
        <a
          href="https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax"
          target="_blank"
          rel="noopener noreferrer"
          :aria-label="t('comments.markdownHelp')"
          class="btn btn-ghost btn-sm inline-flex font-normal text-base-content/65 @max-[22rem]/comments:btn-square"
        >
          <i class="ri-markdown-line text-base" aria-hidden="true"></i>
          <span
            class="@max-[22rem]/comments:hidden"
            :class="{ 'skeleton skeleton-text': loading }"
            >{{ t("comments.markdownHelp") }}</span
          >
        </a>
      </Tooltip>
      <Tooltip
        v-if="hasAttachmentTarget && !loading"
        :text="t('comments.attachments')"
        activation-class="@max-[25rem]/comments:tooltip"
      >
        <ActionMenu
          :label="t('comments.attachments')"
          :groups="attachmentMenu"
          :disabled="!isAuthenticated || isBusy"
          align="center"
          preserve-selection
          trigger-class="btn btn-ghost btn-sm inline-flex font-normal text-base-content/65 @max-[25rem]/comments:btn-square"
          @select="emit('choose-attachment', $event)"
          @link-error="emit('attachment-link-error', $event)"
        >
          <template #trigger>
            <i class="ri-attachment-2 text-base" aria-hidden="true"></i>
            <span class="@max-[25rem]/comments:hidden">{{
              t("comments.attachments")
            }}</span>
          </template>
        </ActionMenu>
      </Tooltip>
      <div class="ms-auto flex flex-wrap items-center justify-end gap-2">
        <Tooltip v-if="inlineOpen" :text="t('comments.collapseEditor')">
          <button
            type="button"
            class="btn btn-ghost btn-sm btn-square"
            :aria-label="t('comments.collapseEditor')"
            :disabled="isBusy"
            @click="emit('collapse')"
          >
            <i class="ri-fullscreen-exit-line" aria-hidden="true"></i>
          </button>
        </Tooltip>
        <button
          v-if="cancelable && !expanded"
          type="button"
          class="btn btn-ghost btn-sm"
          :disabled="isBusy"
          @click="emit('cancel')"
        >
          {{ t("comments.cancel") }}
        </button>
        <button
          v-if="isAuthenticated"
          type="submit"
          class="btn btn-primary btn-sm"
          :disabled="loading || isBusy || attachmentsPending || !body.trim()"
        >
          <span :class="{ 'skeleton skeleton-text': loading }">{{
            submitLabel
          }}</span>
        </button>
        <LoginButton
          v-else
          class="btn-sm"
          :class="{ 'skeleton skeleton-text': loading }"
          :disabled="isBusy"
          :return-hash="returnHash"
          :login-action="loginAction"
          :label="t('comments.loginToComment')"
        />
      </div>
    </footer>
  </form>
</template>

<script setup>
import {
  computed,
  defineAsyncComponent,
  inject,
  nextTick,
  ref,
  useId,
  watch,
} from "vue";
import LoginButton from "@/components/auth/LoginButton.vue";
import ActionMenu from "@/components/display/menu/ActionMenu.vue";
import Tooltip from "@/components/display/Tooltip.vue";
import { useHydratedStorage } from "@/composables/storage/useHydratedStorage";
import { useLocale } from "@/i18n";
import { COMMENT_MARKDOWN } from "@/utils/comments/comment-markdown";
import { editMarkdown } from "@/utils/markdown/edit-markdown";
import { COMMENT_THREAD_CONTEXT } from "../context";
import MarkdownToolbar from "./MarkdownToolbar.vue";

const Renderer = defineAsyncComponent(
  () => import("@/components/markdown/Renderer.vue"),
);

const body = defineModel({ type: String, required: true });
const props = defineProps({
  action: { type: String, default: "post" },
  attachmentMenu: { type: Array, default: () => [] },
  attachmentsPending: Boolean,
  cancelable: Boolean,
  embedded: Boolean,
  expanded: Boolean,
  inlineOpen: Boolean,
  loading: Boolean,
  authenticated: { type: Boolean, default: undefined },
});
const emit = defineEmits([
  "submit",
  "cancel",
  "collapse",
  "choose-attachment",
  "attachment-link-error",
]);

const threadContext = inject(COMMENT_THREAD_CONTEXT, null);
const isAuthenticated = computed(
  () => props.authenticated ?? Boolean(threadContext?.authenticated.value),
);
const isBusy = computed(() => Boolean(threadContext?.editorBusy.value));
const error = computed(() => threadContext?.error.value || "");
const returnHash = computed(() => threadContext?.returnHash.value || "");
const loginAction = computed(() => threadContext?.loginAction);
const hasAttachmentTarget = computed(() =>
  Boolean(threadContext?.attachmentTarget.value),
);

const preview = ref(false);
watch(isAuthenticated, (authenticated) => {
  if (!authenticated) preview.value = false;
});
const textarea = ref(null);
const { storage: monospace } = useHydratedStorage(
  "mori:comments:monospace",
  false,
);
const tabGroup = useId();
const { t } = useLocale();
const fieldLabel = computed(() => t(`comments.editor.${props.action}.label`));
const placeholder = computed(() =>
  t(`comments.editor.${props.action}.placeholder`),
);
const submitLabel = computed(() => t(`comments.editor.${props.action}.submit`));
const shortcuts = { b: "bold", i: "italic", e: "code", k: "link" };

function focusTextarea() {
  preview.value = false;
  void nextTick(() => textarea.value?.focus());
}

function getSelectionStart() {
  return textarea.value?.selectionStart ?? body.value.length;
}

function format(action) {
  const field = textarea.value;
  if (!isAuthenticated.value || props.loading || !field || preview.value)
    return;
  const edit = editMarkdown(
    action,
    field.value,
    field.selectionStart,
    field.selectionEnd,
  );
  if (
    !edit ||
    field.value.length + edit.text.length - (edit.end - edit.start) >
      field.maxLength
  )
    return;
  field.setRangeText(edit.text, edit.start, edit.end);
  body.value = field.value;
  field.focus();
  field.setSelectionRange(edit.selectionStart, edit.selectionEnd);
}

function handleShortcut(event) {
  if (!isAuthenticated.value || props.loading) return;
  if ((!event.ctrlKey && !event.metaKey) || event.altKey || event.isComposing)
    return;
  const key = event.key.toLowerCase();
  if (key === "p" && event.shiftKey) {
    event.preventDefault();
    preview.value = !preview.value;
    if (!preview.value) void nextTick(() => textarea.value?.focus());
  } else if (key === "enter") {
    event.preventDefault();
    if (!isBusy.value && !props.attachmentsPending && body.value.trim())
      event.currentTarget.requestSubmit();
  } else if (
    event.target === textarea.value &&
    !event.shiftKey &&
    shortcuts[key]
  ) {
    event.preventDefault();
    format(shortcuts[key]);
  }
}

defineExpose({
  focusTextarea,
  getSelectionStart,
});
</script>

<style scoped>
form {
  --comment-editor-bg: var(--color-base-100);
}

form[data-inline-comment-editor] {
  --comment-editor-bg: var(--comment-reply-bg, var(--color-base-100));
}

.tabs-lift > .tab:checked {
  --tab-bg: var(--comment-editor-bg);
  /* Let the corner fill overlap the adjacent surfaces when edges round to device pixels. */
  --tab-corner-height: calc(var(--tab-radius-limit) + var(--border));
  --tab-inset: auto auto calc(0px - var(--border)) auto;
  --tab-radius-grad:
    transparent calc(100% - var(--border) - 0.125px),
    var(--tab-border-color) calc(100% - var(--border) + 0.125px)
      calc(100% - 0.125px),
    var(--tab-bg) calc(100% + 0.125px);
  --radius-start: radial-gradient(
    circle var(--tab-radius-limit) at top left,
    var(--tab-radius-grad)
  );
  --radius-end: radial-gradient(
    circle var(--tab-radius-limit) at top right,
    var(--tab-radius-grad)
  );
}

.tabs-lift > .tab:checked::before {
  background-size: calc(var(--tab-radius-limit) + var(--border)) 100%;
  pointer-events: none;
}
</style>
