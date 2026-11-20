<template>
  <article
    class="min-w-0 text-sm"
    :class="{
      'comment-surface card card-border bg-base-100': !reply,
      'border-primary': !reply && isOwnComment,
      'border-base-300': !reply && !isOwnComment,
    }"
  >
    <header
      class="flex min-w-0 items-start gap-2 p-2"
      :class="{
        'comment-surface-top': !reply,
      }"
    >
      <Avatar :src="avatar" :name="comment.author?.login" />
      <div
        class="flex min-w-0 flex-1 flex-col items-start gap-1 self-center text-start"
      >
        <div ref="metadataRow" class="flex w-full min-w-0 items-center gap-1.5">
          <Tooltip
            adaptive
            align="start"
            content-class="max-w-[min(20rem,calc(100cqw-3rem))]"
            :text="authorLabel"
            :disabled="!authorTruncated"
            class="min-w-0 shrink"
          >
            <component
              :is="authorUrl ? 'a' : 'span'"
              ref="authorName"
              :href="authorUrl || undefined"
              class="min-w-0 truncate font-semibold"
              :class="{ 'link link-hover': authorUrl }"
              :target="authorUrl ? '_blank' : undefined"
              :rel="authorUrl ? 'noopener noreferrer' : undefined"
              :tabindex="!authorUrl && authorTruncated ? 0 : undefined"
              @pointerenter="measureAuthorName"
              @focus="measureAuthorName"
              >{{ authorLabel }}</component
            >
          </Tooltip>
          <Tooltip
            adaptive
            align="end"
            v-if="badgeLabels.length"
            :text="badgeLabels.join(' · ')"
            :disabled="!badgesStacked"
            class="shrink-0"
          >
            <span
              ref="badgeGroup"
              role="group"
              :aria-label="badgeLabels.join(' · ')"
              :tabindex="badgesStacked ? 0 : undefined"
              class="min-w-0"
              :class="
                badgesStacked
                  ? 'stack stack-end h-5'
                  : 'inline-flex items-center gap-1'
              "
              :style="
                badgesStacked ? { width: badgeStackWidth + 'px' } : undefined
              "
            >
              <span
                v-if="isSiteOwner"
                class="badge badge-primary badge-xs shrink-0"
              >
                <span class="whitespace-nowrap">{{
                  t("comments.siteOwner")
                }}</span>
              </span>
              <span
                v-if="isContentAuthor"
                class="badge badge-info badge-xs shrink-0"
              >
                <span class="whitespace-nowrap">{{
                  t("comments.contentAuthor")
                }}</span>
              </span>
            </span>
          </Tooltip>
        </div>
        <div class="flex min-w-0 max-w-full items-center gap-1.5">
          <Tooltip
            adaptive
            content-class="max-w-[min(20rem,calc(100cqw-3rem))]"
            :text="publishedAt"
            placement="bottom"
            align="start"
            class="shrink-0"
          >
            <time
              :datetime="comment.createdAt"
              :aria-label="publishedAt"
              tabindex="0"
              class="whitespace-nowrap text-xs text-base-content/60"
              >{{ relativeTime }}</time
            >
          </Tooltip>
          <EditHistory
            v-if="comment.lastEditedAt && !comment.isMinimized"
            :key="`${historyRevision}:${comment.lastEditedAt}`"
            :comment-id="comment.id"
            :load-history="loadHistory"
          />
        </div>
      </div>
      <ActionMenu
        :label="t('comments.actions')"
        :disabled="busy"
        :groups="actionGroups"
        trigger-class="btn btn-ghost btn-xs btn-square ms-auto"
        @select="chooseAction"
      >
        <template #trigger>
          <i class="ri-more-line text-base" aria-hidden="true"></i>
        </template>
      </ActionMenu>
    </header>
    <p v-if="comment.isMinimized" class="px-3 pb-2 text-base-content/60 italic">
      {{ minimizedMessage }}
    </p>
    <template v-else>
      <div
        :id="bodyId"
        class="relative overflow-clip focus-within:max-h-none! focus-within:after:hidden"
        :class="{
          'after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-8 after:bg-linear-to-t after:from-(--comment-body-bg) after:to-transparent':
            bodyOverflows && !bodyExpanded,
        }"
        :style="{
          maxHeight:
            bodyOverflows && !bodyExpanded
              ? bodyPreviewHeight + 'px'
              : undefined,
        }"
      >
        <div ref="bodyContent" class="flow-root">
          <Renderer
            :content="comment.body"
            mode="custom"
            :custom-markdown="COMMENT_MARKDOWN"
            scope-anchors
            prose-size="sm"
            class="max-w-none px-3 pb-2 wrap-anywhere"
            dir="auto"
            @render-ready="measureBodyPreview"
          />
        </div>
      </div>
      <button
        v-if="bodyOverflows"
        type="button"
        class="btn btn-ghost btn-xs mx-4 mb-2 self-start"
        :aria-controls="bodyId"
        :aria-expanded="bodyExpanded"
        @click="bodyExpanded = !bodyExpanded"
      >
        {{ t(bodyExpanded ? "reader.toc.collapse" : "reader.toc.expand") }}
        <i
          :class="bodyExpanded ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'"
          aria-hidden="true"
        ></i>
      </button>
      <footer
        class="flex flex-wrap items-center justify-between gap-2 px-2 pb-2"
      >
        <div class="flex flex-wrap items-center gap-2">
          <ReactionButtons
            :groups="reactionGroups"
            :disabled="busy || (permissions && !comment.viewerCanReact)"
            @react="$emit('react', $event)"
          />
        </div>
        <button
          v-if="replyCount"
          class="btn btn-ghost btn-xs ms-auto"
          type="button"
          :aria-expanded="repliesOpen"
          @click="$emit('toggle-replies')"
        >
          {{ t("comments.replies", { count: number(replyCount) }, replyCount) }}
          <i
            :class="repliesOpen ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'"
            aria-hidden="true"
          ></i>
        </button>
      </footer>
    </template>
    <button
      v-if="comment.isMinimized && replyCount"
      type="button"
      class="btn btn-ghost btn-xs mb-3 me-4 self-end"
      :aria-expanded="repliesOpen"
      @click="$emit('toggle-replies')"
    >
      {{ t("comments.replies", { count: number(replyCount) }, replyCount) }}
      <i
        :class="repliesOpen ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'"
        aria-hidden="true"
      ></i>
    </button>
    <div
      v-if="$slots.editor || $slots.replies || showReplyControl"
      :class="{ 'comment-surface-bottom bg-(--comment-reply-bg)': !reply }"
    >
      <slot v-if="editing" name="editor" />
      <slot name="replies" />
      <slot v-if="!editing" name="editor" />
      <div
        v-if="showReplyControl && !$slots.editor"
        class="p-(--comment-inset) border-t border-base-300"
      >
        <button
          class="input input-sm w-full text-base-content/65"
          type="button"
          :disabled="busy"
          @click="$emit('reply')"
        >
          {{ t(authenticated ? "comments.reply" : "comments.loginToReply") }}
        </button>
      </div>
    </div>
  </article>
