// tests/apex/examResumeRestoresProgress.test.ts
// P0 fix — app/apex/proctor/page.tsx auto-saved { exam, currentState } to
// localStorage['examProgress'] every 30s, but the load effect never read it
// back: "Resume" (app/apex/page.tsx's handleResume) only restored the
// exam's question set, silently discarding position/answers/time and
// restarting the same question set from zero every time.
//
// This component has no jsdom/React Testing Library in this repo's Jest
// config (testEnvironment:"node") — matching every other proctor/apex
// component regression test in this session, this is static-analysis
// coverage of the actual wiring, not a rendered-component test.

import fs from "fs";
import path from "path";

const SRC = fs.readFileSync(path.resolve(__dirname, "../../app/apex/proctor/page.tsx"), "utf8");

describe("app/apex/proctor/page.tsx — exam resume actually restores saved progress", () => {
  it("REQUIRED: the auto-save write shape is unchanged (exam + currentState with all 5 restorable fields), plus a real savedAt timestamp", () => {
    const idx = SRC.indexOf("localStorage.setItem(\"examProgress\"");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 700);
    expect(block).toMatch(/exam: s\.exam,/);
    expect(block).toMatch(/currentSectionIdx:\s*s\.currentSectionIdx,/);
    expect(block).toMatch(/currentQuestionIdx:\s*s\.currentQuestionIdx,/);
    expect(block).toMatch(/sectionTimeRemaining:\s*s\.sectionTimeRemaining,/);
    expect(block).toMatch(/responses:\s*s\.responses,/);
    expect(block).toMatch(/flagged:\s*Array\.from\(s\.flagged\),/);
    expect(block).toMatch(/savedAt:\s*new Date\(\)\.toISOString\(\),/);
  });

  it("REQUIRED: the load effect reads examProgress back and only trusts it when the saved exam.id matches the exam actually being loaded", () => {
    const idx = SRC.indexOf("localStorage.getItem(\"examProgress\")");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 400);
    expect(block).toMatch(/saved\?\.exam\?\.id === exam\.id/);
    expect(block).toMatch(/restoredState = saved\.currentState;/);
  });

  it("REQUIRED: a corrupted/unparseable examProgress blob is caught, not thrown — the exam still loads fresh", () => {
    const idx = SRC.indexOf("localStorage.getItem(\"examProgress\")");
    const block = SRC.slice(Math.max(0, idx - 50), idx + 500);
    expect(block).toMatch(/try \{/);
    expect(block).toMatch(/\} catch \{ \/\* corrupted examProgress/);
  });

  it("REQUIRED: restored indices are clamped against the freshly-grouped sections before use", () => {
    const idx = SRC.indexOf("const clampedSectionIdx");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 500);
    expect(block).toMatch(/Math\.min\(Math\.max\(restoredState\.currentSectionIdx, 0\), Math\.max\(sections\.length - 1, 0\)\)/);
    expect(block).toMatch(/const clampedQuestionIdx/);
  });

  it("REQUIRED: ProctorState is actually initialized from the restored (clamped) values, not hardcoded zeros", () => {
    const idx = SRC.indexOf("const s: ProctorState = {");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 500);
    expect(block).toMatch(/currentSectionIdx:\s*clampedSectionIdx,/);
    expect(block).toMatch(/currentQuestionIdx:\s*clampedQuestionIdx,/);
    expect(block).toMatch(/sectionTimeRemaining,/);
    expect(block).toMatch(/responses:\s*restoredState\?\.responses \?\? \{\},/);
    expect(block).toMatch(/flagged:\s*new Set\(restoredState\?\.flagged \?\? \[\]\),/);
  });
});

describe("app/apex/proctor/page.tsx — P1 fix: strict/proctored resume can't be paused by closing the tab", () => {
  it("REQUIRED: elapsed real time since the last save is computed from restoredState.savedAt", () => {
    const idx = SRC.indexOf("const elapsedSinceLastSave");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 250);
    expect(block).toMatch(/restoredState\?\.savedAt/);
    expect(block).toMatch(/Date\.now\(\) - new Date\(restoredState\.savedAt\)\.getTime\(\)/);
  });

  it("REQUIRED: only isProctored sessions deduct elapsed time from the restored countdown — practice/non-strict resume is unaffected", () => {
    const idx = SRC.indexOf("const sectionTimeRemaining = isProctored");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 250);
    expect(block).toMatch(/\? Math\.max\(0, restoredTimeRemaining - elapsedSinceLastSave\)/);
    expect(block).toMatch(/: restoredTimeRemaining;/);
  });

  it("the deducted result is clamped to a minimum of 0, never negative", () => {
    const idx = SRC.indexOf("const sectionTimeRemaining = isProctored");
    const block = SRC.slice(idx, idx + 250);
    expect(block).toMatch(/Math\.max\(0,/);
  });
});
