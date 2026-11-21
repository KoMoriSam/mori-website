<template>
  <NavigationFeedback />
  <NavBar />
  <NoticeDialog
    :mode="overlayMode"
    :selected-announcement="selectedAnnouncement"
    :summary-announcements="summaryAnnouncements"
    :can-go-back="canReturnToSummary"
    @acknowledge="announcementStore.acknowledgeSummary"
    @acknowledge-detail="announcementStore.acknowledgeAnnouncement"
    @back="announcementStore.returnToSummary"
    @close="announcementStore.closeOverlay"
    @open="announcementStore.openAnnouncement"
  />
  <router-view />
  <BackToTop v-if="!route.meta.hideToTop" />
</template>

<script setup>
import { onBeforeUnmount, onMounted, watch } from "vue";
import { loadImageManifest } from "@/utils/images/responsive-images";
import { useRoute, useRouter } from "vue-router";
import { storeToRefs } from "pinia";

import { useMoriAuth } from "@/composables/auth/useMoriAuth";
import NavBar from "@/components/layout/NavBar.vue";
import NavigationFeedback from "@/components/feedback/NavigationFeedback.vue";
import NoticeDialog from "@/components/announcement/interaction/NoticeDialog.vue";
import BackToTop from "./components/interaction/navigation/BackToTop.vue";
import { useAnalyticsStore } from "@/stores/analytics";
import { useAnnouncementStore } from "@/stores/announcements";

import { useSearchResultHighlight } from "@/composables/useSearchResultHighlight";

import { useStorageMigration } from "@/composables/storage/useStorageMigration";
import { useLocale } from "@/i18n";
import { useSiteHead } from "@/composables/layout/useSiteHead";
import { useThemeTransition } from "@/composables/layout/useThemeTransition";
import { useGlobalStorage } from "@/composables/storage/useGlobalStorage";
import { useToast } from "@/composables/useToast";

const { t: translate, restoreLocale } = useLocale();
const { GLOBAL_INFO } = useGlobalStorage();
const localeToast = useToast();

const route = useRoute();
useThemeTransition();
useSiteHead();
const auth = useMoriAuth();
const router = useRouter();
let stopAuth;
onMounted(() => {
  stopAuth = auth.start(router);
});
onBeforeUnmount(() => stopAuth?.());
const analyticsStore = useAnalyticsStore();
const announcementStore = useAnnouncementStore();
const {
  canReturnToSummary,
  overlayMode,
  selectedAnnouncement,
  summaryAnnouncements,
} = storeToRefs(announcementStore);
let stopAnalyticsRouteWatch = null;
useSearchResultHighlight();

const isPrerenderBot =
  typeof navigator !== "undefined" &&
  /HeadlessChrome|Prerender/i.test(navigator.userAgent);

onMounted(() => {
  void loadImageManifest(import.meta.env.VITE_BLOG_RAW);
  void loadImageManifest(import.meta.env.VITE_NOVEL_RAW);
  if (isPrerenderBot) {
    if (typeof localStorage !== "undefined") {
      localStorage.clear();
    }

    return;
  }

  const { migrateStorage } = useStorageMigration();
  migrateStorage();

  void restoreLocale(GLOBAL_INFO).catch(() =>
    localeToast.error(translate("common.languageLoadFailed")),
  );

  void announcementStore.fetchAnnouncements().then((announcements) => {
    if (announcements) announcementStore.showImportantSummary();
  });

  analyticsStore.startTracking();
  stopAnalyticsRouteWatch = watch(
    () => route.fullPath,
    () => {
      void analyticsStore.trackVisit();
    },
  );
});

onBeforeUnmount(() => {
  stopAnalyticsRouteWatch?.();
  analyticsStore.stopTracking();
});
</script>
