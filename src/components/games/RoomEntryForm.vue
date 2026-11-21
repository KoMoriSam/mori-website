<template>
  <form
    id="game-entry-panel"
    role="tabpanel"
    :aria-labelledby="`game-entry-${mode}`"
    class="flex min-w-0 flex-col gap-3"
    :aria-busy="disabled"
    novalidate
    @submit.prevent="submitForm(mode === 'join')"
  >
    <ProfileForm
      ref="nicknameInput"
      :nickname="nickname"
      :github="github"
      :disabled="disabled"
      :checked="nicknameChecked"
      @update:nickname="emit('update:nickname', $event)"
      @update:github="emit('update:github', $event)"
      @blur="nicknameChecked = true"
      @commit="joinCompletedRoom()"
    >
      <template #action>
        <button
          v-if="mode === 'create'"
          data-entry-submit
          type="submit"
          class="btn btn-primary relative shrink-0"
          :disabled="disabled"
          :aria-busy="loading"
        >
          <span :class="{ invisible: loading }">{{ t("games.create") }}</span>
          <span
            v-if="loading"
            class="absolute inset-0 flex items-center justify-center"
            aria-hidden="true"
          >
            <span class="loading loading-spinner loading-sm"></span>
          </span>
        </button>
      </template>
      <Transition
        leave-active-class="pointer-events-none transition-opacity duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
        @before-leave="emit('before-code-leave', $event)"
        @leave-cancelled="emit('code-leave-cancelled', $event)"
      >
        <fieldset
          v-if="mode === 'join'"
          data-entry-code-reveal
          class="fieldset"
        >
          <label class="label" for="room-code">{{
            t("games.roomCode")
          }}</label>
          <div class="flex flex-wrap items-start gap-3">
            <div class="min-w-0">
              <label
                class="otp validator text-[length:min(1.75rem,8cqi)]"
                :class="{ 'opacity-50': disabled }"
              >
                <span v-for="digit in 8" :key="digit" aria-hidden="true"></span>
                <input
                  type="text"
                  id="room-code"
                  ref="codeInput"
                  :value="code"
                  @input="updateRoomCode"
                  maxlength="8"
                  pattern="[A-HJ-NP-Z2-9]{8}"
                  required
                  inputmode="text"
                  autocapitalize="characters"
                  autocomplete="off"
                  :spellcheck="false"
                  :aria-label="t('games.roomCode')"
                  aria-describedby="room-code-hint"
                  :aria-invalid="codeChecked && !validCode"
                  @blur="codeChecked = true"
                  :disabled="disabled"
                />
              </label>
              <p
                id="room-code-hint"
                class="mt-1 grid text-xs leading-4 text-base-content/50"
                role="status"
              >
                <span
                  class="col-start-1 row-start-1"
                  :class="{ invisible: codeChecked && !validCode }"
                  :aria-hidden="codeChecked && !validCode"
                  >{{ t("games.roomCodeHint") }}</span
                >
                <span
                  class="col-start-1 row-start-1 text-error"
                  :class="{ invisible: !codeChecked || validCode }"
                  :aria-hidden="!codeChecked || validCode"
                  >{{ t("games.errors.ROOM_CODE") }}</span
                >
              </p>
            </div>
            <button
              data-entry-submit
              type="submit"
              class="btn btn-primary relative shrink-0 self-start"
              :disabled="disabled"
              :aria-busy="loading"
            >
              <span :class="{ invisible: loading }">{{ t("games.join") }}</span>
              <span
                v-if="loading"
                class="absolute inset-0 flex items-center justify-center"
                aria-hidden="true"
              >
                <span class="loading loading-spinner loading-sm"></span>
              </span>
            </button>
            <button
              v-if="canReconnect"
              type="button"
              class="btn shrink-0 self-start"
              :disabled="disabled"
              @click="emit('reconnect')"
            >
              <i class="ri-cloud-line" aria-hidden="true"></i>
              {{ t("games.reconnect") }}
            </button>
          </div>
        </fieldset>
      </Transition>
    </ProfileForm>
  </form>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import ProfileForm from "@/components/games/interaction/ProfileForm.vue";
import { useLocale } from "@/i18n";
import { isValidNickname, isValidRoomCode } from "@/utils/games/validation";

const props = defineProps({
  mode: { type: String, required: true },
  nickname: { type: String, default: "" },
  github: Boolean,
  code: { type: String, default: "" },
  disabled: Boolean,
  loading: Boolean,
  canReconnect: Boolean,
});
const emit = defineEmits([
  "update:nickname",
  "update:github",
  "update:code",
  "submit",
  "reconnect",
  "before-code-leave",
  "code-leave-cancelled",
]);

const { t } = useLocale();
const nicknameInput = ref(null);
const codeInput = ref(null);
const nicknameChecked = ref(false);
const codeChecked = ref(false);

const validNickname = computed(() => isValidNickname(props.nickname));
const validCode = computed(() => isValidRoomCode(props.code));

watch(
  () => props.mode,
  () => {
    nicknameChecked.value = false;
    codeChecked.value = false;
  },
  { flush: "sync" },
);

function updateRoomCode(event) {
  if (props.disabled) return;
  const nextCode = event.target.value.toUpperCase().replace(/\s/g, "");
  emit("update:code", nextCode);
  if (nextCode.length === 8) codeChecked.value = true;
  joinCompletedRoom(nextCode);
}

function joinCompletedRoom(currentCode = props.code) {
  if (props.mode === "join" && isValidRoomCode(currentCode))
    submitForm(true, currentCode);
}

function submitForm(join, currentCode = props.code) {
  if (props.disabled) return;
  nicknameChecked.value = true;
  if (join) codeChecked.value = true;
  if (!validNickname.value) {
    nicknameInput.value?.focus();
    return;
  }
  if (join && !isValidRoomCode(currentCode)) {
    codeInput.value?.focus();
    return;
  }
  emit("submit", join);
}
</script>