</template>

<script setup>
import { COMMENT_MARKDOWN } from "@/utils/comments/comment-markdown";
import { computed, nextTick, ref, useId, watch } from "vue";
import { useClipboard, useResizeObserver } from "@vueuse/core";
import Avatar from "@/components/auth/Avatar.vue";
import Renderer from "@/components/markdown/Renderer.vue";
import ReactionButtons from "./ReactionButtons.vue";
import ActionMenu from "@/components/display/menu/ActionMenu.vue";
import Tooltip from "@/components/display/Tooltip.vue";
import EditHistory from "../interaction/EditHistory.vue";
import { useLocale } from "@/i18n";
import { formatRelativeDate } from "@/i18n/format-date";
import {
  commentMinimizedReasons,
  siteOwnerLogin,
} from "@/../shared/discussions.js";
import { useToast } from "@/composables/useToast";
import { githubDiscussionUrl } from "@/utils/github-discussion-url";
import { collectReaderBodyTextRects } from "@/utils/reader/measure-mobile-pages";
const props = defineProps({
  comment: { type: Object, required: true },
  authorLogin: { type: String, required: true },
  viewerLogin: String,
  now: { type: Number, required: true },
  loadHistory: { type: Function, required: true },
  historyRevision: Number,
  permissions: Boolean,
  canReply: Boolean,
  authenticated: Boolean,
  canQuote: Boolean,
  repliesOpen: Boolean,
  reply: Boolean,
  editing: Boolean,
  busy: Boolean,
});
const emit = defineEmits([
  "reply",
  "quote",
  "edit",
  "delete",
  "react",
  "toggle-replies",
]);
const { t, locale, date: formatDate, number } = useLocale();
const bodyId = `comment-body-${useId()}`;
const authorName = ref(null);
const metadataRow = ref(null);
const badgeGroup = ref(null);
const badgesStacked = ref(false);
const badgeStackWidth = ref(0);
const authorLabel = computed(
  () => props.comment.author?.login || t("comments.deletedUser"),
);
const authorTruncated = ref(false);
function measureTextWidth(element) {
  const range = document.createRange();
  range.selectNodeContents(element);
  return range.getBoundingClientRect().width;
}
function availableWidth(element) {
  const style = getComputedStyle(element);
  return element.getBoundingClientRect().width -
    [style.paddingLeft, style.paddingRight, style.borderLeftWidth, style.borderRightWidth]
      .reduce((total, value) => total + (parseFloat(value) || 0), 0);
}
function measureAuthorName() {
  const element = authorName.value;
  if (!element) {
    authorTruncated.value = false;
    return;
  }
  const stacked = badgesStacked.value;
  measureBadges();
  if (stacked !== badgesStacked.value) {
    // Give the badges their compact layout before deciding whether the name needs ellipsis.
    void nextTick(measureAuthorName);
    return;
  }
  // scrollWidth/clientWidth round to integers; ellipsis can start before they differ.
  authorTruncated.value =
    element.scrollWidth > element.clientWidth ||
    measureTextWidth(element) > availableWidth(element) + 0.01;
}
useResizeObserver(authorName, measureAuthorName);
useResizeObserver(metadataRow, measureAuthorName);
watch(authorLabel, measureAuthorName, { flush: "post" });
const bodyContent = ref(null);
const bodyExpanded = ref(false);
const bodyPreviewHeight = ref(0);
const bodyOverflows = computed(() => bodyPreviewHeight.value > 0);
useResizeObserver(bodyContent, measureBodyPreview);

