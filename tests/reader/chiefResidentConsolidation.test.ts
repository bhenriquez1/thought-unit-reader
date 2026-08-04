// tests/reader/chiefResidentConsolidation.test.ts
// Regression guards: Reader and NoteLab Chief Resident both build requests via
// the SAME shared lib/reader/buildChiefResidentContext.ts, and both validate
// every streamed SSE event against a frozen snapshot before rendering it —
// closing off the class of bug where a superseded/cross-page/cross-document
// response could reach the UI. Static source analysis (this file's components
// are deeply stateful/imperative — no React Testing Library harness exists in
// this codebase; see the sibling *.test.ts files for the established pattern).

import fs from "fs";
import path from "path";

const MODAL_FILE = path.resolve(__dirname, "../../components/reader/ChiefResidentModal.tsx");
const PANEL_FILE  = path.resolve(__dirname, "../../components/notelab/ChiefResidentPanel.tsx");
const INDEX_FILE  = path.resolve(__dirname, "../../pages/index.tsx");
const API_FILE    = path.resolve(__dirname, "../../pages/api/chief-resident-teaching.ts");

describe("ChiefResidentModal.tsx (Reader) — shared builder + response validation", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(MODAL_FILE, "utf8"); });

  it("imports buildChiefResidentContext and matchesFrozenSnapshot from the shared module", () => {
    expect(src).toMatch(/import \{\s*\n\s*buildChiefResidentContext,\s*\n\s*matchesFrozenSnapshot,\s*\n\s*type ChiefResidentFrozenSnapshot,\s*\n\s*\} from "@\/lib\/reader\/buildChiefResidentContext"/);
  });

  it("ChiefResidentContext requires documentId and pageTruthKey", () => {
    const idx = src.indexOf("export interface ChiefResidentContext");
    const block = src.slice(idx, idx + 900);
    expect(block).toMatch(/documentId:\s*string;/);
    expect(block).toMatch(/pageTruthKey:\s*string;/);
  });

  it("sendToApi builds a frozen snapshot from context before calling buildChiefResidentContext", () => {
    const idx = src.indexOf("const sendToApi = useCallback");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 2000);
    expect(block).toMatch(/const frozen: ChiefResidentFrozenSnapshot = \{/);
    expect(block).toMatch(/documentId:\s*context\.documentId/);
    expect(block).toMatch(/pageTruthKey:\s*context\.pageTruthKey/);
    expect(block).toMatch(/buildChiefResidentContext\(\{/);
    expect(block).toMatch(/streamChiefResident\(\s*\n\s*body,\s*\n\s*frozen,/);
  });

  it("streamChiefResident discards any SSE event that fails matchesFrozenSnapshot before it can be rendered", () => {
    const idx = src.indexOf("async function streamChiefResident");
    const block = src.slice(idx, idx + 2600);
    expect(block).toMatch(/if \(!matchesFrozenSnapshot\(parsed, frozen\)\)/);
    // The discard must happen BEFORE the token is appended/rendered.
    const discardIdx = block.indexOf("matchesFrozenSnapshot(parsed, frozen)");
    const renderIdx  = block.indexOf("onToken(parsed.text)");
    expect(discardIdx).toBeGreaterThan(-1);
    expect(renderIdx).toBeGreaterThan(discardIdx);
  });
});

describe("ChiefResidentPanel.tsx (NoteLab) — shared builder + response validation", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(PANEL_FILE, "utf8"); });

  it("imports buildChiefResidentContext and matchesFrozenSnapshot from the SAME shared module as the Reader modal", () => {
    expect(src).toMatch(/import \{\s*\n\s*buildChiefResidentContext,\s*\n\s*matchesFrozenSnapshot,\s*\n\s*type ChiefResidentFrozenSnapshot,\s*\n\s*\} from "@\/lib\/reader\/buildChiefResidentContext"/);
  });

  it("requires a pageTruthKey prop", () => {
    const idx = src.indexOf("interface ChiefResidentPanelProps");
    const block = src.slice(idx, idx + 500);
    expect(block).toMatch(/pageTruthKey:\s*string;/);
  });

  it("all three request call sites (startSession, sendUserReply, requestSummary) build a frozen snapshot and use buildChiefResidentContext", () => {
    const frozenCalls = src.match(/const frozen: ChiefResidentFrozenSnapshot = \{/g) ?? [];
    expect(frozenCalls).toHaveLength(3);
    const builderCalls = src.match(/buildChiefResidentContext\(\{ \.\.\.frozen,/g) ?? [];
    expect(builderCalls).toHaveLength(3);
  });

  it("streamTeachingSession discards any SSE event that fails matchesFrozenSnapshot", () => {
    const idx = src.indexOf("async function streamTeachingSession");
    const block = src.slice(idx, idx + 1700);
    expect(block).toMatch(/if \(!matchesFrozenSnapshot\(parsed, frozen\)\)/);
  });

  it("the page/book reset effect is keyed on pageTruthKey, not just [bookId, currentPage]", () => {
    const idx = src.indexOf("// Reset session when page/book changes");
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/\}, \[bookId, currentPage, pageTruthKey\]\);/);
  });

  it("no longer sends the raw bookTitle field name directly to the API body — routed through the shared builder's title field instead", () => {
    expect(src).not.toMatch(/\{\s*sourceText:\s*src,\s*bookTitle,/);
  });
});

describe("pages/index.tsx — documentId/pageTruthKey actually reach both Chief Resident callers", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(INDEX_FILE, "utf8"); });

  it("all three setChiefResidentContext(...) call sites include documentId: bookId and pageTruthKey", () => {
    const marker = "setChiefResidentContext({";
    const positions: number[] = [];
    let from = 0;
    while (true) {
      const idx = src.indexOf(marker, from);
      if (idx === -1) break;
      positions.push(idx);
      from = idx + marker.length;
    }
    expect(positions).toHaveLength(3);
    for (const pos of positions) {
      const block = src.slice(pos, pos + 500);
      expect(block).toMatch(/documentId:\s*bookId,/);
      expect(block).toMatch(/pageTruthKey,/);
    }
  });

  it("<ChiefResidentPanel> receives pageTruthKey={pageTruthKey}", () => {
    const idx = src.indexOf("<ChiefResidentPanel");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, src.indexOf("/>", idx));
    expect(block).toMatch(/pageTruthKey=\{pageTruthKey\}/);
  });
});

describe("pages/api/chief-resident-teaching.ts — SSE events echo request identity", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(API_FILE, "utf8"); });

  it("accepts pageTruthKey on the request type", () => {
    const idx = src.indexOf("export interface ChiefResidentRequest");
    const block = src.slice(idx, idx + 1500);
    expect(block).toMatch(/pageTruthKey\?:\s*string;/);
  });

  it("captures documentId/pageNumber/pageTruthKey into a single identity object from the request body", () => {
    expect(src).toMatch(/const identity = \{ documentId, pageNumber, pageTruthKey \};/);
  });

  it("every token-delta SSE event spreads identity alongside text", () => {
    expect(src).toMatch(/res\.write\(`data: \$\{JSON\.stringify\(\{ text: delta, \.\.\.identity \}\)\}\\n\\n`\);/);
  });

  it("every error SSE event spreads identity alongside error/code", () => {
    expect(src).toMatch(/res\.write\(`data: \$\{JSON\.stringify\(\{ error: friendly, code, \.\.\.identity \}\)\}\\n\\n`\);/);
  });
});
