import { fetchJson } from "../../services/http.js";

export const SITE_ORIGIN = "https://local.invalid";

export function canonicalAssetUrl(src) {
  try {
    const url = new URL(src, SITE_ORIGIN);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.origin === SITE_ORIGIN
      ? `${url.pathname}${url.search}`
      : `${url.origin}${url.pathname}${url.search}`;
  } catch {
    return "";
  }
}

export function resolveImageBase(contentBase) {
  if (!contentBase) return "";
  try {
    const root = new URL(
      `${String(contentBase)
        .replace(/\/+$/u, "")
        .replace(/\/images$/iu, "")}/images/`,
      SITE_ORIGIN,
    );
    if (
      !["http:", "https:"].includes(root.protocol) ||
      root.search ||
      root.hash
    )
      return "";
    return root.origin === SITE_ORIGIN ? root.pathname : root.href;
  } catch {
    return "";
  }
}

export function createManifestRegistry({
  manifestPath,
  field,
  applyManifest,
  timeout = 5000,
}) {
  const requests = new Map();

  const isValidManifest = (manifest) =>
    manifest?.version === 1 &&
    Boolean(manifest[field]) &&
    typeof manifest[field] === "object" &&
    !Array.isArray(manifest[field]);

  const registerResolved = (base, manifest) => {
    if (!base || !isValidManifest(manifest)) return false;
    const root = new URL(base, SITE_ORIGIN);
    const resolveAsset = (target) => {
      if (
        typeof target !== "string" ||
        !target ||
        /[\s,\\\u0000-\u001f]/u.test(target)
      )
        return "";
      try {
        const url = new URL(target, root);
        if (
          url.origin !== root.origin ||
          !url.pathname.startsWith(root.pathname) ||
          url.search ||
          url.hash
        )
          return "";
        return url.origin === SITE_ORIGIN ? url.pathname : url.href;
      } catch {
        return "";
      }
    };
    applyManifest({ base, records: manifest[field], resolveAsset });
    return true;
  };

  const register = (contentBase, manifest) =>
    registerResolved(resolveImageBase(contentBase), manifest);

  const load = (contentBase) => {
    const base = resolveImageBase(contentBase);
    if (!base) return Promise.resolve();
    if (requests.has(base)) return requests.get(base);
    const request = Promise.resolve()
      .then(() => fetchJson(`${base}${manifestPath}`, { timeout }))
      .then((manifest) => {
        if (!registerResolved(base, manifest)) {
          throw new Error(`Invalid ${field} manifest`);
        }
      })
      .catch(() => {
        requests.delete(base);
      });
    requests.set(base, request);
    return request;
  };

  return {
    register,
    load,
  };
}
