# mori-website 长期重构计划

> 本文档基于全仓只读架构诊断建立，将技术债治理拆解为 **5 个阶段（Phase 0 ~ Phase 4）、共 18 个独立可验收的任务单元**。
> 原则：**每次只执行 1 个任务单元**，跑完对应自动化检查并经用户人工验收通过后自动提交，同步勾选本清单进度并在结构变化时更新 `REPO_OVERVIEW.md`。

---

## 执行与验收约定

1. **单任务单提交**：每个 `P*-*` 任务单元为一个独立工作包；同一任务内的多轮修复不产生中间 Commit。
2. **禁止顺带大改**：除非当前任务明确包含，否则不要跨阶段修改无关文件。
3. **先验证再交付**：改动完成后必须运行该任务列出的 `pnpm check ...`（或相关构建/dry-run 命令），并向用户明确指出需要人工验证的页面与交互。
4. **遵循新红线**：所有新增与重构代码严格遵守 `AGENTS.MD` 中的反防御性编程红线、组件拆分红线与 `kebab-case` Store 命名规范。

---

## Phase 0：止血修复、死路由治理与无风险清理

> **目标**：修复检视中已确认的 6 处真实 Bug，清除确定无引用的死代码与最刺眼的无效防御性写法，零架构风险、立竿见影。

### - [x] P0-1：修复 `src/router/index.js` 死路由实例与重复标题钩子
- **问题定位**：
  - `src/main.js` 仅导入 `{ routes, scrollBehavior }` 交给 `ViteSSG` 自建 router，导致 `src/router/index.js:203-316` 创建的默认 `router` 及其 `beforeEach`（旧 `.html` 重定向、旧 `?article=` 参数重定向）与 `afterEach` 在线上从未生效。
  - `router/index.js` 内的 `document.title = ...` 与 `src/App.vue` 的 `useHead` 语义冲突。
- **改造动作**：
  - 将有效的旧链接重定向守卫（`/index.html`、`*.html`、`/blog?article=...`）抽为纯安装函数 `installLegacyRedirects(router)`，在 `src/main.js` 的 `ViteSSG` 回调中挂载到真实 `router`。
  - 移除 `src/router/index.js` 中冲突的 `document.title` 写入与模块级 `beforeEach`/`afterEach`；核对 `scripts/checks/i18n-loading.mjs:20`（唯一导入 `default: router` 的调用方），改为在测试脚本中用 `createRouter` 或保留无副作用的纯 `resolve` 辅助。
- **验证**：`pnpm check i18n-loading`、`pnpm check blog`、`pnpm check site-perf`；本地访问 `/blog.html`、`/blog?article=<id>` 确认正确重定向且页面 `<title>` 正常。

### - [x] P0-2：修复 5 处已定位的运行时 / 语义 Bug
- **涉及文件与修复点**：
  1. `src/views/blog/ArticleReader.vue:175`：修复 `data-pagefind-meta="localizeText(title)"` 误写，恢复为 `data-pagefind-meta="title"`。
  2. `src/views/tools/SinhalaFontConverter.vue:2814-2817`：改为 `liveMessage.value = localizeText(documentError.value)`，消除 `[object Object]` 播报。
  3. `src/views/tools/ImageConverter.vue:1477-1480`：将 `remixIconCategories` 改为 `computed`，修复运行时切换语言分类标签不刷新问题；顺手消除 `L2565-2569` 重复 `find`。
  4. `workers/api.js:1034-1065`：将 `request.method !== "GET"` 校验移到缓存读取与 `checkPixabayRateLimit` 之前，防止非 GET 请求误扣限流配额。
  5. `src/components/games/fogport/layout/PlayTable.vue:136`：将嵌套在 `ContentPage` `<main>` 内部的 `<main>` 改为 `<section>` 或 `<div>`。
  6. 统一阅读时长计算除数（`ArticleReader.vue:790` 的 `400` 与 `ArticleList.vue:1274` / `Renderer.vue:551` 的 `300` 统一收口为一个共享常量/函数，待执行时确认采用 `300` 还是 `400`）。
