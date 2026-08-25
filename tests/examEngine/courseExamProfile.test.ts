// tests/examEngine/courseExamProfile.test.ts
// C6 (Phase 0 audit) — COURSE_EXAM_PROFILE is the fourth ExamProfile.
// Structurally close to Custom (no external blueprint), which is the point:
// a course exam has no lawful public blueprint to encode at all, it's the
// student's own class. Real behavioral tests against the actual exported
// profile object — no IDB/network dependency.

import { COURSE_EXAM_PROFILE, COURSE_EXAM_PROFILE_ID } from "@/lib/examEngine/profiles/courseExamProfile";
import { CUSTOM_EXAM_PROFILE_ID } from "@/lib/examEngine/profiles/customProfile";
import { DAT_EXAM_PROFILE_ID } from "@/lib/examEngine/profiles/datProfile";
import { BOARD_LICENSURE_EXAM_PROFILE_ID } from "@/lib/examEngine/profiles/boardLicensureProfile";

describe("COURSE_EXAM_PROFILE — the fourth ExamProfile", () => {
  it("REQUIRED: has a distinct id from the other three profiles", () => {
    expect(COURSE_EXAM_PROFILE.id).toBe(COURSE_EXAM_PROFILE_ID);
    expect(COURSE_EXAM_PROFILE.id).not.toBe(DAT_EXAM_PROFILE_ID);
    expect(COURSE_EXAM_PROFILE.id).not.toBe(CUSTOM_EXAM_PROFILE_ID);
    expect(COURSE_EXAM_PROFILE.id).not.toBe(BOARD_LICENSURE_EXAM_PROFILE_ID);
  });

  it("REQUIRED: has no scaledScoreRange and an empty topicBlueprint — no external blueprint exists for a class exam", () => {
    expect(COURSE_EXAM_PROFILE.scoringRules.scaledScoreRange).toBeUndefined();
    expect(COURSE_EXAM_PROFILE.topicBlueprint).toEqual([]);
  });

  it("REQUIRED: has exactly one generic section, same shape as Custom Exam", () => {
    expect(COURSE_EXAM_PROFILE.sections).toHaveLength(1);
    expect(COURSE_EXAM_PROFILE.sections[0].id).toBe("general");
  });

  it("shape-checks as a real ExamProfile", () => {
    expect(typeof COURSE_EXAM_PROFILE.examName).toBe("string");
    expect(COURSE_EXAM_PROFILE.timingRules.totalTimeLimitMinutes).toBeGreaterThan(0);
    expect(COURSE_EXAM_PROFILE.weaknessAnalytics.minAttemptsForSignal).toBeGreaterThan(0);
  });
});
