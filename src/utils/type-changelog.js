import { CHANGELOG_TYPES } from "../../shared/changelog.js";

export function typeColor(type) {
  switch (type) {
    case "feature":
      return "primary";
    case "fix":
      return "error";
    case "improve":
      return "secondary";
    case "performance":
      return "success";
    case "refactor":
      return "warning";
    case "chore":
      return "neutral";
    default:
      return "info";
  }
}

export function typeText(type) {
  return CHANGELOG_TYPES[type] || "其他";
}
