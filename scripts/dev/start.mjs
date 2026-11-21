import { configure, apiConfig, authConfig, siteConfig, persist, workerPort } from "./config.mjs";
import { seed } from "./seed.mjs";
import { run } from "../lib/commands.mjs";
import { runtimeEnvironment, sameOriginAssets } from "../lib/build-environment.mjs";

const [mode, ...args] = process.argv.slice(2);
let port = Number(process.env.MORI_DEV_PORT || 5173);
const viteArgs = [];
for (let index = 0; index < args.length; index++) {
  const arg = args[index];
  if (arg === "--port") port = Number(args[++index]);
  else if (arg.startsWith("--port=")) port = Number(arg.slice(7));
  else if (["--open", "--force"].includes(arg)) viteArgs.push(arg);
  else throw new Error("Supported development options: --port, --open, --force");
}
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535 || port === workerPort)
  throw new Error("Set MORI_DEV_PORT or --port to an unused local port");
const env = {
  ...runtimeEnvironment(),
  MORI_DEV_PORT: String(port),
  CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
  WRANGLER_SEND_METRICS: "false",
  ...sameOriginAssets(),
};
await configure(port);
await seed(env, { force: mode === "seed" });
if (mode === "seed") process.exit(0);
await run(["node", "scripts/build/static-assets.mjs"], { env });

const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());
const options = { env, signal: controller.signal };
try {
  await Promise.race([
    run(["wrangler", "dev", "--local", "--ip", "127.0.0.1", "--port", String(workerPort),
      "--persist-to", persist, "--config", siteConfig, "--config", authConfig, "--config", apiConfig], options),
    run(["vite", "--config", "vite.dev.config.js", "--port", String(port), "--strictPort", ...viteArgs], options),
  ]);
} catch (error) {
  if (!controller.signal.aborted) throw error;
} finally {
  controller.abort();
}
