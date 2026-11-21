import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createInterface, emitKeypressEvents } from "node:readline";
import { styleText, stripVTControlCharacters } from "node:util";
import { descriptions } from "./lib/task-descriptions.mjs";
import { PROJECT_ROOT, run } from "./lib/commands.mjs";

const { stdin, stdout } = process;
const command = (...args) => run(["node", "scripts/run.mjs", ...args]);
const action = (label, hint, ...args) => ({
  label,
  hint,
  run: () => command(...args),
});
const fileAction = (label, hint, prompt, ...args) => ({
  label,
  hint,
  async run() {
    const input = createInterface({ input: stdin, output: stdout });
    const answer = await new Promise((done) => {
      input.once("close", () => done(""));
      input.question(`${prompt}（留空返回）：`, done);
    });
    input.close();
    const file = answer.trim().replace(/^(['"])(.+)\1$/u, "$2");
    if (file) await command(...args, resolve(PROJECT_ROOT, file));
  },
});
const submenu = (label, hint, options) => ({ label, hint, options });
const back = { label: "返回" };
const color = (style, text) => styleText(style, text, { stream: stdout });
let cancelled = false;

function charWidth(char) {
  return /[\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}\p{Extended_Pictographic}\u3000-\u303f\uff00-\uff60]/u.test(
    char,
  )
    ? 2
    : 1;
}

function fitLabel(text, columns) {
  const clean = stripVTControlCharacters(text).replace(/[\x00-\x1f\x7f]/g, " ");
  let width = 0;
  let label = "";
  for (const char of clean) {
    width += charWidth(char);
    if (width >= columns) return label + "…";
    label += char;
  }
  return label;
}

function formatItem(label, hint, active, columns) {
  const cleanLabel = fitLabel(label, columns);
  if (!hint) return color(active ? "bold" : "dim", cleanLabel);

  let labelWidth = 0;
  for (const char of cleanLabel) labelWidth += charWidth(char);
  const remaining = columns - labelWidth - 3;
  if (remaining < 8) return color(active ? "bold" : "dim", cleanLabel);

  const cleanHint = fitLabel(hint, remaining);
  return `${color(active ? "bold" : "dim", cleanLabel)}  ${color("dim", `· ${cleanHint}`)}`;
}

function choose(title, options) {
  return new Promise((resolveChoice) => {
    emitKeypressEvents(stdin);
    const previousMode = stdin.isRaw;
    let selected = 0;
    let renderedLines = 0;
    const erase = () => stdout.write(`\x1b[${renderedLines}A\r\x1b[J`);

    function render() {
      const pageSize = Math.max(1, Math.min(12, (stdout.rows || 24) - 4));
      const columns = Math.max(1, (stdout.columns || 80) - 5);
      const start = Math.max(
        0,
        Math.min(
          selected - Math.floor(pageSize / 2),
          options.length - pageSize,
        ),
      );
      const items = options.slice(start, start + pageSize);
      const bar = color("cyan", "│");
      const position =
        options.length > pageSize ? `  ${selected + 1}/${options.length}` : "";
      const lines = [
        `${color("cyan", "◆")}  ${color("bold", fitLabel(title, columns))}`,
        ...items.map(({ label, hint }, index) => {
          const active = start + index === selected;
          const marker = color(active ? "green" : "dim", active ? "●" : "○");
          return `${bar}  ${marker} ${formatItem(label, hint, active, columns)}`;
        }),
        `${color("cyan", "└")}  ${color("dim", fitLabel(`↑ ↓ 选择 · Enter 确认 · Esc 返回${position}`, columns))}`,
      ];
      if (renderedLines) erase();
      stdout.write(lines.join("\n") + "\n");
      renderedLines = lines.length;
    }

    function finish(value) {
      stdin.removeListener("keypress", onKey);
      stdin.removeListener("end", onEnd);
      stdout.removeListener("resize", render);
      stdin.setRawMode(previousMode);
      stdin.pause();
      erase();
      stdout.write("\x1b[?25h");
      resolveChoice(value);
    }

    const onEnd = () => finish(null);
    function onKey(_, key) {
      if (!key) return;
      if (key.ctrl && key.name === "c") {
        cancelled = true;
        return finish(null);
      }
      if (key.name === "escape") return finish(null);
      if (key.name === "return" || key.name === "enter")
        return finish(options[selected]);
      if (key.name === "up")
        selected = (selected + options.length - 1) % options.length;
      else if (key.name === "down") selected = (selected + 1) % options.length;
      else if (key.name === "home") selected = 0;
      else if (key.name === "end") selected = options.length - 1;
      else return;
      render();
    }

    stdin.setRawMode(true);
    stdin.on("keypress", onKey);
    stdin.once("end", onEnd);
    stdout.on("resize", render);
    stdin.resume();
    stdout.write("\x1b[?25l");
    render();
  });
}

async function openReleasePage() {
  const url =
    "https://github.com/KoMoriSam/mori-website/actions/workflows/release.yml";
  console.log(
    "普通开发提交留在 main。将有效的更新日志草稿推送到 main 后，工作流会自动发版并更新 production。",
  );
  const [program, ...args] =
    process.platform === "win32"
      ? ["rundll32.exe", "url.dll,FileProtocolHandler", url]
      : process.platform === "darwin"
        ? ["open", url]
        : process.env.WSL_DISTRO_NAME
          ? ["explorer.exe", url]
          : ["xdg-open", url];
  try {
    await new Promise((resolveOpen, reject) => {
      const child = spawn(program, args, { stdio: "ignore" });
      child.once("error", reject);
      child.once("close", (code) =>
        code === 0 || (program === "explorer.exe" && code === 1)
          ? resolveOpen()
          : reject(new Error("无法打开浏览器")),
      );
    });
  } catch {
    console.log(url);
  }
}

async function chooseRelease(actionName) {
  const { nextVersion, readReleaseFiles } =
    await import("./release/changelog-content.mjs");
  const entries = await readReleaseFiles({ allowDraftPlaceholders: true });
  const draft = entries.find(({ release }) => release.status === "draft");
  if (actionName === "draft" && draft) {
    await command("release", "changelog", "edit", draft.release.version);
    return;
  }
  if (actionName === "draft") {
    const latest = entries.find(({ release }) => release.status === "released")
      .release.version;
    const options = [
      ["修复（patch）", "patch"],
      ["新功能（minor）", "minor"],
      ["破坏性变更（major）", "major"],
    ].map(([label, bump]) =>
      action(
        `${label} · ${nextVersion(latest, bump)}`,
        "创建并打开草稿",
        "release",
        "changelog",
        "new",
        bump,
      ),
    );
    const choice = await choose("选择版本类型", [...options, back]);
    await choice?.run?.();
    return;
  }
  const options = entries.map(({ release }) =>
    action(
      `${release.version}${release.status === "draft" ? "（草稿）" : ""}`,
      release.date || "",
      "release",
      "changelog",
      "edit",
      release.version,
    ),
  );
  const choice = await choose("选择要编辑的更新日志", [...options, back]);
  await choice?.run?.();
}

async function chooseAnnouncement(label, operation) {
  const { loadLocalAnnouncements } = await import("./release/announcement.mjs");
  const entries = await loadLocalAnnouncements();
  if (!entries.length) {
    console.log("本地还没有公告，可以先新建或下载线上公告。");
    return;
  }
  const options = entries.map(({ announcement }) =>
    action(
      announcement.title.replace(/\s+/g, " "),
      announcement.id,
      "release",
      "announcement",
      operation,
      announcement.id,
    ),
  );
  const choice = await choose(label, [...options, back]);
  await choice?.run?.();
}

async function singleCheckOptions() {
  const names = (await readdir(new URL("./checks/", import.meta.url)))
    .filter((name) => name.endsWith(".mjs"))
    .map((name) => name.slice(0, -4))
    .sort();
  const remaining = new Set([...names, "changelog"]);
  const categories = [
    ["认证与联调", ["dev", "github-access", "github-profile", "env"]],
    [
      "博客与正文",
      [
        "blog-build",
        "blog-translations",
        "blog-translations-runtime",
        "blog-translations-ssr",
        "markdown-xss",
        "markdown-styles",
        "markdown-avatars",
        "content-licenses",
        "rss",
      ],
    ],
    ["多语言与翻译", ["i18n", "i18n-loading", "i18n-quantities", "i18n-runtime"]],
    [
      "多人游戏",
      [
        "games",
        "game-room-client",
        "room-dissolution",
        "avalon",
        "avalon-extensions",
        "avalon-knowledge",
        "fogport",
      ],
    ],
    [
      "工具与图片",
      ["responsive-images", "image-converter", "sinhala", "sinhala-documents"],
    ],
    [
      "构建与发布",
      [
        "announcements",
        "changelog",
        "release-deploy",
        "build-assets",
        "content-build",
        "site-perf",
      ],
    ],
  ];
  const item = (name) =>
    action(descriptions.check[name] || name, `pnpm check ${name}`, "check", name);
  const options = categories.map(([label, list]) =>
    submenu(
      label,
      `${list.length} 项`,
      list.filter((name) => remaining.delete(name)).map(item),
    ),
  );
  if (remaining.size) {
    options.push(submenu("其他检查", `${remaining.size} 项`, [...remaining].map(item)));
  }
  return options;
}

const generateOptions = (...targets) =>
  targets.map((name) =>
    action(descriptions.generate[name], `pnpm generate ${name}`, "generate", name),
  );

const groups = [
  submenu("本地开发", "日常开发、刷新本地测试数据与游戏服务", [
    action("启动本地网站", "日常开发，自动启动前端 + 本地 API/认证/小说", "dev"),
    action("刷新本地测试数据", "改了 mock/公告/测试小说后手动刷新", "dev", "seed"),
    action("仅启动多人游戏服务", "只调试游戏房间 WebSocket 时用", "dev", "games"),
  ]),

  submenu("测试环境", "部署到 test.dev.komori.cc 及测试后端", [
    action(
      "一键更新全部测试环境",
      "推荐：认证 + API + D1/KV + 测试小说桶 + 预览站",
      "deploy",
      "test-all",
    ),
    action(
      "仅更新测试预览站",
      "只改前端或测试小说时点（自动同步 novel-vault-test）",
      "deploy",
      "test",
    ),
    action(
      "仅更新测试 API",
      "改了 workers/api、评论、游戏后端时点（含 D1 迁移与 KV）",
      "deploy",
      "test-api",
    ),
    action(
      "仅更新测试认证",
      "改了 workers/auth 登录鉴权时点（含 D1 迁移）",
      "deploy",
      "test-auth",
    ),
  ]),

  submenu("发版与公告", "写更新日志自动发正式版、管理站点公告", [
    {
      label: "写下一版更新日志草稿",
      hint: "推送 main 后 GitHub 自动发正式版",
      run: () => chooseRelease("draft"),
    },
    {
      label: "编辑已有更新日志",
      hint: "修改历史或草稿版本",
      run: () => chooseRelease("edit"),
    },
    action("查看所有版本", "列出本地更新日志版本", "release", "changelog", "list"),
    {
      label: "查看 GitHub 自动发版进度",
      hint: "在浏览器打开 release.yml 工作流",
      run: openReleasePage,
    },
    submenu("站点公告管理", "新建、编辑、发布或结束线上公告", [
      action("新建公告", "创建公告草稿并打开编辑器", "release", "announcement", "new"),
      {
        label: "编辑公告",
        hint: "修改本地公告内容",
        run: () => chooseAnnouncement("选择要编辑的公告", "edit"),
      },
      action("发布公告", "校验并同步到线上", "release", "announcement", "publish"),
      action(
        "预览公告发布差异",
        "只读对比本地与线上差异",
        "release",
        "announcement",
        "publish",
        "--dry-run",
      ),
      {
        label: "结束公告展示",
        hint: "立即标记某条公告过期",
        run: () => chooseAnnouncement("选择要结束的公告", "expire"),
      },
      {
        label: "提高公告修订号",
        hint: "重新向已读用户提示该公告",
        run: () => chooseAnnouncement("选择要更新修订号的公告", "bump"),
      },
      action("下载线上公告", "拉取线上公告到本地编辑", "release", "announcement", "pull"),
      action("查看本地公告", "列出当前本地公告", "release", "announcement", "list"),
      action("校验本地公告", "检查格式与时间范围", "release", "announcement", "check"),
      fileAction(
        "导入公告 JSON",
        "将已有 JSON 转为本地 Markdown",
        "输入公告 JSON 文件路径",
        "release",
        "announcement",
        "import",
      ),
    ]),
  ]),

  submenu("运行检查", "按模块一键回归，或展开排查单项", [
    action("检查：认证与联调", "env + dev + github", "check", "auth-dev"),
    action("检查：博客与正文", "博客翻译/构建 + Markdown + 许可 + RSS", "check", "content"),
    action("检查：多语言与翻译", "文案 + 加载 + 数量 + 运行时", "check", "i18n-all"),
    action("检查：多人游戏", "房间 + 阿瓦隆 + 雾港全部规则", "check", "games-all"),
    action("检查：工具与图片", "响应图 + 图片转换 + 僧伽罗转换", "check", "tools"),
    action("检查：构建与发布", "日志 + 公告 + 发版 + 产物 + 性能", "check", "release"),
    submenu("单项检查", "展开全部细项（精准排查时用）", singleCheckOptions),
  ]),

  submenu("发布正式后端", "正式网站由 GitHub 自动发版，这里仅手动发 Worker", [
    action("发布正式 API", "部署 mori-api（改了接口/评论/游戏后端时用）", "deploy", "api"),
    action("发布正式认证", "部署 mori-auth（改了登录认证时用）", "deploy", "auth"),
    action(
      "同步兼容外链内容",
      "上传 mori-content（仅 raw.komori.cc 需要更新时用）",
      "deploy",
      "content",
      "--upload",
    ),
  ]),

  submenu("高级与维护", "本地构建预览、发版诊断与离线词库字体生成（低频）", [
    submenu("本地构建与预览", "需访问内容源，平时线上会自动构建", [
      action("智能构建网站", "自动判断增量或全量构建", "build:smart"),
      action("全量构建网站与内容包", "重新生成 dist/ 与 .output/content/", "build"),
      action("预览本地构建", "本地启动预览服务器查看 dist/", "preview"),
      action("查看构建计划", "只读检查会触发哪些构建步骤", "build:smart", "--dry-run"),
      action("构建并记录性能报告", "分析各阶段耗时", "build:smart", "--profile"),
      action("检查网站部署包", "dry-run 核对网站产物完整性", "deploy", "website", "--dry-run"),
      action("检查内容部署包", "dry-run 核对内容包完整性", "deploy", "content", "--dry-run"),
    ]),
    submenu("发版与环境诊断", "排查线上绑定、凭证与发版状态", [
      action("检查本地 Worker 配置", "核对 wrangler 绑定", "check", "env"),
      action("核对线上 R2 与 Secret 名称", "核对 Cloudflare 线上配置", "check", "env", "--remote"),
      action("校验当前正式版发布资料", "核对线上版本与元数据", "release", "verify"),
      action(
        "查看更新日志同步差异",
        "只读对比本地与线上 CHANGELOG_KV",
        "release",
        "changelog",
        "publish",
        "--dry-run",
      ),
    ]),
    submenu("离线资源生成", "仅修改僧伽罗字体/词库或调试内部构建时用", [
      action("生成僧伽罗兼容字体", "scripts/sinhala/generate-fonts.py", "generate", "fonts"),
      fileAction(
        "生成英文与僧语词库",
        "从 TSV 重新生成词库",
        "输入词库 TSV 文件路径",
        "generate",
        "lexicon",
      ),
      submenu("生成 PDF 文字识别映射", "更新僧伽罗 PDF 字体字形表", [
        ...(process.platform === "win32"
          ? [action("使用 Windows 默认字体", "自动读取系统字体", "generate", "pdf-glyphs")]
          : []),
        fileAction(
          "使用指定字体文件",
          "手动提供字体路径",
          "输入字体文件路径",
          "generate",
          "pdf-glyphs",
        ),
      ]),
      submenu(
        "内部单步生成（平时由构建自动执行）",
        "仅调试单个生成步骤时使用",
        generateOptions(
          "mock",
          "assets",
          "images",
          "routes",
          "pagefind",
          "sitemap",
          "rss",
          "changelog",
          "licenses",
        ),
      ),
    ]),
  ]),
];

async function browse(title, items, exit) {
  const options = typeof items === "function" ? await items() : items;
  while (!cancelled) {
    const choice = await choose(title, [...options, exit]);
    if (!choice || choice === exit) return;
    try {
      if (choice.options) {
        await browse(choice.label, choice.options, back);
      } else {
        console.log(choice.label);
        await choice.run();
      }
    } catch (error) {
      console.error(error.message);
    }
  }
}

function padColumns(text, target) {
  let width = 0;
  for (const char of text) width += charWidth(char);
  return text + " ".repeat(Math.max(2, target - width));
}

async function main() {
  if (!stdin.isTTY || !stdout.isTTY || process.argv.includes("--help")) {
    console.log(
      "pnpm menu 在交互终端中打开项目菜单。\n" +
        groups
          .map(({ label, hint }) => `  ${padColumns(label, 14)}${hint}`)
          .join("\n"),
    );
    return;
  }

  await browse("mori-website · 选择操作", groups, { label: "退出" });
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
