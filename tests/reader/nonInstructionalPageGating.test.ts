// tests/reader/nonInstructionalPageGating.test.ts
// Stabilization fix #2 — wires RightPanel's EXISTING non-instructional-page
// classifier (`pageBlocked`, built from `isStructuralPage`/
// `pageIsNonInstructional`/`openAIConfirmsNonInstructional`) into Speech/
// Professor/Whiteboard gating. Before this change the classifier already
// suppressed RightPanel's own note/synthesis views but was never checked
// before enabling "Start Professor", the standalone Whiteboard button, or
// Current Page's "Play" button — a user could start a Professor lesson on a
// cover/title/copyright/table-of-contents page.
//
// This repo's jest config has no jsdom/@testing-library — matching every
// other StudySpeechPanel/RightPanel regression test in this session
// (tests/reader/studySpeechModes.test.ts), this is static-analysis coverage
// of the actual wiring, not a rendered-component test.

import fs from "fs";
import path from "path";

const PANEL = path.resolve(__dirname, "../../components/reader/StudySpeechPanel.tsx");
const RIGHT_PANEL = path.resolve(__dirname, "../../components/reader/RightPanel.tsx");

describe("StudySpeechPanel.tsx — accepts and honors nonInstructionalPage", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(PANEL, "utf8"); });

  it("REQUIRED: the Props interface declares nonInstructionalPage as an optional boolean", () => {
    expect(src).toMatch(/nonInstructionalPage\?:\s*boolean;/);
  });

  it("REQUIRED: hasContent is false whenever nonInstructionalPage is true, regardless of extracted text length", () => {
    expect(src).toMatch(/const hasContent = !nonInstructionalPage && \(segments\.length > 0 \|\| activePageText\.length > 20\);/);
  });

  it("REQUIRED: the Start Professor button is disabled when nonInstructionalPage is true, even if onOpenProfessor is provided", () => {
    const idx = src.indexOf("▶ Start Professor");
    const block = src.slice(Math.max(0, idx - 500), idx);
    expect(block).toMatch(/disabled=\{!onOpenProfessor \|\| nonInstructionalPage\}/);
  });

  it("REQUIRED: shows a visible explanation when the page is non-instructional, not just a silently-disabled button", () => {
    expect(src).toMatch(/\{nonInstructionalPage && \(/);
    expect(src).toContain("No instructional content to read or teach on this page.");
  });
});

describe("RightPanel.tsx — threads its existing pageBlocked classifier into Speech/Whiteboard gating", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(RIGHT_PANEL, "utf8"); });

  it("REQUIRED: passes the SAME pageBlocked value (isStructuralPage || pageIsNonInstructional || openAIConfirmsNonInstructional) already used to gate its own note views", () => {
    expect(src).toMatch(/const pageBlocked = isStructuralPage \|\| pageIsNonInstructional \|\| openAIConfirmsNonInstructional;/);
    expect(src).toMatch(/<StudySpeechPanel[\s\S]{0,1200}nonInstructionalPage=\{pageBlocked\}/);
  });

  it("REQUIRED: the standalone Whiteboard button is also disabled on a blocked page, not just Start Professor", () => {
    const idx = src.indexOf("<span>🎨</span> Whiteboard");
    const block = src.slice(Math.max(0, idx - 600), idx);
    expect(block).toMatch(/disabled=\{!onOpenWhiteboard \|\| pageBlocked\}/);
  });

  it("pageBlocked is declared before the StudySpeechPanel render site (no TDZ)", () => {
    const declIdx = src.indexOf("const pageBlocked = isStructuralPage");
    const useIdx = src.indexOf("nonInstructionalPage={pageBlocked}");
    expect(declIdx).toBeGreaterThan(-1);
    expect(useIdx).toBeGreaterThan(declIdx);
  });
});
