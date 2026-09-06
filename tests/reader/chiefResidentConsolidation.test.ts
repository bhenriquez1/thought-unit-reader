// tests/reader/chiefResidentConsolidation.test.ts
// Regression guards for the Chief Resident consolidation.
//
// An earlier pass (PR #611) made Reader's ChiefResidentModal.tsx and
// NoteLab's ChiefResidentPanel.tsx both build requests via the same shared
// lib/reader/buildChiefResidentContext.ts and validate every streamed SSE
// event against a frozen snapshot — but they were still two separate React
// components with their own conversation stores, streaming-fetch functions,
// and rendering. That was judged insufficient: "sharing a request builder"
// is not "one Chief Resident component."
//
// This pass deletes components/reader/ChiefResidentModal.tsx entirely.
// Reader's "Ask Chief Resident" button now opens
// components/reader/ChiefResidentModalShell.tsx — chrome only (backdrop,
// header, close button) — which renders the SAME
// components/notelab/ChiefResidentPanel.tsx NoteLab uses. There is now
// exactly one component that owns Chief Resident's teaching UI and
// generation behavior, one prompt contract, and one context builder.
//
// Static source analysis (no React Testing Library harness exists in this
// codebase; see the sibling *.test.ts files for the established pattern).

import fs from "fs";
import path from "path";

const MODAL_FILE = path.resolve(__dirname, "../../components/reader/ChiefResidentModal.tsx");
const SHELL_FILE  = path.resolve(__dirname, "../../components/reader/ChiefResidentModalShell.tsx");
const PANEL_FILE  = path.resolve(__dirname, "../../components/notelab/ChiefResidentPanel.tsx");
const INDEX_FILE  = path.resolve(__dirname, "../../pages/index.tsx");
const API_FILE    = path.resolve(__dirname, "../../pages/api/chief-resident-teaching.ts");

describe("components/reader/ChiefResidentModal.tsx no longer exists", () => {
  it("the file was deleted, not merely deprecated", () => {
    expect(fs.existsSync(MODAL_FILE)).toBe(false);
  });
});

describe("ChiefResidentModalShell.tsx (Reader) — chrome only, no teaching UI or generation logic", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(SHELL_FILE, "utf8"); });

  it("renders the shared ChiefResidentPanel from components/notelab", () => {
    expect(src).toMatch(/import ChiefResidentPanel from "@\/components\/notelab\/ChiefResidentPanel"/);
    expect(src).toMatch(/<ChiefResidentPanel/);
  });

  it("does NOT define its own streaming fetch, conversation store, or prompt chips — those belong to the shared panel only", () => {
    expect(src).not.toMatch(/async function streamChiefResident/);
    expect(src).not.toMatch(/EXPLAIN_TEXT_CHIPS/);
    expect(src).not.toMatch(/EXPLAIN_PAGE_CHIPS/);
    // Mentioning the shared builder's filename in a doc comment is fine —
    // the shell must not IMPORT or CALL it directly (that's the panel's job).
    expect(src).not.toMatch(/import.*buildChiefResidentContext/);
    expect(src).not.toMatch(/matchesFrozenSnapshot\(/);
    expect(src).not.toMatch(/useState<ChatTurn/);
  });

  it("passes studyModel and the immutable page truth through to the shared panel", () => {
    const idx = src.indexOf("<ChiefResidentPanel");
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/studyModel=\{studyModel\}/);
    expect(block).toMatch(/pageTruth=\{pageTruth\}/);
  });

  it("activeNote is always null — Reader has no note concept, this disables the panel's Teach-This-Note mode the same way NoteLab disables it before a note is open", () => {
    const idx = src.indexOf("<ChiefResidentPanel");
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/activeNote=\{activeNote\}/);
    const propIdx = src.indexOf("activeNote: UltraNote | null;");
    expect(propIdx).toBeGreaterThan(-1);
  });
});

describe("ChiefResidentPanel.tsx (NoteLab) — shared builder + response validation (unchanged by this pass)", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(PANEL_FILE, "utf8"); });

  it("imports buildChiefResidentContext and matchesFrozenSnapshot from the shared module", () => {
    expect(src).toMatch(/import \{\s*\n\s*buildChiefResidentContext,\s*\n\s*matchesFrozenSnapshot,\s*\n\s*type ChiefResidentFrozenSnapshot,\s*\n\s*\} from "@\/lib\/reader\/buildChiefResidentContext"/);
  });

  it("requires one CurrentPageTruth prop", () => {
    const idx = src.indexOf("interface ChiefResidentPanelProps");
    const block = src.slice(idx, idx + 500);
    expect(block).toMatch(/pageTruth:\s*CurrentPageTruth;/);
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
    const block = src.slice(idx, idx + 600);
    expect(block).toMatch(/\}, \[bookId, currentPage, pageTruthKey\]\);/);
  });
});

describe("pages/index.tsx — one Chief Resident open handler, wired to both entry points", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(INDEX_FILE, "utf8"); });

  it("no more per-scope setChiefResidentContext(...) snapshot calls — that state and pattern are gone", () => {
    expect(src).not.toMatch(/setChiefResidentContext\(/);
    expect(src).not.toMatch(/ChiefResidentContext/);
  });

  it("exactly one handleOpenChiefResident handler exists, controlling a plain boolean", () => {
    expect(src).toContain("const handleOpenChiefResident = useCallback");
    expect(src).toMatch(/const \[showChiefResident, setShowChiefResident\] = useState\(false\);/);
    expect(src).not.toMatch(/handleOpenChiefResidentExplainStep/);
    expect(src).not.toMatch(/handleOpenChiefResidentExplainPage/);
    expect(src).not.toMatch(/handleOpenChiefResidentExplainConcept/);
  });

  it("renders ChiefResidentModalShell (not the deleted ChiefResidentModal) gated on showChiefResident", () => {
    expect(src).toMatch(/import ChiefResidentModalShell from "@\/components\/reader\/ChiefResidentModalShell"/);
    expect(src).toMatch(/\{showChiefResident && \(/);
    expect(src).toMatch(/<ChiefResidentModalShell/);
  });

  it("the ChiefResidentModalShell render passes the live immutable page truth", () => {
    const idx = src.indexOf("<ChiefResidentModalShell");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, src.indexOf("/>", idx) > -1 ? src.indexOf("/>", idx) : idx + 700);
    expect(block).toMatch(/studyModel=\{currentPageStudyModel\}/);
    expect(block).toMatch(/pageTruth=\{activeCurrentPageTruth\}/);
  });

  it("the NoteLab <ChiefResidentPanel> receives the same immutable page truth", () => {
    const idx = src.indexOf("<ChiefResidentPanel");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, src.indexOf("/>", idx));
    expect(block).toMatch(/pageTruth=\{activeCurrentPageTruth\}/);
  });

  it("RightPanel and WhiteboardPanel and PdfContextMenu all call the single handleOpenChiefResident — no scope-specific handler survives", () => {
    const occurrences = src.match(/handleOpenChiefResident(?!ExplainS|ExplainP|ExplainC)/g) ?? [];
    // definition (const handleOpenChiefResident = ...) + RightPanel prop + WhiteboardPanel prop + PdfContextMenu onClick
    expect(occurrences.length).toBeGreaterThanOrEqual(4);
  });
});

describe("pages/api/chief-resident-teaching.ts — SSE events echo request identity (unchanged by this pass)", () => {
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
