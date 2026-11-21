import { computed, h, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import ProfileForm from "@/components/games/interaction/ProfileForm.vue";
import { useMoriAuth } from "@/composables/auth/useMoriAuth";
import { useModal } from "@/composables/useModal";
import { useLocale } from "@/i18n";
import {
  isValidNickname,
  MAX_GITHUB_NICKNAME_LENGTH,
  NICKNAME_STORAGE_KEY,
  PROFILE_SOURCE_STORAGE_KEY,
} from "@/utils/games/validation";

export function useRoomProfile({
  room,
  selfPlayer,
  canAct,
  error,
  errorText,
  storageAvailable,
  run,
}) {
  const { t } = useLocale();
  const modal = useModal();
  const auth = useMoriAuth();

  const nickname = ref("");
  const useGithubProfile = ref(!!auth.profile.value);
  let customChoice = false;
  let profileSyncPending = false;
  let profileSyncing = false;
  let profileSaving = false;
  let profileEditor = null;

  const selectedProfile = computed(() => ({
    profileSource:
      useGithubProfile.value && auth.profile.value ? "github" : "guest",
    avatarUrl: useGithubProfile.value
      ? auth.profile.value?.avatarUrl || null
      : null,
  }));

  function chooseProfile(value) {
    customChoice = !value;
    useGithubProfile.value = value;
    if (value && !nickname.value) nickname.value = auth.profile.value?.name ?? "";
    try {
      localStorage.setItem(
        PROFILE_SOURCE_STORAGE_KEY,
        value ? "github" : "guest",
      );
    } catch {
      /* Keep the choice for this page. */
    }
  }

  function fallbackNickname() {
    const others =
      room.value?.players
        .filter((p) => p.id !== room.value.selfId)
        .map((p) => p.nickname.toLocaleLowerCase()) || [];
    const custom = nickname.value.trim();
    const base = isValidNickname(custom) ? custom : t("auth.guest");
    let name = base;
    for (let n = 1; others.includes(name.toLocaleLowerCase()); n++)
      name = base.slice(0, 20) + " " + n;
    return name;
  }

  function closeProfileEditor() {
    profileEditor?.close();
    profileEditor = null;
  }

  async function syncProfile() {
    if (
      !profileSyncPending ||
      profileSyncing ||
      profileSaving ||
      room.value?.status !== "lobby" ||
      !canAct.value
    )
      return;
    profileSyncing = true;
    profileSyncPending = false;
    for (
      let attempt = 0;
      attempt < 3 && room.value?.status === "lobby" && canAct.value;
      attempt++
    ) {
      const name = useGithubProfile.value ? nickname.value : fallbackNickname();
      const profile = selectedProfile.value;
      if (
        selfPlayer.value?.nickname === name &&
        (selfPlayer.value?.avatarUrl ?? null) === profile.avatarUrl &&
        (selfPlayer.value?.profileSource ?? "guest") === profile.profileSource
      )
        break;
      const saved = await run("profile", { nickname: name, profile });
      if (saved || error.value !== "STALE") break;
      await nextTick();
    }
    profileSyncing = false;
    if (profileSyncPending) void syncProfile();
  }

  function editProfile() {
    if (room.value?.status !== "lobby" || !canAct.value || profileEditor) return;
    const roomCode = room.value.code;
    const draftNickname = ref(selfPlayer.value?.nickname ?? nickname.value);
    const draftGithub = ref(
      selfPlayer.value?.profileSource === "github" && !!auth.profile.value,
    );
    const checked = ref(false);
    const saving = ref(false);
    const failure = ref("");
    const form = ref(null);
    const editor = {
      setup() {
        watch(auth.profile, (profile) => {
          if (!profile) draftGithub.value = false;
        });
        return () =>
          h("div", [
            h(ProfileForm, {
              ref: form,
              nickname: draftNickname.value,
              github: draftGithub.value,
              disabled: saving.value || !canAct.value,
              checked: checked.value,
              "onUpdate:nickname": (value) => {
                draftNickname.value = value;
                failure.value = "";
              },
              "onUpdate:github": (value) => {
                draftGithub.value = value;
                failure.value = "";
              },
              onBlur: () => {
                checked.value = true;
              },
            }),
            failure.value
              ? h(
                  "p",
                  { class: "mt-3 text-sm text-error", role: "alert" },
                  failure.value,
                )
              : null,
          ]);
      },
    };
    const handle = modal.confirm(t("auth.editProfile"), h(editor), {
      buttonText: t("auth.saveProfile"),
      cancelText: t("common.modal.cancel"),
      onCancel: () => {
        profileEditor = null;
      },
      onSubmit: () => {
        if (
          saving.value ||
          !canAct.value ||
          room.value?.code !== roomCode ||
          room.value.status !== "lobby"
        )
          return false;
        checked.value = true;
        const githubProfile = draftGithub.value ? auth.profile.value : null;
        const name = draftNickname.value;
        if (!isValidNickname(name)) {
          form.value?.focus();
          return false;
        }
        const profile = {
          profileSource: githubProfile ? "github" : "guest",
          avatarUrl: githubProfile?.avatarUrl || null,
        };
        saving.value = true;
        profileSaving = true;
        failure.value = "";
        void run("profile", { nickname: name, profile })
          .then((saved) => {
            if (saved && room.value?.code === roomCode) {
              nickname.value = draftNickname.value;
              chooseProfile(
                !!githubProfile && auth.profile.value === githubProfile,
              );
              if (profileEditor === handle) profileEditor = null;
              handle.close();
            } else if (!saved) failure.value = errorText.value;
          })
          .finally(() => {
            saving.value = false;
            profileSaving = false;
            void syncProfile();
          });
        // useModal 的确认回调同步判断返回值；异步保存成功后再关闭。
        return false;
      },
    });
    profileEditor = handle;
  }

  onMounted(() => {
    try {
      customChoice =
        localStorage.getItem(PROFILE_SOURCE_STORAGE_KEY) === "guest";
      useGithubProfile.value = !!auth.profile.value && !customChoice;
      const saved = localStorage.getItem(NICKNAME_STORAGE_KEY);
      if (saved !== null && saved.length <= MAX_GITHUB_NICKNAME_LENGTH)
        nickname.value = saved;
    } catch {
      storageAvailable.value = false;
    }
    if (!nickname.value && useGithubProfile.value)
      nickname.value = auth.profile.value?.name ?? "";
  });

  onBeforeUnmount(closeProfileEditor);

  watch([() => room.value?.code, () => room.value?.status], closeProfileEditor);

  watch(nickname, (value) => {
    try {
      localStorage.setItem(NICKNAME_STORAGE_KEY, value);
    } catch {
      storageAvailable.value = false;
    }
  });

  watch(
    () => auth.profile.value,
    (profile, previous) => {
      useGithubProfile.value = !!profile && !customChoice;
      if (profile && !customChoice && !nickname.value)
        nickname.value = profile.name;
      if (profile || previous) {
        profileSyncPending = true;
        void syncProfile();
      }
    },
  );

  watch(
    () => selfPlayer.value?.nickname,
    (value) => {
      if (typeof value === "string") nickname.value = value;
    },
  );

  watch(
    [
      canAct,
      () => room.value?.status,
      () => auth.state.authenticated,
      () => auth.state.checking,
    ],
    () => {
      if (
        !profileSyncing &&
        room.value?.status === "lobby" &&
        selfPlayer.value?.profileSource === "github" &&
        !auth.state.authenticated &&
        !auth.state.checking
      ) {
        useGithubProfile.value = false;
        profileSyncPending = true;
      }
      void syncProfile();
    },
    { flush: "post" },
  );

  watch(
    () => room.value?.code,
    () => {
      useGithubProfile.value = !!auth.profile.value && !customChoice;
      if (room.value) {
        profileSyncPending = true;
        void syncProfile();
      }
    },
  );

  return {
    auth,
    nickname,
    useGithubProfile,
    selectedProfile,
    chooseProfile,
    editProfile,
  };
}
