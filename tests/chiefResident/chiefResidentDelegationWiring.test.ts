// tests/chiefResident/chiefResidentDelegationWiring.test.ts
// CR1 — wiring checks: the API route's system prompt actually teaches the
// delegation directive grammar (except in rapid-fire mode, which stays
// deliberately terse), and ChiefResidentPanel.tsx actually routes completed
// turns through the new agent module rather than storing raw model text.
// Static source analysis — the established pattern in this codebase (see
// tests/reader/chiefResidentConsolidation.test.ts for precedent).

import fs from "fs";
import path from "path";

const API_FILE   = path.resolve(__dirname, "../../pages/api/chief-resident-teaching.ts");
const PANEL_FILE = path.resolve(__dirname, "../../components/notelab/ChiefResidentPanel.tsx");

describe("pages/api/chief-resident-teaching.ts — delegation instructions wired into getSystemPrompt", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(API_FILE, "utf8"); });

  it("imports CHIEF_RESIDENT_DELEGATION_DIRECTIVE_INSTRUCTIONS from the shared agent module", () => {
    expect(src).toMatch(/import \{ CHIEF_RESIDENT_DELEGATION_DIRECTIVE_INSTRUCTIONS \} from "@\/lib\/chiefResident\/chiefResidentAgent";/);
  });

  it("appends the instructions for every mode except rapid-fire", () => {
    const idx = src.indexOf("function getSystemPrompt");
    const block = src.slice(idx, idx + 900);
    expect(block).toMatch(/if \(mode !== "rapid-fire"\) base \+= CHIEF_RESIDENT_DELEGATION_DIRECTIVE_INSTRUCTIONS;/);
  });
});

describe("components/notelab/ChiefResidentPanel.tsx — completed turns are resolved through the Chief Resident Agent", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(PANEL_FILE, "utf8"); });

  it("imports resolveChiefResidentTurn and shouldOfferDelegation from lib/chiefResident/chiefResidentAgent", () => {
    expect(src).toMatch(/import \{\s*\n\s*resolveChiefResidentTurn,\s*\n\s*shouldOfferDelegation,/);
  });

  it("defines finalizeAssistantTurn, which never stores raw model text directly", () => {
    expect(src).toMatch(/const finalizeAssistantTurn = useCallback\(\(full: string\): TeachingTurn => \{/);
    // The old pattern this replaces — pushing `full` straight into a turn's
    // content — must not survive anywhere in the three call sites.
    expect(src).not.toMatch(/\{ role: "assistant", content: full \}/);
  });

  it("all three streaming call sites (startSession, sendUserReply, requestSummary) finalize their turn through the agent, not raw text", () => {
    const calls = src.match(/finalizeAssistantTurn\(full\)/g) ?? [];
    expect(calls).toHaveLength(3);
  });

  it("the delegation offer is gated once per target per session via a ref, reset alongside the rest of session state", () => {
    expect(src).toMatch(/const offeredDelegationsRef = useRef<Set<ChiefResidentDelegationTarget>>\(new Set\(\)\);/);
    const idx = src.indexOf("// Reset session when page/book changes");
    const block = src.slice(idx, idx + 450);
    expect(block).toMatch(/offeredDelegationsRef\.current = new Set\(\);/);
  });

  it("the NoteLab delegation action reuses the same composeNoteNotebookSceneInBackground pipeline other Retry actions use, not a new copy", () => {
    expect(src).toMatch(/import \{ composeNoteNotebookSceneInBackground \} from "@\/lib\/notelab\/composeNotebookScene";/);
    expect(src).toMatch(/await composeNoteNotebookSceneInBackground\(activeNote, activeNote\.documentId \?\? activeNote\.bookId\);/);
  });

  it("a whiteboard delegation is rendered as a signal only — no direct call into the Whiteboard Artist Agent from this panel", () => {
    expect(src).not.toMatch(/runWhiteboardArtistStep/);
  });
});
