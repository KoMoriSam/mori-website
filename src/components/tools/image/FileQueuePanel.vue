<template>
  <section
    class="min-w-0 transition-colors md:col-start-1 motion-reduce:transition-none"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent="onDragEnter"
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
  >
    <header class="flex flex-wrap items-center justify-between gap-3">
      <hgroup>
        <h2 class="card-title font-serif">
          {{ translate("image.fileQueue") }}
        </h2>
        <p v-if="queue.length" class="text-sm text-base-content/55">
          {{ summary }}
        </p>
      </hgroup>
      <div v-if="queue.length">
        <div
          class="tabs tabs-box tabs-sm"
          role="tablist"
          :aria-label="translate('image.queueView')"
        >
          <Tooltip
            as="button"
            trigger-class="block"
            class="tab"
            :class="queueViewMode === 'detailed' ? 'tab-active' : ''"
            type="button"
            role="tab"
            :aria-selected="queueViewMode === 'detailed'"
            :aria-label="translate('image.detailedView')"
            :text="translate('image.detailedView')"
            @click="queueViewMode = 'detailed'"
          >
            <i class="ri-list-check-3" aria-hidden="true"></i>
          </Tooltip>
          <Tooltip
            as="button"
            trigger-class="block"
            class="tab"
            :class="queueViewMode === 'compact' ? 'tab-active' : ''"
            type="button"
            role="tab"
            :aria-selected="queueViewMode === 'compact'"
            :aria-label="translate('image.compactView')"
            :text="translate('image.compactView')"
            @click="queueViewMode = 'compact'"
          >
            <i class="ri-list-unordered" aria-hidden="true"></i>
          </Tooltip>
        </div>
      </div>
    </header>

    <template v-if="queue.length || loadingState.active">
      <div
        class="relative my-2 overflow-hidden rounded-box border border-base-300 bg-base-100"
        :class="[
          loadingState.active ? 'min-h-24' : '',
          dragging ? 'border-dashed border-base-content bg-base-200/60' : '',
        ]"
      >
        <ScrollableContainer>
          <ul
            class="list max-h-[min(32rem,60dvh)] overflow-x-hidden overflow-y-auto overscroll-contain scrollbar-thin"
            :aria-busy="loadingState.active"
            :aria-label="translate('image.pendingImages')"
          >
            <FileQueueItem
              v-for="item in queue"
              :key="item.id"
              :item="item"
              :selected="selectedId === item.id"
              :view-mode="queueViewMode"
              :target-format="targetFormat"
              @select="selectedId = item.id"
              @download="emit('download-item', item)"
              @retry="emit('retry-item', item)"
              @remove="emit('remove-item', item.id)"
            />
          </ul>
        </ScrollableContainer>
        <div
          v-if="loadingState.active"
          class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/50 text-sm text-white text-shadow-xs"
          role="status"
          aria-live="polite"
        >
          <span
            class="loading loading-spinner loading-md"
            aria-hidden="true"
          ></span>
          <span>
            {{ translate("image.loaded") }}
            <span class="tabular-nums"
              >{{ loadingState.loaded }}/{{ loadingState.total }}</span
            >
          </span>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <label
          class="btn btn-sm min-w-52 flex-1"
          :class="
            !canAddFiles
              ? 'btn-disabled'
              : dragging
                ? 'btn-dash'
                : 'btn-outline'
          "
          :aria-disabled="!canAddFiles"
        >
          <i
            :class="
              isQueueFull
                ? 'ri-inbox-archive-line'
                : dragging
                  ? 'ri-multi-image-line'
                  : 'ri-image-add-line'
            "
            aria-hidden="true"
          ></i>
          {{
            isQueueFull
              ? translate("image.queueFull")
              : dragging
                ? translate("common.dropHint")
                : translate("image.addMore")
          }}
          <input
            class="sr-only"
            type="file"
            multiple
            :disabled="!canAddFiles"
            :accept="FILE_ACCEPT"
            @change="onFileInput"
          />
        </label>
        <div class="ms-auto flex shrink-0 gap-2">
          <button
            v-if="isRunning || canDownloadAll"
            class="btn btn-primary btn-sm"
            type="button"
            :disabled="isRunning"
            @click="emit('download-all')"
          >
            <template v-if="isRunning">
              <span
                class="loading loading-spinner loading-xs"
                aria-hidden="true"
              ></span>
              {{ translate("image.converting") }}
              <span class="inline-block w-[4ch] text-right tabular-nums">
                {{ conversionProgress }}%
              </span>
            </template>
            <template v-else>
              <i class="ri-file-zip-line" aria-hidden="true"></i
              >{{ translate("image.downloadAll") }}
            </template>
          </button>
          <button
            class="btn btn-sm"
            type="button"
            :disabled="isRunning || loadingState.active || !hasSuccessful"
            @click="emit('reset-queue')"
          >
            <i class="ri-refresh-line" aria-hidden="true"></i
            >{{ translate("image.resetStatus") }}
          </button>
          <button
            class="btn btn-sm"
            type="button"
            :disabled="isRunning || loadingState.active"
            @click="emit('clear-queue')"
          >
            <i class="ri-delete-bin-line" aria-hidden="true"></i
            >{{ translate("image.clear") }}
          </button>
        </div>
      </div>
    </template>
    <div
      v-else
      class="card card-dash my-2 border-base-content bg-base-100"
      :class="dragging ? 'border-base-content/50 bg-base-200/60' : ''"
    >
      <div class="card-body items-center text-center">
        <span
          class="flex size-12 items-center justify-center rounded-box bg-base-200 text-2xl"
          aria-hidden="true"
        >
          <i
            :class="dragging ? 'ri-multi-image-line' : 'ri-image-add-line'"
            aria-hidden="true"
          ></i>
        </span>
        <div>
          <h3 class="font-serif text-lg font-bold">
            {{
              dragging
                ? translate("common.dropHint")
                : translate("image.dropImagesHere")
            }}
          </h3>
          <p class="mt-1 text-sm text-base-content/60">
            {{ translate("image.queueHint") }}
          </p>
        </div>
        <label
          class="btn btn-sm"
          :class="
            isRunning ? 'btn-disabled' : dragging ? 'btn-dash' : 'btn-outline'
          "
        >
          <i
            :class="dragging ? 'ri-image-add-line' : 'ri-folder-open-line'"
            aria-hidden="true"
          ></i>
          {{
            dragging
              ? translate("image.addImages")
              : translate("image.chooseImages")
          }}
          <input
            class="sr-only"
            type="file"
            multiple
            :disabled="isRunning"
            :accept="FILE_ACCEPT"
            @change="onFileInput"
          />
        </label>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import Tooltip from "@/components/display/Tooltip.vue";
