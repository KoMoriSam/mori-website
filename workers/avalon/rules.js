import { normalizeConfig, roleList, validatePhrase } from "./config.js";
import { create, apply, tick, deadline, abort } from "./engine.js";
import { view } from "./view.js";

export {
  GOOD_COUNTS,
  SPECIAL_ROLES,
  QUEST_TEAMS,
  isEvil,
} from "../../shared/games/avalon/index.js";
export { normalizeConfig, roleList } from "./config.js";

export const avalon = {
  id: "avalon",
  minPlayers: 5,
  maxPlayers: 10,
  normalizeConfig,
  validateConfig: roleList,
  create,
  apply,
  view,
  tick,
  deadline,
  phrase: validatePhrase,
  abort,
};
