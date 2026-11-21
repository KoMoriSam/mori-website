<template>
  <Modal
    :visible="Boolean(mode)"
    :button-mode="buttonMode"
    :button-text="buttonText"
    :cancel-text="displayMode !== 'summary' && translate('common.modal.cancel')"
    scroll-content
    :show-back="canGoBack && translate('common.modal.backToList')"
    :on-submit="submit"
    @back="emit('back')"
    @close="emit('close')"
  >
    <template #title>
      <hgroup v-if="displayMode === 'summary'">
        <h3 class="font-serif text-lg font-bold flex items-center gap-2">
          {{ translate('common.modal.announcements') }}
          <span
            v-if="unreadSummaryCount"
            class="badge badge-error badge-sm tabular-nums px-1.25"
          >
            {{ unreadSummaryCount }}
          </span>
        </h3>
        <p class="text-base-content/55 text-xs">{{ translate('common.modal.hint') }}</p>
      </hgroup>

      <div
        v-else-if="displayMode === 'detail' && displayAnnouncement"
        class="flex flex-wrap items-center gap-2"
      >
        <NoticeBadges
          :announcement="displayAnnouncement"
          :read="announcementStore.isRead(displayAnnouncement)"
        />
      </div>
    </template>

    <template #header-details>
      <div v-if="displayMode === 'detail' && displayAnnouncement" class="min-w-0">
        <div class="flex min-w-0 items-center justify-between gap-4">
          <h3 class="min-w-0 flex-1 font-serif text-lg font-bold text-balance">
            {{ displayAnnouncement.title }}
          </h3>

          <dl
            class="shrink-0 text-right text-xs font-normal text-base-content/50 flex items-center gap-1"
          >
            <div>
              <dt class="sr-only">{{ translate('common.modal.published') }}</dt>
              <dd>
                <time :datetime="displayAnnouncement.startsAt">
                  {{
                    formatAnnouncementDate(displayAnnouncement.startsAt, true, uiLocale)
                  }}
                </time>
              </dd>
            </div>
            <div v-if="displayAnnouncement.endsAt">
              <dt class="sr-only">{{ translate('common.modal.ends') }}</dt>
              <dd>
                {{ translate('common.modal.to') }}
                <time :datetime="displayAnnouncement.endsAt">
                  {{
                    formatAnnouncementDate(displayAnnouncement.endsAt, true, uiLocale)
                  }}
                </time>
              </dd>
            </div>
          </dl>
        </div>

        <p
          class="w-full text-sm leading-relaxed font-normal text-base-content/65 text-pretty"
        >
          <span lang="zh-CN">{{ displayAnnouncement.summary }}</span>
        </p>
      </div>
    </template>

    <template #description>
      <section v-if="displayMode === 'summary'" :aria-label="translate('common.modal.listLabel')">
        <ul class="grid gap-3">
          <li
            v-for="announcement in summaryAnnouncements"
            :key="`${announcement.id}:${announcement.revision}`"
            role="button"
            class="card card-border card-sm w-full group hover:border-primary/25 hover:bg-primary/5 cursor-pointer"
            @click="emit('open', announcement)"
          >
            <div class="card-body">
              <NoticeTitle
                :announcement="announcement"
                :read="announcementStore.isRead(announcement)"
                heading-tag="h4"
                class="card-title"
              />
              <div class="card-actions justify-end">
                <p>
                  {{ announcement.summary }}
                </p>
                <span
                  class="text-primary group-hover:translate-x-0.25 transition-[translate]"
                >
                  {{ translate('common.modal.view') }}
                  <i class="ri-arrow-right-s-line" aria-hidden="true"></i>
                </span>
              </div>
            </div>
          </li>
        </ul>
      </section>

      <div
        v-else-if="showsAnnouncementDetail && rendererFailed"
        role="alert"
        class="flex flex-col items-center gap-3 py-6"
      >
        <p>{{ translate('markdown.content.loadFailed') }}</p>
        <button type="button" class="btn btn-sm" @click="retryRenderer">
          {{ translate('announcements.retry') }}
        </button>
      </div>
      <Renderer
        v-else-if="showsAnnouncementDetail"
        lang="zh-CN"
        :content="displayAnnouncement.body"
        :content-id="`announcement-${displayAnnouncement.id}-${displayAnnouncement.revision}`"
        mode="standard"
        prose-size="sm"
        :manage-route-anchor="false"
        class="max-w-none min-w-0 wrap-break-word"
      />
    </template>
  </Modal>
