// tests/recalllab/recallLearningStateWiring.test.ts
// Regression guards for Learning State Engine Phase A3/A4:
//   A3 — the highest-traffic Reader→Recall save path (Right Panel's
//        "Save to Recall Lab" button) never threaded knowledgeNodeId
//        through, so most recall grading never reached Learning State.
//   A4 — "Quiz Me" (single Thought Unit) and "Quick Recall" (dashboard)
//        both opened a recall session with an in-memory-only RecallSet
//        that was never saved — updateCardDifficulty silently failed to
//        persist every rating made in those two flows.

import fs from "fs";
import path from "path";

const STORE_FILE       = path.resolve(__dirname, "../../lib/recalllab/recallStore.ts");
const RIGHT_PANEL_FILE = path.resolve(__dirname, "../../components/reader/RightPanel.tsx");
const INDEX_FILE       = path.resolve(__dirname, "../../pages/index.tsx");
const RECALL_LAB_FILE  = path.resolve(__dirname, "../../components/recalllab/RecallLab.tsx");

describe("recallStore.ts — RecallSet carries documentId, and buildRecallSetFromView threads opts through", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(STORE_FILE, "utf8"); });

  it("REQUIRED: RecallSet has a documentId field distinct from bookId", () => {
    const idx = src.indexOf("export interface RecallSet {");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 700);
    expect(block).toMatch(/documentId\?:\s*string;/);
    expect(block).toMatch(/knowledgeNodeId\?:\s*string;/);
  });

  it("REQUIRED: BuildRecallSetOpts accepts documentId and knowledgeNodeId", () => {
    const idx = src.indexOf("export interface BuildRecallSetOpts {");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 900);
    expect(block).toMatch(/documentId\?:\s*string;/);
    expect(block).toMatch(/knowledgeNodeId\?:\s*string \| null;/);
  });

  it("REQUIRED: buildRecallSetFromView sets both fields on the returned RecallSet from opts", () => {
    const idx = src.indexOf("export function buildRecallSetFromView(");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 4200);
    expect(block).toMatch(/documentId:\s*opts\?\.documentId,/);
    expect(block).toMatch(/knowledgeNodeId:\s*opts\?\.knowledgeNodeId \?\? undefined,/);
  });

  it("REQUIRED: updateCardDifficulty writes progress via the deterministic applyLearningEvent reducer, not a hand-rolled patch", () => {
    expect(src).toMatch(/import \{ applyLearningEvent, emptyProgress \} from "@\/lib\/knowledge\/learningStateEvents";/);
    const idx = src.indexOf("export async function updateCardDifficulty(");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 2600);
    expect(block).toMatch(/applyLearningEvent\(base, \{ kind: "recall-graded", difficulty, occurredAt, sourceId: cardId \}\)/);
    expect(block).toMatch(/emptyProgress\(nodeId, set\.documentId \?\? set\.bookId\)/);
  });
});

describe("RightPanel.tsx — GenerateStudySetButton threads documentId/knowledgeNodeId into the save", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(RIGHT_PANEL_FILE, "utf8"); });

  it("RightPanelProps accepts knowledgeNodeId", () => {
    expect(src).toMatch(/knowledgeNodeId\?:\s*string \| null;/);
  });

  it("REQUIRED: the <GenerateStudySetButton> call site passes documentId and knowledgeNodeId", () => {
    const idx = src.indexOf("<GenerateStudySetButton");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, src.indexOf("/>", idx));
    expect(block).toMatch(/documentId=\{resolvedDocumentId\}/);
    expect(block).toMatch(/knowledgeNodeId=\{knowledgeNodeId\}/);
  });

  it("REQUIRED: handleGenerate passes documentId/knowledgeNodeId into buildRecallSetFromView's opts", () => {
    const idx = src.indexOf("function GenerateStudySetButton(");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 1500);
    expect(block).toMatch(/const set = buildRecallSetFromView\(view, bookId, pageNumber, \{/);
    expect(block).toMatch(/documentId,\s*\n\s*knowledgeNodeId,/);
  });
});

describe("pages/index.tsx — the RightPanel call site and Focus-Cycle auto-save both pass real identity", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(INDEX_FILE, "utf8"); });

  it("REQUIRED: <RightPanel> receives knowledgeNodeId from pageKgNodeIdRef", () => {
    const idx = src.indexOf("<RightPanel\n");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 500);
    expect(block).toMatch(/knowledgeNodeId=\{pageKgNodeIdRef\.current\}/);
  });

  it("REQUIRED: sendCurrentPageToRecallLab (Focus Cycle auto-save) also threads documentId/knowledgeNodeId", () => {
    const idx = src.indexOf("const sendCurrentPageToRecallLab = useCallback(");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 700);
    expect(block).toMatch(/documentId:\s*resolvedDocumentId,/);
    expect(block).toMatch(/knowledgeNodeId:\s*pageKgNodeIdRef\.current,/);
  });
});

describe("RecallLab.tsx — Quiz Me and Quick Recall persist the set before opening the session", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(RECALL_LAB_FILE, "utf8"); });

  it("saveRecallSet is imported", () => {
    expect(src).toMatch(/saveRecallSet,/);
  });

  it("REQUIRED: onQuizMe awaits saveRecallSet before calling setView({ kind: \"session\" })", () => {
    const idx = src.indexOf("onQuizMe={async (detail) => {");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 900);
    const saveIdx = block.indexOf("await saveRecallSet(set);");
    const setViewIdx = block.indexOf('setView({ kind: "session", set });');
    expect(saveIdx).toBeGreaterThan(-1);
    expect(setViewIdx).toBeGreaterThan(-1);
    expect(saveIdx).toBeLessThan(setViewIdx);
  });

  it("REQUIRED: Quick Recall's onClick awaits saveRecallSet before calling setView({ kind: \"session\" })", () => {
    const idx = src.indexOf("onClick={async () => {");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 1100);
    expect(block).toMatch(/buildRecallSetFromTeachingSequence\(currentPageNoteCards, \{/);
    const saveIdx = block.indexOf("await saveRecallSet(set);");
    const setViewIdx = block.indexOf('setView({ kind: "session", set });');
    expect(saveIdx).toBeGreaterThan(-1);
    expect(setViewIdx).toBeGreaterThan(-1);
    expect(saveIdx).toBeLessThan(setViewIdx);
  });
});
