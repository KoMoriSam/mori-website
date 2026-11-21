<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200 ease-out"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-150 ease-in"
      leave-to-class="opacity-0"
    >
      <div
        v-if="controlsOpen"
        class="fixed inset-0 z-[60] bg-neutral/35"
        data-mobile-reader-controls
        :aria-label="translate('reader.controls.dismissHint')"
        @pointerdown.self="closeAll"
      >
        <div class="pointer-events-none absolute inset-x-0 bottom-0">
          <Transition
            appear
            enter-active-class="transition duration-200 ease-out"
            enter-from-class="translate-y-4 opacity-0"
          >
            <div class="pointer-events-auto">
              <div class="mb-2 flex justify-center gap-3 px-2">
                <button
                  type="button"
                  class="btn shadow-sm"
                  :aria-label="translate('reader.controls.search')"
                  @click="openDialog('search')"
                >
                  <i
                    class="ri-search-line text-xl"
                    aria-hidden="true"
                  ></i>
                  {{ translate('common.nav.search') }}
                </button>
                <button
                  type="button"
                  class="btn shadow-sm"
                  :aria-label="translate('reader.controls.helpLabel')"
                  @click="showHelp"
                >
                  <i
                    class="ri-question-line text-xl"
                    aria-hidden="true"
                  ></i>
                  {{ translate('reader.controls.help') }}
                </button>
                <button
                  type="button"
                  class="btn shadow-sm"
                  :disabled="isLoadingContent"
                  :aria-label="translate('novel.reader.refreshContent')"
                  @click="refreshContent"
                >
                  <i
                    class="ri-refresh-line text-xl"
                    :class="{ 'animate-spin': isLoadingContent }"
                    aria-hidden="true"
                  ></i>
                  {{ translate('reader.controls.refresh') }}
                </button>
              </div>

              <nav
                class="w-full border-t border-base-300 bg-base-100/95 pb-[env(safe-area-inset-bottom)] shadow-2xl backdrop-blur-md"
                :aria-label="translate('reader.controls.label')"
              >
                <div
                  class="grid min-h-14 w-full grid-cols-[3rem_minmax(0,1fr)_3rem] items-center gap-1 border-b border-base-300/70 px-1 sm:grid-cols-[3.5rem_minmax(0,1fr)_3.5rem] sm:gap-2 sm:px-2"
                >
                  <button
                    type="button"
                    class="btn btn-ghost btn-sm btn-square mx-auto"
                    :disabled="!hasPrevious || isLoadingContent"
                    :aria-label="translate('reader.navigation.previous')"
                    @click="emit('change-chapter', -1)"
                  >
                    <i class="ri-skip-left-line text-xl" aria-hidden="true"></i>
                  </button>
                  <label
                    class="flex min-w-0 flex-col gap-1 text-center text-[0.6875rem] text-base-content/55 tabular-nums"
                  >
                    <span
                      >{{
                        isPagedMode
                          ? translate('reader.controls.chapterPage', { p0: safeCurrentPage, p1: safeTotalPages })
                          : translate('reader.controls.chapterProgress', { p0: pageProgressLabel })
                      }}
                      {{ translate('reader.controls.bookProgress', { progress: readingProgressLabel }) }}</span
                    >
                    <input
                      type="range"
                      class="range range-xs w-full"
                      :min="progressMin"
                      :max="progressMax"
                      :value="progressValue"
                      :disabled="!paginationReady"
                      :aria-label="translate('reader.controls.position')"
                      @input="handleProgressInput"
                    />
                  </label>
                  <button
                    type="button"
                    class="btn btn-ghost btn-sm btn-square mx-auto"
                    :disabled="!hasNext || isLoadingContent"
                    :aria-label="translate('reader.navigation.next')"
                    @click="emit('change-chapter', 1)"
                  >
                    <i
                      class="ri-skip-right-line text-xl"
                      aria-hidden="true"
                    ></i>
                  </button>
                </div>

                <div
                  class="dock dock-sm relative! inset-auto! grid h-16 min-h-16 w-full! max-w-none grid-cols-5 bg-transparent px-0"
                >
                  <button type="button" @click="goToCover">
                    <i class="ri-book-open-line text-xl" aria-hidden="true"></i
                    ><span class="dock-label">{{ translate('reader.controls.backToCover') }}</span>
                  </button>
                  <button type="button" @click="openDialog('toc')">
                    <i class="ri-list-unordered text-xl" aria-hidden="true"></i
                    ><span class="dock-label">{{ translate('reader.chapters.title') }}</span>
                  </button>
                  <button type="button" @click="openDialog('comments')">
                    <i class="ri-chat-3-line text-xl" aria-hidden="true"></i
                    ><span class="dock-label">{{ translate('reader.controls.comments') }}</span>
                  </button>
                  <button type="button" @click="openDialog('format')">
                    <i class="ri-font-size-2 text-xl" aria-hidden="true"></i
                    ><span class="dock-label">{{ translate('reader.controls.layout') }}</span>
                  </button>
                  <button type="button" @click="openDialog('more')">
                    <i class="ri-settings-3-line text-xl" aria-hidden="true"></i
                    ><span class="dock-label">{{ translate('common.moreSettings') }}</span>
                  </button>
                </div>
              </nav>
            </div>
          </Transition>
        </div>
      </div>
    </Transition>

    <dialog
      ref="panelDialogRef"
      class="modal modal-bottom z-[90]"
      @cancel.prevent="requestPlatformCloseDialog"
    >
      <div
        class="modal-box flex flex-col overflow-hidden p-0"
        :class="activeDialogBoxClass"
      >
        <ReaderDialogHeader
          class="shrink-0"
          :title="activeDialogTitle"
          :subtitle="activeDialogSubtitle"
          @back="requestCloseDialog"
        >
          <template #action>
            <button
              v-if="renderedDialog === 'format'"
              type="button"
              class="btn btn-ghost btn-sm shrink-0"
              :disabled="isMobileLayoutDefault"
              @click="readerStore.resetReaderLayout({ mobile: true })"
            >
              <i class="ri-reset-left-line" aria-hidden="true"></i>
              {{ translate('reader.format.reset') }}
            </button>
            <button
              v-else-if="renderedDialog === 'comments'"
              type="button"
              class="btn btn-info btn-soft btn-xs shrink-0"
              @click="commentToggle"
            >
              {{
                currentMapping === "title"
                  ? translate('novel.reader.showBookComments')
                  : translate('novel.reader.showChapterComments')
              }}
            </button>
          </template>
        </ReaderDialogHeader>

        <section
          v-show="renderedDialog === 'search'"
          class="min-h-0 overflow-hidden p-4"
        >
          <ContentSearch
            :active="activeDialog === 'search'"
            :initial-keyword="searchKeyword"
            :before-navigate="prepareDialogNavigation"
            @select="closeAll"
          />
        </section>

        <section v-if="renderedDialog === 'toc'" class="min-h-0 p-4">
          <ChapterToc
            mobile
            embedded
            viewport-pagination
            :page-progress="pageProgress"
            :before-select="prepareDialogNavigation"
            @select="closeAll"
          />
        </section>

        <div
          v-show="renderedDialog === 'format'"
          class="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <FormatSetting mobile :show-header="false" />
        </div>

        <ScrollableContainer v-show="renderedDialog === 'more'" class="flex-1">
          <div class="min-h-0 overflow-y-auto overscroll-contain scrollbar-thin">
            <ReaderMoreSettings @edit-tap-zones="openTapZoneEditor" />
          </div>
        </ScrollableContainer>

        <Thread
          v-if="commentsStarted"
          v-show="renderedDialog === 'comments'"
          :key="commentKey"
          class="p-4"
          scroll-mode="dialog"
          compact-editor
          :scope="currentMapping === 'title' ? 'chapter' : 'book'"
          :target="currentMapping === 'title' ? currentChapter?.uuid || '' : bookTerm"
        />
      </div>
      <form method="dialog" class="modal-backdrop">
        <button @click.prevent="requestCloseDialog">{{ translate('reader.controls.back') }}</button>
      </form>
    </dialog>

    <TapZoneEditor
      v-if="tapZoneEditorOpen"
      @close="requestCloseTapZoneEditor"
    />
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { useRouter } from "vue-router";
import { bookTerm } from "@/../shared/discussions.js";
import Thread from "@/components/comments/Thread.vue";
import ScrollableContainer from "@/components/layout/ScrollableContainer.vue";
import ChapterToc from "@/components/novel/ChapterToc.vue";
import ContentSearch from "@/components/novel/ContentSearch.vue";
import FormatSetting from "@/components/reader/interaction/FormatSetting.vue";
import { useChapters } from "@/composables/novel/useChapters";
import { useCommentScope } from "@/composables/novel/useCommentScope";
import { useModalClose } from "@/composables/useModal";
import { MOBILE_READING_MODES } from "@/constants/reader";
import { MOBILE_READER_DIALOG_SIZE_CLASS } from "@/constants/reader-layout";
import { useLocale } from "@/i18n";
import { useNovelStore } from "@/stores/novel";
import { useReaderStore } from "@/stores/reader";
import { getChapterContextTitle } from "@/utils/novel/format-label";
import {
  normalizeMobileReaderControlRequest,
  onMobileReaderOpenControl,
  setMobileReaderNavbarVisible,
} from "@/utils/reader/mobile-reader-events";
import ReaderDialogHeader from "../display/ReaderDialogHeader.vue";
import ReaderMoreSettings from "./ReaderMoreSettings.vue";
import TapZoneEditor from "./TapZoneEditor.vue";

