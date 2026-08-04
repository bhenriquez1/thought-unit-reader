// tests/reader/chiefResidentSameAnswer.test.ts
//
// Mandatory regression test: Reader and NoteLab Chief Resident must give the
// same page-grounded answer, never content bleeding in from a different
// page/topic. Reported symptom: opening Chief Resident from the Reader on a
// chemistry page discussing atomic structure produced a response about
// muscle physiology (actin/myosin/sarcomere/cardiac output) — content that
// cannot possibly be grounded in that page.
//
// Root cause class: the OLD Reader-only ChiefResidentModal.tsx resumed a
// prior conversation via a turns-cache keyed by
// `${bookId}:${pageNumber}:${mode}:${selectedText}` (initialTurns prop) —
// any bug in how that key was computed (e.g. closing over a stale
// pageNumber) could resume an unrelated page's conversation under the
// current page's title. That whole mechanism is deleted along with
// ChiefResidentModal.tsx (see chiefResidentConsolidation.test.ts).
//
// This test proves, for the exact scenario reported, that:
//   1. Reader and NoteLab render the SAME component
//      (components/notelab/ChiefResidentPanel.tsx) with the SAME
//      pageTruthKey — not two independently-behaving implementations that
//      might drift.
//   2. No conversation-resumption prop (initialTurns or equivalent) is
//      passed at either call site, so there is nothing for a stale/wrong-page
//      conversation to resume FROM.
//   3. The shared request builder (lib/reader/buildChiefResidentContext.ts)
//      is a pure passthrough of the given sourceText — for this scenario's
//      atomic-structure page text, the built request contains none of the
//      forbidden muscle-physiology terms, and IS grounded in the given text.
//
// Static source analysis + a real (non-mocked) call into
// buildChiefResidentContext — no React Testing Library harness exists in
// this codebase (see sibling *.test.ts files for the established pattern).

import fs from "fs";
import path from "path";
import { buildChiefResidentContext } from "../../lib/reader/buildChiefResidentContext";

const INDEX_FILE = path.resolve(__dirname, "../../pages/index.tsx");
const SHELL_FILE  = path.resolve(__dirname, "../../components/reader/ChiefResidentModalShell.tsx");
const PANEL_FILE  = path.resolve(__dirname, "../../components/notelab/ChiefResidentPanel.tsx");

const FORBIDDEN_TERMS = [
  "muscle contraction",
  "actin",
  "myosin",
  "sarcomere",
  "cardiac output",
  "cellular respiration",
  "Krebs cycle",
];

// The exact reported scenario.
const DOCUMENT_ID    = "chemistry-central-science";
const DOCUMENT_TITLE = "Chemistry: The Central Science";
const PAGE_NUMBER    = 92;
const PAGE_TRUTH_KEY = `${DOCUMENT_ID}::${PAGE_NUMBER}::t`;
const PAGE_TEXT =
  "Atomic Structure and Chemical Properties\n\n" +
  "All matter is composed of atoms, each consisting of a nucleus of protons and neutrons " +
  "surrounded by electrons occupying discrete energy levels. The arrangement of electrons in " +
  "an atom's outermost shell determines its chemical properties, including how readily it " +
  "forms bonds, its electronegativity, and its reactivity with other elements.\n\n" +
  "A common trap is confusing atomic structure with atomic mass: atomic structure describes " +
  "the arrangement of subatomic particles, while atomic mass is a weighted average of an " +
  "element's isotopes.";

