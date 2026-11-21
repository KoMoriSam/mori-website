import { defineStore } from "pinia";
import { DEFAULT_NOVEL_CHAPTER_UUID, useNovelState } from "./state";
import { useNovelGetters } from "./getters";
import { isNovelReaderRoute, useNovelActions } from "./actions";

export { DEFAULT_NOVEL_CHAPTER_UUID, isNovelReaderRoute };

export const useNovelStore = defineStore("novel", () => {
  const state = useNovelState();
  const getters = useNovelGetters(state);
  const actions = useNovelActions(state, getters);

  return {
    // State
    ...state,

    // Getters
    ...getters,

    // Actions
    ...actions,
  };
});
