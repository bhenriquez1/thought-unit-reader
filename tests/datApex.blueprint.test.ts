// tests/datApex.blueprint.test.ts
// DAT Apex — blueprint integrity, state machine transitions, scoring types, and
// form assembler contract.

import { describe, it, expect, vi } from "vitest";

import {
  DAT_BLUEPRINT_2025,
  totalBlueprintItems,
  totalTestingMinutes,
  getSectionBlueprint,
  getSubSectionBlueprint,
  orderedSectionIds,
  nextSectionId,
  sectionFamily,
  initialSessionState,
  startTutorial,
  beginFirstSection,
  advanceSection,
  resumeFromBreak,
  pauseSession,
  resumeFromPause,
  enterFinalReview,
  submitExam,
  DatSessionTransitionError,
  assembleTestForm,
  sectionTimeLimitSeconds,
  ACTIVE_DAT_BLUEPRINT,
} from "../lib/datApex";

import type {
  DatExamQuestion,
  DatSessionState,
  QuestionValidationStatus,
} from "../lib/datApex";

import type { QuestionPool } from "../lib/datApex/formAssembler";

/* ─── Blueprint 2025 — structural integrity ────────────────────────────────── */

describe("DAT_BLUEPRINT_2025 — structural integrity", () => {
  it("has the correct version and effective date", () => {
    expect(DAT_BLUEPRINT_2025.version).toBe("2025.1");
    expect(DAT_BLUEPRINT_2025.effectiveDate).toBe("2025-03-01");
    expect(DAT_BLUEPRINT_2025.scoringModelVersion).toBe("ada-2025");
  });

  it("totalAdministrationMinutes is 315", () => {
    expect(DAT_BLUEPRINT_2025.totalAdministrationMinutes).toBe(315);
  });

  it("has exactly 4 section families in administration order", () => {
    expect(DAT_BLUEPRINT_2025.sectionFamilyOrder).toHaveLength(4);
    expect(DAT_BLUEPRINT_2025.sectionFamilyOrder[0]).toBe("natural-sciences");
    expect(DAT_BLUEPRINT_2025.sectionFamilyOrder[3]).toBe("quantitative-reasoning");
  });

  it("has exactly 4 sections", () => {
    expect(DAT_BLUEPRINT_2025.sections).toHaveLength(4);
  });

  it("has one break after perceptual-ability (15 min, optional)", () => {
    expect(DAT_BLUEPRINT_2025.breaks).toHaveLength(1);
    const br = DAT_BLUEPRINT_2025.breaks[0];
    expect(br.afterSectionFamily).toBe("perceptual-ability");
    expect(br.durationMinutes).toBe(15);
    expect(br.optional).toBe(true);
  });
});

/* ─── Blueprint 2025 — item counts ─────────────────────────────────────────── */

describe("DAT_BLUEPRINT_2025 — item counts", () => {
  it("SNS has 100 items total", () => {
    const sns = getSectionBlueprint(DAT_BLUEPRINT_2025, "natural-sciences")!;
    expect(sns.totalItemCount).toBe(100);
  });

  it("Biology sub-section has 40 items", () => {
    const bio = getSubSectionBlueprint(DAT_BLUEPRINT_2025, "biology")!;
    expect(bio.itemCount).toBe(40);
  });

  it("General Chemistry sub-section has 30 items", () => {
    const gc = getSubSectionBlueprint(DAT_BLUEPRINT_2025, "general-chemistry")!;
    expect(gc.itemCount).toBe(30);
  });

  it("Organic Chemistry sub-section has 30 items", () => {
    const oc = getSubSectionBlueprint(DAT_BLUEPRINT_2025, "organic-chemistry")!;
    expect(oc.itemCount).toBe(30);
  });

  it("Perceptual Ability has 90 items", () => {
    const pat = getSectionBlueprint(DAT_BLUEPRINT_2025, "perceptual-ability")!;
    expect(pat.totalItemCount).toBe(90);
  });

  it("Reading Comprehension has 50 items", () => {
    const rc = getSectionBlueprint(DAT_BLUEPRINT_2025, "reading-comprehension")!;
    expect(rc.totalItemCount).toBe(50);
  });

  it("Quantitative Reasoning has 40 items", () => {
    const qr = getSectionBlueprint(DAT_BLUEPRINT_2025, "quantitative-reasoning")!;
    expect(qr.totalItemCount).toBe(40);
  });

  it("totalBlueprintItems sums to 280", () => {
    expect(totalBlueprintItems(DAT_BLUEPRINT_2025)).toBe(280);
  });
});

