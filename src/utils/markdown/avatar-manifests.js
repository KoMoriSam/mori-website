import { shallowRef } from "vue";
import { DEFAULT_AVATAR } from "../../constants/markdown.js";
import {
  createManifestRegistry,
  resolveImageBase,
} from "../images/create-manifest-registry.js";

const manifests = shallowRef(new Map());

const registry = createManifestRegistry({
  manifestPath: "avatars.json",
  field: "avatars",
  applyManifest({ base, records, resolveAsset }) {
    const avatars = new Map();
    for (const [name, target] of Object.entries(records)) {
      const resolved = resolveAsset(target);
      if (resolved) avatars.set(name.trim(), resolved);
    }
    manifests.value = new Map(manifests.value).set(base, avatars);
  },
});

export function registerAvatarManifest(contentBase, manifest) {
  registry.register(contentBase, manifest);
}

export function getMarkdownAvatar(contentBase, username) {
  return (
    manifests.value
      .get(resolveImageBase(contentBase))
      ?.get(String(username || "").trim()) || DEFAULT_AVATAR
  );
}

export const loadAvatarManifest = registry.load;