function measureBodyPreview() {
  const content = bodyContent.value;
  if (!content) return;
  const bounds = content.getBoundingClientRect();
  const lineHeight = parseFloat(getComputedStyle(content).lineHeight);
  const textLength = Array.from(
    content.textContent.replace(/\s+/gu, ""),
  ).length;
  const takesMuchSpace = bounds.height >= 8 * lineHeight;
  const isLongText = textLength >= 160;
  if (!takesMuchSpace && !isLongText) {
    bodyPreviewHeight.value = 0;
    bodyExpanded.value = false;
    return;
  }
  const rects = collectReaderBodyTextRects(content);
  for (const image of content.querySelectorAll("img")) {
    const rect = image.getBoundingClientRect();
    if (rect.width && rect.height) rects.push(rect);
  }
  rects.sort((a, b) => a.top - b.top);
  const lines = [];
  for (const { top, bottom } of rects) {
    const last = lines.at(-1);
    // Text fragments with different inline styles can share a visual line.
    if (last && (top + bottom) / 2 < last.bottom) {
      last.bottom = Math.max(last.bottom, bottom);
    } else {
      lines.push({ bottom });
      if (lines.length === 4) break;
    }
  }
  const previewHeight =
    lines.length > 3
      ? Math.ceil(lines[2].bottom - bounds.top)
      : takesMuchSpace
        ? Math.ceil(3 * lineHeight)
        : 0;
  bodyPreviewHeight.value =
    bounds.height - previewHeight > lineHeight ? previewHeight : 0;
  if (!bodyOverflows.value) bodyExpanded.value = false;
}
function chooseAction(action) {
  if (action === "copyLink") void copyLink();
  else emit(action);
}
const minimizedMessage = computed(() => {
  const reason = props.comment.minimizedReason;
  if (!commentMinimizedReasons.includes(reason)) return t("comments.minimized");
  return t("comments.minimizedWithReason", {
    reason: t("comments.minimizedReasons." + reason),
  });
});
const login = computed(() => props.comment.author?.login?.toLowerCase());
const isOwnComment = computed(() =>
  Boolean(login.value && login.value === props.viewerLogin?.toLowerCase()),
);
const isSiteOwner = computed(
  () => login.value === siteOwnerLogin.toLowerCase(),
);
const isContentAuthor = computed(
  () => login.value === props.authorLogin.toLowerCase(),
);
const badgeLabels = computed(() => [
  ...(isSiteOwner.value ? [t("comments.siteOwner")] : []),
  ...(isContentAuthor.value ? [t("comments.contentAuthor")] : []),
]);

