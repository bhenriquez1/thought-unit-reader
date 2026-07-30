// tests/adaptiveGuide/adaptiveGuideEngine.test.ts

import {
  buildAdaptiveGuide,
  type AdaptableUnit,
} from "../../lib/adaptiveGuide/adaptiveGuideEngine";
import { buildStudentProfile } from "../../lib/adaptiveGuide/studentProfile";

const BOOK = "book-1";
const NOW = Date.now();
const DAY = 24 * 60 * 60 * 1000;

function unit(id: string, canonicalType: string, importanceScore = 60): AdaptableUnit {
  return { id, text: `Content for ${id}`, title: `Title ${id}`, canonicalType, importanceScore };
}

const UNITS: AdaptableUnit[] = [
  unit("u-def",   "definition",   90),
  unit("u-mech",  "mechanism",    80),
  unit("u-trap",  "trap",         75),
  unit("u-pearl", "clinical",     65),
  unit("u-fact",  "dat_fact",     60),
];

const emptyProfile = buildStudentProfile(BOOK, [], []);

describe("buildAdaptiveGuide — first-read", () => {
  it("sets learnerState to first-read for unvisited page", () => {
    const guide = buildAdaptiveGuide(UNITS, emptyProfile, 1);
    expect(guide.learnerState).toBe("first-read");
  });

  it("mission headline is 'First Read'", () => {
    const guide = buildAdaptiveGuide(UNITS, emptyProfile, 1);
    expect(guide.mission.headline).toBe("First Read");
  });

  it("estimates positive minutes", () => {
    const guide = buildAdaptiveGuide(UNITS, emptyProfile, 1);
    expect(guide.mission.estimatedMinutes).toBeGreaterThan(0);
  });

  it("includes success criteria", () => {
    const guide = buildAdaptiveGuide(UNITS, emptyProfile, 1);
    expect(guide.mission.successCriteria.length).toBeGreaterThanOrEqual(1);
  });

  it("sections include core concepts section", () => {
    const guide = buildAdaptiveGuide(UNITS, emptyProfile, 1);
    expect(guide.sections.some(s => s.id === "core")).toBe(true);
  });

  it("sections include mechanism section", () => {
    const guide = buildAdaptiveGuide(UNITS, emptyProfile, 1);
    expect(guide.sections.some(s => s.id === "mechanism")).toBe(true);
  });

  it("sections include trap section", () => {
    const guide = buildAdaptiveGuide(UNITS, emptyProfile, 1);
    expect(guide.sections.some(s => s.id === "traps")).toBe(true);
  });

  it("does not include weak-area section when no misses", () => {
    const guide = buildAdaptiveGuide(UNITS, emptyProfile, 1);
    expect(guide.sections.some(s => s.id === "weak-area")).toBe(false);
  });
});

describe("buildAdaptiveGuide — needs-review", () => {
  const profile = buildStudentProfile(
    BOOK,
    [{ bookId: BOOK, pageIndex: 1, startedAt: NOW - DAY, durationMs: 60_000 }],
    [{ bookId: BOOK, pageIndex: 1, unitId: "u-mech", correct: false, streak: 0, attemptedAt: NOW - DAY }],
  );

  it("sets learnerState to needs-review", () => {
    const guide = buildAdaptiveGuide(UNITS, profile, 1);
    expect(guide.learnerState).toBe("needs-review");
  });

  it("includes weak-area section with the missed unit", () => {
    const guide = buildAdaptiveGuide(UNITS, profile, 1);
    const section = guide.sections.find(s => s.id === "weak-area");
    expect(section).toBeDefined();
    expect(section!.units?.some(u => u.id === "u-mech")).toBe(true);
  });

  it("weak-area section has high urgency", () => {
    const guide = buildAdaptiveGuide(UNITS, profile, 1);
    const section = guide.sections.find(s => s.id === "weak-area");
    expect(section?.urgency).toBe("high");
  });

  it("priority units put the missed unit first", () => {
    const guide = buildAdaptiveGuide(UNITS, profile, 1);
    expect(guide.priorityUnits[0].id).toBe("u-mech");
  });
});

describe("buildAdaptiveGuide — confidence scores", () => {
  it("returns confidence for each canonical type present in units", () => {
    const guide = buildAdaptiveGuide(UNITS, emptyProfile, 1);
    const types = guide.confidenceByType.map(c => c.canonicalType);
    expect(types).toContain("definition");
    expect(types).toContain("mechanism");
    expect(types).toContain("trap");
  });

  it("baseline confidence is 50 when no recall data", () => {
    const guide = buildAdaptiveGuide(UNITS, emptyProfile, 1);
    guide.confidenceByType.forEach(c => expect(c.confidence).toBe(50));
  });

  it("trend is unknown when no recall data", () => {
    const guide = buildAdaptiveGuide(UNITS, emptyProfile, 1);
    guide.confidenceByType.forEach(c => expect(c.trend).toBe("unknown"));
  });
});

describe("buildAdaptiveGuide — priorityUnits", () => {
  it("returns at most 5 priority units", () => {
    const many = Array.from({ length: 10 }, (_, i) => unit(`u${i}`, "definition", 50 + i));
    const guide = buildAdaptiveGuide(many, emptyProfile, 1);
    expect(guide.priorityUnits.length).toBeLessThanOrEqual(5);
  });

  it("sorts by importance score descending when no misses", () => {
    const guide = buildAdaptiveGuide(UNITS, emptyProfile, 1);
    const scores = guide.priorityUnits.map(u => u.importanceScore ?? 0);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
    }
  });
});
