// lib/semantic/resolvePack.ts
// Resolver hierarchy for semantic packs.
//
// Priority order (highest → lowest):
//   1. User override at chapter level
//   2. Classifier-detected at chapter level
//   3. User override at document level
//   4. Classifier-detected at document level
//   5. General fallback
//
// "tentative" = confidence is in the [TENTATIVE, HIGH) range; callers may
// show the universal label set in parallel until confidence reaches HIGH.

import type { SemanticDomain, SemanticDomainAssignment, CanonicalSemanticType } from "./types";
import { CONFIDENCE } from "./types";
import type { SemanticPack, ClassificationResult } from "./types";
import { GENERAL_PACK } from "./packs/general";
import { DENTISTRY_PACK } from "./packs/dentistry";
import { GENERAL_CHEMISTRY_PACK } from "./packs/generalChemistry";

// ── Pack registry ────────────────────────────────────────────────────────────

const PACK_REGISTRY = new Map<SemanticDomain, SemanticPack>([
  ["dentistry",        DENTISTRY_PACK],
  ["general-chemistry", GENERAL_CHEMISTRY_PACK],
  // Additional domain packs registered here as they are built.
]);

function packForDomain(domain: SemanticDomain): SemanticPack {
  return PACK_REGISTRY.get(domain) ?? GENERAL_PACK;
}

// ── ResolvedPack ─────────────────────────────────────────────────────────────

export interface ResolvedPack {
  pack:       SemanticPack;
  domain:     SemanticDomain;
  confidence: number;
  source:     "user-chapter" | "detected-chapter" | "user-doc" | "detected-doc" | "fallback";
  /** true when confidence is in [TENTATIVE, HIGH) — show universal labels alongside */
  tentative:  boolean;
}

// ── Resolver ─────────────────────────────────────────────────────────────────

/**
 * Resolve the active semantic pack given the full list of assignments for a
 * document.  Pass `chapterId` (non-empty string) when resolving for a specific
 * chapter; omit or pass "" for a document-level resolve.
 */
export function resolvePack(
  assignments: SemanticDomainAssignment[],
  chapterId = "",
): ResolvedPack {
  const chapId = chapterId ?? "";

  // Build lookup maps for quick access
  const byChapter = new Map(
    assignments
      .filter(a => (a.chapterId ?? "") !== "")
      .map(a => [`${a.chapterId}:${a.source}`, a] as const),
  );
  const byDoc = new Map(
    assignments
      .filter(a => (a.chapterId ?? "") === "")
      .map(a => [a.source, a] as const),
  );

  const candidates: Array<[SemanticDomainAssignment, ResolvedPack["source"]]> = [];

  if (chapId) {
    const userChap = byChapter.get(`${chapId}:user`);
    if (userChap) candidates.push([userChap, "user-chapter"]);

    const detectedChap = byChapter.get(`${chapId}:classifier`);
    if (detectedChap) candidates.push([detectedChap, "detected-chapter"]);
  }

  const userDoc = byDoc.get("user");
  if (userDoc) candidates.push([userDoc, "user-doc"]);

  const detectedDoc = byDoc.get("classifier");
  if (detectedDoc) candidates.push([detectedDoc, "detected-doc"]);

  for (const [assignment, source] of candidates) {
    const pack = packForDomain(assignment.domain);
    // Skip if pack requires higher confidence than this assignment supplies
    if (assignment.source !== "user" && assignment.confidence < pack.minimumConfidence) {
      continue;
    }
    return {
      pack,
      domain:     assignment.domain,
      confidence: assignment.confidence,
      source,
      tentative:  assignment.confidence < CONFIDENCE.HIGH && assignment.source !== "user",
    };
  }

  return {
    pack:       GENERAL_PACK,
    domain:     "general",
    confidence: 0,
    source:     "fallback",
    tentative:  false,
  };
}

/**
 * Resolve directly from a ClassificationResult — useful when the assignment
 * has not been persisted yet (e.g., live classification during reading).
 */
export function resolvePackFromResult(
  result: ClassificationResult,
  source: "detected-chapter" | "detected-doc",
): ResolvedPack {
  if (result.confidence < CONFIDENCE.TENTATIVE || result.domain === "general") {
    return {
      pack:       GENERAL_PACK,
      domain:     "general",
      confidence: result.confidence,
      source:     "fallback",
      tentative:  false,
    };
  }

  const pack = packForDomain(result.domain);
  return {
    pack,
    domain:     result.domain,
    confidence: result.confidence,
    source,
    tentative:  result.confidence < CONFIDENCE.HIGH,
  };
}

// ── Display helpers ───────────────────────────────────────────────────────────

/**
 * Return the display label for a canonical type within a resolved pack.
 * Falls back to the universal label name if the pack doesn't define the type.
 */
export function getDisplayLabel(
  canonicalType: CanonicalSemanticType,
  resolved: ResolvedPack,
): string {
  const label = resolved.pack.labels.find(l => l.canonicalType === canonicalType);
  return label?.label ?? canonicalType;
}

/**
 * Return the display icon for a canonical type within a resolved pack.
 * Falls back to empty string if the pack doesn't define an icon for the type.
 */
export function getDisplayIcon(
  canonicalType: CanonicalSemanticType,
  resolved: ResolvedPack,
): string {
  const label = resolved.pack.labels.find(l => l.canonicalType === canonicalType);
  return label?.icon ?? "";
}
