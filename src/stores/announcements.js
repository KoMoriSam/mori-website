import { computed, ref } from "vue";
import { defineStore } from "pinia";

import { fetchAnnouncements as requestAnnouncements } from "@/services/api-announcements";
import {
  announcementKey,
  getPrioritizedActiveAnnouncements,
  getUnreadAnnouncements,
  getUnpromptedAnnouncements,
  isAnnouncementRead,
  withAnnouncementRead,
} from "@/utils/announcement/state";
import { useHydratedStorage } from "@/composables/storage/useHydratedStorage";

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const SESSION_PROMPTED_KEY = "ANNOUNCEMENT_PROMPTED_V1";
const PROMPT_VISIT_ID = Symbol.for("komori.announcementPromptVisitId");

const isPlainObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const getPromptVisitId = () => {
  if (typeof window === "undefined") return "";
  if (!window[PROMPT_VISIT_ID]) {
    window[PROMPT_VISIT_ID] =
      globalThis.crypto?.randomUUID?.() ||
      `${globalThis.performance?.timeOrigin || Date.now()}:${Math.random()}`;
  }
  return window[PROMPT_VISIT_ID];
};

const readSessionKeys = () => {
  if (typeof sessionStorage === "undefined") return new Set();

  try {
    const value = JSON.parse(
      sessionStorage.getItem(SESSION_PROMPTED_KEY) || "{}",
    );
    if (
      value?.visitId !== getPromptVisitId() ||
      !Array.isArray(value.promptedKeys)
    ) {
      return new Set();
    }
    return new Set(value.promptedKeys.map(String));
  } catch {
    return new Set();
  }
};

const writeSessionKeys = (keys) => {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(
      SESSION_PROMPTED_KEY,
      JSON.stringify({
        visitId: getPromptVisitId(),
        promptedKeys: [...keys],
      }),
    );
  } catch {
    // 存储不可用时仅失去标签页级抑制，不影响公告阅读。
  }
};

export const useAnnouncementStore = defineStore("announcements", () => {
  const items = ref([]);
  const loading = ref(false);
  const error = ref(null);
  const loaded = ref(false);
  const updatedAt = ref("");
  const lastFetchedAt = ref(0);
  const overlayMode = ref("");
  const selectedAnnouncementId = ref("");
  const summaryAnnouncementKeys = ref([]);
  const { storage } = useHydratedStorage("ANNOUNCEMENT_STATE_V1", {
    readRevisions: {},
  });

  let requestPromise = null;

  const readRevisions = computed(() =>
    isPlainObject(storage.value?.readRevisions)
      ? storage.value.readRevisions
      : {},
  );

  const isRead = (announcement) =>
    isAnnouncementRead(readRevisions.value, announcement);

  const activeAnnouncements = computed(() =>
    getPrioritizedActiveAnnouncements(items.value, readRevisions.value),
  );
  const historyAnnouncements = computed(() =>
    items.value.filter((announcement) => !announcement.active),
  );
  const unreadAnnouncements = computed(() =>
    getUnreadAnnouncements(items.value, readRevisions.value),
  );
  const unreadImportantAnnouncements = computed(() =>
    activeAnnouncements.value.filter(
      (announcement) =>
        announcement.priority === "important" && !isRead(announcement),
    ),
  );
  const selectedAnnouncement = computed(() =>
    items.value.find(
      (announcement) => announcement.id === selectedAnnouncementId.value,
    ),
  );
  const summaryAnnouncements = computed(() => {
    const announcementsByKey = new Map(
      items.value.map((announcement) => [announcementKey(announcement), announcement]),
    );
    return summaryAnnouncementKeys.value
      .map((key) => announcementsByKey.get(key))
      .filter(Boolean);
  });
  const canReturnToSummary = computed(
    () =>
      overlayMode.value === "detail" && summaryAnnouncements.value.length > 0,
  );

  const markRead = (announcement) => {
    if (!announcement) return;
    storage.value = {
      readRevisions: withAnnouncementRead(readRevisions.value, announcement),
    };
  };

  const markAllRead = (announcements = activeAnnouncements.value) => {
    let nextRevisions = readRevisions.value;
    for (const announcement of announcements) {
      if (announcement) {
        nextRevisions = withAnnouncementRead(nextRevisions, announcement);
      }
    }
    if (nextRevisions !== readRevisions.value) {
      storage.value = { readRevisions: nextRevisions };
    }
  };

  const fetchAnnouncements = async ({ force = false } = {}) => {
    if (typeof window === "undefined") return null;
    if (requestPromise) return requestPromise;
    if (
      !force &&
      loaded.value &&
      Date.now() - lastFetchedAt.value < REFRESH_INTERVAL_MS
    ) {
      return items.value;
    }

    loading.value = true;
    error.value = null;
    requestPromise = requestAnnouncements({ force })
      .then((payload) => {
        if (!payload) return null;
        items.value = payload.items;
        updatedAt.value = payload.updatedAt;
        loaded.value = true;
        lastFetchedAt.value = Date.now();
        return items.value;
      })
      .catch((requestError) => {
        error.value =
          requestError?.name === "AbortError"
            ? "公告请求超时，请稍后重试。"
            : String(requestError?.message || "公告暂时无法加载。");
        return null;
      })
      .finally(() => {
        loading.value = false;
        requestPromise = null;
      });

    return requestPromise;
  };

  const refreshIfStale = () => fetchAnnouncements();

  const showImportantSummary = () => {
    const promptedKeys = readSessionKeys();
    const announcements = getUnpromptedAnnouncements(
      unreadImportantAnnouncements.value,
      promptedKeys,
    );
    if (!announcements.length) return;

    for (const announcement of announcements) {
      promptedKeys.add(announcementKey(announcement));
    }
    writeSessionKeys(promptedKeys);
    summaryAnnouncementKeys.value = announcements.map(announcementKey);
    selectedAnnouncementId.value = "";
    overlayMode.value = "summary";
  };

  const openAnnouncement = (announcement) => {
    if (!announcement) return;
    markRead(announcement);
    selectedAnnouncementId.value = announcement.id;
    overlayMode.value = "detail";
  };

  const acknowledgeAnnouncement = () => {
    markRead(selectedAnnouncement.value);
    if (canReturnToSummary.value) {
      returnToSummary();
      return;
    }
    closeOverlay();
  };

  const acknowledgeSummary = () => {
    markAllRead(summaryAnnouncements.value);
    overlayMode.value = "";
    summaryAnnouncementKeys.value = [];
  };

  const returnToSummary = () => {
    if (!summaryAnnouncements.value.length) return;
    selectedAnnouncementId.value = "";
    overlayMode.value = "summary";
  };

  const closeOverlay = () => {
    overlayMode.value = "";
    selectedAnnouncementId.value = "";
    summaryAnnouncementKeys.value = [];
  };

  return {
    items,
    loading,
    error,
    loaded,
    updatedAt,
    overlayMode,
    activeAnnouncements,
    historyAnnouncements,
    unreadAnnouncements,
    unreadImportantAnnouncements,
    selectedAnnouncement,
    summaryAnnouncements,
    canReturnToSummary,
    isRead,
    markRead,
    markAllRead,
    fetchAnnouncements,
    refreshIfStale,
    showImportantSummary,
    openAnnouncement,
    acknowledgeAnnouncement,
    acknowledgeSummary,
    returnToSummary,
    closeOverlay,
  };
});
