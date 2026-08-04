// tests/highlights/noFabricationGuarantee.test.ts
// End-to-end guarantee: no matter which tier of the surgeon pipeline produced
// an annotation — the deterministic baseline, or an AI-enriched plan that may
// contain hallucinated/paraphrased wording — the text that ends up in the
// final, exclusive PDF overlay is ALWAYS a verbatim substring of the real
// current-page text. Never a fabricated word, never synthetic AI wording.
//
// This exercises the full real chain each component test only covers in
// isolation: AI plan (possibly hallucinated) -> groundSurgeonQuotes (strict
// reject) -> limitAnnotationDensity -> resolveAnnotationTier -> final output.

import { groundSurgeonQuotes } from "../../lib/highlights/groundSurgeonQuotes";
import { limitAnnotationDensity } from "../../lib/highlights/limitAnnotationDensity";
import { buildDeterministicAnnotationPlan } from "../../lib/highlights/deterministicAnnotationPlan";
import { resolveAnnotationTier } from "../../components/reader/useSurgeonAnnotations";
import type { SurgeonAnnotationPlan } from "../../lib/insights/pageAnnotationPlan";

const REAL_PAGE_TEXT =
  "Acid-Base Balance\n\n" +
  "The kidneys regulate blood pH by reabsorbing or excreting bicarbonate ions as needed. " +
  "This process works alongside the lungs, which adjust the rate of carbon dioxide exhalation. " +
  "Be careful not to confuse respiratory and metabolic acidosis on the exam, a common mistake students make.\n\n" +
  "1. Measure arterial blood pH using a blood gas analyzer.\n" +
  "2. Compare the pH to the normal range of 7.35 to 7.45.\n" +
  "3. Identify whether the primary disturbance is respiratory or metabolic.";

function annotation(overrides: Partial<SurgeonAnnotationPlan["annotations"][number]> = {}): SurgeonAnnotationPlan["annotations"][number] {
  return {
    canonicalType: "definition",
    exactQuote:    "placeholder",
    reason:        "r",
    importance:    "high",
    treatment:     "definitionBar",
    spanScope:     "fullSentence",
    ...overrides,
  };
}

function assertEveryQuoteIsVerbatim(texts: string[], pageText: string) {
  for (const t of texts) {
    expect(pageText.includes(t)).toBe(true);
  }
}

describe("No-fabrication guarantee — AI-enriched path", () => {
  it("a hallucinated quote (not present anywhere in the page) never survives groundSurgeonQuotes", () => {
    const aiPlan = [
      annotation({ exactQuote: "The kidneys regulate blood pH by reabsorbing or excreting bicarbonate ions as needed." }), // real
      annotation({ exactQuote: "The liver produces synthetic bile enzymes to neutralize excess stomach acid instantly." }), // fabricated — not in page
    ];
    const grounded = groundSurgeonQuotes(aiPlan, REAL_PAGE_TEXT);
    assertEveryQuoteIsVerbatim(grounded.map(g => g.groundedText), REAL_PAGE_TEXT);
    expect(grounded.some(g => g.groundedText.includes("synthetic bile enzymes"))).toBe(false);
    expect(grounded).toHaveLength(1);
  });

  it("a plausible-but-paraphrased near-miss is rejected outright, never substituted with a real sentence", () => {
    const aiPlan = [
      annotation({ exactQuote: "The kidneys control blood pH levels by adjusting bicarbonate reabsorption." }), // paraphrase, not verbatim
    ];
    const grounded = groundSurgeonQuotes(aiPlan, REAL_PAGE_TEXT);
    expect(grounded).toHaveLength(0);
  });

  it("full pipeline (ground + density-limit) on a mixed real/fabricated AI plan: only real, verbatim text survives", () => {
    const aiPlan = [
      annotation({ exactQuote: "This process works alongside the lungs, which adjust the rate of carbon dioxide exhalation." }),
      annotation({ canonicalType: "trap", treatment: "trapNotch", exactQuote: "Be careful not to confuse respiratory and metabolic acidosis on the exam, a common mistake students make." }),
      annotation({ exactQuote: "Dopamine receptors in the striatum modulate fine motor control during acid-base shifts." }), // fabricated
    ];
    const grounded = limitAnnotationDensity(groundSurgeonQuotes(aiPlan, REAL_PAGE_TEXT));
    assertEveryQuoteIsVerbatim(grounded.map(g => g.groundedText), REAL_PAGE_TEXT);
    expect(grounded.some(g => g.groundedText.includes("Dopamine"))).toBe(false);
  });
});

