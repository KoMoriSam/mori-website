import { useHydratedStorage } from "./useHydratedStorage";

export function useGlobalStorage() {
  const { storage: GLOBAL_INFO, ready } = useHydratedStorage("GLOBAL_INFO", {});

  const getInfo = (key, defaultValue) => {
    const saved = GLOBAL_INFO.value[key];
    return saved !== undefined ? saved : defaultValue;
  };

  const setInfo = (key, value) => {
    GLOBAL_INFO.value[key] = value;
  };

  return {
    GLOBAL_INFO,
    ready,
    getInfo,
    setInfo,
  };
}
