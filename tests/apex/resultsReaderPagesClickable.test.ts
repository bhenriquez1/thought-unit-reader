// tests/apex/resultsReaderPagesClickable.test.ts
// C7 (Phase 0 audit) — "exam completion must not dead-end at a score
// screen." app/apex/results/page.tsx already computed a real
// StudyRecommendation (weakest topics -> Reader pages, a persisted Recall
// set from this exam's own wrong answers) but rendered recommendation.
// readerPages as inert <li> text with no click-through, despite the exact
// same view-source handoff (writeViewSourceLink + router.push) already
// working one section down for per-question "View Source" buttons. This
// locks in that readerPages now reuses that same handoff.
//
// No jsdom/render harness for this file in this repo — source inspection,
// matching this repo's established pattern for React page components.

import fs from "fs";
import path from "path";

const SRC = fs.readFileSync(path.resolve(__dirname, "../../app/apex/results/page.tsx"), "utf8");

describe("app/apex/results/page.tsx — recommendation.readerPages is real, clickable navigation", () => {
  it("REQUIRED: defines handleViewReaderPage, reusing the same writeViewSourceLink + router.push handoff as handleViewSource", () => {
    const idx = SRC.indexOf("function handleViewReaderPage(");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 400);
    expect(block).toMatch(/writeViewSourceLink\(\{/);
    expect(block).toMatch(/documentId: rp\.bookId,/);
    expect(block).toMatch(/pageNumber: rp\.pageNumber,/);
    expect(block).toMatch(/router\.push\('\/'\);/);
  });

  it("REQUIRED: readerPages renders a real button calling handleViewReaderPage, not a plain text <li>", () => {
    const idx = SRC.indexOf("recommendation.readerPages.map((rp, i) =>");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 400);
    expect(block).toMatch(/onClick=\{\(\) => handleViewReaderPage\(rp\)\}/);
  });

  it("the old inert text-only rendering is gone", () => {
    expect(SRC).not.toMatch(/<li key=\{i\}>📖 \{rp\.topic\} — page \{rp\.pageNumber\}<\/li>/);
  });
});
