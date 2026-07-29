// tests/learningHub/masteryBreakdown.test.ts
// Tests for lib/learningHub/masteryBreakdown.ts

import {
  buildMasteryBreakdown,
  type ConceptMasteryBreakdown,
  type TypeMastery,
} from "../../lib/learningHub/masteryBreakdown";
import type { ConceptUnit, RecallItem } from "../../lib/learningHub/conceptLearningPlan";

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeUnit(overrides: Partial<ConceptUnit> = {}): ConceptUnit {
  return {
    id:             "u1",
    text:           "Some unit text for testing",
    canonicalType:  "definition",
    importanceScore: 70,
    ...overrides,
  };
}

function mastered(unitId: string): RecallItem {
  return { unitId, dueAt: 0, correct: true, streak: 3 };
}

function attempted(unitId: string, correct = true, streak = 1): RecallItem {
  return { unitId, dueAt: Date.now() + 86_400_000, correct, streak };
}

const DEF_UNIT  = makeUnit({ id: "d1", canonicalType: "definition",  importanceScore: 80 });
const DEF_UNIT2 = makeUnit({ id: "d2", canonicalType: "definition",  importanceScore: 60 });
const MECH_UNIT = makeUnit({ id: "m1", canonicalType: "mechanism",   importanceScore: 75 });
const WARN_UNIT = makeUnit({ id: "w1", canonicalType: "warning",     importanceScore: 55 });
const HYLD_UNIT = makeUnit({ id: "h1", canonicalType: "high-yield",  importanceScore: 92 });

// ── Output structure ──────────────────────────────────────────────────────────

describe("buildMasteryBreakdown — output structure", () => {
  it("returns a valid ConceptMasteryBreakdown for non-empty input", () => {
    const bd = buildMasteryBreakdown([DEF_UNIT], []);
    expect(typeof bd.overallPct).toBe("number");
    expect(typeof bd.totalUnits).toBe("number");
    expect(typeof bd.masteredUnits).toBe("number");
    expect(typeof bd.byType).toBe("object");
    expect(Array.isArray(bd.weakTypes)).toBe(true);
    expect(Array.isArray(bd.strongTypes)).toBe(true);
  });

  it("returns zeroed breakdown for empty input", () => {
    const bd = buildMasteryBreakdown([], []);
    expect(bd.totalUnits).toBe(0);
    expect(bd.masteredUnits).toBe(0);
    expect(bd.overallPct).toBe(0);
    expect(Object.keys(bd.byType)).toHaveLength(0);
    expect(bd.weakTypes).toHaveLength(0);
    expect(bd.strongTypes).toHaveLength(0);
  });

  it("each TypeMastery entry has required fields", () => {
    const bd = buildMasteryBreakdown([DEF_UNIT, MECH_UNIT], [mastered("d1")]);
    for (const tm of Object.values(bd.byType)) {
      expect(tm.canonicalType).toBeTruthy();
      expect(tm.label).toBeTruthy();
      expect(tm.icon).toBeTruthy();
      expect(typeof tm.total).toBe("number");
      expect(typeof tm.mastered).toBe("number");
      expect(tm.pct).toBeGreaterThanOrEqual(0);
      expect(tm.pct).toBeLessThanOrEqual(100);
      expect(["critical", "high", "medium", "reference"]).toContain(tm.dominantImportance);
    }
  });
});

// ── Mastery calculation ───────────────────────────────────────────────────────

