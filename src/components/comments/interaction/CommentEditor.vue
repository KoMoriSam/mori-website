<template>
  <div
    ref="editorElement"
    class="min-w-0"
    :class="{ '@container/comments flex min-h-0 flex-1 flex-col': expanded }"
    @paste="pasteAttachments"
    @dragover="dragAttachments"
    @drop="dropAttachments"
    @focusin="attachments.focusField($event.target)"
  >
    <input
      ref="fileInput"
      type="file"
      class="hidden"
      multiple
      :accept="mediaAttachmentAccept"
      @change="selectAttachments"
    />
    <form
      v-if="compact && !expanded && !inlineOpen"
      class="flex min-w-0 items-center gap-2 text-sm"
      :class="{
        'p-(--comment-inset) border-t border-base-300': embedded,
      }"
      :data-inline-comment-editor="embedded || undefined"
      :inert="loading"
      :aria-hidden="loading || undefined"
      @submit.prevent="submit"
    >
      <label class="input input-sm pe-1 min-w-0 flex-1">
        <span v-if="loading" class="skeleton skeleton-text grow">{{
          placeholder
        }}</span>
        <input
          v-else
          v-model="shortBody"
          class="min-w-0 grow"
          type="text"
          :disabled="!authenticated"
          :readonly="multiline"
          :aria-label="fieldLabel"
          :placeholder="placeholder"
          dir="auto"
          maxlength="10000"
          @click="multiline && openEditor()"
          @keydown.enter="openMultilineDraft"
        />
        <Tooltip :text="t('comments.attachments')" class="shrink-0">
          <ActionMenu
            v-if="attachmentTarget"
            :label="t('comments.attachments')"
            :groups="attachmentMenu"
            :disabled="!authenticated || loading || busy"
            preserve-selection
            trigger-class="btn btn-ghost btn-xs btn-square shrink-0"
            @select="chooseAttachment"
            @link-error="attachmentLinkError"
          >
            <template #trigger
              ><i class="ri-attachment-2" aria-hidden="true"></i
            ></template>
          </ActionMenu>
        </Tooltip>
        <Tooltip :text="t('comments.expandEditor')" class="shrink-0">
          <button
            ref="expandButton"
            type="button"
            class="btn btn-ghost btn-xs btn-square shrink-0"
            :aria-label="t('comments.expandEditor')"
            :disabled="!authenticated || loading || busy"
            @click="openEditor"
          >
            <i class="ri-fullscreen-line" aria-hidden="true"></i>
          </button>
        </Tooltip>
      </label>
      <button
        v-if="authenticated"
        type="submit"
        class="btn btn-primary btn-sm shrink-0"
        :disabled="loading || busy || attachments.pending || !body.trim()"
      >
        <span :class="{ 'skeleton skeleton-text': loading }">{{
          submitLabel
        }}</span>
      </button>
      <LoginButton
        v-else
        class="btn-sm shrink-0"
        :class="{ 'skeleton skeleton-text': loading }"
        :disabled="busy"
        :return-hash="returnHash"
        :login-action="loginAction"
        :label="t('comments.loginToComment')"
      />
      <button
        v-if="cancelable"
        type="button"
        class="btn btn-ghost btn-sm btn-square shrink-0"
        :aria-label="t('comments.cancel')"
        :disabled="busy"
        @click="$emit('cancel')"
      >
        <i class="ri-close-line text-base" aria-hidden="true"></i>
      </button>
    </form>
    <form
      v-if="expanded || !compact || inlineOpen"
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
      @submit.prevent="submit"
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
            :disabled="!authenticated"
            type="radio"
            class="tab"
          />
        </div>
        <MarkdownToolbar
          v-if="!preview"
          v-model="monospace"
          :disabled="!authenticated || loading"
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
            :disabled="!authenticated"
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
          v-if="attachmentTarget && !loading"
          :text="t('comments.attachments')"
          activation-class="@max-[25rem]/comments:tooltip"
        >
          <ActionMenu
            :label="t('comments.attachments')"
            :groups="attachmentMenu"
            :disabled="!authenticated || busy"
            align="center"
            preserve-selection
            trigger-class="btn btn-ghost btn-sm inline-flex font-normal text-base-content/65 @max-[25rem]/comments:btn-square"
            @select="chooseAttachment"
            @link-error="attachmentLinkError"
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
              :disabled="busy"
              @click="collapseEditor"
            >
              <i class="ri-fullscreen-exit-line" aria-hidden="true"></i>
            </button>
          </Tooltip>
          <button
            v-if="cancelable"
            type="button"
            class="btn btn-ghost btn-sm"
            :disabled="busy"
            @click="$emit('cancel')"
          >
            {{ t("comments.cancel") }}
          </button>
          <button
            v-if="authenticated"
            type="submit"
            class="btn btn-primary btn-sm"
            :disabled="loading || busy || attachments.pending || !body.trim()"
          >
            <span :class="{ 'skeleton skeleton-text': loading }">{{
              submitLabel
            }}</span>
          </button>
          <LoginButton
            v-else
            class="btn-sm"
            :class="{ 'skeleton skeleton-text': loading }"
            :disabled="busy"
            :return-hash="returnHash"
            :login-action="loginAction"
            :label="t('comments.loginToComment')"
          />
        </div>
      </footer>
    </form>
    <div
      v-if="attachments.items.length || attachmentNotice"
      class="max-h-48 shrink-0 overflow-y-auto px-(--comment-inset) pb-2 text-xs"
      aria-live="polite"
    >
      <p
        v-if="attachmentNotice"
        role="status"
        class="py-1 text-base-content/70"
      >
        {{ attachmentNotice }}
        <button
          v-if="otherAttachments"
          type="button"
          class="link ms-1"
          @click="openAttachmentDiscussion"
        >
          {{ t("comments.attachmentOther") }}
        </button>
      </p>
      <ul class="space-y-2">
        <li
          v-for="item in attachments.items"
          :key="item.id"
          class="flex min-w-0 items-center gap-2"
        >
          <div class="min-w-0 flex-1">
            <Tooltip
              adaptive
              content-class="max-w-[min(20rem,calc(100cqw-2rem))]"
              overflow-only
              placement="bottom"
              align="start"
              as="span"
              trigger-class=""
              class="min-w-0 block"
              :text="item.name"
              :aria-label="item.name"
            ><span class="block min-w-0 truncate">{{
              item.name
            }}</span></Tooltip>
            <span
              :class="
                item.status === 'failed' ? 'text-error' : 'text-base-content/60'
              "
            >
              {{
                item.status === "failed"
                  ? attachmentFailure(item.error, item.maximum)
                  : t("comments.attachmentStatus." + item.status)
              }}
            </span>
            <progress
              v-if="item.status === 'uploading'"
              class="progress progress-primary block h-1 w-full"
              :value="item.progress"
              max="100"
              :aria-label="item.name"
            ></progress>
          </div>
          <button
            v-if="['queued', 'uploading'].includes(item.status)"
            type="button"
            class="btn btn-ghost btn-xs"
            @click="attachments.cancel(item)"
          >
            {{ t("comments.cancel") }}
          </button>
          <button
            v-else-if="['failed', 'cancelled'].includes(item.status)"
            type="button"
            class="btn btn-ghost btn-xs"
            @click="attachments.retry(item)"
          >
            {{ t("common.navigationStatus.retry") }}
          </button>
        </li>
      </ul>
    </div>
    <Teleport v-if="editorOpen" to="body">
      <Modal
        ref="editorModal"
        visible
        button-mode="close"
        scroll-content="nested"
        :title="fieldLabel"
        class="comment-thread"
        panel-class="h-(--comment-visible-height) max-h-(--comment-visible-height)! w-full max-w-none! self-start! rounded-none pb-[env(safe-area-inset-bottom)]!"
        :style="{ '--comment-visible-height': visibleHeight + 'px' }"
        @close="editorOpen = false"
      >
        <template #description>
          <CommentEditor
            v-model="body"
            expanded
            :authenticated="authenticated"
            :busy="busy"
            :action="action"
            :github-attachment-url="githubAttachmentUrl"
            :attachment-target="attachmentTarget"
            :attachment-session="attachments"
            :prepare-discussion="prepareDiscussion"
            :error="error"
            @submit="submitExpanded"
          />
        </template>
      </Modal>
    </Teleport>
  </div>
