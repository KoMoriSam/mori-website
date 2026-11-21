export function walkDocumentStyleRules(
  visitor,
  { rootDocument = document, filterSheet } = {},
) {
  const visitedSheets = new Set();

  function visitRules(rules) {
    for (const rule of rules) {
      if (visitor(rule) === false) return false;
      if (rule.styleSheet && visitSheet(rule.styleSheet) === false) {
        return false;
      }
      if ("cssRules" in rule) {
        try {
          if (visitRules(rule.cssRules) === false) return false;
        } catch {
          // Cross-origin nested rules cannot be inspected.
        }
      }
    }
    return true;
  }

  function visitSheet(sheet) {
    if (!sheet || visitedSheets.has(sheet)) return true;
    if (filterSheet && !filterSheet(sheet)) return true;
    visitedSheets.add(sheet);
    try {
      return visitRules(sheet.cssRules);
    } catch {
      // Cross-origin stylesheets cannot be inspected.
      return true;
    }
  }

  for (const sheet of rootDocument.styleSheets) {
    if (visitSheet(sheet) === false) break;
  }
}

export function stripCssFontQuotes(value) {
  return String(value || "")
    .trim()
    .replace(/^(?:"([^"]+)"|'([^']+)')$/u, "$1$2");
}

export function getRegisteredCssFontFamilies(
  normalizeKey,
  { excludePrefix = "Mori Device Font " } = {},
) {
  const families = new Map();
  walkDocumentStyleRules((rule) => {
    if (rule.type !== CSSRule.FONT_FACE_RULE) return;
    const family = stripCssFontQuotes(rule.style.getPropertyValue("font-family"));
    const key = normalizeKey(family);
    if (!key || (excludePrefix && family.startsWith(excludePrefix))) return;
    const sizeAdjust = rule.style.getPropertyValue("size-adjust").trim();
    if (!families.has(key) || (sizeAdjust && !families.get(key).sizeAdjust)) {
      families.set(key, { family, sizeAdjust });
    }
  });
  return families;
}
