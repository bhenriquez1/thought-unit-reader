// lib/reader/chiefResidentContextBuilder.ts
// Converts canonical thought units into a structured context string for the
// Chief Resident AI. This is the "Context Builder" step of the Phase 4 pipeline:
//
//   Canonical Thought Unit → ReaderAnchor → Semantic Pack → Context Builder → Chief Resident AI
//
// The structured context format tells the AI which concepts are high-yield vs
// reference, what type each concept is (definition, warning, formula, etc.), and
// what the source text says — without exposing raw unstructured page text.

import type { SemanticPack } from "@/lib/semantic/types";
import { resolveTypeLabel } from "./semanticPackResolver";
import { resolveImportanceLevel, type ImportanceLevel } from "./importanceBadge";

export interface CanonicalUnitSummary {
  id?: string;
  text: string;
  canonicalType?: string;
  importanceScore?: number;
  priorityTier?: number;
  title?: string;
  page?: number;
}

export interface CanonicalContextResult {
  /** Formatted string ready to pass as sourceText or canonical block to the API. */
  contextText: string;
  /** How many units were included (before truncation). */
  unitCount: number;
  /** e.g. "2 definitions, 1 high yield, 1 warning" — used in API header */
  typeSummary: string;
  /** True when the input was cut to fit maxChars. */
  truncated: boolean;
}

const IMPORTANCE_RANK: Record<ImportanceLevel, number> = {
  critical: 0, high: 1, medium: 2, reference: 3,
};

/** Per-unit text cap so one long unit can't crowd out the rest. */
const MAX_UNIT_TEXT_CHARS = 400;

/**
 * Build a structured semantic context string from a list of canonical units.
 *
 * Units are sorted by importance (critical first) so the AI naturally
 * emphasizes what matters most for exam/board preparation.
 *
 * Output format:
 *   SEMANTIC UNITS (N concepts grounded in source material):
 *
 *   [📖 DEFINITION · MEDIUM] Enamel is the hard outer layer…
 *   [⚡ HIGH YIELD · CRITICAL] Ameloblasts are lost after eruption…
 */
export function buildCanonicalContext(
  entries: CanonicalUnitSummary[],
  pack: SemanticPack,
  maxChars = 3000,
): CanonicalContextResult {
  const sorted = [...entries].sort((a, b) => {
    const aLevel = resolveImportanceLevel(a.importanceScore, a.priorityTier);
    const bLevel = resolveImportanceLevel(b.importanceScore, b.priorityTier);
    return IMPORTANCE_RANK[aLevel] - IMPORTANCE_RANK[bLevel];
  });

  const lines: string[] = [];
  const typeCounts = new Map<string, number>();
  let charTotal = 0;
  let included = 0;
  let truncated = false;

  for (const entry of sorted) {
    const ct = entry.canonicalType ?? "core-concept";
    const { label, icon } = resolveTypeLabel(ct, pack);
    const level = resolveImportanceLevel(entry.importanceScore, entry.priorityTier);
    const titleNote = entry.title ? ` — "${entry.title}"` : "";
    const text = entry.text.slice(0, MAX_UNIT_TEXT_CHARS);
    const line = `[${icon} ${label.toUpperCase()}${titleNote} · ${level.toUpperCase()}] ${text}`;

    if (charTotal + line.length + 1 > maxChars) {
      truncated = true;
      break;
    }

    lines.push(line);
    charTotal += line.length + 1;
    included++;
    typeCounts.set(label, (typeCounts.get(label) ?? 0) + 1);
  }

  const typeSummary = Array.from(typeCounts.entries())
    .map(([t, n]) => `${n} ${t.toLowerCase()}${n !== 1 ? "s" : ""}`)
    .join(", ");

  const truncationNote = truncated ? ", truncated to fit context limit" : "";
  const header = `SEMANTIC UNITS (${included} concept${included !== 1 ? "s" : ""} grounded in source material${truncationNote}):`;

  return {
    contextText: [header, "", ...lines].join("\n"),
    unitCount: included,
    typeSummary,
    truncated,
  };
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
