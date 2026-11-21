<template>
  <div class="min-w-0">
    <span class="label">{{ translate("image.iconPicker") }}</span>
    <button
      class="select max-sm:select-sm w-full justify-start font-normal"
      :popovertarget="popoverId"
      :style="{ anchorName }"
      type="button"
      :disabled="disabled"
    >
      <i :class="selectedIcon" class="text-lg" aria-hidden="true"></i>
      <span class="truncate">{{ selectedIcon }}</span>
    </button>
    <div
      :id="popoverId"
      ref="iconPicker"
      popover
      class="dropdown dropdown-end z-40 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-box border border-base-300 bg-base-100 p-2 shadow-lg"
      :style="{ positionAnchor: anchorName }"
      @keydown.esc="closeIconPicker"
    >
      <div class="mb-2 grid grid-cols-[minmax(0,1fr)_6rem] gap-2">
        <input
          v-model.trim="iconSearch"
          class="input input-sm w-full"
          type="search"
          :placeholder="translate('image.iconSearch')"
          :aria-label="translate('image.iconSearchLabel')"
        />
        <select
          v-model="remixIconCategory"
          class="select select-sm w-full"
          :aria-label="translate('image.iconCategories')"
        >
          <option value="all">
            {{ translate("image.allCategories") }}
          </option>
          <option
            v-for="category in remixIconCategories"
            :key="category.value"
            :value="category.value"
          >
            {{ category.label }}
          </option>
        </select>
      </div>
      <ScrollableContainer v-if="filteredRemixIcons.length">
        <div
          class="grid max-h-52 grid-cols-6 gap-1 overflow-x-hidden overflow-y-auto overscroll-contain"
          role="listbox"
          :aria-label="translate('image.icons')"
        >
          <Tooltip
            v-for="(icon, index) in filteredRemixIcons"
            :key="icon"
            as="button"
            trigger-class="inline-flex"
            adaptive
            placement="top"
            content-class="max-w-48 sm:max-w-80"
            :text="icon"
            :align="
              index % 6 === 0 ? 'start' : index % 6 === 5 ? 'end' : 'center'
            "
            class="btn btn-ghost btn-square btn-sm"
            :class="selectedIcon === icon ? 'btn-active' : ''"
            type="button"
            role="option"
            :aria-selected="selectedIcon === icon"
            :aria-label="icon"
            @click="selectRemixIcon(icon)"
          >
            <i :class="icon" class="text-lg" aria-hidden="true"></i>
          </Tooltip>
        </div>
      </ScrollableContainer>
      <p v-else class="py-4 text-center text-sm text-base-content/55">
        {{ translate("image.noMatchingIcons") }}
      </p>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, useId } from "vue";
import Tooltip from "@/components/display/Tooltip.vue";
import ScrollableContainer from "@/components/layout/ScrollableContainer.vue";
import remixIconTags from "@/data/remixicon-tags.json";
import { useLocale } from "@/i18n";
import { walkDocumentStyleRules } from "@/utils/dom/stylesheets";

const FEATURED_REMIX_ICONS = [
  "ri-image-line",
  "ri-copyright-line",
  "ri-leaf-line",
  "ri-sparkling-2-line",
  "ri-star-line",
  "ri-heart-line",
  "ri-camera-line",
  "ri-brush-line",
  "ri-pencil-line",
  "ri-at-line",
  "ri-global-line",
  "ri-shield-check-line",
];

const REMIX_ICON_CATEGORY_META = {
  Arrows: { key: "image.arrows" },
  Buildings: { key: "image.buildings" },
  Business: { key: "image.business" },
  Communication: { key: "image.communication" },
  Design: { key: "image.design" },
  Development: { key: "image.development" },
  Device: { key: "image.devices" },
  Document: { key: "common.documents" },
  Editor: { key: "image.editing" },
  Finance: { key: "image.finance" },
  Food: { key: "image.foodDrink" },
  "Game & Sports": { key: "image.gamesSports" },
  "Health & Medical": { key: "image.healthMedical" },
  Logos: { key: "image.brandLogos" },
  Map: { key: "image.maps" },
  Media: { key: "image.media" },
  System: { key: "image.system" },
  "User & Faces": { key: "image.usersEmoji" },
  Weather: { key: "image.weather" },
  Others: { key: "changelog.other" },
};

const REMIX_ICON_TAG_INDEX = new Map();
for (const [category, icons] of Object.entries(remixIconTags)) {
  for (const [name, keywords] of Object.entries(icons)) {
    REMIX_ICON_TAG_INDEX.set(name, {
      category,
      keywords: keywords.toLocaleLowerCase(),
    });
  }
}

const selectedIcon = defineModel({ type: String, required: true });

defineProps({
  disabled: { type: Boolean, default: false },
});

const { t: translate } = useLocale();
const componentId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
const popoverId = `watermark-icon-picker-${componentId}`;
const anchorName = `--${popoverId}`;

const iconPicker = ref(null);
const iconSearch = ref("");
const remixIconCategory = ref("all");
const remixIcons = ref([...FEATURED_REMIX_ICONS]);

const remixIconCategories = computed(() =>
  Object.keys(remixIconTags).map((value) => ({
    value,
    label: REMIX_ICON_CATEGORY_META[value]
      ? translate(REMIX_ICON_CATEGORY_META[value].key)
      : value,
  })),
);

const remixIconCatalog = computed(() =>
  remixIcons.value.map((icon) => {
    const name = icon.slice(3);
    const baseName = name.replace(/-(?:line|fill)$/, "");
    const metadata = REMIX_ICON_TAG_INDEX.get(baseName);
    return {
      icon,
      category: metadata?.category || "Others",
      searchText: `${name},${baseName},${metadata?.keywords || ""}`,
    };
  }),
);

const filteredRemixIcons = computed(() => {
  const query = iconSearch.value
    .toLocaleLowerCase()
    .replace(/^ri-/, "")
    .trim();
  if (!query && remixIconCategory.value === "all") return FEATURED_REMIX_ICONS;
  const terms = query.split(/\s+/).filter(Boolean);
  return remixIconCatalog.value
    .filter(
      ({ category, searchText }) =>
        (remixIconCategory.value === "all" ||
          category === remixIconCategory.value) &&
        terms.every((term) => searchText.includes(term)),
    )
    .map(({ icon }) => icon)
    .slice(0, 72);
});

function collectRemixIcons() {
  const names = new Set(FEATURED_REMIX_ICONS);
  walkDocumentStyleRules((rule) => {
    for (const match of (rule.selectorText || "").matchAll(
      /\.ri-([\w-]+):{1,2}before/g,
    )) {
      names.add(`ri-${match[1]}`);
    }
  });
  remixIcons.value = [...names].sort((a, b) => a.localeCompare(b));
}

function closeIconPicker() {
  if (iconPicker.value?.matches(":popover-open")) {
    iconPicker.value.hidePopover();
  }
}

function selectRemixIcon(icon) {
  selectedIcon.value = icon;
  iconSearch.value = "";
  closeIconPicker();
}

onMounted(() => {
  collectRemixIcons();
});
</script>