/* ─── Blueprint 2025 — timing ───────────────────────────────────────────────── */

describe("DAT_BLUEPRINT_2025 — timing", () => {
  it("SNS time limit is 90 minutes", () => {
    const sns = getSectionBlueprint(DAT_BLUEPRINT_2025, "natural-sciences")!;
    expect(sns.timeLimitMinutes).toBe(90);
  });

  it("PAT time limit is 60 minutes", () => {
    const pat = getSectionBlueprint(DAT_BLUEPRINT_2025, "perceptual-ability")!;
    expect(pat.timeLimitMinutes).toBe(60);
  });

  it("RC time limit is 60 minutes", () => {
    const rc = getSectionBlueprint(DAT_BLUEPRINT_2025, "reading-comprehension")!;
    expect(rc.timeLimitMinutes).toBe(60);
  });

  it("QR time limit is 45 minutes", () => {
    const qr = getSectionBlueprint(DAT_BLUEPRINT_2025, "quantitative-reasoning")!;
    expect(qr.timeLimitMinutes).toBe(45);
  });

  it("totalTestingMinutes = sections + breaks = 255 + 15 = 270", () => {
    // 90 + 60 + 60 + 45 = 255 section minutes + 15 break = 270
    expect(totalTestingMinutes(DAT_BLUEPRINT_2025)).toBe(270);
  });

  it("totalAdministrationMinutes >= tutorial + sections + breaks (ADA includes admin overhead)", () => {
    // ADA's 315-minute figure includes test-center overhead beyond the blueprint components.
    const sectionTime = DAT_BLUEPRINT_2025.sections.reduce((s, sec) => s + sec.timeLimitMinutes, 0);
    const breakTime   = DAT_BLUEPRINT_2025.breaks.reduce((s, b) => s + b.durationMinutes, 0);
    const computed    = DAT_BLUEPRINT_2025.tutorialMinutes + sectionTime + breakTime;
    expect(DAT_BLUEPRINT_2025.totalAdministrationMinutes).toBeGreaterThanOrEqual(computed);
  });
});

/* ─── Blueprint 2025 — topic weights ───────────────────────────────────────── */

describe("DAT_BLUEPRINT_2025 — topic weights", () => {
  it("Biology topic weights sum to 100%", () => {
    const bio = getSubSectionBlueprint(DAT_BLUEPRINT_2025, "biology")!;
    const sum = bio.topicWeights.reduce((s, tw) => s + tw.targetPct, 0);
    expect(sum).toBe(100);
  });

  it("General Chemistry topic weights sum to 100%", () => {
    const gc = getSubSectionBlueprint(DAT_BLUEPRINT_2025, "general-chemistry")!;
    const sum = gc.topicWeights.reduce((s, tw) => s + tw.targetPct, 0);
    expect(sum).toBe(100);
  });

  it("Organic Chemistry topic weights sum to 100%", () => {
    const oc = getSubSectionBlueprint(DAT_BLUEPRINT_2025, "organic-chemistry")!;
    const sum = oc.topicWeights.reduce((s, tw) => s + tw.targetPct, 0);
    expect(sum).toBe(100);
  });

  it("PAT topic weights sum to 100%", () => {
    const pat = getSubSectionBlueprint(DAT_BLUEPRINT_2025, "perceptual-ability")!;
    const sum = pat.topicWeights.reduce((s, tw) => s + tw.targetPct, 0);
    expect(sum).toBe(100);
  });

  it("RC topic weights sum to 100%", () => {
    const rc = getSubSectionBlueprint(DAT_BLUEPRINT_2025, "reading-comprehension")!;
    const sum = rc.topicWeights.reduce((s, tw) => s + tw.targetPct, 0);
    expect(sum).toBe(100);
  });

  it("QR topic weights sum to 100%", () => {
    const qr = getSubSectionBlueprint(DAT_BLUEPRINT_2025, "quantitative-reasoning")!;
    const sum = qr.topicWeights.reduce((s, tw) => s + tw.targetPct, 0);
    expect(sum).toBe(100);
  });

  it("all tolerancePct values are positive", () => {
    for (const section of DAT_BLUEPRINT_2025.sections) {
      for (const ss of section.subSections) {
        for (const tw of ss.topicWeights) {
          expect(tw.tolerancePct).toBeGreaterThan(0);
        }
      }
    }
  });
});

