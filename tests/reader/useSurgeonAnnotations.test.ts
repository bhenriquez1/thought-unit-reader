// tests/reader/useSurgeonAnnotations.test.ts
// Regression guards for components/reader/useSurgeonAnnotations.ts:
//   - Effect A depends only on [pageTruthKey] (page identity), matching the
//     useTeachingSynthesis.ts template.
//   - Effect B's deps include domain and semanticPack.id — the deliberate
//     OPPOSITE of useTeachingSynthesis.ts, which reads those via non-reactive
//     refs specifically so they do NOT retrigger. Here they must.
//   - reanalyze() exists and is distinct from a generic retry.
//   - The exact degraded-status-message copy is present verbatim.
//   - Cache-first: Effect A tries getSurgeonAnnotationPlan before Effect B fetches.
//   - Never produces coordinates itself — hands off HighlightTarget[], the same
//     shape SmartPDFViewer already resolves geometry from.

import fs from "fs";
import path from "path";

const HOOK_FILE = path.resolve(__dirname, "../../components/reader/useSurgeonAnnotations.ts");
const VIEWER_FILE = path.resolve(__dirname, "../../components/SmartPDFViewer.tsx");
const PURE_READER_FILE = path.resolve(__dirname, "../../components/PureReaderView.tsx");
const INDEX_FILE = path.resolve(__dirname, "../../pages/index.tsx");

describe("useSurgeonAnnotations.ts — Effect A/B dependency shape", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(HOOK_FILE, "utf8"); });

  it("Effect A depends only on [pageTruthKey]", () => {
    const idx = src.indexOf("// ── Effect A:");
    const effectBody = src.slice(idx, src.indexOf("// ── Effect B:"));
    expect(effectBody).toMatch(/\}, \[pageTruthKey\]\);/);
  });

  it("Effect B's dependency array includes domain and semanticPack.id (must retrigger on pack/domain change)", () => {
    const idx = src.indexOf("// ── Effect B:");
    const effectBody = src.slice(idx);
    expect(effectBody).toMatch(/\}, \[pageTruthKey, domain, semanticPack\.id, enabled, pageText, reanalyzeCount\]\);/);
  });

  it("does NOT read domain/semanticPack via non-reactive refs the way useTeachingSynthesis.ts does", () => {
    // useTeachingSynthesis.ts's anti-pattern for THIS hook's purposes is
    // `domainRef.current` / `presetIdRef.current` — confirm this file has no such refs.
    expect(src).not.toMatch(/domainRef/);
    expect(src).not.toMatch(/semanticPackRef/);
  });
});

describe("useSurgeonAnnotations.ts — explicit reanalyze, distinct from generic retry", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(HOOK_FILE, "utf8"); });

  it("exports a reanalyze function", () => {
    expect(src).toMatch(/const reanalyze = useCallback/);
    expect(src).toMatch(/reanalyze,?\s*\}/);
  });

  it("reanalyze sets forceRefetchRef to bypass the cache-hit / already-started guard", () => {
    const idx = src.indexOf("const reanalyze = useCallback");
    const body = src.slice(idx, idx + 300);
    expect(body).toMatch(/forceRefetchRef\.current = true/);
  });

  it("REQUIRED: retry rebuilds the same pageTruthKey only — reanalyze() itself never references pageTruthKey, so a retry can only ever re-fire Effect B with whatever pageTruthKey is CURRENTLY the reactive prop, never a frozen/stale one", () => {
    const idx = src.indexOf("const reanalyze = useCallback(() => {");
    const end = src.indexOf("}, []);", idx);
    const body = src.slice(idx, end);
    expect(body).not.toMatch(/pageTruthKey/);
  });

  it("Effect B's fetch input is built from the reactive pageTruthKey prop, not a ref frozen at an earlier render", () => {
    const idx = src.indexOf("// ── Effect B:");
    const effectBody = src.slice(idx);
    const inputIdx = effectBody.indexOf("buildSurgeonAnnotationInput({");
    const inputBlock = effectBody.slice(inputIdx, inputIdx + 150);
    expect(inputBlock).toMatch(/pageTruthKey,/);
    expect(inputBlock).not.toMatch(/pageTruthKeyRef\.current/);
  });
});

