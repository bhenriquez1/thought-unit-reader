// tests/regression/p7CurrentFlowAcceptance.test.ts
// P7 — the correction's own closing acceptance suite: a 7-step regression
// trace through the REAL Current Page speech pipeline, proving P2's own
// losslessness mandate holds end to end: "once the instructional reading
// region is selected, it must be read losslessly — no summarizing,
// paraphrasing, combining, or omitting. Only legitimate non-reading page
// furniture may be excluded, and only BEFORE the reading sequence is
// selected. sourceWordsSkipped should be 0 for a successfully completed
// Current reading."
//
// Composes the REAL functions exactly as StudySpeechPanel.tsx does
// (buildCurrentPageSpeechSegments/buildCurrentPageSpeechDiagnostic, backed
// by cleanActivePageText/classifyLineRole), not a reimplementation — same
// "no live browser" convention as every other acceptance test in this repo.

import {
  buildCurrentPageSpeechSegments, buildCurrentPageSpeechDiagnostic, normalizeSourceWhitespace,
} from "../../lib/speech/currentPageSpeech";
import { cleanActivePageText } from "../../lib/insights/cleanActivePageText";
import { useReadingFocusStore } from "../../lib/readingFocus/readingFocusStore";
import fs from "fs";
import path from "path";

describe("P7 — Current Mode flow acceptance (7 steps)", () => {
  it("1. once the instructional reading region is selected, every surviving word is read — sourceWordsSkipped is 0 for a successfully completed reading, the correction's own named diagnostic", () => {
    const source = "Enzymes speed up biological reactions without being consumed. Substrates bind at the enzyme's active site, lowering the activation energy needed for the reaction to proceed.";
    const diagnostic = buildCurrentPageSpeechDiagnostic(source);
    expect(diagnostic.sourceWordsSkipped).toBe(0);
    expect(diagnostic.sourceWordsExpected).toBe(diagnostic.sourceWordsQueued);
    expect(diagnostic.sourceWordsExpected).toBeGreaterThan(0);
  });

  it("2. legitimate page furniture (a running header) is excluded ONLY before the reading sequence is selected — it never enters sourceWordsExpected at all, so its exclusion is never counted as a 'skip'", () => {
    const source = "30 UNIT ONE The Chemistry of Life Cells are the basic unit of all living things.";
    const diagnostic = buildCurrentPageSpeechDiagnostic(source);
    const spoken = buildCurrentPageSpeechSegments(source).join(" ");
    expect(spoken).not.toMatch(/UNIT ONE/);
    expect(spoken).toContain("Cells are the basic unit of all living things.");
    expect(diagnostic.sourceWordsSkipped).toBe(0);
  });

  it("3. a genuine instructional sentence sitting directly adjacent to furniture (glued by a single space, the common real PDF-extraction case) survives completely on both sides — furniture-stripping never eats real content next to it", () => {
    const source = "The Krebs cycle produces NADH. Check Your Understanding. Explain how NADH is used.";
    const spoken = buildCurrentPageSpeechSegments(source).join(" ");
    expect(spoken).not.toMatch(/Check Your Understanding/);
    expect(spoken).toContain("The Krebs cycle produces NADH.");
    expect(spoken).toContain("Explain how NADH is used.");
    const diagnostic = buildCurrentPageSpeechDiagnostic(source);
    expect(diagnostic.sourceWordsSkipped).toBe(0);
  });

  it("4. a figure/table caption WITH real descriptive content is read aloud in full — only a bare, content-less label (e.g. 'Figure 3.2.' alone) is excluded, never genuine instructional content next to a figure reference", () => {
    const source = "Figure 3.2 The ATP synthase complex spans the inner mitochondrial membrane and rotates to generate ATP.";
    const spoken = buildCurrentPageSpeechSegments(source).join(" ");
    expect(spoken).toContain("Figure 3.2 The ATP synthase complex spans the inner mitochondrial membrane and rotates to generate ATP.");
  });

  it("5. splitting an oversized page into TTS-sized segments never drops or reorders a single word — sourceWordsQueued equals sourceWordsExpected even when the reading sequence must be chunked", () => {
    const source = Array.from({ length: 300 }, (_, i) => `word${i}`).join(" ");
    const diagnostic = buildCurrentPageSpeechDiagnostic(source, 80);
    expect(diagnostic.sourceWordsExpected).toBe(300);
    expect(diagnostic.sourceWordsQueued).toBe(300);
    expect(diagnostic.sourceWordsSkipped).toBe(0);
    const segments = buildCurrentPageSpeechSegments(source, 80);
    expect(segments.join(" ")).toBe(source);
  });

  it("6. Current Page speech never paraphrases, summarizes, or invents — the spoken output is byte-identical to cleanActivePageText's own cleaned source text, just re-segmented into sentences", () => {
    const source = "12 CHAPTER 2 Cell Structure Mitochondria produce ATP through respiration.";
    const cleaned = cleanActivePageText(source, undefined, { stripFigureCaptions: false });
    const spoken = buildCurrentPageSpeechSegments(source).join(" ");
    expect(spoken).toBe(normalizeSourceWhitespace(cleaned));
  });

  it("7. Current Mode's Eye Guide writes through the SAME shared store Professor Mode uses (useReadingFocusStore) — never a second, independent fuzzy-text-matching system", () => {
    useReadingFocusStore.getState().setThoughtUnit("p7-current-tu");
    expect(useReadingFocusStore.getState().thoughtUnitId).toBe("p7-current-tu");

    // Confirms both StudySpeechPanel.tsx (Current Mode) and TldrawCanvas.tsx
    // (Professor Mode) import the exact same store module — a shared
    // singleton, not two parallel copies of the same shape.
    const currentSrc = fs.readFileSync(path.resolve(__dirname, "../../components/reader/StudySpeechPanel.tsx"), "utf8");
    const professorSrc = fs.readFileSync(path.resolve(__dirname, "../../components/whiteboard/TldrawCanvas.tsx"), "utf8");
    expect(currentSrc).toMatch(/from ["']@\/lib\/readingFocus\/readingFocusStore["']/);
    expect(professorSrc).toMatch(/from ["']@\/lib\/readingFocus\/readingFocusStore["']/);
  });
});
