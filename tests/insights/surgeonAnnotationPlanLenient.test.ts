// tests/insights/surgeonAnnotationPlanLenient.test.ts
// P1 Launch-Blocker Remediation L5 — a confirmed schema-mismatch bug: the
// page-annotation-plan system prompt (pages/api/page-annotation-plan.ts)
// describes canonicalType's "trap" value using its own synonyms ("a common
// mistake, exception, or warning") right next to the field, and separately
// offers annotationType — a richer, kebab-case taxonomy that includes
// "exception", "common-trap", "clinical-pearl", "evidence-example" — values
// that overlap canonicalType's own 8-value vocabulary under different
// spellings. A model that returns one of those values in the strict
// canonicalType slot used to fail SurgeonAnnotationPlanSchema.safeParse()
// for the WHOLE plan (Zod validates the annotations array as one unit),
// discarding every other correctly-formed annotation on the same page along
// with it. parseSurgeonAnnotationPlanLenient fixes this: known aliases are
// normalized before validation, and only the genuinely malformed annotation
// is dropped — not the whole plan.

import {
  parseSurgeonAnnotationPlanLenient,
  describeLenientParseFailure,
  SurgeonAnnotationPlanSchema,
  type SurgeonAnnotation,
  type SurgeonAnnotationPlan,
} from "../../lib/insights/pageAnnotationPlan";

const VALID_ANNOTATION: SurgeonAnnotation = {
  canonicalType: "definition",
  exactQuote:    "An element is a substance that cannot be broken down into simpler substances.",
  reason:        "Defines the core term the rest of the page builds on.",
  importance:    "critical",
  treatment:     "definitionBar",
  spanScope:     "fullSentence",
};

const VALID_PLAN: SurgeonAnnotationPlan = {
  pageTruthKey: "doc-abc::3::t",
  pageThesis:   "Elements and compounds differ in their atomic composition.",
  pageRole:     "definition",
  annotations:  [VALID_ANNOTATION],
};

describe("parseSurgeonAnnotationPlanLenient — the canonicalType/annotationType vocabulary collision", () => {
  it("REQUIRED: normalizes the exact collision named in the audit — canonicalType: 'exception' survives as 'trap' instead of failing the whole plan", () => {
    const raw = { ...VALID_PLAN, annotations: [{ ...VALID_ANNOTATION, canonicalType: "exception" }] };
    const result = parseSurgeonAnnotationPlanLenient(raw);
    expect(result).not.toBeNull();
    expect(result!.plan.annotations).toHaveLength(1);
    expect(result!.plan.annotations[0].canonicalType).toBe("trap");
    expect(result!.droppedAnnotationCount).toBe(0);
  });

  it.each([
    ["warning", "trap"],
    ["common-trap", "trap"],
    ["clinical-pearl", "clinicalPearl"],
    ["evidence-example", "supportingEvidence"],
    ["supporting-evidence", "supportingEvidence"],
    ["procedure-step", "procedure"],
    ["decision-point", "decision"],
  ])("normalizes alias canonicalType %s to %s", (alias, expected) => {
    const raw = { ...VALID_PLAN, annotations: [{ ...VALID_ANNOTATION, canonicalType: alias }] };
    const result = parseSurgeonAnnotationPlanLenient(raw);
    expect(result).not.toBeNull();
    expect(result!.plan.annotations[0].canonicalType).toBe(expected);
  });

  it("REQUIRED: a plan with one bad annotation and one good one keeps the good one instead of discarding both", () => {
    const good = { ...VALID_ANNOTATION, exactQuote: "This is the good, correctly-typed annotation." };
    const bad = { ...VALID_ANNOTATION, canonicalType: "footnote", exactQuote: "This one has a truly unknown type." };
    const raw = { ...VALID_PLAN, annotations: [good, bad] };
    const result = parseSurgeonAnnotationPlanLenient(raw);
    expect(result).not.toBeNull();
    expect(result!.plan.annotations).toHaveLength(1);
    expect(result!.plan.annotations[0].exactQuote).toBe(good.exactQuote);
    expect(result!.droppedAnnotationCount).toBe(1);
  });

  it("a genuinely unknown canonicalType (not in the alias list) still fails that one annotation, same as strict parsing — the schema is not weakened for real garbage", () => {
    const raw = { ...VALID_PLAN, annotations: [{ ...VALID_ANNOTATION, canonicalType: "footnote" }] };
    expect(() => SurgeonAnnotationPlanSchema.parse(raw)).toThrow(); // strict schema still rejects it
    const result = parseSurgeonAnnotationPlanLenient(raw);
    expect(result).toBeNull(); // lenient parse drops it too — zero survivors means null, not an invented plan
  });

  it("returns null when every annotation is malformed even after normalization", () => {
    const raw = { ...VALID_PLAN, annotations: [{ ...VALID_ANNOTATION, canonicalType: "not-a-real-type" }] };
    expect(parseSurgeonAnnotationPlanLenient(raw)).toBeNull();
  });

  it("returns null when the top-level shape is invalid (no annotations array)", () => {
    expect(parseSurgeonAnnotationPlanLenient({ pageTruthKey: "x" })).toBeNull();
    expect(parseSurgeonAnnotationPlanLenient(null)).toBeNull();
    expect(parseSurgeonAnnotationPlanLenient("not an object")).toBeNull();
  });

  it("returns null when the top-level plan fields themselves are invalid (e.g. missing pageThesis), even if every annotation is fine", () => {
    const { pageThesis, ...withoutThesis } = VALID_PLAN;
    expect(parseSurgeonAnnotationPlanLenient(withoutThesis)).toBeNull();
  });

  it("a fully valid plan with no alias collisions round-trips with zero drops, matching strict parsing", () => {
    const result = parseSurgeonAnnotationPlanLenient(VALID_PLAN);
    expect(result).not.toBeNull();
    expect(result!.droppedAnnotationCount).toBe(0);
    expect(result!.plan.annotations).toEqual(SurgeonAnnotationPlanSchema.parse(VALID_PLAN).annotations);
  });

  it("REQUIRED: a plan with zero annotations to begin with still parses successfully — a legitimately sparse page is not a malformed response", () => {
    // Matches SurgeonAnnotationPlanSchema's own "accepts a plan with zero
    // annotations" behavior — this lenient helper must not regress that by
    // treating an empty input array the same as an array that had entries
    // which all failed validation.
    const emptyPlan = { ...VALID_PLAN, annotations: [] };
    const result = parseSurgeonAnnotationPlanLenient(emptyPlan);
    expect(result).not.toBeNull();
    expect(result!.plan.annotations).toHaveLength(0);
    expect(result!.droppedAnnotationCount).toBe(0);
  });
});