describe("useSurgeonAnnotations.ts — stale-response rejection on real page navigation", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(HOOK_FILE, "utf8"); });

  it("REQUIRED: a fetch response whose plan.pageTruthKey does not match the current pageTruthKey is dropped, not applied", () => {
    const idx = src.indexOf('if (data.plan.pageTruthKey !== pageTruthKey) {');
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 650);
    expect(block).toMatch(/Stale response for a page we've since navigated away from — drop/);
    expect(block).toMatch(/setAnnotationFailureStage\("page_identity"\);/);
    expect(block).toMatch(/return;/);
  });

  it("Effect A aborts any in-flight Effect B fetch when pageTruthKey changes (real page navigation), before a stale response can overwrite the new page's state", () => {
    const idx = src.indexOf("// ── Effect A:");
    const effectBody = src.slice(idx, src.indexOf("// ── Effect B:"));
    const cleanupIdx = effectBody.indexOf("return () => {");
    const cleanup = effectBody.slice(cleanupIdx, cleanupIdx + 200);
    expect(cleanup).toMatch(/abortRef\.current\.abort\(\)/);
  });

  it("Effect B checks ctrl.signal.aborted immediately after the fetch resolves, before applying any state", () => {
    const idx = src.indexOf("// ── Effect B:");
    const effectBody = src.slice(idx);
    const fetchIdx = effectBody.indexOf("const res = await fetch(");
    const afterFetch = effectBody.slice(fetchIdx, fetchIdx + 400);
    expect(afterFetch).toMatch(/if \(ctrl\.signal\.aborted\) return;/);
  });
});

describe("useSurgeonAnnotations.ts — cache-first, then fetch", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(HOOK_FILE, "utf8"); });

  it("Effect A attempts getSurgeonAnnotationPlan before any network call", () => {
    const idx = src.indexOf("// ── Effect A:");
    const effectBody = src.slice(idx, src.indexOf("// ── Effect B:"));
    expect(effectBody).toMatch(/getSurgeonAnnotationPlan\(cacheKey\)/);
    expect(effectBody).not.toMatch(/fetch\(/);
  });

  it("a fresh cache hit sets status to success immediately, without waiting on Effect B", () => {
    const idx = src.indexOf("// ── Effect A:");
    const effectBody = src.slice(idx, src.indexOf("// ── Effect B:"));
    expect(effectBody).toMatch(/setStatus\("success"\)/);
  });

  it("Effect B persists a successful fetch back to the store for next time", () => {
    expect(src).toMatch(/saveSurgeonAnnotationPlan\(/);
  });
});

describe("useSurgeonAnnotations.ts — degraded/failure UX matches the spec verbatim", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(HOOK_FILE, "utf8"); });

  it("uses the exact required status message, and does NOT claim any fallback annotations are still shown", () => {
    expect(src).toMatch(/Advanced annotations could not be generated\./);
    expect(src).not.toMatch(/Basic grounded highlights are shown when available/);
    expect(src).not.toMatch(/Grounded textbook annotations are still shown/);
    expect(src).not.toMatch(/No automatic highlights on this page right now/);
  });

  it("a degraded API response does not clear a previously-set plan/highlightTargets", () => {
    const idx = src.indexOf("if (!data.ok)");
    const body = src.slice(idx, idx + 300);
    expect(body).not.toMatch(/setPlan\(null\)/);
    expect(body).not.toMatch(/setHighlightTargets\(\[\]\)/);
  });

  it("zero annotations surviving quote verification is also treated as degraded, not silently empty", () => {
    expect(src).toMatch(/targets\.length === 0 && data\.plan\.annotations\.length > 0/);
  });
});