/* ─── Blueprint 2025 — specification versions ──────────────────────────────── */

describe("DAT_BLUEPRINT_2025 — specification versions", () => {
  it("all 2025 sub-sections have specificationVersion '2025'", () => {
    for (const section of DAT_BLUEPRINT_2025.sections) {
      for (const ss of section.subSections) {
        expect(ss.specificationVersion).toBe("2025");
      }
    }
  });

  it("upcomingChanges mentions Organic Chemistry 2026 update", () => {
    const changes = DAT_BLUEPRINT_2025.upcomingChanges ?? [];
    expect(changes.length).toBeGreaterThan(0);
    expect(changes.some(c => c.toLowerCase().includes("organic") && c.includes("2026"))).toBe(true);
  });
});

/* ─── Blueprint helpers ─────────────────────────────────────────────────────── */

describe("blueprint helpers", () => {
  it("getSectionBlueprint returns null for unknown family", () => {
    expect(getSectionBlueprint(DAT_BLUEPRINT_2025, "unknown-family" as any)).toBeNull();
  });

  it("getSubSectionBlueprint returns null for unknown sectionId", () => {
    expect(getSubSectionBlueprint(DAT_BLUEPRINT_2025, "physics" as any)).toBeNull();
  });

  it("orderedSectionIds returns 6 IDs in administration order", () => {
    const ids = orderedSectionIds(DAT_BLUEPRINT_2025);
    expect(ids).toHaveLength(6);
    expect(ids[0]).toBe("biology");
    expect(ids[1]).toBe("general-chemistry");
    expect(ids[2]).toBe("organic-chemistry");
    expect(ids[3]).toBe("perceptual-ability");
    expect(ids[4]).toBe("reading-comprehension");
    expect(ids[5]).toBe("quantitative-reasoning");
  });

  it("nextSectionId advances correctly through all sections", () => {
    expect(nextSectionId("biology",              DAT_BLUEPRINT_2025)).toBe("general-chemistry");
    expect(nextSectionId("general-chemistry",    DAT_BLUEPRINT_2025)).toBe("organic-chemistry");
    expect(nextSectionId("organic-chemistry",    DAT_BLUEPRINT_2025)).toBe("perceptual-ability");
    expect(nextSectionId("perceptual-ability",   DAT_BLUEPRINT_2025)).toBe("reading-comprehension");
    expect(nextSectionId("reading-comprehension",DAT_BLUEPRINT_2025)).toBe("quantitative-reasoning");
    expect(nextSectionId("quantitative-reasoning",DAT_BLUEPRINT_2025)).toBeNull();
  });

  it("sectionFamily maps sub-sections to correct families", () => {
    expect(sectionFamily("biology",               DAT_BLUEPRINT_2025)).toBe("natural-sciences");
    expect(sectionFamily("general-chemistry",     DAT_BLUEPRINT_2025)).toBe("natural-sciences");
    expect(sectionFamily("organic-chemistry",     DAT_BLUEPRINT_2025)).toBe("natural-sciences");
    expect(sectionFamily("perceptual-ability",    DAT_BLUEPRINT_2025)).toBe("perceptual-ability");
    expect(sectionFamily("reading-comprehension", DAT_BLUEPRINT_2025)).toBe("reading-comprehension");
    expect(sectionFamily("quantitative-reasoning",DAT_BLUEPRINT_2025)).toBe("quantitative-reasoning");
  });

  it("sectionFamily throws for unknown sectionId", () => {
    expect(() => sectionFamily("unknown" as any, DAT_BLUEPRINT_2025)).toThrow();
  });
});

/* ─── Active blueprint pointer ──────────────────────────────────────────────── */

