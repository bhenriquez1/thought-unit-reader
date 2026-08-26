// tests/reader/highlightBudgetPageAdaptive.test.ts
// R3 — relax Pipeline A's (RightPanel synthesis) stale, flat highlight caps
// to match Pipeline B's (SurgeonAnnotationPlan/PDF overlay) already-adaptive
// density model. See lib/highlights/limitAnnotationDensity.ts for the
// reference model: global cap 8 (up to 15 for dense procedure/workflow/
// decision-tree pages), per-category caps of 1-4.
//
// Pipeline A stacked caps redundantly at every layer — prompt language,
// input truncation, candidate slicing, and pages/index.tsx's final
// applyHighlightBudget ceiling — so a page-adaptive prompt alone would still
// get truncated back down to ~6 anchors at the last mile. This file guards
// every layer of that stack so a future regression can't silently
// reintroduce a low flat cap at any one of them.
//
// No jsdom/render harness for pages/index.tsx in this repo — source
// inspection, matching this repo's established pattern (see
// tests/reader/chiefResidentStaleness.test.ts and siblings).

import fs from "fs";
import path from "path";

const READER_SRC = fs.readFileSync(path.resolve(__dirname, "../../pages/index.tsx"), "utf8");
const SYNTH_PROMPT_SRC = fs.readFileSync(path.resolve(__dirname, "../../lib/insights/synthesizeTeachingOutput.ts"), "utf8");
const SYNTH_API_SRC = fs.readFileSync(path.resolve(__dirname, "../../pages/api/intelligenceSynthesis.ts"), "utf8");
const STUDY_MODEL_SRC = fs.readFileSync(path.resolve(__dirname, "../../lib/insights/currentPageStudyModel.ts"), "utf8");
const LEFT_PANEL_SRC = fs.readFileSync(path.resolve(__dirname, "../../lib/insights/canonicalLeftPanel.ts"), "utf8");

