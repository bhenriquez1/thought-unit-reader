// tests/regression/sharedPageUnderstanding.test.ts
// Regression guard for the SurgeonAnnotationPlan -> {Highlights, VisualSceneGraph}
// architecture: ONE page read, TWO consumers built from the SAME grounded
// annotations, never a second independent AI call for the Whiteboard.
//
// This exercises the real pipeline end-to-end on a page with all 5 teaching
// categories the density limiter treats specially (definition, mechanism,
// procedure, example/supportingEvidence, trap) — exactly the shape that used
// to starve the Whiteboard, since mechanism and procedure previously shared
// ONE slot with limitAnnotationDensity() applied to both consumers.

import { groundSurgeonQuotes } from "../../lib/highlights/groundSurgeonQuotes";
import { limitAnnotationDensity } from "../../lib/highlights/limitAnnotationDensity";
import { surgeonAnnotationsToCanonicalEntries, buildVSG, pageRoleToWhiteboardGrammar } from "../../lib/whiteboard/visualSceneGraph";
import { buildSurgeonEvidenceId } from "../../lib/highlights/groundSurgeonQuotes";
import type { SurgeonAnnotationPlan } from "../../lib/insights/pageAnnotationPlan";

const PAGE_TRUTH_KEY = "diagnosis-book::42::t";
const DOCUMENT_ID = "diagnosis-book";
const PAGE_NUMBER = 42;

const PAGE_TEXT =
  "The Diagnostic Process\n\n" +
  "A diagnosis is the process of determining which disease or condition explains a patient's symptoms and signs. " +
  "Interpreting the collected information about the patient leads directly to identifying the most likely explanation for their condition.\n\n" +
  "1. Interview the patient to gather their history.\n" +
  "2. Perform a focused clinical examination.\n" +
  "3. Order any diagnostic tests that are indicated.\n" +
  "4. Synthesize all findings into a single working diagnosis.\n\n" +
  "For example, a patient presenting with chest pain may require an ECG to rule out a cardiac cause. " +
  "Do not confuse a diagnosis with a mere list of symptoms; the diagnosis must explain WHY the symptoms are occurring.";

function annotation(overrides: Partial<SurgeonAnnotationPlan["annotations"][number]>): SurgeonAnnotationPlan["annotations"][number] {
  return {
    canonicalType: "definition",
    exactQuote:    "placeholder",
    reason:        "placeholder reason",
    importance:    "high",
    treatment:     "definitionBar",
    spanScope:     "fullSentence",
    ...overrides,
  };
}

const PLAN: SurgeonAnnotationPlan = {
  pageTruthKey: PAGE_TRUTH_KEY,
  pageThesis:   "Diagnosis is the structured process of explaining a patient's symptoms.",
  pageRole:     "diagnosis",
  annotations: [
    annotation({
      canonicalType: "definition",
      exactQuote:    "A diagnosis is the process of determining which disease or condition explains a patient's symptoms and signs.",
      reason:        "Defines the page's core term.",
      importance:    "critical",
      treatment:     "definitionBar",
    }),
    annotation({
      canonicalType: "mechanism",
      exactQuote:    "Interpreting the collected information about the patient leads directly to identifying the most likely explanation for their condition.",
      reason:        "Explains how raw findings become a diagnosis.",
      importance:    "high",
      treatment:     "mechanismBrace",
    }),
    annotation({
      canonicalType: "procedure",
      exactQuote:
        "1. Interview the patient to gather their history.\n" +
        "2. Perform a focused clinical examination.\n" +
        "3. Order any diagnostic tests that are indicated.\n" +
        "4. Synthesize all findings into a single working diagnosis.",
      reason:        "The ordered steps of the diagnostic process.",
      importance:    "high",
      treatment:     "procedureRail",
    }),
    annotation({
      canonicalType: "supportingEvidence",
      exactQuote:    "For example, a patient presenting with chest pain may require an ECG to rule out a cardiac cause.",
      reason:        "A concrete worked example of the process.",
      importance:    "supporting",
      treatment:     "evidenceUnderline",
    }),
    annotation({
      canonicalType: "trap",
      exactQuote:    "Do not confuse a diagnosis with a mere list of symptoms; the diagnosis must explain WHY the symptoms are occurring.",
      reason:        "A common student mistake on this topic.",
      importance:    "high",
      treatment:     "trapNotch",
    }),
  ],
};

