// tests/whiteboard/professorAgentDomainAcceptance.test.ts
// Stabilization item 4B — acceptance fixtures across the domains the
// authorization explicitly required: anatomy, chemistry, biology, dentistry,
// surgical/medical, math, history, business/leadership, procedure,
// comparison.
//
// This sandbox cannot make live Claude API calls or run a real browser, so
// "the runtime agent draws something rich" itself can't be exercised here —
// see the PR report's honest limitations section. What CAN be proven, for
// every domain below, is the specific thing item 4B fixed: (1) a
// relationship-heavy teaching step whose one endpoint isn't independently
// drawn still gets a real, non-null focusBounds instead of silently
// becoming ineligible, and (2) a real, source-backed entity label that was
// never predeclared in allowedLabels still survives grounding verification
// instead of being discarded. Both are the exact upstream gates that were
// silently zeroing out rich content before Claude ever got a chance to draw
// it — proving they're open, for every domain, is the correct-scoped
// acceptance test here.

import { buildProfessorTeachingActions } from "../../lib/whiteboard/buildProfessorTeachingActions";
import type { GroundedProfessorLessonScript } from "../../lib/whiteboard/groundProfessorLesson";
import type { VisualSceneGraph } from "../../lib/whiteboard/visualSceneGraph";
import type { ProfessorLessonSourceSnapshot, ProfessorLessonPlan, ProfessorTeachingAction } from "../../lib/whiteboard/professorLessonPlan";
import {
  buildProfessorTldrawAgentRequest,
  verifyProfessorTldrawAgentResponse,
  isNontrivialProfessorAgentAction,
} from "../../lib/whiteboard/professorTldrawAgent";

const SNAPSHOT: ProfessorLessonSourceSnapshot = {
  documentId: "doc-domain", pageNumber: 1, pageTruthKey: "doc-domain::1::t",
  activeCanonicalUnitId: null, vsgId: "vsg_domain", plannerVersion: 1,
};

interface DomainFixture {
  domain: string;
  /** The drawn concept's label. */
  drawnLabel: string;
  /** The relationship-partner concept's label — deliberately never drawn,
   *  matching "a concept the AI's script didn't give its own shape." */
  undrawnLabel: string;
  /** This step's spoken narration — deliberately generic, never naming the
   *  entity below directly (mirrors "the team" vs. naming each role). */
  narration: string;
  /** The canonical current-page source passage for this step — the ONLY
   *  place `entityLabel` actually appears. */
  sourceEvidenceText: string;
  /** A real, source-backed entity name present ONLY in sourceEvidenceText. */
  entityLabel: string;
}

const DOMAINS: DomainFixture[] = [
  {
    domain: "anatomy",
    drawnLabel: "Femoral triangle", undrawnLabel: "Femoral nerve",
    narration: "Several structures pass through this region together.",
    sourceEvidenceText: "The femoral triangle contains the femoral nerve, artery, vein, and the great saphenous vein at its apex.",
    entityLabel: "great saphenous vein",
  },
  {
    domain: "chemistry",
    drawnLabel: "Ionic bond", undrawnLabel: "Hydration shell",
    narration: "The compound separates into charged particles in water.",
    sourceEvidenceText: "NaCl dissociates into Na+ and Cl- ions, each surrounded by a hydration shell of polar water molecules.",
    entityLabel: "Na+ and Cl- ions",
  },
  {
    domain: "biology",
    drawnLabel: "Mitochondria", undrawnLabel: "ATP synthesis",
    narration: "This organelle produces the cell's usable energy.",
    sourceEvidenceText: "The inner membrane folds into cristae, which house the electron transport chain and ATP synthase.",
    entityLabel: "cristae",
  },
  {
    domain: "dentistry",
    drawnLabel: "Bilateral finger rests", undrawnLabel: "Tray stability",
    narration: "Proper hand position keeps the instrument tray steady.",
    sourceEvidenceText: "Bilateral finger rests use the fulcrum point on adjacent teeth to stabilize the working hand.",
    entityLabel: "fulcrum",
  },
  {
    domain: "surgical/medical (leadership)",
    drawnLabel: "Team leader", undrawnLabel: "Communication",
    narration: "Strong leadership drives team communication and safety.",
    sourceEvidenceText: "The surgeon, nurses, anesthesiologist, and residents each play a distinct role under the team leader.",
    entityLabel: "anesthesiologist",
  },
  {
    domain: "math",
    drawnLabel: "Derivative", undrawnLabel: "Rate of change",
    narration: "This operation describes how a function changes.",
    sourceEvidenceText: "The derivative is defined as the limit of the difference quotient as the interval approaches zero.",
    entityLabel: "difference quotient",
  },
  {
    domain: "history",
    drawnLabel: "Treaty signing", undrawnLabel: "Political consequence",
    narration: "The agreement reshaped the region's politics.",
    sourceEvidenceText: "The treaty required ratification by both parliaments before the ceasefire could take effect.",
    entityLabel: "ratification",
  },
  {
    domain: "business/leadership",
    drawnLabel: "Vision", undrawnLabel: "Execution",
    narration: "A clear vision must translate into action across the org.",
    sourceEvidenceText: "Leaders secure stakeholder buy-in before rolling out a new strategic plan.",
    entityLabel: "stakeholder buy-in",
  },
  {
    domain: "procedure",
    drawnLabel: "Step 1: prep", undrawnLabel: "Step 2: incision",
    narration: "Preparation comes before the first cut.",
    sourceEvidenceText: "After prep, the sterile field is established before the incision step begins.",
    entityLabel: "sterile field",
  },
  {
    domain: "comparison",
    drawnLabel: "Option A", undrawnLabel: "Option B",
    narration: "Each option carries different tradeoffs.",
    sourceEvidenceText: "A full cost-benefit analysis favors option A on price and option B on speed.",
    entityLabel: "cost-benefit",
  },
];

