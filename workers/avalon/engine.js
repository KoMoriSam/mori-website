import { ensure, GameError, randomInt } from "../games/utils.js";
import {
  QUEST_TEAMS,
  LANCELOTS,
  roleAlignment,
  roleRoster,
  questChoices,
  canLieAboutLoyalty,
  ladyTargetIds,
} from "../../shared/games/avalon/index.js";
import { nightInformation } from "../../shared/games/avalon/knowledge.js";
import {
  SLOW_SECONDS_PER_PLAYER,
  FAST_INVITE_SECONDS,
  FAST_DIALOGUE_SECONDS,
  ASSASSINATION_DISCUSSION_SECONDS,
} from "../../shared/games/avalon/discussion.js";
import { normalizeConfig } from "./config.js";

function shuffle(items, rng) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = rng(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function finish(state, winner, reason, targetId = null) {
  state.phase = "finished";
  state.result = { winner, reason, targetId };
}

function record(state, entry, now = Date.now()) {
  state.history.push({ quest: state.questIndex, at: now, ...entry });
}

function startDiscussion(state, now) {
  const index = state.discussionCount ?? 0;
  const mode = index % 2 === 0 ? "slow" : "fast";
  const seconds =
    mode === "slow"
      ? state.participants.length * SLOW_SECONDS_PER_PLAYER
      : FAST_INVITE_SECONDS;
  state.phase = "discussion";
  state.discussionCount = index + 1;
  state.discussion = {
    mode,
    startedAt: now,
    endsAt: now + seconds * 1000,
    partnerId: null,
  };
}

function startAssassinationDiscussion(state, now) {
  state.phase = "evil_discussion";
  state.discussion = {
    mode: "evil",
    startedAt: now,
    endsAt: now + ASSASSINATION_DISCUSSION_SECONDS * 1000,
    partnerId: null,
  };
  record(state, { type: "begin_evil_discussion" }, now);
}

function beginAssassination(state, now) {
  if (
    Object.values(state.roles).includes("untrustworthy_servant") &&
    !state.recruitmentAttempted
  ) {
    state.phase = "recruit";
    record(state, { type: "begin_recruit" }, now);
    return;
  }
  state.phase = "assassinate";
  record(state, { type: "begin_assassinate" }, now);
}

function invitePartner(state, partnerId, now) {
  state.discussion = {
    ...state.discussion,
    partnerId,
    startedAt: now,
    endsAt: now + FAST_DIALOGUE_SECONDS * 1000,
  };
  record(
    state,
    {
      type: "dialogue",
      leaderId: state.participants[state.leaderIndex].id,
      targetId: partnerId,
    },
    now,
  );
}

function nextLeader(state) {
  state.leaderIndex = (state.leaderIndex + 1) % state.participants.length;
}

function beginQuest(state, now) {
  if (
    state.lancelotMode !== "switching" ||
    state.questIndex < 2 ||
    state.questIndex > 4
  )
    return;
  if (state.lancelotDraws.some((draw) => draw.quest === state.questIndex))
    return;
  const switched = state.lancelotDeck.shift();
  if (switched) {
    state.lancelotSwitched = !state.lancelotSwitched;
    for (const player of state.participants) {
      if (LANCELOTS.includes(state.roles[player.id]))
        state.allegiances[player.id] = roleAlignment(
          state.roles[player.id],
          state.lancelotSwitched,
        );
    }
  }
  state.lancelotDraws.push({ quest: state.questIndex, at: now, switched });
}

function beginNight(state) {
  state.phase = "night";
  state.nightInformation = Object.fromEntries(
    state.participants.map((p) => [
      p.id,
      nightInformation(
        state.roles,
        p.id,
        state.openingLeaderId,
        state.lancelotMode,
      ),
    ]),
  );
  const cleric = state.participants.find((p) => state.roles[p.id] === "cleric");
  if (cleric && cleric.id !== state.openingLeaderId) {
    state.nightInformation[cleric.id].knownLoyalties = {};
    state.loyaltyCheck = {
      id: crypto.randomUUID(),
      source: "cleric",
      observerId: cleric.id,
      targetId: state.openingLeaderId,
      quest: 0,
    };
  }
}

function resumeAfterQuest(state, now) {
  state.questIndex++;
  nextLeader(state);
  state.team = [];
  beginQuest(state, now);
  startDiscussion(state, now);
}

function beginLady(state, now) {
  state.phase = "lady";
  state.team = [];
  state.loyaltyCheck = null;
  record(state, { type: "begin_lady", playerId: state.lady.holderId }, now);
}

export function create(players, rng = randomInt, config) {
  const count = players.length;
  const normalized = normalizeConfig(config);
  const roster = roleRoster(count, normalized.specialRoles);
  ensure(roster.valid, "ROLE_CAPACITY");
  const roles = shuffle(roster.roles, rng);
  const leaderIndex = rng(count);
  const lancelotMode = normalized.lancelotMode ?? "fixed";
  const lancelotDeck =
    lancelotMode === "switching"
      ? shuffle([false, false, false, true, true], rng)
      : [];
  return {
    phase: "opening",
    participants: players,
    roles: Object.fromEntries(players.map((p, i) => [p.id, roles[i]])),
    allegiances: Object.fromEntries(
      players.map((p, i) => [p.id, roleAlignment(roles[i])]),
    ),
    lancelotMode,
    lancelotDeck,
    lancelotSwitched: false,
    lancelotDraws: [],
    openingConfirmed: {},
    nightInformation: null,
    loyaltyCheck: null,
    loyaltyObservations: {},
    lady: normalized.ladyOfTheLake
      ? { holderId: players[(leaderIndex + count - 1) % count].id, usedBy: [] }
      : null,
    roleRevealed: {},
    nightConfirmed: {},
    questIndex: 0,
    leaderIndex,
    openingLeaderId: players[leaderIndex].id,
    team: [],
    ballots: {},
    questCards: {},
    quests: [],
    rejected: 0,
    history: [],
    result: null,
    discussionCount: 0,
    discussion: null,
  };
}

export function tick(source, _players, now = Date.now()) {
  if (!["discussion", "evil_discussion"].includes(source.phase)) return null;
  if (source.discussion && now < source.discussion.endsAt) return null;
  const state = structuredClone(source);
  if (state.phase === "evil_discussion")
    beginAssassination(state, state.discussion.endsAt);
  else if (!state.discussion) startDiscussion(state, now);
  else if (state.discussion.mode === "fast" && !state.discussion.partnerId) {
    invitePartner(
      state,
      state.participants[(state.leaderIndex + 1) % state.participants.length]
        .id,
      state.discussion.endsAt,
    );
    if (now >= state.discussion.endsAt) {
      state.phase = "team";
      record(
        state,
        {
          type: "begin_team",
          leaderId: state.participants[state.leaderIndex].id,
        },
        state.discussion.endsAt,
      );
    }
  } else {
    state.phase = "team";
    record(
      state,
      {
        type: "begin_team",
        leaderId: state.participants[state.leaderIndex].id,
      },
      state.discussion.endsAt,
    );
  }
  return { state, stageChanged: true, finished: false };
}

export function apply(source, players, playerId, action, now = Date.now()) {
  const state = structuredClone(source);
  const count = state.participants.length;
  const phase = state.phase;
  const questIndex = state.questIndex;
  switch (action.type) {
    case "confirm_opening":
      ensure(state.phase === "opening", "PHASE");
      ensure(
        !Object.hasOwn(state.openingConfirmed, playerId),
        "ALREADY_SUBMITTED",
        409,
      );
      state.openingConfirmed[playerId] = true;
      if (Object.keys(state.openingConfirmed).length === count)
        beginNight(state);
      break;
    case "lady":
      ensure(state.phase === "lady" && !state.loyaltyCheck, "PHASE");
      ensure(state.lady?.holderId === playerId, "LADY_ONLY", 403);
      ensure(
        ladyTargetIds(state.participants, state.lady).includes(action.targetId),
        "LADY_TARGET",
      );
      state.loyaltyCheck = {
        id: crypto.randomUUID(),
        source: "lady",
        observerId: playerId,
        targetId: action.targetId,
        quest: state.questIndex,
      };
      record(state, { type: "lady", playerId, targetId: action.targetId }, now);
      break;
    case "report_loyalty": {
      const check = state.loyaltyCheck;
      ensure(check && ["night", "lady"].includes(state.phase), "PHASE");
      ensure(check.targetId === playerId, "LOYALTY_TARGET_ONLY", 403);
      ensure(action.checkId === check.id, "LOYALTY_CHANGED", 409);
      ensure(
        state.phase !== "night" || Object.hasOwn(state.roleRevealed, playerId),
        "PHASE",
      );
      ensure(["good", "evil"].includes(action.alignment), "LOYALTY_CARD");
      ensure(
        canLieAboutLoyalty(state.roles[playerId]) ||
          action.alignment === state.allegiances[playerId],
        "LOYALTY_TRUTH",
        403,
      );
      const observation = { ...check, alignment: action.alignment, at: now };
      (state.loyaltyObservations[check.observerId] ??= []).push(observation);
      if (check.source === "cleric")
        state.nightInformation[check.observerId].knownLoyalties[
          check.targetId
        ] = action.alignment;
      else {
        state.lady.usedBy.push(check.observerId);
        state.lady.holderId = check.targetId;
      }
      state.loyaltyCheck = null;
      if (check.source === "lady") resumeAfterQuest(state, now);
      break;
    }
    case "peek_role":
      ensure(state.phase === "night", "PHASE");
      ensure(
        !Object.hasOwn(state.roleRevealed, playerId),
        "ALREADY_SUBMITTED",
        409,
      );
      state.roleRevealed[playerId] = true;
      break;
    case "confirm_role":
      ensure(
        state.phase === "night" && Object.hasOwn(state.roleRevealed, playerId),
        "PHASE",
      );
      ensure(
        !state.loyaltyCheck ||
          ![
            state.loyaltyCheck.targetId,
            state.loyaltyCheck.observerId,
          ].includes(playerId),
        "LOYALTY_PENDING",
      );
      ensure(
        !Object.hasOwn(state.nightConfirmed, playerId),
        "ALREADY_SUBMITTED",
        409,
      );
      state.nightConfirmed[playerId] = true;
      if (Object.keys(state.nightConfirmed).length === count) {
        beginQuest(state, now);
        startDiscussion(state, now);
      }
      break;
    case "begin_team":
      ensure(state.phase === "discussion", "PHASE");
      ensure(
        state.participants[state.leaderIndex].id === playerId,
        "LEADER_ONLY",
        403,
      );
      ensure(
        !state.discussion || now < state.discussion.endsAt,
        "DISCUSSION_CLOSED",
      );
      state.phase = "team";
      record(state, { type: "begin_team", leaderId: playerId }, now);
      break;
    case "discussion_partner":
      ensure(
        state.phase === "discussion" &&
          state.discussion?.mode === "fast" &&
          !state.discussion.partnerId,
        "PHASE",
      );
      ensure(
        state.participants[state.leaderIndex].id === playerId,
        "LEADER_ONLY",
        403,
      );
      ensure(now < state.discussion.endsAt, "DISCUSSION_CLOSED");
      ensure(
        action.targetId !== playerId &&
          state.participants.some((player) => player.id === action.targetId),
        "DIALOGUE_TARGET",
      );
      invitePartner(state, action.targetId, now);
      break;
    case "end_assassination_discussion":
      ensure(state.phase === "evil_discussion", "PHASE");
      ensure(
        state.allegiances[playerId] === "evil" &&
          state.roles[playerId] !== "oberon",
        "EVIL_ONLY",
        403,
      );
      ensure(now < state.discussion.endsAt, "DISCUSSION_CLOSED");
      beginAssassination(state, now);
      break;
    case "team":
      ensure(state.phase === "team", "PHASE");
      ensure(
        state.participants[state.leaderIndex].id === playerId,
        "LEADER_ONLY",
        403,
      );
      ensure(
        Array.isArray(action.team) &&
          action.team.length === QUEST_TEAMS[count][state.questIndex] &&
          new Set(action.team).size === action.team.length &&
          action.team.every((id) => players.some((p) => p.id === id)),
        "TEAM",
      );
      state.team = [...action.team];
      state.ballots = { [playerId]: true };
      state.phase = "vote";
      record(
        state,
        {
          type: "team",
          leaderId: playerId,
          team: [...state.team],
        },
        now,
      );
      break;
    case "vote": {
      ensure(
        state.phase === "vote" && typeof action.approve === "boolean",
        "PHASE",
      );
      ensure(!Object.hasOwn(state.ballots, playerId), "ALREADY_SUBMITTED", 409);
      state.ballots[playerId] = action.approve;
      if (Object.keys(state.ballots).length === count) {
        const approved =
          Object.values(state.ballots).filter(Boolean).length > count / 2;
        record(
          state,
          {
            type: "vote",
            leaderId: state.participants[state.leaderIndex].id,
            team: [...state.team],
            votes: state.participants.map((p) => ({
              playerId: p.id,
              approve: state.ballots[p.id],
            })),
            approved,
          },
          now,
        );
        if (approved) {
          state.phase = "quest";
          state.questCards = {};
          state.rejected = 0;
        } else if (++state.rejected === 5) finish(state, "evil", "rejections");
        else {
          nextLeader(state);
          startDiscussion(state, now);
          state.team = [];
        }
        state.ballots = {};
      }
      break;
    }
    case "quest": {
      ensure(
        state.phase === "quest" && typeof action.success === "boolean",
        "PHASE",
      );
      ensure(state.team.includes(playerId), "TEAM_ONLY", 403);
      ensure(
        !Object.hasOwn(state.questCards, playerId),
        "ALREADY_SUBMITTED",
        409,
      );
      const role = state.roles[playerId];
      const side = state.allegiances[playerId];
      ensure(action.success || side === "evil", "GOOD_CANNOT_FAIL", 403);
      ensure(
        questChoices(role, state.questIndex, side).includes(action.success),
        role === "lunatic" ? "LUNATIC_MUST_FAIL" : "BRUTE_CANNOT_FAIL",
        403,
      );
      state.questCards[playerId] = action.success;
      if (Object.keys(state.questCards).length === state.team.length) {
        const failures = Object.values(state.questCards).filter(
          (value) => !value,
        ).length;
        const threshold = count >= 7 && state.questIndex === 3 ? 2 : 1;
        const result = {
          type: "quest",
          quest: state.questIndex,
          team: [...state.team],
          failures,
          success: failures < threshold,
        };
        state.quests.push(result);
        record(state, result, now);
        state.questCards = {};
        const successes = state.quests.filter((q) => q.success).length;
        if (state.quests.length - successes >= 2 && !state.revealerRevealed) {
          const revealer = state.participants.find(
            (p) => state.roles[p.id] === "revealer",
          );
          if (revealer) {
            state.revealerRevealed = true;
            record(
              state,
              { type: "reveal_role", playerId: revealer.id, role: "revealer" },
              now,
            );
          }
        }
        if (state.quests.length - successes === 3)
          finish(state, "evil", "quests");
        else if (successes === 3) startAssassinationDiscussion(state, now);
        else if (state.lady && [1, 2, 3].includes(state.questIndex))
          beginLady(state, now);
        else resumeAfterQuest(state, now);
      }
      break;
    }
    case "recruit": {
      ensure(state.phase === "recruit", "PHASE");
      ensure(state.roles[playerId] === "assassin", "ASSASSIN_ONLY", 403);
      ensure(
        Object.hasOwn(state.roles, action.targetId) &&
          action.targetId !== playerId,
        "TARGET",
      );
      state.recruitmentAttempted = true;
      const success = state.roles[action.targetId] === "untrustworthy_servant";
      if (success) {
        state.recruitedId = action.targetId;
        state.allegiances[action.targetId] = "evil";
      }
      record(
        state,
        { type: "recruit", playerId, targetId: action.targetId, success },
        now,
      );
      beginAssassination(state, now);
      break;
    }
    case "assassinate": {
      ensure(state.phase === "assassinate", "PHASE");
      ensure(
        state.recruitedId
          ? state.recruitedId === playerId
          : state.roles[playerId] === "assassin",
        "ASSASSIN_ONLY",
        403,
      );
      ensure(
        Object.hasOwn(state.roles, action.targetId) &&
          action.targetId !== playerId,
        "TARGET",
      );
      const merlin = state.roles[action.targetId] === "merlin";
      finish(
        state,
        merlin ? "evil" : "good",
        merlin ? "merlin" : "assassination",
        action.targetId,
      );
      record(
        state,
        {
          type: "assassinate",
          playerId,
          targetId: action.targetId,
          winner: state.result.winner,
          reason: state.result.reason,
        },
        now,
      );
      break;
    }
    default:
      throw new GameError("INVALID");
  }
  return {
    state,
    stageChanged:
      action.type === "discussion_partner" ||
      state.phase !== phase ||
      state.questIndex !== questIndex,
    finished: state.phase === "finished",
  };
}

export function deadline(state) {
  return ["discussion", "evil_discussion"].includes(state.phase)
    ? (state.discussion?.endsAt ?? null)
    : null;
}

export function abort(source) {
  const state = structuredClone(source);
  finish(state, null, "aborted");
  record(state, { type: "end" });
  return state;
}