</template>

<script setup>
import { COMMENT_MARKDOWN } from "@/utils/comments/comment-markdown";
import {
  computed,
  defineAsyncComponent,
  inject,
  nextTick,
  provide,
  ref,
  useId,
  watch,
} from "vue";
import { useElementSize, useStorage, useWindowSize } from "@vueuse/core";
import LoginButton from "@/components/auth/LoginButton.vue";
import Modal from "@/components/interaction/overlay/Modal.vue";
import MarkdownToolbar from "./MarkdownToolbar.vue";
import ActionMenu from "@/components/display/menu/ActionMenu.vue";
import Tooltip from "@/components/display/Tooltip.vue";
import { useCommentAttachments } from "@/composables/useCommentAttachments";
import { mediaAttachmentAccept } from "@/../shared/comment-attachments.js";
import { githubDiscussionUrl } from "@/utils/github-discussion-url";
import { MARKDOWN_RESOURCE_OVERRIDES } from "@/constants/markdown";
import { useLocale } from "@/i18n";
import { editMarkdown } from "@/utils/markdown/edit-markdown";
const Renderer = defineAsyncComponent(
  () => import("@/components/markdown/Renderer.vue"),
);
const body = defineModel({ type: String, required: true });
const props = defineProps({
  action: { type: String, default: "post" },
  returnHash: String,
  loginAction: Function,
  githubAttachmentUrl: String,
  attachmentTarget: Object,
  attachmentSession: Object,
  prepareDiscussion: Function,
  busy: Boolean,
  authenticated: Boolean,
  loading: Boolean,
  cancelable: Boolean,
  embedded: Boolean,
  compact: Boolean,
  expanded: Boolean,
  error: String,
});
const emit = defineEmits(["submit", "cancel"]);
const attachments =
  props.attachmentSession ??
  useCommentAttachments(body, () => props.attachmentTarget);