- **验证**：`pnpm check image-converter`、`pnpm check sinhala`、`pnpm check fogport`、`pnpm check blog-build`；人工检查图片转换切换语言、僧伽罗文档报错提示、博客详情与列表阅读时长一致。

### - [x] P0-3：清理零引用死文件、死配置与低风险无效防御代码
- **涉及文件与清理项**：
  - 删除确认无任何引用的死文件：`src/services/api-quotes.js`、`src/utils/markdown/split-markdown.js`（同步删两处注释掉的 import）、`src/utils/novel/normalize-route.js`、`src/composables/games/avalon/useAvalonAudio.js`。
  - 清理 `wrangler.api.jsonc:46-51` 未使用的重复 D1 绑定 `komorisam_analytics`（同步检查 `scripts/release/environment.mjs:52-53`）。
  - 清理明确无争议的死代码与恒真/无意义 `try/catch`：
    - `src/composables/usePosTracker.js:151-155`（`try { return decoded; } catch`）
    - `src/utils/reader/create-reader-share-card.js:160-165`（`ctx.fillStyle` `try/catch`）
    - `src/composables/reader/useContentReadTracking.js:93-97`（死外层 `catch`）与 `L51-55,123-127`（冗余 `mounted` 后 `typeof`）
    - `src/i18n/index.js:158-162,215-219`（与 `locale.js` 重复的双层 `try/catch`）
    - `src/components/novel/mobile/controls/ReaderControls.vue:444-445`（相同 `if/else` 分支）
    - `src/components/novel/mobile/layout/PagedReader.vue:666-667`（冗余 `rects.length === 0`）与 `:1693`（多余 `{ deep: true }`）
    - `src/components/markdown/Renderer.vue:157-160,178,1044-1046`（未使用 prop/emit 与末尾空守卫）
    - `src/components/interaction/controls/RangeController.vue:17,20`、`src/components/games/fogport/layout/Sidebar.vue:72`、`src/components/interaction/overlay/Modal.vue:109`、`src/composables/useModal.js:395-408`、`src/composables/novel/useChapterSetup.js:14`、`src/constants/config.js` 死分支。
    - `workers/games/gateway.js:62`（重复 `CODE.test(code)`）、`workers/avalon/rules.js:144,769`（死分支与死 `lancelot_draw` 过滤）。
    - `onMounted`/`onBeforeUnmount` 内部的无效 `typeof window/document` 检查（`useThemeTransition.js`、`useSearchResultHighlight.js`、`useArticleFilter.js`、`usePointerDrag.js`、`useRevealCurrentItem.js`）。
- **验证**：`pnpm check env`、`pnpm check i18n`、`pnpm check games`、`pnpm check avalon`、`pnpm check fogport`、`pnpm check markdown`、`pnpm check blog`、`pnpm check site-perf`。

---

## Phase 1：共享契约、请求/存储基础设施与 Workers 拆分

> **目标**：把跨端重复校验、平行 HTTP/Storage 实现和巨型 `workers/api.js` 彻底收口，为后续组件重构打好稳定底座。

### - [x] P1-1：收拢 Changelog 与 Announcement 契约到 `shared/`
- **现状问题**：类型表、日期校验 `isValidDate`、版本比较 `compareVersions` 与完整 schema 校验在 `workers/api.js`、`scripts/release/*`、`src/services/api-{changelog,announcements}.js`、`src/utils/type-changelog.js` 重复 3~5 份；Changelog 单次拉取在 `api-changelog.js` 与 `changelogStore.js` 重复校验排序 2 次，且 `{ force }` 参数被静默忽略。
- **改造动作**：
  - 扩充 `shared/changelog.js`：统一导出 `CHANGELOG_TYPES`、`isValidDate`、`compareVersions`、`normalizeRelease`、`normalizeChangelogPayload`、`sameChangelog`。
  - 新建 `shared/announcements.js`：统一导出 `ANNOUNCEMENT_TONES`、`ANNOUNCEMENT_PRIORITIES`、`ANNOUNCEMENT_TEXT_LIMITS`、`normalizeAnnouncement`、`normalizeAnnouncementsPayload`。
  - 切换 `workers/api.js`、`scripts/release/{changelog-content,announcement}.mjs`、`src/services/api-{changelog,announcements}.js`、`src/utils/type-changelog.js` 全部复用 `shared/`；移除 `changelogStore.js:23` 重复归一化并决定 `fetchChangelog` 是否真正透传 `cache: force ? "reload" : "no-store"` 或移除无效参数。
