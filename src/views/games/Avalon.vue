<template>
  <Room game-type="avalon">
    <template #instructions>
      <h2 class="font-serif text-xl font-bold">{{ t("avalon.howTo") }}</h2>
      <ol class="mt-5 space-y-4 text-sm leading-7 text-base-content/70">
        <li>{{ t("avalon.guideInvite") }}</li>
        <li>{{ t("avalon.guideDiscuss") }}</li>
        <li>{{ t("avalon.guideWin") }}</li>
      </ol>
    </template>
    <template #page-actions="{ room }">
      <ReferenceDialog v-if="room.status !== 'lobby'" :room="room" />
    </template>
    <template #settings="{ room, canAct, run }">
      <Settings :room="room" :can-act="canAct" :run="run" />
    </template>
    <template #default="{ room, canAct, run }">
      <RoundTable :room="room" :can-act="canAct" :run="run" />
    </template>
    <template #sidebar="{ room, canAct, run, expandSidebar }">
      <Sidebar
        :room="room"
        :can-act="canAct"
        :run="run"
        @expand="expandSidebar()"
      />
    </template>
  </Room>
</template>

<script setup>
import Room from "@/components/games/Room.vue";
import RoundTable from "@/components/games/avalon/layout/RoundTable.vue";
import Sidebar from "@/components/games/avalon/layout/Sidebar.vue";
import Settings from "@/components/games/avalon/interaction/Settings.vue";
import ReferenceDialog from "@/components/games/avalon/display/ReferenceDialog.vue";
import { provideAvalonLayout } from "@/composables/games/avalon/useAvalonLayout";
import { useLocale } from "@/i18n";

const { t } = useLocale();
provideAvalonLayout();
</script>
