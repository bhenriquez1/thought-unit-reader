// tests/knowledge/knowledgeGraphBookDisambiguationWiring.test.ts
// P1 Launch-Blocker Remediation L8 — source-inspection wiring tests
// confirming both getNodesByBook() call sites route through
// disambiguateBookNodes before feeding Learning Hub / TestLab, matching
// this repo's established pattern for pages/index.tsx and App Router pages
// (no jsdom/render harness for either).

import fs from "fs";
import path from "path";

function read(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, "../..", rel), "utf8");
}

describe("pages/index.tsx — Learning Hub's kgNodes is disambiguated, not the raw bookId-scoped set", () => {
  const src = read("pages/index.tsx");

  it("REQUIRED: imports disambiguateBookNodes", () => {
    expect(src).toMatch(/import \{ disambiguateBookNodes \} from "@\/lib\/knowledge\/disambiguateBookNodes";/);
  });

  it("REQUIRED: useKnowledgeGraph's raw output is renamed rawKgNodes, and kgNodes is derived from it via disambiguateBookNodes(rawKgNodes, canonicalDocumentId)", () => {
    const idx = src.indexOf("const { nodes: rawKgNodes,");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 800);
    expect(block).toMatch(/= useKnowledgeGraph\(bookId \|\| null\);/);
    expect(block).toMatch(/const kgNodes = useMemo\(\s*\n\s*\(\) => disambiguateBookNodes\(rawKgNodes, canonicalDocumentId\),\s*\n\s*\[rawKgNodes, canonicalDocumentId\],\s*\n\s*\);/);
  });

  it("REQUIRED: every downstream consumer (useNodeProgressList, chapterProgressList, buildNextBestAction, KnowledgeStatePanel) still reads kgNodes — the disambiguated value — never rawKgNodes directly", () => {
    expect(src).not.toMatch(/useNodeProgressList\(rawKgNodes\)/);
    expect(src).toMatch(/useNodeProgressList\(kgNodes\)/);
    // rawKgNodes appears exactly 4 times: the destructure, one explanatory
    // comment, and the useMemo call + its deps array — never as a prop or a
    // second consumer's argument.
    expect((src.match(/rawKgNodes/g) ?? []).length).toBe(4);
  });
});

describe("app/apex/generator/page.tsx — TestLab's weak-concept node pool is disambiguated before feeding exam scope", () => {
  const src = read("app/apex/generator/page.tsx");

  it("REQUIRED: imports disambiguateBookNodes", () => {
    expect(src).toMatch(/import \{ disambiguateBookNodes \} from '@\/lib\/knowledge\/disambiguateBookNodes';/);
  });

  it("REQUIRED: getNodesByBook's result is disambiguated against selectedDocumentId before setAllNodes and before the per-node progress lookup", () => {
    const idx = src.indexOf("getNodesByBook(bookId)");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 700);
    expect(block).toMatch(/const disambiguated = disambiguateBookNodes\(nodes, selectedDocumentId\);/);
    expect(block).toMatch(/setAllNodes\(disambiguated\);/);
    expect(block).toMatch(/disambiguated\.map\(async \(n\) => \[n\.id, await getNodeProgress/);
  });

  it("REQUIRED: the effect re-runs when selectedDocumentId changes, not just bookId (its own reactive mirror) — avoids a stale-selectedDocumentId closure", () => {
    const idx = src.indexOf("getNodesByBook(bookId)");
    const depsIdx = src.indexOf("}, [bookId, selectedDocumentId]);", idx);
    expect(depsIdx).toBeGreaterThan(idx);
  });
});