const inheritedPreviews = inject(MARKDOWN_RESOURCE_OVERRIDES, null);
provide(MARKDOWN_RESOURCE_OVERRIDES, {
  get: (url) => attachments.previews.get(url) || inheritedPreviews?.get(url),
  refresh: () => inheritedPreviews?.refresh?.(),
});
const fileInput = ref(null);
const attachmentNotice = ref("");
const otherAttachments = ref(false);
const editorOpen = ref(false);
const editorModal = ref(null);
const inlineOpen = ref(false);
const expandButton = ref(null);
const multiline = computed(() => /[\r\n]/u.test(body.value));
const shortBody = computed({
  get: () => body.value.split(/[\r\n]/u, 1)[0],
  set: (value) => {
    body.value = value;
  },
});
const editorElement = ref(null);
const { width: editorWidth } = useElementSize(editorElement);
// The reader sidebar is 20–22rem wide; the toolbar already folds to fit its space.
const canExpandInline = computed(() => editorWidth.value >= 320);
const { height: visibleHeight } = useWindowSize({ type: "visual" });
watch([canExpandInline, () => props.compact], ([canInline, compact]) => {
  if (canInline || !compact) editorModal.value?.close();
  if (!canInline || !compact) inlineOpen.value = false;
});
const preview = ref(false);
watch(
  () => props.authenticated,
  (authenticated) => {
    if (!authenticated) preview.value = false;
  },
);
const textarea = ref(null);
const monospace = useStorage("mori:comments:monospace", false, undefined, {
  initOnMounted: true,
});
const tabGroup = useId();
const { t } = useLocale();
const fieldLabel = computed(() => t(`comments.editor.${props.action}.label`));
const placeholder = computed(() =>
  t(`comments.editor.${props.action}.placeholder`),
);
const submitLabel = computed(() => t(`comments.editor.${props.action}.submit`));
const shortcuts = { b: "bold", i: "italic", e: "code", k: "link" };

const attachmentMenu = computed(() => [
  {
    items: [
      {
        id: "media",
        label: t("comments.attachmentMedia"),
        icon: "ri-image-add-line",
      },
      {
        id: "github",
        label: t("comments.attachmentOther"),
        icon: "ri-github-fill",
        href:
          githubDiscussionUrl(props.githubAttachmentUrl) ||
          resolveAttachmentDiscussionUrl,
      },
    ],
  },
]);

