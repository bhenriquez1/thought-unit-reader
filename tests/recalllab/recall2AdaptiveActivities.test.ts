import fs from "fs";
import path from "path";
import { buildTestLabRemediationQueue, type RecallWeaknessSignal } from "@/lib/recalllab/recall2Srs";
import type { RecallBlueprint } from "@/lib/recalllab/recall2Types";

const read = (relative: string) => fs.readFileSync(path.resolve(__dirname, "../..", relative), "utf8");

function blueprint(id: string, knowledgeNodeId: string): RecallBlueprint {
  return {
    id,
    bookId: "book",
    documentId: "doc",
    pageTruthKey: "doc::1::ready",
    knowledgeNodeId,
    category: "understanding",
    front: "Explain it",
    back: "Grounded answer",
    canonicalHash: id,
    interval: 1,
    easeFactor: 2.5,
    dueDate: "2026-08-26",
    reviewCount: 0,
    consecutiveCorrect: 0,
    confidenceHistory: [],
    createdAt: "2026-08-26",
  };
}

describe("Recall 2 adaptive activity architecture", () => {
  it("supports the approved retrieval formats without adding exam simulation", () => {
    const types = read("lib/recalllab/recall2Types.ts");
    for (const activity of ["flashcard", "active-recall", "explain-back", "fill-blank", "sequencing", "diagram-recall", "misconception-repair", "application", "exam-style"]) {
      expect(types).toContain(`| "${activity}"`);
    }
    expect(types).not.toContain('"full-exam"');
  });

  it("turns saved Professor Whiteboard steps into label-hidden reconstruction", () => {
    const builder = read("lib/recalllab/canonicalRecallSession.ts");
    const session = read("components/recalllab/Recall2Session.tsx");
    expect(builder).toContain('activityType: "diagram-recall"');
    expect(session).toContain("Labels are hidden");
  });

  it("selects only concepts TestLab marked weak for remediation", () => {
    const cards = [blueprint("a", "weak"), blueprint("b", "strong"), blueprint("c", "local-only")];
    const signals = new Map<string, RecallWeaknessSignal>([
      ["weak", { masteryScore: 30, datPerformance: { attempts: 3, correct: 1 }, testLabWeak: true }],
      ["strong", { masteryScore: 80, datPerformance: { attempts: 3, correct: 3 }, testLabWeak: false }],
    ]);
    expect(buildTestLabRemediationQueue(cards, signals).map((card) => card.id)).toEqual(["a"]);
  });

  it("renders a distinct remediation queue rather than duplicating TestLab", () => {
    const home = read("components/recalllab/Recall2Lab.tsx");
    expect(home).toContain('data-testid="testlab-remediation-queue"');
    expect(home).toContain("without recreating the exam");
  });
});