- **验证**：`pnpm check changelog`、`pnpm check announcements`、`pnpm check release-deploy`。

### - [x] P1-2：统一前端 HTTP 请求封装与 Manifest 加载器
- **现状问题**：7 处手写 `AbortController` + `setTimeout` + `normalizeEndpoint` + JSON 错误解析；`avatar-manifests.js` 与 `responsive-images.js` 复制几乎相同的请求注册表；`search-content.js` 反向依赖 `composables/blog/useArticleFilter.js`。
- **改造动作**：
  - 新建 `src/services/http.js`：提供 `normalizeEndpoint`、`fetchJson(url, { timeout, ... })`（统一采用原生 `AbortSignal.timeout` + 结构化 `HttpError`）。
  - 迁入 `api-analytics.js`、`api-announcements.js`、`api-changelog.js`、`api-paragraph-comments.js`、`useGameRoom.js` 等调用方，同时清除 `commentCountsStore` 与 `api-paragraph-comments` 之间的双层去重/4 次 `trim`。
  - 抽出 `src/utils/images/create-manifest-registry.js` 统一 `responsive-images.js` 与 `avatar-manifests.js` 的加载、去重与校验（消除二次校验）。
  - 将 `normalizeArticleTag`、`formatArticleTag`、`normalizeArticleDate` 等纯函数从 `composables/blog/useArticleFilter.js` 下沉到 `src/utils/blog/article-fields.js`，消除服务层对 Composable 层的反向依赖，同步统一 `related-articles.js` 与 `article-timeliness.js` 的标签标准化。
  - 修复 `src/services/search-content.js:349-360` 静默 `catch {}` 与 `L448-457` 同对象双检、`L393-396` 重复计算 metadata。
- **验证**：`pnpm check responsive-images`、`pnpm check markdown-avatars`、`pnpm check blog`、`pnpm check game-room-client`、`pnpm check announcements`、`pnpm check changelog`。

### - [x] P1-3：治理持久化 Storage 层与消除 `computed()` 状态写入副作用
- **现状问题**：
  - `announcementStore.js:100-103`、`useGlobalStorage.js:59`、`useReadingStateStorage.js:50` 在 `computed()` getter 或 getter 函数内直接修改响应式 Storage。
  - 4 处复制相同的旧键正则解析；恒等 `keyMapping` 空转；8 处业务直接绕过 `useHydratedStorage` 访问 `localStorage`。
- **改造动作**：
  - 在 `src/composables/storage/` 抽离唯一 `parseLegacyStorageValue` 工具，移除恒等 `keyMapping` 与重复解析；将 `getInfo`/`getState` 改为纯读取（不写回默认值），仅在初始化或显式写入时落盘。
  - 修复 `announcementStore.js`：将 `ensureStorageShape()` 从 `computed` 中移除，改为仅在读取初始化/写入前规范化一次。
  - 将 `useParagraphCommentsStorage.js`（纯内存缓存，非 Storage）移出 `composables/storage/` 或改名以名实相符；整理 `themeStore.js:7` 模块顶层 `usePreferredDark()` 到 store 内部或显式客户端范围。
  - 评估历史迁移（`STORAGE_MIGRATION_V2` / `DISCARD_STORAGE_V1`）是否仍需保留单次启动迁移，若保留则集中到 `useStorageMigration.js` 一处，移除各 `use*Storage.js` 中散落的在线旧键兼容读取。
- **验证**：`pnpm check announcements`、`pnpm check i18n-runtime`、`pnpm check site-perf`；本地清除与伪造旧 `localStorage` 数据人工验证主题/语言/阅读设置/公告已读状态恢复与无 hydration 警告。