describe("useSurgeonAnnotations.ts — stale content from a DIFFERENT domain/pack must not survive a genuine combination change", () => {
  // Regression: a real bug where switching domain/semanticPack while a plan
  // from the OLD combination was displayed, followed by a failed refetch for
  // the NEW combination, left the failure banner ("could not be generated")
  // showing on top of highlights that belonged to a completely different,
  // unrelated combination — self-contradictory and misleading. This is
  // DISTINCT from the same-key reanalyze() case just above, which
  // intentionally keeps prior content up while a retry runs.
  let src: string;
  beforeAll(() => { src = fs.readFileSync(HOOK_FILE, "utf8"); });

  it("REQUIRED: tracks displayedKeyRef separately from startedKeyRef — 'what's on screen' vs 'what's already been tried'", () => {
    expect(src).toMatch(/const displayedKeyRef\s+= useRef<string \| null>\(null\);/);
  });

  it("REQUIRED: Effect B clears plan/highlightTargets/groundedAnnotations/wholePageAnnotations when the new fetch is for a DIFFERENT compositeKey than what's currently displayed", () => {
    const idx = src.indexOf("if (displayedKeyRef.current !== null && displayedKeyRef.current !== compositeKey) {");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 300);
    expect(block).toMatch(/setPlan\(null\);/);
    expect(block).toMatch(/setHighlightTargets\(\[\]\);/);
    expect(block).toMatch(/setGroundedAnnotations\(\[\]\);/);
    expect(block).toMatch(/setWholePageAnnotations\(\[\]\);/);
  });

  it("this clear runs BEFORE setStatus(\"loading\") — so the UI never shows stale cross-combination content even for one render", () => {
    const clearIdx = src.indexOf("if (displayedKeyRef.current !== null && displayedKeyRef.current !== compositeKey) {");
    const loadingIdx = src.indexOf('setStatus("loading");', clearIdx);
    expect(clearIdx).toBeGreaterThan(-1);
    expect(loadingIdx).toBeGreaterThan(clearIdx);
  });

  it("displayedKeyRef is set on Effect A's cache-hit success (reusing the same compositeKey as startedKeyRef)", () => {
    const idx = src.indexOf("startedKeyRef.current = `${pageTruthKey}|${domain}|${semanticPack.id}`;");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 130);
    expect(block).toMatch(/displayedKeyRef\.current = startedKeyRef\.current;/);
  });

  it("displayedKeyRef is set on Effect B's fetch success, to that fetch's own compositeKey", () => {
    const idx = src.indexOf("setStatus(\"success\");\n        displayedKeyRef.current = compositeKey;");
    expect(idx).toBeGreaterThan(-1);
  });

  it("displayedKeyRef is reset to null in Effect A's page-reset block — a page change (not just a domain/pack change) clears the same way", () => {
    const idx = src.indexOf("startedKeyRef.current = null;\n    displayedKeyRef.current = null;");
    expect(idx).toBeGreaterThan(-1);
  });
});

