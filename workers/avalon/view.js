import {
  QUEST_TEAMS,
  LANCELOTS,
  roleAlignment,
  questChoices,
  canLieAboutLoyalty,
} from "../../shared/games/avalon/index.js";
import { nightInformation } from "../../shared/games/avalon/knowledge.js";

const EMPTY_NIGHT_INFO = {
  knownEvil: [],
  knownCandidates: [],
  knownRoles: {},
  knownLoyalties: {},
};

export function view(state, _players, playerId) {
  const role = state.roles[playerId];
  const side = state.allegiances[playerId];
  const roleRevealed =
    !["opening", "night"].includes(state.phase) ||
    (state.phase === "night" && Object.hasOwn(state.roleRevealed, playerId));
  const openingLeaderId = state.openingLeaderId;
  const { knownEvil, knownCandidates, knownRoles, knownLoyalties } =
    roleRevealed
      ? (state.nightInformation?.[playerId] ??
        nightInformation(
          state.roles,
          playerId,
          openingLeaderId,
          state.lancelotMode,
        ))
      : EMPTY_NIGHT_INFO;

  const publicRoles = state.revealerRevealed
    ? Object.fromEntries(
        state.participants
          .filter((p) => state.roles[p.id] === "revealer")
          .map((p) => [p.id, "revealer"]),
      )
    : {};
  if (state.recruitedId)
    publicRoles[state.recruitedId] = "untrustworthy_servant";

  const phaseSubmissions = {
    opening: state.openingConfirmed,
    night: state.nightConfirmed,
    vote: state.ballots,
    quest: state.questCards,
  };
  const submissionStatus = Object.hasOwn(phaseSubmissions, state.phase)
    ? Object.fromEntries(
        (state.phase === "quest"
          ? state.team
          : state.participants.map((player) => player.id)
        ).map((id) => [id, Object.hasOwn(phaseSubmissions[state.phase], id)]),
      )
    : null;

  return {
    phase: state.phase,
    submissionStatus,
    participants: state.participants,
    self: {
      openingConfirmed: Object.hasOwn(state.openingConfirmed, playerId),
      initialAlignment: roleRevealed ? roleAlignment(role) : null,
      lancelotDraws:
        roleRevealed && LANCELOTS.includes(role) ? state.lancelotDraws : [],
      loyaltyObservations: roleRevealed
        ? (state.loyaltyObservations[playerId] ?? [])
        : [],
      loyaltyRequest:
        roleRevealed && state.loyaltyCheck?.targetId === playerId
          ? {
              id: state.loyaltyCheck.id,
              source: state.loyaltyCheck.source,
              choices: canLieAboutLoyalty(role) ? ["good", "evil"] : [side],
            }
          : null,
      loyaltyPending: Boolean(
        roleRevealed &&
          state.loyaltyCheck &&
          [state.loyaltyCheck.targetId, state.loyaltyCheck.observerId].includes(
            playerId,
          ),
      ),
      merlinHasDecoy:
        roleRevealed &&
        role === "merlin" &&
        Object.values(state.roles).includes("untrustworthy_servant"),
      recruited: state.recruitedId === playerId,
      role: roleRevealed ? role : null,
      alignment: roleRevealed ? side : null,
      lancelotMode: state.lancelotMode,
      won: state.result?.winner ? side === state.result.winner : null,
      roleRevealed,
      nightConfirmed: Object.hasOwn(state.nightConfirmed, playerId),
      knownEvil,
      knownCandidates,
      knownRoles,
      knownLoyalties,
      questChoices: roleRevealed
        ? questChoices(role, state.questIndex, side)
        : [],
      voted: Object.hasOwn(state.ballots, playerId),
      autoApproved:
        state.phase === "vote" &&
        state.participants[state.leaderIndex].id === playerId &&
        state.ballots[playerId] === true,
      questSubmitted: Object.hasOwn(state.questCards, playerId),
    },
    lancelotMode: state.lancelotMode,
    openingLeaderId,
    openingCount: Object.keys(state.openingConfirmed).length,
    lady: state.lady
      ? {
          holderId: state.lady.holderId,
          usedBy: state.lady.usedBy,
          targetId:
            state.phase === "lady"
              ? (state.loyaltyCheck?.targetId ?? null)
              : null,
        }
      : null,
    recruitedId: state.recruitedId ?? null,
    assassinationActorId: state.recruitedId ?? null,
    alignmentCounts: state.participants.reduce(
      (counts, p) => {
        counts[state.allegiances[p.id]]++;
        return counts;
      },
      { good: 0, evil: 0 },
    ),
    publicRoles,
    nightCount: Object.keys(state.nightConfirmed).length,
    ...(state.phase === "finished"
      ? {
          revealedRoles: state.roles,
          revealedAllegiances: Object.fromEntries(
            state.participants.map((p) => [p.id, state.allegiances[p.id]]),
          ),
        }
      : {}),
    leaderId: ["opening", "night"].includes(state.phase)
      ? openingLeaderId
      : state.participants[state.leaderIndex].id,
    questIndex: state.questIndex,
    team: state.team,
    teamSizes: QUEST_TEAMS[state.participants.length],
    twoFails: state.participants.length >= 7 && state.questIndex === 3,
    voteCount: Object.keys(state.ballots).length,
    questCount: Object.keys(state.questCards).length,
    quests: state.quests,
    rejected: state.rejected,
    history: state.history,
    result: state.result,
    discussion: ["discussion", "evil_discussion"].includes(state.phase)
      ? (state.discussion ?? null)
      : null,
  };
}