describe("No-fabrication guarantee — deterministic baseline path", () => {
  it("every annotation extracted by the deterministic plan is a verbatim substring of the source page, by construction", () => {
    const plan = buildDeterministicAnnotationPlan(REAL_PAGE_TEXT, "acid-base::1::t");
    const grounded = limitAnnotationDensity(groundSurgeonQuotes(plan.annotations, REAL_PAGE_TEXT));
    expect(grounded.length).toBeGreaterThan(0);
    assertEveryQuoteIsVerbatim(grounded.map(g => g.groundedText), REAL_PAGE_TEXT);
  });
});

describe("No-fabrication guarantee — holds through resolveAnnotationTier regardless of which tier wins", () => {
  it("enriched tier: final highlightTargets text is still verbatim page text (fabricated candidate already dropped upstream)", () => {
    const aiPlan = [
      annotation({ exactQuote: "The kidneys regulate blood pH by reabsorbing or excreting bicarbonate ions as needed." }),
      annotation({ exactQuote: "Fabricated sentence that does not exist anywhere on this page at all." }),
    ];
    const aiGrounded = limitAnnotationDensity(groundSurgeonQuotes(aiPlan, REAL_PAGE_TEXT));
    const basePlan = buildDeterministicAnnotationPlan(REAL_PAGE_TEXT, "acid-base::1::t");
    const baseGrounded = limitAnnotationDensity(groundSurgeonQuotes(basePlan.annotations, REAL_PAGE_TEXT));

    const tiered = resolveAnnotationTier({
      aiHighlightTargets: aiGrounded.map((g, i) => ({ id: `a${i}`, page: 1, text: g.groundedText, normalizedText: g.groundedText, level: "important", score: 1, sourceParagraphIndex: i, kind: "definition", evidenceRefId: `a${i}`, reason: g.reason, treatment: g.treatment, canonicalType: g.canonicalType, groundingState: g.groundingState } as any)),
      aiGroundedAnnotations: aiGrounded,
      baselineTargets: baseGrounded.map((g, i) => ({ id: `b${i}`, page: 1, text: g.groundedText, normalizedText: g.groundedText, level: "support", score: 1, sourceParagraphIndex: i, kind: "definition", evidenceRefId: `b${i}`, reason: g.reason, treatment: g.treatment, canonicalType: g.canonicalType, groundingState: g.groundingState } as any)),
      baselineGrounded: baseGrounded,
      status: "success",
    });

    expect(tiered.planTier).toBe("enriched");
    assertEveryQuoteIsVerbatim(tiered.highlightTargets.map(t => t.text), REAL_PAGE_TEXT);
    assertEveryQuoteIsVerbatim(tiered.groundedAnnotations.map(g => g.groundedText), REAL_PAGE_TEXT);
  });

  it("degraded tier (AI failed entirely): baseline output is still 100% verbatim page text", () => {
    const basePlan = buildDeterministicAnnotationPlan(REAL_PAGE_TEXT, "acid-base::1::t");
    const baseGrounded = limitAnnotationDensity(groundSurgeonQuotes(basePlan.annotations, REAL_PAGE_TEXT));
    const baseTargets = baseGrounded.map((g, i) => ({ id: `b${i}`, page: 1, text: g.groundedText, normalizedText: g.groundedText, level: "support", score: 1, sourceParagraphIndex: i, kind: "definition", evidenceRefId: `b${i}`, reason: g.reason, treatment: g.treatment, canonicalType: g.canonicalType, groundingState: g.groundingState } as any));

    const tiered = resolveAnnotationTier({
      aiHighlightTargets: [],
      aiGroundedAnnotations: [],
      baselineTargets: baseTargets,
      baselineGrounded: baseGrounded,
      status: "error",
    });

    expect(tiered.planTier).toBe("degraded");
    assertEveryQuoteIsVerbatim(tiered.highlightTargets.map(t => t.text), REAL_PAGE_TEXT);
  });
});
