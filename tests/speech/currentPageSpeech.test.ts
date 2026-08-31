import {
  buildCurrentPageSpeechSegments,
  buildCurrentPageSpeechDiagnostic,
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

// P0 stabilization, Tier 3, item 1 — wires the existing classifyLineRole()
// (lib/insights/cleanActivePageText.ts, already used by the Canonical Page
// Map) into Current Page speech: instructional body paragraphs are narrated,
// but section headings, page furniture, and decorative labels remain real
// page content — orientation, not something read aloud as if it were prose.
// Each case below uses a real \n\n paragraph break — the same structural
// boundary lib/pdf/structuredPageText.ts inserts between a heading and the
// body paragraph that follows it — so classification is scoped to one
// structural unit at a time (see buildCurrentPageSpeechSegments's own doc
// comment for why classifying pre-collapse, not post-collapse, matters).
describe("Current Page speech — heading/page-furniture suppression (Tier 3)", () => {
  it("REQUIRED: a section-number heading on its own paragraph is not spoken; the body paragraph after it is", () => {
    const source = "2.1 Limits of Sequences\n\nThe limit of a sequence describes the value its terms approach as n increases without bound.";
    const spoken = buildCurrentPageSpeechSegments(source).join(" ");
    expect(spoken).not.toMatch(/2\.1 Limits of Sequences/);
    expect(spoken).toContain("The limit of a sequence describes the value its terms approach as n increases without bound.");
  });

  it("REQUIRED: a chapter-title paragraph is not spoken; the body paragraph after it is", () => {
    const source = "Chapter 4: Acid-Base Equilibrium and Buffer Systems\n\nThe mechanism by which buffer solutions resist changes in pH depends on equilibrium.";
    const spoken = buildCurrentPageSpeechSegments(source).join(" ");
    expect(spoken).not.toMatch(/Chapter 4: Acid-Base Equilibrium/);
    expect(spoken).toContain("The mechanism by which buffer solutions resist changes in pH depends on equilibrium.");
  });

  it("a short title-only paragraph (page-furniture) between two body paragraphs is not spoken, but both real paragraphs survive in order", () => {
    const source = "Enzymes speed up biological reactions without being consumed.\n\nOverview Diagram\n\nSubstrates bind at the enzyme's active site.";
    const segments = buildCurrentPageSpeechSegments(source);
    const spoken = segments.join(" ");
    expect(spoken).not.toMatch(/Overview Diagram/);
    expect(spoken.indexOf("Enzymes speed up")).toBeLessThan(spoken.indexOf("Substrates bind"));
  });

  it("REQUIRED: a bare figure/table label with no description is not spoken", () => {
    const source = "The cell membrane regulates transport.\n\nFigure 3.2.\n\nDiffusion moves solutes down their concentration gradient.";
    const spoken = buildCurrentPageSpeechSegments(source).join(" ");
    expect(spoken).not.toMatch(/Figure 3\.2\./);
    expect(spoken).toContain("The cell membrane regulates transport.");
    expect(spoken).toContain("Diffusion moves solutes down their concentration gradient.");
  });

  it("a figure caption WITH a real description is still spoken in full — item 2's \"preserve only when instructional\" cuts the label-only case, not genuine content", () => {
    const source = "Figure 3.2 The ATP synthase complex spans the inner mitochondrial membrane and rotates to generate ATP.";
    const spoken = buildCurrentPageSpeechSegments(source).join(" ");
    expect(spoken).toContain("Figure 3.2 The ATP synthase complex spans the inner mitochondrial membrane and rotates to generate ATP.");
  });

  it("never invents or paraphrases what it DOES keep — surviving paragraphs are byte-identical to the source, just re-segmented", () => {
    const source = "Mechanism Overview\n\nMitochondria produce ATP through oxidative phosphorylation.";
    const spoken = buildCurrentPageSpeechSegments(source).join(" ");
    expect(spoken).toBe("Mitochondria produce ATP through oxidative phosphorylation.");
  });
});

// Correction (Current Mode losslessness) — buildCurrentPageSpeechDiagnostic
// shares buildCurrentPageSpeechSegments' own internal computation (see
// currentPageSpeech.ts's buildCurrentPageSpeechResult), so these assert
// against the REAL function actually used for playback, not a
// reimplementation that could drift from it.
describe("buildCurrentPageSpeechDiagnostic — sourceWordsExpected/Queued/Skipped", () => {
  it("REQUIRED: sourceWordsSkipped is 0 for an ordinary page — segmenting never loses a word from the selected reading sequence", () => {
    const source = "The cell membrane regulates transport. Substrates bind at the active site.";
    const diagnostic = buildCurrentPageSpeechDiagnostic(source);
    expect(diagnostic.sourceWordsSkipped).toBe(0);
    expect(diagnostic.sourceWordsExpected).toBe(diagnostic.sourceWordsQueued);
    expect(diagnostic.sourceWordsExpected).toBeGreaterThan(0);
  });

  it("REQUIRED: legitimate furniture stripping (a running header) is excluded from BOTH expected and queued equally — sourceWordsSkipped still 0, since exclusion happened before 'expected' was even measured", () => {
    const source = "30 UNIT ONE The Chemistry of Life Cells are the basic unit of all living things.";
    const diagnostic = buildCurrentPageSpeechDiagnostic(source);
    expect(diagnostic.sourceWordsSkipped).toBe(0);
    // The leading "30 UNIT ONE " keyword-header prefix never enters the
    // count at all — expected is scoped to the SELECTED reading sequence
    // (everything from "The Chemistry of Life" onward, per
    // LEADING_RUNNING_HEADER_RE's own lazy match), not the raw page text.
    expect(diagnostic.sourceWordsExpected).toBe(countWordsHelper("The Chemistry of Life Cells are the basic unit of all living things."));
  });

  it("matches an oversized page that gets split across multiple TTS-sized segments — splitting never changes the word count", () => {
    const source = Array.from({ length: 200 }, (_, i) => `word${i}`).join(" ");
    const diagnostic = buildCurrentPageSpeechDiagnostic(source, 80);
    expect(diagnostic.sourceWordsExpected).toBe(200);
    expect(diagnostic.sourceWordsQueued).toBe(200);
    expect(diagnostic.sourceWordsSkipped).toBe(0);
  });

  it("an empty page reports all zeros, not a crash", () => {
    expect(buildCurrentPageSpeechDiagnostic("")).toEqual({
      sourceWordsExpected: 0,
      sourceWordsQueued: 0,
      sourceWordsSkipped: 0,
    });
  });
});

function countWordsHelper(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}
