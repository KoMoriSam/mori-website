import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { writeStaticChangelog } from "../release/changelog-content.mjs";
import { run } from "../lib/commands.mjs";
import { copyTree } from "../lib/content-files.mjs";
import { preparePreviewData } from "./data.mjs";
import { buildEnvironment, sameOriginAssets } from "../lib/build-environment.mjs";

const env = {
  ...buildEnvironment(),
  ...sameOriginAssets(),
};
for (const command of [
  ["node", "scripts/build/static-assets.mjs"],
  ["node", "scripts/build/mock-articles.mjs"],
  ["vite", "build", "--config", "vite.dev.config.js", "--outDir", ".output/preview"],
]) await run(command, { env });
await writeStaticChangelog(null, resolve(".output/preview/changelog.json"));
await copyTree(resolve("mock/article"), resolve(".output/preview/mock/article"));
await preparePreviewData(resolve(".output/preview"));
const fonts = resolve(".output/preview/content/kaiming");
await mkdir(fonts, { recursive: true });
await writeFile(resolve(fonts, "index.css"), "/* Branch preview uses installed fallback fonts. */\n");
