import { READER_LAYOUT_STYLE_KEYS, STYLE_CONFIG_KEYS } from "../../constants/reader.js";

const LEGACY_READER_KEY_ALIASES = {
  CONTENT_LINE_HEIGHT: "STYLE_LINE_HEIGHT",
  CONTENT_PARA_HEIGHT: "STYLE_PARA_HEIGHT",
};

const NUMERIC_READER_KEYS = new Set(
  STYLE_CONFIG_KEYS
    .filter(({ default: value }) => typeof value === "number")
    .map(({ storageKey }) => storageKey),
);

export const LEGACY_READER_SETTING_KEYS = [
  ...STYLE_CONFIG_KEYS
    .filter(({ key }) => READER_LAYOUT_STYLE_KEYS.includes(key))
    .map(({ storageKey }) => storageKey),
  ...Object.keys(LEGACY_READER_KEY_ALIASES),
  "NOVEL_CURRENT_COMPONENT",
  "NOVEL_SIDE_CURRENT_COMPONENT",
];

const LEGACY_READING_STATE_KEYS = [
  "CHAPTER_LIST",
  "CHAPTER_LIST_UPDATED_AT",
  "CHAPTERS_CONTENT",
  "READ_CHS",
  "READ_CH_ID",
  "READ_PAGE",
  "READ_POS",
];

const DISCARD_V1_KEYS = [
  "READ_CHAPTER",
  "READ_CH",
  "IS_NOT_UPDATED",
  "READ_HEADING",
  "nowChapter",
  "auto",
  "mode",
  "sidebarState",
];

const isPlainObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export function parseLegacyStorageValue(raw) {
  if (typeof raw !== "string") return raw;
  const trimmed = raw.trim();
  if (!trimmed) return raw;
  try {
    if (/^[\[{]/.test(trimmed)) {
      return JSON.parse(trimmed);
    }
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return trimmed.includes(".") ? Number.parseFloat(trimmed) : Number(trimmed);
    }
  } catch {
    return raw;
  }
  return raw;
}

function getBrowserLocalStorage() {
  if (import.meta.env.SSR || typeof window === "undefined") return null;
  try {
    const storage = window.localStorage;
    if (
      !storage ||
      typeof storage.getItem !== "function" ||
      typeof storage.setItem !== "function" ||
      typeof storage.removeItem !== "function"
    ) {
      return null;
    }
    return storage;
  } catch {
    return null;
  }
}

function readObjectBucket(storage, key) {
  const raw = storage.getItem(key);
  if (!raw) return { bucket: {}, exists: false };
  try {
    const parsed = JSON.parse(raw);
    return isPlainObject(parsed)
      ? { bucket: { ...parsed }, exists: true }
      : { bucket: {}, exists: false };
  } catch {
    return { bucket: {}, exists: false };
  }
}

function removeChapterPrefixedKeys(storage) {
  for (const key of Object.keys(storage)) {
    if (key.startsWith("chapter_")) {
      storage.removeItem(key);
    }
  }
}

export function migrateStorage() {
  const storage = getBrowserLocalStorage();
  if (!storage) return;

  if (storage.getItem("STORAGE_MIGRATION_V2") !== "true") {
    const { bucket: globalInfo } = readObjectBucket(storage, "GLOBAL_INFO");
    let globalChanged = false;
    const rawTheme = storage.getItem("SET_THEME");
    if (rawTheme !== null && globalInfo.SET_THEME === undefined) {
      globalInfo.SET_THEME = parseLegacyStorageValue(rawTheme);
      globalChanged = true;
    }
    if ("APP_VERSION" in globalInfo) {
      delete globalInfo.APP_VERSION;
      globalChanged = true;
    }
    if (globalChanged) {
      storage.setItem("GLOBAL_INFO", JSON.stringify(globalInfo));
    }

    const { bucket: readerSettings } = readObjectBucket(storage, "READER_SETTINGS");
    let readerChanged = false;
    for (const [legacyKey, targetKey] of Object.entries(LEGACY_READER_KEY_ALIASES)) {
      if (readerSettings[legacyKey] !== undefined) {
        const parsed = parseLegacyStorageValue(String(readerSettings[legacyKey]));
        if (
          readerSettings[targetKey] === undefined &&
          typeof parsed === "number" &&
          Number.isFinite(parsed)
        ) {
          readerSettings[targetKey] = parsed;
        }
        delete readerSettings[legacyKey];
        readerChanged = true;
      }
    }
    for (const oldKey of LEGACY_READER_SETTING_KEYS) {
      const raw = storage.getItem(oldKey);
      if (raw === null) continue;
      const targetKey = LEGACY_READER_KEY_ALIASES[oldKey] || oldKey;
      if (readerSettings[targetKey] !== undefined) continue;
      const value = parseLegacyStorageValue(raw);
      if (
        NUMERIC_READER_KEYS.has(targetKey) &&
        (typeof value !== "number" || !Number.isFinite(value))
      ) {
        continue;
      }
      readerSettings[targetKey] = value;
      readerChanged = true;
    }
    if (readerChanged) {
      storage.setItem("READER_SETTINGS", JSON.stringify(readerSettings));
    }

    const { bucket: readingState } = readObjectBucket(storage, "READING_STATE");
    let readingChanged = false;
    for (const key of LEGACY_READING_STATE_KEYS) {
      const raw = storage.getItem(key);
      if (raw === null || readingState[key] !== undefined) continue;
      readingState[key] = parseLegacyStorageValue(raw);
      readingChanged = true;
    }
    if (readingChanged) {
      storage.setItem("READING_STATE", JSON.stringify(readingState));
    }

    for (const key of [
      "APP_VERSION",
      "SET_THEME",
      ...LEGACY_READER_SETTING_KEYS,
      ...LEGACY_READING_STATE_KEYS,
    ]) {
      storage.removeItem(key);
    }
    removeChapterPrefixedKeys(storage);
    storage.setItem("STORAGE_MIGRATION_V2", "true");
  }

  if (storage.getItem("DISCARD_STORAGE_V1") !== "true") {
    for (const key of DISCARD_V1_KEYS) {
      storage.removeItem(key);
    }
    removeChapterPrefixedKeys(storage);
    storage.setItem("DISCARD_STORAGE_V1", "true");
  }

  if (storage.getItem("ANNOUNCEMENT_STORAGE_MIGRATION_V1") !== "true") {
    const { bucket: globalInfo, exists } = readObjectBucket(storage, "GLOBAL_INFO");
    if (exists && "APP_VERSION" in globalInfo) {
      delete globalInfo.APP_VERSION;
      storage.setItem("GLOBAL_INFO", JSON.stringify(globalInfo));
    }
    storage.removeItem("APP_VERSION");
    storage.setItem("ANNOUNCEMENT_STORAGE_MIGRATION_V1", "true");
  }
}

export function useStorageMigration() {
  return {
    migrateStorage,
  };
}
