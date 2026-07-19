// tests/elenaNavSmoke.test.ts
// Smoke test: ✨ Elena Mode nav tab must be permanently visible, not gated by ELENA_ENABLED.
// These checks prevent the feature-flag guard from being accidentally re-introduced.

import fs   from "fs";
import path from "path";
import { resolveElenaModeFlagsFromEnv, resolveElenaModeFlags } from "@/lib/elena/featureFlags";

const PAGE_SRC = fs.readFileSync(
  path.resolve(__dirname, "../pages/index.tsx"),
  "utf-8",
);

describe("Elena Mode nav — permanent visibility", () => {
  it('nav-elena button exists in page source', () => {
    expect(PAGE_SRC).toContain('data-testid="nav-elena"');
  });

  it('nav-elena button is not wrapped in an ELENA_ENABLED && guard', () => {
    const idx = PAGE_SRC.indexOf('data-testid="nav-elena"');
    // Inspect up to 400 chars before the testid — covers any wrapping conditional
    const pre = PAGE_SRC.slice(Math.max(0, idx - 400), idx);
    expect(pre).not.toMatch(/ELENA_ENABLED\s*&&\s*\(/);
  });

  it('Elena workspace render guard does not require ELENA_ENABLED', () => {
    expect(PAGE_SRC).not.toMatch(
      /activeShellTab\s*===\s*["']elena["']\s*&&\s*ELENA_ENABLED/,
    );
  });
});

describe("Elena click path — auth gate bypass", () => {
  it('Elena render branch appears before the !user auth gate in renderContent', () => {
    const renderStart = PAGE_SRC.indexOf("const renderContent = ()");
    const elenaIdx    = PAGE_SRC.indexOf('activeShellTab === "elena"', renderStart);
    const authGateIdx = PAGE_SRC.indexOf('if (!user)', renderStart);
    expect(elenaIdx).toBeGreaterThan(-1);
    expect(authGateIdx).toBeGreaterThan(-1);
    // Elena check must come before the auth gate so unauthenticated users can access it
    expect(elenaIdx).toBeLessThan(authGateIdx);
  });

  it('Elena workspace does not depend on user being signed in', () => {
    const renderStart = PAGE_SRC.indexOf("const renderContent = ()");
    const elenaBlock  = PAGE_SRC.indexOf('activeShellTab === "elena"', renderStart);
    // Grab the 200 chars inside the elena block — should not reference !user guard
    const snippet = PAGE_SRC.slice(elenaBlock, elenaBlock + 200);
    expect(snippet).not.toMatch(/if\s*\(\s*!user\s*\)/);
  });

  it('shell tab preference is persisted to localStorage', () => {
    expect(PAGE_SRC).toContain('avrrio-shell-tab');
  });
});

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
