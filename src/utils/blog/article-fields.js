export const normalizeArticleTag = (tag) => {
  return String(tag || "")
    .split("/")
    .map((item) => item.trim())
    .filter(Boolean)
    .join("/");
};

export const formatArticleTag = (tag) => {
  return normalizeArticleTag(tag).replaceAll("/", " / ");
};

export const normalizeArticleTags = (tags) => {
  const values = Array.isArray(tags) ? tags : tags ? [tags] : [];

  return [...new Set(values.map(normalizeArticleTag).filter(Boolean))];
};

export const normalizeArticleDate = (value) => {
  const text = String(value || "").trim();

  if (!text) return "";

  const dateMatch = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);

  if (dateMatch) {
    const [, yearText, monthText, dayText] = dateMatch;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const normalizedDate = new Date(Date.UTC(year, month - 1, day));

    if (
      normalizedDate.getUTCFullYear() === year &&
      normalizedDate.getUTCMonth() === month - 1 &&
      normalizedDate.getUTCDate() === day
    ) {
      return [
        String(year).padStart(4, "0"),
        String(month).padStart(2, "0"),
        String(day).padStart(2, "0"),
      ].join("-");
    }

    return "";
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) return "";

  return [
    String(parsedDate.getUTCFullYear()).padStart(4, "0"),
    String(parsedDate.getUTCMonth() + 1).padStart(2, "0"),
    String(parsedDate.getUTCDate()).padStart(2, "0"),
  ].join("-");
};

export const normalizeArticleText = (value) => {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();
};

export const getNormalizedTagSegments = (tag) => {
  return normalizeArticleTag(tag)
    .split("/")
    .map(normalizeArticleText)
    .filter(Boolean);
};

const getSearchTerms = (keyword) => {
  return normalizeArticleText(keyword).split(" ").filter(Boolean);
};

const getArticleSearchFields = (article) => {
  const tags = normalizeArticleTags(article?.tags);

  return {
    title: normalizeArticleText(article?.title),
    tags,
    normalizedTags: tags.map(normalizeArticleText),
    summary: normalizeArticleText(article?.summary),
    content: normalizeArticleText(article?.content),
    metadata: normalizeArticleText(
      [
        article?.metadataText,
        ...(Array.isArray(article?.aliases)
          ? article.aliases
          : [article?.aliases]),
      ]
        .filter(Boolean)
        .join(" "),
    ),
  };
};

export const getArticleSearchScore = (article, keyword) => {
  const query = normalizeArticleText(keyword);
  const terms = getSearchTerms(query);

  if (!terms.length) return 0;

  const fields = getArticleSearchFields(article);
  const searchableText = [
    fields.title,
    ...fields.normalizedTags,
    fields.summary,
    fields.content,
    fields.metadata,
  ].join(" ");

  if (!terms.every((term) => searchableText.includes(term))) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = 0;

  if (fields.title === query) {
    score += 1200;
  } else if (fields.title.startsWith(query)) {
    score += 500;
  } else if (fields.title.includes(query)) {
    score += 300;
  }

  for (const term of terms) {
    if (fields.title.includes(term)) score += 160;

    for (const tag of fields.normalizedTags) {
      if (tag === term) score += 70;
      else if (tag.includes(term)) score += 35;
    }

    if (fields.summary.includes(term)) score += 12;
    if (fields.metadata.includes(term)) score += 8;
    if (fields.content.includes(term)) score += 3;
  }

  return score;
};

const escapeRegExp = (value) => {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

export const splitArticleHighlight = (value, keyword) => {
  const text = String(value || "");
  const terms = [
    ...new Set(
      String(keyword || "")
        .normalize("NFKC")
        .trim()
        .split(/\s+/)
        .filter(Boolean),
    ),
  ].sort((a, b) => b.length - a.length);

  if (!text || !terms.length) {
    return [{ text, match: false }];
  }

  const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "giu");

  return text
    .split(pattern)
    .filter(Boolean)
    .map((part) => ({
      text: part,
      match: terms.some(
        (term) => normalizeArticleText(term) === normalizeArticleText(part),
      ),
    }));
};
