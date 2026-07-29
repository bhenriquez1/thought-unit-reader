// tests/learningHub/conceptLearningPlan.test.ts
// Tests for lib/learningHub/conceptLearningPlan.ts

import {
  buildTodaysMission,
  type ConceptUnit,
  type RecallItem,
  type TodaysMission,
} from "../../lib/learningHub/conceptLearningPlan";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const NOW = 1_700_000_000_000; // fixed "now" for deterministic tests

function makeUnit(overrides: Partial<ConceptUnit> = {}): ConceptUnit {
  return {
    id: "u1",
    text: "Caries is caused by acid-producing bacteria in dental plaque.",
    title: "Caries Cause",
    canonicalType: "cause",
    importanceScore: 90,
    pageNumber: 5,
    ...overrides,
  };
}

function makeRecall(overrides: Partial<RecallItem> = {}): RecallItem {
  return {
    unitId: "u1",
    dueAt: NOW - 1000, // due 1 second ago
    correct: true,
    streak: 1,
    ...overrides,
  };
}

const CRITICAL_UNIT: ConceptUnit = makeUnit({ id: "crit", importanceScore: 90, canonicalType: "mechanism" });
const HIGH_UNIT: ConceptUnit     = makeUnit({ id: "high", importanceScore: 70, canonicalType: "definition" });
const MEDIUM_UNIT: ConceptUnit   = makeUnit({ id: "med",  importanceScore: 40, canonicalType: "effect" });
const REF_UNIT: ConceptUnit      = makeUnit({ id: "ref",  importanceScore: 10, canonicalType: "evidence" });

// ── Output structure ──────────────────────────────────────────────────────────

describe("buildTodaysMission — output structure", () => {
  it("returns a valid TodaysMission for non-empty input", () => {
    const mission = buildTodaysMission([CRITICAL_UNIT], [], { now: NOW });
    expect(mission.bookTitle).toBeDefined();
    expect(typeof mission.estimatedMinutes).toBe("number");
    expect(["critical", "high", "mixed"]).toContain(mission.focusLevel);
    expect(Array.isArray(mission.concepts)).toBe(true);
    expect(Array.isArray(mission.missedRecently)).toBe(true);
    expect(Array.isArray(mission.recommendedSequence)).toBe(true);
  });

  it("returns empty arrays for empty unit input", () => {
    const mission = buildTodaysMission([], [], { now: NOW });
    expect(mission.concepts).toHaveLength(0);
    expect(mission.recommendedSequence).toHaveLength(0);
    expect(mission.estimatedMinutes).toBe(0);
  });

  it("uses bookTitle from opts", () => {
    const mission = buildTodaysMission([CRITICAL_UNIT], [], { now: NOW, bookTitle: "DAT Biology" });
    expect(mission.bookTitle).toBe("DAT Biology");
  });

  it("defaults bookTitle to 'Study Material'", () => {
    const mission = buildTodaysMission([CRITICAL_UNIT], [], { now: NOW });
    expect(mission.bookTitle).toBe("Study Material");
  });

  it("each concept has required fields", () => {
    const mission = buildTodaysMission([CRITICAL_UNIT, HIGH_UNIT], [], { now: NOW });
    for (const concept of mission.concepts) {
      expect(concept.id).toBeTruthy();
      expect(concept.label).toBeTruthy();
      expect(concept.canonicalType).toBeTruthy();
      expect(["critical", "high", "medium", "reference"]).toContain(concept.importanceLevel);
      expect(typeof concept.completed).toBe("boolean");
      expect(typeof concept.dueForRecall).toBe("boolean");
      expect(typeof concept.weakArea).toBe("boolean");
      expect(concept.estimatedMinutes).toBeGreaterThan(0);
    }
  });

  it("each recommended action matches a concept", () => {
    const mission = buildTodaysMission([CRITICAL_UNIT, HIGH_UNIT], [], { now: NOW });
    const conceptIds = new Set(mission.concepts.map((c) => c.id));
    for (const action of mission.recommendedSequence) {
      expect(conceptIds.has(action.unitId)).toBe(true);
    }
  });
});

// ── Sort ordering ─────────────────────────────────────────────────────────────

