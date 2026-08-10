import { buildProfessorTeachingActions } from "../../lib/whiteboard/buildProfessorTeachingActions";
import type { GroundedProfessorLessonScript } from "../../lib/whiteboard/groundProfessorLesson";
import type { ProfessorLessonSourceSnapshot } from "../../lib/whiteboard/professorLessonPlan";
import type { VisualSceneGraph } from "../../lib/whiteboard/visualSceneGraph";

const SNAPSHOT: ProfessorLessonSourceSnapshot = {
  documentId: "doc", pageNumber: 4, pageTruthKey: "doc::4", activeCanonicalUnitId: null,
  vsgId: "director-vsg", plannerVersion: 7,
};

const VSG: VisualSceneGraph = {
  id: "director-vsg", grammar: "flow", drawType: "flow", builtAt: 0, sourcePageNumber: 4,
  canvas: { width: 460, height: 300 },
  nodes: [
    { id: "definition", sourceId: "src-definition", label: "Definition", body: "A source-faithful definition from the current page.", canonicalType: "definition", importanceLevel: "high", tier: "step", role: "step", position: { x: 0, y: 0 }, size: { w: 200, h: 56 } },
    { id: "process", sourceId: "src-process", label: "Process", body: "The current page says the process moves from input to output.", canonicalType: "process", importanceLevel: "critical", tier: "master", role: "step", position: { x: 0, y: 80 }, size: { w: 200, h: 56 } },
  ],
  edges: [],
};

const GROUNDED: GroundedProfessorLessonScript = {
  title: "Adaptive Lesson",
  visualGrammar: "mechanism",
  teachingStructures: ["definition-concept", "mechanism-causal-process"],
  centralQuestion: "What changes and why?",
  learningObjective: "Explain the page in its own terms.",
  synthesisQuestion: "How do the definition and process fit together?",
  groups: [{ id: "core", type: "mechanism", order: 1, nodeIds: ["definition", "process"] }],
  nodeScripts: [
    {
      targetId: "definition", shortLabel: "Core definition", narration: "In plain language, this establishes the term.",
      tone: "explain", pace: "normal", emphasize: false, explain: [], teachingRole: "definition",
      spatialIntent: "central-mechanism", drawingIntent: "definition", emphasisTreatment: "none", relationships: [],
      sourceEvidence: ["definition"], teachingGoal: "State the definition accurately.", teachingStructure: "definition-concept",
      visualNeeded: false, visualIntent: "Verbal explanation is sufficient.", cameraIntent: "stay-on-pdf", checkpoint: null,
    },
    {
      targetId: "process", shortLabel: "Input becomes output", narration: "Now follow the change from input to output.",
      tone: "explain", pace: "normal", emphasize: true, explain: [], teachingRole: "mechanism",
      spatialIntent: "central-mechanism", drawingIntent: "chain", emphasisTreatment: "circle", relationships: [],
      sourceEvidence: ["process"], teachingGoal: "Explain the causal transition.", teachingStructure: "mechanism-causal-process",
      visualNeeded: true, visualIntent: "Reveal the process as a causal step.", cameraIntent: "follow-sequence", checkpoint: "What changes at this step?",
    },
  ],
};

describe("Professor Director orchestration", () => {
  const plan = buildProfessorTeachingActions(VSG, GROUNDED, SNAPSHOT);

  it("emits the explicit domain-adaptive Director contract for every canonical teaching step", () => {
    expect(plan.directorSteps).toHaveLength(2);
    expect(plan.directorSteps?.[0]).toMatchObject({
      sourceEvidence: [{ targetId: "definition", sourceId: "src-definition" }],
      teachingGoal: "State the definition accurately.",
      teachingStructure: "definition-concept",
      visualNeeded: false,
      cameraIntent: "stay-on-pdf",
      checkpoint: null,
    });
    expect(plan.directorSteps?.[1]).toMatchObject({
      teachingStructure: "mechanism-causal-process",
      visualNeeded: true,
      cameraIntent: "follow-sequence",
      checkpoint: "What changes at this step?",
    });
  });

  it("keeps a verbal-only Thought Unit on the PDF and emits no geometry for it", () => {
    const step = plan.directorSteps![0];
    const actions = plan.actions.filter(action => action.stepId === step.stepId);
    expect(actions.some(action => action.type === "set-surface" && action.surface === "pdf")).toBe(true);
    expect(actions.some(action => action.type === "set-surface" && action.surface === "whiteboard")).toBe(false);
    expect(step.drawInstructions).toHaveLength(0);
  });

  it("reads grounded source before explanation, then opens and progressively draws only the visual step", () => {
    const visualStep = plan.directorSteps![1];
    const actions = plan.actions.filter(action => action.stepId === visualStep.stepId);
    const sourceSpeakIndex = actions.findIndex(action => action.type === "speak" && plan.segments.find(segment => segment.id === action.segmentId)?.contentRole === "SOURCE_VERBATIM");
    const openBoardIndex = actions.findIndex(action => action.type === "set-surface" && action.surface === "whiteboard");
    const drawIndex = actions.findIndex(action => action.type === "draw-shape");
    expect(sourceSpeakIndex).toBeGreaterThanOrEqual(0);
    expect(openBoardIndex).toBeGreaterThan(sourceSpeakIndex);
    expect(drawIndex).toBeGreaterThan(openBoardIndex);
    expect(visualStep.sourceEvidence[0].exactText).toBe(VSG.nodes[1].body);
  });

  it("gives the active step deterministic focus bounds and an intent-aware camera action", () => {
    const visualStep = plan.directorSteps![1];
    const camera = plan.actions.find(action => action.type === "move-camera" && action.stepId === visualStep.stepId);
    expect(camera).toMatchObject({ type: "move-camera", cameraIntent: "follow-sequence" });
    expect(camera?.type === "move-camera" && camera.focusBounds).toEqual(visualStep.focusBounds);
    expect(camera?.type === "move-camera" && camera.targetIds).not.toContain("shape:pn-definition");
  });
});