describe("describeLenientParseFailure — L10: diagnostics for a production schema_validation failure that carried zero detail beyond the stage name", () => {
  it("REQUIRED: reports the top-level shape problem when the response isn't an object or has no annotations array", () => {
    expect(describeLenientParseFailure(null)).toEqual(["top-level response is not a JSON object"]);
    expect(describeLenientParseFailure("a string")).toEqual(["top-level response is not a JSON object"]);
    expect(describeLenientParseFailure({ pageTruthKey: "x" })).toEqual([
      "top-level 'annotations' field is missing or not an array",
    ]);
  });

  it("REQUIRED: reports the specific field and message for a genuinely malformed annotation (not one of the known aliases)", () => {
    const raw = { ...VALID_PLAN, annotations: [{ ...VALID_ANNOTATION, canonicalType: "footnote" }] };
    const issues = describeLenientParseFailure(raw);
    expect(issues.some((i) => i.startsWith("annotations[0].canonicalType:"))).toBe(true);
  });

  it("REQUIRED: reports every malformed annotation's index, not just the first", () => {
    const raw = {
      ...VALID_PLAN,
      annotations: [
        { ...VALID_ANNOTATION, canonicalType: "footnote" },
        { ...VALID_ANNOTATION, importance: "medium" },
      ],
    };
    const issues = describeLenientParseFailure(raw);
    expect(issues.some((i) => i.startsWith("annotations[0]."))).toBe(true);
    expect(issues.some((i) => i.startsWith("annotations[1]."))).toBe(true);
  });

  it("REQUIRED: reports a plan-level field problem (e.g. missing pageThesis) separately from any annotation issues", () => {
    const { pageThesis, ...withoutThesis } = VALID_PLAN;
    const issues = describeLenientParseFailure(withoutThesis);
    expect(issues.some((i) => i.startsWith("pageThesis:"))).toBe(true);
  });

  it("known aliases (the exact L5 collision) are NOT reported as errors — they're normalized before validation, same as parseSurgeonAnnotationPlanLenient itself", () => {
    const raw = { ...VALID_PLAN, annotations: [{ ...VALID_ANNOTATION, canonicalType: "exception" }] };
    expect(describeLenientParseFailure(raw)).toEqual([
      "unknown validation failure — plan and every annotation parsed individually but the combined shape still failed",
    ]);
  });
});
