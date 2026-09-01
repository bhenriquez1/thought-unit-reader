// tests/recalllab/recallIdentityInheritance.test.ts
// L5 (Recall consolidation) — "Recall should be one of Learning Hub's
// strongest formative signals... route through the SAME canonical
// KnowledgeNodeProgress state as everything else." recall2's live grading
// path (recordRecallBlueprintRating) and RecallLab.tsx's own migration
// filter (forDocument) both require documentId (and grading also requires
// pageTruthKey/knowledgeNodeId) on a RecallSet/RecallBlueprint — a set
// missing them is not just ungraded, it's invisible to the canonical Recall
// UI entirely. knowledgeNodeId already fell back from the source UltraNote
// when a caller's opts didn't supply it; documentId/pageTruthKey didn't,
// so WhiteboardPanel/ChiefResidentPanel/UltraNotesList calls that only pass
// a note (no opts identity) silently orphaned every card they created.

import fs from "fs";
import path from "path";
import {
  buildRecallSetFromNote,
  buildRecallSetFromNoteCard,
  buildRecallSetFromNotebookBlock,
} from "../../lib/recalllab/recallStore";
import type { UltraNote } from "../../lib/notelab/ultraNoteStore";
import type { FinalizedNotebookBlock } from "../../lib/notelab/notebookScene";
import type { NoteCard } from "../../lib/insights/synthesizeTeachingOutput";

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
    documentId: "doc-abc",
    pageTruthKey: "doc-abc::42::t",
    knowledgeNodeId: "node-xyz",
    ...overrides,
  };
}

describe("buildRecallSetFromNote — documentId/pageTruthKey inherit from the note when opts omit them", () => {
  it("inherits all three identity fields from the note when no opts are passed at all", () => {
    const set = buildRecallSetFromNote(makeNote());
    expect(set.documentId).toBe("doc-abc");
    expect(set.pageTruthKey).toBe("doc-abc::42::t");
    expect(set.knowledgeNodeId).toBe("node-xyz");
  });

  it("inherits documentId/pageTruthKey from the note even when opts supplies unrelated fields", () => {
    const set = buildRecallSetFromNote(makeNote(), { sourceLabel: "notelab" });
    expect(set.documentId).toBe("doc-abc");
    expect(set.pageTruthKey).toBe("doc-abc::42::t");
  });

  it("an explicit opts.documentId/pageTruthKey still wins over the note's own", () => {
    const set = buildRecallSetFromNote(makeNote(), { documentId: "doc-override", pageTruthKey: "doc-override::42::t" });
    expect(set.documentId).toBe("doc-override");
    expect(set.pageTruthKey).toBe("doc-override::42::t");
  });

  it("stays undefined when neither opts nor the note carry identity — never fabricated", () => {
    const set = buildRecallSetFromNote(makeNote({ documentId: undefined, pageTruthKey: undefined, knowledgeNodeId: undefined }));
    expect(set.documentId).toBeUndefined();
    expect(set.pageTruthKey).toBeUndefined();
    expect(set.knowledgeNodeId).toBeUndefined();
  });
});

describe("buildRecallSetFromNoteCard — same inheritance for the single-card 'Generate Card' action", () => {
  const noteCard: NoteCard = { type: "mechanism", title: "Buffer capacity", body: "Resists pH change near pKa." };

  it("inherits documentId/pageTruthKey from the note", () => {
    const set = buildRecallSetFromNoteCard(makeNote(), noteCard);
    expect(set.documentId).toBe("doc-abc");
    expect(set.pageTruthKey).toBe("doc-abc::42::t");
  });
});

