// tests/notelab/buildRecallSetFromNotebookBlock.test.ts
// N4 — "Practice in Recall" on a single selected notebook-canvas object.
// Real behavioral tests against lib/recalllab/recallStore.ts's
// buildRecallSetFromNotebookBlock, mirroring buildRecallSetFromNoteCard's
// own single-block scoping (see that function's header comment) but sourced
// from a FinalizedNotebookBlock (N2's provenance-carrying block) instead of
// a NoteCard.

import { buildRecallSetFromNotebookBlock } from "../../lib/recalllab/recallStore";
import type { UltraNote } from "../../lib/notelab/ultraNoteStore";
import type { FinalizedNotebookBlock, NotebookPrimitive } from "../../lib/notelab/notebookScene";

function makeNote(overrides: Partial<UltraNote> = {}): UltraNote {
  return {
    id: "note-1",
    bookId: "book-1",
    bookTitle: "General Chemistry",
    pageNumber: 42,
    topic: "Acid-Base Equilibria",
    coreIdea: "Weak acids partially dissociate.",
    concepts: [],
    memoryShortcuts: [],
    subject: "Chemistry",
    createdAt: Date.now(),
    ...overrides,
  };
}

function makeBlock(overrides: Partial<FinalizedNotebookBlock> & { primitive: NotebookPrimitive }): FinalizedNotebookBlock {
  return {
    id: "nb-book-1-p42-0",
    content: "Ka = [H+][A-]/[HA]",
    detail: null,
    groupId: null,
    order: 0,
    sourceUnitIndex: 0,
    canonicalUnitId: "unit-1",
    sourceId: "doc-1",
    page: 42,
    confidence: 1,
    generatedFrom: "ai",
    ...overrides,
  };
}

describe("buildRecallSetFromNotebookBlock", () => {
  it("builds exactly one card from the block's own content, never padded with extra cards", () => {
    const set = buildRecallSetFromNotebookBlock(makeNote(), makeBlock({ primitive: "formula" }));
    expect(set.cards).toHaveLength(1);
  });

  it("the card's back combines content and detail when both are present", () => {
    const block = makeBlock({ primitive: "equation_work", content: "PV = nRT", detail: "Step 1: isolate V\nStep 2: substitute" });
    const set = buildRecallSetFromNotebookBlock(makeNote(), block);
    expect(set.cards[0].back).toBe("PV = nRT\n\nStep 1: isolate V\nStep 2: substitute");
  });

  it("the card's back is just content when detail is null — never a literal null/undefined in the text", () => {
    const block = makeBlock({ primitive: "formula", content: "Ka = [H+][A-]/[HA]", detail: null });
    const set = buildRecallSetFromNotebookBlock(makeNote(), block);
    expect(set.cards[0].back).toBe("Ka = [H+][A-]/[HA]");
  });

  it("grounding-required primitives (highlight/underline/source_anchor) and formula map to a fact card", () => {
    for (const primitive of ["highlight", "underline", "source_anchor", "formula"] as const) {
      const set = buildRecallSetFromNotebookBlock(makeNote(), makeBlock({ primitive }));
      expect(set.cards[0].type).toBe("fact");
    }
  });

  it("equation_work and flow map to a mechanism card; example maps to an application card", () => {
    expect(buildRecallSetFromNotebookBlock(makeNote(), makeBlock({ primitive: "equation_work" })).cards[0].type).toBe("mechanism");
    expect(buildRecallSetFromNotebookBlock(makeNote(), makeBlock({ primitive: "flow" })).cards[0].type).toBe("mechanism");
    expect(buildRecallSetFromNotebookBlock(makeNote(), makeBlock({ primitive: "example" })).cards[0].type).toBe("application");
  });

  it("every primitive gets a distinct, non-generic recall prompt — never a single one-size-fits-all front", () => {
    const timeline = buildRecallSetFromNotebookBlock(makeNote(), makeBlock({ primitive: "timeline" })).cards[0].front;
    const diagram = buildRecallSetFromNotebookBlock(makeNote(), makeBlock({ primitive: "diagram" })).cards[0].front;
    const table = buildRecallSetFromNotebookBlock(makeNote(), makeBlock({ primitive: "table" })).cards[0].front;
    expect(new Set([timeline, diagram, table]).size).toBe(3);
  });

  it("the set's pageNumber prefers the block's own page over the note's page — a block can cite a different source page", () => {
    const note = makeNote({ pageNumber: 42 });
    const block = makeBlock({ primitive: "text", page: 7 });
    const set = buildRecallSetFromNotebookBlock(note, block);
    expect(set.pageNumber).toBe(7);
  });

  it("falls back to the note's page when the block has none", () => {
    const note = makeNote({ pageNumber: 42 });
    const block = makeBlock({ primitive: "text", page: null });
    const set = buildRecallSetFromNotebookBlock(note, block);
    expect(set.pageNumber).toBe(42);
  });

  it("carries sourceNoteId and defaults sourceLabel to notelab, matching buildRecallSetFromNoteCard's own conventions", () => {
    const note = makeNote();
    const set = buildRecallSetFromNotebookBlock(note, makeBlock({ primitive: "text" }));
    expect(set.sourceNoteId).toBe(note.id);
    expect(set.sourceLabel).toBe("notelab");
  });

  it("two different blocks on the same note/page produce different set ids — never colliding in storage", () => {
    const note = makeNote();
    const idA = buildRecallSetFromNotebookBlock(note, makeBlock({ id: "nb-a", primitive: "text" })).id;
    const idB = buildRecallSetFromNotebookBlock(note, makeBlock({ id: "nb-b", primitive: "text" })).id;
    expect(idA).not.toBe(idB);
  });
});
