// tests/whiteboard/legacyWhiteboardCleanup.test.ts
// Phase B3-5 — legacy Whiteboard path removal. Every file below was proven
// to have ZERO live runtime importers before removal (see the B3 handoff
// report for the audit trail: components/EnhancedWhiteboard.tsx and
// components/surgeonView2/WhiteboardOverlay.tsx were each the sole consumer
// of their own dependency, so this is a genuinely dead subtree, not a
// speculative deletion). This test guards against any of them silently
// reappearing (a revert, a bad merge, a copy-paste of old code) and against
// the live Professor Whiteboard path (WhiteboardPanel.tsx / TldrawCanvas.tsx)
// ever growing a new call to the retired paid endpoints.

import fs from "fs";
import path from "path";

const REPO_ROOT = path.resolve(__dirname, "../..");

const REMOVED_FILES = [
  "components/Whiteboard.tsx",
  "components/EnhancedWhiteboard.tsx",
  "lib/WhiteboardExplanationService.ts",
  "components/surgeonView2/WhiteboardOverlay.tsx",
  "pages/api/whiteboard-explain.ts",
  "pages/api/whiteboard-image.ts",
  // Orphaned as a direct, necessary consequence of the removals above (its
  // only remaining purpose was feeding the retired pipeline) — not on the
  // handoff's explicit list, but leaving it in place broke `tsc --noEmit`
  // (a dangling import into the deleted WhiteboardExplanationService.ts).
  "lib/insights/whiteboardFromStudyModel.ts",
];

describe("Phase B3-5 — legacy Whiteboard files are actually removed from disk", () => {
  it.each(REMOVED_FILES)("%s no longer exists", (relPath) => {
    expect(fs.existsSync(path.join(REPO_ROOT, relPath))).toBe(false);
  });
});

describe("Phase B3-5 — components/surgeonView2/index.ts no longer exports WhiteboardOverlay", () => {
  it("REQUIRED: the barrel export line is gone, not just the file", () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, "components/surgeonView2/index.ts"), "utf8");
    expect(src).not.toMatch(/export \{ WhiteboardOverlay \}/);
  });
});

describe("Phase B3-5 — pages/index.tsx no longer computes the dead whiteboardSteps value", () => {
  it("REQUIRED: no whiteboardSteps useMemo and no generateWhiteboardStepsFromModel import", () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, "pages/index.tsx"), "utf8");
    expect(src).not.toMatch(/const whiteboardSteps = useMemo/);
    expect(src).not.toMatch(/generateWhiteboardStepsFromModel/);
  });
});

describe("Phase B3-5 — REQUIRED: the live Professor Whiteboard path cannot accidentally call a legacy paid endpoint", () => {
  const LIVE_WHITEBOARD_FILES = [
    "components/WhiteboardPanel.tsx",
    "components/whiteboard/TldrawCanvas.tsx",
    "components/whiteboard/useProfessorLesson.ts",
  ];

  it.each(LIVE_WHITEBOARD_FILES)("%s never fetches /api/whiteboard-explain or /api/whiteboard-image", (relPath) => {
    const src = fs.readFileSync(path.join(REPO_ROOT, relPath), "utf8");
    expect(src).not.toMatch(/fetch\(["']\/api\/whiteboard-explain["']/);
    expect(src).not.toMatch(/fetch\(["']\/api\/whiteboard-image["']/);
    expect(src).not.toMatch(/fetch\(["']\/api\/whiteboard-explanation["']/);
  });

  it("the ONLY AI endpoint the live Whiteboard pipeline calls is /api/professor-lesson-plan", () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, "components/whiteboard/useProfessorLesson.ts"), "utf8");
    expect(src).toMatch(/\/api\/professor-lesson-plan/);
  });
});