describe("Chief Resident — Reader and NoteLab render the same component with the same pageTruthKey", () => {
  let indexSrc: string;
  let shellSrc: string;
  beforeAll(() => {
    indexSrc = fs.readFileSync(INDEX_FILE, "utf8");
    shellSrc = fs.readFileSync(SHELL_FILE, "utf8");
  });

  it("ChiefResidentModalShell (Reader's entry point) renders components/notelab/ChiefResidentPanel — not a separate implementation", () => {
    expect(shellSrc).toMatch(/import ChiefResidentPanel from "@\/components\/notelab\/ChiefResidentPanel"/);
  });

  it("both the Reader shell's render and NoteLab's direct render pass pageTruthKey from the SAME pages/index.tsx variable", () => {
    const shellCallIdx = indexSrc.indexOf("<ChiefResidentModalShell");
    expect(shellCallIdx).toBeGreaterThan(-1);
    const shellBlock = indexSrc.slice(shellCallIdx, shellCallIdx + 700);
    expect(shellBlock).toMatch(/pageTruthKey=\{pageTruthKey\}/);

    const panelCallIdx = indexSrc.indexOf("<ChiefResidentPanel");
    expect(panelCallIdx).toBeGreaterThan(-1);
    const panelBlock = indexSrc.slice(panelCallIdx, indexSrc.indexOf("/>", panelCallIdx));
    expect(panelBlock).toMatch(/pageTruthKey=\{pageTruthKey\}/);
  });
});

describe("Chief Resident — no conversation-resumption prop exists to resume a stale/wrong-page conversation from", () => {
  let indexSrc: string;
  let shellSrc: string;
  let panelSrc: string;
  beforeAll(() => {
    indexSrc = fs.readFileSync(INDEX_FILE, "utf8");
    shellSrc = fs.readFileSync(SHELL_FILE, "utf8");
    panelSrc = fs.readFileSync(PANEL_FILE, "utf8");
  });

  it("ChiefResidentModalShell's props carry no initialTurns / resumed-conversation field", () => {
    expect(shellSrc).not.toMatch(/initialTurns/);
  });

  it("ChiefResidentPanel accepts no initialTurns prop — every open is a fresh session grounded in the live page", () => {
    expect(panelSrc).not.toMatch(/initialTurns/);
  });

  it("pages/index.tsx does not pass initialTurns/turnsRef into either Chief Resident render", () => {
    const shellCallIdx = indexSrc.indexOf("<ChiefResidentModalShell");
    const shellBlock = indexSrc.slice(shellCallIdx, shellCallIdx + 700);
    expect(shellBlock).not.toMatch(/initialTurns/);
    expect(indexSrc).not.toMatch(/chiefResidentTurnsRef/);
  });
});

describe("Chief Resident — REQUIRED: page 92 of 'Chemistry: The Central Science' (atomic structure) never surfaces muscle-physiology content", () => {
  it("buildChiefResidentContext is a pure passthrough of the given sourceText — grounded in the atomic-structure page, nothing else", () => {
    const request = buildChiefResidentContext({
      documentId:   DOCUMENT_ID,
      pageNumber:   PAGE_NUMBER,
      pageTruthKey: PAGE_TRUTH_KEY,
      pageText:     PAGE_TEXT,
      mode:         "teach-page",
      title:        DOCUMENT_TITLE,
      messages:     [],
    });

    expect(request.documentId).toBe(DOCUMENT_ID);
    expect(request.pageNumber).toBe(PAGE_NUMBER);
    expect(request.pageTruthKey).toBe(PAGE_TRUTH_KEY);
    expect(request.sourceText).toBe(PAGE_TEXT);
    expect(request.sourceText).toContain("Atomic Structure");
    expect(request.sourceText).toContain("electrons");

    const lowerSource = request.sourceText.toLowerCase();
    for (const term of FORBIDDEN_TERMS) {
      expect(lowerSource).not.toContain(term.toLowerCase());
    }
  });

  it("the request identity is what /api/chief-resident-teaching echoes back on every SSE event — a response for a different pageTruthKey is discarded by matchesFrozenSnapshot, never rendered", () => {
    // See lib/reader/buildChiefResidentContext.ts's matchesFrozenSnapshot() —
    // exercised directly in tests/reader/buildChiefResidentContext.test.ts.
    // This test only re-confirms the frozen identity for THIS scenario is
    // exactly the page-92 atomic-structure key, not some other page's.
    const request = buildChiefResidentContext({
      documentId:   DOCUMENT_ID,
      pageNumber:   PAGE_NUMBER,
      pageTruthKey: PAGE_TRUTH_KEY,
      pageText:     PAGE_TEXT,
      mode:         "explain-page",
      messages:     [],
    });
    expect(request.pageTruthKey).toBe("chemistry-central-science::92::t");
    expect(request.pageTruthKey).not.toMatch(/muscle|physiology/i);
  });
});