### - [x] P1-4：统一 `src/stores/` 文件命名为 `kebab-case` 并瘦身 Store 边界
- **现状问题**：6 个文件用 `*Store.js`（`analyticsStore.js` 等），1 个用 `article-page.js`，另有一个子目录 `novel/`；`readerStore.js` 保留两套平行 mobile/desktop 预设 API；`novel/actions.js` 存在永远返回 `1` 的 `getChapterPageCount()`、手写 `window.location` 判断、以及与 `useNovelChapters.js` 重复的目录缓存逻辑。
- **改造动作**：
  - 将 `src/stores/` 文件统一重命名为 `kebab-case`：`analytics.js`、`announcements.js`、`changelog.js`、`comment-counts.js`、`reader.js`、`theme.js`（保留导出函数名 `use*Store` 不变，避免大规模改业务变量名，同步更新 `src/` 与 `scripts/checks/` 全部 import）。
  - 清理 `reader.js` 中重复的 `mobileLayoutPresets` / `removeMobileLayoutPreset` 等平行别名（先统一调用方再删别名）。
  - 清理 `novel/actions.js` 中死方法 `getChapterPageCount()`（核对所有调用点）、统一 `isNovelReaderRoute(route)` 与首章默认 UUID 常量，让 `useNovelChapters.js` 复用 `novel` Store 而非平行重写缓存。
  - 将 `App.vue` 中约 280 行 SEO/Head/JSON-LD 计算抽离为 `src/composables/layout/useSiteHead.js`（同时修掉 `findRouteGame` 重复调用）。
- **验证**：全量 `git grep` 确认无旧 `*Store` 路径残留；运行 `pnpm check site-perf`、`pnpm check i18n-runtime`、`pnpm check blog`、`pnpm check announcements`、`pnpm check changelog`、`pnpm check build-assets`。

### - [x] P1-5：拆解 `workers/api.js`（1332 行）并统一 Worker 公共库与 Dev 对齐
- **现状问题**：`workers/api.js` 混杂 6 个域；流式限字节 `readJson`（3 处）、CORS/Origin 匹配（3 处）、SHA-256 hex（4 处）、GitHub 头像 URL 校验（3 处）重复；`workers/api-entry.js` 与 `workers/auth/index.js` 有裸 `catch {}` 丢日志；`workers/dev/website.js` 代理了 `/api/changelog` 导致与生产 `workers/website.js` 回退逻辑漂移。
- **改造动作**：
  - 新建 `workers/lib/{http.js,cors.js,crypto.js,kv-json.js}`，收口限字节 JSON 解析（同步修补 `workers/github/comments.js:397` 未拒绝对数组 `[]` 的缺口）、CORS 匹配、SHA-256 hex 与 KV 读-验-响应模板。
  - 将 `workers/api.js` 拆分为 `workers/api/{announcements.js,changelog.js,analytics.js,hero.js}`，`workers/api.js` 仅留清晰路由入口与 `GameRoom` 导出（消除 `normalizeAnnouncementText` 跨域借调与 `startsAt` 3 次解析）。
  - 为 `workers/api-entry.js:58,74` 和 `workers/auth/index.js:139` 补齐带 `requestId` 与错误摘要的结构化 `console.error`，不再静默丢弃异常。
  - 对齐 `workers/dev/website.js:30-33`，不再绕过 `workers/website.js` 的 `/api/changelog` 回退路径；收敛 `workers/github/discussions.js` 的重复 `getSourceConfig` 与重复钳制、`workers/games/state.js` 重复 3 次的开局初始化。
- **验证**：`pnpm check dev`、`pnpm check github`、`pnpm check announcements`、`pnpm check changelog`、`pnpm check games`、`pnpm check env`。

---

## Phase 2：公共控件去污染与高频重复交互收拢

> **目标**：让通用层彻底脱离具体业务污染，消灭跨页面复制粘贴的 200+ 行交互与重复样式编译。

