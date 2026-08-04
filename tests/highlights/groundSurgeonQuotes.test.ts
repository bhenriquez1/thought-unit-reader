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

describe("buildSurgeonEvidenceId", () => {
  it("formats as surgeon-<pageNumber>-<index>", () => {
    expect(buildSurgeonEvidenceId(7, 3)).toBe("surgeon-7-3");
  });

  it("handles page 1 index 0", () => {
    expect(buildSurgeonEvidenceId(1, 0)).toBe("surgeon-1-0");
  });

  it("produces distinct ids for different indices on the same page", () => {
    expect(buildSurgeonEvidenceId(5, 0)).not.toBe(buildSurgeonEvidenceId(5, 1));
  });
});
