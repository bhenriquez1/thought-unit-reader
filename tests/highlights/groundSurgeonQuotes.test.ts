// tests/highlights/groundSurgeonQuotes.test.ts
// Pure-function tests for the strict SurgeonAnnotationPlan quote verifier.
// Key regression guard: a near-miss quote (the kind groundHighlightAnchors.ts's
// stage-3 semantic recovery would have rescued by substituting a different
// sentence) must be REJECTED here, not silently replaced — per the confirmed
// "strict reject only" design decision for this pipeline.

import { groundSurgeonQuotes, buildSurgeonEvidenceId } from "../../lib/highlights/groundSurgeonQuotes";
import type { SurgeonAnnotationPlan } from "../../lib/insights/pageAnnotationPlan";

type Annotation = SurgeonAnnotationPlan["annotations"][number];

function makeAnnotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    canonicalType: "definition",
    exactQuote:    "Glycolysis converts glucose into pyruvate in the cytosol.",
    reason:        "Defines the core process for this page.",
    importance:    "critical",
    treatment:     "definitionBar",
    spanScope:     "fullSentence",
    ...overrides,
  };
}

const PAGE_TEXT =
  "Cellular Respiration Overview\n\n" +
  "Glycolysis converts glucose into pyruvate in the cytosol. " +
  "This process yields a net gain of two ATP molecules per glucose.\n\n" +
  "The Krebs cycle then oxidizes pyruvate-derived acetyl-CoA in the mitochondrial matrix.";

describe("groundSurgeonQuotes — Stage 1: exact match", () => {
  it("accepts a quote that appears verbatim in the page text", () => {
    const result = groundSurgeonQuotes([makeAnnotation()], PAGE_TEXT);
    expect(result).toHaveLength(1);
    expect(result[0].groundingState).toBe("exact");
    expect(result[0].confidence).toBe(1.0);
    expect(result[0].groundedText).toBe("Glycolysis converts glucose into pyruvate in the cytosol.");
  });

  it("carries forward canonicalType, reason, importance, treatment unchanged", () => {
    const annotation = makeAnnotation({ canonicalType: "mechanism", treatment: "mechanismBrace", importance: "high" });
    const result = groundSurgeonQuotes([annotation], PAGE_TEXT);
    expect(result[0].canonicalType).toBe("mechanism");
    expect(result[0].treatment).toBe("mechanismBrace");
    expect(result[0].importance).toBe("high");
  });
});

describe("groundSurgeonQuotes — Stage 2: normalized match", () => {
  it("accepts a quote that differs only by en/em-dash vs. hyphen", () => {
    const pageWithDash = "Oxygen–dependent ATP production occurs in the mitochondria.";
    const annotation = makeAnnotation({ exactQuote: "Oxygen-dependent ATP production occurs in the mitochondria." });
    const result = groundSurgeonQuotes([annotation], pageWithDash);
    expect(result).toHaveLength(1);
    expect(result[0].groundingState).toBe("normalized");
    expect(result[0].confidence).toBe(0.95);
  });

  it("accepts a quote that differs only by extra internal whitespace", () => {
    const annotation = makeAnnotation({ exactQuote: "Glycolysis converts glucose  into   pyruvate in the cytosol." });
    const result = groundSurgeonQuotes([annotation], PAGE_TEXT);
    expect(result).toHaveLength(1);
    expect(result[0].groundingState).toBe("normalized");
  });

  it("REGRESSION GUARD: accepts a quote when the live PDF text layer used a non-breaking space (\\u00A0) where the quote has a plain space", () => {
    // Real PDF.js text extraction sometimes emits U+00A0 for a rendered space —
    // normText() previously had no NBSP handling, so raw-page-text grounding
    // (see useSurgeonAnnotations.ts) would silently reject an otherwise-correct
    // quote at exactly this kind of character difference.
    const pageWithNbsp = "Glycolysis converts glucose into pyruvate in the cytosol.";
    const annotation = makeAnnotation({ exactQuote: "Glycolysis converts glucose into pyruvate in the cytosol." });
    const result = groundSurgeonQuotes([annotation], pageWithNbsp);
    expect(result).toHaveLength(1);
    expect(result[0].groundingState).toBe("normalized");
  });
});

