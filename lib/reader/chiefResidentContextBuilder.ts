// lib/reader/chiefResidentContextBuilder.ts
// Normalizes canonical thought units into the minimal shape the Chief
// Resident API expects. Prompt/context ASSEMBLY itself lives in the shared
// lib/reader/buildChiefResidentContext.ts (both Reader and NoteLab call
// sites funnel through that one module) — this file only prepares its input.

export interface CanonicalUnitSummary {
  id?: string;
  text: string;
  canonicalType?: string;
  importanceScore?: number;
  priorityTier?: number;
  title?: string;
  page?: number;
}

/**
 * Strip Navigator-specific fields and return the minimal shape the API expects.
 * Filters out entries with no text.
 */
export function toCanonicalUnitInputs(entries: CanonicalUnitSummary[]): CanonicalUnitSummary[] {
  return entries
    .filter((e) => e.text && e.text.trim().length > 0)
    .map(({ text, canonicalType, importanceScore, priorityTier, title, page }) => ({
      text: text.trim(),
      canonicalType,
      importanceScore,
      priorityTier,
      title,
      page,
    }));
}