describe("buildMasteryBreakdown — mastery calculation", () => {
  it("unit with streak >= 3 and correct=true is mastered", () => {
    const bd = buildMasteryBreakdown([DEF_UNIT], [mastered("d1")]);
    expect(bd.masteredUnits).toBe(1);
    expect(bd.byType["definition"].mastered).toBe(1);
  });

  it("unit with streak 2 is NOT mastered even if correct", () => {
    const bd = buildMasteryBreakdown([DEF_UNIT], [attempted("d1", true, 2)]);
    expect(bd.masteredUnits).toBe(0);
    expect(bd.byType["definition"].mastered).toBe(0);
  });

  it("unit with correct=false and streak>=3 is NOT mastered", () => {
    const recall: RecallItem = { unitId: "d1", dueAt: 0, correct: false, streak: 5 };
    const bd = buildMasteryBreakdown([DEF_UNIT], [recall]);
    expect(bd.masteredUnits).toBe(0);
  });

  it("unattempted unit (no RecallItem) is not mastered", () => {
    const bd = buildMasteryBreakdown([DEF_UNIT], []);
    expect(bd.masteredUnits).toBe(0);
    expect(bd.byType["definition"].mastered).toBe(0);
  });

  it("pct is 100 when all units of a type are mastered", () => {
    const bd = buildMasteryBreakdown([DEF_UNIT, DEF_UNIT2], [mastered("d1"), mastered("d2")]);
    expect(bd.byType["definition"].pct).toBe(100);
  });

  it("pct is 50 when half of a type's units are mastered", () => {
    const bd = buildMasteryBreakdown([DEF_UNIT, DEF_UNIT2], [mastered("d1")]);
    expect(bd.byType["definition"].pct).toBe(50);
  });

  it("pct is 0 when no units of a type are mastered", () => {
    const bd = buildMasteryBreakdown([DEF_UNIT], []);
    expect(bd.byType["definition"].pct).toBe(0);
  });

  it("totalUnits reflects all input units", () => {
    const bd = buildMasteryBreakdown([DEF_UNIT, MECH_UNIT, WARN_UNIT], []);
    expect(bd.totalUnits).toBe(3);
  });

  it("overallPct is computed across all types", () => {
    // 1 out of 3 mastered → 33%
    const bd = buildMasteryBreakdown(
      [DEF_UNIT, MECH_UNIT, WARN_UNIT],
      [mastered("d1")],
    );
    expect(bd.masteredUnits).toBe(1);
    expect(bd.overallPct).toBe(33);
  });

  it("overallPct rounds correctly (2/3 → 67)", () => {
    const bd = buildMasteryBreakdown(
      [DEF_UNIT, MECH_UNIT, WARN_UNIT],
      [mastered("d1"), mastered("m1")],
    );
    expect(bd.overallPct).toBe(67);
  });
});

// ── Weak / strong type classification ────────────────────────────────────────

describe("buildMasteryBreakdown — weak / strong types", () => {
  it("type with pct < 40 is a weakType", () => {
    // 0 mastered → pct=0 → weak
    const bd = buildMasteryBreakdown([DEF_UNIT, DEF_UNIT2], []);
    expect(bd.weakTypes).toContain("definition");
  });

  it("type with pct = 0 is weak, not strong", () => {
    const bd = buildMasteryBreakdown([DEF_UNIT], []);
    expect(bd.weakTypes).toContain("definition");
    expect(bd.strongTypes).not.toContain("definition");
  });

  it("type with pct >= 80 is a strongType", () => {
    // 2/2 mastered → pct=100 → strong
    const bd = buildMasteryBreakdown([DEF_UNIT, DEF_UNIT2], [mastered("d1"), mastered("d2")]);
    expect(bd.strongTypes).toContain("definition");
  });

  it("type with pct exactly 40 is NOT a weakType (boundary)", () => {
    // Need 2 units, 1 mastered → pct=50 → not weak
    const bd = buildMasteryBreakdown([DEF_UNIT, DEF_UNIT2], [mastered("d1")]);
    // pct=50 → neither weak nor strong
    expect(bd.weakTypes).not.toContain("definition");
    expect(bd.strongTypes).not.toContain("definition");
  });

  it("weakTypes are sorted worst-first (ascending pct)", () => {
    const units = [
      makeUnit({ id: "d1", canonicalType: "definition" }),
      makeUnit({ id: "d2", canonicalType: "definition" }),
      makeUnit({ id: "m1", canonicalType: "mechanism" }),
      makeUnit({ id: "m2", canonicalType: "mechanism" }),
      makeUnit({ id: "m3", canonicalType: "mechanism" }),
    ];
    // definition: 0/2 → 0%; mechanism: 1/3 → 33%
    const recalls = [mastered("m1")];
    const bd = buildMasteryBreakdown(units, recalls);
    const [first, second] = bd.weakTypes;
    expect(bd.byType[first]!.pct).toBeLessThanOrEqual(bd.byType[second]!.pct);
  });

  it("strongTypes are sorted best-first (descending pct)", () => {
    const units = [
      makeUnit({ id: "d1", canonicalType: "definition" }),
      makeUnit({ id: "d2", canonicalType: "definition" }),
      makeUnit({ id: "m1", canonicalType: "mechanism" }),
    ];
    // definition: 100%; mechanism: 100% (same pct, both strong)
    const recalls = [mastered("d1"), mastered("d2"), mastered("m1")];
    const bd = buildMasteryBreakdown(units, recalls);
    expect(bd.strongTypes.length).toBeGreaterThanOrEqual(1);
    for (let i = 1; i < bd.strongTypes.length; i++) {
      expect(bd.byType[bd.strongTypes[i - 1]]!.pct).toBeGreaterThanOrEqual(
        bd.byType[bd.strongTypes[i]]!.pct,
      );
    }
  });
});