describe("groundSurgeonQuotes — grounding against RAW (uncleaned) page text", () => {
  // useSurgeonAnnotations.ts grounds against the raw PDF text layer, not
  // cleanActivePageText's output, so that a successful match is guaranteed
  // findable by downstream PDF-coordinate resolution (which only ever
  // searches the raw text). This suite proves the realistic case works:
  // a running header/title that sits in its OWN paragraph (the normal
  // outcome of geometry-based page-text reconstruction, which inserts a
  // paragraph break at genuine visual gaps) must never leak into the
  // grounded body sentence, even though no cleanActivePageText call ran.
  it("does not leak a running header into groundedText when the header is on its own paragraph", () => {
    const rawPageText =
      "30  UNIT ONE  The Chemistry of Life\n\n" +
      "The mechanism by which buffer solutions resist changes in pH depends on the equilibrium " +
      "between a weak acid and its conjugate base. A second sentence follows here for context.";
    const annotation = makeAnnotation({
      canonicalType: "mechanism",
      exactQuote: "The mechanism by which buffer solutions resist changes in pH depends on the equilibrium between a weak acid and its conjugate base.",
      treatment: "mechanismBrace",
    });
    const result = groundSurgeonQuotes([annotation], rawPageText);
    expect(result).toHaveLength(1);
    expect(result[0].groundedText).toBe(
      "The mechanism by which buffer solutions resist changes in pH depends on the equilibrium between a weak acid and its conjugate base."
    );
    expect(result[0].groundedText).not.toMatch(/UNIT ONE|Chemistry of Life/);
  });
});

describe("groundSurgeonQuotes — Stage 3: strict reject (no semantic substitution)", () => {
  it("rejects and excludes a quote that does not appear anywhere in the page", () => {
    const annotation = makeAnnotation({ exactQuote: "Photosynthesis converts sunlight into chemical energy." });
    const result = groundSurgeonQuotes([annotation], PAGE_TEXT);
    expect(result).toHaveLength(0);
  });

  it("REGRESSION GUARD: a near-miss, semantically-similar quote is rejected, not substituted with a different real sentence", () => {
    // This exact quote is close in meaning to a real sentence on the page ("Glycolysis
    // converts glucose into pyruvate...") but is NOT verbatim (wrong verb, different
    // structure) — groundHighlightAnchors.ts's stage-3 recovery would likely have
    // substituted the real sentence here. groundSurgeonQuotes must NOT do that.
    const nearMiss = makeAnnotation({ exactQuote: "Glucose is transformed into pyruvate during glycolysis in the cell cytoplasm." });
    const result = groundSurgeonQuotes([nearMiss], PAGE_TEXT);
    expect(result).toHaveLength(0);
    // Confirm no other annotation was fabricated in its place.
    expect(result.length).toBe(0);
  });

  it("never returns a groundedText that differs from a real match found in the page", () => {
    // Sanity check: whenever an annotation IS returned, its groundedText is the
    // original exactQuote unchanged — never a "recovered" replacement sentence.
    const annotation = makeAnnotation();
    const result = groundSurgeonQuotes([annotation], PAGE_TEXT);
    expect(result[0].groundedText).toBe(annotation.exactQuote);
  });
});

