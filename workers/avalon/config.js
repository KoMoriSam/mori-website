import { ensure } from "../games/utils.js";
import {
  SPECIAL_ROLES,
  DEFAULT_SPECIAL_ROLES,
  LANCELOTS,
  LANCELOT_MODES,
  roleRoster,
  roleDependenciesValid,
} from "../../shared/games/avalon/index.js";
import { findPhrase } from "../../shared/games/avalon/phrases.js";
import { canDiscuss } from "../../shared/games/avalon/discussion.js";

const CONFIG_KEYS = ["specialRoles", "lancelotMode", "ladyOfTheLake"];

export function normalizeConfig(
  config = { specialRoles: DEFAULT_SPECIAL_ROLES },
) {
  ensure(
    config &&
      typeof config === "object" &&
      !Array.isArray(config) &&
      Object.keys(config).every((key) => CONFIG_KEYS.includes(key)),
    "ROLE_CONFIG",
  );
  ensure(
    config.ladyOfTheLake === undefined ||
      typeof config.ladyOfTheLake === "boolean",
    "ROLE_CONFIG",
  );
  ensure(
    Array.isArray(config.specialRoles) &&
      config.specialRoles.every((role) => SPECIAL_ROLES.includes(role)) &&
      new Set(config.specialRoles).size === config.specialRoles.length,
    "ROLE_CONFIG",
  );
  ensure(roleDependenciesValid(config.specialRoles), "ROLE_PAIR");
  const mode = config.lancelotMode ?? "fixed";
  ensure(LANCELOT_MODES.includes(mode), "LANCELOT_MODE");
  ensure(
    mode === "fixed" ||
      LANCELOTS.every((role) => config.specialRoles.includes(role)),
    "ROLE_PAIR",
  );
  return {
    specialRoles: SPECIAL_ROLES.filter((role) =>
      config.specialRoles.includes(role),
    ),
    ...(mode === "switching" ? { lancelotMode: mode } : {}),
    ...(config.ladyOfTheLake ? { ladyOfTheLake: true } : {}),
  };
}

export function roleList(count, config) {
  const { specialRoles } = normalizeConfig(config);
  const roster = roleRoster(count, specialRoles);
  ensure(roster.valid, "ROLE_CAPACITY");
  return roster.roles;
}

export function validatePhrase(
  action,
  state,
  players,
  config,
  playerId,
  now = Date.now(),
) {
  ensure(!["opening", "night"].includes(state.phase), "CHAT_PHASE");
  ensure(
    !["discussion", "evil_discussion"].includes(state.phase) ||
      (canDiscuss(state, playerId) && now < state.discussion.endsAt),
    "DISCUSSION_SPEAKER",
  );
  const phrase = findPhrase(action.phraseId);
  ensure(phrase, "CHAT_PHRASE");
  const params = {};
  if (phrase.player) {
    const target = players.find((player) => player.id === action.targetId);
    ensure(target, "CHAT_TARGET");
    params.name = target.nickname;
  }
  if (phrase.role) {
    ensure(
      roleList(state.participants.length, config).includes(action.role),
      "CHAT_ROLE",
    );
    params.role = action.role;
  }
  if (phrase.quest) {
    ensure(
      Number.isInteger(action.quest) &&
        action.quest >= 1 &&
        action.quest <= state.questIndex + 1 &&
        action.quest <= 5,
      "CHAT_QUEST",
    );
    params.quest = action.quest;
  }
  return { phraseId: phrase.id, params };
}
