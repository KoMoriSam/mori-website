import { computed, toValue } from "vue";
import { companyArtName } from "@/games/fogport/art-assets";
import { artSource } from "@/composables/games/fogport/useArtAsset";
import {
  MAP_POINTS,
  routePath,
  routeSegments,
  routeMark,
  displayedLinks,
  displayEra,
} from "@/games/fogport/map-layout";
import {
  PLACES,
  LINKS,
  linkKind,
} from "../../../../shared/games/fogport/data.js";
import { tileData } from "../../../../shared/games/fogport/engine.js";
import {
  PLAYER_ICONS,
  PLAYER_TONES,
  PLAYER_TILE_TONES,
  TRANSPORT_ICONS,
  TRANSPORT_TONES,
  placeName,
  routeName,
} from "@/games/fogport/presentation";
import { useLocale } from "@/i18n";

const transform = (x, y, s = 1) => `matrix(${s},0,0,${s},${x},${y})`;

function slotTransform(count, index) {
  if (count <= 2) return transform((index - (count - 1) / 2) * 40, 0);
  const row = index < 2 ? 0 : 1;
  const columns = Math.min(2, count - row * 2);
  return transform(
    (index - row * 2 - (columns - 1) / 2) * 40,
    row === 0 ? -20 : 20,
  );
}

const MAP_PLACES = PLACES.map((place) => {
  const isPort = place.id.startsWith("p");
  const [x, y] = MAP_POINTS[place.id];
  return {
    ...place,
    x,
    y,
    isPort,
    transform: transform(x, y),
    labelTop: !isPort && place.slots.length > 2 ? -65 : -43,
    merchantArt: isPort
      ? `merchant-${String(place.number).padStart(2, "0")}`
      : "",
    merchantY: y > 920 ? -80 : 32,
    slotTransforms: isPort
      ? []
      : place.slots.map((_, index) => slotTransform(place.slots.length, index)),
  };
});

