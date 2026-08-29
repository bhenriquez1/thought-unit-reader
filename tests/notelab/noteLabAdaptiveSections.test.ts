// tests/notelab/noteLabAdaptiveSections.test.ts
// N1 — NoteLab adaptivity correction. Fixed dashboard-card sections (e.g.
// "DAT Tip", "Clinical Pearl", "Memory Hook", "Danger Zone", "Procedure
// Logic", "Chief Concern") must never be mandatory — they recreate the same
// "predefined card the knowledge must fit inside" problem regardless of
// which labels they use. Beyond buildNoteFromStudyModel (see
// tests/notelab/buildNoteFromStudyModelThesisOverride.test.ts), two call
// sites in pages/index.tsx built a note from a SINGLE thought unit and
// force-filled that one unit's exactText/reason into 12 fixed slots,
// manufacturing filler text ("Connect this anchor to the neighboring expert
// units before moving on", "Missing this unit can cause the downstream
// reasoning chain to fail") for whichever slots the unit's category didn't
// genuinely fill. This file guards that those two sites now build a small,
// genuinely conditional section set instead.
//
// No jsdom/render harness for pages/index.tsx in this repo — source
// inspection, matching this repo's established pattern (see
// tests/notelab/ultraNoteDocumentIdentity.test.ts and siblings).

import fs from "fs";
import path from "path";

const SRC = fs.readFileSync(path.resolve(__dirname, "../../pages/index.tsx"), "utf8");

// Labels that only ever existed in the old fixed 12-slot template these two
// sites used, manufactured regardless of whether the unit's content actually
// called for them — never legitimate adaptive output.
const FORCED_FILLER_SNIPPETS = [
  "Connect this anchor to the neighboring expert units before moving on.",
  "Missing this unit can cause the downstream reasoning chain to fail.",
  "Reading the page summary without anchoring this exact source text.",
  "Connect this unit to the surrounding canonical units.",
  "Losing this anchor weakens downstream recall and explanation.",
  "Using page-level summary instead of this exact thought unit.",
  "Do not treat this as isolated trivia; connect it to the page's ranked units.",
  "Do not memorize this without linking it to the source text.",
];

describe("pages/index.tsx — N1: single-thought-unit note builders no longer force content into fixed slots", () => {
  it("REQUIRED: none of the old manufactured-filler strings remain anywhere in the file", () => {
    for (const filler of FORCED_FILLER_SNIPPETS) {
      expect(SRC).not.toContain(filler);
    }
  });

  it("REQUIRED: sendCurrentPageToNoteLab builds a small conditional section set — a primary content section keyed off the unit's real category, an optional distinct reason, optional real neighbors, then Source", () => {
    const idx = SRC.indexOf("const sendCurrentPageToNoteLab = useCallback");
    expect(idx).toBeGreaterThan(-1);
    const saveIdx = SRC.indexOf("await saveUltraNote(note);", idx);
    const block = SRC.slice(idx, saveIdx);
    expect(block).toMatch(/const primaryLabel =\s*\n\s*activeUnit\.category === "trap" \? "Danger Zone"/);
    expect(block).toMatch(/const sections: NoteSection\[\] = \[\{ label: primaryLabel, content: activeUnit\.exactText \}\];/);
    expect(block).toMatch(/if \(activeUnit\.reason && activeUnit\.reason !== activeUnit\.exactText\) \{/);
    expect(block).toMatch(/if \(neighbors\) \{/);
    expect(block).toMatch(/note\.sections = sections;/);
    // No fixed count of pushes — this is the entire point: the section list
    // length now genuinely varies (1 to 4 entries) with what's actually true
    // of the unit, never a fixed 12.
    const pushCount = (block.match(/sections\.push\(/g) ?? []).length;
    expect(pushCount).toBeLessThanOrEqual(3);
  });

  it("REQUIRED: noteThoughtUnitById's canonical-unit branch uses the same small conditional pattern", () => {
    const idx = SRC.indexOf("const noteThoughtUnitById = useCallback");
    expect(idx).toBeGreaterThan(-1);
    const firstSaveIdx = SRC.indexOf("await saveUltraNote(note);", idx);
    const block = SRC.slice(idx, firstSaveIdx);
    expect(block).toMatch(/const notePrimaryLabel =\s*\n\s*unit\.category === "trap" \? "Danger Zone"/);
    expect(block).toMatch(/const noteSections: NoteSection\[\] = \[\{ label: notePrimaryLabel, content: unit\.exactText \}\];/);
    expect(block).toMatch(/if \(unit\.reason && unit\.reason !== unit\.exactText\) \{/);
    expect(block).toMatch(/if \(noteNeighbors\) \{/);
    expect(block).toMatch(/note\.sections = noteSections;/);
  });

  it("both sites still end with a Source section carrying real page/thoughtUnitId provenance — provenance is metadata, not a forced content slot, and stays unconditional", () => {
    const idx1 = SRC.indexOf("const sendCurrentPageToNoteLab = useCallback");
    const save1 = SRC.indexOf("await saveUltraNote(note);", idx1);
    const block1 = SRC.slice(idx1, save1);
    expect(block1).toMatch(/sections\.push\(\{ label: "Source", content: `Page \$\{currentPage\} · thoughtUnitId: \$\{activeUnit\.id\}` \}\);/);

    const idx2 = SRC.indexOf("const noteThoughtUnitById = useCallback");
    const save2 = SRC.indexOf("await saveUltraNote(note);", idx2);
    const block2 = SRC.slice(idx2, save2);
    expect(block2).toMatch(/noteSections\.push\(\{ label: "Source", content: `Page \$\{unit\.page\} · thoughtUnitId: \$\{unit\.id\}` \}\);/);
  });
});
