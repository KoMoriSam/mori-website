<template>
  <div
    ref="editorElement"
    class="min-w-0"
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
      v-if="isCompact && !inlineOpen"
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
          :disabled="!isAuthenticated"
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
            :disabled="!isAuthenticated || loading || isBusy"
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
            :disabled="!isAuthenticated || loading || isBusy"
            @click="openEditor"
          >
            <i class="ri-fullscreen-line" aria-hidden="true"></i>
          </button>
        </Tooltip>
      </label>
      <button
        v-if="isAuthenticated"
        type="submit"
        class="btn btn-primary btn-sm shrink-0"
        :disabled="loading || isBusy || attachments.pending || !body.trim()"
      >
        <span :class="{ 'skeleton skeleton-text': loading }">{{
          submitLabel
        }}</span>
      </button>
      <LoginButton
        v-else
        class="btn-sm shrink-0"
        :class="{ 'skeleton skeleton-text': loading }"
        :disabled="isBusy"
        :return-hash="returnHash"
        :login-action="loginAction"
        :label="t('comments.loginToComment')"
      />
      <button
        v-if="cancelable"
        type="button"
        class="btn btn-ghost btn-sm btn-square shrink-0"
        :aria-label="t('comments.cancel')"
        :disabled="isBusy"
        @click="emit('cancel')"
      >
        <i class="ri-close-line text-base" aria-hidden="true"></i>
      </button>
    </form>
    <CommentEditorForm
      v-else
      ref="inlineFormRef"
      v-model="body"
      :action="action"
      :attachment-menu="attachmentMenu"
      :attachments-pending="attachments.pending"
      :cancelable="cancelable"
      :embedded="embedded"
      :inline-open="inlineOpen"
      :loading="loading"
      :authenticated="isAuthenticated"
      @choose-attachment="chooseAttachment"
      @attachment-link-error="attachmentLinkError"
      @collapse="collapseEditor"
      @cancel="emit('cancel')"
      @submit="submit"
    />
    <Teleport
      :to="modalAttachmentsTarget"
      :disabled="!editorOpen || !modalAttachmentsTarget"
    >
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
    </Teleport>
    <Teleport to="body">
      <Modal
        ref="editorModal"
        :visible="editorOpen"
        button-mode="close"
        scroll-content="nested"
        :title="fieldLabel"
        class="comment-thread"
        panel-class="h-(--comment-visible-height) max-h-(--comment-visible-height)! w-full max-w-none! self-start! rounded-none pb-[env(safe-area-inset-bottom)]!"
        :style="{ '--comment-visible-height': visibleHeight + 'px' }"
        @close="editorOpen = false"
      >
        <template #description>
          <div
            class="@container/comments flex min-h-0 flex-1 flex-col"
            @paste="pasteAttachments"
            @dragover="dragAttachments"
            @drop="dropAttachments"
            @focusin="attachments.focusField($event.target)"
          >
            <CommentEditorForm
              ref="modalFormRef"
              v-model="body"
              expanded
              :action="action"
              :attachment-menu="attachmentMenu"
              :attachments-pending="attachments.pending"
              :authenticated="isAuthenticated"
              @choose-attachment="chooseAttachment"
              @attachment-link-error="attachmentLinkError"
              @submit="submitExpanded"
            />
            <div ref="modalAttachmentsTarget" class="contents"></div>
          </div>
        </template>
      </Modal>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, inject, nextTick, provide, ref, watch } from "vue";
import { useElementSize, useWindowSize } from "@vueuse/core";
import { mediaAttachmentAccept } from "@/../shared/comment-attachments.js";
import LoginButton from "@/components/auth/LoginButton.vue";
import ActionMenu from "@/components/display/menu/ActionMenu.vue";
import Tooltip from "@/components/display/Tooltip.vue";
import Modal from "@/components/interaction/overlay/Modal.vue";
import { useCommentAttachments } from "@/composables/useCommentAttachments";
import { MARKDOWN_RESOURCE_OVERRIDES } from "@/constants/markdown";
import { useLocale } from "@/i18n";
import { githubDiscussionUrl } from "@/utils/github-discussion-url";
import { COMMENT_THREAD_CONTEXT } from "../context";
import CommentEditorForm from "./CommentEditorForm.vue";