describe("pages/index.tsx — applyHighlightBudget is page-adaptive, not a flat low ceiling", () => {
  it("REQUIRED: BUDGET_TOTAL_MAX allows a dense page to keep well more than the old 6-anchor ceiling", () => {
    const m = READER_SRC.match(/const BUDGET_TOTAL_MAX\s*=\s*(\d+);/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(15);
  });

  it("REQUIRED: BUDGET_COVERAGE_MAX allows a dense page more than the old 15% coverage ceiling", () => {
    const m = READER_SRC.match(/const BUDGET_COVERAGE_MAX\s*=\s*([\d.]+);/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(0.25);
  });

  it("REQUIRED: no ANCHOR_TYPE_MAX entry is stuck at 1 — a single-slot cap silently drops a real multi-step procedure or multi-anchor chain", () => {
    const idx = READER_SRC.indexOf("const ANCHOR_TYPE_MAX: Record<string, number> = {");
    const block = READER_SRC.slice(idx, READER_SRC.indexOf("};", idx));
    const entries = [...block.matchAll(/(\w+):\s*(\d+),/g)];
    expect(entries.length).toBeGreaterThan(0);
    for (const [, type, value] of entries) {
      expect(Number(value)).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("synthesizeTeachingOutput.ts — highlight prompts are page-adaptive, not a fixed 2-4/2-6 count", () => {
  it("REQUIRED: the old fixed-ratio/fixed-count highlight philosophy is gone", () => {
    expect(SYNTH_PROMPT_SRC).not.toMatch(/Target ratio: 85–90%/);
    expect(SYNTH_PROMPT_SRC).not.toMatch(/DEFAULT: 2–4 highlights\. Allow 5–6 ONLY/);
    expect(SYNTH_PROMPT_SRC).not.toMatch(/Discard the bottom 80% of candidates\. Only the top 2–4 survive/);
    expect(SYNTH_PROMPT_SRC).not.toMatch(/highlightAnchors: 2–4 VERBATIM spans from the source\. Adapt to pageType:/);
    expect(SYNTH_PROMPT_SRC).not.toMatch(/highlightAnchors — 2–4 VERBATIM spans from the current page text ONLY/);
  });

  it("REQUIRED: page-adaptive density language is present, modeled on the PDF-overlay pipeline's proven wording", () => {
    expect(SYNTH_PROMPT_SRC).toMatch(/DENSITY IS PAGE-ADAPTIVE, never a universal count/);
    expect(SYNTH_PROMPT_SRC).toMatch(/Under-annotation is a failure when it drops an essential instructional unit/);
  });

  it("the unrelated priorityTier 1-5 importance rating scale is untouched by this pass", () => {
    const occurrences = (SYNTH_PROMPT_SRC.match(/priorityTier: z\.number\(\)\.int\(\)\.min\(1\)\.max\(5\)\.nullable\(\),/g) ?? []).length;
    expect(occurrences).toBe(2);
  });

  it("the unrelated noteCards study-card count ('Generate 2-5 cards') is untouched by this pass", () => {
    expect(SYNTH_PROMPT_SRC).toMatch(/Generate 2-5 cards/);
  });

  it("REQUIRED: raw page text sent to the model is no longer truncated to ~1200-1400 chars", () => {
    expect(SYNTH_PROMPT_SRC).not.toMatch(/pageText\.slice\(0, 1[24]00\)/);
    const occurrences = (SYNTH_PROMPT_SRC.match(/pageText\.slice\(0, 8000\)/g) ?? []).length;
    expect(occurrences).toBe(2);
  });

  it("REQUIRED: rankedConcepts fed into the prompts is no longer sliced to 3-5", () => {
    expect(SYNTH_PROMPT_SRC).not.toMatch(/rankedConcepts\.slice\(0, [35]\)/);
  });

  it("REQUIRED: the concept-block ranking cap that feeds rankedConcepts is raised beyond the old 5", () => {
    const m = SYNTH_PROMPT_SRC.match(/sorted\.slice\(0, (\d+)\)\.map\(\(b\) => \(\{/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(10);
  });
});

describe("pages/api/intelligenceSynthesis.ts — server-side truncation matches the raised prompt limits", () => {
  it("REQUIRED: pageText and rankedConcepts are no longer truncated to the old 1500/6 limits", () => {
    expect(SYNTH_API_SRC).not.toMatch(/pageText\.slice\(0, 1500\)/);
    expect(SYNTH_API_SRC).not.toMatch(/rankedConcepts\.slice\(0, 6\)/);
    expect(SYNTH_API_SRC).toMatch(/pageText\.slice\(0, 8000\)/);
  });
});

describe("lib/insights/currentPageStudyModel.ts — candidate/visual-anchor slicing raised beyond the old 6/8", () => {
  it("REQUIRED: buildAnchorCandidates no longer caps at 8", () => {
    expect(STUDY_MODEL_SRC).not.toMatch(/const candidates = deduped\.slice\(0, 8\);/);
  });

  it("REQUIRED: visualAnchors no longer caps at 6", () => {
    const idx = STUDY_MODEL_SRC.indexOf("const visualAnchors: VisualAnchor[] = seededWithMeta");
    expect(idx).toBeGreaterThan(-1);
    const block = STUDY_MODEL_SRC.slice(idx, idx + 200);
    const m = block.match(/\.slice\(0, (\d+)\)/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(12);
  });
});

describe("lib/insights/canonicalLeftPanel.ts — local non-AI fallback no longer caps at 6", () => {
  it("REQUIRED: extractPageTextFallbackUnits raised its slice beyond 6", () => {
    const idx = LEFT_PANEL_SRC.indexOf("function extractPageTextFallbackUnits");
    const block = LEFT_PANEL_SRC.slice(idx, idx + 1200);
    expect(block).not.toMatch(/\.slice\(0, 6\)/);
  });
});
