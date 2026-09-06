import { assessAnnotationCoverage } from "../../lib/highlights/assessAnnotationCoverage";
import { groundSurgeonQuotes } from "../../lib/highlights/groundSurgeonQuotes";
import { limitAnnotationDensity } from "../../lib/highlights/limitAnnotationDensity";
import { groundedAnnotationsToHighlightTargets } from "../../components/reader/useSurgeonAnnotations";
import type { InstructionalPageRole, SurgeonAnnotation } from "../../lib/insights/pageAnnotationPlan";

const treatment = {
  definition: "definitionBar", mechanism: "mechanismBrace", procedure: "procedureRail",
  decision: "decisionConnector", comparison: "comparisonBracket", trap: "trapNotch",
  "clinical-pearl": "pearlMarker", supportingEvidence: "evidenceUnderline",
} as const;

const annotationType = {
  definition: "definition",
  mechanism: "mechanism",
  procedure: "procedure-step",
  decision: "decision-point",
  comparison: "comparison",
  trap: "common-trap",
  clinicalPearl: "clinical-pearl",
  supportingEvidence: "evidence-example",
} as const;

function mark(exactQuote: string, canonicalType: SurgeonAnnotation["canonicalType"], importance: SurgeonAnnotation["importance"] = "high", sequenceIndex: number | null = null): SurgeonAnnotation {
  return {
    canonicalType, exactQuote, sourceQuote: exactQuote, reason: "Required instructional unit.",
    pedagogicalReason: "Required instructional unit.", importance,
    treatment: treatment[canonicalType], spanScope: "fullSentence", sequenceIndex,
    conceptId: `concept-${canonicalType}-${sequenceIndex ?? 0}`,
    annotationType: annotationType[canonicalType],
  };
}

const fixtures: Array<{ name: string; roles: InstructionalPageRole[]; pageText: string; annotations: SurgeonAnnotation[]; required: SurgeonAnnotation["canonicalType"][] }> = [
  {
    name: "chemistry mechanism", roles: ["definition-heavy", "mechanism-causal", "worked-example"],
    pageText: "A precipitate is an insoluble solid formed from solution. Ions move through water and carry electric charge. When the ions combine to form an insoluble salt, the solid precipitates. Silver nitrate and sodium chloride provide an example of this reaction.",
    annotations: [
      mark("A precipitate is an insoluble solid formed from solution.", "definition", "critical"),
      mark("Ions move through water and carry electric charge.", "mechanism"),
      mark("When the ions combine to form an insoluble salt, the solid precipitates.", "mechanism"),
      mark("Silver nitrate and sodium chloride provide an example of this reaction.", "supportingEvidence"),
    ], required: ["definition", "mechanism", "supportingEvidence"],
  },
  {
    name: "biology definition mechanism", roles: ["definition-heavy", "mechanism-causal"],
    pageText: "Osmosis is the movement of water across a selectively permeable membrane. Water moves toward the side with greater effective solute concentration.",
    annotations: [mark("Osmosis is the movement of water across a selectively permeable membrane.", "definition", "critical"), mark("Water moves toward the side with greater effective solute concentration.", "mechanism")], required: ["definition", "mechanism"],
  },
  {
    name: "dental procedure", roles: ["procedure-sequence"],
    pageText: "First isolate the tooth with a rubber dam. Next remove unsupported enamel. Finally place and contour the restoration.",
    annotations: [mark("First isolate the tooth with a rubber dam.", "procedure", "critical", 0), mark("Next remove unsupported enamel.", "procedure", "high", 1), mark("Finally place and contour the restoration.", "procedure", "high", 2)], required: ["procedure"],
  },
  {
    name: "medical clinical", roles: ["clinical-diagnostic", "procedure-sequence"],
    pageText: "Assess airway stability before choosing treatment. If the airway is unstable, secure it immediately. Reassess oxygenation after intervention.",
    annotations: [mark("Assess airway stability before choosing treatment.", "decision", "critical"), mark("If the airway is unstable, secure it immediately.", "procedure", "high", 0), mark("Reassess oxygenation after intervention.", "procedure", "high", 1)], required: ["decision", "procedure"],
  },
  {
    name: "history narrative", roles: ["narrative-history"],
    pageText: "The reform movement expanded after newspapers published evidence of unsafe factories. The reports materially changed public support for regulation.",
    annotations: [mark("The reform movement expanded after newspapers published evidence of unsafe factories.", "supportingEvidence", "critical"), mark("The reports materially changed public support for regulation.", "supportingEvidence")], required: ["supportingEvidence"],
  },
  {
    name: "math equation", roles: ["equation-calculation", "worked-example"],
    pageText: "Use the formula y equals m x plus b. Substitute the known slope and intercept. Simplify the expression to obtain the final value. The worked substitution demonstrates how each variable changes the result.",
    annotations: [mark("Use the formula y equals m x plus b.", "definition", "critical"), mark("Substitute the known slope and intercept.", "procedure", "high", 0), mark("Simplify the expression to obtain the final value.", "procedure", "high", 1), mark("The worked substitution demonstrates how each variable changes the result.", "supportingEvidence", "supporting")], required: ["procedure"],
  },
];

describe.each(fixtures)("page-adaptive annotation fixture: $name", fixture => {
  it("grounds exact current-page units and preserves instructional coverage without duplicates", () => {
    const grounded = groundSurgeonQuotes(fixture.annotations, fixture.pageText);
    const selected = limitAnnotationDensity(grounded, fixture.roles);
    const coverage = assessAnnotationCoverage(selected, fixture.roles);
    expect(coverage.complete).toBe(true);
    expect(coverage.duplicateCount).toBe(0);
    for (const type of fixture.required) expect(selected.some(item => item.canonicalType === type)).toBe(true);
    for (const item of selected) expect(fixture.pageText.includes(item.groundedText)).toBe(true);
    const targets = groundedAnnotationsToHighlightTargets(selected, "fixture-document", 1);
    expect(targets).toHaveLength(selected.length);
    expect(targets.every(target => target.text.length > 0)).toBe(true);
  });
});