describe("groundSurgeonQuotes — sentence-boundary expansion (default spanScope: fullSentence)", () => {
  const CLINIC_PAGE =
    "Patient Interview\n\n" +
    "Before considering a diagnosis or treatment, the clinician should interview the patient " +
    "to identify and explore all the concerns, related conditions, and expectations that " +
    "prompted the patient to seek care. This establishes the psychological and social context " +
    "for the visit.\n\n" +
    "An element is a substance that cannot be broken down into simpler substances.";

  it("expands a mid-sentence fragment quote to the full sentence (first word → ending period)", () => {
    // The model returned only a fragment — the kind of partial highlight the
    // sentence-boundary rule exists to fix.
    const fragment = makeAnnotation({ exactQuote: "before considering a diagnosis or treatment" });
    const result = groundSurgeonQuotes([fragment], CLINIC_PAGE);
    expect(result).toHaveLength(1);
    expect(result[0].groundedText).toBe(
      "Before considering a diagnosis or treatment, the clinician should interview the patient " +
      "to identify and explore all the concerns, related conditions, and expectations that " +
      "prompted the patient to seek care."
    );
  });

  it("does not expand when the quote is already a complete sentence (no-op)", () => {
    const full = makeAnnotation({
      exactQuote: "This establishes the psychological and social context for the visit.",
    });
    const result = groundSurgeonQuotes([full], CLINIC_PAGE);
    expect(result[0].groundedText).toBe(full.exactQuote);
  });

  it("never expands past a paragraph break", () => {
    const fragment = makeAnnotation({ exactQuote: "substance that cannot be broken down" });
    const result = groundSurgeonQuotes([fragment], CLINIC_PAGE);
    expect(result[0].groundedText).toBe(
      "An element is a substance that cannot be broken down into simpler substances."
    );
    // Confirm it did NOT pull in the unrelated preceding paragraph.
    expect(result[0].groundedText).not.toMatch(/clinician/);
  });

  it("spanScope: entity opts out of expansion — keeps exactly the quoted term", () => {
    const entity = makeAnnotation({
      canonicalType: "definition",
      exactQuote: "An element",
      spanScope: "entity",
    });
    const result = groundSurgeonQuotes([entity], CLINIC_PAGE);
    expect(result).toHaveLength(1);
    expect(result[0].groundedText).toBe("An element");
  });

  it("a fragment WITHOUT spanScope set (default) still expands — fullSentence is the default, not opt-in", () => {
    const fragment = makeAnnotation({ exactQuote: "the clinician should interview the patient" });
    delete (fragment as any).spanScope;
    const result = groundSurgeonQuotes([fragment], CLINIC_PAGE);
    expect(result[0].groundedText).toMatch(/^Before considering a diagnosis or treatment/);
    expect(result[0].groundedText.endsWith("prompted the patient to seek care.")).toBe(true);
  });

  it("REQUIRED: full-sentence highlights begin at the first meaningful word and end at terminal punctuation", () => {
    const fragment = makeAnnotation({ exactQuote: "clinician should interview the patient" });
    const result = groundSurgeonQuotes([fragment], CLINIC_PAGE);
    expect(result).toHaveLength(1);
    const text = result[0].groundedText;
    // Begins at the first meaningful word — no leading whitespace, quote, or
    // paragraph-heading bleed from "Patient Interview\n\n" above it.
    expect(text[0]).toBe("B");
    expect(text.startsWith("Before considering")).toBe(true);
    // Ends at terminal punctuation — one of . ! ? ; : — never mid-word/mid-clause.
    expect(/[.!?;:]$/.test(text)).toBe(true);
    expect(text.endsWith("prompted the patient to seek care.")).toBe(true);
  });

  it("skips a leading opening-quote character so expansion starts on the word itself, not the quote mark", () => {
    const quotedPage =
      "Case Notes\n\n" +
      'The exam concluded without incident. "The patient reported severe abdominal pain," the nurse noted in the chart. ' +
      "Follow-up was scheduled for the next available appointment.";
    const fragment = makeAnnotation({ exactQuote: "the nurse noted in the chart" });
    const result = groundSurgeonQuotes([fragment], quotedPage);
    expect(result).toHaveLength(1);
    // The opening quote mark right after the prior sentence's period is not a
    // "meaningful word" — expansion lands on the word itself, past the quote.
    expect(result[0].groundedText.startsWith("The patient reported")).toBe(true);
    expect(result[0].groundedText.endsWith("noted in the chart.")).toBe(true);
  });

  it("supports a genuinely multi-sentence exactQuote returned as one span (no fragmentation)", () => {
    // Simulates the model already having grouped a multi-sentence concept into
    // one exactQuote, per the "multi-sentence concepts" prompt rule.
    const multiSentence = makeAnnotation({
      exactQuote:
        "Before considering a diagnosis or treatment, the clinician should interview the patient " +
        "to identify and explore all the concerns, related conditions, and expectations that " +
        "prompted the patient to seek care. This establishes the psychological and social context " +
        "for the visit.",
    });
    const result = groundSurgeonQuotes([multiSentence], CLINIC_PAGE);
    expect(result).toHaveLength(1);
    expect(result[0].groundedText).toBe(multiSentence.exactQuote);
  });
});

