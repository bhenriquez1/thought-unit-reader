// tests/notelab/notelabScrollFix.test.ts
// NU2 (NoteLab Unification correction) — "inspect container hierarchy for
// fixed heights, overflow: hidden, nested scroll containers... mouse
// wheel/trackpad scroll must work; no content clipped."
//
// UltraNotesList.tsx returns a bare fragment with no scroll region of its
// own — unlike its sibling ChiefResidentPanel.tsx, which deliberately owns
// its own `overflow-y-auto` internally (so the wrapper around IT stays
// overflow-hidden by design, to avoid a double scrollbar). The wrapper
// around UltraNotesList in pages/index.tsx was ALSO overflow-hidden, which
// meant any notes/expanded notebooks taller than the available viewport
// were simply unreachable — and every scrollIntoView() call inside
// UltraNotesList (jump-to-related-note, KG-node focus) had no scrollable
// ancestor to act on. No jsdom/render harness exists in this repo for
// pages/index.tsx — source inspection, matching this repo's established
// pattern for this specific file (see tests/notelab/ultraNoteDocumentIdentity.test.ts).

import fs from "fs";
import path from "path";

const SRC = fs.readFileSync(path.resolve(__dirname, "../../pages/index.tsx"), "utf8");

describe("pages/index.tsx — NoteLab tab scroll fix (NU2)", () => {
  it("REQUIRED: the wrapper around UltraNotesList scrolls (overflow-y-auto), not overflow-hidden", () => {
    const callIdx = SRC.indexOf("<UltraNotesList");
    expect(callIdx).toBeGreaterThan(-1);
    const wrapperIdx = SRC.lastIndexOf('<div className="flex-1', callIdx);
    expect(wrapperIdx).toBeGreaterThan(-1);
    const wrapperOpenTag = SRC.slice(wrapperIdx, SRC.indexOf(">", wrapperIdx) + 1);
    expect(wrapperOpenTag).toMatch(/className="flex-1 overflow-y-auto"/);
    expect(wrapperOpenTag).toMatch(/notesSubTab === "notes" \? "flex" : "none"/);
  });

  it("the sibling ChiefResidentPanel wrapper is untouched — it owns its own internal scroll region, so its wrapper staying overflow-hidden is intentional, not a regression", () => {
    const callIdx = SRC.indexOf("<ChiefResidentPanel");
    expect(callIdx).toBeGreaterThan(-1);
    const wrapperIdx = SRC.lastIndexOf('<div className="flex-1', callIdx);
    const wrapperOpenTag = SRC.slice(wrapperIdx, SRC.indexOf(">", wrapperIdx) + 1);
    expect(wrapperOpenTag).toMatch(/className="flex-1 overflow-hidden"/);
    expect(wrapperOpenTag).toMatch(/notesSubTab === "teaching" \? "flex" : "none"/);
  });
});

describe("components/notelab/UltraNotesList.tsx — content is never height-clipped by an internal ceiling (NU2)", () => {
  const src = fs.readFileSync(path.resolve(__dirname, "../../components/notelab/UltraNotesList.tsx"), "utf8");

  it("REQUIRED: no maxHeight is set anywhere in the file — the component must be free to grow so the new scrollable wrapper can actually reach all of it", () => {
    expect(src).not.toMatch(/maxHeight/);
  });
});
