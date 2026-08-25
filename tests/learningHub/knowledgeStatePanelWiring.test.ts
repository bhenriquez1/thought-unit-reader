// tests/learningHub/knowledgeStatePanelWiring.test.ts
// C8 (Phase 0 audit) — locks in that KnowledgeStatePanel is actually mounted
// in Learning Hub's Overview tab (pages/index.tsx), fed the real Knowledge
// Graph nodes already loaded for the active book (kgNodes, from
// useKnowledgeGraph — the same hook the Knowledge Graph/Sources sub-tabs
// already use), and that clicking a node jumps to its source page and
// switches to the Reader tab — not a component that exists but is never
// rendered.
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

  it("REQUIRED: onOpenNode jumps to the node's source page and switches to the reader tab", () => {
    const idx = SRC.indexOf("<KnowledgeStatePanel");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 400);
    expect(block).toMatch(/onOpenNode=\{\(node\) => \{/);
    expect(block).toMatch(/syncToPage\(page, \{ reason: 'PROGRAMMATIC' \}\);/);
    expect(block).toMatch(/trySwitchShellTab\("reader", "reader"\);/);
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