export function useBoardIndex({
  game,
  targets,
  selectedTargets,
  activeMode,
  hoverTarget,
  liquidationOffers,
  routeArt,
}) {
  const { t } = useLocale();

  const playersById = computed(
    () => new Map(toValue(game).players.map((player) => [player.id, player])),
  );
  const builtLinksMap = computed(
    () => new Map(toValue(game).links.map((link) => [link.id, link])),
  );
  const buildingsById = computed(
    () =>
      new Map(toValue(game).buildings.map((building) => [building.id, building])),
  );
  const buildingsBySlot = computed(
    () =>
      new Map(
        toValue(game).buildings.map((building) => [
          `${building.location}:${building.slot}`,
          building,
        ]),
      ),
  );
  const merchantsById = computed(
    () =>
      new Map(toValue(game).merchants.map((merchant) => [merchant.id, merchant])),
  );
  const merchantsByLocation = computed(() => {
    const map = new Map();
    for (const merchant of toValue(game).merchants) {
      let list = map.get(merchant.location);
      if (!list) {
        list = [];
        map.set(merchant.location, list);
      }
      list.push(merchant);
    }
    return map;
  });
  const liquidationOfferBySlot = computed(() => {
    const map = new Map();
    for (const offer of toValue(liquidationOffers)) {
      const tile = buildingsById.value.get(offer.building);
      if (tile) map.set(`${tile.location}:${tile.slot}`, offer);
    }
    return map;
  });

  const targetSet = computed(() => new Set(toValue(targets)));
  const selectedTargetSet = computed(() => new Set(toValue(selectedTargets)));

  function addPlaceFromKey(set, key, includeSlots) {
    if (key.startsWith("place:")) {
      set.add(key.slice(6));
      return;
    }
    if (includeSlots && key.startsWith("slot:")) {
      set.add(key.slice(5, key.indexOf(":", 5)));
      return;
    }
    if (key.startsWith("building:")) {
      const location = buildingsById.value.get(key.slice(9))?.location;
      if (location) set.add(location);
      return;
    }
    if (key.startsWith("merchant:")) {
      const location = merchantsById.value.get(key.slice(9))?.location;
      if (location) set.add(location);
    }
  }

  const activePlaceIds = computed(() => {
    const set = new Set();
    for (const key of targetSet.value) addPlaceFromKey(set, key, true);
    for (const key of selectedTargetSet.value) addPlaceFromKey(set, key, true);
    return set;
  });

  const chosenPlaceIds = computed(() => {
    const set = new Set();
    for (const key of selectedTargetSet.value) addPlaceFromKey(set, key, true);
    return set;
  });

  const hoveredPlaceId = computed(() => {
    const key = toValue(hoverTarget);
    if (!key || key.startsWith("link:")) return null;
    const mode = toValue(activeMode);
    if (mode && !targetSet.value.has(key) && !selectedTargetSet.value.has(key)) {
      return null;
    }
    if (key.startsWith("place:")) return key.slice(6);
    if (key.startsWith("slot:")) {
      const slotLookup = key.slice(5);
      if (
        (mode === "sell" || mode === "liquidate") &&
        buildingsBySlot.value.has(slotLookup)
      ) {
        return null;
      }
      return slotLookup.slice(0, slotLookup.indexOf(":"));
    }
    if (key.startsWith("building:")) {
      if (mode !== "sell" && mode !== "liquidate") return null;
      return buildingsById.value.get(key.slice(9))?.location ?? null;
    }
    if (key.startsWith("merchant:")) {
      return merchantsById.value.get(key.slice(9))?.location ?? null;
    }
    return null;
  });

  const visibleLinks = computed(() =>
    displayedLinks(LINKS, toValue(game).era),
  );

  const visibleKinds = computed(() => {
    const era = toValue(game).era;
    return [
      ...new Set(
        visibleLinks.value.map((link) => linkKind(link, displayEra(link, era))),
      ),
    ];
  });

  const linkItems = computed(() => {
    const currentGame = toValue(game);
    const era = currentGame.era;
    const mode = toValue(activeMode);
    const hasRouteArt = Boolean(toValue(routeArt));
    const legalKeys = targetSet.value;
    const chosenKeys = selectedTargetSet.value;
    const builtMap = builtLinksMap.value;
    const players = playersById.value;

    return visibleLinks.value.map((link) => {
      const key = "link:" + link.id;
      const available = Boolean(link[era]);
      const eraForLink = displayEra(link, era);
      const kind = linkKind(link, eraForLink);
      const built = builtMap.get(link.id) ?? null;
      const owner = built ? players.get(built.owner) : null;
      const ownerSeat = owner?.seat ?? 0;
      const legal = legalKeys.has(key);
      const chosen = chosenKeys.has(key);
      const canInteract = available && (!mode || legal || chosen);

      return {
        id: link.id,
        key,
        available,
        kind,
        transportIcon: TRANSPORT_ICONS[kind],
        toneClass: available ? TRANSPORT_TONES[kind] : "text-base-content/65",
        path: routePath(link, eraForLink),
        mid: routeMark(link, eraForLink),
        segments:
          built && hasRouteArt && kind === "railway"
            ? routeSegments(link, eraForLink)
            : null,
        built,
        ownerCompanyArt: built ? companyArtName(ownerSeat) : "",
        ownerIcon: built ? PLAYER_ICONS[ownerSeat] : "",
        ownerTone: built ? PLAYER_TONES[ownerSeat] : "",
        legal,
        chosen,
        canInteract,
        baseWidth: chosen || legal ? 8 : built ? (hasRouteArt ? 13 : 7) : 5,
        opacity: available
          ? mode && !legal && !chosen
            ? 0.22
            : 1
          : mode
            ? 0.22
            : 0.55,
        label:
          routeName(link, eraForLink, t) +
          (!available ? " · " + t("fogport.visual.railPreview") : "") +
          (built ? " · " + owner?.nickname : ""),
      };
    });
  });

  const placeItems = computed(() => {
    const currentGame = toValue(game);
    const mode = toValue(activeMode);
    const isBuildingMode = mode === "sell" || mode === "liquidate";
    const legalKeys = targetSet.value;
    const chosenKeys = selectedTargetSet.value;
    const activePlaces = activePlaceIds.value;
    const chosenPlaces = chosenPlaceIds.value;
    const players = playersById.value;
    const slotBuildings = buildingsBySlot.value;
    const slotOffers = liquidationOfferBySlot.value;
    const locationMerchants = merchantsByLocation.value;

    return MAP_PLACES.map((place) => {
      const placeKey = "place:" + place.id;
      const name = placeName(place.id, t);
      const active = activePlaces.has(place.id);
      const chosen = chosenPlaces.has(place.id);
      const canInteract =
        !mode || legalKeys.has(placeKey) || chosenKeys.has(placeKey);

      const merchants = place.isPort
        ? (locationMerchants.get(place.id) ?? []).map((merchant, index) => {
            const key = "merchant:" + merchant.id;
            const legal = legalKeys.has(key);
            const isChosen = chosenKeys.has(key);
            return {
              id: merchant.id,
              key,
              buys: merchant.buys,
              beer: merchant.beer,
              legal,
              chosen: isChosen,
              canInteract: !mode || legal || isChosen,
              opacity: mode && !legal && !isChosen ? 0.22 : 1,
              transform: transform(
                (index - (place.slots - 1) / 2) * 60,
                place.merchantY,
              ),
              label: t("fogport.merchantSummary", {
                location: name,
                industries:
                  merchant.buys
                    .map((type) => t(`fogport.industries.${type}`))
                    .join(" / ") || t("fogport.blank"),
                beer: merchant.beer,
              }),
            };
          })
        : [];

      const slots = place.isPort
        ? []
        : place.slots.map((slotTypes, index) => {
            const slotLookupKey = `${place.id}:${index}`;
            const tile = slotBuildings.get(slotLookupKey) ?? null;
            const key =
              isBuildingMode && tile
                ? "building:" + tile.id
                : "slot:" + slotLookupKey;
            const legal = legalKeys.has(key);
            const isChosen = chosenKeys.has(key);
            const offer = slotOffers.get(slotLookupKey) ?? null;
            const meta = tile ? tileData(tile) : null;
            const owner = tile ? players.get(tile.owner) : null;
            const ownerSeat = owner?.seat ?? 0;

            const label = offer
              ? `${name} · ${t("fogport.industries." + meta.type)} ${meta.level} · ${t("fogport.liquidationDetails", offer)}`
              : `${name} ${index + 1}: ${
                  tile
                    ? `${owner?.nickname} · ${t(`fogport.industries.${meta.type}`)} ${meta.level} · ${t(tile.flipped ? "fogport.flipped" : "fogport.unflipped")}`
                    : slotTypes
                        .map((type) => t(`fogport.industries.${type}`))
                        .join(" / ")
                }`;

            return {
              index,
              key,
              dropValue: `slot:${slotLookupKey}`,
              transform: place.slotTransforms[index],
              types: slotTypes,
              building: tile,
              tileType: meta?.type ?? "",
              tileLevel: meta?.level ?? 0,
              ownerTone: tile ? PLAYER_TONES[ownerSeat] : "",
              ownerTileTone: tile
                ? PLAYER_TILE_TONES[ownerSeat]
                : "fill-transparent stroke-base-content/60",
              ownerCompanyArt: tile ? companyArtName(ownerSeat) : "",
              ownerIcon: tile ? PLAYER_ICONS[ownerSeat] : "",
              liquidationOffer: offer,
              legal,
              chosen: isChosen,
              canInteract: !mode || legal || isChosen,
              opacity: mode && !legal && !isChosen ? 0.22 : 1,
              canDrag:
                (!mode || mode === "sell") &&
                Boolean(tile) &&
                tile.owner === currentGame.selfId &&
                !tile.flipped,
              label,
            };
          });

      return {
        id: place.id,
        key: placeKey,
        name,
        isPort: place.isPort,
        transform: place.transform,
        labelTop: place.labelTop,
        active,
        chosen,
        opacity: mode && !active ? 0.35 : 1,
        canInteract,
        merchantArtSrc: place.isPort ? artSource(place.merchantArt) : "",
        merchants,
        slots,
      };
    });
  });

  return {
    playersById,
    builtLinksMap,
    buildingsById,
    buildingsBySlot,
    merchantsById,
    merchantsByLocation,
    liquidationOfferBySlot,
    activePlaceIds,
    chosenPlaceIds,
    hoveredPlaceId,
    visibleKinds,
    linkItems,
    placeItems,
  };
}
