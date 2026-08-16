// tests/datApex/datLearningState.test.ts
// X3 — DAT Apex activity begins writing into the shared Learning State
// engine via the previously-dead "dat-question-answered" event kind.
// recordLearningEvent is IDB-backed (unavailable in this repo's Node jest
// env, no jsdom/indexedDB polyfill), so the routing/guard logic gets
// static-analysis coverage, matching the established pattern for
// IDB-backed modules throughout this session's work.

import fs from "fs";
import path from "path";

const SRC = fs.readFileSync(path.resolve(__dirname, "../../lib/datApex/datLearningState.ts"), "utf8");

describe("recordDatQuestionAnswered", () => {
  it("REQUIRED: no-ops (does not call recordLearningEvent) when the question carries no grounding", () => {
    const idx = SRC.indexOf("export async function recordDatQuestionAnswered");
    const block = SRC.slice(idx, idx + 700);
    expect(block).toMatch(/if \(!documentId \|\| !unitIds \|\| unitIds\.length === 0\) return;/);
  });

  it("REQUIRED: fires one event per source canonical unit, not one event for the whole question", () => {
    const idx = SRC.indexOf("export async function recordDatQuestionAnswered");
    const block = SRC.slice(idx, idx + 700);
    expect(block).toMatch(/unitIds\.map\(\(unitId\) =>\s*\n\s*recordLearningEvent\(unitId, documentId, \{/);
  });

  it("REQUIRED: the event kind is dat-question-answered, carrying correct/timeMs/occurredAt/sourceId", () => {
    const idx = SRC.indexOf("kind: \"dat-question-answered\"");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 150);
    expect(block).toMatch(/correct,/);
    expect(block).toMatch(/timeMs: null,/);
    expect(block).toMatch(/occurredAt,/);
    expect(block).toMatch(/sourceId: question\.id,/);
  });
});

describe("recordDatAttemptLearningState", () => {
  it("REQUIRED: skips unanswered responses (selectedChoiceId === null) before doing any lookup", () => {
    const idx = SRC.indexOf("export async function recordDatAttemptLearningState");
    const block = SRC.slice(idx, idx + 700);
    expect(block).toMatch(/if \(r\.selectedChoiceId === null\) return Promise\.resolve\(\);/);
  });

  it("REQUIRED: correctness is computed by comparing the response to the question's own correctAnswer", () => {
    const idx = SRC.indexOf("export async function recordDatAttemptLearningState");
    const block = SRC.slice(idx, idx + 700);
    expect(block).toMatch(/const correct = r\.selectedChoiceId === q\.correctAnswer;/);
  });

  it("a single question's write failure is caught per-question, not allowed to reject the whole Promise.all", () => {
    const idx = SRC.indexOf("export async function recordDatAttemptLearningState");
    const block = SRC.slice(idx, idx + 700);
    expect(block).toMatch(/recordDatQuestionAnswered\(q, correct, occurredAt\)\.catch\(\(\) => \{\}\);/);
  });
});

describe("app/apex/proctor/page.tsx — wires the attempt submission into recordDatAttemptLearningState", () => {
  const pageSrc = fs.readFileSync(path.resolve(__dirname, "../../app/apex/proctor/page.tsx"), "utf8");

  it("REQUIRED: called with the full question set and the attempt's own responses, after scoring", () => {
    const scoreIdx = pageSrc.indexOf("const result = scoreDatAttempt(");
    const wireIdx = pageSrc.indexOf("recordDatAttemptLearningState(");
    expect(scoreIdx).toBeGreaterThan(-1);
    expect(wireIdx).toBeGreaterThan(scoreIdx);
    const block = pageSrc.slice(wireIdx, wireIdx + 200);
    expect(block).toMatch(/recordDatAttemptLearningState\(allQuestions, attempt\.responses, endTime\)\.catch\(\(\) => \{\}\);/);
  });
});