describe("useSurgeonAnnotations.ts — hands off HighlightTarget[], never computes coordinates itself", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(HOOK_FILE, "utf8"); });

  it("imports HighlightTarget, not OverlayRect or any coordinate/geometry type", () => {
    expect(src).toMatch(/import type \{ HighlightTarget \} from "@\/lib\/readerContracts"/);
    expect(src).not.toMatch(/resolveAnchorGeometry/);
    expect(src).not.toMatch(/OverlayRect/);
  });

  it("calls groundSurgeonQuotes for verification before building targets", () => {
    expect(src).toMatch(/groundSurgeonQuotes\(/);
  });

  it("applies limitAnnotationDensity to the output of groundSurgeonQuotes at both call sites, before groundedAnnotationsToHighlightTargets", () => {
    const calls = src.match(/const wholePage = groundSurgeonQuotes\(/g) ?? [];
    expect(calls).toHaveLength(2);
    const blocks = src.split("const wholePage = groundSurgeonQuotes(").slice(1);
    for (const block of blocks) {
      const nearby = block.slice(0, 400);
      expect(nearby).toMatch(/const grounded = limitAnnotationDensity\(wholePage,\s*(?:stored\.plan|data\.plan)\.pageRole\);/);
      expect(nearby).toMatch(/groundedAnnotationsToHighlightTargets\(grounded,/);
    }
  });

  it("wholePageAnnotations is the SAME groundSurgeonQuotes() output as groundedAnnotations, WITHOUT limitAnnotationDensity's PDF-margin-note cap — the Whiteboard's fuller view of the same one page read", () => {
    const calls = src.match(/setWholePageAnnotations\(wholePage\)/g) ?? [];
    expect(calls).toHaveLength(2);
    expect(src).toMatch(/wholePageAnnotations,\n/);
  });

  it("carries treatment and canonicalType through onto each HighlightTarget", () => {
    expect(src).toMatch(/treatment:\s*g\.treatment/);
    expect(src).toMatch(/canonicalType:\s*g\.canonicalType/);
  });
});

describe("SmartPDFViewer.tsx — page-image capture decoupled from zoom", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(VIEWER_FILE, "utf8"); });

  it("exposes an onPageImageCaptured prop", () => {
    expect(src).toMatch(/onPageImageCaptured\?:\s*\(page: number, dataUrl: string\) => void/);
  });

  it("the hidden capture <Page> uses a fixed scale, not effectiveZoom", () => {
    const idx = src.indexOf("Hidden capture:");
    const block = src.slice(idx, idx + 1200);
    expect(block).toMatch(/scale=\{SURGEON_CAPTURE_SCALE\}/);
    expect(block).not.toMatch(/scale=\{effectiveZoom\}/);
  });

  it("HighlightTarget's treatment/canonicalType are threaded into the anchor-driven OverlayRect", () => {
    expect(src).toMatch(/treatment:\s*target\.treatment/);
    expect(src).toMatch(/canonicalType:\s*target\.canonicalType/);
  });
});

describe("PureReaderView.tsx — SurgeonAnnotationPlan is the EXCLUSIVE PDF overlay owner, no legacy fallback", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(PURE_READER_FILE, "utf8"); });

  it("accepts surgeonHighlightTargets and onPageImageCaptured props", () => {
    expect(src).toMatch(/surgeonHighlightTargets\?:/);
    expect(src).toMatch(/onPageImageCaptured\?:/);
  });

  it("highlightTargets is always surgeonHighlightTargets (or []) — never falls back to allHighlightTargets/aiHighlightAnchors", () => {
    const idx = src.indexOf("highlightTargets={(() => {");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, src.indexOf("})()}", idx));
    expect(block).toMatch(/const targets = surgeonHighlightTargets \?\? \[\];/);
    expect(block).not.toMatch(/return allHighlightTargets;/);
    expect(block).not.toMatch(/return effectiveHighlightTargets;/);
  });

  it("authorizedHighlightIds is derived only from surgeonHighlightTargets, never from effectiveHighlightTargets as a fallback", () => {
    const idx = src.indexOf("authorizedHighlightIds={");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 200);
    expect(block).toMatch(/\(surgeonHighlightTargets \?\? \[\]\)\.map\(t => t\.evidenceRefId\)/);
    expect(block).not.toMatch(/effectiveHighlightTargets/);
  });

  it("forwards onPageImageCaptured through to SmartPDFViewer", () => {
    expect(src).toMatch(/onPageImageCaptured=\{onPageImageCaptured\}/);
  });
});