function makeDomainVsg(fixture: DomainFixture): VisualSceneGraph {
  return {
    id: `vsg_${fixture.domain}`, grammar: "flow", drawType: "flow",
    nodes: [
      { id: "n1", label: "n1", body: fixture.sourceEvidenceText, canonicalType: "definition", importanceLevel: "critical", tier: "master", role: "step", position: { x: 85, y: 22 }, size: { w: 290, h: 52 }, sourceId: "source-drawn" },
      { id: "n2", label: "n2", body: "n2 body", canonicalType: "definition", importanceLevel: "high", tier: "step", role: "step", position: { x: 85, y: 200 }, size: { w: 290, h: 52 }, sourceId: "source-undrawn" },
    ],
    // n2 has no nodeScripts entry below — the relationship partner that was
    // never independently drawn, matching the surgical-leadership screenshot.
    edges: [{ id: "e1", fromId: "n1", toId: "n2", kind: "causation", label: fixture.undrawnLabel }],
    canvas: { width: 460, height: 300 }, builtAt: 0,
  };
}

function makeDomainGrounded(fixture: DomainFixture): GroundedProfessorLessonScript {
  return {
    title: "T", visualGrammar: "concept-map", centralQuestion: "Q", learningObjective: "L", synthesisQuestion: "S",
    nodeScripts: [
      { targetId: "n1", shortLabel: fixture.drawnLabel, narration: fixture.narration, tone: "introduce", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", relationships: [], explain: [] },
      { targetId: "e1", shortLabel: fixture.undrawnLabel, narration: fixture.narration, tone: "connect", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", relationships: [], explain: [] },
    ],
    groups: [],
  };
}

describe.each(DOMAINS)("Professor visual-agent acceptance — $domain", (fixture) => {
  it("REQUIRED: a relationship-heavy step whose partner concept isn't independently drawn still gets a real focusBounds — reaches the runtime agent instead of silently becoming ineligible", () => {
    const plan = buildProfessorTeachingActions(makeDomainVsg(fixture), makeDomainGrounded(fixture), SNAPSHOT);
    const edgeStep = plan.directorSteps!.find(step => step.targetId === "e1");
    expect(edgeStep).toBeDefined();
    expect(edgeStep!.focusBounds).not.toBeNull();
    expect(plan.actions.some(a => a.type === "move-camera" && (a as any).stepId === edgeStep!.stepId)).toBe(true);
  });

  it("REQUIRED: a nontrivial visual primitive is not blocked merely because a source-backed entity label was never predeclared in allowedLabels", () => {
    const DRAW: ProfessorTeachingAction = { type: "draw-shape", actionId: "d1", shapeId: "shape:n1", targetId: "source-drawn", shape: "box", bounds: { x: 0, y: 0, w: 120, h: 70 }, durationMs: 1, stepId: 1 };
    const CAMERA: ProfessorTeachingAction = { type: "move-camera", actionId: "c1", targetIds: ["shape:n1"], retainContextTargetIds: [], cameraIntent: "active-concept", focusBounds: { x: 0, y: 0, w: 120, h: 70 }, durationMs: 1, stepId: 1 };
    const plan: ProfessorLessonPlan = {
      visualGrammar: "concept-map", teachingStructures: ["mechanism-causal-process"],
      title: "T", centralQuestion: "Q", learningObjective: "L", synthesisQuestion: "S",
      sourceSnapshot: SNAPSHOT, segments: [],
      actions: [CAMERA, DRAW],
      directorSteps: [{
        stepId: 1, targetId: "n1",
        sourceEvidence: [{ targetId: "n1", sourceId: "source-drawn", exactText: fixture.sourceEvidenceText }],
        teachingGoal: fixture.narration, teachingStructure: "mechanism-causal-process",
        visualNeeded: true, visualIntent: fixture.narration, narration: fixture.narration,
        drawInstructions: [CAMERA, DRAW], relationships: [], emphasis: [],
        focusBounds: { x: 0, y: 0, w: 120, h: 70 }, cameraIntent: "active-concept", checkpoint: null,
      }],
    };
    const request = buildProfessorTldrawAgentRequest({
      plan, stepId: 1, pass: "execute",
      canvas: { viewportBounds: { x: -50, y: -50, w: 500, h: 300 }, screenshotBase64: null, shapes: [] },
    })!;
    expect(request).not.toBeNull();
    expect(request.step.sourceEvidenceText).toContain(fixture.sourceEvidenceText);

    const verified = verifyProfessorTldrawAgentResponse(request, {
      stepId: 1, pass: "execute", complete: true,
      assessment: { needsCorrection: false, issues: [] },
      actions: [
        { tool: "writeLabel", localId: "entity", sourceTargetId: "source-drawn", text: fixture.entityLabel, x: 10, y: 10, color: "black", size: "m", attachToLocalId: null },
        { tool: "drawFlowArrow", localId: "arrow", sourceTargetId: "source-drawn", from: { x: 0, y: 0 }, to: { x: 50, y: 50 }, color: "green", size: "m", dash: "draw" },
      ],
    });
    expect(verified.actions.some(a => a.type === "write" && a.text === fixture.entityLabel)).toBe(true);
    expect(verified.rejectedActionCount).toBe(0);
    // A generic labeled rectangle alone must fail this bar — the arrow is
    // what makes this a nontrivial (not box-only) visual, matching the
    // acceptance rule that a rectangle-plus-label never counts on its own.
    expect(verified.actions.some((a: ProfessorTeachingAction) => isNontrivialProfessorAgentAction(a))).toBe(true);
  });
});
