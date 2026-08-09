// tests/reader/whiteboardPanelLearningStateWiring.test.ts
// Phase B3-2 — proves WhiteboardPanel.tsx actually calls recordLearningEvent
// from the TldrawCanvas Learning-State hooks (onTeachingStepStarted/
// onTeachingStepCompleted/onLessonCompleted), closing the "groundwork exists
// but nothing calls it" gap the B3 handoff explicitly flagged.
//
// WhiteboardPanel.tsx is a client component (framer-motion, next/dynamic) —
// this repo's jest config runs testEnvironment:"node" with no React Testing
// Library / jsdom anywhere in the suite (see jest.config.js), so — matching
// every other WhiteboardPanel/TldrawCanvas regression test in this session
// (tests/whiteboard/productionSmoke.test.ts, tests/whiteboard/
// whiteboardCanonicalEntriesWiring.test.ts, tests/whiteboard/
// tldrawCanvasVisualUpgrades.test.ts) — this is static-analysis coverage of
// the actual wiring, not a rendered-component test. The EVENT SEMANTICS
// (score/evidence effects of each event kind) are separately covered with
// real behavioral tests in tests/knowledge/learningStateEvents.test.ts.

import fs from "fs";
import path from "path";

const PANEL_FILE = path.resolve(__dirname, "../../components/WhiteboardPanel.tsx");

describe("WhiteboardPanel.tsx — Phase B3-2: Learning State event wiring", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(PANEL_FILE, "utf8"); });

  it("imports recordLearningEvent and the B3-3 snapshot store", () => {
    expect(src).toMatch(/import \{ recordLearningEvent \} from "@\/lib\/knowledge\/recordLearningEvent"/);
    expect(src).toMatch(/buildWhiteboardLessonSnapshot, saveWhiteboardLessonSnapshot,/);
  });

  it("REQUIRED: the TldrawCanvas element is wired to all three Learning-State hooks", () => {
    const idx = src.indexOf("<TldrawCanvas");
    const block = src.slice(idx, src.indexOf("/>", idx));
    expect(block).toMatch(/onTeachingStepStarted=\{handleTeachingStepStarted\}/);
    expect(block).toMatch(/onTeachingStepCompleted=\{handleTeachingStepCompleted\}/);
    expect(block).toMatch(/onLessonCompleted=\{handleLessonCompleted\}/);
  });

  describe("REQUIRED: professor lesson start writes Learning State", () => {
    it("handleTeachingStepStarted only fires on the FIRST step (stepId 0) — a lesson doesn't 'start' again on step 3", () => {
      const idx = src.indexOf("const handleTeachingStepStarted = (stepId: number) => {");
      expect(idx).toBeGreaterThan(-1);
      const block = src.slice(idx, idx + 500);
      expect(block).toMatch(/if \(stepId !== 0 \|\| !knowledgeNodeId \|\| !lessonId\) return;/);
      expect(block).toMatch(/kind: "professor-lesson-started"/);
      expect(block).toMatch(/recordLearningEvent\(knowledgeNodeId, effectiveLearningDocumentId, \{/);
    });

    it("is idempotent per lessonId within one mount (Restart doesn't re-fire lesson-started)", () => {
      const idx = src.indexOf("const handleTeachingStepStarted = (stepId: number) => {");
      const block = src.slice(idx, idx + 500);
      expect(block).toMatch(/if \(lessonStartFiredForRef\.current === lessonId\) return;/);
      expect(block).toMatch(/lessonStartFiredForRef\.current = lessonId;/);
    });
  });

  describe("REQUIRED: step completion writes concept-qualified evidence", () => {
    it("handleTeachingStepCompleted calls recordLearningEvent keyed on knowledgeNodeId (the concept), with kind teaching-step-completed and the real stepId", () => {
      const idx = src.indexOf("const handleTeachingStepCompleted = (stepId: number, info?: { misconceptionLabel?: string }) => {");
      expect(idx).toBeGreaterThan(-1);
      const block = src.slice(idx, idx + 900);
      expect(block).toMatch(/if \(!knowledgeNodeId\) return;/);
      expect(block).toMatch(/recordLearningEvent\(knowledgeNodeId, effectiveLearningDocumentId, \{\s*\n\s*kind: "teaching-step-completed",\s*\n\s*stepId,/);
    });

    it("REQUIRED: misconception events are produced from crossOut — fires misconception-observed only when info.misconceptionLabel is present", () => {
      const idx = src.indexOf("const handleTeachingStepCompleted = (stepId: number, info?: { misconceptionLabel?: string }) => {");
      const block = src.slice(idx, idx + 900);
      expect(block).toMatch(/if \(info\?\.misconceptionLabel\) \{/);
      expect(block).toMatch(/kind: "misconception-observed",/);
      expect(block).toMatch(/misconception: info\.misconceptionLabel,/);
    });
  });

  describe("REQUIRED: lesson completion persists correctly", () => {
    it("handleLessonCompleted records whiteboard-lesson-completed keyed on the canonical lessonId (not the raw snapshotId TldrawCanvas reports)", () => {
      const idx = src.indexOf("const handleLessonCompleted = (_canvasReportedSnapshotId: string, plan: ProfessorLessonPlan) => {");
      expect(idx).toBeGreaterThan(-1);
      const block = src.slice(idx, idx + 1400);
      expect(block).toMatch(/kind: "whiteboard-lesson-completed",/);
      expect(block).toMatch(/snapshotId: lessonId,/);
    });

    it("also builds and saves the B3-3 semantic snapshot via buildWhiteboardLessonSnapshot + saveWhiteboardLessonSnapshot", () => {
      const idx = src.indexOf("const handleLessonCompleted = (_canvasReportedSnapshotId: string, plan: ProfessorLessonPlan) => {");
      const block = src.slice(idx, idx + 1400);
      expect(block).toMatch(/const snapshot = buildWhiteboardLessonSnapshot\(\{/);
      expect(block).toMatch(/saveWhiteboardLessonSnapshot\(snapshot, \(\) => liveIdentityRef\.current\)/);
    });

    it("REQUIRED: the save's identity getter reads a live ref (re-evaluated at write time), not a value captured when the lesson finished", () => {
      expect(src).toMatch(/const liveIdentityRef = useRef\(\{ documentId: effectiveLearningDocumentId, pageTruthKey: effectivePageTruthKey \?\? "" \}\);/);
      expect(src).toMatch(/liveIdentityRef\.current = \{ documentId: effectiveLearningDocumentId, pageTruthKey: effectivePageTruthKey \?\? "" \};/);
    });
  });

  it("REQUIRED: lessonId is derived from the RESOLVED documentId (resolvedDocumentId ?? bookId), the same identity discipline used elsewhere in this app — never bookId alone when a resolved identity is available", () => {
    expect(src).toMatch(/const effectiveLearningDocumentId = resolvedDocumentId \?\? bookId \?\? "unknown-document";/);
    const idx = src.indexOf("const lessonId = useMemo(");
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/documentId: effectiveLearningDocumentId,/);
  });
});
