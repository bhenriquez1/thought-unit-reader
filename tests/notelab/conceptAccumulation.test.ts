// tests/notelab/conceptAccumulation.test.ts
// M4 — real behavioral tests for gatherConceptNotebookContent, the bridge
// that lets multiple sources (textbook page, lecture slides, Professor
// explanation, handwritten note) strengthen the SAME notebook concept.
// Same jest.mock convention tests/examEngine/examScopeNoLeak.test.ts already
// established for lib/notelab/ultraNoteStore.ts, so the real filtering/
// sorting/capping logic runs for real against fixture notes.

jest.mock("@/lib/notelab/ultraNoteStore", () => ({
  getAllUltraNotesAsync: jest.fn(),
}));

import { gatherConceptNotebookContent } from "@/lib/notelab/conceptAccumulation";
import { getAllUltraNotesAsync } from "@/lib/notelab/ultraNoteStore";
import type { UltraNote } from "@/lib/notelab/ultraNoteStore";
import type { VisualNotebookScene } from "@/lib/notelab/notebookScene";

const mockGetAllNotes = getAllUltraNotesAsync as jest.Mock;

function scene(blocks: VisualNotebookScene["blocks"], builtAt = Date.now()): VisualNotebookScene {
  return { id: "scene", bookId: "book-1", pageNumber: 1, teachingStructure: null, blocks, builtAt };
}

function block(content: string, overrides: Partial<VisualNotebookScene["blocks"][number]> = {}): VisualNotebookScene["blocks"][number] {
  return {
    id: "b1", primitive: "text", content, detail: null, groupId: null, order: 0, sourceUnitIndex: 0,
    relationshipKind: null, canonicalUnitId: null, sourceId: null, page: 1, confidence: 0.6, generatedFrom: "ai",
    ...overrides,
  };
}

function note(overrides: Partial<UltraNote> = {}): UltraNote {
  return {
    id: "note-1",
    bookId: "chem-book",
    bookTitle: "General Chemistry",
    pageNumber: 161,
    topic: "Chemistry",
    coreIdea: "Ionic bonding",
    concepts: [],
    memoryShortcuts: [],
    subject: "Chemistry",
    createdAt: Date.now(),
    ...overrides,
  } as UltraNote;
}

beforeEach(() => {
  mockGetAllNotes.mockReset();
});