### - [x] P2-1：净化 `FontSelect.vue`（1410 行）与拆解 `CatalogCard.vue`（22 Props）
- **改造动作**：
  - 将 `FontSelect.vue` 中 230+ 行僧伽罗专属字体名单（15 Unicode + 74 Legacy）、16 条正则、`probeLegacyLocalFonts` 与 `localFontCoverage` 全部移回 `src/utils/sinhala/font-catalog.js`，`FontSelect.vue` 通过通用的 `localFontFilter` / `probeLocalFonts` / `fallbackFamily` 回调保持纯通用控件；拆出 `useLocalFonts.js` 管理 Local Font Access API 与 `<style>` 注入；统一替换 3 处 `document.styleSheets` 递归遍历为 `src/utils/dom/stylesheets.js`。
  - 审视 `CatalogCard.vue` 的 22 个 Props：将常规内容卡片与可展开手风琴变体拆解或插槽化，把单组件 Props 降至 10 个以内；消除其中未 scoped 的 `.badge` 样式污染，并与 `ArticleReader.vue` 复用统一封面降级底图组件。
- **验证**：`pnpm check sinhala`、`pnpm check image-converter`、`pnpm check blog`；人工验证博客列表、首页卡片、工具集卡片、阅读器字体选择、图片水印字体与僧伽罗字体选择。

### - [x] P2-2：抽离搜索与过滤自动补全引擎（消除 `SiteSearch` 与 `ArticleList` 220 行重复）
- **涉及文件**：`src/components/interaction/overlay/SiteSearch.vue`（1712 行）、`src/views/blog/ArticleList.vue`（1299 行）。
- **改造动作**：
  - 抽取 `src/composables/useFilterTokenInput.js` 统一 `#`/`/`/`@` Token 解析、IME 合成态、键盘上下选择、回退删除与外部点击关闭。
  - 抽取 `src/components/display/HighlightedText.vue` 替代 6 处手写 `<mark>` 循环。
  - 从 `SiteSearch.vue` 拆出 `useSiteSearchEngine.js`（双 Pagefind 加载、鉴权开关与本地回退评分）及 `SearchResultList.vue`，让 `SiteSearch.vue` 专注交互壳层（消除 3 处重复打开逻辑与每项重建 getter 对象）。
- **验证**：`pnpm check blog`、`pnpm check i18n-runtime`；人工验证全局搜索（含小说登录前后搜索、URL 同步、键盘导航）与博客列表多标签/年份/关键词过滤。

### - [x] P2-3：收拢博客/小说公共阅读壳层与修复 `mobile-reader.css` 双份编译
- **涉及文件**：`ArticleReader.vue`（1050 行）、`NovelReader.vue`（951 行）、`ReadingLayout.vue`（18 Props）、`Renderer.vue`（1064 行）、`FormatSetting.vue`（764 行）、`PagedReader.vue`、`ScrollReader.vue`、`src/assets/mobile-reader.css`、`src/assets/theme.css`。
- **改造动作**：
  - 拆分 `PagedReader.vue` 与 `ScrollReader.vue` 的样式引入，分别只引入 `reader/mobile/pagination.css` 和 `reader/mobile/scroll.css`，消除 327 行分页 CSS 双份编译；合并 `src/assets/theme.css` 重复的暗/亮色高亮 Token。
  - 抽取 `src/utils/reader/reader-appearance.js` 统一 3 处阅读器主题色/背景图 CSS 变量计算，抽取 `src/composables/reader/useReaderShell.js` 收口博客与小说共用的 FAB 动作组、异步 `ContextMenu` + 划词跳转、分享卡片元数据组装与阅读/评论计数接入。
  - 抽取移动端引导遮罩组件 `MobileReaderHint.vue`（消除 `PagedReader` 与 `ScrollReader` 80+ 行重复）。
  - `ReadingLayout.vue` 改用 `provide/inject` 下发阅读布局状态以减少 `ContentGrid`/`Toc` 透传；从 `Renderer.vue` 拆出 `useMarkdownImagePreview.js` 与 `useParagraphCommentCounts.js`，规范化中段 `import` 位置。
  - 统一 `src/utils/reader/dom.js`（收拢 4 处 `range.intersectsNode`、3 处 `decodeAnchor` 与双 rAF `waitForReaderLayout`）及 `src/utils/canvas/backdrop.js`（收拢 4 处 Backdrop 调色板混合与光晕绘制）。
- **验证**：`pnpm check blog`、`pnpm check markdown`、`pnpm check site-perf`、`pnpm check i18n-quantities`；人工验证博客与小说桌面端/移动端翻页/滚动阅读、目录联动、划词菜单、分享卡片与样式面板。

