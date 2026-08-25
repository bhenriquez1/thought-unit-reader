// tests/datApex/datLearningState.test.ts
// X3 — DAT Apex activity begins writing into the shared Learning State
// engine via the previously-dead "dat-question-answered" event kind.
// recordLearningEvent is IDB-backed (unavailable in this repo's Node jest
// env, no jsdom/indexedDB polyfill), so the routing/guard logic gets
// static-analysis coverage, matching the established pattern for
// IDB-backed modules throughout this session's work.
//
// TestLab-Reader progress integration — this file used to assert writes
// were keyed on question.sourceThoughtUnitIds. That was a real bug:
// recordLearningEvent's first argument is a Knowledge Graph NODE id (it
// calls getNodeProgress/saveNodeProgress, keyed by KnowledgeNodeProgress.
// nodeId — see lib/knowledge/recordLearningEvent.ts), and CanonicalThoughtUnit
// ids are a DIFFERENT id space from KnowledgeNode ids in this app. Every
// prior write here silently created an orphaned KnowledgeNodeProgress
// record nothing else could ever read back. Fixed to key on
// sourceKnowledgeNodeIds instead — this suite now asserts the FIXED
// behavior, not the old bug.
//
// P0 fix — the SAME bug existed one layer up on the documentId argument:
// it used question.sourceBookId (a filename), which fails
// recordLearningEvent's ownership guard against progress already written
// under the real resolved documentId, silently resetting it. Fixed to key
// on question.sourceDocumentId (the resolved id examBuilder.ts stamps from
// the same Knowledge Graph node sourceKnowledgeNodeIds comes from).

import fs from "fs";
import path from "path";

const SRC = fs.readFileSync(path.resolve(__dirname, "../../lib/datApex/datLearningState.ts"), "utf8");

describe("recordDatQuestionAnswered", () => {
  it("REQUIRED: no-ops (does not call recordLearningEvent) when the question carries no Knowledge Graph grounding", () => {
    const idx = SRC.indexOf("export async function recordDatQuestionAnswered");
    const block = SRC.slice(idx, idx + 700);
    expect(block).toMatch(/if \(!documentId \|\| !nodeIds \|\| nodeIds\.length === 0\) return;/);
  });

  it("REQUIRED: documentId comes from sourceDocumentId (the resolved id), never sourceBookId (a filename) — the P0 fix", () => {
    const idx = SRC.indexOf("export async function recordDatQuestionAnswered");
    const block = SRC.slice(idx, idx + 700);
    expect(block).toMatch(/const documentId = question\.sourceDocumentId;/);
    expect(block).not.toMatch(/question\.sourceBookId/);
  });

  it("REQUIRED: fires at least one event per Knowledge Graph node id (sourceKnowledgeNodeIds), not per CanonicalThoughtUnit id", () => {
    const idx = SRC.indexOf("export async function recordDatQuestionAnswered");
    const block = SRC.slice(idx, idx + 2000);
    expect(block).toMatch(/const nodeIds = question\.sourceKnowledgeNodeIds;/);
    expect(block).toMatch(/nodeIds\.map\(async \(nodeId\) => \{/);
    expect(block).toMatch(/await recordLearningEvent\(nodeId, documentId, event\);/);
    expect(block).not.toMatch(/sourceThoughtUnitIds/);
  });

  it("REQUIRED: the event kind is dat-question-answered, carrying correct/timeMs/occurredAt/sourceId", () => {
    const idx = SRC.indexOf("kind: \"dat-question-answered\"");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 150);
    expect(block).toMatch(/correct,/);
    expect(block).toMatch(/timeMs: null,/);
    expect(block).toMatch(/occurredAt,/);
    expect(block).toMatch(/sourceId: question\.id \},/);
  });

  it("REQUIRED (C7): a wrong answer with misconceptionTested also queues a misconception-observed event, applied sequentially per node (not raced)", () => {
    const idx = SRC.indexOf("export async function recordDatQuestionAnswered");
    const block = SRC.slice(idx, idx + 2000);
    expect(block).toMatch(/if \(!correct && question\.misconceptionTested\) \{/);
    expect(block).toMatch(/kind: "misconception-observed", misconception: question\.misconceptionTested/);
    expect(block).toMatch(/for \(const event of events\) \{/);
  });
});

describe("recordDatAttemptLearningState", () => {
  it("REQUIRED: skips unanswered responses (selectedChoiceId === null) before doing any lookup", () => {
    const idx = SRC.indexOf("export async function recordDatAttemptLearningState");
    const block = SRC.slice(idx, idx + 1400);
    expect(block).toMatch(/if \(r\.selectedChoiceId === null\) return null;/);
  });

  it("REQUIRED: correctness is computed by comparing the response to the question's own correctAnswer", () => {
    const idx = SRC.indexOf("export async function recordDatAttemptLearningState");
    const block = SRC.slice(idx, idx + 1400);
    expect(block).toMatch(/const correct = r\.selectedChoiceId === q\.correctAnswer;/);
  });

  it("REQUIRED: a single question's write failure is caught per-question, not allowed to reject the whole Promise.all", () => {
    const idx = SRC.indexOf("export async function recordDatAttemptLearningState");
    const block = SRC.slice(idx, idx + 1400);
    expect(block).toMatch(/try \{\s*\n\s*await recordDatQuestionAnswered\(q, correct, occurredAt\);\s*\n\s*return true;\s*\n\s*\} catch \{\s*\n\s*return false;\s*\n\s*\}/);
  });

  it("REQUIRED: write failures are counted and returned, not silently swallowed — the whole point of this pass", () => {
    const idx = SRC.indexOf("export async function recordDatAttemptLearningState");
    const block = SRC.slice(idx, idx + 1200);
    expect(block).toMatch(/return \{\s*\n\s*written: attempted\.filter\(Boolean\)\.length,\s*\n\s*failed:\s*attempted\.filter\(\(ok\) => !ok\)\.length,\s*\n\s*\};/);
  });
});

describe("app/apex/proctor/page.tsx — wires the attempt submission into recordDatAttemptLearningState", () => {
  const pageSrc = fs.readFileSync(path.resolve(__dirname, "../../app/apex/proctor/page.tsx"), "utf8");

  it("REQUIRED: called with the full question set and the attempt's own responses, after scoring", () => {
    const scoreIdx = pageSrc.indexOf("const result = scoreDatAttempt(");
    const wireIdx = pageSrc.indexOf("recordDatAttemptLearningState(");
    expect(scoreIdx).toBeGreaterThan(-1);
    expect(wireIdx).toBeGreaterThan(scoreIdx);
  });

  it("REQUIRED: a write failure is logged, not swallowed by a blanket .catch(() => {})", () => {
    const wireIdx = pageSrc.indexOf("recordDatAttemptLearningState(");
    const block = pageSrc.slice(wireIdx, wireIdx + 400);
    expect(block).not.toMatch(/\.catch\(\(\) => \{\}\);/);
    expect(block).toMatch(/console\.error\("\[TESTLAB_LEARNING_STATE_WRITE_FAIL\]"/);
  });
});
