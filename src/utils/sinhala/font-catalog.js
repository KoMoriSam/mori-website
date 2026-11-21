import { getRegisteredCssFontFamilies } from "@/utils/dom/stylesheets";
import { quoteFontFamily } from "@/utils/font-name";

export const SINHALA_UNICODE_FALLBACK_FAMILY =
  'Arial, "Helvetica Neue", "Liberation Sans"';

export const SINHALA_UNICODE_DEVICE_FONT_NAMES = [
  "Nirmala UI",
  "Iskoola Pota",
  "Sinhala Sangam MN",
  "Sinhala MN",
  "Noto Sans Sinhala",
  "Noto Sans Sinhala UI",
  "Noto Serif Sinhala",
  "Abhaya Libre",
  "Gemunu Libre",
  "Maname",
  "LKLUG",
  "Potha",
  "Malithi Web",
  "Bhashitha",
  "DinaminaUniWeb",
];

export const SINHALA_LEGACY_DEVICE_FONT_NAMES = [
  "FM Abhaya",
  "FM Malithi",
  "FM Gemunu",
  "FM Bindumathi",
  "FM Derana",
  "FM Ganganee",
  "FM Emanee",
  "FM Samantha",
  "FM Rajantha",
  "FM Arjunn",
  "FM Basuru",
  "FM Rashmee",
  "FM Sandhyanee",
  "FM Abbaya",
  "FM Aba",
  "FM Bindu",
  "FM Gangani",
  "FM Gemun",
  "FM Saman",
  "FM Ababld",
  "FM Econbld",
  "DL Araliya",
  "DL Manel",
  "DL Lihini",
  "DL Ridhma",
  "DL Sumudu",
  "DL Malathi",
  "DL Thisaru",
  "DL Anurada",
  "DL Anuradha",
  "DL Biso",
  "DL Champika",
  "DL Hansika",
  "DL Harini",
  "DL Kinduru",
  "DL Kusumi",
  "DL Nelumi",
  "DL Nirosha",
  "DL Nisansala",
  "DL Paras",
  "DL Priyanwada",
  "DL Pumi",
  "DL Sarala",
  "FS Araliya",
  "DS Araliya",
  "Kaputa.com",
  "Kaputadotcom",
  "Thibus Sinhala",
  "ThibusStru",
  "Amalee",
  "Tipitaka Sinhala1",
  "SinhManel",
  "SinNelumA",
  "aKandyNew",
  "aKandyNewSupplement",
  "Kandy",
  "Kandy Supplement",
  "Lankadeepa",
  "LankaNatha",
  "Lankapura",
  "Lankadveepa",
  "Lankathilaka",
  "Mahanuwara",
  "Matale",
  "MataraNormal",
  "MataraSupplement",
  "NidahasaHiru",
  "NidahasaChapa",
  "NidahasaMadu",
  "NidahasaSadareka",
  "NidahasaSarasavi",
  "Padma",
  "SinhalaTekTon",
  "Thara",
];

const SINHALA_LEGACY_SERIES = [
  /^fm[\s_-]*/iu,
  /^dl[\s_-]+/iu,
  /^ds[\s_-]+/iu,
  /^fs[\s_-]+/iu,
  /^npw[\s_-]+/iu,
  /^ams[\s_-]*/iu,
  /^sara[\s_-]+/iu,
  /^apex\d/iu,
  /^ridi\d/iu,
  /^tharu[\s_-]*digital/iu,
  /^wije\d/iu,
  /^0kd/iu,
  /^4u[\s_-]+/iu,
  /^am[\s_-]+/iu,
  /^aa[\s_-]+/iu,
  /^thibus/iu,
];

export function normalizeSinhalaFontName(name) {
  return String(name || "")
    .toLocaleLowerCase()
    .replace(/[\s_-]+/g, "")
    .replace(/(?:regular|semilight|semibold|medium|light|bold|variable)$/u, "");
}

export function isFmAbabldFont(family) {
  return /^fmababld$/iu.test(family.replace(/[\s_-]/gu, ""));
}