import ScrollableContainer from "@/components/layout/ScrollableContainer.vue";
import FileQueueItem from "./FileQueueItem.vue";
import { useLocale } from "@/i18n";
import { MAX_IMAGE_QUEUE_FILES } from "@/utils/image/converter";

const SMALL_SCREEN_QUERY = "(max-width: 639px)";
const FILE_ACCEPT =
  ".png,.jpg,.jpeg,.webp,.avif,.bmp,.gif,image/png,image/jpeg,image/webp,image/avif,image/bmp,image/gif";

const selectedId = defineModel("selectedId", { type: Number, default: null });

const props = defineProps({
  queue: { type: Array, required: true },
  targetFormat: { type: String, required: true },
  summary: { type: String, required: true },
  isRunning: { type: Boolean, default: false },
  loadingState: { type: Object, required: true },
  conversionProgress: { type: Number, default: 0 },
});

const emit = defineEmits([
  "add-files",
  "download-item",
  "retry-item",
  "remove-item",
  "download-all",
  "reset-queue",
  "clear-queue",
]);

const { t: translate } = useLocale();
const queueViewMode = ref("detailed");
const dragging = ref(false);

const isQueueFull = computed(() => props.queue.length >= MAX_IMAGE_QUEUE_FILES);
const canAddFiles = computed(
  () => !props.isRunning && !props.loadingState.active && !isQueueFull.value,
);
const hasSuccessful = computed(() =>
  props.queue.some((item) => item.status === "done"),
);
const canDownloadAll = computed(
  () =>
    !props.loadingState.active &&
    hasSuccessful.value &&
    props.queue.every((item) => ["done", "error"].includes(item.status)),
);

function onFileInput(event) {
  emit("add-files", event.target.files);
  event.target.value = "";
}

function onDragEnter() {
  if (canAddFiles.value) dragging.value = true;
}

function onDragLeave(event) {
  if (!event.currentTarget.contains(event.relatedTarget)) {
    dragging.value = false;
  }
}

function onDrop(event) {
  dragging.value = false;
  if (canAddFiles.value) emit("add-files", event.dataTransfer.files);
}

onMounted(() => {
  queueViewMode.value = window.matchMedia(SMALL_SCREEN_QUERY).matches
    ? "compact"
    : "detailed";
});
</script>
