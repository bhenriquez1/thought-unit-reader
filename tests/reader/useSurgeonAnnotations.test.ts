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
    const block = src.slice(idx, idx + 150);
    expect(block).toMatch(/Stale response for a page we've since navigated away from — drop it\./);
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

  it("uses the exact required status message, and does NOT claim legacy annotations are still shown", () => {
    expect(src).toMatch(/Advanced page analysis is temporarily unavailable\. Basic grounded highlights are shown when available\./);
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
    const calls = src.match(/const grounded = limitAnnotationDensity\(groundSurgeonQuotes\(/g) ?? [];
    expect(calls).toHaveLength(2);
    const blocks = src.split("const grounded = limitAnnotationDensity(groundSurgeonQuotes(").slice(1);
    for (const block of blocks) {
      const nearby = block.slice(0, 300);
      expect(nearby).toMatch(/groundedAnnotationsToHighlightTargets\(grounded,/);
    }
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

  it('shows a "Reading current page…" notice while status is loading — never silently rendering nothing while the fetch is in flight', () => {
    expect(src).toMatch(/surgeonAnnotations\.status === "loading"/);
    expect(src).toMatch(/Reading current page…/);
  });
});

describe("useSurgeonAnnotations.ts — groundedAnnotations: full-fidelity output for the Scene Builder", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(HOOK_FILE, "utf8"); });

  it("groundedAnnotations and planTier appear in the returned object, sourced from resolveAnnotationTier", () => {
    const idx = src.lastIndexOf("return {");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 300);
    expect(block).toMatch(/highlightTargets:\s*tiered\.highlightTargets,/);
    expect(block).toMatch(/groundedAnnotations:\s*tiered\.groundedAnnotations,/);
    expect(block).toMatch(/planTier:\s*tiered\.planTier,/);
    expect(src).toMatch(/const tiered = resolveAnnotationTier\(\{/);
  });

  it("limitAnnotationDensity(groundSurgeonQuotes(...)) is called exactly twice (once per effect), each feeding both setGroundedAnnotations and groundedAnnotationsToHighlightTargets from the same local variable", () => {
    const calls = src.match(/const grounded = limitAnnotationDensity\(groundSurgeonQuotes\(/g) ?? [];
    expect(calls).toHaveLength(2);
    const blocks = src.split("const grounded = limitAnnotationDensity(groundSurgeonQuotes(").slice(1);
    for (const block of blocks) {
      const nearby = block.slice(0, 700);
      expect(nearby).toMatch(/groundedAnnotationsToHighlightTargets\(grounded,/);
      expect(nearby).toMatch(/setGroundedAnnotations\(grounded\)/);
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

describe("useSurgeonAnnotations.ts — deterministic baseline tier: overlay never goes empty when AI is unavailable", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(HOOK_FILE, "utf8"); });

  it("imports buildDeterministicAnnotationPlan from the AI-free extractor", () => {
    expect(src).toMatch(/import \{ buildDeterministicAnnotationPlan \} from "@\/lib\/highlights\/deterministicAnnotationPlan"/);
  });

  it("deterministicBaseline is computed via useMemo, keyed on pageText/pageTruthKey/pageNumber — no network call", () => {
    const idx = src.indexOf("const deterministicBaseline = useMemo(");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 700);
    expect(block).toMatch(/buildDeterministicAnnotationPlan\(pageText, pageTruthKey\)/);
    expect(block).not.toMatch(/fetch\(/);
    expect(block).toMatch(/\}, \[pageText, pageTruthKey, pageNumber\]\);/);
  });

  it("still runs the deterministic plan through groundSurgeonQuotes + limitAnnotationDensity for pipeline-uniform sentence expansion/density limiting", () => {
    const idx = src.indexOf("const deterministicBaseline = useMemo(");
    const block = src.slice(idx, idx + 700);
    expect(block).toMatch(/limitAnnotationDensity\(groundSurgeonQuotes\(basePlan\.annotations, pageText\)\)/);
  });

  it("the hook body calls resolveAnnotationTier with both AI and baseline results plus status", () => {
    const idx = src.indexOf("const tiered = resolveAnnotationTier({");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 300);
    expect(block).toMatch(/aiHighlightTargets:\s*highlightTargets,/);
    expect(block).toMatch(/aiGroundedAnnotations:\s*groundedAnnotations,/);
    expect(block).toMatch(/baselineTargets:\s*deterministicBaseline\.targets,/);
    expect(block).toMatch(/baselineGrounded:\s*deterministicBaseline\.grounded,/);
    expect(block).toMatch(/status,/);
  });
});

describe("resolveAnnotationTier — 4-way planTier (enriched/grounded/degraded/failed), executed directly", () => {
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

  it("REQUIRED: advanced API unavailable (status error) but grounded (deterministic) annotations still render — planTier 'degraded'", () => {
    const result = resolveAnnotationTier({
      aiHighlightTargets: [],
      aiGroundedAnnotations: [],
      baselineTargets: [target("b1")],
      baselineGrounded: [grounded("b1")],
      status: "error",
    });
    expect(result.planTier).toBe("degraded");
    expect(result.highlightTargets).toEqual([target("b1")]);
    expect(result.groundedAnnotations).toEqual([grounded("b1")]);
  });

  it("AI-enriched output wins whenever it has anything, regardless of baseline content", () => {
    const result = resolveAnnotationTier({
      aiHighlightTargets: [target("ai1")],
      aiGroundedAnnotations: [grounded("ai1")],
      baselineTargets: [target("b1")],
      baselineGrounded: [grounded("b1")],
      status: "success",
    });
    expect(result.planTier).toBe("enriched");
    expect(result.highlightTargets).toEqual([target("ai1")]);
  });

  it("no AI targets, no error, baseline has content — planTier 'grounded' (idle/loading/legitimately-empty-AI states)", () => {
    const result = resolveAnnotationTier({
      aiHighlightTargets: [],
      aiGroundedAnnotations: [],
      baselineTargets: [target("b1")],
      baselineGrounded: [grounded("b1")],
      status: "loading",
    });
    expect(result.planTier).toBe("grounded");
    expect(result.highlightTargets).toEqual([target("b1")]);
  });

  it("no AI targets and no baseline content — planTier 'failed', overlay genuinely empty", () => {
    const result = resolveAnnotationTier({
      aiHighlightTargets: [],
      aiGroundedAnnotations: [],
      baselineTargets: [],
      baselineGrounded: [],
      status: "error",
    });
    expect(result.planTier).toBe("failed");
    expect(result.highlightTargets).toEqual([]);
  });

  it("never merges AI and baseline sets — output is always exactly one of the two arrays, never a concatenation", () => {
    const result = resolveAnnotationTier({
      aiHighlightTargets: [target("ai1")],
      aiGroundedAnnotations: [grounded("ai1")],
      baselineTargets: [target("b1"), target("b2")],
      baselineGrounded: [grounded("b1"), grounded("b2")],
      status: "success",
    });
    expect(result.highlightTargets).toHaveLength(1);
    expect(result.highlightTargets).not.toContainEqual(target("b1"));
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
    const block = src.slice(idx, idx + 300);
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
    const groundIdx = src.indexOf("const grounded = limitAnnotationDensity(groundSurgeonQuotes(data.plan.annotations");
    expect(ptkIdx).toBeGreaterThan(-1);
    expect(hashIdx).toBeGreaterThan(ptkIdx);
    expect(groundIdx).toBeGreaterThan(hashIdx);
  });
});

describe("useSurgeonAnnotations.ts — grounds against cleaned text, matching what the model actually saw", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(HOOK_FILE, "utf8"); });

  it("imports cleanActivePageText", () => {
    expect(src).toMatch(/import \{ cleanActivePageText \} from "@\/lib\/insights\/cleanActivePageText"/);
  });

  it("both groundSurgeonQuotes call sites ground against cleanActivePageText(pageTextRef.current), not the raw ref", () => {
    const calls = src.match(/groundSurgeonQuotes\([^,]+,\s*cleanActivePageText\(pageTextRef\.current\)\)/g) ?? [];
    expect(calls).toHaveLength(2);
    // The raw, uncleaned ref must never be passed directly as the grounding text —
    // buildSurgeonAnnotationInput.ts sends the model cleanActivePageText(pageText),
    // so grounding against raw pageTextRef.current would false-reject any quote
    // touching a merged drop-cap or a stripped running header/caption.
    expect(src).not.toMatch(/groundSurgeonQuotes\([^,]+,\s*pageTextRef\.current\)/);
  });
});