function measureBadges() {
  const row = metadataRow.value;
  const group = badgeGroup.value;
  const name = authorName.value;
  if (!row || !group || !name || badgeLabels.value.length < 2) {
    badgesStacked.value = false;
    return;
  }
  const widths = Array.from(group.children, (badge) => {
    const style = getComputedStyle(badge);
    return (
      measureTextWidth(badge.firstElementChild) +
      [
        style.paddingLeft,
        style.paddingRight,
        style.borderLeftWidth,
        style.borderRightWidth,
      ].reduce((total, value) => total + (parseFloat(value) || 0), 0)
    );
  });
  // Compare the uncompressed row, so stacking cannot make its own breakpoint oscillate.
  const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
  const expandedBadges =
    widths.reduce((total, width) => total + width, 0) + 4 * (widths.length - 1);
  badgeStackWidth.value = Math.max(...widths) + 7;
  badgesStacked.value =
    measureTextWidth(name) + expandedBadges + gap > availableWidth(row) + 0.01;
}
watch(
  [
    badgeLabels,
    authorLabel,
    () => props.comment.lastEditedAt,
    () => props.comment.isMinimized,
  ],
  measureAuthorName,
  { flush: "post" },
);
const publishedAt = computed(() =>
  formatDate(props.comment.createdAt, {
    dateStyle: "medium",
    timeStyle: "short",
  }),
);
const relativeTime = computed(() =>
  formatRelativeDate(props.comment.createdAt, locale.value, props.now),
);
const toast = useToast();
const { copy, copied } = useClipboard({ legacy: true });
const commentUrl = computed(() => githubDiscussionUrl(props.comment.url));
const canQuoteComment = computed(
  () =>
    (props.canReply || props.canQuote) &&
    !props.comment.isMinimized &&
    Boolean(props.comment.body?.trim()),
);
const canEditComment = computed(
  () =>
    props.permissions &&
    !props.comment.isMinimized &&
    props.comment.viewerCanUpdate,
);
const canDeleteComment = computed(
  () =>
    props.permissions &&
    !props.comment.isMinimized &&
    props.comment.viewerCanDelete,
);
const actionGroups = computed(() => [
  {
    items: [
      commentUrl.value && { id: "copyLink", label: t("comments.copyLink") },
      canQuoteComment.value && { id: "quote", label: t("comments.quoteReply") },
    ].filter(Boolean),
  },
  {
    items: [
      canEditComment.value && { id: "edit", label: t("comments.edit") },
      canDeleteComment.value && {
        id: "delete",
        label: t("comments.delete"),
        destructive: true,
      },
    ].filter(Boolean),
  },
]);

async function copyLink() {
  try {
    await copy(commentUrl.value);
    if (!copied.value) throw new Error("Clipboard is unavailable");
    toast.success(t("comments.linkCopied"));
  } catch {
    toast.error(t("comments.copyLinkFailed"));
  }
}
const replyCount = computed(() => props.comment.replies?.totalCount || 0);
const showReplyControl = computed(
  () => props.canReply && !props.comment.isMinimized,
);
const authorUrl = computed(() =>
  /^https:\/\/github\.com\/[a-zA-Z0-9-]+\/?$/u.test(
    props.comment.author?.url || "",
  )
    ? props.comment.author.url
    : "",
);
const avatar = computed(() =>
  /^https:\/\/avatars\.githubusercontent\.com\//u.test(
    props.comment.author?.avatarUrl || "",
  )
    ? props.comment.author.avatarUrl
    : "",
);
const reactionGroups = computed(() =>
  props.comment.reactionGroups?.map((group) => ({
    ...group,
    viewerHasReacted: props.permissions && group.viewerHasReacted,
  })),
);
</script>

<style scoped>
article {
  --comment-body-bg: var(--color-base-100);
}

article:not(.comment-surface) {
  --comment-body-bg: var(--comment-reply-bg, var(--color-base-100));
}
</style>