describe("buildTodaysMission — sort order", () => {
  it("weak area unit appears before higher-importance non-weak unit", () => {
    const weakUnit = makeUnit({ id: "weak", importanceScore: 10, canonicalType: "evidence" });
    const strongUnit = makeUnit({ id: "strong", importanceScore: 95, canonicalType: "mechanism" });
    const recall: RecallItem = { unitId: "weak", dueAt: 0, correct: false, streak: 0 };
    const mission = buildTodaysMission([strongUnit, weakUnit], [recall], { now: NOW });
    const weakIdx   = mission.concepts.findIndex((c) => c.id === "weak");
    const strongIdx = mission.concepts.findIndex((c) => c.id === "strong");
    expect(weakIdx).toBeLessThan(strongIdx);
  });

  it("due-for-recall unit appears before non-due unit of same importance", () => {
    const dueUnit   = makeUnit({ id: "due",   importanceScore: 70 });
    const notDue    = makeUnit({ id: "notdue", importanceScore: 70 });
    const recall: RecallItem = { unitId: "due", dueAt: NOW - 5000, correct: true, streak: 1 };
    const mission = buildTodaysMission([notDue, dueUnit], [recall], { now: NOW });
    const dueIdx   = mission.concepts.findIndex((c) => c.id === "due");
    const notDueIdx = mission.concepts.findIndex((c) => c.id === "notdue");
    expect(dueIdx).toBeLessThan(notDueIdx);
  });

  it("critical unit appears before high unit when neither is weak or due", () => {
    const mission = buildTodaysMission([HIGH_UNIT, CRITICAL_UNIT], [], { now: NOW });
    const critIdx = mission.concepts.findIndex((c) => c.id === "crit");
    const highIdx = mission.concepts.findIndex((c) => c.id === "high");
    expect(critIdx).toBeLessThan(highIdx);
  });

  it("completed units appear at the end", () => {
    const mastered: RecallItem = { unitId: "crit", dueAt: 0, correct: true, streak: 5 };
    const mission = buildTodaysMission([CRITICAL_UNIT, HIGH_UNIT], [mastered], { now: NOW });
    const masteredIdx  = mission.concepts.findIndex((c) => c.id === "crit");
    const unmasteredIdx = mission.concepts.findIndex((c) => c.id === "high");
    expect(unmasteredIdx).toBeLessThan(masteredIdx);
  });
});

// ── Focus level ────────────────────────────────────────────────────────────────

describe("buildTodaysMission — focusLevel", () => {
  it("'critical' when ≥50% of goals are critical", () => {
    const mission = buildTodaysMission([CRITICAL_UNIT, CRITICAL_UNIT, HIGH_UNIT], [], { now: NOW });
    expect(mission.focusLevel).toBe("critical");
  });

  it("'high' when critical + high ≥50% but critical alone < 50%", () => {
    const mission = buildTodaysMission([HIGH_UNIT, HIGH_UNIT, MEDIUM_UNIT], [], { now: NOW });
    expect(mission.focusLevel).toBe("high");
  });

  it("'mixed' when no single tier dominates", () => {
    const mission = buildTodaysMission([MEDIUM_UNIT, REF_UNIT], [], { now: NOW });
    expect(mission.focusLevel).toBe("mixed");
  });

  it("'mixed' for empty concept list", () => {
    const mission = buildTodaysMission([], [], { now: NOW });
    expect(mission.focusLevel).toBe("mixed");
  });
});

// ── Learner action types ──────────────────────────────────────────────────────

describe("buildTodaysMission — action types", () => {
  it("weak area → 'review' action", () => {
    const unit: ConceptUnit = makeUnit({ id: "w1" });
    const recall: RecallItem = { unitId: "w1", dueAt: 0, correct: false, streak: 0 };
    const mission = buildTodaysMission([unit], [recall], { now: NOW });
    expect(mission.recommendedSequence[0].type).toBe("review");
  });

  it("due for recall (non-weak) → 'recall' action", () => {
    const unit: ConceptUnit = makeUnit({ id: "d1" });
    const recall: RecallItem = { unitId: "d1", dueAt: NOW - 1000, correct: true, streak: 1 };
    const mission = buildTodaysMission([unit], [recall], { now: NOW });
    expect(mission.recommendedSequence[0].type).toBe("recall");
  });

  it("new unit (never recalled) → 'read' action", () => {
    const mission = buildTodaysMission([CRITICAL_UNIT], [], { now: NOW });
    expect(mission.recommendedSequence[0].type).toBe("read");
  });

  it("mastered unit → 'practice' action", () => {
    const recall: RecallItem = { unitId: "crit", dueAt: 0, correct: true, streak: 5 };
    const mission = buildTodaysMission([CRITICAL_UNIT], [recall], { now: NOW });
    expect(mission.recommendedSequence[0].type).toBe("practice");
  });

  it("action label contains the unit's label", () => {
    const unit: ConceptUnit = makeUnit({ id: "x1", title: "Fluoride Mechanism" });
    const mission = buildTodaysMission([unit], [], { now: NOW });
    expect(mission.recommendedSequence[0].label).toContain("Fluoride Mechanism");
  });
});

// ── Time estimation ───────────────────────────────────────────────────────────

