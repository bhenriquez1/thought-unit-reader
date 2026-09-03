// lib/whiteboard/buildProfessorLessonInput.ts
// Projects a VisualSceneGraph into the request body for
// pages/api/professor-lesson-plan.ts — OpenAI receives only node/edge ids +
// their short source text, never raw page text and never coordinates. It
// annotates what's already there; it doesn't invent structure or geometry.

import type { VisualSceneGraph } from "./visualSceneGraph";

export interface ProfessorLessonNodeInput {
  id: string;
  label: string;
  body: string;
  canonicalType: string | null;
  importanceLevel: string;
  role: string;
  /** Why this point matters — SurgeonAnnotation.reason, carried through
   *  unchanged from the same page read that selected this node. Gives the
   *  teaching AI more than a bare quote to narrate from. */
  reason: string | null;
}

export interface ProfessorLessonEdgeInput {
  id: string;
  fromId: string;
  toId: string;
  kind: string;
  label: string | null;
}

export interface ProfessorLessonInput {
  documentId: string;
  pageNumber: number;
  pageTruthKey: string;
  activeCanonicalUnitId: string | null;
  visualGrammarHint: string;
  /** The page classifier's own answer to "what kind of page is this?" —
   *  SurgeonAnnotationPlan.pageRole, decided fresh from this same page by
   *  the highlighting pipeline. When present, this is a STRONGER signal
   *  than visualGrammarHint (which only reflects the VSG's rule-based
   *  layout heuristic) for choosing teaching style. */
  pageTeachingType: string | null;
  vsgId: string;
  nodes: ProfessorLessonNodeInput[];
  edges: ProfessorLessonEdgeInput[];
  /** L18 — which register/visual-complexity to teach at. Optional; the API
   *  route defaults a missing/invalid value to "adult", so every caller
   *  that predates this field (the adult Reader, still the only real one)
   *  is unaffected. */
  audience?: "adult" | "child";
}

export function buildProfessorLessonInput(args: {
  vsg: VisualSceneGraph;
  documentId: string;
  pageTruthKey: string;
  activeCanonicalUnitId: string | null;
  pageTeachingType?: string | null;
  audience?: "adult" | "child";
}): ProfessorLessonInput {
  const { vsg, documentId, pageTruthKey, activeCanonicalUnitId, pageTeachingType, audience } = args;
  return {
    documentId,
    pageNumber:  vsg.sourcePageNumber ?? 0,
    pageTruthKey,
    activeCanonicalUnitId,
    visualGrammarHint: vsg.grammar,
    pageTeachingType: pageTeachingType ?? null,
    vsgId: vsg.id,
    ...(audience ? { audience } : {}),
    nodes: vsg.nodes.map(n => ({
      id: n.id,
      label: n.label,
      body: n.body,
      canonicalType: n.canonicalType,
      importanceLevel: n.importanceLevel,
      role: n.role,
      reason: n.reason ?? null,
    })),
    edges: vsg.edges.map(e => ({
      id: e.id,
      fromId: e.fromId,
      toId: e.toId,
      kind: e.kind,
      label: e.label ?? null,
    })),
  };
}