describe("pages/index.tsx — SurgeonAnnotationPlan wiring", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(INDEX_FILE, "utf8"); });

  it("calls useSurgeonAnnotations with a reactive domain and semanticPack (not refs)", () => {
    const idx = src.indexOf("const surgeonAnnotations = useSurgeonAnnotations({");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 900);
    expect(block).toMatch(/domain:\s*surgeonPageDomain/);
    expect(block).toMatch(/semanticPack:\s*activePack/);
  });

  it("useSurgeonAnnotations is called AFTER pageTruthKey is destructured from useActivePageIntelligence (no TDZ)", () => {
    const ptkDeclIdx = src.indexOf("} = useActivePageIntelligence({");
    const hookCallIdx = src.indexOf("const surgeonAnnotations = useSurgeonAnnotations({");
    expect(ptkDeclIdx).toBeGreaterThan(-1);
    expect(hookCallIdx).toBeGreaterThan(ptkDeclIdx);
  });

  it("passes surgeonHighlightTargets and onPageImageCaptured to PureReaderView", () => {
    expect(src).toMatch(/surgeonHighlightTargets=\{surgeonAnnotations\.highlightTargets\}/);
    expect(src).toMatch(/onPageImageCaptured=\{\(pageNumber, dataUrl\) =>/);
  });

  it("shows the degraded-status banner with a retry action wired to reanalyze()", () => {
    expect(src).toMatch(/surgeonAnnotations\.status === "error" && surgeonAnnotations\.annotationErrorMessage/);
    expect(src).toMatch(/onClick=\{surgeonAnnotations\.reanalyze\}/);
  });

  it('shows a "Reading and annotating this page…" notice while status is loading — never silently rendering nothing while the fetch is in flight', () => {
    expect(src).toMatch(/surgeonAnnotations\.status === "loading"/);
    expect(src).toMatch(/Reading and annotating this page…/);
  });
});

describe("pages/index.tsx — geometry_resolution / render banner (stages downstream of a successful plan)", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(INDEX_FILE, "utf8"); });

  it("subscribes to annotationRenderStage/annotationRenderCounts from the shared readingFocusStore", () => {
    expect(src).toMatch(/const annotationRenderStage\s*=\s*useReadingFocusStore\(s => s\.annotationRenderStage\);/);
    expect(src).toMatch(/const annotationRenderCounts = useReadingFocusStore\(s => s\.annotationRenderCounts\);/);
  });

  it("REQUIRED: only shows this banner when the AI plan itself SUCCEEDED — never stacked with the status===\"error\" failure banner for the same page", () => {
    const idx = src.indexOf('surgeonAnnotations.status === "success" && annotationRenderStage && annotationRenderCounts');
    expect(idx).toBeGreaterThan(-1);
  });

  it("distinguishes geometry_resolution copy (could not be located) from render copy (could not be rendered)", () => {
    const idx = src.indexOf('surgeonAnnotations.status === "success" && annotationRenderStage');
    const block = src.slice(idx, idx + 900);
    expect(block).toMatch(/annotationRenderStage === "geometry_resolution"/);
    expect(block).toMatch(/could not be located on this page/);
    expect(block).toMatch(/could not be rendered/);
  });

  it("this banner also offers Retry wired to reanalyze()", () => {
    const idx = src.indexOf('surgeonAnnotations.status === "success" && annotationRenderStage');
    const block = src.slice(idx, idx + 1200);
    expect(block).toMatch(/onClick=\{surgeonAnnotations\.reanalyze\}/);
  });
});

