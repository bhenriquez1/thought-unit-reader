// tests/apex/dashboardGeneratorLinksCarryProfile.test.ts
// P1 fix — flagged by automated review on #668 (unresolved discussion on
// app/apex/page.tsx:984, posted just after merge).
//
// /apex/generator/page.tsx only reads its initial profile from the
// examType URL param (defaulting to 'dat' when absent). Several dashboard
// links into it — Today tab's "Create Practice Exam"/"Build Your First
// Exam", the flow-ribbon's "Choose / Upload Sources"/"Blueprint", and
// Full-Length Exams tab's Section Test/Timed Practice/Foundation Drill —
// omitted that param, so clicking any of them while Custom Exam was the
// active profile silently opened the generator in DAT mode anyway.
//
// No jsdom/render harness for this file in this repo — source inspection,
// matching this repo's established pattern for React components.

import fs from "fs";
import path from "path";

const SRC = fs.readFileSync(path.resolve(__dirname, "../../app/apex/page.tsx"), "utf8");

describe("app/apex/page.tsx — a generatorLink helper threads the active profile into every /apex/generator link", () => {
  it("REQUIRED: generatorLink appends examType, merging with an existing query string", () => {
    const idx = SRC.indexOf("function generatorLink(");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 300);
    expect(block).toMatch(/path\.includes\("\?"\)/);
    // REQUIRED: encodeURIComponent, not a raw interpolation — activeProfileId
    // traces back to localStorage (see readStoredActiveProfileId), and this
    // is what actually breaks that taint flow before it reaches a Link href,
    // independent of whatever validation callers do upstream.
    expect(block).toMatch(/examType=\$\{encodeURIComponent\(activeProfileId\)\}/);
  });

  it("REQUIRED: TodayTab's 'Build Your First Exam' link uses generatorLink", () => {
    const idx = SRC.indexOf("Build Your First Exam");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(Math.max(0, idx - 300), idx);
    expect(block).toMatch(/href=\{generatorLink\("\/apex\/generator", activeProfileId\)\}/);
  });

  it("REQUIRED: TodayTab's action grid routes generator hrefs through generatorLink, leaving non-generator hrefs (Full Simulation, Review Mistakes) untouched", () => {
    const idx = SRC.indexOf('{ href: "/apex/generator",            label: "Create Practice Exam"');
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 1000);
    expect(block).toMatch(/href=\{href\.startsWith\("\/apex\/generator"\) \? generatorLink\(href, activeProfileId\) : href\}/);
  });

  it("REQUIRED: FullExamsTab's Section Test/Timed Practice/Foundation Drill grid routes through generatorLink", () => {
    const idx = SRC.indexOf('{ label: "Section Test"');
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 1000);
    expect(block).toMatch(/href=\{generatorLink\(href, activeProfileId\)\}/);
  });

  it("REQUIRED: the flow-ribbon's 'Choose / Upload Sources' and 'Blueprint' links both use generatorLink", () => {
    const idx = SRC.indexOf("Choose / Upload Sources");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(Math.max(0, idx - 100), idx + 200);
    expect(block).toMatch(/href=\{generatorLink\("\/apex\/generator", activeProfileId\)\}/g);
    const matches = block.match(/generatorLink\("\/apex\/generator", activeProfileId\)/g) ?? [];
    expect(matches.length).toBe(2);
  });
});
