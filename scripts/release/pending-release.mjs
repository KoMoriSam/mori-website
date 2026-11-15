import { run } from "../lib/commands.mjs";
import { readReleaseFiles } from "./changelog-content.mjs";

const [production, before] = process.argv.slice(2);
if (!production) throw new Error("需要 production 的 Git 引用。");

// Use the last main commit incorporated into production, not the current push's
// before SHA. An unsuccessful release leaves its draft pending on the next push.
const base = await run(["git", "merge-base", production, "HEAD"], { capture: true });
// Drafts already on main before automatic publishing was enabled are not requests.
let activationBase = await run(["git", "log", "--first-parent", "--diff-filter=A",
  "--format=%P", "-1", "--", "scripts/release/pending-release.mjs"], { capture: true }).then((parents) => parents.split(/\s+/)[0]);
if (/^[a-f0-9]{40}$/.test(before) && !/^0+$/.test(before)) {
  const common = await run(["git", "merge-base", before, activationBase], { capture: true }).catch(() => null);
  if (common === before) activationBase = before;
}
const floor = await run(["git", "merge-base", base, activationBase], { capture: true });
const since = floor === base ? activationBase : base;
const changed = await run(["git", "diff", "--name-only", "-z", "--diff-filter=AM", "--no-renames",
  since, "HEAD", "--", "changelog/releases"], { capture: true });
const candidates = new Set(changed.split("\0").filter((file) =>
  /^changelog\/releases\/\d+\.\d+\.\d+\.md$/.test(file)));
if (candidates.size) {
  const entries = await readReleaseFiles({ allowDraftPlaceholders: true });
  const request = entries.find(({ name, release }) =>
    release.status === "draft" && candidates.has("changelog/releases/" + name));
  if (request) console.log(request.release.version);
}
