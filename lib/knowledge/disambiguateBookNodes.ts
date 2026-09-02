// lib/knowledge/disambiguateBookNodes.ts
// P1 Launch-Blocker Remediation L8 — getNodesByBook() (and useKnowledgeGraph,
// which calls it) deliberately groups KnowledgeNodes by the filename-derived
// bookId rather than the collision-resistant documentId (see
// knowledgeGraphStore.ts's own header comment on getNodesByBook/
// getNodesByDocument) — a legitimate choice, since it gives a student
// progress continuity across re-uploads of the same book. But it also means
// two UNRELATED documents that happen to share a generic filename
// ("Notes.pdf", "Chapter1.pdf") get their concepts and progress silently
// merged in every bookId-scoped view (Learning Hub's Knowledge State panel,
// Next Best Action, TestLab's weak-concept exam scope).
//
// This disambiguates that merged set down to the documentIds actually
// corroborated as "the same book," using page-level text overlap between
// documentId groups — the same tokenOverlap heuristic knowledgeGraphStore.ts's
// own tier-2 fuzzy node resolver already uses for a closely related problem
// (deciding whether two anchors are "the same concept"). The active
// document's own nodes are always kept, regardless of corroboration.

import type { KnowledgeNode } from "./knowledgeGraphSchema";
import { tokenOverlap } from "./buildKnowledgeNode";

/** Average per-shared-page token overlap required to treat two documentId
 *  groups as the same book. */
const SAME_BOOK_OVERLAP_THRESHOLD = 0.5;
/** Comparing on a single shared page is too easy to satisfy by chance
 *  (a generic definition, a short heading) — require a few. */
const MIN_SHARED_PAGES_TO_COMPARE = 2;

function groupByPage(nodes: KnowledgeNode[]): Map<number, KnowledgeNode[]> {
  const byPage = new Map<number, KnowledgeNode[]>();
  for (const node of nodes) {
    for (const page of node.sourcePages) {
      const existing = byPage.get(page);
      if (existing) existing.push(node); else byPage.set(page, [node]);
    }
  }
  return byPage;
}

function groupsLikelySameBook(a: KnowledgeNode[], b: KnowledgeNode[]): boolean {
  const byPageA = groupByPage(a);
  let sharedPages = 0;
  let overlapSum = 0;
  for (const node of b) {
    for (const page of node.sourcePages) {
      const candidates = byPageA.get(page);
      if (!candidates || candidates.length === 0) continue;
      sharedPages++;
      overlapSum += Math.max(...candidates.map((c) => tokenOverlap(c.exactSourceText, node.exactSourceText)));
    }
  }
  if (sharedPages < MIN_SHARED_PAGES_TO_COMPARE) return false;
  return overlapSum / sharedPages >= SAME_BOOK_OVERLAP_THRESHOLD;
}

/**
 * Filters a bookId-scoped KnowledgeNode list down to the documentId(s)
 * corroborated as the same book as `activeDocumentId`. When every node
 * already shares one documentId (the common case — no re-upload, no
 * filename collision), returns the input unchanged.
 */
export function disambiguateBookNodes(nodes: KnowledgeNode[], activeDocumentId: string | null): KnowledgeNode[] {
  const byDoc = new Map<string, KnowledgeNode[]>();
  for (const node of nodes) {
    const existing = byDoc.get(node.documentId);
    if (existing) existing.push(node); else byDoc.set(node.documentId, [node]);
  }
  if (byDoc.size <= 1) return nodes;

  const included = new Set<string>();
  if (activeDocumentId && byDoc.has(activeDocumentId)) included.add(activeDocumentId);

  // No active document corroborated (e.g. called before the active
  // document's own nodes exist yet) — fall back to the single largest
  // documentId group rather than merging every candidate sharing this
  // bookId, which is exactly the collision this function exists to avoid.
  if (included.size === 0) {
    let largestDocId: string | null = null;
    for (const [docId, group] of byDoc) {
      if (!largestDocId || group.length > byDoc.get(largestDocId)!.length) largestDocId = docId;
    }
    if (largestDocId) included.add(largestDocId);
  }

  // Grow the included set: any other documentId whose nodes look like the
  // same book as an already-included group gets merged in too, so a chain
  // of re-uploads (v1 -> v2 -> v3) all corroborate through their neighbors.
  let changed = true;
  while (changed) {
    changed = false;
    for (const [docId, group] of byDoc) {
      if (included.has(docId)) continue;
      for (const includedId of included) {
        if (groupsLikelySameBook(byDoc.get(includedId)!, group)) {
          included.add(docId);
          changed = true;
          break;
        }
      }
    }
  }

  return nodes.filter((node) => included.has(node.documentId));
}
