// tests/elena/elenaLegacyFallbackAudit.test.ts
// Elena legacy/fallback UI removal — Track B. The diagnosis for this pass
// found no old Elena dashboard reachable through a runtime fallback:
// ElenaChildWorkspace has always been the single component app/elena/page.tsx
// renders, and every missing-data state (no book, zero progress, uninitialized
// child state) already renders inside that one component rather than an
// alternate small/legacy dashboard. What WAS true is that its main workspace
// shell was pinned to a narrow max-w-2xl column regardless of viewport width,
// and it had no way back to the adult Reader. This suite locks in the fix.

import fs from "fs";
import path from "path";

function read(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, "../..", relPath), "utf8");
}

const WORKSPACE_FILE = "components/elena/ElenaChildWorkspace.tsx";

describe("Elena legacy-fallback audit — /elena has exactly one live render path", () => {
  it("REQUIRED: app/elena/page.tsx renders only ElenaChildWorkspace, no alternate/legacy component", () => {
    const src = read("app/elena/page.tsx");
    expect(src).toMatch(/<ElenaChildWorkspace\s*\/>/);
    const workspaceImports = src.match(/from "@\/components\/elena\//g) ?? [];
    expect(workspaceImports.length).toBe(1);
  });

  it("REQUIRED: ElenaChildWorkspace itself has a single default export (one component tree, not a legacy/new switch)", () => {
    const src = read(WORKSPACE_FILE);
    const defaultExportMatches = src.match(/export default function/g) ?? [];
    expect(defaultExportMatches.length).toBe(1);
    expect(src).toMatch(/export default function ElenaChildWorkspace/);
  });
});

describe("Elena legacy-fallback audit — the main workspace uses the available viewport width", () => {
  it("REQUIRED: the tab-content wrapper is no longer pinned to max-w-2xl", () => {
    const src = read(WORKSPACE_FILE);
    expect(src).not.toMatch(/h-full max-w-2xl mx-auto w-full px-4 py-4/);
    expect(src).toMatch(/h-full max-w-6xl mx-auto w-full/);
  });

  it("REQUIRED: the bottom tab nav matches the same widened max-width as the content above it", () => {
    const src = read(WORKSPACE_FILE);
    expect(src).toMatch(/flex overflow-x-auto scrollbar-hide max-w-6xl mx-auto/);
  });

  it("REQUIRED: the Explore destinations grid uses more columns on wider viewports instead of staying a fixed 2-column list", () => {
    const src = read(WORKSPACE_FILE);
    expect(src).toMatch(/grid grid-cols-2 md:grid-cols-3 gap-3/);
  });
});

describe("Elena legacy-fallback audit — visible ← Reader control, distinct from Parent", () => {
  it("REQUIRED: the header renders a Link back to the main Avrrio Reader route", () => {
    const src = read(WORKSPACE_FILE);
    expect(src).toMatch(/import Link from "next\/link";/);
    const idx = src.indexOf('aria-label="Back to Avrrio Reader"');
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(Math.max(0, idx - 200), idx + 50);
    expect(block).toMatch(/<Link\s+href="\/"/);
  });

  it("REQUIRED: the Parent control is untouched and does not perform navigation — it's a local overlay toggle, not a repurposed return-to-Reader action", () => {
    const src = read(WORKSPACE_FILE);
    const idx = src.indexOf('aria-label="Open parent dashboard"');
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(Math.max(0, idx - 200), idx);
    expect(block).toMatch(/onClick=\{\(\) => setShowParent\(true\)\}/);
  });
});

describe("Elena legacy-fallback audit — no-book state is a full kid-friendly invitation, not a bare line of text", () => {
  it("REQUIRED: HomeTab's no-book state uses the 'choose your next adventure' framing with a real CTA, inside the same full workspace shell (not a separate tiny dashboard)", () => {
    const src = read(WORKSPACE_FILE);
    expect(src).toMatch(/Let's choose your next adventure!/);
    expect(src).toMatch(/Choose or Start Reading/);
  });
});