</template>

<script setup>
import { useLocale } from '@/i18n';
const { t: translate, locale: uiLocale } = useLocale();

import { computed, defineAsyncComponent, ref, watch } from "vue";

import NoticeBadges from "@/components/announcement/display/NoticeBadges.vue";
import NoticeTitle from "@/components/announcement/display/NoticeTitle.vue";
import Modal from "@/components/interaction/overlay/Modal.vue";
import LoadingIndicator from "@/components/feedback/LoadingIndicator.vue";
import { useAnnouncementStore } from "@/stores/announcements";
import { formatAnnouncementDate } from "@/utils/announcement/format";

const rendererFailed = ref(false);
let retryLoad = null;
const Renderer = defineAsyncComponent({
  loader: () => import("@/components/markdown/Renderer.vue"),
  loadingComponent: LoadingIndicator,
  delay: 0,
  onError(error, retry) {
    retryLoad = retry;
    rendererFailed.value = true;
  },
});
const retryRenderer = () => {
  rendererFailed.value = false;
  retryLoad?.();
  retryLoad = null;
};

const props = defineProps({
  mode: {
    type: String,
    default: "",
    validator: (value) => ["", "summary", "detail"].includes(value),
  },
  selectedAnnouncement: {
    type: Object,
    default: null,
  },
  summaryAnnouncements: {
    type: Array,
    default: () => [],
  },
  canGoBack: {
    type: Boolean,
    default: false,
  },
});

const announcementStore = useAnnouncementStore();

const emit = defineEmits([
  "acknowledge",
  "acknowledge-detail",
  "back",
  "close",
  "open",
]);

const displayMode = ref(props.mode);
const displayAnnouncement = ref(props.selectedAnnouncement);
watch(
  () => [props.mode, props.selectedAnnouncement],
  ([nextMode, nextAnnouncement]) => {
    if (nextMode) displayMode.value = nextMode;
    if (nextAnnouncement) displayAnnouncement.value = nextAnnouncement;
  },
  { immediate: true },
);

const showsAnnouncementDetail = computed(
  () => displayMode.value === "detail" && Boolean(displayAnnouncement.value),
);
watch(() => [props.mode, props.selectedAnnouncement?.id], () => {
  if (showsAnnouncementDetail.value && rendererFailed.value) retryRenderer();
});
const buttonMode = computed(() =>
  displayMode.value === "summary"
    ? summaryRequiresConfirmation.value
      ? "confirm"
      : "footer"
    : showsAnnouncementDetail.value
      ? "footer"
      : "none",
);
const buttonText = computed(() =>
  displayMode.value === "summary"
    ? unreadSummaryCount.value
      ? translate('common.modal.markRead')
      : translate('common.modal.close')
    : translate('common.modal.gotIt'),
);
const unreadSummaryCount = computed(
  () =>
    props.summaryAnnouncements.filter(
      (announcement) => !announcementStore.isRead(announcement),
    ).length,
);
const summaryRequiresConfirmation = computed(
  () => displayMode.value === "summary" && unreadSummaryCount.value > 0,
);
const submit = () => {
  if (props.mode === "summary") {
    emit("acknowledge");
    return;
  }

  if (!showsAnnouncementDetail.value) return;
  emit("acknowledge-detail");

  if (props.canGoBack) return false;
};
</script>
