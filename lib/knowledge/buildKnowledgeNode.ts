// lib/knowledge/buildKnowledgeNode.ts
// Pure functions for constructing KnowledgeNode instances from VisualAnchors.
// No I/O — callers handle all persistence via knowledgeGraphStore.

import type { VisualAnchor } from "@/lib/insights/currentPageStudyModel";
import type { KnowledgeNode, SourceCitation } from "./knowledgeGraphSchema";

// ── Deterministic node ID ─────────────────────────────────────────────────────
// djb2 hash — unsigned 32-bit, fast, no crypto dependency.

function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
    h = h >>> 0;
  }
  return h;
}

function stableNodeId(bookId: string, canonicalAnchorId: string): string {
  const hash = djb2(`${bookId}::${canonicalAnchorId}`).toString(16).padStart(8, "0");
  // bookId can contain path separators — normalize to slug
  const safeBook = bookId.replace(/[^a-z0-9]/gi, "_").slice(0, 40);
  return `kn_${safeBook}_${hash}`;
}

// ── Token overlap ─────────────────────────────────────────────────────────────
// Used by knowledgeGraphStore's tier-2 fuzzy resolver.

const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been",
  "of", "to", "and", "in", "on", "at", "by", "for", "with",
  "it", "its", "this", "that", "or", "not", "from", "as", "can",
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOPWORDS.has(w))
  );
}

export function tokenOverlap(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const w of ta) { if (tb.has(w)) shared++; }
  return shared / Math.min(ta.size, tb.size);
}

// ── Builder ───────────────────────────────────────────────────────────────────

function titleFromAnchor(anchor: VisualAnchor): string {
  // Prefer a short role label over raw text (avoids titles like "The mitochondria is...")
  const roleLabel = anchor.role.replace(/([A-Z])/g, " $1").trim();
  if (roleLabel && roleLabel.length < 40) return roleLabel;
  return anchor.exactText.slice(0, 60).replace(/\s+/g, " ").trim();
}

function importanceFromAnchor(anchor: VisualAnchor): number {
  // priorityTier is 1–5; map to 0–100, biased high (every anchor in the
  // budget is already selected as important by the highlight pipeline).
  if (anchor.priorityTier) return Math.min(100, anchor.priorityTier * 18 + 10);
  // Fall back to role-based defaults
  const roleImportance: Partial<Record<typeof anchor.role, number>> = {
    coreIdea: 90, datFact: 85, mechanism: 80, confusionTrap: 75,
    definition: 70, exampleEvidence: 65, clinicalPearl: 65,
    keyDetail: 60, memoryHook: 55, keyAnatomy: 55,
  };
  return roleImportance[anchor.role] ?? 60;
}

export function buildNewNode(
  anchor: VisualAnchor,
  bookId: string,
  pageNumber: number,
  chapterCandidateId: string | null,
  profileId: string,
): KnowledgeNode {
  const citation: SourceCitation = {
    anchorId:    anchor.id,
    sourceText:  anchor.exactText,
    page:        pageNumber,
    sourceLabel: "Textbook",
    confidence:  anchor.priorityTier ? Math.min(1, anchor.priorityTier / 5) : 0.7,
  };

  return {
    id:                stableNodeId(bookId, anchor.id),
    bookId,
    chapterCandidateId,
    canonicalAnchorId: anchor.id,
    title:             titleFromAnchor(anchor),
    summary:           anchor.reason || anchor.exactText.slice(0, 200),
    exactSourceText:   anchor.exactText,
    sourcePages:       [pageNumber],
    citations:         [citation],
    profileId,
    role:              anchor.role,
    importance:        importanceFromAnchor(anchor),
    difficulty:        50,
    parentNodeIds:     [],
    childNodeIds:      [],
    relatedNodeIds:    [],
    learningObjectives: [],
    misconceptions:    [],
    examples:          [],
    applications:      [],
  };
}
