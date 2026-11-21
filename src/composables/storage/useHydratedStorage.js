import { getCurrentInstance, onMounted, ref } from "vue";
import { useStorage } from "@vueuse/core";
import { migrateStorage } from "./useStorageMigration";

const isPlainObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export function useHydratedStorage(key, defaults) {
  const instance = getCurrentInstance();
  const ready = ref(
    !import.meta.env.SSR && (!instance || instance.isMounted),
  );
  if (ready.value) {
    migrateStorage();
  } else if (instance && !instance.isMounted) {
    onMounted(() => {
      migrateStorage();
      ready.value = true;
    });
  }
  const objectDefaults = isPlainObject(defaults);
  const storage = useStorage(key, defaults, undefined, {
    initOnMounted: !ready.value,
    // Setup-time defaults must not overwrite saved preferences before hydration.
    eventFilter: (invoke) => { if (ready.value) invoke(); },
    serializer: objectDefaults
      ? {
          read: (raw) => {
            if (!raw) return { ...defaults };
            try {
              const parsed = JSON.parse(raw);
              return isPlainObject(parsed)
                ? { ...defaults, ...parsed }
                : { ...defaults };
            } catch {
              return { ...defaults };
            }
          },
          write: (value) =>
            JSON.stringify(isPlainObject(value) ? value : defaults),
        }
      : undefined,
  });
  return { storage, ready };
}
