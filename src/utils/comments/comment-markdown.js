// Published comments and previews both use the shared HTML sanitizer.
export const COMMENT_MARKDOWN = Object.freeze({
  parserOptions: Object.freeze({ html: true, linkify: true, breaks: true }),
  allowedAttributes: Object.freeze(["data-tip"]),
  extensions: Object.freeze([
    "abbreviations", "attributes", "code", "headingAnchors", "alerts",
    "social", "emoji", "footnotes", "ruby", "subscript", "superscript",
    "tasks", "math", "mark", "mermaid", "figures", "tables", "linkIcons",
    "wikiLinks", "linkCards",
  ]),
});
