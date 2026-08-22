// tests/reader/eyeGuideDimFocusLayer.test.ts
// P0 stabilization, Tier 2, item 4 — reinstates a speech-driven reading-
// focus dim layer. An earlier pass explicitly removed the old dim veil
// ("Dim veil removed — lighter opacity on highlights means veil no longer
// needed") and never rebuilt it as a playback-driven feature; the only
// dimming left was PdfEvidenceOverlay's unrelated highlight-vs-highlight
// dimming. This reuses the EXISTING canonical sentenceFocusRect (itself
// backed by the TextLayerRegistry-driven resolveTargetGeometry, unified
// with highlighting in an earlier stabilization pass) — no new geometry
// resolver was built, per instruction.
//
// No jsdom/render harness for these files in this repo — source inspection,
// matching this repo's established pattern.

import fs from "fs";
import path from "path";

const VIEWER_SRC = fs.readFileSync(path.resolve(__dirname, "../../components/SmartPDFViewer.tsx"), "utf8");
const PANEL_SRC = fs.readFileSync(path.resolve(__dirname, "../../components/reader/StudySpeechPanel.tsx"), "utf8");
const PAGE_SRC = fs.readFileSync(path.resolve(__dirname, "../../pages/index.tsx"), "utf8");

describe("components/SmartPDFViewer.tsx — dim layer activates only during actual speech playback (item 6)", () => {
  it("REQUIRED: the dim veil is gated on focusHighlightPersist && sentenceFocusRect — no new geometry resolver", () => {
    const idx = VIEWER_SRC.indexOf("{focusHighlightPersist && sentenceFocusRect && (");
    expect(idx).toBeGreaterThan(-1);
    const block = VIEWER_SRC.slice(idx, idx + 700);
    expect(block).toMatch(/top: sentenceFocusRect\.top - 14,/);
    expect(block).toMatch(/boxShadow: "0 0 0 9999px rgba\(0,0,0,0\.38\)",/);
  });

  it("does not introduce a second position-resolution mechanism — reuses sentenceFocusRect's fields verbatim, no new resolveTargetGeometry/resolveWordGeometry call added", () => {
    const idx = VIEWER_SRC.indexOf("{focusHighlightPersist && sentenceFocusRect && (");
    const block = VIEWER_SRC.slice(idx, idx + 500);
    expect(block).not.toMatch(/resolveTargetGeometry|resolveWordGeometry/);
  });

  it("stays subtle — alpha well under fully opaque, so surrounding context remains legible (not \"excessively dark\")", () => {
    const idx = VIEWER_SRC.indexOf("boxShadow: \"0 0 0 9999px rgba(0,0,0,0.38)\"");
    expect(idx).toBeGreaterThan(-1);
  });

  it("REQUIRED: the dim veil (z-25) renders ABOVE PdfEvidenceOverlay's evidence annotation layer (z-20) — P0 fix for the z-order inversion that let green highlights paint over the veil unmuted", () => {
    const veilIdx = VIEWER_SRC.indexOf('className="pointer-events-none absolute z-[25] rounded-lg transition-all duration-150"');
    expect(veilIdx).toBeGreaterThan(-1);
    const overlayIdx = VIEWER_SRC.indexOf("<PdfEvidenceOverlay");
    expect(overlayIdx).toBeGreaterThan(-1);
    expect(veilIdx).toBeGreaterThan(overlayIdx);
  });

  it("REQUIRED: the live word marker (WordRectOverlay, z-30) still renders above the dim veil (z-25) — the veil must never cover the actively-spoken word", () => {
    expect(VIEWER_SRC).toMatch(/className="pointer-events-none absolute z-30 transition-all duration-100"/);
  });

  it("the sentence marker (z-20) stays visually uncovered by the veil despite the veil now outranking it in z-order — the veil's own box is transparent (only its box-shadow paints), and its cutout is padded 14px larger than sentenceFocusRect on every side, so the unpadded sentence marker sits entirely inside the transparent hole", () => {
    const veilIdx = VIEWER_SRC.indexOf('className="pointer-events-none absolute z-[25] rounded-lg transition-all duration-150"');
    const block = VIEWER_SRC.slice(veilIdx - 200, veilIdx + 700);
    expect(block).toMatch(/top: sentenceFocusRect\.top - 14,/);
    expect(block).toMatch(/left: sentenceFocusRect\.left - 14,/);
    expect(block).toMatch(/width: sentenceFocusRect\.width \+ 28,/);
    expect(block).toMatch(/height: sentenceFocusRect\.height \+ 28,/);
    expect(VIEWER_SRC).toMatch(/className="pointer-events-none absolute z-20 rounded transition-all duration-150"/);
  });
});

