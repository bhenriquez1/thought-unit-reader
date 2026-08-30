// tests/notelab/notebookPlanner.test.ts
// N2 — shared visual vocabulary + NotebookPlanner schema. Real behavioral
// tests against the actual exported schemas/functions (no React/DOM/network
// dependency — same discipline as tests/notelab/buildNoteFromStudyModelThesisOverride.test.ts).
//
// The core thing this file guards: NotebookPlanner composes pages from real
// visual PRIMITIVES chosen per page, never a fixed set of labeled sections
// (that anti-pattern was retired in N1) — and every grounding-required
// primitive (highlight/underline/source_anchor) is either a verified
// verbatim quote or dropped entirely, never a paraphrase and never guessed.

import {
  NotebookPrimitiveSchema,
  NotebookBlockSchema,
  FinalizedNotebookBlockSchema,
  VisualNotebookSceneSchema,
  GROUNDING_REQUIRED_PRIMITIVES,
} from "../../lib/notelab/notebookScene";
import {
  NotebookPlanSchema,
  buildNotebookPlannerSystemPrompt,
  buildNotebookPlannerUserPrompt,
  finalizeNotebookScene,
  type NotebookPlan,
  type NotebookPlanBlock,
} from "../../lib/notelab/notebookPlanner";
import type { CanonicalThoughtUnit } from "../../lib/canonical/types";

