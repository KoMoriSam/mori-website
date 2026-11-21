import { useHydratedStorage } from "./useHydratedStorage";

export function useReadingStateStorage() {
  const { storage: READING_STATE, ready } = useHydratedStorage("READING_STATE", {});

  const getState = (key, defaultValue) => {
    const saved = READING_STATE.value[key];
    return saved !== undefined ? saved : defaultValue;
  };

  const setState = (key, value) => {
    READING_STATE.value[key] = value;
  };

  return {
    READING_STATE,
    ready,
    getState,
    setState,
  };
}
