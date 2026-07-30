// lib/reader/semanticGrouping.ts
// Groups ThoughtUnitNavigatorEntry[] by canonicalType using the active SemanticPack.
//
// When all entries have canonicalType: uses semantic pack label definitions to
// build sections, ordered by SemanticLabelDefinition.priority (ascending = most important).
//
// When entries are missing canonicalType (legacy pipeline): falls back to the
// existing kind-based grouping via lib/insights/domainPresets.groupThoughtUnits.
//
// ReaderMode transformations:
//   study  — all groups, importance emphasized
//   exam   — high-yield types first; definitions/references collapsed by default
//   review — entries sorted by recency (recentlyFocusedIds first)

import type { CanonicalSemanticType, SemanticPack } from "@/lib/semantic/types";
import type { ReaderMode } from "./readerModeStore";
import { resolveTypeLabel } from "./semanticPackResolver";

// Exam mode: types that surface as expanded by default.
const EXAM_EXPANDED_TYPES = new Set<CanonicalSemanticType>([
  "high-yield", "clinical-pearl", "warning", "contraindication",
  "core-concept", "exception", "common-error", "decision-point",
]);

// Exam mode: types that default to collapsed (low exam priority).
const EXAM_COLLAPSED_TYPES = new Set<CanonicalSemanticType>([
  "definition", "evidence", "memory-anchor", "material", "finding",
  "relationship", "classification", "cause", "effect",
]);

export interface SemanticGroup {
  id: string;
  canonicalType: CanonicalSemanticType | "legacy";
  label: string;
  shortLabel: string;
  icon: string;
  priority: number;
  entryIds: string[];
  defaultCollapsed: boolean;
}

export interface GroupedEntries<T> {
  groups: SemanticGroup[];
  /** Entries in document order within each group — keyed by group id. */
  byGroup: Map<string, T[]>;
  /** True when at least one entry had a canonicalType (semantic grouping active). */
  semanticActive: boolean;
}

type MinEntry = {
  id: string;
  canonicalType?: string;
  kind?: string;
  priorityTier?: number;
  importanceScore?: number;
  lineRange?: string;
};

/**
 * Group entries by canonicalType using the active SemanticPack.
 * Returns a stable, memoization-friendly structure.
 */
export function groupByCanonicalType<T extends MinEntry>(
  entries: T[],
  pack: SemanticPack,
  mode: ReaderMode,
  recentlyFocusedIds?: string[],
): GroupedEntries<T> {
  const semanticActive = entries.some((e) => !!e.canonicalType);

  if (!semanticActive) {
    // Legacy path: emit one group keyed by kind (or "other")
    const byKind = new Map<string, T[]>();
    for (const e of entries) {
      const key = (e.kind as string | undefined) ?? "unknown";
      const arr = byKind.get(key) ?? [];
      arr.push(e);
      byKind.set(key, arr);
    }
    const groups: SemanticGroup[] = Array.from(byKind.keys()).map((key, i) => ({
      id: `legacy-${key}`,
      canonicalType: "legacy" as const,
      label: key.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      shortLabel: key.slice(0, 6),
      icon: "•",
      priority: i,
      entryIds: (byKind.get(key) ?? []).map((e) => e.id),
      defaultCollapsed: false,
    }));
    const byGroup = new Map<string, T[]>();
    for (const g of groups) byGroup.set(g.id, byKind.get(g.label.toLowerCase()) ?? []);
    return { groups, byGroup, semanticActive: false };
  }

  // Build one section per canonicalType that appears in entries.
  const byType = new Map<string, T[]>();
  for (const e of entries) {
    const ct = (e.canonicalType as string | undefined) ?? "core-concept";
    const arr = byType.get(ct) ?? [];
    arr.push(e);
    byType.set(ct, arr);
  }

  // Resolve display metadata from pack, build groups, sort by priority.
  const groups: SemanticGroup[] = Array.from(byType.keys())
    .map((ct): SemanticGroup => {
      const { label, shortLabel, icon } = resolveTypeLabel(ct, pack);
      const packDef = pack.labels.find((l) => l.canonicalType === ct);
      const priority = packDef?.priority ?? 99;
      const defaultCollapsed = resolveDefaultCollapsed(ct as CanonicalSemanticType, mode, priority);
      return {
        id: `ct-${ct}`,
        canonicalType: ct as CanonicalSemanticType,
        label,
        shortLabel,
        icon,
        priority,
        entryIds: (byType.get(ct) ?? []).map((e) => e.id),
        defaultCollapsed,
      };
    })
    .sort((a, b) => a.priority - b.priority || a.label.localeCompare(b.label));

  // Build byGroup map, applying mode-specific entry ordering.
  const byGroup = new Map<string, T[]>();
  for (const g of groups) {
    const raw = byType.get(g.canonicalType as string) ?? [];
    byGroup.set(g.id, sortEntriesForMode(raw, mode, recentlyFocusedIds));
  }

  // In exam mode, put EXAM_EXPANDED_TYPES at the front.
  if (mode === "exam") {
    groups.sort((a, b) => {
      const aExpanded = EXAM_EXPANDED_TYPES.has(a.canonicalType as CanonicalSemanticType);
      const bExpanded = EXAM_EXPANDED_TYPES.has(b.canonicalType as CanonicalSemanticType);
      if (aExpanded !== bExpanded) return aExpanded ? -1 : 1;
      return a.priority - b.priority;
    });
  }

  return { groups, byGroup, semanticActive: true };
}

function resolveDefaultCollapsed(
  ct: CanonicalSemanticType,
  mode: ReaderMode,
  packPriority: number,
): boolean {
  if (mode === "exam") return EXAM_COLLAPSED_TYPES.has(ct);
  if (mode === "study") return packPriority >= 5; // collapse very low-priority groups
  if (mode === "review") return false; // review shows everything for reinforcement
  return packPriority >= 5;
}

function sortEntriesForMode<T extends MinEntry>(
  entries: T[],
  mode: ReaderMode,
  recentlyFocusedIds?: string[],
): T[] {
  const sorted = [...entries].sort((a, b) => {
    const aLine = parseInt(a.lineRange ?? "9999", 10);
    const bLine = parseInt(b.lineRange ?? "9999", 10);
    return aLine - bLine;
  });

  if (mode === "review" && recentlyFocusedIds && recentlyFocusedIds.length > 0) {
    // Surface recently-focused entries at the top, preserving their relative order.
    const recentSet = new Set(recentlyFocusedIds);
    const recent = sorted.filter((e) => recentSet.has(e.id));
    const rest   = sorted.filter((e) => !recentSet.has(e.id));
    return [...recent, ...rest];
  }

  if (mode === "exam") {
    // Within exam groups, sort by importance descending.
    return sorted.sort((a, b) => {
      const aScore = a.importanceScore ?? (a.priorityTier ?? 3) * 20;
      const bScore = b.importanceScore ?? (b.priorityTier ?? 3) * 20;
      return bScore - aScore;
    });
  }

  return sorted;
}

/**
 * Determine whether a group should be visible in the given reader mode.
 * Exam mode hides groups that have zero high-importance entries.
 */
export function isGroupVisibleInMode(
  group: SemanticGroup,
  mode: ReaderMode,
): boolean {
  if (mode !== "exam") return true;
  // In exam mode, suppress pure "reference" types (very low priority, no exam value)
  const lowExamValue: CanonicalSemanticType[] = ["evidence", "memory-anchor", "material"];
  return !lowExamValue.includes(group.canonicalType as CanonicalSemanticType);
}