describe("ACTIVE_DAT_BLUEPRINT", () => {
  it("points to 2025 blueprint", () => {
    expect(ACTIVE_DAT_BLUEPRINT.version).toBe("2025.1");
  });

  it("is referentially the same as DAT_BLUEPRINT_2025", () => {
    expect(ACTIVE_DAT_BLUEPRINT).toBe(DAT_BLUEPRINT_2025);
  });
});

/* ─── Session state machine — happy path ────────────────────────────────────── */

describe("session state machine — happy path", () => {
  it("initialSessionState starts at idle", () => {
    const s = initialSessionState();
    expect(s.phase).toBe("idle");
    expect(s.currentSectionId).toBeNull();
    expect(s.completedSections).toHaveLength(0);
  });

  it("idle → tutorial", () => {
    const s0 = initialSessionState();
    const s1 = startTutorial(s0, "attempt-1", "form-1", "simulation");
    expect(s1.phase).toBe("tutorial");
    expect(s1.attemptId).toBe("attempt-1");
    expect(s1.mode).toBe("simulation");
  });

  it("tutorial → in-section (biology)", () => {
    let s = initialSessionState();
    s = startTutorial(s, "a1", "f1", "simulation");
    s = beginFirstSection(s, "biology", 5400);
    expect(s.phase).toBe("in-section");
    expect(s.currentSectionId).toBe("biology");
    expect(s.sectionSecondsRemaining).toBe(5400);
  });

  it("in-section biology → in-section general-chemistry (no break between SNS sub-sections)", () => {
    let s = initialSessionState();
    s = startTutorial(s, "a1", "f1", "simulation");
    s = beginFirstSection(s, "biology", 5400);
    s = advanceSection(s, "biology", "general-chemistry", 5400, DAT_BLUEPRINT_2025);
    expect(s.phase).toBe("in-section");
    expect(s.currentSectionId).toBe("general-chemistry");
    expect(s.completedSections).toContain("biology");
  });

  it("in-section after PAT → break (blueprint mandates break after perceptual-ability)", () => {
    let s = initialSessionState();
    s = startTutorial(s, "a1", "f1", "simulation");
    s = beginFirstSection(s, "biology", 5400);
    s = advanceSection(s, "biology",           "general-chemistry",     5400, DAT_BLUEPRINT_2025);
    s = advanceSection(s, "general-chemistry", "organic-chemistry",     5400, DAT_BLUEPRINT_2025);
    s = advanceSection(s, "organic-chemistry", "perceptual-ability",    3600, DAT_BLUEPRINT_2025);
    s = advanceSection(s, "perceptual-ability","reading-comprehension", 3600, DAT_BLUEPRINT_2025);
    expect(s.phase).toBe("break");
  });

  it("break → in-section (reading-comprehension)", () => {
    let s = initialSessionState();
    s = startTutorial(s, "a1", "f1", "simulation");
    s = beginFirstSection(s, "biology", 5400);
    s = advanceSection(s, "biology",           "general-chemistry",     5400, DAT_BLUEPRINT_2025);
    s = advanceSection(s, "general-chemistry", "organic-chemistry",     5400, DAT_BLUEPRINT_2025);
    s = advanceSection(s, "organic-chemistry", "perceptual-ability",    3600, DAT_BLUEPRINT_2025);
    s = advanceSection(s, "perceptual-ability","reading-comprehension", 3600, DAT_BLUEPRINT_2025);
    s = resumeFromBreak(s, "reading-comprehension", 3600);
    expect(s.phase).toBe("in-section");
    expect(s.currentSectionId).toBe("reading-comprehension");
  });

  it("last section → final-review when nextSectionId is null", () => {
    let s = initialSessionState();
    s = startTutorial(s, "a1", "f1", "simulation");
    s = beginFirstSection(s, "biology", 5400);
    s = advanceSection(s, "biology",               "general-chemistry",     5400, DAT_BLUEPRINT_2025);
    s = advanceSection(s, "general-chemistry",     "organic-chemistry",     5400, DAT_BLUEPRINT_2025);
    s = advanceSection(s, "organic-chemistry",     "perceptual-ability",    3600, DAT_BLUEPRINT_2025);
    s = advanceSection(s, "perceptual-ability",    "reading-comprehension", 3600, DAT_BLUEPRINT_2025);
    s = resumeFromBreak(s, "reading-comprehension", 3600);
    s = advanceSection(s, "reading-comprehension", "quantitative-reasoning", 2700, DAT_BLUEPRINT_2025);
    s = advanceSection(s, "quantitative-reasoning", null, 0, DAT_BLUEPRINT_2025);
    expect(s.phase).toBe("final-review");
  });

  it("final-review → submitted", () => {
    let s = initialSessionState();
    s = startTutorial(s, "a1", "f1", "simulation");
    s = beginFirstSection(s, "biology", 5400);
    s = advanceSection(s, "biology",               "general-chemistry",     5400, DAT_BLUEPRINT_2025);
    s = advanceSection(s, "general-chemistry",     "organic-chemistry",     5400, DAT_BLUEPRINT_2025);
    s = advanceSection(s, "organic-chemistry",     "perceptual-ability",    3600, DAT_BLUEPRINT_2025);
    s = advanceSection(s, "perceptual-ability",    "reading-comprehension", 3600, DAT_BLUEPRINT_2025);
    s = resumeFromBreak(s, "reading-comprehension", 3600);
    s = advanceSection(s, "reading-comprehension", "quantitative-reasoning", 2700, DAT_BLUEPRINT_2025);
    s = advanceSection(s, "quantitative-reasoning", null, 0, DAT_BLUEPRINT_2025);
    s = submitExam(s);
    expect(s.phase).toBe("submitted");
  });
});

