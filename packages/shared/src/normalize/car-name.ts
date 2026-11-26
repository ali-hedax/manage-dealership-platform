import { normalizePersian } from "./persian";

export interface CarNameMappingEntry {
  name: string;
  aliases: readonly string[];
}

export interface ShortCarNameResult {
  name: string;
  matched: boolean;
}

export const IRAN_KHODRO_CAR_NAME_MAPPING: readonly CarNameMappingEntry[] = [
  { name: "تارا", aliases: ["تارا"] },
  { name: "دنا", aliases: ["دنا"] },
  { name: "دنا پلاس", aliases: ["دنا پلاس", "دنا‌پلاس"] },
  { name: "سورن", aliases: ["سورن"] },
  { name: "سورن پلاس", aliases: ["سورن پلاس", "سورن‌پلاس"] },
  { name: "ری را", aliases: ["ری را", "ری‌را"] },
  { name: "رانا", aliases: ["رانا"] },
  { name: "پژو 207i", aliases: ["پژو 207i", "پژو ۲۰۷i"] },
  { name: "پژو 206", aliases: ["پژو 206", "پژو ۲۰۶"] },
  { name: "پژو پارس", aliases: ["پژو پارس"] },
  { name: "پژو 405", aliases: ["پژو 405", "پژو ۴۰۵"] },
  { name: "سمند", aliases: ["سمند"] },
  { name: "هایما", aliases: ["هایما"] },
] as const;

const comparisonForm = (value: string): string =>
  normalizePersian(value, { digits: "latin" }).replaceAll("‌", " ");

const stripDescriptionPrefix = (value: string): string =>
  value
    .replace(/^[\d\s\-–—،,/]+/u, "")
    .replace(/^خودرو(?:ی|ي)?\s*/u, "")
    .trim();

export function shortCarName(
  longDescription: string,
  mapping: readonly CarNameMappingEntry[] = IRAN_KHODRO_CAR_NAME_MAPPING,
): ShortCarNameResult {
  const description = stripDescriptionPrefix(comparisonForm(longDescription));
  const candidates = mapping
    .flatMap((entry) =>
      entry.aliases.map((alias) => ({
        name: entry.name,
        alias: comparisonForm(alias),
      })),
    )
    .sort((left, right) => right.alias.length - left.alias.length);

  const match = candidates.find(({ alias }) => description.includes(alias));
  if (match) {
    return { name: match.name, matched: true };
  }

  const firstModelWord = description.match(/[\u0600-\u06FF‌]+/u)?.[0];
  return {
    name: firstModelWord?.replaceAll("‌", " ") ?? description.split(" ")[0] ?? "",
    matched: false,
  };
}
