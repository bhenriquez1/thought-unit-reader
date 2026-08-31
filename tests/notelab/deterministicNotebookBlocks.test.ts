// tests/notelab/deterministicNotebookBlocks.test.ts
// NU3 (NoteLab Unification correction) — "Migrate current Study Page content
// into tldraw... transform into tldraw primitives" and "build a
// deterministic non-AI inclusion/fallback path so this content is never
// silently lost." Real behavioral tests against the actual exported
// functions (no React/DOM/network dependency), same discipline as
// tests/notelab/notebookPlanner.test.ts.

import {
  buildDerivedSectionBlocks,
  buildStudentNoteBlock,
  buildDeterministicNotebookBlocks,
  mergeDeterministicContentIntoScene,
} from "../../lib/notelab/deterministicNotebookBlocks";
import { VisualNotebookSceneSchema, type FinalizedNotebookBlock, type VisualNotebookScene } from "../../lib/notelab/notebookScene";
import type { UltraNote } from "../../lib/notelab/ultraNoteStore";

function makeNote(overrides: Partial<UltraNote> = {}): UltraNote {
  return {
    id: "note-1",
    bookId: "book-1",
    pageNumber: 12,
    topic: "Ionic Bonding",
    coreIdea: "Ionic bonds form via electron transfer between metals and nonmetals.",
    concepts: [],
    memoryShortcuts: [],
    subject: "Chemistry",
    createdAt: Date.now(),
    ...overrides,
  };
}

function aiBlock(overrides: Partial<FinalizedNotebookBlock> = {}): FinalizedNotebookBlock {
  return {
    id: "nb-ai-0",
    primitive: "text",
    content: "AI-composed explanation.",
    detail: null,
    groupId: null,
    order: 0,
    sourceUnitIndex: 0,
    relationshipKind: null,
    canonicalUnitId: "doc-1:12:0",
    sourceId: "doc-1",
    page: 12,
    confidence: 0.6,
    generatedFrom: "ai",
    ...overrides,
  };
}

function aiScene(blocks: FinalizedNotebookBlock[]): VisualNotebookScene {
  return VisualNotebookSceneSchema.parse({
    id: "nbscene-book-1-p12-1000",
    bookId: "book-1",
    pageNumber: 12,
    teachingStructure: null,
    blocks,
    builtAt: 1000,
  });
}

describe("buildStudentNoteBlock", () => {
  it("REQUIRED: returns null when studentNotes is absent or blank — never an empty placeholder block", () => {
    expect(buildStudentNoteBlock(makeNote(), 0)).toBeNull();
    expect(buildStudentNoteBlock(makeNote({ studentNotes: "   " }), 0)).toBeNull();
  });

  it("REQUIRED: a real studentNotes value becomes a handwritten_text block with generatedFrom: student and full confidence", () => {
    const block = buildStudentNoteBlock(makeNote({ studentNotes: "Remember: cations lose electrons." }), 3);
    expect(block).not.toBeNull();
    expect(block!.primitive).toBe("handwritten_text");
    expect(block!.content).toBe("Remember: cations lose electrons.");
    expect(block!.generatedFrom).toBe("student");
    expect(block!.confidence).toBe(1);
    expect(block!.order).toBe(3);
    expect(block!.sourceUnitIndex).toBe(-1);
    expect(block!.canonicalUnitId).toBeNull();
  });

  it("carries documentId through as sourceId when present", () => {
    const block = buildStudentNoteBlock(makeNote({ studentNotes: "note", documentId: "doc-42" }), 0);
    expect(block!.sourceId).toBe("doc-42");
  });
});

describe("buildDerivedSectionBlocks", () => {
  it("REQUIRED: a note with real content produces heading+text pairs, one per canonical section, generatedFrom: derived", () => {
    const note = makeNote({ pageThesis: "Ionic bonds form via electrostatic attraction." });
    const blocks = buildDerivedSectionBlocks(note, 0);
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks.length % 2).toBe(0); // heading+text pairs
    for (const b of blocks) {
      expect(b.generatedFrom).toBe("derived");
      expect(b.canonicalUnitId).toBeNull();
      expect(b.sourceUnitIndex).toBe(-1);
    }
    const headings = blocks.filter((b) => b.primitive === "heading");
    const texts = blocks.filter((b) => b.primitive === "text");
    expect(headings.length).toBe(texts.length);
    expect(headings.some((h) => h.content === "Big Idea")).toBe(true);
  });

  it("REQUIRED: a note with genuinely no derivable content produces no blocks at all — never invented filler", () => {
    const note = makeNote({ coreIdea: "", memoryShortcuts: [], concepts: [] });
    const blocks = buildDerivedSectionBlocks(note, 0);
    expect(blocks).toEqual([]);
  });

  it("REQUIRED: block ids are stable across calls for the same note — idempotent recomposition, no duplication on re-render", () => {
    const note = makeNote({ pageThesis: "Same thesis every time." });
    const first = buildDerivedSectionBlocks(note, 0).map((b) => b.id);
    const second = buildDerivedSectionBlocks(note, 0).map((b) => b.id);
    expect(first).toEqual(second);
  });

  it("orders blocks starting from startOrder, ascending", () => {
    const note = makeNote({ pageThesis: "X", memoryShortcuts: ["remember Y"] });
    const blocks = buildDerivedSectionBlocks(note, 10);
    const orders = blocks.map((b) => b.order);
    expect(Math.min(...orders)).toBe(10);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });
});

