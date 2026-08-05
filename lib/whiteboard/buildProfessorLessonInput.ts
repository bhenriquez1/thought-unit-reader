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
}

export function buildProfessorLessonInput(args: {
  vsg: VisualSceneGraph;
  documentId: string;
  pageTruthKey: string;
  activeCanonicalUnitId: string | null;
  pageTeachingType?: string | null;
}): ProfessorLessonInput {
  const { vsg, documentId, pageTruthKey, activeCanonicalUnitId, pageTeachingType } = args;
  return {
    documentId,
    pageNumber:  vsg.sourcePageNumber ?? 0,
    pageTruthKey,
    activeCanonicalUnitId,
    visualGrammarHint: vsg.grammar,
    pageTeachingType: pageTeachingType ?? null,
    vsgId: vsg.id,
    nodes: vsg.nodes.map(n => ({
      id: n.id,
      label: n.label,
      body: n.body,
      canonicalType: n.canonicalType,
      importanceLevel: n.importanceLevel,
      role: n.role,
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