### - [x] P2-4：收敛弹窗、浮层与 `useModal.js` 全局变量耦合
- **涉及文件**：`src/composables/useModal.js`、`src/router/index.js`、`src/composables/usePosTracker.js`、`src/components/interaction/overlay/Modal.vue`、`src/components/novel/mobile/controls/ReaderControls.vue`、`src/components/comments/{Thread.vue,interaction/CommentEditor.vue}`。
- **改造动作**：
  - 将 `useModal.js` 挂在 `globalThis.__moriModalFallback*` 上的 3 个全局标志抽为显式模块 `src/utils/layout/modal-history.js`，由 `router`、`useModal`、`usePosTracker` 显式导入，彻底消除 `globalThis` 隐式耦合。
  - 抽取底部抽屉弹窗原语或复用 `Modal.vue`，合并 `ReaderControls.vue` 中 5 个重复的 `<dialog class="modal modal-bottom">` 以及 `NovelReader.vue` 中的手写评论 `<dialog>`；复用 `Modal.vue` 与 `RolePreviewPopover.vue` 的抖动反馈动画。
  - 重构 `Thread.vue` 与 `CommentEditor.vue`：使用 `provide/inject` 共享评论线程上下文以削减 `CommentEntry (14 props)` 与 `CommentEditor (15 props)` 透传；将 `CommentEditor` 的紧凑触发条与弹窗全屏编辑器拆为两个清晰组件，消除自递归渲染。
- **验证**：`pnpm check dev`、`pnpm check github`；人工验证移动端返回键关闭弹窗、评论发表/回复/编辑/图片上传、移动端阅读器 5 个底部弹窗与分享卡片弹窗。

---

## Phase 3：拆解核心巨无霸组件与底层引擎

> **目标**：将全仓剩余 5 个超千行~三千行单文件按职责拆清，解决性能瓶颈与跨组件耦合。

### - [x] P3-1：拆解 `ImageConverter.vue`（3007 行 → 161 行）
- **目标结构**：
  - `src/composables/tools/image/{useImageWorker.js,useImageQueue.js,useImagePreviewPlayback.js,useWatermarkPreview.js}`（Worker RPC 与元数据读取、文件队列/转换/ZIP 导出、动图预览播放控制、水印预览渲染与载荷生成）
  - `src/components/tools/image/{ImagePreviewStage.vue,FileQueuePanel.vue,FileQueueItem.vue,ExportSettingsPanel.vue,WatermarkPanel.vue,RemixIconPicker.vue}`
  - `src/utils/dom/download.js`（通用 `downloadBlob` / `triggerFileDownload`）、`src/utils/image/watermark-assets.js`（SVG/图标/文字印章栅格化）、`src/assets/image-checker.css`（共享透明棋盘格底纹），`countWebPFrames` 下沉至 `src/utils/image/converter.js`
- **顺手治理**：拆散 28-getter 巨型 `watch`；替换 7 处硬编码中文为 i18n Key（并修复队列超限描述隐藏问题）；修复孤立 ARIA/label ID 与 `watermark.js` 的 `textHeight` 未定义缺陷；不再静默吞掉水印渲染/动画解码错误；修复动图暂停后续播重头播放问题并为 `ImagePreview` 补充同尺寸原地换图。
- **验证**：`pnpm check image-converter`、`pnpm check i18n-quantities`、`pnpm check i18n-loading`、`pnpm check i18n-runtime` 与人工全项验收通过。

### - [x] P3-2：拆解 `SinhalaFontConverter.vue`（2885 行 → 688 行）
- **目标结构**：
  - `src/composables/tools/sinhala/{useContentEditableHistory.js,useDocumentConversion.js,useSinhalaFonts.js,useTextPaneLayout.js,useClipboardActions.js}`（Legacy 200 步撤销/重做栈与 IME/选区同步、DOCX/PPTX/PDF 上传检测转换与导出、双栏字体联动与本地缩放测量、等高/滚动同步与控件视口锚定、剪贴板读写与瞬态反馈）
  - `src/components/tools/sinhala/{ConversionPane.vue,DocumentDropzone.vue,ConversionOptions.vue}`（用 `ConversionPane` 消除 Unicode 与 Legacy 两栏镜像模板复制）
  - `src/utils/sinhala/conversion-options.js`（默认选项工厂与转换参数构建），`isFmAbabldFont` 下沉至 `src/utils/sinhala/font-catalog.js`，文本导出复用 `src/utils/dom/download.js`
