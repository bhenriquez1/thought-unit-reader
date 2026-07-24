// lib/whiteboard/visualPlan.ts
// WhiteboardVisualPlan — structured plan used to generate Whiteboard
// illustrations from Canonical Thought Units. A richer, semantically-grounded
// counterpart to DiagramPlan that drives subject-specific image generation.

export type VisualType =
  | "flowchart"
  | "mechanism"
  | "comparison"
  | "worked-example"
  | "anatomy"
  | "decision-tree"
  | "equation-map"
  | "reaction-pathway"
  | "cycle"
  | "timeline"
  | "table";

export interface WhiteboardVisualPlan {
  /** The detected or inferred subject of this lesson. */
  subject: string;
  /** The page or concept title. */
  topic: string;
  /** What kind of visual best communicates this concept. */
  visualType: VisualType;
  /** What the student should understand after seeing this visual. */
  learningGoal: string;
  /** Key labels that must appear in the generated visual. */
  requiredLabels: string[];
  /** Ordered steps or elements to depict in the visual. */
  sequence: string[];
  /** Common traps or errors to call out. */
  warnings: string[];
  /** IDs of the CanonicalThoughtUnits this visual is grounded in. */
  sourceCanonicalUnitIds: string[];
}

const SUBJECT_VISUAL_TYPE: Record<string, VisualType> = {
  chemistry: "equation-map",
  biology:   "mechanism",
  clinical:  "decision-tree",
  default:   "flowchart",
};

/** Build a WhiteboardVisualPlan from a study model and detected subject. */
export function buildVisualPlanFromStudyModel(
  sm: Record<string, unknown>,
  subject: "chemistry" | "biology" | "clinical" | "default",
): WhiteboardVisualPlan {
  const a = sm as any;
  const thesis    = a?.pageThesis ?? "";
  const mechanism = a?.studyNotes?.keyMechanism ?? "";
  const traps     = a?.studyNotes?.commonMisconceptions ?? "";
  const blocks: any[] = Array.isArray(a?.conceptBlocks) ? a.conceptBlocks : [];

  const sequence = blocks
    .slice(0, 6)
    .map((b: any) => b.title ?? b.pattern ?? "")
    .filter(Boolean);
  if (sequence.length === 0 && mechanism) sequence.push(mechanism);

  return {
    subject,
    topic:       thesis || "Concept",
    visualType:  SUBJECT_VISUAL_TYPE[subject] ?? "flowchart",
    learningGoal: mechanism || thesis || "Understand this concept",
    requiredLabels: blocks.slice(0, 4).map((b: any) => b.title ?? "").filter(Boolean),
    sequence,
    warnings:    traps ? [traps] : [],
    sourceCanonicalUnitIds: [],
  };
}
