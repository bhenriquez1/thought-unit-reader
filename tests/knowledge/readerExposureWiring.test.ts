// tests/knowledge/readerExposureWiring.test.ts
// L3 (Learning Hub orchestration correction) — "Reader creates evidence."
// pages/index.tsx already resolved/created a KnowledgeNode for every
// VisualAnchor on the current page (the Knowledge Graph effect, keyed on
// currentPageStudyModel/resolvedDocumentId/currentPage), but never turned
// that into a KnowledgeNodeProgress signal — node IDENTITY existed, but no
// concept-level "the student encountered this" event was ever recorded for
// adult Reader (only Elena/kids mode fired "exposure" events, via
// lib/elena/childLearningState.ts). Source-inspection tests — this repo has
// no jsdom/render harness, same established pattern as
// tests/notelab/ultraNoteDocumentIdentity.test.ts for logic embedded
// directly in pages/index.tsx.

import fs from "fs";
import path from "path";

const SRC = fs.readFileSync(path.resolve(__dirname, "../../pages/index.tsx"), "utf8");

describe("pages/index.tsx — Reader fires real concept-level exposure events (L3)", () => {
  it("REQUIRED: imports recordLearningEvent", () => {
    expect(SRC).toMatch(/import \{ recordLearningEvent \} from "@\/lib\/knowledge\/recordLearningEvent";/);
  });

  const effectIdx = SRC.indexOf("// Knowledge Graph: resolve/create nodes when study model is ready.");
  const effectEnd = SRC.indexOf("}, [currentPageStudyModel, bookId, resolvedDocumentId, currentPage]);", effectIdx);
  const effect = SRC.slice(effectIdx, effectEnd);

  it("REQUIRED: the Knowledge Graph resolution effect actually exists", () => {
    expect(effectIdx).toBeGreaterThan(-1);
    expect(effectEnd).toBeGreaterThan(effectIdx);
  });

  it("REQUIRED: fires an exposure event for every resolved node, sourceType 'read', inside the SAME resolveOrCreateNode.then() that already sets pageKnowledgeNodeId — no second, independent resolution pass", () => {
    const resolveIdx = effect.indexOf("resolveOrCreateNode(anchor, resolvedDocumentId, bookId, currentPage, chapterCandidateId, profileId)");
    const thenIdx = effect.indexOf(".then(node => {", resolveIdx);
    const recordIdx = effect.indexOf("recordLearningEvent(", thenIdx);
    const catchIdx = effect.indexOf(".catch(err => console.error(\"[KG_WIRE] resolve error\"", thenIdx);
    expect(resolveIdx).toBeGreaterThan(-1);
    expect(thenIdx).toBeGreaterThan(resolveIdx);
    expect(recordIdx).toBeGreaterThan(thenIdx);
    expect(recordIdx).toBeLessThan(catchIdx);
    expect(effect).toMatch(/\{ kind: "exposure", sourceType: "read", occurredAt, sourceId: anchor\.id \}/);
  });

  it("REQUIRED: deduplicates by node id within a single page load — two anchors fuzzy-matching onto the SAME node (resolveOrCreateNode's own tier-2 resolution) must count as one encounter, not two", () => {
    expect(effect).toMatch(/const exposedNodeIds = new Set<string>\(\);/);
    expect(effect).toMatch(/if \(exposedNodeIds\.has\(node\.id\)\) return;/);
    expect(effect).toMatch(/exposedNodeIds\.add\(node\.id\);/);
  });

  it("REQUIRED: occurredAt is captured once per effect run (not Date.now()/new Date() inside the reducer) — matches applyLearningEvent's own determinism contract", () => {
    const occurredIdx = effect.indexOf("const occurredAt = new Date().toISOString();");
    expect(occurredIdx).toBeGreaterThan(-1);
    // Captured before the resolution loop starts, not inside the .then() callback.
    const loopIdx = effect.indexOf("for (const anchor of visualAnchors)");
    expect(occurredIdx).toBeLessThan(loopIdx);
  });

  it("REQUIRED: passes a real pageTruthKey (buildPageTruthKey, not the page-later-declared pageTruthKey variable, which isn't in scope yet at this point in the component) — same pattern this file's own note-save call sites already use", () => {
    expect(effect).toMatch(/const readerPageTruthKey = buildPageTruthKey\(resolvedDocumentId, currentPage\);/);
    expect(effect).toMatch(/recordLearningEvent\(\s*\n\s*node\.id, resolvedDocumentId,\s*\n\s*\{ kind: "exposure", sourceType: "read", occurredAt, sourceId: anchor\.id \},\s*\n\s*readerPageTruthKey,\s*\n\s*\)/);
  });

  it("REQUIRED: fire-and-forget — a failure is caught and logged, never surfaced as an unhandled rejection or allowed to block reading", () => {
    expect(effect).toMatch(/\.catch\(err => console\.error\("\[KG_WIRE\] exposure record error"/);
  });

  it("REQUIRED: never touches understandingScore/recallScore/masteryScore directly from this call site — 'encountered' must never look like 'learned' (enforced upstream by applyLearningEvent's own exposure case, but this call site must not try to smuggle in a score patch)", () => {
    const recordIdx = effect.indexOf("recordLearningEvent(");
    const callBlock = effect.slice(recordIdx, effect.indexOf(");", recordIdx) + 2);
    expect(callBlock).not.toMatch(/understandingScore|recallScore|masteryScore/);
  });

  it("this effect's own dependency array is unchanged — still keyed on currentPageStudyModel/bookId/resolvedDocumentId/currentPage, not a new trigger", () => {
    expect(SRC).toMatch(/\}, \[currentPageStudyModel, bookId, resolvedDocumentId, currentPage\]\);/);
  });
});
