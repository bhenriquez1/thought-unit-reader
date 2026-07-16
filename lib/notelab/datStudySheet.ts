// lib/notelab/datStudySheet.ts
// Type definitions for the DAT Study Sheet — a one-concept, visually structured
// study page in the style of Gen Chem Mike's notes.
// Generated via /api/dat-study-sheet using Zod structured output from OpenAI.

import { z } from "zod";

// ── Question (used for DAT Pearl interactive panel) ───────────────────────

export const DATQuestionSchema = z.object({
  question:     z.string(),
  options:      z.array(z.string()),        // exactly 4 items
  correctIndex: z.number().int().min(0).max(3),
  explanation:  z.string(),
});
export type DATQuestion = z.infer<typeof DATQuestionSchema>;

// ── Diagram (rendered inline by DATStudySheetCard) ────────────────────────

export const DiagramTypeSchema = z.enum([
  "flow",           // linear A→B→C chain
  "reaction",       // reactants → products
  "energy_diagram", // potential energy curve
  "comparison",     // two-column side-by-side
  "cycle",          // circular process
  "table",          // rows/columns grid
  "anatomy",        // labeled diagram described in text
  "none",           // no diagram — omit this section
]);

export const DATDiagramNodeSchema = z.object({
  id:    z.string(),
  label: z.string(),
});

export const DATDiagramArrowSchema = z.object({
  from:  z.string(),                // node id
  to:    z.string(),                // node id
  label: z.string().nullable(),     // edge label, e.g. "+heat"
});

export const DATDiagramSchema = z.object({
  type:        DiagramTypeSchema,
  title:       z.string(),
  nodes:       z.array(DATDiagramNodeSchema).nullable(),  // used by flow/cycle/anatomy
  arrows:      z.array(DATDiagramArrowSchema).nullable(), // used by flow/reaction/cycle
  rows:        z.array(z.array(z.string())).nullable(),   // used by table (first row = header)
  description: z.string(), // plain-text fallback and title context
});
export type DATDiagram = z.infer<typeof DATDiagramSchema>;

// ── Full study sheet ──────────────────────────────────────────────────────

export const DATStudySheetSchema = z.object({
  // 1. Title
  concept:     z.string(),
  subjectArea: z.string(), // "General Chemistry" | "Organic Chemistry" | "Biology" | etc.

  // 2. Core Idea — exactly one sentence
  coreIdea: z.string(),

  // 3. Key Facts — 3-6 high-yield bullets
  keyFacts: z.array(z.string()),

  // 4. DAT Pearl + 3 interactive questions (loaded on click)
  datPearl:          z.string(),
  datPearlQuestions: z.array(DATQuestionSchema).nullable(), // 3 questions about the pearl

  // 5. Common Trap + wrong-vs-correct breakdown (loaded on click)
  commonTrap: z.string(),
  trapBreakdown: z.object({
    wrongThinking:    z.string(),
    correctReasoning: z.string(),
  }).nullable(),

  // 6. Mechanism — WHY, not just WHAT
  mechanism: z.object({
    summary: z.string(),
    steps:   z.array(z.string()), // 3-5 causal steps
  }),

  // 7. Step-by-Step Process — exam-ready procedure
  process: z.object({
    title: z.string(),
    steps: z.array(z.string()), // 4-6 ordered steps with ↓ connectors in UI
  }).nullable(),

  // 8. Visual Diagram
  diagram: DATDiagramSchema.nullable(),

  // 9. Formula Box
  formula: z.object({
    expression: z.string(),          // e.g. "K = [Products] / [Reactants]"
    description: z.string(),         // what it calculates / when to apply it
    variables: z.array(z.object({
      symbol:  z.string(),
      meaning: z.string(),
    })).nullable(),
  }).nullable(),

  // 10. Memory Tricks
  memoryTrick: z.object({
    trick:     z.string(),  // the mnemonic/acronym/story
    expansion: z.string(),  // what each part means
  }).nullable(),

  // 11. Real DAT Example — one exam-style question
  datExample: z.object({
    question:  z.string(),
    answer:    z.string(),
    reasoning: z.string(), // why — not just what
  }),

  // 12. Mistakes Students Make — 2-4 common errors
  mistakes: z.array(z.string()),

  // 13. Expert Brain Connections — cross-subject links
  connections: z.array(z.object({
    from:       z.string(), // source concept/subject
    to:         z.string(), // destination concept/subject
    connection: z.string(), // how they relate
  })),

  // 14. Related Topics
  relatedTopics: z.array(z.string()),
});

export type DATStudySheet = z.infer<typeof DATStudySheetSchema>;
