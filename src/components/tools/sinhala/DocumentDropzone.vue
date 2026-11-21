<template>
  <div class="space-y-2">
    <div class="flex flex-wrap items-center gap-2">
      <hgroup class="min-w-0 flex flex-col items-start justify-between">
        <h2 class="block font-serif text-lg font-bold">
          {{ isDirectionReversed ? "Legacy" : "Unicode" }}
        </h2>
        <p class="text-xs text-base-content/55">
          {{ translate("sinhala.sourceEncoding") }}
        </p>
      </hgroup>
      <Tooltip
        as="div"
        trigger-class=""
        activation-class="tooltip"
        :text="translate('sinhala.swapShortcut')"
      >
        <button
          type="button"
          class="btn btn-ghost btn-circle"
          :aria-label="translate('sinhala.swap')"
          :disabled="document.busy"
          @click="emit('swap', $event)"
        >
          <i
            class="ri-arrow-left-right-line block text-lg"
            aria-hidden="true"
          ></i>
        </button>
      </Tooltip>
      <hgroup class="min-w-0 flex flex-col items-start justify-between">
        <h2 class="block font-serif text-lg font-bold">
          {{ isDirectionReversed ? "Unicode" : "Legacy" }}
        </h2>
        <p class="text-xs text-base-content/55">
          {{ translate("sinhala.targetEncoding") }}
        </p>
      </hgroup>
    </div>

    <div
      class="card card-dash min-h-[170px] min-w-0 border-base-content bg-base-100 transition-colors lg:min-h-[234px] motion-reduce:transition-none"
      :class="{
        'border-base-content/50 bg-base-200/60': isDragging,
      }"
      @dragenter.prevent="isDragging = !document.busy"
      @dragover.prevent="isDragging = !document.busy"
      @dragleave.prevent="handleDragLeave"
      @drop.prevent="handleDrop"
    >
      <div
        class="card-body min-w-0 justify-center gap-4 p-4 sm:gap-5 sm:p-5 lg:p-6"
      >
        <div class="flex min-w-0 flex-col items-center gap-2 text-center">
          <div
            class="relative flex h-10 w-full min-w-0 items-center justify-center lg:h-12"
          >
            <span
              class="flex size-10 shrink-0 items-center justify-center rounded-box bg-base-200 text-xl lg:size-12 lg:text-2xl"
              aria-hidden="true"
            >
              <i
                :class="
                  isDragging
                    ? 'ri-file-transfer-line'
                    : document.file
                      ? document.isPdf
                        ? 'ri-file-pdf-2-fill text-error'
                        : document.isPptx
                          ? 'ri-file-ppt-fill text-warning'
                          : 'ri-file-word-fill text-info'
                      : 'ri-file-add-line'
                "
              ></i>
            </span>
            <button
              v-if="document.file"
              type="button"
              class="btn btn-xs group absolute bottom-0 left-[calc(50%+1rem)] h-auto min-h-6 max-w-[calc(50%-1rem)] gap-1 rounded-full border-base-100 bg-base-200 px-2 py-1 text-base-content/70 shadow-xs transition-colors duration-150 enabled:hover:bg-base-300 enabled:hover:text-base-content enabled:active:bg-base-300 active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/50 disabled:opacity-50 motion-safe:enabled:active:translate-y-px motion-reduce:transition-none lg:left-[calc(50%+1.25rem)] lg:max-w-[calc(50%-1.25rem)]"
              :aria-label="translate('sinhala.changeFile')"
              :disabled="document.busy"
              @click="uploadInput?.click()"
            >
              <i
                class="ri-refresh-line shrink-0 text-sm transition-transform duration-150 motion-safe:group-enabled:group-hover:rotate-12 motion-reduce:transition-none"
                aria-hidden="true"
              ></i>
              <span
                class="min-w-0 whitespace-normal [overflow-wrap:anywhere]"
                >{{ translate("sinhala.changeFileShort") }}</span
              >
            </button>
          </div>

          <div v-if="document.file" class="w-full min-w-0 space-y-1">
            <p
              class="min-w-0 text-sm font-medium [overflow-wrap:anywhere] sm:text-base"
            >
              {{ document.file.name }}
            </p>
            <p
              role="status"
              aria-live="polite"
              aria-atomic="true"
              class="flex min-h-5 min-w-0 flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-base-content/55"
            >
              <span
                class="badge badge-soft badge-xs shrink-0"
                :class="
                  document.error
                    ? 'badge-error'
                    : document.result
                      ? 'badge-success'
                      : ''
                "
                >{{ document.fileStatus }}</span
              >
              <span class="whitespace-nowrap">
                <template v-if="document.textLength">{{
                  translate(
                    "sinhala.characterCount",
                    { count: document.textLength },
                    document.textLength,
                  )
                }}</template>
                <template v-else>{{
                  document.file.name.split(".").pop()?.toUpperCase()
                }}</template>
              </span>
              <span
                v-if="
                  document.reading || !document.error || document.textLength
                "
                class="inline-flex min-w-0 max-w-full items-center gap-1.5 [overflow-wrap:anywhere]"
              >
                <span
                  v-if="document.reading"
                  class="loading loading-spinner loading-xs shrink-0"
                  aria-hidden="true"
                ></span>
                <span>{{ document.sourceStatus }}</span>
              </span>
            </p>
            <p
              v-if="document.error"
              role="alert"
              class="pt-1 text-sm text-error [overflow-wrap:anywhere]"
            >
              {{ localizeText(document.error) }}
            </p>
          </div>
          <div v-else class="min-w-0 space-y-1">
            <h3 class="font-serif text-base font-bold lg:text-lg">
              {{
                translate(isDragging ? "common.dropHint" : "sinhala.dropHint")
              }}
            </h3>
            <p class="text-xs text-base-content/60 sm:text-sm">
              {{ translate("sinhala.documentHint") }}
            </p>
          </div>
        </div>

        <div
          class="grid w-full min-w-0 max-w-full grid-cols-[minmax(0,1fr)] items-center gap-x-4 gap-y-2 self-center md:w-fit"
          :class="{
            'md:grid-cols-[minmax(0,max-content)_auto]': document.isPdf,
          }"
        >
          <template v-if="document.isPdf">
            <div
              class="col-start-1 row-start-1 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3"
            >
              <label
                for="sinhala-pdf-format"
                class="min-w-0 text-xs font-medium"
                >{{ translate("sinhala.outputFormat") }}</label
              >
              <label class="label min-w-0 cursor-pointer gap-1.5 text-xs">
                <input
                  v-model="pdfAutomatic"
                  type="checkbox"
                  class="checkbox checkbox-xs shrink-0"
                  :disabled="document.busy || !document.textLength"
                />
                <span class="whitespace-normal [overflow-wrap:anywhere]">{{
                  translate("sinhala.autoOutput")
                }}</span>
              </label>
            </div>
            <select
              id="sinhala-pdf-format"
              v-model="pdfSelectedFormat"
              class="select select-sm col-start-1 row-start-2 w-full min-w-0"
              :disabled="document.busy || !document.textLength"
            >
              <option value="docx">
                {{ translate("sinhala.docxOutput") }}
              </option>
              <option value="pptx">
                {{ translate("sinhala.pptxOutput") }}
              </option>
            </select>
          </template>

          <button
            v-if="document.result"
            type="button"
            class="link link-primary link-hover text-xs"
            :class="{ 'md:col-start-2 md:row-start-1': document.isPdf }"
            :disabled="!document.canConvert || document.busy"
            @click="emit('convert')"
          >
            <i class="ri-repeat-2-line" aria-hidden="true"></i>
            {{ translate("sinhala.reconvertDocument") }}
          </button>

          <div
            class="flex min-w-0 flex-wrap items-center justify-center gap-2 md:flex-nowrap"
            :class="{
              'md:col-start-2 md:row-start-2 [&>.btn]:flex-1 md:[&>.btn]:flex-none':
                document.isPdf,
            }"
          >
            <button
              v-if="!document.file"
              type="button"
              class="btn btn-primary btn-sm h-auto min-h-8 min-w-0 max-w-full whitespace-normal py-1"
              :disabled="document.busy"
              @click="uploadInput?.click()"
            >
              <i class="ri-folder-open-line" aria-hidden="true"></i>
              {{ translate("sinhala.chooseDocument") }}
            </button>
            <button
              v-if="document.file && !document.result"
              type="button"
              class="btn btn-sm h-auto min-h-8 min-w-0 max-w-full whitespace-normal py-1"
              :class="
                document.error && !document.textLength
                  ? 'btn-ghost'
                  : 'btn-primary'
              "
              :disabled="!document.canConvert || document.busy"
              @click="emit('convert')"
            >
              <span
                v-if="document.converting"
                class="loading loading-spinner loading-xs"
                aria-hidden="true"
              ></span>
              <i v-else class="ri-repeat-2-line" aria-hidden="true"></i>
              {{
                translate(
                  document.converting
                    ? "sinhala.converting"
                    : document.hasConverted ||
                        (document.error && document.textLength)
                      ? "sinhala.reconvertDocument"
                      : "sinhala.convertDocument",
                )
              }}
            </button>
            <a
              v-if="document.result"
              class="btn btn-primary btn-sm h-auto min-h-8 min-w-0 max-w-full whitespace-normal py-1"
              :href="document.result.url"
              :download="document.result.filename"
            >
              <i class="ri-download-line" aria-hidden="true"></i>
              {{
                translate(
                  document.result.format === "pptx"
                    ? "sinhala.downloadPptx"
                    : "sinhala.downloadDocx",
                )
              }}
            </a>
          </div>
        </div>

        <input
          id="sinhala-document-upload"
          ref="uploadInput"
          type="file"
          accept=".doc,.ppt,.docx,.pptx,.pdf,application/msword,application/vnd.ms-powerpoint,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation"
          class="sr-only"
          :disabled="document.busy"
          tabindex="-1"
          @change="handleSelection"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";
import Tooltip from "@/components/display/Tooltip.vue";
import { useLocale } from "@/i18n";

const pdfAutomatic = defineModel("pdfAutomatic", {
  type: Boolean,
  default: true,
});
const pdfSelectedFormat = defineModel("pdfSelectedFormat", {
  type: String,
  default: "docx",
});

const props = defineProps({
  isDirectionReversed: { type: Boolean, required: true },
  document: { type: Object, required: true },
});

const emit = defineEmits(["swap", "select-file", "convert"]);

const { t: translate, text: localizeText } = useLocale();
const uploadInput = ref(null);
const isDragging = ref(false);

function handleSelection(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (file && !props.document.busy) emit("select-file", file);
}

function handleDragLeave(event) {
  if (!event.currentTarget.contains(event.relatedTarget)) {
    isDragging.value = false;
  }
}

function handleDrop(event) {
  isDragging.value = false;
  if (props.document.busy) return;
  const file = event.dataTransfer?.files?.[0];
  if (file) emit("select-file", file);
}
</script>