describe("groundSurgeonQuotes — batch behavior", () => {
  it("keeps matched annotations and drops unmatched ones from a mixed batch", () => {
    const good = makeAnnotation({ exactQuote: "The Krebs cycle then oxidizes pyruvate-derived acetyl-CoA in the mitochondrial matrix." });
    const bad  = makeAnnotation({ exactQuote: "This sentence does not exist on the page at all." });
    const result = groundSurgeonQuotes([good, bad], PAGE_TEXT);
    expect(result).toHaveLength(1);
    expect(result[0].exactQuote).toBe(good.exactQuote);
  });

  it("returns an empty array for empty pageText", () => {
    expect(groundSurgeonQuotes([makeAnnotation()], "")).toEqual([]);
  });

  it("returns an empty array for an empty annotations list", () => {
    expect(groundSurgeonQuotes([], PAGE_TEXT)).toEqual([]);
  });
});

describe("groundSurgeonQuotes — duplicate collapse", () => {
  it("collapses two annotations that expand to the identical groundedText, keeping only the first", () => {
    // A fragment and its containing full sentence both survive verification and
    // expand to the SAME sentence — this used to double-render one idea.
    const fragment = makeAnnotation({
      canonicalType: "definition",
      exactQuote: "Glycolysis converts glucose",
    });
    const wholeSentence = makeAnnotation({
      canonicalType: "mechanism",
      exactQuote: "Glycolysis converts glucose into pyruvate in the cytosol.",
    });
    const result = groundSurgeonQuotes([fragment, wholeSentence], PAGE_TEXT);
    expect(result).toHaveLength(1);
    expect(result[0].canonicalType).toBe("definition"); // first occurrence wins
  });

  it("collapses exact duplicate exactQuotes regardless of canonicalType", () => {
    const first = makeAnnotation({ canonicalType: "definition" });
    const second = makeAnnotation({ canonicalType: "clinicalPearl" });
    const result = groundSurgeonQuotes([first, second], PAGE_TEXT);
    expect(result).toHaveLength(1);
  });

  it("does NOT collapse two genuinely distinct spans", () => {
    const a = makeAnnotation({ exactQuote: "Glycolysis converts glucose into pyruvate in the cytosol." });
    const b = makeAnnotation({ exactQuote: "The Krebs cycle then oxidizes pyruvate-derived acetyl-CoA in the mitochondrial matrix." });
    const result = groundSurgeonQuotes([a, b], PAGE_TEXT);
    expect(result).toHaveLength(2);
  });
});

describe("groundSurgeonQuotes — neighboring-page text is rejected", () => {
  it("rejects a quote that exists only on a neighboring page's text, never the current page's", () => {
    const NEIGHBOR_ONLY_SENTENCE = "Photosynthesis occurs in the chloroplast stroma and thylakoid membranes.";
    // Confirm the sentence really is absent from the current page's text (the
    // fixture used throughout this file).
    expect(PAGE_TEXT.includes(NEIGHBOR_ONLY_SENTENCE)).toBe(false);
    const annotation = makeAnnotation({ exactQuote: NEIGHBOR_ONLY_SENTENCE });
    // groundSurgeonQuotes is always called with ONLY the current page's cleaned
    // text (see useSurgeonAnnotations.ts) — a quote real on a neighbor page but
    // absent here must be dropped exactly like any other unverifiable quote.
    const result = groundSurgeonQuotes([annotation], PAGE_TEXT);
    expect(result).toHaveLength(0);
  });
});

