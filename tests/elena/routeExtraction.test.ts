// tests/elena/routeExtraction.test.ts
// Product-split migration, Phase 0 — Elena Learning becomes its own route
// (app/elena/page.tsx) instead of a pages/index.tsx shell tab.
//
// Elena's own state/persistence/component tree were already ~90% decoupled
// before this change (see tests/elena/elenaCallSite.test.ts's predecessor,
// now retired — its premise, an inline <ElenaChildWorkspace/> render branch,
// no longer exists). The three real coupling points cut here: the "elena"
// shell-tab branch itself, "elena" as a peer WorkspaceMode value, and the
// nav button's dispatch (trySwitchShellTab -> router.push("/elena")).
//
// AskPagePanel (the floating "Ask About This Page" widget on the adult
// Reader) is DELIBERATELY untouched — kept by product decision, since it
// serves a different use case (a child reading alongside an adult on
// whatever book the adult has open) than Elena's own workspace. This file
// asserts it's still there, not just that Elena's tab machinery is gone.
//
// No jsdom/render harness in this repo for either pages/index.tsx or App
// Router pages, so this follows the established source-inspection pattern.

import fs from "fs";
import path from "path";

const INDEX_FILE = path.resolve(__dirname, "../../pages/index.tsx");
const ELENA_PAGE_FILE = path.resolve(__dirname, "../../app/elena/page.tsx");
const WORKSPACE_TYPES_FILE = path.resolve(__dirname, "../../types/workspace.ts");

describe("app/elena/page.tsx — the new route", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(ELENA_PAGE_FILE, "utf8"); });

  it("REQUIRED: is a client component", () => {
    expect(src).toMatch(/^"use client";/);
  });

  it("REQUIRED: renders ElenaChildWorkspace with no props — it already owns its own document/profile state", () => {
    expect(src).toMatch(/<ElenaChildWorkspace\s*\/>/);
  });

  it("wraps the workspace in an ErrorBoundary so a crash here can't render a blank page for the child", () => {
    expect(src).toMatch(/<ErrorBoundary[\s\S]*<ElenaChildWorkspace\s*\/>[\s\S]*<\/ErrorBoundary>/);
  });
});

describe("types/workspace.ts — WorkspaceMode no longer carries Elena as a peer tab value", () => {
  it("REQUIRED: 'elena' is not a member of WorkspaceMode", () => {
    const src = fs.readFileSync(WORKSPACE_TYPES_FILE, "utf8");
    const idx = src.indexOf("export type WorkspaceMode");
    const line = src.slice(idx, src.indexOf("\n", idx));
    expect(line).not.toMatch(/'elena'/);
  });
});

describe("pages/index.tsx — Elena shell-tab wiring is fully removed", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(INDEX_FILE, "utf8"); });

  it("REQUIRED: no more activeShellTab === \"elena\" render branch", () => {
    expect(src).not.toMatch(/activeShellTab === "elena"/);
  });

  it("REQUIRED: no longer imports ElenaChildWorkspace — it's mounted only from app/elena/page.tsx now", () => {
    expect(src).not.toMatch(/import ElenaChildWorkspace/);
  });

  it("REQUIRED: 'elena' removed from trySwitchShellTab's protected-tab exclusion list", () => {
    const idx = src.indexOf("const isProtected = ![");
    const line = src.slice(idx, src.indexOf("\n", idx));
    expect(line).not.toMatch(/"elena"/);
  });

  it("REQUIRED: the nav-elena button navigates to the real /elena route, mirroring the TestLab button's router.push pattern, not a shell-tab switch", () => {
    const idx = src.indexOf('data-testid="nav-elena"');
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(Math.max(0, idx - 300), idx);
    expect(block).toMatch(/router\.push\("\/elena"\);/);
    expect(block).not.toMatch(/trySwitchShellTab\("elena"/);
  });

  it("REQUIRED: AskPagePanel is deliberately KEPT on the adult Reader, still gated by ELENA_ENABLED — a product decision, not an oversight", () => {
    expect(src).toMatch(/import AskPagePanel(\s+)from "@\/components\/elena\/AskPagePanel";/);
    const idx = src.indexOf("ELENA_ENABLED && (");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 300);
    expect(block).toMatch(/<AskPagePanel/);
  });
});