describe("useSurgeonAnnotations.ts — groundedAnnotations: full-fidelity output for the Scene Builder", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(HOOK_FILE, "utf8"); });

  it("groundedAnnotations and planTier appear in the returned object, sourced from resolveAnnotationTier", () => {
    const idx = src.lastIndexOf("return {");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 600);
    expect(block).toMatch(/highlightTargets:\s*tiered\.highlightTargets,/);
    expect(block).toMatch(/groundedAnnotations:\s*tiered\.groundedAnnotations,/);
    expect(block).toMatch(/planTier:\s*tiered\.planTier,/);
    expect(src).toMatch(/const tiered = resolveAnnotationTier\(\{/);
  });

  it("limitAnnotationDensity(groundSurgeonQuotes(...), pageRole) is called exactly twice (once per effect), each feeding both setGroundedAnnotations and groundedAnnotationsToHighlightTargets from the same local variable", () => {
    const calls = src.match(/const wholePage = groundSurgeonQuotes\(/g) ?? [];
    expect(calls).toHaveLength(2);
    const blocks = src.split("const wholePage = groundSurgeonQuotes(").slice(1);
    for (const block of blocks) {
      const nearby = block.slice(0, 1000);
      // REQUIRED: pageRole is threaded through so density caps adapt to the
      // page's own classification (comparison/example/procedure pages get a
      // different budget than the base default) — see limitAnnotationDensity.ts.
      expect(nearby).toMatch(/const grounded = limitAnnotationDensity\(wholePage,\s*(?:stored\.plan|data\.plan)\.pageRole\);/);
      expect(nearby).toMatch(/groundedAnnotationsToHighlightTargets\(grounded,/);
      expect(nearby).toMatch(/setGroundedAnnotations\(grounded\)/);
      expect(nearby).toMatch(/setWholePageAnnotations\(wholePage\)/);
    }
  });

  it("imports buildSurgeonEvidenceId rather than reintroducing an inline id template literal", () => {
    expect(src).toMatch(/import \{ groundSurgeonQuotes, buildSurgeonEvidenceId, type GroundedSurgeonAnnotation \}/);
    expect(src).not.toMatch(/`surgeon-\$\{pageNumber\}-\$\{i\}`/);
  });

  it("Effect A's page-reset block clears groundedAnnotations alongside plan/highlightTargets", () => {
    const idx = src.indexOf("// ── Effect A:");
    const resetBlock = src.slice(idx, idx + 400);
    expect(resetBlock).toMatch(/setPlan\(null\)/);
    expect(resetBlock).toMatch(/setHighlightTargets\(\[\]\)/);
    expect(resetBlock).toMatch(/setGroundedAnnotations\(\[\]\)/);
  });

  it("groundedAnnotations is documented as full-fidelity vs. the lossy highlightTargets", () => {
    expect(src).toMatch(/Full-fidelity grounded annotations/);
  });
});

describe("useSurgeonAnnotations.ts — no fallback tier: SurgeonAnnotationPlan is the sole source of automatic annotations", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(HOOK_FILE, "utf8"); });

  it("does not import a deterministic/AI-free baseline extractor — that fallback tier was removed", () => {
    expect(src).not.toMatch(/deterministicAnnotationPlan/);
    expect(src).not.toMatch(/buildDeterministicAnnotationPlan/);
    expect(src).not.toMatch(/deterministicBaseline/);
  });

  it("the hook body calls resolveAnnotationTier with only the AI results plus status — no baseline args", () => {
    const idx = src.indexOf("const tiered = resolveAnnotationTier({");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 200);
    expect(block).toMatch(/aiHighlightTargets:\s*highlightTargets,/);
    expect(block).toMatch(/aiGroundedAnnotations:\s*groundedAnnotations,/);
    expect(block).toMatch(/status,/);
    expect(block).not.toMatch(/baselineTargets/);
    expect(block).not.toMatch(/baselineGrounded/);
  });
});

