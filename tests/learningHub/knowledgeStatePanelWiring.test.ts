// tests/learningHub/knowledgeStatePanelWiring.test.ts
// C8 (Phase 0 audit) — locks in that KnowledgeStatePanel is actually mounted
// in Learning Hub's Overview tab (pages/index.tsx), fed the real Knowledge
// Graph nodes already loaded for the active book (kgNodes, from
// useKnowledgeGraph — the same hook the Knowledge Graph/Sources sub-tabs
// already use), and that each of its three lists deep-links to the module
// it's actually about — not a component that exists but is never rendered.
//
// L6 — previously every list (due-for-recall/weak/recently-mastered) routed
// identically to Reader regardless of which one was clicked. Now each kind
// routes through the shared handleDeepLink dispatcher to its own module
// (Section 10: "deep-link everything, never send the student to a module
// homepage").
//
// No jsdom/render harness for pages/index.tsx in this repo — source
// inspection, matching this repo's established pattern for this file.

import fs from "fs";
import path from "path";

const SRC = fs.readFileSync(path.resolve(__dirname, "../../pages/index.tsx"), "utf8");

describe("pages/index.tsx — KnowledgeStatePanel is mounted in Learning Hub's Overview tab", () => {
  it("REQUIRED: imports KnowledgeStatePanel", () => {
    expect(SRC).toMatch(/import KnowledgeStatePanel from "@\/components\/learningHub\/KnowledgeStatePanel";/);
  });

  it("REQUIRED: renders it inside the Overview sub-tab, fed the real kgNodes already loaded for this book", () => {
    const idx = SRC.indexOf('hubSubTab === "overview"');
    expect(idx).toBeGreaterThan(-1);
    const overviewBlock = SRC.slice(idx, idx + 4000);
    expect(overviewBlock).toMatch(/<KnowledgeStatePanel/);
    expect(overviewBlock).toMatch(/nodes=\{kgNodes\}/);
  });

  it("REQUIRED: onOpenNode routes each list kind to its own module via the shared deep-link dispatcher", () => {
    const idx = SRC.indexOf("<KnowledgeStatePanel");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 900);
    expect(block).toMatch(/onOpenNode=\{\(node, kind\) => \{/);
    // due-for-recall → Recall, not Reader
    expect(block).toMatch(/handleDeepLink\(\{ module: "recall", bookId, knowledgeNodeId: node\.id \}\);/);
    // weak/"Test Lab Recommended" → TestLab, not Reader
    expect(block).toMatch(/handleDeepLink\(\{ module: "testlab", bookId, knowledgeNodeId: node\.id \}\);/);
    // recently-mastered → Reader (browsing the source is the correct action here)
    expect(block).toMatch(/handleDeepLink\(\{ module: "reader", bookId, page: node\.sourcePages\[0\], knowledgeNodeId: node\.id \}\);/);
  });
});

describe("components/learningHub/KnowledgeStatePanel.tsx — reads the shared Learning State, not a new store", () => {
  const COMPONENT_SRC = fs.readFileSync(
    path.resolve(__dirname, "../../components/learningHub/KnowledgeStatePanel.tsx"),
    "utf8",
  );

  it("REQUIRED: imports getNodeProgress from the shared knowledgeGraphStore — the same store TestLab/Recall/Whiteboard read/write", () => {
    expect(COMPONENT_SRC).toMatch(/import \{ getNodeProgress \} from "@\/lib\/knowledge\/knowledgeGraphStore";/);
  });

  it("REQUIRED: weak concepts reuse examScope.ts's selectWeakNodes — the same logic TestLab's own weak-areas exam scope uses, not a re-derived definition of 'weak'", () => {
    expect(COMPONENT_SRC).toMatch(/import \{ selectWeakNodes \} from "@\/lib\/examEngine\/examScope";/);
  });

  it("does not define its own local mastery/progress store — no new persistence layer invented", () => {
    expect(COMPONENT_SRC).not.toMatch(/indexedDB\.open/);
    expect(COMPONENT_SRC).not.toMatch(/localStorage\.setItem/);
  });
});