const DIALOG_EXIT_DURATION_MS = 300;
const { t: translate } = useLocale();

const DIALOG_BOX_CLASSES = {
  search: "max-h-[72dvh] rounded-t-box",
  toc: "max-h-[76dvh] rounded-t-box",
  format: MOBILE_READER_DIALOG_SIZE_CLASS,
  more: "max-h-[78dvh] rounded-t-box",
  comments: MOBILE_READER_DIALOG_SIZE_CLASS,
};

const props = defineProps({
  currentPage: { type: Number, default: 1 },
  totalPages: { type: Number, default: 1 },
  paginationReady: { type: Boolean, default: true },
  controlsOpen: Boolean,
  readingProgress: { type: Number, default: 0 },
  pageProgress: { type: Number, default: 0 },
  readingMode: { type: String, default: MOBILE_READING_MODES.PAGED },
});
const emit = defineEmits([
  "change-page",
  "change-chapter",
  "controls-open-change",
  "refresh-content",
  "show-reader-hint",
]);
const novelStore = useNovelStore();
const { currentChapter, isLoadingContent } = storeToRefs(novelStore);
const readerStore = useReaderStore();
const { isMobileLayoutDefault } = storeToRefs(readerStore);
const { hasPrevious, hasNext } = useChapters();
const router = useRouter();
const activeDialog = ref(null);
const renderedDialog = ref(null);
const searchKeyword = ref("");
const panelDialogRef = ref(null);
const commentsStarted = ref(false);
const tapZoneEditorOpen = ref(false);
let dialogCloseTimer = 0;

