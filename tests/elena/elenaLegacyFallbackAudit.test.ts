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

describe("Elena canonical experience — reader first, not the old rewards dashboard", () => {
  it("opens the active learner directly in Reading", () => {
    const src = read(WORKSPACE_FILE);
    expect(src).toMatch(/useState<ElenaTab>\("reading"\)/);
    expect(src).not.toMatch(/setActiveTab\("home"\)/);
  });

  it("the primary navigation contains learning destinations, not old Home/Today/Challenge dashboard tabs", () => {
    const src = read(WORKSPACE_FILE);
    const start = src.indexOf("const ELENA_TABS");
    const block = src.slice(start, start + 900);
    expect(block).toMatch(/label: "Reader"/);
    expect(block).toMatch(/label: "Books"/);
    expect(block).toMatch(/label: "Vocabulary"/);
    expect(block).toMatch(/label: "Practice"/);
    expect(block).toMatch(/label: "Progress"/);
    expect(block).not.toMatch(/label: "Home"|label: "Today"|label: "Challenge"/);
  });

  it("uses a full viewport background and a learner-specific Reader empty state", () => {
    const workspace = read(WORKSPACE_FILE);
    const reader = read("components/elena/ChildReaderTab.tsx");
    expect(workspace).toMatch(/min-h-dvh h-full w-full/);
    expect(reader).toMatch(/learnerName/);
    expect(reader).toMatch(/Choose a book and begin/);
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

  it("REQUIRED: removed dashboard destinations cannot remain as hidden render branches", () => {
    const src = read(WORKSPACE_FILE);
    expect(src).not.toMatch(/activeTab === "home"|activeTab === "today"|activeTab === "challenge"/);
    expect(src).not.toMatch(/function HomeTab|function TodayGoalTab|function WeeklyChallengeTab/);
  });
});

describe("Elena legacy-fallback audit — visible ← Reader control, distinct from Parent", () => {
  it("REQUIRED: onboarding also has a visible route back to Avrrio Reader", () => {
    const src = read(WORKSPACE_FILE);
    const setupStart = src.indexOf("export function SetupForm");
    const setup = src.slice(setupStart, setupStart + 7000);
    expect(setup).toMatch(/aria-label="Back to Avrrio Reader"/);
    expect(setup).toMatch(/href="\/"/);
  });

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
  it("REQUIRED: the canonical Reader owns the no-book state and exposes real library/upload actions", () => {
    const src = read("components/elena/ChildReaderTab.tsx");
    expect(src).toMatch(/Choose a book and begin/);
    expect(src).toMatch(/Upload a Book/);
    expect(src).toMatch(/onOpenBook/);
  });
});
