const HTML_SUFFIX = /\.html$/i;

// 旧站遗留链接：`/index.html`、`*.html`、`/blog?article=<id>`。
export function installLegacyRedirects(router) {
  router.beforeEach((to) => {
    if (HTML_SUFFIX.test(to.path)) {
      return {
        path: to.path === "/index.html" ? "/" : to.path.replace(HTML_SUFFIX, ""),
        query: to.query,
        hash: to.hash,
        replace: true,
      };
    }

    const legacyArticleId =
      typeof to.query.article === "string" ? to.query.article.trim() : "";
    if (legacyArticleId && to.path === "/blog") {
      const query = { ...to.query };
      delete query.article;
      return {
        name: "blog-article",
        params: { articleId: legacyArticleId },
        query,
        hash: to.hash,
        replace: true,
      };
    }
  });
}