describe("Pause freezes, Resume continues (items 7-8) — verified via the existing playState/onPlayStateChange contract, not newly added", () => {
  it("pause() only calls updatePlayState('paused') — never onPlayStateChange(false) — so focusHighlightPersist (and therefore the dim veil + sentenceFocusRect) stays exactly as-is while paused", () => {
    const idx = PANEL_SRC.indexOf("function pause() {");
    expect(idx).toBeGreaterThan(-1);
    const block = PANEL_SRC.slice(idx, idx + 700);
    expect(block).toMatch(/updatePlayState\("paused"\)/);
    expect(block).not.toMatch(/onPlayStateChange\?\.\(false\)/);
    expect(block).not.toMatch(/onSnippetFocus\?\.\(null\)/);
  });

  it("resume() never touches onSnippetFocus/onPlayStateChange either — nothing needs to \"restore\" focus because pause() never cleared it", () => {
    const idx = PANEL_SRC.indexOf("function resume() {");
    expect(idx).toBeGreaterThan(-1);
    const block = PANEL_SRC.slice(idx, idx + 700);
    expect(block).not.toMatch(/onSnippetFocus/);
    expect(block).not.toMatch(/onPlayStateChange/);
  });
});

describe("components/reader/StudySpeechPanel.tsx — Stop clears sentence focus immediately (item 9)", () => {
  it("REQUIRED: stop() calls onSnippetFocus?.(null) in addition to the pre-existing clearWord(), instead of relying on the ~2.2s auto-clear timer in SmartPDFViewer", () => {
    const idx = PANEL_SRC.indexOf("function stop() {");
    expect(idx).toBeGreaterThan(-1);
    const block = PANEL_SRC.slice(idx, idx + 1400);
    expect(block).toMatch(/useReadingFocusStore\.getState\(\)\.clearWord\(\);/);
    expect(block).toMatch(/onSnippetFocus\?\.\(null\);/);
  });

  it("the ~2.2s auto-clear timer in SmartPDFViewer is untouched (still the fallback for one-off non-persisted Focus clicks) — this fix adds an immediate clear on Stop, it doesn't remove the timer mechanism itself", () => {
    expect(VIEWER_SRC).toMatch(/window\.setTimeout\(\(\) => setSentenceFocusRect\(null\), 2200\)/);
  });
});

describe("pages/index.tsx — page navigation clears stale sentence focus immediately (item 10)", () => {
  it("REQUIRED: the pageTruthKey-keyed reading-focus reset effect also clears focusSnippet, not just useReadingFocusStore", () => {
    const idx = PAGE_SRC.indexOf("useReadingFocusStore.getState().clearFocus();");
    expect(idx).toBeGreaterThan(-1);
    const block = PAGE_SRC.slice(idx, idx + 1000);
    expect(block).toMatch(/setFocusSnippet\(null\);/);
    expect(block).toMatch(/\}, \[pageTruthKey\]\);/);
  });
});

describe("No regression in existing highlighting geometry/overlay behavior (item 11)", () => {
  it("resolveTargetGeometry is still the sole resolver behind sentenceFocusRect — the canonical-geometry unification from an earlier stabilization pass is untouched", () => {
    const idx = VIEWER_SRC.indexOf("useEffect(() => {\n    if (!focusSnippet || focusSnippet.trim().length < 8)");
    expect(idx).toBeGreaterThan(-1);
    const block = VIEWER_SRC.slice(idx, idx + 500);
    expect(block).toMatch(/resolveTargetGeometry\(currentPage - 1, focusSnippet, effectiveZoom\)/);
  });

  it("PdfEvidenceOverlay (the separate highlight-vs-highlight dimming system) is still rendered unconditionally alongside the new speech-driven dim veil, not replaced by it", () => {
    expect(VIEWER_SRC).toMatch(/<PdfEvidenceOverlay/);
  });

  it("WordRectOverlay is still rendered and still reads useReadingFocusStore directly — untouched by this change", () => {
    expect(VIEWER_SRC).toMatch(/<WordRectOverlay/);
    expect(VIEWER_SRC).toMatch(/const activeAnchorId  = useReadingFocusStore\(s => s\.thoughtUnitId\);/);
  });
});
