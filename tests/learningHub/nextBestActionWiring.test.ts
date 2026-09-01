// tests/learningHub/nextBestActionWiring.test.ts
// L6 (Learning Hub orchestration correction, Sections 9/10) — source
// inspection for pages/index.tsx's wiring of buildNextBestAction and the
// shared handleDeepLink dispatcher (no jsdom/render harness for
// pages/index.tsx in this repo, matching this repo's established pattern).

import fs from "fs";
import path from "path";

const SRC = fs.readFileSync(path.resolve(__dirname, "../../pages/index.tsx"), "utf8");

describe("pages/index.tsx — nextBestAction is computed from canonical KnowledgeNodeProgress state", () => {
  it("imports buildNextBestAction", () => {
    expect(SRC).toMatch(/import \{ buildNextBestAction, type DeepLinkTarget \} from "@\/lib\/learningHub\/nextBestAction";/);
  });

  it("REQUIRED: nextBestAction is built from kgNodes/kgProgressByNodeId, not a second independently-computed number", () => {
    const idx = SRC.indexOf("const nextBestAction = useMemo(");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 300);
    expect(block).toMatch(/nodes: kgNodes, progressByNodeId: kgProgressByNodeId, nextTopicRecommendation, bookId/);
  });
});

describe("pages/index.tsx — handleDeepLink routes every module to real navigation, never a bare module homepage", () => {
  it("REQUIRED: reader target syncs to the page and switches the reader tab", () => {
    const idx = SRC.indexOf("const handleDeepLink = useCallback(");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 1400);
    expect(block).toMatch(/case "reader":/);
    expect(block).toMatch(/syncToPage\(target\.page, \{ reason: "PROGRAMMATIC" \}\);/);
    expect(block).toMatch(/trySwitchShellTab\("reader", "reader"\);/);
  });

  it("REQUIRED: notelab target switches to the notelab tab", () => {
    const idx = SRC.indexOf("const handleDeepLink = useCallback(");
    const block = SRC.slice(idx, idx + 1400);
    expect(block).toMatch(/case "notelab":\s*\n\s*trySwitchShellTab\("notelab", "notelab"\);/);
  });

  it("REQUIRED: recall target switches to the study (Recall Lab) tab", () => {
    const idx = SRC.indexOf("const handleDeepLink = useCallback(");
    const block = SRC.slice(idx, idx + 1400);
    expect(block).toMatch(/case "recall":\s*\n\s*trySwitchShellTab\("study", "study"\);/);
  });

  it("REQUIRED: testlab target builds a real generator URL carrying sourceBookId — never a bare '/apex' push", () => {
    const idx = SRC.indexOf("const handleDeepLink = useCallback(");
    const block = SRC.slice(idx, idx + 1400);
    expect(block).toMatch(/case "testlab": \{/);
    expect(block).toMatch(/params\.set\("sourceBookId", target\.bookId\);/);
    expect(block).toMatch(/router\.push\(`\/apex\/generator\?\$\{params\.toString\(\)\}`\);/);
  });
});

describe("pages/index.tsx — the Exam Readiness 'Open TestLab' button carries real book context", () => {
  it("REQUIRED: no longer a bare router.push('/apex') with zero params", () => {
    const idx = SRC.indexOf("Open TestLab →");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(Math.max(0, idx - 300), idx);
    expect(block).toMatch(/handleDeepLink\(\{ module: "testlab", bookId \}\);/);
    expect(block).not.toMatch(/router\.push\("\/apex"\);/);
  });
});
