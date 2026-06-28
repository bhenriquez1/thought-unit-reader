// lib/insights/importanceTiers.ts
//
// Adaptive Thought Unit Engine — a tiering layer on top of the existing
// domain-preset kindGroups order. groupThoughtUnits() already returns groups
// in the preset's own expert-priority order (e.g. DAT: Concepts before Traps;
// Medical/Surgical: Danger Zones ranked above Pearls); this just buckets that
// ordinal position into a star tier so the navigator can collapse low-tier
// groups by default and the roadmap can call out the #1 group as the page's
// "decision point" — no new extraction pass or AI ranking call involved.

export interface ImportanceTier {
  key: "critical" | "important" | "medium" | "supporting" | "minor";
  stars: number;
  label: string;
}

const TIERS: ImportanceTier[] = [
  { key: "critical", stars: 5, label: "Critical" },
  { key: "important", stars: 4, label: "Important" },
  { key: "medium", stars: 3, label: "Medium" },
  { key: "supporting", stars: 2, label: "Supporting" },
  { key: "minor", stars: 1, label: "Minor" },
];

/** Buckets a group's ordinal position (0 = highest-priority group for this preset) into a star tier. */
export function getImportanceTier(groupIndex: number): ImportanceTier {
  return TIERS[Math.min(Math.max(groupIndex, 0), TIERS.length - 1)];
}

/** Groups at or below this tier's star count start collapsed by default in the navigator. */
export const DEFAULT_COLLAPSE_AT_OR_BELOW_STARS = 2;

export function renderStars(stars: number): string {
  return "★".repeat(stars) + "☆".repeat(5 - stars);
}

/**
 * Expert-map glyph: per the fixed Left Panel taxonomy (Master This / Procedure
 * Step / Decision Point / Key Detail / Key Anatomy / Mechanism / Danger Zone /
 * Clinical Pearl / Memory Hook / Supporting Detail), most kinds carry a FIXED
 * glyph or flat star count rather than one derived from a group's ordinal
 * position — five different "important" kinds must all read as the same
 * ★★★★, not decay by list position. Only kinds with no fixed mapping fall
 * back to the positional renderStars(stars).
 */
export function tierGlyph(stars: number, kind?: string): string {
  if (kind === "trap") return "⚠";
  if (kind === "clinical") return "💎";
  if (kind === "memoryAnchor") return "🧠";
  if (kind === "thesis" || kind === "definition") return renderStars(5);
  if (
    kind === "mechanism" ||
    kind === "formula" ||
    kind === "application" ||
    kind === "comparison" ||
    kind === "keyDetail" ||
    kind === "keyAnatomy"
  ) {
    return renderStars(4);
  }
  if (kind === "reference" || kind === "filler" || kind === "dat_fact" || kind === "unknown") return "📍";
  return renderStars(stars);
}
