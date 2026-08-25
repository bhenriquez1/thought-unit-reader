// tests/recalllab/recall2WeakAreaLearningState.test.ts
// C3 (Phase 0 audit) — Recall's Weak-Area Drill used to read only its own
// local SM-2 state (easeFactor/confidenceHistory), never the shared
// Learning State Engine a card's knowledgeNodeId already links to. A
// concept a student keeps missing on TestLab exams never surfaced in
// Recall's "Weak Concepts" phase unless it ALSO happened to look weak by
// Recall's own review history — "Test Lab errors" was silently absent
// from the signal list. This locks in that isWeak/computeRecall2Stats/
// buildSessionQueue now also treat a card as weak when its linked
// KnowledgeNodeProgress shows low shared mastery or a recent TestLab miss
// streak, while a card with no knowledgeNodeId (or no signal fetched for
// it) falls back to exactly the prior local-only behavior.
//
// Real behavioral tests against the actual exported functions — no
// IO/React dependency in lib/recalllab/recall2Srs.ts itself.

import { computeRecall2Stats, buildSessionQueue, type RecallWeaknessSignal } from "@/lib/recalllab/recall2Srs";
import type { RecallBlueprint } from "@/lib/recalllab/recall2Types";

function makeBlueprint(overrides: Partial<RecallBlueprint> = {}): RecallBlueprint {
  return {
    id: "bp-1",
    bookId: "book-1",
    category: "understanding",
    front: "front",
    back: "back",
    canonicalHash: "hash-1",
    interval: 10,
    easeFactor: 2.3, // "not weak" by local SM-2 signal
    dueDate: "2099-01-01", // far future — never due, isolates the weak/mastered checks
    reviewCount: 5,
    consecutiveCorrect: 5,
    confidenceHistory: ["easy", "easy", "easy"],
    ...overrides,
  };
}

describe("Weak-Area Drill — shared Learning State signal", () => {
  it("REQUIRED: a card with strong local SM-2 state but low shared masteryScore is still classified weak", () => {
    const bp = makeBlueprint({ id: "bp-weak-node", knowledgeNodeId: "kn-1" });
    const signals = new Map<string, RecallWeaknessSignal>([
      ["kn-1", { masteryScore: 20, datPerformance: null }],
    ]);

    const stats = computeRecall2Stats([bp], signals);
    expect(stats.weak).toBe(1);
    expect(stats.due).toBe(0);

    const queue = buildSessionQueue([bp], ["weak"], signals);
    expect(queue.map((b) => b.id)).toEqual(["bp-weak-node"]);
  });

  it("REQUIRED: a card whose linked node has a real recent TestLab miss streak (attempts>=2, >=50% wrong) is classified weak", () => {
    const bp = makeBlueprint({ id: "bp-dat-misses", knowledgeNodeId: "kn-2" });
    const signals = new Map<string, RecallWeaknessSignal>([
      ["kn-2", { masteryScore: 80, datPerformance: { attempts: 4, correct: 1 } }],
    ]);

    expect(buildSessionQueue([bp], ["weak"], signals).map((b) => b.id)).toEqual(["bp-dat-misses"]);
  });

  it("a single wrong TestLab attempt (attempts=1) is not enough signal to call it weak on its own", () => {
    const bp = makeBlueprint({ id: "bp-one-miss", knowledgeNodeId: "kn-3" });
    const signals = new Map<string, RecallWeaknessSignal>([
      ["kn-3", { masteryScore: 80, datPerformance: { attempts: 1, correct: 0 } }],
    ]);

    expect(buildSessionQueue([bp], ["weak"], signals)).toEqual([]);
  });

  it("REQUIRED: a card with a good shared signal and good local state is not weak, even when nodeSignals is supplied", () => {
    const bp = makeBlueprint({ id: "bp-healthy", knowledgeNodeId: "kn-4" });
    const signals = new Map<string, RecallWeaknessSignal>([
      ["kn-4", { masteryScore: 90, datPerformance: { attempts: 10, correct: 10 } }],
    ]);

    expect(buildSessionQueue([bp], ["weak"], signals)).toEqual([]);
  });

  it("REQUIRED: omitting nodeSignals entirely falls back to exactly the prior local-only behavior (no regression for existing callers)", () => {
    const weakByLocal = makeBlueprint({ id: "bp-locally-weak", easeFactor: 1.5 });
    const notWeak = makeBlueprint({ id: "bp-not-weak" });

    expect(buildSessionQueue([weakByLocal, notWeak], ["weak"]).map((b) => b.id)).toEqual(["bp-locally-weak"]);
    expect(computeRecall2Stats([weakByLocal, notWeak]).weak).toBe(1);
  });

  it("a card with no knowledgeNodeId is unaffected by nodeSignals, however weak-looking the map is", () => {
    const bp = makeBlueprint({ id: "bp-no-node", knowledgeNodeId: undefined });
    const signals = new Map<string, RecallWeaknessSignal>([
      ["some-other-node", { masteryScore: 0, datPerformance: { attempts: 10, correct: 0 } }],
    ]);

    expect(buildSessionQueue([bp], ["weak"], signals)).toEqual([]);
  });

  it("a knowledgeNodeId with no entry in nodeSignals (lookup failed/missing) is treated as no signal, not as weak", () => {
    const bp = makeBlueprint({ id: "bp-missing-signal", knowledgeNodeId: "kn-not-fetched" });
    const signals = new Map<string, RecallWeaknessSignal>();

    expect(buildSessionQueue([bp], ["weak"], signals)).toEqual([]);
  });

  it("a card already weak by local SM-2 state stays weak regardless of what the shared signal says", () => {
    const bp = makeBlueprint({ id: "bp-both-weak", easeFactor: 1.5, knowledgeNodeId: "kn-5" });
    const signals = new Map<string, RecallWeaknessSignal>([
      ["kn-5", { masteryScore: 95, datPerformance: { attempts: 10, correct: 10 } }],
    ]);

    expect(buildSessionQueue([bp], ["weak"], signals).map((b) => b.id)).toEqual(["bp-both-weak"]);
  });
});
