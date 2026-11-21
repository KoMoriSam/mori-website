import { computed } from "vue";
import { useHead } from "@unhead/vue";
import { useRoute } from "vue-router";
import { storeToRefs } from "pinia";

import { getBlogPagePath } from "@/constants/blog-pagination";
import { findRouteGame } from "@/games/catalog";
import { useLocale } from "@/i18n";
import { useArticlePageStore } from "@/stores/article-page";
import { useNovelStore } from "@/stores/novel";
import {
  getArticleLocales,
  getArticlePath,
} from "@/utils/blog/article-versions";

const SITE_URL = "https://komori.cc";
const SITE_NAME = "远方之森";
const DEFAULT_TITLE = "远方之森 | 个人博客与独立开发";
const DEFAULT_DESCRIPTION =
  "远方之森的个人网站，分享技术探索、随笔与读书笔记，平常也写点小说，提供一些实用小工具。";
const SOCIAL_IMAGE = `${SITE_URL}/assets/images/profile/me0.webp`;
const KEYWORDS = "远方之森,个人博客,技术博客,独立开发,原创小说,向远方";
const OG_LOCALE_BY_CODE = {
  "zh-CN": "zh_CN",
  en: "en_US",
  fr: "fr_FR",
  si: "si_LK",
};

export function useSiteHead() {
  const route = useRoute();
  const { t: translate, locale, text: localizeText } = useLocale();
  const novelStore = useNovelStore();
  const { title: novelTitle } = storeToRefs(novelStore);
  const articlePageStore = useArticlePageStore();

  const pageDescriptions = {
    get games() {
      return translate("games.description");
    },
    get licenses() {
      return translate("site.licensesDescription");
    },
    get blog() {
      return translate("site.blogDescription");
    },
    get "blog-article"() {
      return translate("site.articleDescription");
    },
    get changelog() {
      return translate("site.changelogDescription");
    },
    get announcements() {
      return translate("site.announcementsDescription");
    },
    get novel() {
      return translate("site.novelDescription");
    },
    get "novel-reader"() {
      return translate("site.chapterDescription");
    },
    get tools() {
      return translate("site.toolsDescription");
    },
    get "server-status"() {
      return translate("site.serverDescription");
    },
    get "sinhala-font-converter"() {
      return translate("site.sinhalaDescription");
    },
    get kaiming() {
      return translate("site.kaimingDescription");
    },
    get NotFound() {
      return translate("site.notFoundDescription");
    },
    test: "远方之森网站的组件测试页面。",
  };

  const routeName = computed(() => String(route.name || ""));
  const routeGame = computed(() => findRouteGame(routeName.value));
  const articlePage = computed(() =>
    articlePageStore.page?.path === route.path ? articlePageStore.page : null,
  );
  const article = computed(() =>
    articlePage.value ? articlePage.value.article : route.meta.article || null,
  );
  const isArticle = computed(() => Boolean(article.value));
  const contentLocale = computed(
    () => article.value?.lang || article.value?.sourceLocale || locale.value,
  );
  const blogPageNumber = computed(() => {
    if (!route.meta.blogList) return 1;

    const page = Number(route.params.page);
    return Number.isSafeInteger(page) && page > 1 ? page : 1;
  });
  const hasBlogFilters = computed(() => {
    if (!route.meta.blogList) return false;

    return ["q", "tag", "year"].some((key) => {
      const values = Array.isArray(route.query[key])
        ? route.query[key]
        : [route.query[key]];

      return values.some((value) => String(value || "").trim());
    });
  });
  const isIndexable = computed(
    () =>
      !["NotFound", "test", "novel-reader"].includes(routeName.value) &&
      !articlePage.value?.unavailable &&
      (!/^\/blog\/[^/]+(?:\/[^/]+)?$/.test(route.path) ||
        route.meta.blogList ||
        Boolean(article.value)),
  );

  const pageTitle = computed(() => {
    if (routeGame.value)
      return `${translate(routeGame.value.titleKey)} | ${SITE_NAME}`;
    if (routeName.value === "games")
      return `${translate("games.title")} | ${SITE_NAME}`;
    if (routeName.value === "home") return localizeText(DEFAULT_TITLE);
    if (routeName.value === "novel-reader") return novelTitle.value;
    if (route.meta.blogList) {
      return translate("site.blogPageTitle", { p0: blogPageNumber.value });
    }
    return article.value?.title
      ? `${article.value.title} | ${SITE_NAME}`
      : `${localizeText(String(route.meta.title || DEFAULT_TITLE).replace(/ \| 远方之森$/, ""))} | ${SITE_NAME}`;
  });

  const pageDescription = computed(() => {
    if (route.meta.blogList && blogPageNumber.value > 1) {
      return translate("site.blogPageDescription", {
        p0: blogPageNumber.value,
      });
    }

    const description =
      article.value?.summary ||
      (routeGame.value ? translate(routeGame.value.descriptionKey) : "") ||
      pageDescriptions[routeName.value] ||
      localizeText(DEFAULT_DESCRIPTION);

    return String(description).replace(/\s+/g, " ").trim().slice(0, 160);
  });

  const canonicalUrl = computed(() => {
    if (article.value)
      return new URL(
        getArticlePath(
          article.value,
          article.value.lang || article.value.sourceLocale || "zh-CN",
        ),
        `${SITE_URL}/`,
      ).href;
    const path = routeName.value === "home" ? "/" : route.path;
    return new URL(path, `${SITE_URL}/`).href;
  });

  const headLinks = computed(() => {
    if (!isIndexable.value) return [];

    const links = [{ rel: "canonical", href: canonicalUrl.value }];
    if (article.value) {
      for (const lang of getArticleLocales(article.value)) {
        links.push({
          rel: "alternate",
          hreflang: lang,
          href: new URL(getArticlePath(article.value, lang), `${SITE_URL}/`)
            .href,
        });
      }
    }

    if (!route.meta.blogList || hasBlogFilters.value) return links;

    const totalPages = Math.max(
      1,
      Math.trunc(Number(route.meta.blogTotalPages) || 1),
    );
    const currentPage = Math.min(totalPages, blogPageNumber.value);

    if (currentPage > 1) {
      links.push({
        rel: "prev",
        href: new URL(getBlogPagePath(currentPage - 1), `${SITE_URL}/`).href,
      });
    }

    if (currentPage < totalPages) {
      links.push({
        rel: "next",
        href: new URL(getBlogPagePath(currentPage + 1), `${SITE_URL}/`).href,
      });
    }

    return links;
  });

  const structuredData = computed(() => {
    const person = {
      "@type": "Person",
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      sameAs: [
        "https://github.com/KoMoriSam",
        "https://space.bilibili.com/71104942",
        "https://weibo.com/u/5281976456",
      ],
    };

    if (isArticle.value) {
      return {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: article.value?.title || pageTitle.value,
        description: pageDescription.value,
        url: canonicalUrl.value,
        mainEntityOfPage: canonicalUrl.value,
        inLanguage: contentLocale.value,
        datePublished: article.value?.date || article.value?.created,
        dateModified: article.value?.modified || article.value?.date,
        author: person,
      };
    }

    if (routeName.value === "home") {
      return {
        "@context": "https://schema.org",
        "@type": "ProfilePage",
        name: pageTitle.value,
        description: pageDescription.value,
        url: canonicalUrl.value,
        inLanguage: locale.value,
        mainEntity: person,
      };
    }

    return {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: pageTitle.value,
      description: pageDescription.value,
      url: canonicalUrl.value,
      inLanguage: routeName.value.startsWith("novel") ? "zh-CN" : locale.value,
      isPartOf: {
        "@type": "WebSite",
        name: SITE_NAME,
        url: `${SITE_URL}/`,
      },
      author: person,
    };
  });

  useHead(() => {
    const articleMeta = [];

    if (isArticle.value && article.value?.date) {
      articleMeta.push({
        property: "article:published_time",
        content: String(article.value.date),
      });
    }

    if (isArticle.value && article.value?.modified) {
      articleMeta.push({
        property: "article:modified_time",
        content: String(article.value.modified),
      });
    }

    return {
      title: pageTitle.value,
      htmlAttrs: {
        lang: contentLocale.value,
      },
      link: headLinks.value,
      meta: [
        { name: "description", content: pageDescription.value },
        { name: "keywords", content: localizeText(KEYWORDS) },
        { name: "author", content: SITE_NAME },
        {
          name: "robots",
          content: isIndexable.value
            ? "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
            : "noindex, nofollow",
        },
        {
          property: "og:locale",
          content: OG_LOCALE_BY_CODE[contentLocale.value],
        },
        { property: "og:site_name", content: SITE_NAME },
        { property: "og:title", content: pageTitle.value },
        { property: "og:description", content: pageDescription.value },
        {
          property: "og:type",
          content: isArticle.value ? "article" : "website",
        },
        { property: "og:url", content: canonicalUrl.value },
        { property: "og:image", content: SOCIAL_IMAGE },
        {
          property: "og:image:alt",
          get content() {
            return translate("site.avatar");
          },
        },
        { name: "twitter:card", content: "summary" },
        { name: "twitter:title", content: pageTitle.value },
        { name: "twitter:description", content: pageDescription.value },
        { name: "twitter:image", content: SOCIAL_IMAGE },
        ...articleMeta,
      ],
      script: [
        {
          key: "structured-data",
          type: "application/ld+json",
          textContent: JSON.stringify(structuredData.value),
        },
      ],
    };
  });
}