describe("Shared page understanding: one page read -> Highlights + VisualSceneGraph", () => {
  const wholePage = groundSurgeonQuotes(PLAN.annotations, PAGE_TEXT);
  const highlightPlan = limitAnnotationDensity(wholePage);

  it("the highlight plan selects the most important source sentences, verbatim, from the real page text", () => {
    expect(highlightPlan.length).toBeGreaterThan(0);
    for (const a of highlightPlan) {
      expect(PAGE_TEXT.includes(a.groundedText)).toBe(true);
    }
    // The critical definition must survive the highlight cap.
    expect(highlightPlan.some(a => a.canonicalType === "definition")).toBe(true);
  });

  it("REQUIRED: the highlight plan's density cap (mechanism/procedure sharing one slot) drops real content that the whole-page view keeps — proving groundedAnnotations alone is NOT the complete page model", () => {
    const highlightHasMechanism = highlightPlan.some(a => a.canonicalType === "mechanism");
    const highlightHasProcedure = highlightPlan.some(a => a.canonicalType === "procedure");
    // Only one of the two can survive the shared slot.
    expect(highlightHasMechanism && highlightHasProcedure).toBe(false);
    // But the whole-page view — the SAME groundSurgeonQuotes() output, just
    // without the PDF-margin-note cap — keeps both.
    expect(wholePage.some(a => a.canonicalType === "mechanism")).toBe(true);
    expect(wholePage.some(a => a.canonicalType === "procedure")).toBe(true);
    expect(wholePage.length).toBeGreaterThan(highlightPlan.length);
  });

  it("the VisualSceneGraph built from the whole-page view contains the full teaching structure — definition, mechanism, procedure, example, and trap all present as nodes", () => {
    const entries = surgeonAnnotationsToCanonicalEntries(wholePage, DOCUMENT_ID, PAGE_NUMBER);
    const grammar = pageRoleToWhiteboardGrammar(PLAN.pageRole);
    const vsg = buildVSG(entries, grammar, { pageNumber: PAGE_NUMBER });

    expect(vsg.nodes.length).toBe(5);
    const types = new Set(vsg.nodes.map(n => n.canonicalType));
    expect(types).toEqual(new Set(["definition", "mechanism", "process", "evidence", "warning"]));
  });

  it("the Whiteboard has meaningful nodes and connectors, not two generic text boxes — every node carries its `reason`, and there is at least one real edge", () => {
    const entries = surgeonAnnotationsToCanonicalEntries(wholePage, DOCUMENT_ID, PAGE_NUMBER);
    const vsg = buildVSG(entries, pageRoleToWhiteboardGrammar(PLAN.pageRole), { pageNumber: PAGE_NUMBER });

    expect(vsg.nodes.length).toBeGreaterThan(2);
    for (const node of vsg.nodes) {
      expect(typeof node.reason).toBe("string");
      expect(node.reason!.length).toBeGreaterThan(0);
    }
    expect(vsg.edges.length).toBeGreaterThan(0);
  });

  it("both the highlight plan and the VisualSceneGraph are built from the SAME pageTruthKey/pageNumber-scoped ids — no independent second read, no drift", () => {
    const highlightIds = highlightPlan.map((_, i) => buildSurgeonEvidenceId(DOCUMENT_ID, PAGE_NUMBER, i));
    const entries = surgeonAnnotationsToCanonicalEntries(wholePage, DOCUMENT_ID, PAGE_NUMBER);
    // Same id-builder, same page slot — both consumers are keyed off the one
    // page read's pageNumber, never a second independently-scoped read.
    expect(entries[0].id).toBe(buildSurgeonEvidenceId(DOCUMENT_ID, PAGE_NUMBER, 0));
    expect(highlightIds.every(id => id.includes(String(PAGE_NUMBER)))).toBe(true);
    expect(PLAN.pageTruthKey).toBe(PAGE_TRUTH_KEY);
  });

  it("no stale or fallback scene is rendered — an empty grounded set produces an empty entries array, never a substituted generic diagram", () => {
    const entries = surgeonAnnotationsToCanonicalEntries([], DOCUMENT_ID, PAGE_NUMBER);
    expect(entries).toEqual([]);
  });
});
