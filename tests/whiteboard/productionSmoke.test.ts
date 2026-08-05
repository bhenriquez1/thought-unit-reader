// tests/whiteboard/productionSmoke.test.ts
// Production smoke guards for the two failure modes reported against a live
// deployment:
//   1. Whiteboard modal stops at "Whiteboard configuration is unavailable."
//      before any scene can render — caused by NEXT_PUBLIC_TLDRAW_LICENSE_KEY
//      missing from the client bundle. This is intentional guard behavior
//      (never a silent blank canvas), but it must only trip when the key is
//      actually missing in production — never in development, and never when
//      the key IS present.
//   2. The deterministic Scene Builder pipeline (SurgeonAnnotationPlan →
//      groundedAnnotations → surgeonAnnotationsToCanonicalEntries → VSG) must
//      produce a real, non-empty prefilled scene from grounded page content —
//      with no AI/network call involved — so a real page with real annotations
//      never falls back to a blank/generic whiteboard.

import fs from "fs";
import path from "path";
import { buildVSG, surgeonAnnotationsToCanonicalEntries } from "../../lib/whiteboard/visualSceneGraph";
import type { GroundedSurgeonAnnotation } from "../../lib/highlights/groundSurgeonQuotes";

const CANVAS_FILE = path.resolve(__dirname, "../../components/whiteboard/TldrawCanvas.tsx");

describe("TldrawCanvas.tsx — license key gate", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS_FILE, "utf8"); });

  it("reads the license key from NEXT_PUBLIC_TLDRAW_LICENSE_KEY (client-bundled, never hardcoded)", () => {
    expect(src).toMatch(/const licenseKey = process\.env\.NEXT_PUBLIC_TLDRAW_LICENSE_KEY;/);
  });

  it("the missing-license gate only trips in production, never in development", () => {
    expect(src).toMatch(/const licenseMissingInProduction = process\.env\.NODE_ENV === "production" && !licenseKey;/);
  });

  it("when the license is missing in production, renders an accessible visible error, not a blank canvas", () => {
    const idx = src.indexOf("licenseMissingInProduction ?");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 700);
    expect(block).toMatch(/role="alert"/);
    expect(block).toMatch(/Whiteboard configuration is unavailable\./);
  });

  it("when the license is present (or not production), renders <Tldraw> with the key passed through", () => {
    const idx = src.indexOf("licenseMissingInProduction ?");
    const block = src.slice(idx, idx + 700);
    expect(block).toMatch(/<Tldraw/);
    expect(block).toMatch(/licenseKey=\{licenseKey\}/);
  });

  it("logs safe presence/shape diagnostics — never the license key value itself", () => {
    const idx = src.indexOf("[WHITEBOARD_LICENSE_DIAGNOSTIC]");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 250);
    expect(block).toMatch(/licenseConfigured:\s*Boolean\(licenseKey\)/);
    expect(block).toMatch(/licensePrefixPresent:\s*licenseKey\?\.startsWith\("tldraw-"\)/);
    // The diagnostic object must never interpolate/spread the raw key itself.
    expect(block).not.toMatch(/licenseKey,\s*\n/);
    expect(block).not.toMatch(/\bkey:\s*licenseKey\b/);
  });

  it("the license-missing message identifies the specific failed prerequisite", () => {
    const idx = src.indexOf("licenseMissingInProduction ?");
    const block = src.slice(idx, idx + 700);
    expect(block).toMatch(/Missing: tldraw license key\./);
  });
});

describe("TldrawCanvas.tsx — canvas initialization failure guard", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS_FILE, "utf8"); });

  it("the rebuild effect wraps shape construction in try/catch, converting a throw into canvasInitFailure state instead of an uncaught exception", () => {
    const idx = src.indexOf("if (!editor || !lessonPlan) return;");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 1200);
    expect(block).toMatch(/try\s*\{/);
    expect(block).toMatch(/catch\s*\(err\)/);
    expect(block).toMatch(/setCanvasInitFailure\(message\)/);
    expect(block).toMatch(/setCanvasInitFailure\(null\)/);
  });

  it("logs the failure with a dedicated diagnostic tag, not a bare console.error", () => {
    expect(src).toMatch(/console\.error\("\[WHITEBOARD_CANVAS_INIT_FAILURE\]", message\)/);
  });

  it("renders a distinct, accessible message for canvas-init failure, separate from the license-missing message", () => {
    const idx = src.indexOf("canvasInitFailure &&");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 800);
    expect(block).toMatch(/role="alert"/);
    expect(block).toMatch(/Canvas initialization failed\./);
  });

  it("the canvas-init-failure overlay does not block interaction with the underlying (mounted) canvas", () => {
    const idx = src.indexOf("canvasInitFailure &&");
    const block = src.slice(idx, idx + 800);
    expect(block).toMatch(/pointerEvents:\s*"none"/);
  });
});

describe("Scene Builder — end-to-end smoke: grounded page content produces a real prefilled scene", () => {
  function makeGrounded(overrides: Partial<GroundedSurgeonAnnotation> = {}): GroundedSurgeonAnnotation {
    return {
      canonicalType: "definition",
      exactQuote:    "Glycolysis converts glucose into pyruvate in the cytosol.",
      reason:        "Defines the core process for this page.",
      importance:    "critical",
      treatment:     "definitionBar",
      spanScope:     "fullSentence",
      groundedText:  "Glycolysis converts glucose into pyruvate in the cytosol.",
      groundingState: "exact",
      confidence:    1.0,
      ...overrides,
    };
  }

  it("a realistic page's grounded annotations produce a VSG with nodes — no AI/network call, fully deterministic", () => {
    const grounded: GroundedSurgeonAnnotation[] = [
      makeGrounded({ canonicalType: "definition", importance: "critical", exactQuote: "d1", groundedText: "d1" }),
      makeGrounded({ canonicalType: "mechanism",   importance: "high",     exactQuote: "m1", groundedText: "m1" }),
      makeGrounded({ canonicalType: "trap",        importance: "supporting", exactQuote: "t1", groundedText: "t1" }),
    ];
    const entries = surgeonAnnotationsToCanonicalEntries(grounded, 4);
    expect(entries.length).toBe(3);

    const vsg = buildVSG(entries, "flow", { pageNumber: 4 });
    expect(vsg.nodes.length).toBeGreaterThan(0);
    expect(vsg.sourcePageNumber).toBe(4);
  });

  it("empty grounded annotations (e.g. degraded analysis) produce empty entries — WhiteboardPanel's fallback to noteCardsToCanonicalEntries handles this, not a silent crash", () => {
    const entries = surgeonAnnotationsToCanonicalEntries([], 4);
    expect(entries).toEqual([]);
  });
});
