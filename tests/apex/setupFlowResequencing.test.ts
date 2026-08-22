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

describe("app/apex/page.tsx — first-time user gets a guided 3-step path, not a dashboard of zeros", () => {
  it("REQUIRED: TodayTab shows a Get Started card gated on having no book yet, offering both Reader and generator as next steps", () => {
    const idx = PAGE_SRC.indexOf("🚀 Get Started");
    expect(idx).toBeGreaterThan(-1);
    const block = PAGE_SRC.slice(Math.max(0, idx - 300), idx + 900);
    expect(block).toMatch(/\{!primaryBook && booksLoaded && \(/);
    expect(block).toMatch(/href="\/"/);
    expect(block).toMatch(/href="\/apex\/generator"/);
  });

  it("the Get Started card renders before the Blueprint snapshot, not buried below the empty stat cards", () => {
    const getStartedIdx = PAGE_SRC.indexOf("🚀 Get Started");
    const blueprintIdx = PAGE_SRC.indexOf("Blueprint snapshot");
    expect(getStartedIdx).toBeGreaterThan(-1);
    expect(blueprintIdx).toBeGreaterThan(getStartedIdx);
  });
});

describe("app/apex/page.tsx — the active tab can be deep-linked via ?tab=", () => {
  it("REQUIRED: reads the tab from useSearchParams, validated against the real TABS list, defaulting to 'today'", () => {
    expect(PAGE_SRC).toMatch(/const searchParams = useSearchParams\(\);/);
    expect(PAGE_SRC).toContain('const requestedTab = searchParams?.get("tab") ?? null;');
    expect(PAGE_SRC).toMatch(/TABS\.some\(t => t\.id === requestedTab\) \? \(requestedTab as TabId\) : "today"/);
  });

  it("REQUIRED: useSearchParams is wrapped in a Suspense boundary, or the route would opt out of static generation", () => {
    const idx = PAGE_SRC.indexOf("export default function DatApexPage() {");
    expect(idx).toBeGreaterThan(-1);
    const block = PAGE_SRC.slice(idx, idx + 200);
    expect(block).toMatch(/<Suspense fallback=\{null\}>/);
    expect(block).toMatch(/<DatApexPageInner \/>/);
  });
});

describe("app/apex/results/page.tsx — closes the review-weaknesses / regenerate-targeted-practice loop", () => {
  it("REQUIRED: offers a direct link to the Mistakes tab, not just a generic Back to Hub", () => {
    expect(RESULTS_SRC).toMatch(/href="\/apex\?tab=mistakes"/);
  });

  it("REQUIRED: offers a direct link back to Today (where targeted weak-topics practice already lives via Start Now)", () => {
    expect(RESULTS_SRC).toMatch(/href="\/apex\?tab=today"/);
  });

  it("Back to Hub link is still present as a fallback", () => {
    expect(RESULTS_SRC).toMatch(/href="\/apex"\s*$/m);
  });
});