describe("groundSurgeonQuotes — Stage 0: sentenceId lookup (guaranteed-exact, no string matching)", () => {
  it("REQUIRED: resolves sentenceId directly against the map — no exactQuote matching involved, so a paraphrased exactQuote still succeeds", () => {
    const sentenceMap = new Map([
      ["S001", "Glycolysis converts glucose into pyruvate in the cytosol."],
      ["S002", "This process yields a net gain of two ATP molecules per glucose."],
    ]);
    // exactQuote deliberately does NOT match verbatim (a contraction + reordering)
    // — Stage 1/2 would reject this, but sentenceId bypasses string matching.
    const annotation = makeAnnotation({
      exactQuote: "This isn't verbatim at all and would fail Stage 1/2 matching.",
      sentenceId: "S001",
    });
    const result = groundSurgeonQuotes([annotation], PAGE_TEXT, sentenceMap);
    expect(result).toHaveLength(1);
    expect(result[0].groundingState).toBe("sentenceId");
    expect(result[0].confidence).toBe(1.0);
    expect(result[0].groundedText).toBe("Glycolysis converts glucose into pyruvate in the cytosol.");
  });

  it("falls back to exact/normalized/reject when sentenceId is absent", () => {
    const sentenceMap = new Map([["S001", "Glycolysis converts glucose into pyruvate in the cytosol."]]);
    const annotation = makeAnnotation({ exactQuote: "Glycolysis converts glucose into pyruvate in the cytosol." });
    const result = groundSurgeonQuotes([annotation], PAGE_TEXT, sentenceMap);
    expect(result).toHaveLength(1);
    expect(result[0].groundingState).toBe("exact"); // Stage 1, not Stage 0
  });

  it("falls back to exact/normalized/reject when sentenceId doesn't resolve in the map (stale/typo'd id)", () => {
    const sentenceMap = new Map([["S001", "Glycolysis converts glucose into pyruvate in the cytosol."]]);
    const annotation = makeAnnotation({
      exactQuote: "Glycolysis converts glucose into pyruvate in the cytosol.",
      sentenceId: "S999",
    });
    const result = groundSurgeonQuotes([annotation], PAGE_TEXT, sentenceMap);
    expect(result).toHaveLength(1);
    expect(result[0].groundingState).toBe("exact");
  });

  it("REQUIRED: never uses sentenceId for entity-scope annotations — those are sub-sentence spans, always exactQuote-based", () => {
    const sentenceMap = new Map([["S001", "Glycolysis converts glucose into pyruvate in the cytosol."]]);
    const annotation = makeAnnotation({
      exactQuote: "Glycolysis",
      spanScope: "entity",
      sentenceId: "S001",
    });
    const result = groundSurgeonQuotes([annotation], PAGE_TEXT, sentenceMap);
    expect(result).toHaveLength(1);
    expect(result[0].groundingState).not.toBe("sentenceId");
    expect(result[0].groundedText).toBe("Glycolysis"); // exact entity text, not the full sentence
  });

  it("REQUIRED: is backward compatible — omitting sentencesById entirely still grounds via exact/normalized/reject exactly as before", () => {
    const annotation = makeAnnotation({ exactQuote: "Glycolysis converts glucose into pyruvate in the cytosol." });
    const result = groundSurgeonQuotes([annotation], PAGE_TEXT); // no third arg
    expect(result).toHaveLength(1);
    expect(result[0].groundingState).toBe("exact");
  });

  it("REQUIRED: multi-sentence span — sentenceId points to the FIRST sentence, exactQuote signals more should be included, and groundedText expands to cover it", () => {
    const sentenceMap = new Map([
      ["S001", "Glycolysis converts glucose into pyruvate in the cytosol."],
      ["S002", "This process yields a net gain of two ATP molecules per glucose."],
    ]);
    const annotation = makeAnnotation({
      exactQuote: "Glycolysis converts glucose into pyruvate in the cytosol. This process yields a net gain of two ATP molecules per glucose.",
      sentenceId: "S001",
    });
    const result = groundSurgeonQuotes([annotation], PAGE_TEXT, sentenceMap);
    expect(result).toHaveLength(1);
    expect(result[0].groundingState).toBe("sentenceId");
    expect(result[0].groundedText).toContain("Glycolysis converts glucose into pyruvate in the cytosol.");
    expect(result[0].groundedText).toContain("This process yields a net gain of two ATP molecules per glucose.");
  });
});

