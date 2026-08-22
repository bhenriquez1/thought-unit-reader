// tests/elenaNavSmoke.test.ts
// Elena's nav-tab-based wiring (permanently-visible tab, pre-auth-gate render
// branch) was retired when Elena moved to its own route — see
// tests/elena/routeExtraction.test.ts for the current architecture's
// regression guards. This file keeps the remaining checks that are still
// live and unrelated to Elena's own extraction.

import fs   from "fs";
import path from "path";
import { resolveElenaModeFlagsFromEnv, resolveElenaModeFlags } from "@/lib/elena/featureFlags";

const PAGE_SRC = fs.readFileSync(
  path.resolve(__dirname, "../pages/index.tsx"),
  "utf-8",
);

describe("NoteLab tab state preservation", () => {
  it('Study Sheet is always mounted (display:none not conditional)', () => {
    const notelab = PAGE_SRC.indexOf('activeShellTab === "notelab"');
    const studySection = PAGE_SRC.indexOf('notesSubTab === "studyguide"', notelab);
    // Should use display:none style, not {notesSubTab === "studyguide" && (
    const snippet = PAGE_SRC.slice(studySection, studySection + 120);
    expect(snippet).not.toMatch(/&&\s*\(\s*$/m);
    expect(PAGE_SRC).toContain('display: notesSubTab === "studyguide"');
  });

  it('Listen tab is always mounted (display:none not conditional)', () => {
    const notelab = PAGE_SRC.indexOf('activeShellTab === "notelab"');
    expect(PAGE_SRC.indexOf('display: notesSubTab === "podcast"', notelab)).toBeGreaterThan(-1);
  });
});

describe("Elena Mode feature flags", () => {
  it('resolveElenaModeFlags merges overrides with safe defaults', () => {
    const flags = resolveElenaModeFlags({ ELENA_MODE_ENABLED: true });
    expect(flags.ELENA_MODE_ENABLED).toBe(true);
    expect(flags.PARENT_DASHBOARD_ENABLED).toBe(false);
  });

  it('resolveElenaModeFlagsFromEnv reads NEXT_PUBLIC_ELENA_MODE_ENABLED', () => {
    const saved = process.env.NEXT_PUBLIC_ELENA_MODE_ENABLED;
    process.env.NEXT_PUBLIC_ELENA_MODE_ENABLED = "true";
    expect(resolveElenaModeFlagsFromEnv().ELENA_MODE_ENABLED).toBe(true);
    process.env.NEXT_PUBLIC_ELENA_MODE_ENABLED = saved ?? "";
  });

  it('resolveElenaModeFlagsFromEnv defaults to false when env is unset', () => {
    const saved = process.env.NEXT_PUBLIC_ELENA_MODE_ENABLED;
    delete process.env.NEXT_PUBLIC_ELENA_MODE_ENABLED;
    expect(resolveElenaModeFlagsFromEnv().ELENA_MODE_ENABLED).toBe(false);
    if (saved !== undefined) process.env.NEXT_PUBLIC_ELENA_MODE_ENABLED = saved;
  });
});
