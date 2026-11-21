<template>
  <component
    :is="to ? RouterLink : href ? 'a' : 'div'"
    v-bind="linkAttrs"
    class="group card card-border relative min-w-0 overflow-hidden bg-base-100 transition-[translate,box-shadow,border-color] duration-200 hover:-translate-y-1 hover:border-primary/30 hover:shadow-xl has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-4 has-[:focus-visible]:outline-primary motion-reduce:transform-none motion-reduce:translate-none motion-reduce:transition-none"
    :class="[
      compact ? '[--preview-width:min(40%,9rem)] min-h-24' : '',
      responsiveCompact ? '[--preview-width:min(40%,9rem)] max-md:min-h-24' : '',
      to || href
        ? 'cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary'
        : '',
    ]"
  >
    <div
      :class="[
        responsiveCompact ? 'max-md:contents' : '',
        compact
          ? 'contents'
          : [
              'relative flex items-end overflow-hidden bg-base-200',
              coverConfig.class || 'h-48 min-h-48 flex-1 sm:h-64 sm:min-h-64',
            ],
      ]"
    >
      <slot name="header-before" :details-id="detailsId"></slot>

      <div
        data-card-motion="cover"
        class="overflow-hidden bg-base-200"
        :class="[
          compact
            ? 'absolute inset-y-0 left-0 w-(--preview-width)'
            : 'absolute inset-0',
          responsiveCompact ? 'max-md:right-auto max-md:w-(--preview-width)' : '',
        ]"
        :aria-busy="hasCover && !coverLoaded"
      >
        <div v-if="$slots.cover" class="size-full" aria-hidden="true">
          <slot name="cover"></slot>
        </div>
        <template v-else-if="hasCover">
          <div
            v-if="!coverLoaded"
            class="skeleton absolute inset-0 rounded-none"
            aria-hidden="true"
          ></div>
          <div
            class="absolute inset-0 transition-[scale] duration-500 ease-out group-hover:scale-105 motion-reduce:scale-none motion-reduce:transition-none"
          >
            <img
              v-fade-in
              :key="coverSrc"
              :ref="syncCoverImage"
              v-bind="coverAttrs"
              :data-cover-src="coverSrc"
              :alt="title"
              loading="lazy"
              decoding="async"
              draggable="false"
              class="absolute inset-0 size-full object-center transition-opacity duration-500 ease-out motion-reduce:transition-none"
              :class="coverConfig.contain ? 'object-contain' : 'object-cover'"
              @load="handleCoverLoad"
              @error="handleCoverError"
            />
            <div
              class="pointer-events-none absolute inset-0 bg-linear-to-t from-black/80 via-black/30 to-black/5 transition-opacity duration-200 motion-reduce:transition-none"
              :class="[
                overlayTitle ? 'opacity-100' : 'opacity-0',
                responsiveCompact ? 'max-md:opacity-0' : '',
              ]"
              aria-hidden="true"
            ></div>
          </div>
        </template>
        <CoverBackdrop v-else :icon="coverConfig.icon" />
      </div>

      <div
        v-if="!titleInBody || compact"
        data-card-motion="title"
        class="relative z-10 min-w-0 font-serif leading-snug peer-focus-visible:underline peer-focus-visible:decoration-primary peer-focus-visible:decoration-2 peer-focus-visible:underline-offset-4"
        :class="[
          headingClass,
          compact ? 'ml-(--preview-width) px-3 pt-3' : 'w-full p-4 sm:p-5',
          responsiveCompact
            ? 'max-md:w-auto max-md:px-3 max-md:pt-3 max-md:pb-0 max-md:ml-(--preview-width) max-md:text-base-content'
            : '',
          overlayTitle ? 'text-white' : 'text-base-content',
          interaction?.interactiveOverlay ? 'pointer-events-none' : '',
        ]"
      >
        <div
          v-if="$slots.tags || tags.length"
          class="mb-2 flex flex-wrap gap-1.5 font-sans font-normal"
        >
          <slot name="tags" :cover-loaded="overlayTitle">
            <CatalogBadge v-for="tag in tags" :key="tag">{{ tag }}</CatalogBadge>
          </slot>
        </div>
        <component
          :is="titleTag"
          class="line-clamp-2 wrap-break-word text-balance font-bold"
          :class="[
            overlayTitle ? 'drop-shadow-sm' : '',
            responsiveCompact ? 'max-md:drop-shadow-none' : '',
          ]"
          ><slot name="title">{{ title }}</slot></component
        >
      </div>
    </div>

    <div
      :id="detailsId"
      class="card-body min-w-0 gap-0"
      :class="[
        compact ? 'ml-(--preview-width) px-3 pt-2 pb-3' : 'flex-none p-5 sm:p-6',
        responsiveCompact
          ? 'max-md:px-3 max-md:pt-2 max-md:pb-3 max-md:ml-(--preview-width)'
          : '',
      ]"
    >
      <div v-if="titleInBody && !compact" class="mb-3">
        <div
          v-if="$slots.tags || tags.length"
          class="mb-2 flex flex-wrap gap-1.5"
        >
          <slot name="tags" :cover-loaded="false">
            <CatalogBadge v-for="tag in tags" :key="tag">{{ tag }}</CatalogBadge>
          </slot>
        </div>
        <component
          :is="titleTag"
          class="wrap-break-word text-balance font-serif leading-snug font-bold"
          :class="headingClass"
          ><slot name="title">{{ title }}</slot></component
        >
      </div>
      <p
        v-if="description || $slots.description"
        data-card-motion="description"
        class="flex-none wrap-break-word text-pretty text-base-content/65"
        :class="[
          compact
            ? 'line-clamp-2 text-xs leading-5'
            : 'h-18 line-clamp-3 text-sm leading-6',
          responsiveCompact
            ? 'max-md:h-auto max-md:line-clamp-2 max-md:text-xs max-md:leading-5'
            : '',
        ]"
      >
        <slot name="description">{{ description }}</slot>
      </p>
      <div
        v-show="!hideActions"
        data-card-motion="actions"
        class="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 text-base-content/50"
        :class="[
          compact ? 'pt-2 text-xs' : 'min-h-10 pt-5 text-sm',
          responsiveCompact ? 'max-md:min-h-0 max-md:pt-2 max-md:text-xs' : '',
        ]"
      >
        <div
          v-if="$slots.meta"
          :class="[
            compact
              ? 'flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-0.5 leading-4 empty:hidden'
              : 'contents',
            responsiveCompact
              ? 'max-md:flex max-md:min-w-0 max-md:flex-1 max-md:flex-wrap max-md:items-center max-md:gap-x-1.5 max-md:gap-y-0.5 max-md:leading-4 empty:hidden'
              : '',
          ]"
        >
          <slot name="meta"></slot>
        </div>
        <span
          class="ml-auto flex max-w-full items-center gap-1 font-medium text-primary transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transform-none motion-reduce:transition-none"
          :class="[
            compact ? 'self-end' : '',
            responsiveCompact ? 'max-md:self-end' : '',
          ]"
        >
          <span v-if="action || $slots.action" class="min-w-0 wrap-break-word">
            <slot name="action">{{ action }}</slot>
          </span>
          <i
            :class="href && !to ? 'ri-external-link-line' : 'ri-arrow-right-line'"
            class="shrink-0"
            aria-hidden="true"
          ></i>
        </span>
      </div>
    </div>

    <slot name="overlay"></slot>
  </component>