describe("buildRecallSetFromNotebookBlock — same inheritance for N4's 'Practice in Recall' action", () => {
  const block: FinalizedNotebookBlock = {
    id: "nb-book-1-p42-0",
    primitive: "formula",
    content: "Ka = [H+][A-]/[HA]",
    detail: null,
    groupId: null,
    order: 0,
    sourceUnitIndex: 0,
    relationshipKind: null,
    canonicalUnitId: "unit-1",
    sourceId: "doc-1",
    page: 42,
    confidence: 1,
    generatedFrom: "ai",
  };

  it("inherits documentId/pageTruthKey from the note", () => {
    const set = buildRecallSetFromNotebookBlock(makeNote(), block);
    expect(set.documentId).toBe("doc-abc");
    expect(set.pageTruthKey).toBe("doc-abc::42::t");
  });
});

// ── Source-inspection coverage for call sites that can't easily be unit
// tested (React components / logic embedded directly in pages/index.tsx) ──

const RIGHT_PANEL_FILE = path.resolve(__dirname, "../../components/reader/RightPanel.tsx");
const RECALL2_SESSION_FILE = path.resolve(__dirname, "../../components/recalllab/Recall2Session.tsx");

describe("RightPanel.tsx — 'Save Missed to Recall Lab' (MiniTestPanel/handleSaveMissed) threads real identity", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(RIGHT_PANEL_FILE, "utf8"); });

  it("MiniTestPanel accepts documentId/pageTruthKey/knowledgeNodeId", () => {
    const idx = src.indexOf("function MiniTestPanel({");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 900);
    expect(block).toMatch(/documentId\?:\s*string;/);
    expect(block).toMatch(/pageTruthKey\?:\s*string;/);
    expect(block).toMatch(/knowledgeNodeId\?:\s*string \| null;/);
  });

  it("handleSaveMissed's saveRecallSet call includes documentId/pageTruthKey/knowledgeNodeId", () => {
    const idx = src.indexOf("function handleSaveMissed()");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 1700);
    expect(block).toMatch(/documentId,/);
    expect(block).toMatch(/pageTruthKey,/);
    expect(block).toMatch(/knowledgeNodeId:\s*knowledgeNodeId \?\? undefined,/);
  });

  it("PreReadRecallDrawer receives the real resolved identity and forwards it to MiniTestPanel", () => {
    const drawerIdx = src.indexOf("function PreReadRecallDrawer({");
    expect(drawerIdx).toBeGreaterThan(-1);
    const drawerBlock = src.slice(drawerIdx, drawerIdx + 1300);
    expect(drawerBlock).toMatch(/documentId\?:\s*string;/);
    expect(drawerBlock).toMatch(/pageTruthKey\?:\s*string;/);

    const callIdx = src.indexOf("<MiniTestPanel");
    expect(callIdx).toBeGreaterThan(-1);
    const callBlock = src.slice(callIdx, src.indexOf("/>", callIdx));
    expect(callBlock).toMatch(/documentId=\{documentId\}/);
    expect(callBlock).toMatch(/pageTruthKey=\{pageTruthKey\}/);
    expect(callBlock).toMatch(/knowledgeNodeId=\{knowledgeNodeId\}/);
  });

  it("the top-level <PreReadRecallDrawer> render passes resolvedDocumentId/pageTruthKey/knowledgeNodeId", () => {
    const idx = src.indexOf("<PreReadRecallDrawer");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, src.indexOf("preReadRecallItems", idx));
    expect(block).toMatch(/documentId=\{resolvedDocumentId\}/);
    expect(block).toMatch(/pageTruthKey=\{pageTruthKey\}/);
    expect(block).toMatch(/knowledgeNodeId=\{knowledgeNodeId\}/);
  });
});

describe("Recall2Session.tsx — a skipped Learning State write (missing canonical identity) is surfaced, not silent", () => {
  it("logs the skip reason returned by recordRecallBlueprintRating instead of discarding it", () => {
    const src = fs.readFileSync(RECALL2_SESSION_FILE, "utf8");
    const idx = src.indexOf("const result = await recordRecallBlueprintRating(");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 300);
    expect(block).toMatch(/if \(!result\.recorded\)/);
    expect(block).toMatch(/console\.warn\(\s*"\[RECALL_LEARNING_STATE_SKIPPED\]"/);
    expect(block).toMatch(/reason:\s*result\.reason/);
  });
});