const body = defineModel({ type: String, required: true });
const props = defineProps({
  action: { type: String, default: "post" },
  githubAttachmentUrl: { type: String, default: "" },
  cancelable: Boolean,
  embedded: Boolean,
  compact: { type: Boolean, default: undefined },
  authenticated: { type: Boolean, default: undefined },
  loading: Boolean,
});
const emit = defineEmits(["submit", "cancel"]);

const threadContext = inject(COMMENT_THREAD_CONTEXT, null);
const isCompact = computed(
  () => props.compact ?? Boolean(threadContext?.compactEditor.value),
);
const isAuthenticated = computed(
  () => props.authenticated ?? Boolean(threadContext?.authenticated.value),
);
const isBusy = computed(() => Boolean(threadContext?.editorBusy.value));
const returnHash = computed(() => threadContext?.returnHash.value || "");
const loginAction = computed(() => threadContext?.loginAction);
const attachmentTarget = computed(
  () => threadContext?.attachmentTarget.value ?? null,
);
const prepareDiscussion = computed(() => threadContext?.prepareDiscussion);
const resolvedGithubAttachmentUrl = computed(
  () =>
    githubDiscussionUrl(props.githubAttachmentUrl) ||
    threadContext?.discussionUrl.value ||
    "",
);

const attachments = useCommentAttachments(body, () => attachmentTarget.value);
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
const inlineFormRef = ref(null);
const modalFormRef = ref(null);
const modalAttachmentsTarget = ref(null);
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
watch([canExpandInline, isCompact], ([canInline, compact]) => {
  if (canInline || !compact) editorModal.value?.close();
  if (!canInline || !compact) inlineOpen.value = false;
});

const { t } = useLocale();
const fieldLabel = computed(() => t(`comments.editor.${props.action}.label`));
const placeholder = computed(() =>
  t(`comments.editor.${props.action}.placeholder`),
);
const submitLabel = computed(() => t(`comments.editor.${props.action}.submit`));

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
          resolvedGithubAttachmentUrl.value || resolveAttachmentDiscussionUrl,
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
    resolvedGithubAttachmentUrl.value ||
    githubDiscussionUrl(await prepareDiscussion.value?.());
  if (!url) throw new Error("ATTACHMENT_DISCUSSION_UNAVAILABLE");
  return url;
}

function attachmentLinkError(error) {
  attachmentNotice.value = attachmentFailure(error.message);
}

async function openAttachmentDiscussion() {
  if (!isAuthenticated.value || props.loading || isBusy.value) return;
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
    !isAuthenticated.value ||
    props.loading ||
    isBusy.value ||
    !attachmentTarget.value
  )
    return;
  const activeForm = editorOpen.value
    ? modalFormRef.value
    : inlineFormRef.value;
  const other = attachments.add(
    files,
    field?.selectionStart ??
      activeForm?.getSelectionStart?.() ??
      body.value.length,
  );
  otherAttachments.value = other.length > 0;
  attachmentNotice.value = other.length
    ? t("comments.attachmentUseGithub", { files: other.join(", ") })
    : "";
  if (isCompact.value && !editorOpen.value && !inlineOpen.value) openEditor();
}

function selectAttachments(event) {
  addAttachments(Array.from(event.target.files || []));
  event.target.value = "";
}

function pasteAttachments(event) {
  const files = Array.from(event.clipboardData?.files || []);
  if (!files.length || !attachmentTarget.value) return;
  event.preventDefault();
  addAttachments(files, event.target);
}

function dragAttachments(event) {
  if (!event.dataTransfer?.types.includes("Files") || !attachmentTarget.value)
    return;
  event.preventDefault();
  event.dataTransfer.dropEffect =
    isAuthenticated.value && !isBusy.value ? "copy" : "none";
}

function dropAttachments(event) {
  if (!event.dataTransfer?.files.length || !attachmentTarget.value) return;
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
  if (!isAuthenticated.value || props.loading || isBusy.value) return;
  if (canExpandInline.value) {
    inlineOpen.value = true;
    void nextTick(() => inlineFormRef.value?.focusTextarea?.());
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
    isAuthenticated.value &&
    !props.loading &&
    !isBusy.value &&
    !attachments.pending &&
    body.value.trim()
  )
    emit("submit", () => {
      attachments.reset();
      if (inlineOpen.value) collapseEditor();
    });
}
</script>