describe("buildTodaysMission — time estimation", () => {
  it("read action costs 2 minutes", () => {
    const mission = buildTodaysMission([CRITICAL_UNIT], [], { now: NOW });
    expect(mission.concepts[0].estimatedMinutes).toBe(2);
    expect(mission.estimatedMinutes).toBe(2);
  });

  it("recall action costs 1 minute", () => {
    const recall: RecallItem = { unitId: "crit", dueAt: NOW - 1000, correct: true, streak: 1 };
    const mission = buildTodaysMission([CRITICAL_UNIT], [recall], { now: NOW });
    expect(mission.concepts[0].estimatedMinutes).toBe(1);
  });

  it("total estimatedMinutes is sum of all concept times", () => {
    const u1 = makeUnit({ id: "a1" });
    const u2 = makeUnit({ id: "a2" });
    const r2: RecallItem = { unitId: "a2", dueAt: NOW - 1000, correct: true, streak: 1 };
    const mission = buildTodaysMission([u1, u2], [r2], { now: NOW });
    // u1=2min read, u2=1min recall
    expect(mission.estimatedMinutes).toBe(3);
  });
});

// ── maxGoals cap ──────────────────────────────────────────────────────────────

describe("buildTodaysMission — maxGoals", () => {
  it("caps concepts at maxGoals", () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      makeUnit({ id: `u${i}`, importanceScore: 50 }),
    );
    const mission = buildTodaysMission(many, [], { now: NOW, maxGoals: 7 });
    expect(mission.concepts).toHaveLength(7);
    expect(mission.recommendedSequence).toHaveLength(7);
  });

  it("defaults to max 10 goals", () => {
    const many = Array.from({ length: 15 }, (_, i) =>
      makeUnit({ id: `u${i}`, importanceScore: 50 }),
    );
    const mission = buildTodaysMission(many, [], { now: NOW });
    expect(mission.concepts.length).toBeLessThanOrEqual(10);
  });
});

// ── missedRecently ────────────────────────────────────────────────────────────

describe("buildTodaysMission — missedRecently", () => {
  it("includes unit ids answered incorrectly", () => {
    const recall: RecallItem = { unitId: "crit", dueAt: NOW - 1000, correct: false, streak: 0 };
    const mission = buildTodaysMission([CRITICAL_UNIT], [recall], { now: NOW });
    expect(mission.missedRecently).toContain("crit");
  });

  it("does not include units answered correctly", () => {
    const recall: RecallItem = { unitId: "crit", dueAt: NOW - 1000, correct: true, streak: 2 };
    const mission = buildTodaysMission([CRITICAL_UNIT], [recall], { now: NOW });
    expect(mission.missedRecently).not.toContain("crit");
  });

  it("includes units answered incorrectly even when dueAt=0", () => {
    const recall: RecallItem = { unitId: "crit", dueAt: 0, correct: false, streak: 0 };
    const mission = buildTodaysMission([CRITICAL_UNIT], [recall], { now: NOW });
    expect(mission.missedRecently).toContain("crit");
  });
});

// ── Completed detection ───────────────────────────────────────────────────────

describe("buildTodaysMission — completed detection", () => {
  it("marks unit as completed when streak >= 3 and correct", () => {
    const recall: RecallItem = { unitId: "crit", dueAt: 0, correct: true, streak: 3 };
    const mission = buildTodaysMission([CRITICAL_UNIT], [recall], { now: NOW });
    expect(mission.concepts[0].completed).toBe(true);
  });

  it("does not mark as completed when streak < 3", () => {
    const recall: RecallItem = { unitId: "crit", dueAt: 0, correct: true, streak: 2 };
    const mission = buildTodaysMission([CRITICAL_UNIT], [recall], { now: NOW });
    expect(mission.concepts[0].completed).toBe(false);
  });

  it("does not mark as completed when correct=false even with streak >= 3", () => {
    const recall: RecallItem = { unitId: "crit", dueAt: 0, correct: false, streak: 4 };
    const mission = buildTodaysMission([CRITICAL_UNIT], [recall], { now: NOW });
    expect(mission.concepts[0].completed).toBe(false);
  });

  it("unattempted unit is not completed", () => {
    const mission = buildTodaysMission([CRITICAL_UNIT], [], { now: NOW });
    expect(mission.concepts[0].completed).toBe(false);
  });
});

// ── Page number propagation ───────────────────────────────────────────────────

describe("buildTodaysMission — pageNumber propagation", () => {
  it("concept carries pageNumber from the unit", () => {
    const unit = makeUnit({ id: "pg1", pageNumber: 42 });
    const mission = buildTodaysMission([unit], [], { now: NOW });
    expect(mission.concepts[0].pageNumber).toBe(42);
  });

  it("action carries pageNumber from the unit", () => {
    const unit = makeUnit({ id: "pg2", pageNumber: 99 });
    const mission = buildTodaysMission([unit], [], { now: NOW });
    expect(mission.recommendedSequence[0].pageNumber).toBe(99);
  });

  it("concept without pageNumber has pageNumber undefined", () => {
    const unit: ConceptUnit = { id: "nopg", text: "No page unit", canonicalType: "definition", importanceScore: 80 };
    const mission = buildTodaysMission([unit], [], { now: NOW });
    expect(mission.concepts[0].pageNumber).toBeUndefined();
  });
});
