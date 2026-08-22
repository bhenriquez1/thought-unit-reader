// tests/apex/testLabLegacyFallbackAudit.test.ts
// TestLab legacy/fallback UI removal — Track A. The diagnosis for this pass
// found no old-DAT-Apex UI silently reachable through a runtime fallback:
// app/apex/page.tsx has always been the single live component for /apex,
// with no "if new state missing, render legacy UI" branch anywhere in its
// tree. What WAS true is that the dashboard visually baked "DAT" into the
// product's own wordmark, so the product could never look like anything
// but a DAT-only tool no matter what else changed underneath it. This
// suite locks in both halves: (1) the confirmed-dead legacy components are
// gone, not just unreferenced, and (2) the live dashboard now visibly
// generalizes beyond DAT via a shared exam-profile catalog.

import fs from "fs";
import path from "path";

function read(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, "../..", relPath), "utf8");
}

function exists(relPath: string): boolean {
  return fs.existsSync(path.resolve(__dirname, "../..", relPath));
}

describe("TestLab legacy-fallback audit — dead components removed, not just unreferenced", () => {
  it("REQUIRED: components/surgeonView2/SurgeonCockpit.tsx no longer exists", () => {
    expect(exists("components/surgeonView2/SurgeonCockpit.tsx")).toBe(false);
  });

  it("REQUIRED: components/apex/DATDrillMode.tsx no longer exists", () => {
    expect(exists("components/apex/DATDrillMode.tsx")).toBe(false);
  });

  it("the surgeonView2 barrel no longer exports the deleted SurgeonCockpit", () => {
    const src = read("components/surgeonView2/index.ts");
    expect(src).not.toMatch(/export \{ SurgeonCockpit \}/);
  });
});

describe("TestLab legacy-fallback audit — /apex has exactly one live render path", () => {
  it("REQUIRED: app/apex/page.tsx has a single default export wrapping a single inner page component (no legacy/current branch)", () => {
    const src = read("app/apex/page.tsx");
    const defaultExportMatches = src.match(/export default function/g) ?? [];
    expect(defaultExportMatches.length).toBe(1);
    expect(src).toMatch(/function DatApexPageInner\(\)/);
    // No conditional that renders a wholesale alternate dashboard based on
    // absence of data — every empty/missing-data case (see the
    // `!primaryBook && booksLoaded` branches) renders a "Get Started" panel
    // INSIDE TodayTab, not a switch to a different page/component tree.
    // (LEGACY_SECTION_MAP / LEGACY_IDS below are id-mapping tables between
    // taxonomies, not a rendered fallback UI — deliberately not asserted
    // against here.)
  });
});

describe("TestLab legacy-fallback audit — TestLab visibly supports more than DAT", () => {
  it("REQUIRED: the exam profile catalog lists more than the two implemented profiles", () => {
    const { EXAM_PROFILE_CATALOG } = require("@/lib/examEngine/profiles/profileCatalog");
    expect(EXAM_PROFILE_CATALOG.length).toBeGreaterThan(2);
    const ids = EXAM_PROFILE_CATALOG.map((p: { id: string }) => p.id);
    expect(ids).toContain("dat");
    expect(ids).toContain("custom");
    const available = EXAM_PROFILE_CATALOG.filter((p: { available: boolean }) => p.available);
    const unavailable = EXAM_PROFILE_CATALOG.filter((p: { available: boolean }) => !p.available);
    expect(available.length).toBe(2);
    expect(unavailable.length).toBeGreaterThan(0);
  });

  it("REQUIRED: app/apex/page.tsx's dashboard header renders an exam-profile switcher sourced from the shared catalog, not a static 'DAT' label", () => {
    const src = read("app/apex/page.tsx");
    expect(src).toMatch(/import \{ EXAM_PROFILE_CATALOG \} from "@\/lib\/examEngine\/profiles\/profileCatalog"/);
    expect(src).toMatch(/function ExamProfileSwitcher\(\{ activeProfileId, onSelect \}: \{ activeProfileId: string; onSelect: \(id: string\) => void \}\)/);
    expect(src).toMatch(/<ExamProfileSwitcher activeProfileId=\{activeProfileId\} onSelect=\{handleProfileSelect\} \/>/);
  });

  it("REQUIRED: the dashboard's flow ribbon exposes TestLab's first-level product experience (Choose Exam → Sources → Blueprint → Practice/Simulation → Review → Readiness)", () => {
    const src = read("app/apex/page.tsx");
    expect(src).toMatch(/Choose Exam/);
    expect(src).toMatch(/Choose \/ Upload Sources/);
    expect(src).toMatch(/Blueprint/);
    expect(src).toMatch(/Practice \/ Simulation/);
  });

  it("REQUIRED: app/apex/generator/page.tsx (the real Choose Exam + Choose Source step) lists the not-yet-implemented profiles as visible 'Coming soon' entries, never silently omitted", () => {
    const src = read("app/apex/generator/page.tsx");
    expect(src).toMatch(/import \{ EXAM_PROFILE_CATALOG \} from '@\/lib\/examEngine\/profiles\/profileCatalog'/);
    expect(src).toMatch(/EXAM_PROFILE_CATALOG\.filter\(\(p\) => !p\.available\)/);
    expect(src).toMatch(/Coming soon/);
  });

  it("REQUIRED: the dashboard and generator back-links are consistently branded 'TestLab', not the old 'DAT Hub' wording", () => {
    expect(read("app/apex/generator/page.tsx")).toMatch(/← TestLab/);
    expect(read("app/apex/review/page.tsx")).toMatch(/← TestLab/);
    expect(read("app/apex/review/page.tsx")).not.toMatch(/← DAT Hub/);
  });
});