const safeTotalPages = computed(() =>
  Math.max(1, Math.trunc(props.totalPages || 1)),
);
const safeCurrentPage = computed(() =>
  Math.min(
    safeTotalPages.value,
    Math.max(1, Math.trunc(props.currentPage || 1)),
  ),
);
const safeReadingProgress = computed(() =>
  Math.min(100, Math.max(0, Number(props.readingProgress) || 0)),
);
const readingProgressLabel = computed(
  () => `${safeReadingProgress.value.toFixed(1)}%`,
);
const isPagedMode = computed(
  () => props.readingMode === MOBILE_READING_MODES.PAGED,
);
const progressMax = computed(() =>
  isPagedMode.value ? safeTotalPages.value : 100,
);
const progressMin = computed(() => (isPagedMode.value ? 1 : 0));
const progressValue = computed(() =>
  isPagedMode.value ? safeCurrentPage.value : Math.max(0, props.pageProgress),
);
const pageProgressLabel = computed(() => `${Math.round(props.pageProgress)}%`);
const { currentMapping, commentToggle } = useCommentScope();
const commentVersion = ref(0);
const commentTerm = computed(() =>
  currentMapping.value === "title"
    ? getChapterContextTitle(currentChapter.value)
    : bookTerm,
);
const commentKey = computed(
  () => `${currentMapping.value}-${commentTerm.value}-${commentVersion.value}`,
);
const activeDialogTitle = computed(() => {
  switch (renderedDialog.value) {
    case "search":
      return translate("reader.controls.search");
    case "toc":
      return translate("reader.chapters.title");
    case "format":
      return translate("reader.controls.layout");
    case "more":
      return translate("common.moreSettings");
    case "comments":
      return currentMapping.value === "title"
        ? translate("novel.reader.chapterComments")
        : translate("novel.reader.bookComments");
    default:
      return "";
  }
});
const activeDialogSubtitle = computed(() =>
  renderedDialog.value === "format" ? translate("reader.format.previewHint") : "",
);
const activeDialogBoxClass = computed(
  () => DIALOG_BOX_CLASSES[renderedDialog.value] || "rounded-t-box",
);