describe("buildDeterministicNotebookBlocks", () => {
  it("REQUIRED: puts the student's own note first, ahead of the derived sections", () => {
    const note = makeNote({ studentNotes: "my own notes", pageThesis: "the big idea" });
    const blocks = buildDeterministicNotebookBlocks(note, 0);
    expect(blocks[0].generatedFrom).toBe("student");
    expect(blocks.slice(1).every((b) => b.generatedFrom === "derived")).toBe(true);
  });

  it("a note with nothing to migrate returns an empty array, not an error", () => {
    const note = makeNote({ coreIdea: "", memoryShortcuts: [], concepts: [] });
    expect(buildDeterministicNotebookBlocks(note, 0)).toEqual([]);
  });
});

describe("mergeDeterministicContentIntoScene", () => {
  it("REQUIRED: with no existing scene, builds a fresh scene from only derived/student content", () => {
    const note = makeNote({ studentNotes: "my notes", pageThesis: "big idea" });
    const scene = mergeDeterministicContentIntoScene(null, note, { bookId: "book-1", pageNumber: 12 });
    expect(scene.bookId).toBe("book-1");
    expect(scene.pageNumber).toBe(12);
    expect(scene.blocks.every((b) => b.generatedFrom !== "ai")).toBe(true);
    expect(scene.blocks.some((b) => b.generatedFrom === "student")).toBe(true);
  });

  it("REQUIRED: preserves every AI-composed block of an existing scene untouched", () => {
    const ai = aiBlock({ id: "nb-ai-0", content: "keep me", order: 0 });
    const existing = aiScene([ai]);
    const note = makeNote({ studentNotes: "my notes" });
    const merged = mergeDeterministicContentIntoScene(existing, note, { bookId: "book-1", pageNumber: 12 });
    const survivingAi = merged.blocks.find((b) => b.id === "nb-ai-0");
    expect(survivingAi).toEqual(ai);
  });

  it("REQUIRED: derived/student blocks are ordered strictly after the existing scene's AI blocks", () => {
    const ai = aiBlock({ id: "nb-ai-0", order: 5 });
    const existing = aiScene([ai]);
    const note = makeNote({ studentNotes: "my notes" });
    const merged = mergeDeterministicContentIntoScene(existing, note, { bookId: "book-1", pageNumber: 12 });
    const nonAi = merged.blocks.filter((b) => b.generatedFrom !== "ai");
    expect(nonAi.every((b) => b.order > 5)).toBe(true);
  });

  it("REQUIRED: re-running the merge with updated studentNotes replaces the old student block instead of accumulating a stale copy alongside it", () => {
    const note1 = makeNote({ studentNotes: "first draft" });
    const sceneAfterFirstSave = mergeDeterministicContentIntoScene(null, note1, { bookId: "book-1", pageNumber: 12 });
    const note2 = makeNote({ studentNotes: "revised draft", notebookScene: sceneAfterFirstSave });
    const sceneAfterSecondSave = mergeDeterministicContentIntoScene(sceneAfterFirstSave, note2, { bookId: "book-1", pageNumber: 12 });
    const studentBlocks = sceneAfterSecondSave.blocks.filter((b) => b.generatedFrom === "student");
    expect(studentBlocks).toHaveLength(1);
    expect(studentBlocks[0].content).toBe("revised draft");
  });

  it("REQUIRED: an existing scene's id and teachingStructure survive the merge unchanged", () => {
    const existing = VisualNotebookSceneSchema.parse({
      id: "nbscene-fixed-id", bookId: "book-1", pageNumber: 12,
      teachingStructure: "comparison-contrast", blocks: [aiBlock()], builtAt: 1000,
    });
    const merged = mergeDeterministicContentIntoScene(existing, makeNote(), { bookId: "book-1", pageNumber: 12 });
    expect(merged.id).toBe("nbscene-fixed-id");
    expect(merged.teachingStructure).toBe("comparison-contrast");
  });

  it("a note with nothing to migrate and no existing scene merges to an empty-blocks scene, not an error", () => {
    const note = makeNote({ coreIdea: "", memoryShortcuts: [], concepts: [] });
    const merged = mergeDeterministicContentIntoScene(null, note, { bookId: "book-1", pageNumber: 12 });
    expect(merged.blocks).toEqual([]);
  });
});