function attachmentFailure(code, maximum) {
  const messages = {
    LOGIN_REQUIRED: "comments.loginToComment",
    ATTACHMENT_TOO_LARGE: "comments.attachmentTooLarge",
    ATTACHMENT_INVALID_FILE: "comments.attachmentInvalid",
    ATTACHMENT_REJECTED: "comments.attachmentRejected",
    ATTACHMENT_RATE_LIMITED: "comments.rateLimited",
    ATTACHMENT_NOT_CONFIGURED: "comments.attachmentUnavailable",
    ATTACHMENT_AUTHORIZATION_FAILED: "comments.attachmentUnavailable",
    ATTACHMENT_BODY_TOO_LONG: "comments.attachmentBodyTooLong",
  };
  const label = t(messages[code] || "comments.attachmentFailed");
  return code === "ATTACHMENT_TOO_LARGE" && maximum
    ? `${label} (${maximum / 1024 / 1024} MB)`
    : label;
}

function chooseAttachment(action) {
  if (action === "media") fileInput.value?.click();
}

async function resolveAttachmentDiscussionUrl() {
  const url =
    githubDiscussionUrl(props.githubAttachmentUrl) ||
    githubDiscussionUrl(await props.prepareDiscussion?.());
  if (!url) throw new Error("ATTACHMENT_DISCUSSION_UNAVAILABLE");
  return url;
}

function attachmentLinkError(error) {
  attachmentNotice.value = attachmentFailure(error.message);
}

async function openAttachmentDiscussion() {
  if (!props.authenticated || props.loading || props.busy) return;
  const tab = window.open("about:blank", "_blank");
  if (tab) tab.opener = null;
  try {
    const url = await resolveAttachmentDiscussionUrl();
    if (!url || !tab) throw new Error("ATTACHMENT_DISCUSSION_UNAVAILABLE");
    tab.location.replace(url);
  } catch (error) {
    tab?.close();
    attachmentLinkError(error);
  }
}

function addAttachments(files, field) {
  if (
    !props.authenticated ||
    props.loading ||
    props.busy ||
    !props.attachmentTarget
  )
    return;
  const other = attachments.add(
    files,
    field?.selectionStart ??
      textarea.value?.selectionStart ??
      body.value.length,
  );
  otherAttachments.value = other.length > 0;
  attachmentNotice.value = other.length
    ? t("comments.attachmentUseGithub", { files: other.join(", ") })
    : "";
  if (props.compact && !props.expanded && !inlineOpen.value) openEditor();
}

function selectAttachments(event) {
  addAttachments(Array.from(event.target.files || []));
  event.target.value = "";
}

function pasteAttachments(event) {
  const files = Array.from(event.clipboardData?.files || []);
  if (!files.length || !props.attachmentTarget) return;
  event.preventDefault();
  addAttachments(files, event.target);
}

function dragAttachments(event) {
  if (!event.dataTransfer?.types.includes("Files") || !props.attachmentTarget)
    return;
  event.preventDefault();
  event.dataTransfer.dropEffect =
    props.authenticated && !props.busy ? "copy" : "none";
}

function dropAttachments(event) {
  if (!event.dataTransfer?.files.length || !props.attachmentTarget) return;
  event.preventDefault();
  addAttachments(Array.from(event.dataTransfer.files), event.target);
}

function submitExpanded() {
  if (!attachments.pending)
    emit("submit", () => {
      attachments.reset();
      editorModal.value?.close();
    });
}

function openEditor() {
  if (!props.authenticated || props.loading || props.busy) return;
  if (canExpandInline.value) {
    inlineOpen.value = true;
    preview.value = false;
    void nextTick(() => textarea.value?.focus());
  } else {
    editorOpen.value = true;
  }
}

function collapseEditor() {
  inlineOpen.value = false;
  void nextTick(() => expandButton.value?.focus());
}

function openMultilineDraft(event) {
  if (!multiline.value) return;
  event.preventDefault();
  openEditor();
}

function submit() {
  if (
    props.authenticated &&
    !props.loading &&
    !props.busy &&
    !attachments.pending &&
    body.value.trim()
  )
    emit("submit", () => {
      attachments.reset();
      if (inlineOpen.value) collapseEditor();
    });
}

function format(action) {
  const field = textarea.value;
  if (!props.authenticated || props.loading || !field || preview.value) return;
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
  if (!props.authenticated || props.loading) return;
  if ((!event.ctrlKey && !event.metaKey) || event.altKey || event.isComposing)
    return;
  const key = event.key.toLowerCase();
  if (key === "p" && event.shiftKey) {
    event.preventDefault();
    preview.value = !preview.value;
    if (!preview.value) void nextTick(() => textarea.value?.focus());
  } else if (key === "enter") {
    event.preventDefault();
    if (!props.busy && !attachments.pending && body.value.trim())
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
