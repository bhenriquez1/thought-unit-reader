// tests/highlights/interviewPageFixture.test.ts
// End-to-end fixture proving the REAL pipeline functions (groundSurgeonQuotes +
// limitAnnotationDensity — no mocks) correctly ground and preserve 6 distinct
// teaching units on a single dense page, addressing a real production report:
// a page like this was rendering only ONE highlight instead of several, styled
// as a plain underline instead of a semantically differentiated treatment.
//
// This fixture cannot call the live OpenAI endpoint (no API key in this
// environment) — it hand-authors the SurgeonAnnotationPlan a correctly-working
// model call would produce for this page, and proves the DOWNSTREAM pipeline
// (the part fully testable without a live key) neither collapses it to one
// annotation nor renders every treatment identically.

import { groundSurgeonQuotes } from "../../lib/highlights/groundSurgeonQuotes";
import { limitAnnotationDensity } from "../../lib/highlights/limitAnnotationDensity";
import type { SurgeonAnnotationPlan } from "../../lib/insights/pageAnnotationPlan";

const PAGE_TEXT = `THE PATIENT INTERVIEW

A clinician who examines only the visible signs of disease can be misled by what looks like a straightforward case. Diagnosis cannot rely on physical evidence alone.

Reading a patient accurately takes more than a checklist of findings. The clinician must understand the psychological and social context surrounding the chief complaint.

Before considering a diagnosis or treatment, the clinician should interview the patient. This interview must explore all the concerns, related conditions, and expectations that prompted the patient to seek care.

Skipping this step in favor of a rushed exam is a common and costly error. The clinician should listen, observe, analyze, and record every detail the patient provides.

A patient who feels heard during this process is more likely to comply with the resulting treatment plan.`;

type Annotation = SurgeonAnnotationPlan["annotations"][number];

// One correctly-working model call's worth of annotations for this page — 6
// distinct teaching units across 6 distinct canonicalTypes (deliberately never
// using both "mechanism" and "procedure", which share ONE combined slot in
// limitAnnotationDensity — using both here would make this fixture prove
// nothing about density collapsing 6 down to fewer).
const SIX_ANNOTATIONS: Annotation[] = [
  {
    canonicalType: "trap",
    exactQuote:    "Diagnosis cannot rely on physical evidence alone.",
    reason:        "Warns against the common mistake of diagnosing from signs alone.",
    importance:    "critical",
    treatment:     "trapNotch",
    spanScope:     "fullSentence",
  },
  {
    canonicalType: "definition",
    exactQuote:    "The clinician must understand the psychological and social context surrounding the chief complaint.",
    reason:        "States the page's core reasoning rule.",
    importance:    "critical",
    treatment:     "definitionBar",
    spanScope:     "fullSentence",
  },
  {
    canonicalType: "procedure",
    exactQuote:    "Before considering a diagnosis or treatment, the clinician should interview the patient.",
    reason:        "Names the clinical action to take before diagnosis.",
    importance:    "high",
    treatment:     "procedureRail",
    spanScope:     "fullSentence",
  },
  {
    canonicalType: "supportingEvidence",
    exactQuote:    "This interview must explore all the concerns, related conditions, and expectations that prompted the patient to seek care.",
    reason:        "Specifies what the interview must cover.",
    importance:    "high",
    treatment:     "evidenceUnderline",
    spanScope:     "fullSentence",
  },
  {
    canonicalType: "clinicalPearl",
    exactQuote:    "The clinician should listen, observe, analyze, and record every detail the patient provides.",
    reason:        "The interview's expert discipline, in one memorable sequence.",
    importance:    "high",
    treatment:     "pearlMarker",
    spanScope:     "fullSentence",
  },
  {
    canonicalType: "decision",
    exactQuote:    "A patient who feels heard during this process is more likely to comply with the resulting treatment plan.",
    reason:        "The clinical payoff of doing the interview well.",
    importance:    "supporting",
    treatment:     "decisionConnector",
    spanScope:     "fullSentence",
  },
];

describe("Interview-page fixture — groundSurgeonQuotes + limitAnnotationDensity, no mocks", () => {
  it("REQUIRED: all 6 distinct teaching units ground successfully — none rejected as unmatched", () => {
    const grounded = groundSurgeonQuotes(SIX_ANNOTATIONS, PAGE_TEXT);
    expect(grounded).toHaveLength(6);
  });

  it("REQUIRED: density limiting does NOT collapse 6 well-spread-category annotations down to 1 or any fewer than 6 — this is the actual production bug's downstream stage", () => {
    const grounded = groundSurgeonQuotes(SIX_ANNOTATIONS, PAGE_TEXT);
    const limited = limitAnnotationDensity(grounded);
    expect(limited).toHaveLength(6);
  });

  it("REQUIRED: every grounded annotation is the FULL sentence, first meaningful word through terminal punctuation — never a mid-sentence fragment, never a partial underline of just a few words", () => {
    const grounded = groundSurgeonQuotes(SIX_ANNOTATIONS, PAGE_TEXT);
    for (const g of grounded) {
      expect(g.groundedText).toBe(g.exactQuote); // already full sentences in this fixture — expansion is a no-op, proving no truncation happened either
      expect(g.groundedText[0]).toMatch(/[A-Z]/); // starts on a capitalized first word
      expect(g.groundedText.trim().endsWith(".")).toBe(true); // ends on terminal punctuation
    }
  });

  it("REQUIRED: the 6 units cover 6 DISTINCT visual treatments — proving the semantic-distinction complaint (everything rendering as one generic underline) is not reproduced by this pipeline", () => {
    const grounded = groundSurgeonQuotes(SIX_ANNOTATIONS, PAGE_TEXT);
    const limited = limitAnnotationDensity(grounded);
    const treatments = new Set(limited.map(a => a.treatment));
    expect(treatments.size).toBe(6);
    expect(treatments).toEqual(new Set([
      "trapNotch", "definitionBar", "procedureRail",
      "evidenceUnderline", "pearlMarker", "decisionConnector",
    ]));
  });

  it("preserves the model's original relative order (density limiter re-sorts by original index after selection, never by importance)", () => {
    const grounded = groundSurgeonQuotes(SIX_ANNOTATIONS, PAGE_TEXT);
    const limited = limitAnnotationDensity(grounded);
    expect(limited.map(a => a.canonicalType)).toEqual([
      "trap", "definition", "procedure", "supportingEvidence", "clinicalPearl", "decision",
    ]);
  });

  it("each of the 6 required ideas from the production report is actually present in the grounded output", () => {
    const grounded = groundSurgeonQuotes(SIX_ANNOTATIONS, PAGE_TEXT);
    const texts = grounded.map(g => g.groundedText);
    expect(texts.some(t => t.includes("Diagnosis cannot rely on physical evidence alone"))).toBe(true);
    expect(texts.some(t => t.includes("psychological and social context"))).toBe(true);
    expect(texts.some(t => t.includes("should interview the patient"))).toBe(true);
    expect(texts.some(t => t.includes("concerns, related conditions, and expectations"))).toBe(true);
    expect(texts.some(t => t.includes("listen, observe, analyze, and record"))).toBe(true);
    expect(texts.some(t => t.includes("more likely to comply with the resulting treatment plan"))).toBe(true);
  });
});