</template>

<script setup>
import { computed, inject, provide, ref, useId, useSlots, watch } from "vue";
import { RouterLink } from "vue-router";
import CoverBackdrop from "@/components/display/CoverBackdrop.vue";
import CatalogBadge from "./CatalogBadge.vue";
import {
  CATALOG_CARD_CONTEXT_KEY,
  CATALOG_CARD_INTERACTION_KEY,
} from "./catalog-card-context";
import {
  getImageAttrs,
  restoreOriginalImage,
} from "@/utils/images/responsive-images";

const DEFAULT_COVER_SIZES =
  "(min-width: 1280px) 390px, (min-width: 768px) calc(50vw - 2.625rem), calc(100vw - 3rem)";

const props = defineProps({
  to: { type: [String, Object], default: null },
  href: { type: String, default: "" },
  layout: {
    type: String,
    default: "default",
    validator: (value) => ["default", "compact", "responsive"].includes(value),
  },
  title: { type: String, default: "" },
  titleTag: {
    type: String,
    default: "h2",
    validator: (value) => ["h2", "h3", "h4", "div"].includes(value),
  },
  description: { type: String, default: "" },
  action: { type: String, default: "" },
  tags: { type: Array, default: () => [] },
  cover: { type: [String, Object], default: "" },
});