- **顺手治理**：清理 `src/utils/sinhala/converter.js` 内部流水线 18 处重复 `String(input ?? "")` 强转（收口至 7 个公开入口一次规范化）并简化 `containsSinhala`；合并重复的 `encodingSuggestion` 对象构造；修复 `refreshFmPreview` 潜在空解引用与只读态拦截 `Ctrl+Z/Y`。
- **验证**：`pnpm check sinhala`、`pnpm check sinhala-documents`、`pnpm check i18n-runtime`、`pnpm check i18n-quantities`、`pnpm check i18n-loading`、`pnpm check site-perf`、双模式四语言 SSR 验证与人工全项验收通过。

### - [x] P3-3：解耦通用游戏壳 `Room.vue`（1479 行 → 752 行）与拆解阿瓦隆 `RoundTable.vue`（2146 行 → 522 行）
- **目标结构**：
  - **通用游戏壳**：在 `src/games/catalog.js` 通过 `fullscreenPhases` 声明全屏阶段配置，彻底移除 `Room.vue` 对 Avalon `["opening", "night"]` 阶段的硬编码；`ContentPage.vue` 显式暴露 `mainElement` ref 消除 `querySelector("main")`；抽离 `src/components/games/{RoomEntryForm.vue,RoomLobby.vue}`、`src/composables/games/{useRoomProfile.js,useRoomViewport.js}`、`src/utils/games/validation.js`（统一 4 处昵称校验、2 处房间码校验与存储键常量）与 `src/assets/game-room.css`（替代未 scoped `<style>`）。
  - **阿瓦隆前端**：拆分 `src/components/games/avalon/layout/{OpeningPhase.vue,NightPhase.vue,ActionTable.vue,PlayerRoster.vue}`、`src/components/games/avalon/display/DiscussionTimerBar.vue`（合并 4 处倒计时条）与 `src/composables/games/avalon/{useAvalonRoom.js,useAvalonLayout.js,useAvalonModals.js}`；以 `provide/inject` 消除 `Avalon.vue` 跨兄弟透传 `playersTargetId` 及 `ref="roundTable"`；收拢 `RoundTable` 与 `Sidebar` 重复的 `gameRoom` 展平、未读监听与 `recordedQuests`；修复 `confirmGameAction` 任务卡合法性校验偏差（统一使用 `allowedQuestCards`）并清理死分支与 `i18n-runtime.mjs` 废弃测试 prop。
  - **阿瓦隆 Worker 规则**：将 `workers/avalon/rules.js`（830 行 → 26 行）拆分为 `workers/avalon/{config.js,engine.js,view.js}` 与适配入口 `rules.js`，收口 `create()` 重复 3 次的 `normalizeConfig`，清除 `view()` 对 `create()` 必有字段的 11 处冗余 `|| {}` / `?? {}` / `?.` 防御（保留被测试覆盖的历史/可空字段分支）；同步修正 `scripts/checks/avalon.mjs` 旧版单文件语言包路径与 `loyaltyCheck` 守卫漂移。
- **验证**：`pnpm check games`、`pnpm check game-room-client`、`pnpm check room-dissolution`、`pnpm check avalon`、`pnpm check i18n-runtime`、`pnpm check i18n-quantities`、`pnpm check i18n-loading`、`pnpm check site-perf`、SSR 零警告冒烟与人工全项验收通过。

### - [ ] P3-4：优化雾港 `Board.vue`（919 行）渲染性能与整理 `PlayTable.vue`（873 行）
- **改造动作**：
  - 在 `Board.vue` 中使用 `computed` 预建 `buildingsBySlot`、`builtLinksMap`、`liquidationOfferBySlot` 等 `Map` 索引，将模板中每格 12+ 次 O(N) `find()` 降为 O(1) 查表；抽出 `useBoardViewport.js` 独立管理缩放与平移手势。
  - 在 `PlayTable.vue` 中合并两处完全相同（各 13 个 Props）的 `<InventoryTray>` 挂载点，并用 `provide/inject` 替代 `Fogport.vue` 跨兄弟透传 `inventoryTargetId`。
