import { inject, provide } from "vue";

export const READING_LAYOUT_CONTEXT = Symbol("reading-layout-context");

export function provideReadingLayoutContext(context) {
  provide(READING_LAYOUT_CONTEXT, context);
}

export function useReadingLayoutContext() {
  return inject(READING_LAYOUT_CONTEXT, null);
}