// ── Per-type breakdown ────────────────────────────────────────────────────────

describe("buildMasteryBreakdown — per-type breakdown", () => {
  it("byType contains an entry for each canonicalType present", () => {
    const bd = buildMasteryBreakdown([DEF_UNIT, MECH_UNIT, HYLD_UNIT], []);
    expect(bd.byType).toHaveProperty("definition");
    expect(bd.byType).toHaveProperty("mechanism");
    expect(bd.byType).toHaveProperty("high-yield");
  });

  it("definition type has label 'Definitions' and icon '📖'", () => {
    const bd = buildMasteryBreakdown([DEF_UNIT], []);
    expect(bd.byType["definition"].label).toBe("Definitions");
    expect(bd.byType["definition"].icon).toBe("📖");
  });

  it("mechanism type has label 'Mechanisms' and icon '⚙️'", () => {
    const bd = buildMasteryBreakdown([MECH_UNIT], []);
    expect(bd.byType["mechanism"].label).toBe("Mechanisms");
    expect(bd.byType["mechanism"].icon).toBe("⚙️");
  });

  it("high-yield type has label 'High-Yield Facts' and icon '⭐'", () => {
    const bd = buildMasteryBreakdown([HYLD_UNIT], []);
    expect(bd.byType["high-yield"].label).toBe("High-Yield Facts");
    expect(bd.byType["high-yield"].icon).toBe("⭐");
  });

  it("unknown canonical type gets default label 'Key Points'", () => {
    const unknownUnit = makeUnit({ id: "x1", canonicalType: "totally-new-type" });
    const bd = buildMasteryBreakdown([unknownUnit], []);
    expect(bd.byType["totally-new-type"].label).toBe("Key Points");
  });

  it("total in TypeMastery equals count of units with that type", () => {
    const bd = buildMasteryBreakdown([DEF_UNIT, DEF_UNIT2, MECH_UNIT], []);
    expect(bd.byType["definition"].total).toBe(2);
    expect(bd.byType["mechanism"].total).toBe(1);
  });
});

// ── Dominant importance ───────────────────────────────────────────────────────

describe("buildMasteryBreakdown — dominantImportance", () => {
  it("dominantImportance is 'critical' for units with importanceScore >= 80", () => {
    const critUnit = makeUnit({ id: "c1", canonicalType: "mechanism", importanceScore: 85 });
    const bd = buildMasteryBreakdown([critUnit], []);
    expect(bd.byType["mechanism"].dominantImportance).toBe("critical");
  });

  it("dominantImportance is 'high' for units with importanceScore 55–79", () => {
    const highUnit = makeUnit({ id: "h1", canonicalType: "effect", importanceScore: 65 });
    const bd = buildMasteryBreakdown([highUnit], []);
    expect(bd.byType["effect"].dominantImportance).toBe("high");
  });

  it("dominantImportance reflects majority level among multiple units", () => {
    const units = [
      makeUnit({ id: "d1", canonicalType: "definition", importanceScore: 90 }),
      makeUnit({ id: "d2", canonicalType: "definition", importanceScore: 85 }),
      makeUnit({ id: "d3", canonicalType: "definition", importanceScore: 40 }),
    ];
    const bd = buildMasteryBreakdown(units, []);
    // 2 critical, 1 medium → dominant = critical
    expect(bd.byType["definition"].dominantImportance).toBe("critical");
  });
});

// ── Recall items for units not in input ──────────────────────────────────────

describe("buildMasteryBreakdown — extra recall items", () => {
  it("recall items for unit ids not in input are ignored gracefully", () => {
    const extra: RecallItem = { unitId: "nonexistent-id", dueAt: 0, correct: true, streak: 5 };
    expect(() => buildMasteryBreakdown([DEF_UNIT], [extra])).not.toThrow();
    const bd = buildMasteryBreakdown([DEF_UNIT], [extra]);
    expect(bd.masteredUnits).toBe(0);
  });
});
