// lib/reader/importanceBadge.ts
// Maps a canonical unit's importance signal to a display tier.
//
// Two input sources:
//   importanceScore  (0–100) — from Phase 1C canonical scoring (forward-compat)
//   priorityTier     (1–5)   — from the existing HighlightTarget / VisualAnchor pipeline
//
// When importanceScore is present it takes precedence; priorityTier is the
// fallback for legacy anchors that pre-date Phase 1C.

export type ImportanceLevel = "critical" | "high" | "medium" | "reference";

export interface ImportanceLevelDescriptor {
  level: ImportanceLevel;
  label: string;
  shortLabel: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

export const IMPORTANCE_LEVEL_DESCRIPTORS: Record<ImportanceLevel, ImportanceLevelDescriptor> = {
  critical: {
    level: "critical",
    label: "Critical",
    shortLabel: "CRIT",
    color: "#fbbf24",
    bgColor: "rgba(251,191,36,0.15)",
    borderColor: "rgba(251,191,36,0.4)",
  },
  high: {
    level: "high",
    label: "High",
    shortLabel: "HIGH",
    color: "#fb923c",
    bgColor: "rgba(251,146,60,0.12)",
    borderColor: "rgba(251,146,60,0.35)",
  },
  medium: {
    level: "medium",
    label: "Medium",
    shortLabel: "MED",
    color: "#94a3b8",
    bgColor: "rgba(148,163,184,0.10)",
    borderColor: "rgba(148,163,184,0.25)",
  },
  reference: {
    level: "reference",
    label: "Reference",
    shortLabel: "REF",
    color: "#64748b",
    bgColor: "rgba(100,116,139,0.08)",
    borderColor: "rgba(100,116,139,0.20)",
  },
};

/**
 * Maps a 0–100 importanceScore (Phase 1C) to an ImportanceLevel.
 *   80–100 → critical
 *   55–79  → high
 *   30–54  → medium
 *   0–29   → reference
 */
export function importanceLevelFromScore(score: number): ImportanceLevel {
  if (score >= 80) return "critical";
  if (score >= 55) return "high";
  if (score >= 30) return "medium";
  return "reference";
}

/**
 * Maps a 1–5 priorityTier (legacy pipeline) to an ImportanceLevel.
 *   5       → critical
 *   4       → high
 *   3       → medium
 *   1–2     → reference
 */
export function importanceLevelFromTier(tier: number): ImportanceLevel {
  if (tier >= 5) return "critical";
  if (tier >= 4) return "high";
  if (tier >= 3) return "medium";
  return "reference";
}

/**
 * Resolves the importance level from whatever signal is available.
 * importanceScore takes precedence over priorityTier.
 */
export function resolveImportanceLevel(
  importanceScore?: number,
  priorityTier?: number,
): ImportanceLevel {
  if (typeof importanceScore === "number" && importanceScore >= 0) {
    return importanceLevelFromScore(importanceScore);
  }
  if (typeof priorityTier === "number" && priorityTier >= 1) {
    return importanceLevelFromTier(priorityTier);
  }
  return "medium";
}

export function getImportanceLevelDescriptor(level: ImportanceLevel): ImportanceLevelDescriptor {
  return IMPORTANCE_LEVEL_DESCRIPTORS[level];
}