describe("resolveAnnotationTier — planTier (ready/empty/failed), executed directly, no fallback tier", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { resolveAnnotationTier } = require("../../components/reader/useSurgeonAnnotations");

  function target(id: string) {
    return { id, page: 1, text: id, normalizedText: id, level: "important", score: 1,
      sourceParagraphIndex: 0, kind: "definition", evidenceRefId: id, reason: "r",
      treatment: "definitionBar", canonicalType: "definition", groundingState: "exact" };
  }
  function grounded(id: string) {
    return { canonicalType: "definition", exactQuote: id, reason: "r", importance: "high",
      treatment: "definitionBar", spanScope: "fullSentence", groundedText: id,
      groundingState: "exact", confidence: 1 };
  }

  it("AI produced targets — planTier 'ready'", () => {
    const result = resolveAnnotationTier({
      aiHighlightTargets: [target("ai1")],
      aiGroundedAnnotations: [grounded("ai1")],
      status: "success",
    });
    expect(result.planTier).toBe("ready");
    expect(result.highlightTargets).toEqual([target("ai1")]);
  });

  it("REQUIRED: the AI request failed and there are no targets — planTier 'failed', overlay genuinely empty, never substituted with something else", () => {
    const result = resolveAnnotationTier({
      aiHighlightTargets: [],
      aiGroundedAnnotations: [],
      status: "error",
    });
    expect(result.planTier).toBe("failed");
    expect(result.highlightTargets).toEqual([]);
    expect(result.groundedAnnotations).toEqual([]);
  });

  it("no AI targets yet and no error (idle/loading, or a legitimately empty plan) — planTier 'empty'", () => {
    const result = resolveAnnotationTier({
      aiHighlightTargets: [],
      aiGroundedAnnotations: [],
      status: "loading",
    });
    expect(result.planTier).toBe("empty");
    expect(result.highlightTargets).toEqual([]);
  });
});

describe("useSurgeonAnnotations.ts — content-derived integrity check, additive to pageTruthKey", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(HOOK_FILE, "utf8"); });

  it("imports computePageContentHash", () => {
    expect(src).toMatch(/import \{ computePageContentHash \} from "@\/lib\/insights\/pageContentHash"/);
  });

  it("passes documentId (bookIdRef.current) into buildSurgeonAnnotationInput", () => {
    const idx = src.indexOf("buildSurgeonAnnotationInput({");
    const block = src.slice(idx, idx + 200);
    expect(block).toMatch(/documentId:\s*bookIdRef\.current,/);
  });

  it("REQUIRED: a fetch response whose pageContentHash does not match a freshly re-derived current value is dropped", () => {
    const idx = src.indexOf("if (data.pageContentHash !== currentContentHash)");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/setAnnotationFailureStage\("page_identity"\);/);
    expect(block).toMatch(/return;/);
  });

  it("the expected hash is re-derived from the LIVE pageTextRef at response time, not a value captured when the request was built", () => {
    const idx = src.indexOf("const currentContentHash = computePageContentHash(");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 250);
    expect(block).toMatch(/pageNumberRef\.current/);
    expect(block).toMatch(/cleanActivePageText\(pageTextRef\.current\)/);
  });

  it("the content-hash check runs AFTER the pageTruthKey check, both before grounding", () => {
    const ptkIdx = src.indexOf("if (data.plan.pageTruthKey !== pageTruthKey)");
    const hashIdx = src.indexOf("if (data.pageContentHash !== currentContentHash)");
    const groundIdx = src.indexOf("const wholePage = groundSurgeonQuotes(data.plan.annotations");
    expect(ptkIdx).toBeGreaterThan(-1);
    expect(hashIdx).toBeGreaterThan(ptkIdx);
    expect(groundIdx).toBeGreaterThan(hashIdx);
  });
});

describe("useSurgeonAnnotations.ts — grounds against RAW page text, matching what geometry resolution searches", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(HOOK_FILE, "utf8"); });

  it("still imports cleanActivePageText (used for content-hash identity checking, not grounding)", () => {
    expect(src).toMatch(/import \{ cleanActivePageText \} from "@\/lib\/insights\/cleanActivePageText"/);
  });

  it("REQUIRED: both groundSurgeonQuotes call sites ground against the RAW pageTextRef.current, not cleanActivePageText(...)", () => {
    const calls = src.match(/groundSurgeonQuotes\([^,]+,\s*pageTextRef\.current,\s*sentenceMap\)/g) ?? [];
    expect(calls).toHaveLength(2);
    // Grounding against the CLEANED text was a proven bug: downstream PDF-
    // coordinate resolution (both the TextLayerRegistry-backed strategy and
    // SmartPDFViewer's own DOM-fallback match) always searches the RAW, live
    // PDF text layer — never the cleaned text. A quote whose sentence-boundary
    // expansion ran through a stripped running header/footer/caption, or across
    // a merged drop-cap, could verify fine against cleaned text yet never be
    // located in the actual rendered PDF — "grounded" in the right panel,
    // permanently invisible on the page. Grounding against raw text guarantees
    // any successful match is, by construction, findable in the same text
    // geometry resolution will search.
    expect(src).not.toMatch(/groundSurgeonQuotes\([^,]+,\s*cleanActivePageText\(pageTextRef\.current\)\)/);
  });
});