- **验证**：`pnpm check fogport`、`pnpm check games`；本地双开浏览器验证运河/铁路时代建路、建筑、清算、拖拽出牌与移动端/桌面端切换。

### - [ ] P3-5：拆解 `PagedReader.vue`（1750 行）与 `create-reader-share-card.js`（2368 行）
- **改造动作**：
  - **`PagedReader.vue`**：将 ~800 行纯 DOM 测量与基线网格对齐函数（`alignPageFlowBlocksToGrid`、`alignPageStartBaselines` 等）下沉至 `src/utils/reader/align-mobile-baselines.js`；用单一 `paginationContext` 对象替代向 `usePagedFootnoteLayout` 传递 31 个参数及向 `usePagedChapterTransition` 传递 16 个参数的做法；重构 `let takeMutationRecords = () => {}` 循环桩；显式定义 `mobile-reader` 事件契约（替换 `NovelReader` 与 `ReaderControls` 中散落的字符串 `CustomEvent`）。
  - **`create-reader-share-card.js`**：拆分为 `share-text-layout.js`（中日韩禁则与断行）、`share-canvas-assets.js`（颜色/字体/图片/SVG 缓存，消除重复 1×1 Canvas 探针与重复 `--color-base-*` 解析）、`share-block-renderers.js`（13 种块级绘制）与主合成器；信任 `create-reader-share-content.js` 内部输出结构，大幅瘦身 `L358-511` 约 150 行 45 字段重洗代码。
- **验证**：人工打开本地 `/test/mobile-reader`、`/test/reader-share` 与小说移动端阅读页，核对分页基线、脚注避让、翻章动画与各类 Markdown 块分享图渲染完全一致。

---

## Phase 4：构建、发布与开发脚本整理

> **目标**：消除 `scripts/` 中的工具重复与脆弱解析，确保菜单、本地联调与 CI/CD 底层逻辑完全一致。

### - [ ] P4-1：整理发布脚本公共工具与修复 JSONC 解析脆弱点
- **改造动作**：
  - 新建 `scripts/lib/release-utils.mjs`：收拢 `scripts/release/{announcement,changelog,changelog-content}.mjs` 重复的 `parseEditorCommand`/`openEditor`、`formatLocalIso`、`printDiff`。
  - 将 `scripts/release/announcement.mjs:413-442` 自写的 `runWrangler` 切换为复用 `scripts/lib/commands.mjs:run()`。
  - 修复 `scripts/lib/worker-config.mjs:5`：支持正确剥离 `//` 与 `/* */` JSONC 注释（避免往 `wrangler*.jsonc` 加注释直接炸脚本）。
  - 统一 `sameOriginAssets` / 运行时环境变量白名单，消除 `scripts/preview/build.mjs` 与 `scripts/dev/start.mjs` 对 `scripts/lib/build-environment.mjs` 的重复声明。
- **验证**：`pnpm check release-deploy`、`pnpm check env`、`pnpm check dev`、`pnpm release changelog publish --dry-run`、`pnpm release announcement publish --dry-run`；通过 `pnpm menu` 核对对应菜单项正常。

### - [ ] P4-2：清理构建与本地联调脚本中的历史残留
- **改造动作**：
  - 清理 `scripts/build/prune-assets.mjs:17` 和 `scripts/build/smart.mjs:452-454` 中遗留的 `dist/pagefind-novel` 旧逻辑。
  - 审查 `scripts/dev/config.mjs:38-46`：改为从 `wrangler.api.jsonc` 读取限流、DO 与 KV 绑定元数据，避免生产与本地联调配置再次漂移。
  - 清理 `workers/dev/api.js` 中对 GraphQL 查询字符串子串的脆弱匹配（改为显式 operationName 分发）并补齐 dev 讨论计数的 CORS 头。
- **验证**：`pnpm build:smart --dry-run`、`pnpm check content-build`、`pnpm check build-assets`、`pnpm check dev`。
