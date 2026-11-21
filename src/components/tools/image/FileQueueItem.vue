<template>
  <li
    class="list-row relative items-center gap-3 rounded-none border-b border-base-300 transition-colors last:border-b-0 motion-reduce:transition-none"
    :class="[
      selected ? 'bg-base-200' : 'hover:bg-base-200/60',
      viewMode === 'compact' ? 'gap-1.5 p-1.5' : '',
    ]"
    @click="emit('select')"
  >
    <img
      :src="item.previewUrl"
      alt=""
      class="image-checker shrink-0 rounded-field object-cover"
      :class="viewMode === 'compact' ? 'size-8' : 'size-14'"
    />
    <button
      class="min-w-0 text-left focus-visible:rounded-field focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"
      type="button"
      :aria-label="translate('image.previewLabel', { p0: item.file.name })"
      :aria-current="selected ? 'true' : undefined"
      @click="emit('select')"
    >
      <span
        class="block truncate font-medium"
        :class="viewMode === 'compact' ? 'text-sm leading-tight' : ''"
        >{{ item.file.name }}</span
      >
      <p
        v-if="viewMode === 'detailed'"
        class="mt-1 truncate text-xs text-base-content/55"
      >
        {{
          item.width
            ? `${item.width} × ${item.height}`
            : translate("image.readingDimensions")
        }}
        <template v-if="item.frameCount > 1">
          ·
          {{
            translate(
              "common.counts.frames",
              { count: item.frameCount },
              item.frameCount,
            )
          }}</template
        >
        · {{ formatBytes(item.file.size) }}
        <template v-if="item.resultSize">
          → {{ formatBytes(item.resultSize) }} · {{ savingsLabel }}</template
        >
      </p>
      <div
        v-if="viewMode === 'detailed' && item.status === 'processing'"
        class="mt-2 flex items-center gap-2"
      >
        <progress
          class="progress progress-primary w-full"
          :value="item.progress"
          max="100"
        ></progress>
        <span class="w-9 text-right text-xs tabular-nums"
          >{{ item.progress }}%</span
        >
      </div>
      <p
        v-else-if="viewMode === 'detailed' && hasMessage"
        class="mt-1 text-xs"
        :class="
          item.status === 'error' ? 'text-error' : 'text-base-content/55'
        "
      >
        {{ messageText }}
      </p>
    </button>
    <span
      class="flex shrink-0 items-center self-center"
      :class="viewMode === 'compact' ? 'gap-0.5' : 'gap-1'"
      :aria-label="
        translate('image.convertTo', {
          p0: formatLabel(item.format),
          p1: formatLabel(resolvedTargetFormat),
        })
      "
    >
      <span class="badge badge-outline badge-xs">{{
        formatLabel(item.format)
      }}</span>
      <i
        class="ri-arrow-right-line text-base-content/40"
        aria-hidden="true"
      ></i>
      <span class="badge badge-xs" :class="targetFormatBadgeClass">
        {{ formatLabel(resolvedTargetFormat) }}
      </span>
    </span>
    <div
      class="flex shrink-0 items-center"
      :class="viewMode === 'compact' ? 'gap-0' : 'gap-1'"
    >
      <Tooltip
        as="span"
        trigger-class=""
        activation-class="tooltip"
        class="tooltip-left"
        :class="
          viewMode === 'compact'
            ? 'inline-flex size-6 items-center justify-center'
            : 'm-2'
        "
        :text="statusLabel"
        :aria-label="statusLabel"
        role="img"
      >
        <i :class="statusIcon" aria-hidden="true"></i>
      </Tooltip>
      <button
        v-if="item.status === 'done'"
        class="btn btn-square btn-ghost"
        :class="viewMode === 'compact' ? 'btn-xs' : 'btn-sm'"
        type="button"
        :aria-label="translate('image.downloadResult')"
        @click.stop="emit('download')"
      >
        <i class="ri-download-2-line" aria-hidden="true"></i>
      </button>
      <button
        v-if="item.status === 'error' || item.status === 'cancelled'"
        class="btn btn-square btn-ghost"
        :class="viewMode === 'compact' ? 'btn-xs' : 'btn-sm'"
        type="button"
        :aria-label="translate('image.convertAgain')"
        @click.stop="emit('retry')"
      >
        <i class="ri-restart-line" aria-hidden="true"></i>
      </button>
      <button
        class="btn btn-square btn-ghost"
        :class="viewMode === 'compact' ? 'btn-xs' : 'btn-sm'"
        type="button"
        :disabled="item.status === 'processing'"
        :aria-label="translate('image.removeFile')"
        @click.stop="emit('remove')"
      >
        <i class="ri-close-line" aria-hidden="true"></i>
      </button>
    </div>
    <progress
      v-if="viewMode === 'compact' && item.status === 'processing'"
      class="progress progress-primary absolute inset-x-0 bottom-0 h-1 w-full rounded-none"
      :value="item.progress"
      max="100"
    ></progress>
  </li>
</template>

<script setup>
import { computed } from "vue";
import "@/assets/image-checker.css";
import Tooltip from "@/components/display/Tooltip.vue";
import { useLocale } from "@/i18n";
import { IMAGE_FORMATS, formatBytes } from "@/utils/image/converter";

const QUEUE_STATUS_META = {
  reading: {
    key: "image.reading",
    icon: "loading loading-spinner loading-sm",
  },
  ready: {
    key: "image.waitingToConvert",
    icon: "ri-time-line text-base-content/45",
  },
  processing: {
    key: "image.processing",
    icon: "loading loading-spinner loading-sm",
  },
  done: {
    key: "image.completed",
    icon: "ri-checkbox-circle-line text-success",
  },
  error: {
    key: "image.failed",
    icon: "ri-error-warning-line text-error",
  },
  cancelled: {
    key: "image.canceled",
    icon: "ri-stop-circle-line text-base-content/50",
  },
};

const props = defineProps({
  item: { type: Object, required: true },
  selected: { type: Boolean, default: false },
  viewMode: { type: String, default: "detailed" },
  targetFormat: { type: String, required: true },
});

const emit = defineEmits(["select", "download", "retry", "remove"]);

const { t: translate, text: localizeText } = useLocale();

const resolvedTargetFormat = computed(
  () => props.item.outputFormat || props.targetFormat,
);

const targetFormatBadgeClass = computed(() => {
  if (props.item.status === "done") return "badge-success";
  if (props.item.status === "error" && props.item.outputFormat) {
    return "badge-error";
  }
  return "badge-neutral";
});

const savingsLabel = computed(() => {
  const rate = (1 - props.item.resultSize / props.item.file.size) * 100;
  return rate >= 0
    ? translate("image.saved", { p0: rate.toFixed(1) })
    : translate("image.increased", { p0: Math.abs(rate).toFixed(1) });
});

const hasMessage = computed(() =>
  Boolean(
    props.item.warnings?.length ||
      props.item.messageDescriptor ||
      props.item.message,
  ),
);

const messageText = computed(() => {
  if (props.item.warnings?.length) {
    return props.item.warnings.map(localizeText).join("; ");
  }
  return localizeText(props.item.messageDescriptor || props.item.message);
});

const statusLabel = computed(() =>
  QUEUE_STATUS_META[props.item.status]
    ? translate(QUEUE_STATUS_META[props.item.status].key)
    : props.item.status,
);

const statusIcon = computed(() => QUEUE_STATUS_META[props.item.status]?.icon);

function formatLabel(format) {
  return IMAGE_FORMATS[format]?.label || format.toUpperCase();
}
</script>