describe("buildSurgeonEvidenceId", () => {
  it("formats as surgeon-<documentId>-<pageNumber>-<index>", () => {
    expect(buildSurgeonEvidenceId("doc-a", 7, 3)).toBe("surgeon-doc-a-7-3");
  });

  it("handles page 1 index 0", () => {
    expect(buildSurgeonEvidenceId("doc-a", 1, 0)).toBe("surgeon-doc-a-1-0");
  });

  it("produces distinct ids for different indices on the same page", () => {
    expect(buildSurgeonEvidenceId("doc-a", 5, 0)).not.toBe(buildSurgeonEvidenceId("doc-a", 5, 1));
  });

  it("REQUIRED: produces distinct ids for different documents at the same page+index — the RC2 fix", () => {
    expect(buildSurgeonEvidenceId("doc-a", 5, 0)).not.toBe(buildSurgeonEvidenceId("doc-b", 5, 0));
  });
});

describe("groundSurgeonQuotes — sourceCharStart/sourceCharEnd diagnostics (stabilization item 3)", () => {
  it("REQUIRED: Stage 1 (exact match) reports the real char span of groundedText within pageText", () => {
    const result = groundSurgeonQuotes([makeAnnotation()], PAGE_TEXT);
    const [g] = result;
    expect(g.sourceCharStart).toBeDefined();
    expect(g.sourceCharEnd).toBeDefined();
    expect(PAGE_TEXT.slice(g.sourceCharStart!, g.sourceCharEnd!)).toBe(g.groundedText);
  });

  it("REQUIRED: Stage 2 (normalized match) also reports a real char span", () => {
    // A case-only difference is the common real-world reason a match is
    // normalized-but-not-exact (per this file's own header comment on the
    // caseInsensitivePos fallback) — reliably locatable via case-insensitive
    // search, unlike a ligature/dash difference which can genuinely change
    // the string and fall back to an unknown (-1) position.
    const annotation = makeAnnotation({
      exactQuote: "glycolysis converts glucose into pyruvate in the cytosol.",
    });
    const result = groundSurgeonQuotes([annotation], PAGE_TEXT);
    expect(result).toHaveLength(1);
    expect(result[0].groundingState).toBe("normalized");
    expect(result[0].sourceCharStart).toBeDefined();
    expect(result[0].sourceCharEnd).toBeDefined();
    expect(result[0].sourceCharStart).not.toBe(-1);
    expect(PAGE_TEXT.slice(result[0].sourceCharStart!, result[0].sourceCharEnd!)).toBe(result[0].groundedText);
  });

  it("Stage 0 (sentenceId) reports the char span from the sentence's real position in pageText", () => {
    const sentencesById = new Map([["S001", "Glycolysis converts glucose into pyruvate in the cytosol."]]);
    const annotation = makeAnnotation({ sentenceId: "S001" });
    const result = groundSurgeonQuotes([annotation], PAGE_TEXT, sentencesById);
    expect(result).toHaveLength(1);
    expect(result[0].groundingState).toBe("sentenceId");
    expect(PAGE_TEXT.slice(result[0].sourceCharStart!, result[0].sourceCharEnd!)).toBe(result[0].groundedText);
  });
});
