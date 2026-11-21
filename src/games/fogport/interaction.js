import { LINK_BY_ID } from "../../../shared/games/fogport/data.js";
import { placeName, routeName } from "./presentation.js";

export const findBuildingAt = (game, location, slot) =>
  game.buildings.find(
    (building) => building.location === location && building.slot === slot,
  );

export const findBuildingById = (game, id) =>
  game.buildings.find((building) => building.id === id);

export function parseDropTarget(game, activeKind, value) {
  if (!value) return null;
  const [kind, a, b] = value.split(":");
  if (kind === "slot") {
    const slot = Number(b);
    if (activeKind === "sell" || activeKind === "liquidate") {
      const tile = findBuildingAt(game, a, slot);
      return tile ? { kind: "building", id: tile.id } : null;
    }
    return { kind, location: a, slot };
  }
  return { kind, id: a, ...(kind === "link" ? { links: [a] } : {}) };
}

export function buildTargetFilter(baseFilter, target) {
  const filter = { ...baseFilter };
  if (target.kind === "slot") {
    Object.assign(filter, { location: target.location, slot: target.slot });
  } else if (target.kind === "place") {
    filter.location = target.id;
  } else if (target.kind === "link") {
    filter.link = target.id;
  } else if (target.kind === "building") {
    filter.building = target.id;
  } else if (target.kind === "merchant") {
    filter.merchant = target.id;
  }
  return filter;
}

export function formatDropObject(game, kind, command, t) {
  if (kind === "build") {
    return `${placeName(command.location, t)} · ${t("fogport.industries." + command.industry)}`;
  }
  if (kind === "network") {
    return routeName(LINK_BY_ID[command.links.at(-1)], game.era, t);
  }
  if (kind === "develop") {
    return t("fogport.industries." + command.industries.at(-1));
  }
  return placeName(
    findBuildingById(game, command.sales.at(-1).building).location,
    t,
  );
}

export function formatModeHint(mode, activeKind, game, self, t) {
  if (!mode) return "";
  if (activeKind === "liquidate") {
    return t("fogport.liquidationHint", {
      n: Math.max(0, game.settlement.debt - self.money),
    });
  }
  if (mode.adding) return t("fogport.mode.additional." + mode.kind);
  if (mode.building) return t("fogport.mode.merchant");
  if (mode.command) return t("fogport.mode.confirm");
  return t("fogport.mode.select." + mode.kind);
}