describe("gatherConceptNotebookContent", () => {
  it("REQUIRED: returns null when there are no sibling notes sharing the same knowledgeNodeId", () => {
    mockGetAllNotes.mockResolvedValue([note({ id: "n1", knowledgeNodeId: "concept-x", notebookScene: scene([block("x")]) })]);
    return gatherConceptNotebookContent("concept-ionic-bonding").then((result) => {
      expect(result).toBeNull();
    });
  });

  it("REQUIRED: excludes notes with a different knowledgeNodeId", async () => {
    mockGetAllNotes.mockResolvedValue([
      note({ id: "n1", knowledgeNodeId: "concept-covalent", notebookScene: scene([block("Covalent bonds share electrons.")]) }),
    ]);
    const result = await gatherConceptNotebookContent("concept-ionic");
    expect(result).toBeNull();
  });

  it("REQUIRED: excludes the note itself via excludeNoteId — never cites a note as its own related knowledge", async () => {
    mockGetAllNotes.mockResolvedValue([
      note({ id: "n1", knowledgeNodeId: "concept-ionic", notebookScene: scene([block("Electrons transfer between atoms.")]) }),
    ]);
    const result = await gatherConceptNotebookContent("concept-ionic", "n1");
    expect(result).toBeNull();
  });

  it("REQUIRED: excludes sibling notes that have no composed notebookScene yet", async () => {
    mockGetAllNotes.mockResolvedValue([
      note({ id: "n1", knowledgeNodeId: "concept-ionic", notebookScene: undefined }),
    ]);
    const result = await gatherConceptNotebookContent("concept-ionic");
    expect(result).toBeNull();
  });

  it("REQUIRED: gathers a genuine sibling note, source-labeled by bookTitle + pageNumber", async () => {
    mockGetAllNotes.mockResolvedValue([
      note({
        id: "n1",
        bookTitle: "General Chemistry",
        pageNumber: 161,
        knowledgeNodeId: "concept-ionic",
        notebookScene: scene([block("Ionic Bonding", { primitive: "heading" }), block("Electrons transfer between atoms.")]),
      }),
    ]);
    const result = await gatherConceptNotebookContent("concept-ionic", "current-note");
    expect(result).toBe("General Chemistry, p.161:\n[heading] Ionic Bonding\n[text] Electrons transfer between atoms.");
  });

  it("falls back to bookId when bookTitle is absent", async () => {
    mockGetAllNotes.mockResolvedValue([
      note({ id: "n1", bookId: "chem-book", bookTitle: undefined, pageNumber: 42, knowledgeNodeId: "concept-ionic", notebookScene: scene([block("Some content")]) }),
    ]);
    const result = await gatherConceptNotebookContent("concept-ionic");
    expect(result).toContain("chem-book, p.42:");
  });

  it("REQUIRED: sorts siblings most-recently-composed first", async () => {
    mockGetAllNotes.mockResolvedValue([
      note({ id: "old", pageNumber: 1, knowledgeNodeId: "concept-ionic", notebookScene: scene([block("Older content")], 1000) }),
      note({ id: "new", pageNumber: 2, knowledgeNodeId: "concept-ionic", notebookScene: scene([block("Newer content")], 5000) }),
    ]);
    const result = await gatherConceptNotebookContent("concept-ionic");
    expect(result!.indexOf("Newer content")).toBeLessThan(result!.indexOf("Older content"));
  });

  it("REQUIRED: caps the number of sibling notes gathered at MAX_SIBLING_NOTES (5)", async () => {
    const notes = Array.from({ length: 8 }, (_, i) =>
      note({ id: `n${i}`, pageNumber: i, knowledgeNodeId: "concept-ionic", notebookScene: scene([block(`Content ${i}`)], i) }),
    );
    mockGetAllNotes.mockResolvedValue(notes);
    const result = await gatherConceptNotebookContent("concept-ionic");
    const sections = result!.split("\n\n");
    expect(sections).toHaveLength(5);
    // most recent (highest builtAt, i.e. i=7 down to i=3) should be the ones kept
    expect(result).toContain("Content 7");
    expect(result).not.toContain("Content 2");
  });

  it("REQUIRED: caps each note's own summary length at MAX_SUMMARY_CHARS_PER_NOTE (600)", async () => {
    const longContent = "x".repeat(1000);
    mockGetAllNotes.mockResolvedValue([
      note({ id: "n1", knowledgeNodeId: "concept-ionic", notebookScene: scene([block(longContent)]) }),
    ]);
    const result = await gatherConceptNotebookContent("concept-ionic");
    // "[text] " prefix (7 chars) + capped content, then source label + colon + newline wrapping it
    const bodyLine = result!.split("\n").slice(1).join("\n");
    expect(bodyLine.length).toBeLessThanOrEqual(600);
  });

  it("skips a sibling whose scene summarizes to empty content — never a placeholder section", async () => {
    mockGetAllNotes.mockResolvedValue([
      note({ id: "n1", pageNumber: 1, knowledgeNodeId: "concept-ionic", notebookScene: scene([block("   ")]) }),
      note({ id: "n2", pageNumber: 2, knowledgeNodeId: "concept-ionic", notebookScene: scene([block("Real content here.")]) }),
    ]);
    const result = await gatherConceptNotebookContent("concept-ionic");
    expect(result).toBe("General Chemistry, p.2:\n[text] Real content here.");
  });

  it("returns null when every sibling's scene summarizes to empty content", async () => {
    mockGetAllNotes.mockResolvedValue([
      note({ id: "n1", knowledgeNodeId: "concept-ionic", notebookScene: scene([block("   ")]) }),
    ]);
    const result = await gatherConceptNotebookContent("concept-ionic");
    expect(result).toBeNull();
  });

  it("REQUIRED: the correction's own example — textbook, lecture slides, and a handwritten note all strengthening the same concept combine into one block", async () => {
    mockGetAllNotes.mockResolvedValue([
      note({ id: "textbook", bookTitle: "General Chemistry", pageNumber: 161, knowledgeNodeId: "concept-ionic", notebookScene: scene([block("Ionic bonds form via electron transfer.")], 1) }),
      note({ id: "slides", bookTitle: "Lecture Slides Wk4", pageNumber: 4, knowledgeNodeId: "concept-ionic", notebookScene: scene([block("NaCl is a classic ionic compound.")], 2) }),
      note({ id: "handwritten", bookTitle: "My Notes", pageNumber: 1, knowledgeNodeId: "concept-ionic", notebookScene: scene([block("remember: metal + nonmetal = ionic")], 3) }),
    ]);
    const result = await gatherConceptNotebookContent("concept-ionic", "current-note");
    expect(result).toContain("General Chemistry, p.161:");
    expect(result).toContain("Lecture Slides Wk4, p.4:");
    expect(result).toContain("My Notes, p.1:");
  });
});