/* ─── Session state machine — practice mode pause ───────────────────────────── */

describe("session state machine — practice pause", () => {
  it("in-section → paused → in-section (practice)", () => {
    let s = initialSessionState();
    s = startTutorial(s, "a1", "f1", "practice");
    s = beginFirstSection(s, "biology", 5400);
    s = pauseSession(s);
    expect(s.phase).toBe("paused");
    s = resumeFromPause(s);
    expect(s.phase).toBe("in-section");
  });
});

/* ─── Session state machine — error cases ──────────────────────────────────── */

describe("session state machine — invalid transitions", () => {
  it("cannot start tutorial from non-idle phase", () => {
    let s = initialSessionState();
    s = startTutorial(s, "a1", "f1", "simulation");
    expect(() => startTutorial(s, "a2", "f2", "simulation")).toThrow(DatSessionTransitionError);
  });

  it("cannot pause in simulation mode", () => {
    let s = initialSessionState();
    s = startTutorial(s, "a1", "f1", "simulation");
    s = beginFirstSection(s, "biology", 5400);
    expect(() => pauseSession(s)).toThrow(DatSessionTransitionError);
  });

  it("cannot resume from pause if not paused", () => {
    let s = initialSessionState();
    s = startTutorial(s, "a1", "f1", "practice");
    s = beginFirstSection(s, "biology", 5400);
    expect(() => resumeFromPause(s)).toThrow(DatSessionTransitionError);
  });

  it("cannot submit from idle", () => {
    const s = initialSessionState();
    expect(() => submitExam(s)).toThrow(DatSessionTransitionError);
  });

  it("cannot enter final-review from tutorial", () => {
    let s = initialSessionState();
    s = startTutorial(s, "a1", "f1", "simulation");
    expect(() => enterFinalReview(s)).toThrow(DatSessionTransitionError);
  });
});

/* ─── sectionTimeLimitSeconds helper ───────────────────────────────────────── */

describe("sectionTimeLimitSeconds", () => {
  it("returns correct seconds for each section", () => {
    expect(sectionTimeLimitSeconds("biology",               DAT_BLUEPRINT_2025)).toBe(90 * 60);
    expect(sectionTimeLimitSeconds("general-chemistry",     DAT_BLUEPRINT_2025)).toBe(90 * 60);
    expect(sectionTimeLimitSeconds("organic-chemistry",     DAT_BLUEPRINT_2025)).toBe(90 * 60);
    expect(sectionTimeLimitSeconds("perceptual-ability",    DAT_BLUEPRINT_2025)).toBe(60 * 60);
    expect(sectionTimeLimitSeconds("reading-comprehension", DAT_BLUEPRINT_2025)).toBe(60 * 60);
    expect(sectionTimeLimitSeconds("quantitative-reasoning",DAT_BLUEPRINT_2025)).toBe(45 * 60);
  });

  it("throws for unknown sectionId", () => {
    expect(() => sectionTimeLimitSeconds("unknown" as any, DAT_BLUEPRINT_2025)).toThrow();
  });
});

