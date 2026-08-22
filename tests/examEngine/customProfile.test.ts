// tests/examEngine/customProfile.test.ts
// Product-split Phase 1, item 2 — proves ExamProfile generalizes beyond DAT.
// Real behavioral tests against the actual exported profile objects (both
// are plain data, no IDB/network dependency, so unlike examBuilder.ts
// itself these don't need the source-inspection fallback pattern).

import { CUSTOM_EXAM_PROFILE, CUSTOM_EXAM_PROFILE_ID } from "../../lib/examEngine/profiles/customProfile";
import { DAT_EXAM_PROFILE, DAT_EXAM_PROFILE_ID } from "../../lib/examEngine/profiles/datProfile";

describe("CUSTOM_EXAM_PROFILE — the second ExamProfile", () => {
  it("REQUIRED: has a distinct id from DAT's profile", () => {
    expect(CUSTOM_EXAM_PROFILE.id).toBe(CUSTOM_EXAM_PROFILE_ID);
    expect(CUSTOM_EXAM_PROFILE.id).not.toBe(DAT_EXAM_PROFILE.id);
    expect(CUSTOM_EXAM_PROFILE_ID).not.toBe(DAT_EXAM_PROFILE_ID);
  });

  it("REQUIRED: has an empty topicBlueprint — no external standardized-test blueprint imposed", () => {
    expect(CUSTOM_EXAM_PROFILE.topicBlueprint).toEqual([]);
    // Contrast: DAT's profile genuinely has one, proving this is a real
    // difference between the two profiles, not an accidental omission.
    expect(DAT_EXAM_PROFILE.topicBlueprint.length).toBeGreaterThan(0);
  });

  it("REQUIRED: has exactly one generic section — draws from the whole source, not a fixed multi-section blueprint", () => {
    expect(CUSTOM_EXAM_PROFILE.sections).toHaveLength(1);
    expect(CUSTOM_EXAM_PROFILE.sections[0].id).toBe("general");
    // Contrast: DAT has multiple real sections.
    expect(DAT_EXAM_PROFILE.sections.length).toBeGreaterThan(1);
  });

  it("has no scaledScoreRange — there is no standardized scale for an exam with no external blueprint", () => {
    expect(CUSTOM_EXAM_PROFILE.scoringRules.scaledScoreRange).toBeUndefined();
    // Contrast: DAT reports against the real 1-30 DAT scale.
    expect(DAT_EXAM_PROFILE.scoringRules.scaledScoreRange).toBeDefined();
  });

  it("supports every DifficultyLevel and QuestionType — no DAT-specific restriction", () => {
    expect(CUSTOM_EXAM_PROFILE.difficultyLevels).toEqual(
      expect.arrayContaining(["foundation", "simulation", "advanced", "mastery"]),
    );
    expect(CUSTOM_EXAM_PROFILE.questionTypes).toEqual(
      expect.arrayContaining(["recognition", "decision", "application", "trap_training", "recall"]),
    );
  });

  it("shape-checks as a real ExamProfile (would fail to compile otherwise, but also verified structurally here)", () => {
    expect(typeof CUSTOM_EXAM_PROFILE.examName).toBe("string");
    expect(CUSTOM_EXAM_PROFILE.timingRules.totalTimeLimitMinutes).toBeGreaterThan(0);
    expect(CUSTOM_EXAM_PROFILE.weaknessAnalytics.minAttemptsForSignal).toBeGreaterThan(0);
  });
});
