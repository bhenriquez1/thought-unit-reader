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

  it("uses the exact required status message", () => {
    expect(src).toMatch(/Advanced page analysis is temporarily unavailable\. Grounded textbook annotations are still shown\./);
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

  it("applies limitAnnotationDensity to the output of groundSurgeonQuotes before the target-building map", () => {
    const idx = src.indexOf("function toHighlightTargets");
    const body = src.slice(idx, src.indexOf(".map(", idx) + 5);
    expect(body).toMatch(/limitAnnotationDensity\(groundSurgeonQuotes\(/);
    const limitIdx = body.indexOf("limitAnnotationDensity(");
    const mapIdx = body.lastIndexOf(".map(");
    expect(limitIdx).toBeGreaterThan(-1);
    expect(mapIdx).toBeGreaterThan(limitIdx);
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

describe("PureReaderView.tsx — full-replacement wiring (per the confirmed rollout decision)", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(PURE_READER_FILE, "utf8"); });

  it("accepts surgeonHighlightTargets and onPageImageCaptured props", () => {
    expect(src).toMatch(/surgeonHighlightTargets\?:/);
    expect(src).toMatch(/onPageImageCaptured\?:/);
  });

  it("surgeonHighlightTargets, when non-empty, fully replaces allHighlightTargets on the PDF", () => {
    const idx = src.indexOf("highlightTargets={(() => {");
    const block = src.slice(idx, idx + 700);
    expect(block).toMatch(/if \(\(surgeonHighlightTargets\?\.length \?\? 0\) > 0\) return surgeonHighlightTargets!;/);
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
});