const sinhalaUnicodeDeviceFontOrder = new Map(
  SINHALA_UNICODE_DEVICE_FONT_NAMES.map((name, index) => [
    normalizeSinhalaFontName(name),
    index,
  ]),
);

const sinhalaLegacyDeviceFontOrder = new Map(
  SINHALA_LEGACY_DEVICE_FONT_NAMES.map((name, index) => [
    normalizeSinhalaFontName(name),
    index,
  ]),
);

function normalizeLegacyFamilyKey(name) {
  const key = normalizeSinhalaFontName(name);
  return key.startsWith("fm") ? key.replace(/x$/u, "") : key;
}

export function sinhalaUnicodeFontPriority(font) {
  let isUnSeries = false;
  for (const name of [font.family, font.fullName, font.postscriptName]) {
    const priority = sinhalaUnicodeDeviceFontOrder.get(
      normalizeSinhalaFontName(name),
    );
    if (priority !== undefined) return priority;
    if (/^UN[-_\s]+/iu.test(name || "")) isUnSeries = true;
  }
  return isUnSeries ? SINHALA_UNICODE_DEVICE_FONT_NAMES.length : Infinity;
}

export function sinhalaLegacyFontPriority(font) {
  const names = [font.family, font.fullName, font.postscriptName].filter(
    Boolean,
  );
  if (names.some((name) => /unicode|uniweb|malithi[\s_-]*web/iu.test(name))) {
    return Infinity;
  }
  let seriesPriority = Infinity;
  for (const name of names) {
    const priority = sinhalaLegacyDeviceFontOrder.get(
      normalizeSinhalaFontName(name),
    );
    if (priority !== undefined) return priority;
    const seriesIndex = SINHALA_LEGACY_SERIES.findIndex((pattern) =>
      pattern.test(name),
    );
    if (seriesIndex >= 0) {
      seriesPriority = Math.min(seriesPriority, seriesIndex);
    }
  }
  return seriesPriority === Infinity
    ? Infinity
    : SINHALA_LEGACY_DEVICE_FONT_NAMES.length + seriesPriority;
}

function rankFonts(fonts, priorityOf) {
  return fonts
    .map((font) => ({ font, priority: priorityOf(font) }))
    .filter(({ priority }) => priority !== Infinity)
    .sort((a, b) => a.priority - b.priority)
    .map(({ font }) => font);
}

export function filterSinhalaUnicodeLocalFonts(fonts) {
  return rankFonts(fonts, sinhalaUnicodeFontPriority);
}

export function filterSinhalaLegacyLocalFonts(fonts) {
  return rankFonts(fonts, sinhalaLegacyFontPriority);
}

export function createSinhalaUnicodeCssFontMatcher() {
  const families = getRegisteredCssFontFamilies(normalizeSinhalaFontName);
  return (family) => families.get(normalizeSinhalaFontName(family)) || null;
}

export async function probeSinhalaLegacyLocalFonts(fonts) {
  if (typeof FontFace !== "function") return [];
  const existingFamilies = new Set(
    fonts.map((font) => normalizeLegacyFamilyKey(font.family || font.fullName)),
  );
  const found = [];
  for (const name of SINHALA_LEGACY_DEVICE_FONT_NAMES) {
    const family = name.replace(/[\s_-]+/g, "");
    const key = normalizeLegacyFamilyKey(family);
    if (existingFamilies.has(key)) continue;
    const candidates = name.startsWith("FM ")
      ? [
          `${family} x`,
          `${family}  Bold`,
          `${family} Bold`,
          family,
          `${name} x`,
          name,
        ]
      : [name, name.replaceAll(" ", "-"), family];
    for (const candidate of new Set(candidates)) {
      try {
        await new FontFace(
          "Mori Legacy Font Probe",
          `local(${quoteFontFamily(candidate)})`,
        ).load();
        found.push({
          family,
          fullName: candidate,
          style: /bold/iu.test(candidate) ? "Bold" : "Regular",
        });
        existingFamilies.add(key);
        break;
      } catch {
        // This font name is not available on the device.
      }
    }
  }
  return found;
}
