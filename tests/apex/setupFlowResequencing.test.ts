// tests/apex/setupFlowResequencing.test.ts
// TestLab setup-flow resequencing — the pieces (generator, proctor, results,
// dashboard tabs) already existed; this closes three real gaps in how a
// student actually moves through them: (1) a first-time user with no book
// saw a dashboard full of zeros with no explanation of what to do, (2)
// finishing an exam only ever offered a generic "Back to Hub" with no path
// to reviewing weaknesses or practicing them, (3) there was no way to deep-
// link into a specific /apex tab at all.

import fs from "fs";
import path from "path";

const PAGE_SRC = fs.readFileSync(path.resolve(__dirname, "../../app/apex/page.tsx"), "utf8");
const RESULTS_SRC = fs.readFileSync(path.resolve(__dirname, "../../app/apex/results/page.tsx"), "utf8");

describe("app/apex/page.tsx — first-time user gets a source-first path, not the old dashboard of zeros", () => {
  it("REQUIRED: explains the three real setup decisions and directs missing-source users to Reader", () => {
    expect(PAGE_SRC).toMatch(/Step 1/);
    expect(PAGE_SRC).toMatch(/Step 2/);
    expect(PAGE_SRC).toMatch(/Step 3/);
    expect(PAGE_SRC).toMatch(/Add a source in Avrrio Reader first/);
    expect(PAGE_SRC).toMatch(/disabled=\{!selectedBook\}/);
  });
});

describe("app/apex/results/page.tsx — closes the review-weaknesses / regenerate-targeted-practice loop", () => {
  it("REQUIRED: offers a direct link to the Mistakes tab, not just a generic Back to Hub", () => {
    expect(RESULTS_SRC).toMatch(/href="\/apex\/review"/);
  });

  it("REQUIRED: offers a direct link back to the canonical source-first builder", () => {
    expect(RESULTS_SRC).toMatch(/href="\/apex"/);
  });

  it("Back to Hub link is still present as a fallback", () => {
    expect(RESULTS_SRC).toMatch(/href="\/apex"\s*$/m);
  });
});
