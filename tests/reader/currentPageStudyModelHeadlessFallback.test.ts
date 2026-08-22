// tests/reader/currentPageStudyModelHeadlessFallback.test.ts
// Reader architecture fix — currentPageStudyModel (what NoteLab/Learning Hub/
// Recall/Podcast/Study Guide actually read to build their own content) was
// previously written ONLY by RightPanel's onStudyModelReady callback, mounted
// exclusively inside the "reader" shell tab — so those five other tabs saw a
// null study model for any page the Reader tab hadn't been opened for yet,
// even though the model's heuristic half (buildUltraPageView, driven off
// pageModel/normResult from useActivePageIntelligence — already called
// unconditionally at pages/index.tsx's top level) requires zero AI/network
// calls and was already being computed for free inside
// useActivePageIntelligence's highlightNeighborhoods memo, just never exposed.
//
// No jsdom/render harness for these files in this repo — source inspection,
// matching this repo's established pattern (e.g.
// tests/reader/pageTextByPageBackgroundSeed.test.ts's identical shape for the
// sibling pageTextByPage fix).

import fs from "fs";
import path from "path";

const HOOK_SRC = fs.readFileSync(path.resolve(__dirname, "../../lib/useActivePageIntelligence.ts"), "utf8");
const PAGE_SRC = fs.readFileSync(path.resolve(__dirname, "../../pages/index.tsx"), "utf8");

describe("lib/useActivePageIntelligence.ts — exposes a heuristic-only ultraPageView, unconditional on shouldRenderFullPanel", () => {
  it("REQUIRED: computes ultraPageView in its own memo, gated only on pageModel (not shouldRenderFullPanel/isCurrentPage)", () => {
    const idx = HOOK_SRC.indexOf("const ultraPageView = useMemo(() => {");
    expect(idx).toBeGreaterThan(-1);
    const block = HOOK_SRC.slice(idx, idx + 300);
    expect(block).toMatch(/if \(!pageModel\) return null;/);
    expect(block).toMatch(/buildUltraPageView\(pageModel, \{ existingNormResult: normResult \?\? undefined \}\)/);
    expect(block).not.toMatch(/shouldRenderFullPanel/);
  });

  it("REQUIRED: this memo is declared before highlightNeighborhoods, which reuses it instead of recomputing", () => {
    const ultraIdx = HOOK_SRC.indexOf("const ultraPageView = useMemo(() => {");
    const neighborhoodsIdx = HOOK_SRC.indexOf("const highlightNeighborhoods: HighlightNeighborhood[] = useMemo(");
    expect(ultraIdx).toBeGreaterThan(-1);
    expect(neighborhoodsIdx).toBeGreaterThan(ultraIdx);
    const neighborhoodsBlock = HOOK_SRC.slice(neighborhoodsIdx, neighborhoodsIdx + 3000);
    expect(neighborhoodsBlock).toMatch(/const ultraView = ultraPageView;/);
    expect(neighborhoodsBlock).not.toMatch(/const ultraView = buildUltraPageView\(/);
  });

  it("REQUIRED: ultraPageView is exposed on the hook's return object", () => {
    const anchorIdx = HOOK_SRC.indexOf("pageViewType: derivePageViewType(pageClass, normResult),");
    expect(anchorIdx).toBeGreaterThan(-1);
    const block = HOOK_SRC.slice(anchorIdx, anchorIdx + 100);
    expect(block).toMatch(/ultraPageView,/);
  });

  it("ActivePageIntelligenceSnapshot's type declares the new field", () => {
    const typeIdx = HOOK_SRC.indexOf("export type ActivePageIntelligenceSnapshot = {");
    expect(typeIdx).toBeGreaterThan(-1);
    const block = HOOK_SRC.slice(typeIdx, typeIdx + 1800);
    expect(block).toMatch(/ultraPageView\?: UltraPageView \| null;/);
  });
});

describe("pages/index.tsx — headless heuristic-only fallback for currentPageStudyModel", () => {
  it("REQUIRED: imports buildStudyModel from lib/insights/currentPageStudyModel", () => {
    expect(PAGE_SRC).toContain('import { buildStudyModel } from "@/lib/insights/currentPageStudyModel";');
  });

  it("REQUIRED: destructures ultraPageView from useActivePageIntelligence's return", () => {
    const hookCallIdx = PAGE_SRC.indexOf("} = useActivePageIntelligence({");
    expect(hookCallIdx).toBeGreaterThan(-1);
    const block = PAGE_SRC.slice(Math.max(0, hookCallIdx - 800), hookCallIdx);
    expect(block).toMatch(/ultraPageView: currentUltraPageView,/);
  });

  it("REQUIRED: a dedicated effect calls buildStudyModel(currentUltraPageView, {}, bookId, currentPage, sharedPresetId) — the identical heuristic-only call RightPanel documents as safe with an empty synth", () => {
    const idx = PAGE_SRC.indexOf("if (!currentUltraPageView || !isCurrentIntelligencePage) return;");
    expect(idx).toBeGreaterThan(-1);
    const block = PAGE_SRC.slice(idx, idx + 400);
    expect(block).toMatch(/buildStudyModel\(currentUltraPageView, \{\}, bookId, currentPage, sharedPresetId\)/);
  });

  it("REQUIRED: never overwrites an existing model (heuristic OR RightPanel's AI-enriched one) for the current page — first successful write wins until the [bookId, currentPage] reset effect clears it", () => {
    const idx = PAGE_SRC.indexOf("if (!currentUltraPageView || !isCurrentIntelligencePage) return;");
    const block = PAGE_SRC.slice(idx, idx + 400);
    expect(block).toMatch(/if \(prev\) return prev;/);
  });

  it("gates on isCurrentIntelligencePage so a stale pageModel (mid page-flip) can't seed a wrong-page heuristic model", () => {
    const idx = PAGE_SRC.indexOf("if (!currentUltraPageView || !isCurrentIntelligencePage) return;");
    expect(idx).toBeGreaterThan(-1);
  });

  it("this effect is declared after the [bookId, currentPage] reset effect that nulls currentPageStudyModel on page/doc change", () => {
    const resetIdx = PAGE_SRC.indexOf("setCurrentPageStudyModel(null);\n    setCanonicalLeftPanelUnits([]);");
    const fallbackIdx = PAGE_SRC.indexOf("if (!currentUltraPageView || !isCurrentIntelligencePage) return;");
    expect(resetIdx).toBeGreaterThan(-1);
    expect(fallbackIdx).toBeGreaterThan(resetIdx);
  });

  it("REQUIRED: mirrors RightPanel's isStructuralPage gate — never emits a heuristic study model for a noninstructional page role (cover/contents/chapter_opener/etc.)", () => {
    const idx = PAGE_SRC.indexOf("if (!currentUltraPageView || !isCurrentIntelligencePage) return;");
    expect(idx).toBeGreaterThan(-1);
    const block = PAGE_SRC.slice(idx, idx + 200);
    expect(block).toMatch(/if \(isNoninstructionalPage\(currentPageRole\)\) return;/);
  });
});
