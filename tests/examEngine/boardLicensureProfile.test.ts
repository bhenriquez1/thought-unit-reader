// tests/examEngine/boardLicensureProfile.test.ts
// C5 (Phase 0 audit) — BOARD_LICENSURE_EXAM_PROFILE is the third ExamProfile,
// proving the abstraction generalizes to a THIRD shape (not just the two
// DAT/Custom endpoints): unlike DAT it has no scaledScoreRange (pass/fail),
// and unlike Custom it has more than one real section. Real behavioral tests
// against the actual exported profile object — no IDB/network dependency.

import { BOARD_LICENSURE_EXAM_PROFILE, BOARD_LICENSURE_EXAM_PROFILE_ID } from "@/lib/examEngine/profiles/boardLicensureProfile";
import { CUSTOM_EXAM_PROFILE, CUSTOM_EXAM_PROFILE_ID } from "@/lib/examEngine/profiles/customProfile";
import { DAT_EXAM_PROFILE, DAT_EXAM_PROFILE_ID } from "@/lib/examEngine/profiles/datProfile";

describe("BOARD_LICENSURE_EXAM_PROFILE — the third ExamProfile", () => {
  it("REQUIRED: has a distinct id from both DAT and Custom", () => {
    expect(BOARD_LICENSURE_EXAM_PROFILE.id).toBe(BOARD_LICENSURE_EXAM_PROFILE_ID);
    expect(BOARD_LICENSURE_EXAM_PROFILE.id).not.toBe(DAT_EXAM_PROFILE_ID);
    expect(BOARD_LICENSURE_EXAM_PROFILE.id).not.toBe(CUSTOM_EXAM_PROFILE_ID);
  });

  it("REQUIRED: has no scaledScoreRange — board/licensure exams are pass/fail, not percentile-scored", () => {
    expect(BOARD_LICENSURE_EXAM_PROFILE.scoringRules.scaledScoreRange).toBeUndefined();
  });

  it("REQUIRED: has more than one real section, unlike Custom's single 'general' section", () => {
    expect(BOARD_LICENSURE_EXAM_PROFILE.sections.length).toBeGreaterThan(1);
    expect(BOARD_LICENSURE_EXAM_PROFILE.sections.map((s) => s.id)).not.toContain("general");
  });

  it("REQUIRED: has an empty topicBlueprint — no fabricated external board-exam blueprint, same as Custom", () => {
    expect(BOARD_LICENSURE_EXAM_PROFILE.topicBlueprint).toEqual([]);
  });

  it("timingRules.totalTimeLimitMinutes equals the sum of its own section time limits", () => {
    const sectionSum = BOARD_LICENSURE_EXAM_PROFILE.sections.reduce((sum, s) => sum + s.defaultTimeLimitMinutes, 0);
    expect(BOARD_LICENSURE_EXAM_PROFILE.timingRules.totalTimeLimitMinutes).toBe(sectionSum);
  });

  it("supports every DifficultyLevel and QuestionType — no DAT-specific restriction", () => {
    expect(BOARD_LICENSURE_EXAM_PROFILE.difficultyLevels).toEqual(
      expect.arrayContaining(["foundation", "simulation", "advanced", "mastery"]),
    );
    expect(BOARD_LICENSURE_EXAM_PROFILE.questionTypes).toEqual(
      expect.arrayContaining(["recognition", "decision", "application", "trap_training", "recall"]),
    );
  });

  it("shape-checks as a real ExamProfile", () => {
    expect(typeof BOARD_LICENSURE_EXAM_PROFILE.examName).toBe("string");
    expect(BOARD_LICENSURE_EXAM_PROFILE.timingRules.totalTimeLimitMinutes).toBeGreaterThan(0);
    expect(BOARD_LICENSURE_EXAM_PROFILE.weaknessAnalytics.minAttemptsForSignal).toBeGreaterThan(0);
  });

  it("is unaffected by importing the other two profiles (no shared mutable state)", () => {
    expect(CUSTOM_EXAM_PROFILE.sections).toHaveLength(1);
    expect(DAT_EXAM_PROFILE.sections.length).toBeGreaterThan(1);
  });
});
