import { useHydratedStorage } from "./useHydratedStorage";

export function useReaderSettingsStorage() {
  const { storage: READER_SETTINGS, ready } = useHydratedStorage("READER_SETTINGS", {});

  const getSetting = (key, defaultValue) => {
    const saved = READER_SETTINGS.value[key];
    return saved !== undefined ? saved : defaultValue;
  };

  const setSetting = (key, value) => {
    READER_SETTINGS.value[key] = value;
  };

  return {
    READER_SETTINGS,
    ready,
    getSetting,
    setSetting,
  };
}
