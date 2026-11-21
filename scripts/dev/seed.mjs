import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createIndex } from "pagefind";
import { getArticlePath } from "../../src/utils/blog/article-versions.js";
import { getChapterContextTitle } from "../../src/utils/novel/format-label.js";
import { discussionRegistry } from "../../shared/discussions.js";
import { releaseFile } from "../../shared/novel-release.js";
import { run } from "../lib/commands.mjs";
import { authConfig, apiConfig, directory, persist } from "./config.mjs";
import {
  LOCAL_NOVEL_CATALOG,
  LOCAL_NOVEL_CHAPTERS,
  LOCAL_NOVEL_IMAGES,
} from "./novel-fixtures.mjs";
import { loadLocalAnnouncements } from "../release/announcement.mjs";
import { writeStaticChangelog } from "../release/changelog-content.mjs";

const digest = (body) => createHash("sha256").update(body).digest("hex");
const json = async (path, value) => {
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, JSON.stringify(value));
};

async function seedPublicData(env) {
  const entries = await loadLocalAnnouncements();
  const items = entries.map(({ announcement }) => announcement);
  const sampleDate = "2026-01-01T00:00:00.000Z";
  if (!items.length) items.push({
    id: "local-announcement", revision: 1, title: "本地测试公告",
    summary: "用于测试公告中心和已读状态。", body: "这条公告只在本地开发环境中显示。",
    tone: "info", priority: "important", pinned: true, startsAt: sampleDate,
  });
  const file = resolve(directory, "announcements.json");
  await json(file, { schemaVersion: 1, updatedAt: new Date().toISOString(), items });
  const changelog = resolve(directory, "assets/changelog.json");
  await writeStaticChangelog(null, changelog);
  for (const [binding, key, path] of [
    ["ANNOUNCEMENTS_KV", "announcements:v1", file],
    ["CHANGELOG_KV", "changelog:v1", changelog],
  ]) await run(["wrangler", "kv", "key", "put", key, "--path", path, "--binding", binding,
    "--local", "--persist-to", persist, "--config", apiConfig], { env });
}

export async function seed(env, { force = false } = {}) {
  await run(["node", "scripts/build/mock-articles.mjs"], { env });
  for (const [config, name] of [[authConfig, "mori-auth-local"], [apiConfig, "mori-analytics-local"]])
    await run(["wrangler", "d1", "migrations", "apply", name, "--local", "--persist-to", persist, "--config", config], { env });
  await seedPublicData(env);
  const articles = JSON.parse(await readFile("mock/article/index.json", "utf8"));
  const assets = resolve(directory, "assets");
  const fonts = resolve(assets, "content/kaiming");
  await mkdir(fonts, { recursive: true });
  await writeFile(resolve(fonts, "index.css"), "/* Local preview uses installed fallback fonts. */\n");
  await json(resolve(assets, discussionRegistry), {
    articles: Object.fromEntries(articles.map((article) => [article.id, { path: getArticlePath(article, article.sourceLocale) }])),
    chapters: Object.fromEntries(LOCAL_NOVEL_CHAPTERS.map((chapter) => [
      chapter.uuid,
      {
        path: `/novel/${encodeURIComponent(chapter.uuid)}`,
        term: getChapterContextTitle(chapter),
      },
    ])),
  });
  const fixtureFile = resolve(directory, "novel.json");
  const stamp = digest(
    (await readFile(new URL(import.meta.url), "utf8")) +
      (await readFile(new URL("./novel-fixtures.mjs", import.meta.url), "utf8")),
  );
  const cached = await readFile(fixtureFile, "utf8").then(JSON.parse).catch(() => null);
  if (!force && cached?.stamp === stamp && await stat(resolve(assets, releaseFile)).catch(() => null)) return;

  const search = resolve(directory, "search");
  await rm(search, { recursive: true, force: true });
  const { index, errors } = await createIndex();
  if (!index || errors.length) throw new Error("Cannot initialize local Pagefind");
  try {
    for (const chapter of LOCAL_NOVEL_CHAPTERS) {
      const added = await index.addCustomRecord({
        url: `/novel/${chapter.uuid}`,
        content: chapter.markdown,
        language: "zh",
        meta: { title: chapter.title },
      });
      if (added.errors.length) throw new Error(`Cannot index local chapter: ${chapter.path}`);
    }
    const output = await index.writeFiles({ outputPath: search });
    if (output.errors.length) throw new Error("Cannot write local Pagefind");
  } finally {
    await index.deleteIndex();
  }
  const objects = {};
  const manifest = {};
  function add(path, bytes) {
    const hash = digest(bytes);
    manifest[path] = hash;
    objects[hash] = Buffer.from(bytes).toString("base64");
  }
  for (const chapter of LOCAL_NOVEL_CHAPTERS) {
    add(`chapters/${chapter.path}`, chapter.markdown);
  }
  for (const [imagePath, svg] of Object.entries(LOCAL_NOVEL_IMAGES)) {
    add(`assets/${imagePath}`, svg);
  }
  add("assets/images/_optimized/manifest.json", '{"version":1,"images":{}}');
  for (const entry of await readdir(search, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const file = resolve(entry.parentPath, entry.name);
    add("search/" + file.slice(search.length + 1).replaceAll("\\", "/"), await readFile(file));
  }
  const version = digest(JSON.stringify(manifest));
  await json(resolve(assets, releaseFile), { version, catalog: LOCAL_NOVEL_CATALOG });
  await json(resolve(assets, "mock/novel/index.json"), LOCAL_NOVEL_CATALOG);
  await json(fixtureFile, { stamp, version, manifest, objects });
}
