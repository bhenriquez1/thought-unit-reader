import {
  buildCurrentPageSpeechSegments,
  normalizeSourceWhitespace,
} from "../../lib/speech/currentPageSpeech";
import { cleanActivePageText } from "../../lib/insights/cleanActivePageText";

// Stabilization item 1: Current Page now strips page furniture (running
// headers, page numbers, copyright/publisher debris, checkpoint/callout
// section labels) before segmenting, reusing lib/insights/cleanActivePageText.ts
// rather than building a second matcher — but it must NEVER drop
// instructional content (body prose, figure/table captions, equations),
// and every surviving word must be spoken verbatim, in source order.

describe("Current Page speech — page-furniture stripping", () => {
  it("REQUIRED: strips a leading UNIT/CHAPTER running header glued to the body, keeps the body verbatim", () => {
    const source = "30 UNIT ONE The Chemistry of Life Cells are the basic unit of all living things.";
    const spoken = buildCurrentPageSpeechSegments(source).join(" ");
    expect(spoken).not.toMatch(/UNIT ONE/);
    expect(spoken).toContain("Cells are the basic unit of all living things.");
  });

  it("REQUIRED: strips a trailing bare page number", () => {
    const source = "The cell membrane regulates transport. 42";
    const spoken = buildCurrentPageSpeechSegments(source).join(" ");
    expect(spoken).toBe("The cell membrane regulates transport.");
  });

  it("REQUIRED: strips copyright/publisher footer debris wherever it appears, keeping the body on both sides", () => {
    const source = "Enzymes speed up reactions. Copyright 2026 Example Press. Substrates bind at the active site.";
    const spoken = buildCurrentPageSpeechSegments(source).join(" ");
    expect(spoken).not.toMatch(/Copyright/);
    expect(spoken).toContain("Enzymes speed up reactions.");
    expect(spoken).toContain("Substrates bind at the active site.");
  });

  it("REQUIRED: does NOT strip figure/table captions — they can carry real instructional content, unlike the synthesis path", () => {
    const source = "Figure 3.2 The ATP synthase complex spans the inner mitochondrial membrane. It rotates to generate ATP.";
    const spoken = buildCurrentPageSpeechSegments(source).join(" ");
    expect(spoken).toContain("Figure 3.2");
    expect(spoken).toContain("The ATP synthase complex spans the inner mitochondrial membrane.");
  });

  it("strips checkpoint/review section labels, keeping the surrounding instructional content", () => {
    const source = "The Krebs cycle produces NADH. Check Your Understanding. Explain how NADH is used.";
    const spoken = buildCurrentPageSpeechSegments(source).join(" ");
    expect(spoken).not.toMatch(/Check Your Understanding/);
    expect(spoken).toContain("The Krebs cycle produces NADH.");
    expect(spoken).toContain("Explain how NADH is used.");
  });

  it("REQUIRED: never paraphrases or reorders surviving text — output matches cleanActivePageText's own text exactly, just re-segmented", () => {
    const source = "12 CHAPTER 2 Cell Structure Mitochondria produce ATP through respiration.";
    const cleaned = cleanActivePageText(source, undefined, { stripFigureCaptions: false });
    const spoken = buildCurrentPageSpeechSegments(source).join(" ");
    expect(spoken).toBe(normalizeSourceWhitespace(cleaned));
  });

  it("does not treat common abbreviations as a sentence boundary", () => {
    expect(buildCurrentPageSpeechSegments("See Fig. 2. Then compare Dr. Li's result."))
      .toEqual(["See Fig. 2.", "Then compare Dr. Li's result."]);
  });

  it("splits oversized speech requests without dropping or reordering content", () => {
    const source = Array.from({ length: 120 }, (_, i) => `word${i}`).join(" ");
    const segments = buildCurrentPageSpeechSegments(source, 80);

    expect(segments.length).toBeGreaterThan(1);
    expect(segments.every((segment) => segment.length <= 80)).toBe(true);
    expect(segments.join(" ")).toBe(source);
  });
});