/* ─── Form assembler ────────────────────────────────────────────────────────── */

function makeQuestion(
  id:        string,
  sectionId: string,
  topicId:   string,
  status:    QuestionValidationStatus = "approved",
): DatExamQuestion {
  return {
    id,
    sectionId:             sectionId as any,
    specificationVersion:  "2025",
    topicId,
    stem:                  `Question ${id}`,
    choices:               [
      { id: "A", text: "A", isCorrect: false },
      { id: "B", text: "B", isCorrect: true  },
      { id: "C", text: "C", isCorrect: false },
      { id: "D", text: "D", isCorrect: false },
    ],
    correctChoiceId:  "B",
    difficulty:       0.5,
    validationStatus: status,
    createdAt:        "2025-01-01T00:00:00Z",
  };
}

function makePool(questions: DatExamQuestion[]): QuestionPool {
  return {
    fetchBySection: async (sectionId, statuses) =>
      questions.filter(q => q.sectionId === sectionId && statuses.includes(q.validationStatus)),
  };
}

describe("assembleTestForm", () => {
  it("returns error when pool is empty", async () => {
    const pool   = makePool([]);
    const result = await assembleTestForm(DAT_BLUEPRINT_2025, pool, {
      mode:           "simulation",
      attemptId:      "a1",
      sectionsFilter: ["biology"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.shortfall).toBeDefined();
      expect(result.shortfall![0].sectionId).toBe("biology");
    }
  });

  it("accepts practice questions with non-approved status", async () => {
    // Build a pool of 40 draft biology questions (not approved)
    const questions = Array.from({ length: 40 }, (_, i) =>
      makeQuestion(`bio-${i}`, "biology", "cell-biology", "draft"),
    );
    const pool   = makePool(questions);
    const result = await assembleTestForm(DAT_BLUEPRINT_2025, pool, {
      mode:           "practice",
      attemptId:      "a1",
      sectionsFilter: ["biology"],
      createdAt:      "2025-01-01T00:00:00Z",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const biologySection = result.form.sections.find(s => s.sectionId === "biology");
      expect(biologySection?.questionIds).toHaveLength(40);
    }
  });

  it("rejects draft questions in simulation mode", async () => {
    const questions = Array.from({ length: 40 }, (_, i) =>
      makeQuestion(`bio-${i}`, "biology", "cell-biology", "draft"),
    );
    const pool   = makePool(questions);
    const result = await assembleTestForm(DAT_BLUEPRINT_2025, pool, {
      mode:           "simulation",
      attemptId:      "a1",
      sectionsFilter: ["biology"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.shortfall![0].available).toBe(0);
    }
  });

  it("assembles biology section with correct item count", async () => {
    const questions = Array.from({ length: 60 }, (_, i) =>
      makeQuestion(`bio-${i}`, "biology", "cell-biology"),
    );
    const pool   = makePool(questions);
    const result = await assembleTestForm(DAT_BLUEPRINT_2025, pool, {
      mode:           "simulation",
      attemptId:      "a1",
      sectionsFilter: ["biology"],
      createdAt:      "2025-01-01T00:00:00Z",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.form.blueprintVersion).toBe("2025.1");
      const biologySection = result.form.sections.find(s => s.sectionId === "biology");
      expect(biologySection?.questionIds).toHaveLength(40);
    }
  });

  it("form id is derived from attemptId", async () => {
    const questions = Array.from({ length: 40 }, (_, i) =>
      makeQuestion(`bio-${i}`, "biology", "cell-biology"),
    );
    const pool   = makePool(questions);
    const result = await assembleTestForm(DAT_BLUEPRINT_2025, pool, {
      mode:           "simulation",
      attemptId:      "myAttempt",
      sectionsFilter: ["biology"],
      createdAt:      "2025-01-01T00:00:00Z",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.form.id).toBe("form-myAttempt");
    }
  });
});