describe("useSurgeonAnnotations.ts — Gemini visual context is merged into the ONE page read, never a second independent analysis", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(HOOK_FILE, "utf8"); });

  it("imports resolveVisualContext", () => {
    expect(src).toMatch(/import \{ resolveVisualContext \} from "@\/lib\/insights\/resolveVisualContext"/);
  });

  it("REQUIRED: resolveVisualContext is awaited BEFORE buildSurgeonAnnotationInput is called, so its result can be included in the SAME request", () => {
    const visualIdx = src.indexOf("const visualContext = await resolveVisualContext({");
    const inputIdx = src.indexOf("const input = buildSurgeonAnnotationInput({");
    expect(visualIdx).toBeGreaterThan(-1);
    expect(inputIdx).toBeGreaterThan(visualIdx);
  });

  it("passes visualContext into buildSurgeonAnnotationInput", () => {
    const idx = src.indexOf("const input = buildSurgeonAnnotationInput({");
    const block = src.slice(idx, idx + 700);
    expect(block).toMatch(/visualContext,/);
  });

  it("REQUIRED: uses the SAME AbortController as the OpenAI fetch that follows — a real page navigation cancels both, not just one", () => {
    const idx = src.indexOf("const visualContext = await resolveVisualContext({");
    const block = src.slice(idx, idx + 300);
    expect(block).toMatch(/signal:\s*ctrl\.signal,/);
  });

  it("checks ctrl.signal.aborted immediately after resolveVisualContext resolves, before building the OpenAI request", () => {
    const idx = src.indexOf("const visualContext = await resolveVisualContext({");
    const block = src.slice(idx, src.indexOf("const input = buildSurgeonAnnotationInput({"));
    expect(block).toMatch(/if \(ctrl\.signal\.aborted\) return;/);
  });
});

describe("useSurgeonAnnotations.ts — page_extraction: a genuinely-too-short page gets a diagnosable stage, not silence", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(HOOK_FILE, "utf8"); });

  it("REQUIRED: distinguishes 'pageText hasn't loaded yet' (rawPageTextLength === 0, normal/transient, no failure stage) from 'extraction produced too little' (rawPageTextLength > 0 but still under the floor, a real page_extraction failure)", () => {
    const idx = src.indexOf("const rawPageTextLength = pageText?.length ?? 0;");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 900);
    expect(block).toMatch(/if \(rawPageTextLength > 0\) \{/);
    expect(block).toMatch(/setAnnotationFailureStage\("page_extraction"\);/);
  });

  it("does NOT set page_extraction when pageText is still empty (rawPageTextLength === 0) — this is the normal state right after a page navigation, before async extraction has produced anything yet", () => {
    const idx = src.indexOf("if (!hasPageText) {");
    const block = src.slice(idx, idx + 500);
    // The guard must be `if (rawPageTextLength > 0)`, not unconditional.
    expect(block).not.toMatch(/setAnnotationFailureStage\("page_extraction"\);\s*\n\s*return;\s*\n\s*\}/);
  });

  it("page_extraction is part of the exported ClientFailureStage union", () => {
    expect(src).toMatch(/export type ClientFailureStage = ServerFailureStage \| "page_extraction" \| "page_identity" \| "network_error";/);
  });
});
