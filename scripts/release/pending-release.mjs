import { run } from "../lib/commands.mjs";

const [production, before, mode] = process.argv.slice(2);
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
const changed = await run(["git", "diff", "--name-only", "-z", "--diff-filter=AMT", "--no-renames",
  since, "HEAD", "--", "changelog/releases"], { capture: true });
const changedVersions = changed.split("\0").flatMap((file) => {
  const match = /^changelog\/releases\/(\d+\.\d+\.\d+)\.md$/.exec(file);
  return match ? [match[1]] : [];
});
if (changedVersions.length) {
  // A valid draft is newer than the formal version already on production.
  // Historical corrections can stay on main without requiring CI dependencies on each push.
  const manifest = await run(["git", "show", `${production}:package.json`], { capture: true });
  const { version } = JSON.parse(manifest);
  const candidates = new Set(changedVersions.filter((candidate) =>
    !/^\d+\.\d+\.\d+$/.test(version) ||
    candidate.localeCompare(version, "en", { numeric: true }) > 0));
  if (candidates.size) {
    if (mode === "--check-paths") {
      console.log("true");
    } else {
      const { readReleaseFiles } = await import("./changelog-content.mjs");
      const entries = await readReleaseFiles({ allowDraftPlaceholders: true });
      const request = entries.find(({ release }) =>
        release.status === "draft" && candidates.has(release.version));
      if (request) console.log(request.release.version);
    }
  }
}
