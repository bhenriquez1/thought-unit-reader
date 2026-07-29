// lib/whiteboard/visualPlan.ts
// WhiteboardVisualPlan — structured plan used to generate Whiteboard
// illustrations from Canonical Thought Units. A richer, semantically-grounded
// counterpart to DiagramPlan that drives subject-specific image generation.

import type { NoteCard } from "@/lib/insights/synthesizeTeachingOutput";

export type PageSubject = "chemistry" | "biology" | "clinical" | "default";

// ---------------------------------------------------------------------------
// Subject detection
// ---------------------------------------------------------------------------

const CHEM_RX = /stoichiometr|molar\s*mass|molarity|molality|\bmol\b|balancing|oxidation|reduction|equilibrium|\bacid\b|\bbase\b|buffer|\bpH\b|gas law|enthalpy|entropy|electronegativity|hybridization|resonance|isomer|polymer|coulomb|wavelength|photon|orbital|periodic|electron/i;
const BIO_RX  = /\bcell\b|protein|\bdna\b|\brna\b|gene|chromosome|mitosis|meiosis|enzyme|metabolism|\batp\b|photosynthesis|respiration|evolution|natural selection|membrane|organelle|nucleus|transcription|translation|mutation|phenotype|genotype/i;
const CLIN_RX = /diagnosis|treatment|patient|clinical|dental|\btooth\b|caries|symptom|pathology|disease|therapy|pharmacology|prognosis|complication|pulp|enamel|dentin|periodontal/i;

/**
 * Detect page subject from text fragments of the study model alone.
 * Faster than the NoteCard-based detector in WorkspaceSteps (no card scan needed)
 * and safe to call without noteCards.
 */
export function detectSubjectFromStudyModel(sm: any): PageSubject {
  const text = [sm?.pageThesis, sm?.studyNotes?.keyMechanism, sm?.studyNotes?.whyThisMatters]
    .filter(Boolean).join(" ");
  if (CHEM_RX.test(text)) return "chemistry";
  if (BIO_RX.test(text))  return "biology";
  if (CLIN_RX.test(text)) return "clinical";
  return "default";
}

/**
 * Full subject detection including NoteCard type scan — mirrors WorkspaceSteps
 * logic for cases where note cards are already available (e.g. WhiteboardPanel).
 */
export function detectSubjectFull(sm: any, noteCards: NoteCard[]): PageSubject {
  const base = detectSubjectFromStudyModel(sm);
  if (base !== "default") return base;
  if (noteCards.some(c => c.type === "formula_breakdown")) return "chemistry";
  return "default";
}

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

// ---------------------------------------------------------------------------
// Canonical unit visual type mapping (Phase 5)
// ---------------------------------------------------------------------------

const CANONICAL_VISUAL_TYPE: Partial<Record<string, VisualType>> = {
  "cause":           "flowchart",
  "effect":          "flowchart",
  "process":         "flowchart",
  "mechanism":       "mechanism",
  "indication":      "decision-tree",
  "contraindication": "decision-tree",
  "decision-point":  "decision-tree",
  "formula":         "equation-map",
  "worked-example":  "worked-example",
  "definition":      "anatomy",
  "core-concept":    "anatomy",
  "classification":  "table",
  "evidence":        "table",
  "memory-anchor":   "cycle",
  "high-yield":      "flowchart",
  "clinical-pearl":  "decision-tree",
  "treatment":       "flowchart",
  "relationship":    "mechanism",
};

export interface CanonicalVisualEntry {
  id: string;
  text: string;
  title?: string;
  canonicalType?: string;
  importanceScore?: number;
  priorityTier?: number;
}

/**
 * Build a WhiteboardVisualPlan from canonical thought units (Phase 5).
 * Populates `sourceCanonicalUnitIds` — previously always left as `[]`.
 */
export function buildVisualPlanFromCanonical(
  entries: CanonicalVisualEntry[],
  pageTitle?: string,
): WhiteboardVisualPlan {
  if (entries.length === 0) {
    return {
      subject: "default",
      topic: pageTitle ?? "Concept",
      visualType: "flowchart",
      learningGoal: "Understand the key concepts on this page",
      requiredLabels: [],
      sequence: [],
      warnings: [],
      sourceCanonicalUnitIds: [],
    };
  }

  // Pick visual type from the most common canonical type.
  const typeCounts = new Map<string, number>();
  for (const e of entries) {
    const ct = e.canonicalType ?? "core-concept";
    typeCounts.set(ct, (typeCounts.get(ct) ?? 0) + 1);
  }
  const dominantType = Array.from(typeCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "core-concept";
  const visualType: VisualType = CANONICAL_VISUAL_TYPE[dominantType] ?? "flowchart";

  // Subject detection from canonical type cluster.
  const types = new Set(entries.map((e) => e.canonicalType ?? ""));
  let subject = "default";
  if (types.has("indication") || types.has("contraindication") || types.has("treatment") || types.has("complication")) subject = "clinical";
  else if (types.has("formula") || types.has("worked-example")) subject = "chemistry";
  else if (types.has("mechanism") || types.has("cause") || types.has("effect")) subject = "biology";

  // Required labels from the top entries' titles.
  const requiredLabels = entries
    .filter((e) => e.title)
    .slice(0, 6)
    .map((e) => e.title!);

  // Sequence from entry titles (or truncated text).
  const sequence = entries
    .slice(0, 8)
    .map((e) => e.title ?? e.text.slice(0, 60).trim())
    .filter(Boolean);

  // Warnings from warning/contraindication entries.
  const warnings = entries
    .filter((e) => e.canonicalType === "warning" || e.canonicalType === "contraindication")
    .map((e) => e.title ?? e.text.slice(0, 80));

  return {
    subject,
    topic: pageTitle ?? (entries[0]?.title ?? "Concept"),
    visualType,
    learningGoal: `Understand the semantic relationships between ${entries.length} canonical unit${entries.length !== 1 ? "s" : ""}.`,
    requiredLabels,
    sequence,
    warnings,
    sourceCanonicalUnitIds: entries.map((e) => e.id),
  };
}

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
