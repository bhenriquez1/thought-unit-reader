// tests/apex/testLabShellConsistency.test.ts
// Product owner report (with screenshots): the new TestLab landing UI's
// action buttons ("Build Practice Test" / "Configure Simulation") navigate
// to /apex/generator, and that page visually reads as an older, disconnected
// product — the student appears to "fall back into legacy DAT Apex UI."
//
// Investigation found this is NOT a routing/wiring bug: /apex/generator is
// not a legacy/dead route (unlike app/apex/patterns/** and pages/dat-apex.tsx,
// which genuinely redirect() old URLs into the canonical /apex entry — see
// testLabLegacyFallbackAudit.test.ts). The landing page's CTAs correctly
// push to /apex/generator, which reads the same query params, resolves
// against the same EXAM_PROFILE_CATALOG, and calls the same
// lib/examEngine/** engine (buildExam, question cache, provenance/grounding,
// scope resolution) every other TestLab screen shares. The actual defect:
// the redesign that rewrote app/apex/page.tsx (landing) into its current
// cyan/violet radial-gradient visual language never touched
// app/apex/generator/page.tsx, app/apex/proctor/page.tsx, or
// app/apex/results/page.tsx — so the student hit a real stylistic seam
// between two screens of the same flow, not a different product.
//
// This file guards the fix: a shared background-gradient "shell" token
// across every screen in the TestLab flow (landing -> generator -> proctor
// -> results), so a future redesign of the landing page can't silently
// leave its downstream screens behind again the same way. It intentionally
// does NOT assert that CTAs avoid /apex/generator — they SHOULD point there;
// that is the correct, engine-backed route.

import fs from "fs";
import path from "path";

function read(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, "../..", relPath), "utf8");
}

const LANDING = "app/apex/page.tsx";
const GENERATOR = "app/apex/generator/page.tsx";
const PROCTOR = "app/apex/proctor/page.tsx";
const RESULTS = "app/apex/results/page.tsx";

// The exact TestLab background-gradient token app/apex/page.tsx (landing)
// defines — every other screen in the flow must use this SAME string, not
// a visually-similar-but-different one, so a byte-diff always catches drift.
const TESTLAB_SHELL_BACKGROUND =
  "bg-[radial-gradient(circle_at_15%_0%,rgba(6,182,212,0.18),transparent_28%),radial-gradient(circle_at_85%_20%,rgba(124,58,237,0.14),transparent_32%),linear-gradient(145deg,#020617,#0b1120_48%,#111827)]";

describe("TestLab shell consistency — every screen in the CTA flow shares the landing page's background", () => {
  it("REQUIRED: app/apex/page.tsx (landing) itself uses the token this whole file pins against — if the landing page's own background ever changes, this test's constant must be updated deliberately, not silently drift out of sync", () => {
    expect(read(LANDING)).toContain(TESTLAB_SHELL_BACKGROUND);
  });

  it("REQUIRED: /apex/generator — the page Build Practice Test / Configure Simulation navigate to — uses the SAME background token as the landing page, not the old blue/gray gradient", () => {
    const src = read(GENERATOR);
    expect(src).toContain(TESTLAB_SHELL_BACKGROUND);
    expect(src).not.toMatch(/bg-gradient-to-br from-gray-900 via-blue-9(00|50) to-gray-900/);
  });

  it("REQUIRED: /apex/proctor (every loading/error/active-exam state) uses the SAME background token, not the old blue/gray gradient", () => {
    const src = read(PROCTOR);
    const shellOccurrences = (src.match(new RegExp(TESTLAB_SHELL_BACKGROUND.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length;
    // 7 states in this file used the old gradient at diagnosis time (3
    // loading/error centered states via-blue-900, 3 more via-blue-950, plus
    // the main active-exam view) — every one of them must have converted.
    expect(shellOccurrences).toBeGreaterThanOrEqual(7);
    expect(src).not.toMatch(/bg-gradient-to-br from-gray-900 via-blue-9(00|50) to-gray-900/);
  });

  it("REQUIRED: /apex/results uses the SAME background token, not the old blue/gray gradient", () => {
    const src = read(RESULTS);
    expect(src).toContain(TESTLAB_SHELL_BACKGROUND);
    expect(src).not.toMatch(/bg-gradient-to-br from-gray-900 via-blue-9(00|50) to-gray-900/);
  });
});

describe("TestLab shell consistency — the generator page still reads as TestLab, not a disconnected page", () => {
  it("REQUIRED: keeps a back-link into the TestLab landing page (never strands the student on a page with no way back into the product)", () => {
    const src = read(GENERATOR);
    expect(src).toMatch(/href="\/apex"[\s\S]{0,200}← TestLab/);
  });

  it("REQUIRED: the primary Generate button uses the same cyan accent the landing page's CTAs use, not the old blue/purple gradient", () => {
    const src = read(GENERATOR);
    expect(src).toMatch(/bg-cyan-500 hover:bg-cyan-400/);
    expect(src).not.toMatch(/bg-gradient-to-r from-blue-600 to-purple-600/);
  });
});

describe("TestLab CTAs correctly route through the shared exam engine — /apex/generator is NOT a legacy fallback", () => {
  it("REQUIRED: Build Practice Test / Configure Simulation still push to /apex/generator via buildGeneratorUrl — this is the correct, engine-backed destination, not a regression to guard against", () => {
    const src = read(LANDING);
    expect(src).toMatch(/return `\/apex\/generator\?\$\{params\.toString\(\)\}`;/);
    expect(src).toMatch(/onClick=\{\(\) => openBuilder\("practice"\)\}/);
    expect(src).toMatch(/onClick=\{\(\) => openBuilder\("simulation"\)\}/);
  });

  it("REQUIRED: /apex/generator calls the same shared engine (buildExam) every other TestLab screen uses — never a separate/legacy generation path", () => {
    const src = read(GENERATOR);
    expect(src).toMatch(/import \{ buildExam \} from '@\/lib\/examEngine\/examBuilder';/);
    expect(src).toMatch(/await buildExam\(\{/);
  });

  it("distinguishes /apex/generator from the ACTUAL legacy-redirect routes — it must never itself become a bare redirect() the way app/apex/patterns/** already are", () => {
    const src = read(GENERATOR);
    expect(src).not.toMatch(/redirect\("\/apex"\)/);
  });
});
