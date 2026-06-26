// lib/whiteboard/diagramPlan.ts
// Shared structured "diagram plan" contract for the unified Whiteboard engine.
// Both the Diagram-Steps canvas render and the AI-illustration image prompt
// are built from ONE of these — accuracy rule: plan first, render from plan.

export interface DiagramPlanNode {
  id: string;
  label: string;
  nx?: number;
  ny?: number;
}

export interface DiagramPlanArrow {
  from: string;
  to: string;
  label?: string;
}

export type DiagramPlanDrawType =
  | "flow"
  | "anatomy"
  | "comparison"
  | "table"
  | "graph"
  | "equation"
  | "timeline"
  | "cycle";

export interface DiagramPlanStep {
  title: string;
  content: string;
  type?: "text" | "draw" | "erase" | "image";
  drawType?: DiagramPlanDrawType;
  nodes?: DiagramPlanNode[];
  arrows?: DiagramPlanArrow[];
  payload?: { text?: string; anchorId?: string | null; sourceField?: string | null };
  objects?: string[];
}

export interface DiagramPlan {
  title: string;
  learningGoal: string;
  steps: DiagramPlanStep[];
  /** Flattened, deduped (by id) node set across all steps — the whole-board view. */
  nodes: DiagramPlanNode[];
  /** Flattened arrows across all steps. */
  arrows: DiagramPlanArrow[];
  formulas: string[];
  warnings: string[];
  memoryHooks: string[];
  sourceThoughtUnitId: string | null;
  pageNumber: number | null;
}

export interface BuildDiagramPlanOpts {
  title: string;
  learningGoal: string;
  sourceThoughtUnitId: string | null;
  pageNumber: number | null;
  warnings?: string[];
  memoryHooks?: string[];
  formulas?: string[];
}

/** Builds the whole-board DiagramPlan from per-step nodes/arrows + page-level context. */
export function buildDiagramPlan(steps: DiagramPlanStep[], opts: BuildDiagramPlanOpts): DiagramPlan {
  const nodeById = new Map<string, DiagramPlanNode>();
  const arrows: DiagramPlanArrow[] = [];
  const seenArrow = new Set<string>();

  for (const step of steps) {
    for (const n of step.nodes ?? []) {
      if (!nodeById.has(n.id)) nodeById.set(n.id, n);
    }
    for (const a of step.arrows ?? []) {
      const key = `${a.from}->${a.to}:${a.label ?? ""}`;
      if (!seenArrow.has(key)) {
        seenArrow.add(key);
        arrows.push(a);
      }
    }
  }

  return {
    title: opts.title,
    learningGoal: opts.learningGoal,
    steps,
    nodes: Array.from(nodeById.values()),
    arrows,
    formulas: opts.formulas ?? [],
    warnings: opts.warnings ?? [],
    memoryHooks: opts.memoryHooks ?? [],
    sourceThoughtUnitId: opts.sourceThoughtUnitId,
    pageNumber: opts.pageNumber,
  };
}