const detailsId = `catalog-details-${useId()}`;
const coverLoaded = ref(true);
const coverFailed = ref(false);
const slots = useSlots();
const interaction = inject(CATALOG_CARD_INTERACTION_KEY, null);

const compact = computed(() => props.layout === "compact");
const responsiveCompact = computed(() => props.layout === "responsive");
const hideActions = computed(
  () => Boolean(interaction?.hideActionsWhenCompact) && compact.value,
);
const titleInBody = computed(() => Boolean(slots.cover));
const coverConfig = computed(() => {
  if (typeof props.cover === "string") {
    return {
      src: props.cover,
      icon: "ri-article-line",
      class: "",
      sizes: DEFAULT_COVER_SIZES,
      contain: false,
      fixedSizes: false,
    };
  }
  return {
    src: props.cover?.src || "",
    icon: props.cover?.icon || "ri-article-line",
    class: props.cover?.class || "",
    sizes: props.cover?.sizes || DEFAULT_COVER_SIZES,
    contain: Boolean(props.cover?.contain),
    fixedSizes: Boolean(props.cover?.fixedSizes),
  };
});
const coverSrc = computed(() => coverConfig.value.src);

const headingClass = computed(() => [
  compact.value ? "text-base" : "text-xl sm:text-2xl",
  responsiveCompact.value ? "max-md:text-base" : "",
]);
const linkAttrs = computed(() =>
  props.to
    ? { to: props.to }
    : props.href
      ? { href: props.href, target: "_blank", rel: "noopener noreferrer" }
      : {},
);
const hasCover = computed(
  () => !slots.cover && Boolean(coverSrc.value) && !coverFailed.value,
);
const overlayTitle = computed(
  () => !compact.value && hasCover.value && coverLoaded.value,
);
const coverAttrs = computed(() => {
  const sizes =
    (compact.value || responsiveCompact.value) && !coverConfig.value.fixedSizes
      ? responsiveCompact.value
        ? `(max-width: 359px) 40vw, (max-width: 767px) 144px, ${coverConfig.value.sizes}`
        : "(min-width: 360px) 144px, 40vw"
      : coverConfig.value.sizes;
  const attrs = getImageAttrs(coverSrc.value, sizes);
  delete attrs.onError;
  return attrs;
});

provide(CATALOG_CARD_CONTEXT_KEY, {
  overlay: overlayTitle,
  responsiveCompact,
});

watch(
  coverSrc,
  () => {
    coverLoaded.value = false;
    coverFailed.value = false;
  },
  { flush: "sync" },
);

function handleCoverLoad(event) {
  if (event.currentTarget.getAttribute("data-cover-src") !== coverSrc.value) {
    return;
  }
  coverLoaded.value = true;
  coverFailed.value = false;
}

function handleCoverError(event) {
  const image = event.currentTarget;
  if (image.getAttribute("data-cover-src") !== coverSrc.value) return;
  const original = image.getAttribute("data-original-src");
  if (original && image.getAttribute("src") !== original) {
    restoreOriginalImage(event);
    return;
  }
  coverLoaded.value = false;
  coverFailed.value = true;
}

function syncCoverImage(image) {
  if (!image?.complete) return;
  const event = { currentTarget: image };
  if (image.naturalWidth > 0) handleCoverLoad(event);
  else handleCoverError(event);
}
</script>
