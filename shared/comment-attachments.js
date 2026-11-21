// GitHub's token-authenticated user-attachments endpoint supports these media types.
// https://docs.github.com/en/github-cli/github-cli/attaching-files-with-github-cli
const mib = 1024 * 1024;
export const attachmentLimits = Object.freeze({ image: 10 * mib, video: 10 * mib, paidVideo: 100 * mib });
export const mediaAttachmentTypes = Object.freeze({
  png: { kind: "image", mime: "image/png" },
  jpg: { kind: "image", mime: "image/jpeg" },
  jpeg: { kind: "image", mime: "image/jpeg" },
  gif: { kind: "image", mime: "image/gif" },
  webp: { kind: "image", mime: "image/webp" },
  svg: { kind: "image", mime: "image/svg+xml" },
  mp4: { kind: "video", mime: "video/mp4" },
  mov: { kind: "video", mime: "video/quicktime" },
  webm: { kind: "video", mime: "video/webm" },
});
export const mediaAttachmentAccept = Object.keys(mediaAttachmentTypes).map((extension) => "." + extension).join(",");

export function mediaAttachmentType(name) {
  const extension = String(name).split(".").at(-1).toLowerCase();
  return Object.hasOwn(mediaAttachmentTypes, extension) ? mediaAttachmentTypes[extension] : null;
}

export function attachmentVideoLimit(env, target) {
  const paidRepositories = String(env.MORI_ATTACHMENT_PAID_VIDEO_REPOS || "").toLowerCase().split(/[\s,]+/u);
  return paidRepositories.includes(target.repo.name.toLowerCase()) ? attachmentLimits.paidVideo : attachmentLimits.video;
}

export function isGithubAttachmentAsset(value) {
  return /^https:\/\/github\.com\/user-attachments\/assets\/[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/iu.test(value);
}

export function githubAttachmentPreview(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "private-user-images.githubusercontent.com" ||
        url.username || url.password || !url.searchParams.has("jwt")) return null;
    const match = /^\/\d+\/(?:\d+-)?([\da-f-]{36})\.([a-z0-9]+)$/iu.exec(url.pathname);
    const assetUrl = match && "https://github.com/user-attachments/assets/" + match[1];
    return isGithubAttachmentAsset(assetUrl) && mediaAttachmentType("file." + match[2]) ? { assetUrl, url: url.href } : null;
  } catch { return null; }
}

export function isLocalCommentAttachment(value) {
  const match = /^http:\/\/localhost:\d+\/api\/comments\/attachments\/local\/[\da-f-]{36}\/file\.([a-z0-9]+)$/u.exec(value);
  return Boolean(match && mediaAttachmentType("file." + match[1]));
}

export function attachmentMarkdown({ name, kind, url }) {
  if (kind === "video") return url;
  const label = String(name).replace(/[\\[\]!*_`<>]/gu, "\\$&").replace(/[\r\n]/gu, " ");
  return `![${label}](<${url}>)`;
}

export function matchesMediaSignature(name, bytes) {
  const extension = name.split(".").at(-1).toLowerCase();
  const ascii = (start, end) => String.fromCharCode(...bytes.subarray(start, end));
  switch (extension) {
    case "png": return bytes.length >= 8 && ascii(0, 8) === "\x89PNG\r\n\x1a\n";
    case "jpg":
    case "jpeg": return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case "gif": return ["GIF87a", "GIF89a"].includes(ascii(0, 6));
    case "webp": return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
    case "mp4": return ascii(4, 8) === "ftyp";
    case "mov": return ["ftyp", "moov", "mdat", "wide", "free", "skip", "pnot"].includes(ascii(4, 8));
    case "webm": return ascii(0, 4) === "\x1aE\xdf\xa3";
    case "svg": {
      const text = new TextDecoder().decode(bytes).replace(/^\uFEFF/u, "").trimStart();
      // SVG may start with a long XML declaration, comment or whitespace.
      // GitHub validates the complete document after this prefix check.
      return !text || /^(?:<svg[\s>]|<\?xml(?:\s|\?)|<!--|<!DOCTYPE\s+svg[\s>])/iu.test(text);
    }
    default: return false;
  }
}
