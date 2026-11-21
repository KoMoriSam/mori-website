<template>
  <fieldset
    class="mt-3 flex min-w-0 flex-wrap items-start gap-x-8 gap-y-4 [overflow-anchor:none] md:grid-cols-2"
    :disabled="disabled"
    @pointerdown.capture="emit('capture-viewport', $event)"
    @keydown.capture="emit('capture-viewport', $event)"
  >
    <div class="flex min-w-0 max-w-full flex-col gap-3">
      <label
        class="label min-w-0 max-w-full whitespace-normal cursor-pointer justify-start gap-3 p-0"
      >
        <input
          v-model="options.preserveCurrentReducedForms"
          type="checkbox"
          class="toggle toggle-primary toggle-sm"
          @change="emit('change', $event)"
        />
        <OptionLabel
          message-key="sinhala.preserveReduced"
          sinhala="ව්‍යඤ්ජන නියෝජක සංකේත"
        />
      </label>

      <div
        v-if="!options.preserveCurrentReducedForms"
        class="ms-4 flex min-w-0 max-w-full flex-col gap-3 border-s border-base-300 ps-6"
      >
        <label
          class="label min-w-0 max-w-full whitespace-normal cursor-pointer justify-start gap-3 p-0"
        >
          <input
            v-model="options.preserveYansaya"
            type="checkbox"
            class="toggle toggle-primary toggle-sm"
            @change="emit('change', $event)"
          />
          <OptionLabel message-key="sinhala.yansaya" sinhala="යංශය">
            <template #glyph>
              <code
                class="font-[Noto_Sans_Sinhala] text-xs bg-base-200/50 border border-base-300 rounded-md px-1 py-0.25"
                >්‍ය</code
              >
            </template>
          </OptionLabel>
        </label>

        <label
          class="label min-w-0 max-w-full whitespace-normal cursor-pointer justify-start gap-3 p-0"
        >
          <input
            v-model="options.preserveRakaransaya"
            type="checkbox"
            class="toggle toggle-primary toggle-sm"
            @change="emit('change', $event)"
          />
          <OptionLabel message-key="sinhala.rakaransaya" sinhala="රකාරාංශය">
            <template #glyph>
              <code
                class="font-[Noto_Sans_Sinhala] text-xs bg-base-200/50 border border-base-300 rounded-md px-1 py-0.25"
                >්‍ර</code
              >
            </template>
          </OptionLabel>
        </label>

        <label
          class="label min-w-0 max-w-full whitespace-normal cursor-pointer justify-start gap-3 p-0"
        >
          <input
            v-model="options.preserveRepaya"
            type="checkbox"
            class="toggle toggle-primary toggle-sm"
            @change="emit('change', $event)"
          />
          <OptionLabel message-key="sinhala.repaya" sinhala="රේඵය">
            <template #glyph>
              <code
                class="font-[Noto_Sans_Sinhala] text-xs bg-base-200/50 border border-base-300 rounded-md px-1 py-0.25"
                >◌ර්‍</code
              >
            </template>
          </OptionLabel>
        </label>
      </div>
    </div>

    <label
      v-if="!isDirectionReversed"
      class="label min-w-0 max-w-full whitespace-normal cursor-pointer justify-start gap-3 p-0"
    >
      <input
        v-model="options.compactDaForms"
        type="checkbox"
        class="toggle toggle-primary toggle-sm"
        @change="emit('change', $event)"
      />
      <OptionLabel
        message-key="sinhala.compactDa"
        sinhala="සංක්ෂිප්ත “ද” රූප"
      />
    </label>

    <div class="flex min-w-0 max-w-full flex-col gap-3">
      <label
        class="label min-w-0 max-w-full whitespace-normal cursor-pointer justify-start gap-3 p-0"
      >
        <input
          v-model="options.preserveCurrentConjuncts"
          type="checkbox"
          class="toggle toggle-primary toggle-sm"
          @change="emit('change', $event)"
        />
        <OptionLabel
          message-key="sinhala.preserveConjuncts"
          sinhala="බැඳි අකුරු"
        />
      </label>

      <div
        v-if="!options.preserveCurrentConjuncts"
        class="ms-4 flex min-w-0 flex-col gap-3 border-s border-base-300 ps-6"
      >
        <label
          v-for="category in ['common', 'rare']"
          :key="category"
          class="label min-w-0 max-w-full whitespace-normal cursor-pointer justify-start gap-3 p-0"
        >
          <input
            v-model="options.unifiedConjuncts[category]"
            type="checkbox"
            class="toggle toggle-primary toggle-sm"
            @change="emit('change', $event)"
          />
          <OptionLabel
            :message-key="`sinhala.${category}Conjuncts`"
            :sinhala="
              category === 'common' ? 'සුලබ බැඳි අකුරු' : 'දුලබ බැඳි අකුරු'
            "
          />
        </label>
        <label
          v-if="isDirectionReversed"
          class="label min-w-0 max-w-full whitespace-normal cursor-pointer justify-start gap-3 p-0"
        >
          <input
            v-model="options.useTouchingConjuncts"
            type="checkbox"
            class="toggle toggle-primary toggle-sm"
            @change="emit('change', $event)"
          />
          <OptionLabel
            message-key="sinhala.touchingConjuncts"
            sinhala="ස්පර්ශ රූප"
          />
        </label>
      </div>
    </div>

    <label
      class="label min-w-0 max-w-full whitespace-normal cursor-pointer justify-start gap-3 p-0"
    >
      <input
        v-model="options.removePaliHalForms"
        type="checkbox"
        class="toggle toggle-primary toggle-sm"
        @change="emit('change', $event)"
      />
      <OptionLabel
        message-key="sinhala.paliVowels"
        sinhala="හල් කිරීම් ඉවත් කිරීම"
      />
    </label>
  </fieldset>
</template>

<script setup>
import OptionLabel from "@/components/tools/sinhala/OptionLabel.vue";

defineProps({
  options: { type: Object, required: true },
  isDirectionReversed: { type: Boolean, required: true },
  disabled: { type: Boolean, default: false },
});

const emit = defineEmits(["change", "capture-viewport"]);
</script>
