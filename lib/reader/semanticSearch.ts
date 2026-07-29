// lib/reader/semanticSearch.ts
// Search across ThoughtUnitNavigatorEntry[] with semantic metadata in results.
//
// Matches on: text, reason, title, canonicalType label, pack label.
// Returns results ranked by: exact text match > canonical type match > text overlap.
// Each result carries the resolved display label and importance level for the UI.

import type { CanonicalSemanticType, SemanticPack } from "@/lib/semantic/types";
import { resolveTypeLabel } from "./semanticPackResolver";
import { resolveImportanceLevel, type ImportanceLevel } from "./importanceBadge";

type SearchableEntry = {
  id: string;
  text: string;
  canonicalType?: string;
  kind?: string;
  priorityTier?: number;
  importanceScore?: number;
  reason?: string;
  title?: string;
  page?: number;
  lineRange?: string;
};

export interface SemanticSearchResult<T extends SearchableEntry> {
  entry: T;
  canonicalLabel: string;
  canonicalShortLabel: string;
  canonicalIcon: string;
  importanceLevel: ImportanceLevel;
  matchScore: number;
  matchedField: "text" | "title" | "reason" | "type" | "kind";
}

/**
 * Search `entries` for `query`, returning results annotated with semantic metadata.
 *
 * @param entries    Full entry list for the current page/document.
 * @param query      Raw search string (case-insensitive).
 * @param pack       Active SemanticPack for label resolution.
 * @param maxResults Cap on returned results (default 20).
 */
export function semanticSearch<T extends SearchableEntry>(
  entries: T[],
  query: string,
  pack: SemanticPack,
  maxResults = 20,
): SemanticSearchResult<T>[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const results: SemanticSearchResult<T>[] = [];

  for (const entry of entries) {
    const ct = (entry.canonicalType ?? "") as CanonicalSemanticType;
    const { label: canonicalLabel, shortLabel: canonicalShortLabel, icon: canonicalIcon } =
      resolveTypeLabel(ct || (entry.kind ?? ""), pack);
    const importanceLevel = resolveImportanceLevel(entry.importanceScore, entry.priorityTier);

    const textNorm    = (entry.text    ?? "").toLowerCase();
    const titleNorm   = (entry.title   ?? "").toLowerCase();
    const reasonNorm  = (entry.reason  ?? "").toLowerCase();
    const typeNorm    = canonicalLabel.toLowerCase();
    const kindNorm    = (entry.kind    ?? "").toLowerCase();

    // Score each match type; higher = better.
    let matchScore = 0;
    let matchedField: SemanticSearchResult<T>["matchedField"] = "text";

    if (textNorm.includes(q)) {
      matchScore = textNorm.startsWith(q) ? 100 : 80;
      matchedField = "text";
    } else if (titleNorm.includes(q)) {
      matchScore = 90;
      matchedField = "title";
    } else if (reasonNorm.includes(q)) {
      matchScore = 60;
      matchedField = "reason";
    } else if (typeNorm.includes(q)) {
      matchScore = 50;
      matchedField = "type";
    } else if (kindNorm.includes(q)) {
      matchScore = 40;
      matchedField = "kind";
    } else {
      // Token-overlap fallback
      const qWords = q.split(/\s+/).filter((w) => w.length >= 3);
      const overlap = qWords.filter((w) => textNorm.includes(w)).length;
      if (overlap > 0) {
        matchScore = Math.round((overlap / qWords.length) * 40);
        matchedField = "text";
      }
    }

    if (matchScore > 0) {
      // Boost by importance level
      const importanceBoost: Record<ImportanceLevel, number> = {
        critical: 20, high: 10, medium: 5, reference: 0,
      };
      matchScore += importanceBoost[importanceLevel];

      results.push({
        entry,
        canonicalLabel,
        canonicalShortLabel,
        canonicalIcon,
        importanceLevel,
        matchScore,
        matchedField,
      });
    }
  }

  return results
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, maxResults);
}

/**
 * Returns a short display snippet highlighting the matched portion of the text.
 * Truncates to ~120 chars, centered around the match position.
 */
export function buildSearchSnippet(text: string, query: string, maxLen = 120): string {
  const q = query.trim().toLowerCase();
  const pos = text.toLowerCase().indexOf(q);
  if (pos === -1) return text.slice(0, maxLen) + (text.length > maxLen ? "…" : "");
  const half = Math.floor(maxLen / 2);
  const start = Math.max(0, pos - half);
  const end   = Math.min(text.length, start + maxLen);
  return (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
}