function makeUnit(overrides: Partial<CanonicalThoughtUnit> = {}): CanonicalThoughtUnit {
  return {
    id: "doc-1:0:0",
    documentId: "doc-1",
    pageIndex: 3,
    unitIndex: 0,
    text: "Ethanol reacts with oxygen to produce acetic acid through a multi-step oxidation.",
    anchor: {
      pageIndex: 3, startChar: 0, endChar: 10, quote: "Ethanol reacts",
    },
    datSection: "survey-natural-sciences" as any,
    datTopic: "general-chemistry" as any,
    datUnitType: "concept" as any,
    datRelevance: 0.5,
    classificationConfidence: 0.5,
    classificationSource: "heuristic" as any,
    difficulty: 0.5,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function planBlock(overrides: Partial<NotebookPlanBlock>): NotebookPlanBlock {
  return {
    primitive: "text",
    content: "Some composed explanation.",
    detail: null,
    groupId: null,
    order: 0,
    sourceUnitIndex: 0,
    relationshipKind: null,
    ...overrides,
  };
}

describe("NotebookPrimitiveSchema — the real visual vocabulary, not a card taxonomy", () => {
  it("REQUIRED: covers exactly the primitives the correction specified, plus M1's later additions (concept_group/bracket/handwritten_text)", () => {
    const expected = [
      "text", "heading", "freehand", "highlight", "underline", "arrow", "connector",
      "formula", "equation_work", "diagram", "label", "table", "timeline", "flow",
      "comparison", "concept_map", "image", "callout", "example", "source_anchor",
      "concept_group", "bracket", "handwritten_text",
    ].sort();
    expect(NotebookPrimitiveSchema.options.slice().sort()).toEqual(expected);
  });

  it("does not contain any of the retired fixed-section labels as primitives", () => {
    const retired = ["chief_concern", "danger_zone", "clinical_pearl", "memory_hook", "procedure_logic", "dat_tip"];
    for (const label of retired) {
      expect(NotebookPrimitiveSchema.options).not.toContain(label);
    }
  });

  it("REQUIRED: GROUNDING_REQUIRED_PRIMITIVES is exactly highlight/underline/source_anchor", () => {
    expect(new Set(GROUNDING_REQUIRED_PRIMITIVES)).toEqual(new Set(["highlight", "underline", "source_anchor"]));
  });
});

describe("Schema validation — real Zod parsing, not just TypeScript types", () => {
  it("NotebookBlockSchema accepts a minimal valid block", () => {
    expect(() => NotebookBlockSchema.parse({
      id: "b1", primitive: "formula", content: "F = ma", detail: null, groupId: null, order: 0, sourceUnitIndex: 0, relationshipKind: null,
    })).not.toThrow();
  });

  it("FinalizedNotebookBlockSchema requires the provenance fields the AI-facing schema omits", () => {
    expect(() => FinalizedNotebookBlockSchema.parse({
      id: "b1", primitive: "text", content: "x", detail: null, groupId: null, order: 0, sourceUnitIndex: 0,
    })).toThrow();
    expect(() => FinalizedNotebookBlockSchema.parse({
      id: "b1", primitive: "text", content: "x", detail: null, groupId: null, order: 0, sourceUnitIndex: 0, relationshipKind: null,
      canonicalUnitId: null, sourceId: null, page: null, confidence: 0.6, generatedFrom: "ai",
    })).not.toThrow();
  });

  it("VisualNotebookSceneSchema accepts an empty-blocks scene (a page with nothing to compose yet)", () => {
    expect(() => VisualNotebookSceneSchema.parse({
      id: "s1", bookId: "book-1", pageNumber: 1, teachingStructure: null, blocks: [], builtAt: Date.now(),
    })).not.toThrow();
  });

  it("NotebookPlanSchema (the AI-facing shape) rejects a block missing a required field", () => {
    expect(() => NotebookPlanSchema.parse({
      teachingStructure: null,
      blocks: [{ primitive: "text", content: "x", order: 0, sourceUnitIndex: 0 }], // missing detail/groupId
    })).toThrow();
  });
});

describe("buildNotebookPlannerSystemPrompt — page-adaptive, never fixed-section instructions", () => {
  const prompt = buildNotebookPlannerSystemPrompt();

  it("REQUIRED: explicitly rejects fixed sections/cards", () => {
    expect(prompt).toMatch(/not filling in a fixed set of labeled sections/i);
    expect(prompt).toMatch(/never pad, never force/i);
  });

  it("REQUIRED: lists the full primitive vocabulary", () => {
    for (const primitive of NotebookPrimitiveSchema.options) {
      expect(prompt).toContain(primitive);
    }
  });

  it("REQUIRED: states the grounding rule for highlight/underline/source_anchor", () => {
    expect(prompt).toMatch(/VERBATIM/);
    expect(prompt).toMatch(/discarded entirely/i);
  });

  it("M1: instructs the model on relationshipKind for arrow/connector blocks", () => {
    expect(prompt).toMatch(/relationshipKind/);
    expect(prompt).toMatch(/causes, leads-to, warns-about, supports, contrasts, part-of/);
  });

  it("M2: explicitly states that multi-source context (Professor explanation/student notes/supplemental sources) is never a valid grounding source", () => {
    expect(prompt).toMatch(/MULTI-SOURCE CONTEXT/);
    expect(prompt).toMatch(/NEVER a valid source for a highlight\/underline\/source_anchor block/);
  });

  it("includes subject-adaptive worked examples spanning multiple, genuinely different domains", () => {
    for (const domain of ["chemical compounds", "Atomic orbitals", "Gas laws", "Anatomy", "Pathology", "History", "Literature", "Mathematics", "Elena Mode"]) {
      expect(prompt).toContain(domain);
    }
  });

  it("REQUIRED: retired fixed-section labels appear only inside the explicit 'there is no such slot' disclaimer, never offered as primitives or examples to use", () => {
    for (const label of ["Chief Concern", "Danger Zone"]) {
      const idx = prompt.indexOf(label);
      expect(idx).toBeGreaterThan(-1);
      expect(prompt.slice(Math.max(0, idx - 20), idx)).toMatch(/no "/);
    }
    // Labels that aren't part of the explicit disclaimer must not appear at all.
    for (const label of ["Clinical Pearl", "Memory Hook", "Procedure Logic", "DAT Tip"]) {
      expect(prompt).not.toContain(label);
    }
  });
});

describe("buildNotebookPlannerUserPrompt", () => {
  it("REQUIRED: numbers each unit so sourceUnitIndex citations are unambiguous", () => {
    const units = [makeUnit({ text: "First unit text." }), makeUnit({ text: "Second unit text." })];
    const prompt = buildNotebookPlannerUserPrompt(units, { bookTitle: "Gen Chem", pageNumber: 4 });
    expect(prompt).toMatch(/0\.[\s\S]*First unit text\./);
    expect(prompt).toMatch(/1\.[\s\S]*Second unit text\./);
    expect(prompt).toContain("Gen Chem");
    expect(prompt).toContain("Page: 4");
  });

  it("degrades gracefully with zero units instead of producing a malformed prompt", () => {
    const prompt = buildNotebookPlannerUserPrompt([], { pageNumber: 1 });
    expect(prompt).toMatch(/no thought units extracted/i);
  });

  it("M2: with none of the multi-source fields, the prompt is byte-identical to before this phase", () => {
    const units = [makeUnit({ text: "Some unit." })];
    const withoutSources = buildNotebookPlannerUserPrompt(units, { bookTitle: "Gen Chem", pageNumber: 4 });
    const withNullSources = buildNotebookPlannerUserPrompt(units, {
      bookTitle: "Gen Chem", pageNumber: 4, professorExplanation: null, studentNotes: null, supplementalSources: null,
    });
    expect(withNullSources).toBe(withoutSources);
    expect(withoutSources).not.toMatch(/PROFESSOR'S EXPLANATION|STUDENT'S OWN NOTES|SUPPLEMENTAL SOURCES/);
  });

  it("M2: includes the Professor's explanation as its own labeled, context-only section", () => {
    const prompt = buildNotebookPlannerUserPrompt([makeUnit()], {
      pageNumber: 1, professorExplanation: ["This is how buffers resist pH change.", "Notice the equilibrium shift."],
    });
    expect(prompt).toMatch(/PROFESSOR'S EXPLANATION/);
    expect(prompt).toMatch(/never a grounding source/);
    expect(prompt).toContain("This is how buffers resist pH change.");
    expect(prompt).toContain("Notice the equilibrium shift.");
  });

  it("M2: includes the student's own notes as their own labeled, context-only section", () => {
    const prompt = buildNotebookPlannerUserPrompt([makeUnit()], { pageNumber: 1, studentNotes: "  remember: buffers = weak acid + conjugate base  " });
    expect(prompt).toMatch(/STUDENT'S OWN NOTES/);
    expect(prompt).toContain("remember: buffers = weak acid + conjugate base");
  });

  it("M2: blank/whitespace-only studentNotes is treated as absent, not an empty section", () => {
    const prompt = buildNotebookPlannerUserPrompt([makeUnit()], { pageNumber: 1, studentNotes: "   " });
    expect(prompt).not.toMatch(/STUDENT'S OWN NOTES/);
  });

  it("M2: includes supplemental sources, each labeled, as their own context-only section", () => {
    const prompt = buildNotebookPlannerUserPrompt([makeUnit()], {
      pageNumber: 1,
      supplementalSources: [{ label: "Lecture slides", content: "Slide 4: buffer capacity" }, { label: "Second textbook", content: "Ch. 9 discusses pKa" }],
    });
    expect(prompt).toMatch(/SUPPLEMENTAL SOURCES/);
    expect(prompt).toContain("Lecture slides: Slide 4: buffer capacity");
    expect(prompt).toContain("Second textbook: Ch. 9 discusses pKa");
  });

  it("M2: all three multi-source sections can appear together without corrupting the SOURCE THOUGHT UNITS list", () => {
    const units = [makeUnit({ text: "Canonical unit text." })];
    const prompt = buildNotebookPlannerUserPrompt(units, {
      pageNumber: 1,
      professorExplanation: ["explained aloud"],
      studentNotes: "my own note",
      supplementalSources: [{ label: "Slides", content: "slide content" }],
    });
    expect(prompt).toMatch(/0\.[\s\S]*Canonical unit text\./);
    expect(prompt).toMatch(/PROFESSOR'S EXPLANATION[\s\S]*STUDENT'S OWN NOTES[\s\S]*SUPPLEMENTAL SOURCES/);
  });
});

describe("finalizeNotebookScene — deterministic provenance resolution", () => {
  it("REQUIRED: a grounding-required block with a genuine verbatim quote is kept, confidence 1, provenance attached", () => {
    const unit = makeUnit({ id: "doc-1:3:0", documentId: "doc-1", pageIndex: 3, text: "Ethanol reacts with oxygen to produce acetic acid." });
    const plan: NotebookPlan = {
      teachingStructure: "equation-calculation",
      blocks: [planBlock({ primitive: "highlight", content: "Ethanol reacts with oxygen", sourceUnitIndex: 0 })],
    };
    const scene = finalizeNotebookScene(plan, [unit], { bookId: "book-1", pageNumber: 4 });
    expect(scene.blocks).toHaveLength(1);
    expect(scene.blocks[0].confidence).toBe(1);
    expect(scene.blocks[0].canonicalUnitId).toBe("doc-1:3:0");
    expect(scene.blocks[0].sourceId).toBe("doc-1");
    expect(scene.blocks[0].page).toBe(3);
    expect(scene.blocks[0].generatedFrom).toBe("ai");
  });

  it("REQUIRED: a grounding-required block that paraphrases instead of quoting is dropped entirely, not repaired", () => {
    const unit = makeUnit({ text: "Ethanol reacts with oxygen to produce acetic acid." });
    const plan: NotebookPlan = {
      teachingStructure: null,
      blocks: [planBlock({ primitive: "source_anchor", content: "The reaction of ethanol produces acetic acid via oxidation", sourceUnitIndex: 0 })],
    };
    const scene = finalizeNotebookScene(plan, [unit], { bookId: "book-1", pageNumber: 4 });
    expect(scene.blocks).toHaveLength(0);
  });

  it("REQUIRED: a grounding-required block citing sourceUnitIndex -1 is dropped — never guessed", () => {
    const unit = makeUnit({ text: "Ethanol reacts with oxygen to produce acetic acid." });
    const plan: NotebookPlan = {
      teachingStructure: null,
      blocks: [planBlock({ primitive: "underline", content: "Ethanol reacts with oxygen", sourceUnitIndex: -1 })],
    };
    const scene = finalizeNotebookScene(plan, [unit], { bookId: "book-1", pageNumber: 4 });
    expect(scene.blocks).toHaveLength(0);
  });

  it("REQUIRED: an AI-composed explanatory block (not grounding-required) is kept regardless of exact wording, at the fixed composed confidence", () => {
    const unit = makeUnit({ text: "Ethanol reacts with oxygen to produce acetic acid." });
    const plan: NotebookPlan = {
      teachingStructure: null,
      blocks: [planBlock({ primitive: "callout", content: "Watch for incomplete oxidation producing acetaldehyde instead.", sourceUnitIndex: 0 })],
    };
    const scene = finalizeNotebookScene(plan, [unit], { bookId: "book-1", pageNumber: 4 });
    expect(scene.blocks).toHaveLength(1);
    expect(scene.blocks[0].confidence).toBe(0.6);
  });

  it("a genuinely page-level explanatory block (sourceUnitIndex -1) is kept with null provenance, falling back to the requested page number", () => {
    const unit = makeUnit();
    const plan: NotebookPlan = {
      teachingStructure: null,
      blocks: [planBlock({ primitive: "heading", content: "Oxidation Reactions", sourceUnitIndex: -1 })],
    };
    const scene = finalizeNotebookScene(plan, [unit], { bookId: "book-1", pageNumber: 7 });
    expect(scene.blocks).toHaveLength(1);
    expect(scene.blocks[0].canonicalUnitId).toBeNull();
    expect(scene.blocks[0].page).toBe(7);
  });

  it("preserves order/groupId/detail pass-through unchanged", () => {
    const unit = makeUnit();
    const plan: NotebookPlan = {
      teachingStructure: null,
      blocks: [planBlock({ primitive: "equation_work", content: "F = ma", detail: "1. Start with Newton's second law\n2. Substitute known values", groupId: "g1", order: 3, sourceUnitIndex: 0 })],
    };
    const scene = finalizeNotebookScene(plan, [unit], { bookId: "book-1", pageNumber: 1 });
    expect(scene.blocks[0].detail).toBe("1. Start with Newton's second law\n2. Substitute known values");
    expect(scene.blocks[0].groupId).toBe("g1");
    expect(scene.blocks[0].order).toBe(3);
  });

  it("M1: passes relationshipKind through from the plan block to the finalized block unchanged", () => {
    const unit = makeUnit();
    const plan: NotebookPlan = {
      teachingStructure: null,
      blocks: [planBlock({ primitive: "arrow", content: "causes", order: 0, sourceUnitIndex: 0, relationshipKind: "causes" })],
    };
    const scene = finalizeNotebookScene(plan, [unit], { bookId: "book-1", pageNumber: 1 });
    expect(scene.blocks[0].relationshipKind).toBe("causes");
  });

  it("M1: relationshipKind stays null when the plan didn't state one — never guessed", () => {
    const unit = makeUnit();
    const plan: NotebookPlan = {
      teachingStructure: null,
      blocks: [planBlock({ primitive: "text", order: 0, sourceUnitIndex: 0 })],
    };
    const scene = finalizeNotebookScene(plan, [unit], { bookId: "book-1", pageNumber: 1 });
    expect(scene.blocks[0].relationshipKind).toBeNull();
  });

  it("REQUIRED: an empty-blocks plan produces a valid, empty-blocks scene — never padded to reach a minimum", () => {
    const plan: NotebookPlan = { teachingStructure: null, blocks: [] };
    const scene = finalizeNotebookScene(plan, [], { bookId: "book-1", pageNumber: 1 });
    expect(scene.blocks).toEqual([]);
  });

  it("REQUIRED: two genuinely different subjects produce different primitive compositions from the same finalizer — the schema does not force a common shape", () => {
    const chemUnit = makeUnit({ text: "Boyle's Law states that pressure and volume are inversely proportional at constant temperature." });
    const chemPlan: NotebookPlan = {
      teachingStructure: "equation-calculation",
      blocks: [
        planBlock({ primitive: "formula", content: "P1V1 = P2V2", order: 0, sourceUnitIndex: 0 }),
        planBlock({ primitive: "equation_work", content: "Worked calculation", detail: "1. Identify known values\n2. Solve for unknown", order: 1, sourceUnitIndex: 0 }),
      ],
    };
    const chemScene = finalizeNotebookScene(chemPlan, [chemUnit], { bookId: "chem-book", pageNumber: 12 });

    const historyUnit = makeUnit({ text: "The printing press was invented by Johannes Gutenberg around 1440, transforming the spread of information across Europe." });
    const historyPlan: NotebookPlan = {
      teachingStructure: "timeline-history",
      blocks: [
        planBlock({ primitive: "timeline", content: "Invention of the printing press", detail: "1440: Gutenberg invents the printing press", order: 0, sourceUnitIndex: 0 }),
        planBlock({ primitive: "arrow", content: "Faster information spread across Europe", order: 1, sourceUnitIndex: 0 }),
      ],
    };
    const historyScene = finalizeNotebookScene(historyPlan, [historyUnit], { bookId: "history-book", pageNumber: 3 });

    const chemPrimitives = chemScene.blocks.map((b) => b.primitive).sort();
    const historyPrimitives = historyScene.blocks.map((b) => b.primitive).sort();
    expect(chemPrimitives).not.toEqual(historyPrimitives);
    expect(chemScene.teachingStructure).not.toBe(historyScene.teachingStructure);
  });
});
