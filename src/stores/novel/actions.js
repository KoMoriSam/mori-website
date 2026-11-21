import { watch } from "vue";
import { moriSession } from "@/composables/auth/useMoriAuth";
import { useDebounceFn } from "@vueuse/core";

import { useToast } from "@/composables/useToast";

import { useChapterApi } from "@/services/api-chapters";

import { getChapterContextTitle } from "@/utils/novel/format-label";

import CONFIG from "@/constants/config.js";
import fm from "front-matter";

export const isNovelReaderRoute = (route) =>
  Boolean(route?.params?.volumeSlug && route?.params?.chapterSlug);

const isValidChapterCatalog = (data) =>
  Boolean(data) &&
  typeof data === "object" &&
  !Array.isArray(data) &&
  Object.values(data).every(
    (volume) => volume?.volumeInfo && Array.isArray(volume.chapters),
  );

export const useNovelActions = (state, getters) => {
  const CACHE_EXPIRATION = CONFIG.CACHE_EXPIRATION;
  const { fetchChapters, fetchContent } = useChapterApi();

  const toast = useToast({ position: "center-top", closable: false });
  let contentRequestToken = 0;
  watch(() => [moriSession.canReadNovel, moriSession.revision], () => {
    contentRequestToken++;
    state.currentChapterContent.value = '';
    state.contentCache.value = {};
    state.isLoadingContent.value = false;
  }, { flush: 'sync' });

  const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const ROUTE_CODE_PATTERN = /^[0-9A-Za-z]{6}$/;

  const normalizePermalinkSegment = (value, fallback = "item") => {
    const raw = String(value || "").trim();
    if (!raw) return fallback;

    return raw.replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  };

  const normalizeVolumePermalinkSegment = (value, fallback = "volume") => {
    const raw = String(value || "").trim();
    if (!raw) return fallback;

    const leadingTitle = raw.split(/\s+/)[0] || raw;
    return normalizePermalinkSegment(leadingTitle, fallback);
  };

  const buildPermalinkMaps = () => {
    const permalinkToUuid = {};
    const legacyPermalinkToUuid = {};
    const routeCodeToUuid = {};
    const uuidToPermalink = {};
    const volumeTitleCounter = {};

    for (const chapter of state.flatChapters.value) {
      const chapterPath = String(chapter.path || "");
      const [volumeRaw = "", chapterFileRaw = ""] = chapterPath.split("/");

      const volumeTitle = normalizeVolumePermalinkSegment(
        chapter.volumeTitle,
        volumeRaw,
      );
      const volumeTitleAlias = normalizePermalinkSegment(
        chapter.volumeTitle,
        volumeRaw,
      );
      const chapterTitle = normalizePermalinkSegment(
        chapter.title,
        chapterFileRaw,
      );
      const routeCode = String(chapter.routeCode || "").trim();
      const validRouteCode = ROUTE_CODE_PATTERN.test(routeCode)
        ? routeCode
        : "";
      const legacyVolumeKey = normalizePermalinkSegment(volumeRaw, "volume");
      const legacyChapterKey = normalizePermalinkSegment(
        chapterFileRaw.replace(/\.md$/i, ""),
        "chapter",
      );

      const titleKey = `${volumeTitle}/${chapterTitle}`;
      const legacyKey = `${legacyVolumeKey}/${legacyChapterKey}`;
      const duplicateIndex = (volumeTitleCounter[titleKey] || 0) + 1;
      volumeTitleCounter[titleKey] = duplicateIndex;

      const chapterPathName =
        duplicateIndex > 1 ? `${chapterTitle}-${duplicateIndex}` : chapterTitle;
      const canonicalKey = `${volumeTitle}/${chapterPathName}`;

      const permalink = {
        volumeSlug: volumeTitle,
        chapterSlug: chapterPathName,
        routeCode: validRouteCode,
      };

      permalinkToUuid[canonicalKey] = chapter.uuid;
      if (volumeTitleAlias !== volumeTitle) {
        permalinkToUuid[`${volumeTitleAlias}/${chapterPathName}`] =
          chapter.uuid;
      }
      legacyPermalinkToUuid[legacyKey] = chapter.uuid;
      if (validRouteCode) {
        routeCodeToUuid[validRouteCode] = chapter.uuid;
      }
      uuidToPermalink[chapter.uuid] = permalink;
    }

    state.chapterPermalinkToUuid.value = permalinkToUuid;
    state.chapterLegacyPermalinkToUuid.value = legacyPermalinkToUuid;
    state.chapterRouteCodeToUuid.value = routeCodeToUuid;
    state.chapterUuidToPermalink.value = uuidToPermalink;
  };

  const flatList = (list) => {
    state.flatChapters.value = Object.values(list).flatMap((volume) =>
      volume.chapters.map((chapter) => ({
        ...chapter,
        volumeTitle: volume.volumeInfo.title,
        volumeUuid: volume.volumeInfo.uuid,
      })),
    );
    buildPermalinkMaps();
  };

  const hydrateChapters = (data) => {
    if (!isValidChapterCatalog(data)) return false;

    state.chapters.value = data;
    flatList(data);
    state.isLoadingList.value = false;
    return true;
  };

  const resolveChapterUuidByPermalink = (volumeSlug, chapterSlug) => {
    const key = `${String(volumeSlug || "")}/${String(chapterSlug || "")}`;
    return (
      state.chapterPermalinkToUuid.value[key] ||
      state.chapterLegacyPermalinkToUuid.value[key] ||
      ""
    );
  };

  const resolveChapterUuidByRouteCode = (routeCode) => {
    return state.chapterRouteCodeToUuid.value[String(routeCode || "")] || "";
  };

  const getPermalinkByUuid = (uuid) => {
    return state.chapterUuidToPermalink.value[String(uuid || "")] || null;
  };

  const isUuid = (value) => UUID_PATTERN.test(String(value || "").trim());

  const isRouteCode = (value) =>
    ROUTE_CODE_PATTERN.test(String(value || "").trim());

  const hasRouteCodes = (chapters) => {
    return Object.values(chapters || {}).every((volume) =>
      (volume.chapters || []).every((chapter) =>
        isRouteCode(chapter.routeCode),
      ),
    );
  };

  const setRead = () => {
    if (!getters.currentChapter.value) return;

    const chapterSet = new Set(
      state.readChapters.value.map((item) => item.uuid),
    );
    if (!chapterSet.has(getters.currentChapter.value.uuid)) {
      state.readChapters.value = [
        ...state.readChapters.value,
        getters.currentChapter.value,
      ];
    }
  };

  // 章节相关操作
  let chaptersRequest = null;

  const setChapters = async (forceOrOptions = false, options = {}) => {
    const force =
      typeof forceOrOptions === "object" && forceOrOptions !== null
        ? Boolean(forceOrOptions.force)
        : Boolean(forceOrOptions);
    const silent =
      typeof forceOrOptions === "object" && forceOrOptions !== null
        ? Boolean(forceOrOptions.silent)
        : Boolean(options.silent);

    const now = Date.now();
    const cached = state.storedChapters.value;
    const hasCachedChapters =
      isValidChapterCatalog(cached) && Object.keys(cached).length > 0;
    const isCacheFresh =
      hasCachedChapters &&
      now - state.lastUpdated.value < CACHE_EXPIRATION &&
      hasRouteCodes(cached);

    if (!force && hasCachedChapters) {
      if (!state.flatChapters.value.length || isCacheFresh) {
        hydrateChapters(cached);
      }
      if (isCacheFresh) {
        return true;
      }
    }

    if (chaptersRequest) return chaptersRequest;

    const loadingToast = silent ? null : toast.loading("章节目录加载中……");
    state.isLoadingList.value = true;

    chaptersRequest = fetchChapters({ force })
      .then((data) => {
        if (!isValidChapterCatalog(data)) {
          throw new Error("Invalid novel index");
        }
        hydrateChapters(data);
        state.storedChapters.value = data;
        state.lastUpdated.value = Date.now();
        if (loadingToast) {
          loadingToast.success(
            force ? "章节目录已刷新！" : "章节目录加载完成！",
          );
        }
        return true;
      })
      .catch((error) => {
        console.error("章节目录加载失败:", error);
        loadingToast?.error("章节目录加载失败！");
        return false;
      })
      .finally(() => {
        state.isLoadingList.value = false;
        chaptersRequest = null;
      });

    return chaptersRequest;
  };

  const refreshChapters = useDebounceFn(async () => {
    await setChapters(true);
    state.contentCache.value = {};
  }, 500);

  const refreshReadChapters = useDebounceFn(() => {
    state.readChapters.value = [];
    toast.success("已清空阅读记录！");
  }, 500);

  // 内容相关操作
  const normalizeChapterContent = (value) =>
    Array.isArray(value) ? value.join("\n") : String(value || "");

  const loadChapterContent = async (
    forceUpdate = false,
    requestedUuid = state.currentChapterUuid.value,
  ) => {
    if (!moriSession.canReadNovel) return;
    const authRevision = moriSession.revision;
    const chapterUuid = String(requestedUuid || "");
    const chapter = state.flatChapters.value.find(
      (item) => String(item.uuid) === chapterUuid,
    );
    if (!chapter?.path) return;

    const requestToken = ++contentRequestToken;
    const isCurrentRequest = () =>
      moriSession.canReadNovel && authRevision === moriSession.revision &&
      requestToken === contentRequestToken &&
      String(state.currentChapterUuid.value || "") === chapterUuid;
    const cachedContent = normalizeChapterContent(
      state.contentCache.value[chapterUuid],
    );

    if (!forceUpdate && cachedContent) {
      state.isLoadingContent.value = true;
      console.log("loadChapterContent: Call cache");
      if (isCurrentRequest()) {
        state.currentChapterContent.value = cachedContent;
        if (Array.isArray(state.contentCache.value[chapterUuid])) {
          state.contentCache.value = {
            ...state.contentCache.value,
            [chapterUuid]: cachedContent,
          };
        }
        setRead();
        state.isLoadingContent.value = false;
      }
      return;
    }

    const loadingToast = toast.loading("章节内容加载中……");

    try {
      state.isLoadingContent.value = true;

      const markdownRaw = await fetchContent(chapter.path);
      if (!isCurrentRequest()) return;
      const { body: content } = fm(markdownRaw);
      // const parsedContent = splitMarkdown(content);
      const parsedContent = content;

      state.contentCache.value = {
        ...state.contentCache.value,
        [chapterUuid]: parsedContent,
      };

      if (isCurrentRequest()) {
        state.currentChapterContent.value = parsedContent;
        if (forceUpdate) {
          console.log("loadChapterContent: Force update");
          loadingToast.success("章节内容已刷新！");
        } else {
          console.log("loadChapterContent: First loading");
          loadingToast.success("章节内容加载完成！");
        }
        setRead();
      }
    } catch (error) {
      console.error("章节内容加载失败:", error);
      if (isCurrentRequest()) loadingToast.error("章节内容加载失败！");
    } finally {
      if (isCurrentRequest()) state.isLoadingContent.value = false;
      if (!isCurrentRequest()) toast.remove(loadingToast.id, loadingToast.position);
    }
  };

  const refreshContent = useDebounceFn(async () => {
    const { [state.currentChapterUuid.value]: _removed, ...rest } =
      state.contentCache.value;
    state.contentCache.value = rest;
    await loadChapterContent(true);
  }, 500);

  // 阅读进度相关操作
  const setChapter = useDebounceFn(async (uuid) => {
    const chapterUuid = String(uuid || "");
    state.currentChapterUuid.value = chapterUuid;
    await loadChapterContent(false, chapterUuid);
  }, 500);

  const setPage = useDebounceFn((page) => {
    state.currentChapterPage.value = page;
  }, 500);

  const updateTitle = (route) => {
    if (!isNovelReaderRoute(route)) {
      state.title.value = "《向远方》 | 远方之森";
      return;
    }

    if (getters.currentChapter.value) {
      state.title.value = getChapterContextTitle(getters.currentChapter.value);
    }
  };

  return {
    // 章节操作
    setChapters,
    hydrateChapters,
    refreshChapters,
    refreshReadChapters,

    // 内容操作
    loadChapterContent,
    refreshContent,

    // 阅读进度操作
    setChapter,
    setPage,
    updateTitle,
    setRead,
    resolveChapterUuidByPermalink,
    resolveChapterUuidByRouteCode,
    getPermalinkByUuid,
    isUuid,
    isRouteCode,
  };
};