const closeDialogImmediately = () => {
  if (panelDialogRef.value?.open) panelDialogRef.value.close();
  activeDialog.value = null;
  tapZoneEditorOpen.value = false;
  window.clearTimeout(dialogCloseTimer);
  dialogCloseTimer = window.setTimeout(() => {
    dialogCloseTimer = 0;
    if (!activeDialog.value) renderedDialog.value = null;
  }, DIALOG_EXIT_DURATION_MS);
};
const dialogClose = useModalClose({
  onClose: closeDialogImmediately,
});

const openDialog = async (name) => {
  if (!Object.hasOwn(DIALOG_BOX_CLASSES, name) || activeDialog.value === name) {
    return;
  }
  window.clearTimeout(dialogCloseTimer);
  if (tapZoneEditorOpen.value) {
    dialogClose.discard();
  }

  activeDialog.value = name;
  renderedDialog.value = name;
  if (name === "comments") commentsStarted.value = true;
  await nextTick();
  const dialog = panelDialogRef.value;
  if (!dialog) return;
  if (!dialogClose.isActive()) dialogClose.activate();
  if (!dialog.open) dialog.showModal();
};

const requestCloseDialog = () => dialogClose.requestClose();
const requestPlatformCloseDialog = () => dialogClose.requestPlatformClose();
const openTapZoneEditor = async () => {
  dialogClose.discard();
  emit("controls-open-change", false);
  setMobileReaderNavbarVisible(false);
  tapZoneEditorOpen.value = true;
  dialogClose.activate();
};
const requestCloseTapZoneEditor = () => dialogClose.requestClose();

const closeAll = () => {
  if (activeDialog.value || tapZoneEditorOpen.value) dialogClose.discard();
  emit("controls-open-change", false);
  setMobileReaderNavbarVisible(false);
};
const prepareDialogNavigation = () => {
  const replaceDialogHistory = false;

  // 目标内容将自行完成路由更新，这里只同步关闭当前模态框。
  dialogClose.discard();
  emit("controls-open-change", false);
  setMobileReaderNavbarVisible(false);
  return { replaceDialogHistory };
};
const handleProgressInput = (event) => {
  emit("change-page", Number(event.target.value));
};
const goToCover = () => {
  closeAll();
  void router.push({ name: "novel" });
};
const showHelp = () => {
  closeAll();
  emit("show-reader-hint");
};
const refreshContent = () => {
  if (isLoadingContent.value) return;
  emit("refresh-content");
};
const openControl = (detail) => {
  const request = normalizeMobileReaderControlRequest(detail);
  if (!request) return;
  if (request.name === "search") searchKeyword.value = request.keyword;
  if (request.name === "comments" && request.mapping) {
    currentMapping.value = request.mapping;
  }
  return openDialog(request.name);
};

defineExpose({ openControl });

let stopOpenControlListener;
onMounted(() => {
  stopOpenControlListener = onMobileReaderOpenControl((request) => {
    void openControl(request);
  });
});
onBeforeUnmount(() => {
  window.clearTimeout(dialogCloseTimer);
  if (panelDialogRef.value?.open) panelDialogRef.value.close();
  stopOpenControlListener?.();
});
</script>
