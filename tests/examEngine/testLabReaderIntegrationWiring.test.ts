// tests/examEngine/testLabReaderIntegrationWiring.test.ts
// TestLab-Reader progress integration — wiring coverage for the pieces that
// can't be exercised behaviorally in this repo's IDB-less Jest environment:
// pages/index.tsx's Reader-side checkpoint + weak-concept banner, and
// app/apex/generator/page.tsx's scope selector actually driving buildExam().
// The scope-resolution LOGIC itself (resolveExamScope, selectWeakNodes) and
// the no-leak guarantee are covered behaviorally in examScope.test.ts and
// examScopeNoLeak.test.ts — this file only proves the wiring exists.

import fs from "fs";
import path from "path";

function read(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, "../..", relPath), "utf8");
}

describe("pages/index.tsx — Reader-side reading-progress checkpoint", () => {
  let src: string;
  beforeAll(() => { src = read("pages/index.tsx"); });

  it("REQUIRED: imports recordPageReached from the new reading progress store", () => {
    expect(src).toMatch(/import \{ recordPageReached \} from "@\/lib\/reader\/readingProgressStore";/);
  });

  it("REQUIRED: checkpoints on every (bookId, currentPage) change, independent of whether the page has any highlighted anchors", () => {
    const idx = src.indexOf("recordPageReached(bookId, currentPage).catch(() => {});");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(Math.max(0, idx - 300), idx + 100);
    expect(block).toMatch(/}, \[bookId, currentPage\]\);/);
  });
});

describe("pages/index.tsx — 'TestLab found this concept weak — review' banner", () => {
  let src: string;
  beforeAll(() => { src = read("pages/index.tsx"); });

  it("REQUIRED: only fires from real datPerformance evidence with at least 2 attempts, below 60% accuracy", () => {
    const idx = src.indexOf("const dat = progress?.datPerformance;");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/if \(!dat \|\| dat\.attempts < 2\)/);
    expect(block).toMatch(/accuracy < 60/);
  });

  it("REQUIRED: the banner renders the exact product copy and links to /apex/review", () => {
    expect(src).toMatch(/TestLab found this concept weak/);
    expect(src).toMatch(/router\.push\("\/apex\/review"\)/);
  });
});

describe("app/apex/generator/page.tsx — Exam Scope drives buildExam(), not the old always-manual chapterPageRanges", () => {
  let src: string;
  beforeAll(() => { src = read("app/apex/generator/page.tsx"); });

  it("REQUIRED: imports the shared scope-resolution module", () => {
    expect(src).toMatch(/import \{ EXAM_SCOPE_OPTIONS, resolveExamScope, defaultScopeFor \} from '@\/lib\/examEngine\/examScope';/);
  });

  it("REQUIRED: loads Reader progress for the selected book and re-defaults the scope from it", () => {
    expect(src).toMatch(/getReadingProgress\(bookId\)/);
    expect(src).toMatch(/setExamScope\(defaultScopeFor\(progress\)\);/);
  });

  it("REQUIRED: generateExam() blocks (never calls buildExam) when the resolved scope has nothing eligible", () => {
    const idx = src.indexOf("async function generateExam()");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/if \(resolvedScope\.blocked\) \{/);
    expect(block).toMatch(/setGenerationError\(resolvedScope\.summary\);/);
  });

  it("REQUIRED: buildExam is called with the resolved scope's page ranges under strictScope:true — never the lenient fallback for a chosen scope", () => {
    const idx = src.indexOf("const built = await buildExam({");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 900);
    expect(block).toMatch(/chapterPageRanges: resolvedScope\.pageRanges,/);
    expect(block).toMatch(/strictScope: true,/);
  });

  it("REQUIRED: the Generate button is disabled whenever the resolved scope is blocked", () => {
    expect(src).toMatch(/const canGenerate = !!bookId && sectionIds\.length > 0 && !isGenerating && !resolvedScope\.blocked;/);
  });
});

describe("lib/examEngine/examBuilder.ts — strictScope + Knowledge Graph provenance", () => {
  let src: string;
  beforeAll(() => { src = read("lib/examEngine/examBuilder.ts"); });

  it("REQUIRED: strictScope prevents the empty-match fallback to the unnarrowed pool", () => {
    expect(src).toMatch(/if \(chapterFiltered\.length > 0 \|\| opts\.strictScope\) pool = chapterFiltered;/);
  });

  it("REQUIRED: every question is stamped with sourceKnowledgeNodeIds from the SAME nodes Reader's resolveOrCreateNode creates", () => {
    expect(src).toMatch(/import \{ getNodesByBookAndPage \} from "@\/lib\/knowledge\/knowledgeGraphStore";/);
    expect(src).toMatch(/sourceKnowledgeNodeIds: knowledgeNodes\.map\(\(n\) => n\.id\),/);
  });
});
