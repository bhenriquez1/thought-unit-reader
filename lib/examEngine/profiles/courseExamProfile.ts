// lib/examEngine/profiles/courseExamProfile.ts
// C6 (Phase 0 audit) — the fourth real ExamProfile. A Course Exam has no
// external blueprint at all, lawful/public or otherwise: it's the student's
// own class, taught from whatever material they uploaded. Structurally
// closest to CUSTOM_EXAM_PROFILE (one "general" section, no scaledScoreRange,
// empty topicBlueprint) for the same reason customProfile.ts gives — nothing
// external to weight sections or topics against.
//
// What's actually new for Course Exam isn't the profile shape, it's WHICH
// exam gets generated: Chapter Quiz / Unit Exam / Midterm / Cumulative Final
// differ by scope (how much material) and format (timed vs. untimed, size),
// not by section taxonomy — see courseExamTypes.ts, which maps each type
// onto the existing generic ExamScope/PracticeMode knobs rather than adding
// new pipeline concepts.
import type { ExamProfile } from "@/lib/examEngine/types";

export const COURSE_EXAM_PROFILE_ID = "course-exam";

export const COURSE_EXAM_PROFILE: ExamProfile = {
  id: COURSE_EXAM_PROFILE_ID,
  examName: "Course Exam",
  sections: [
    {
      id: "general",
      name: "General",
      shortName: "General",
      defaultQuestionCount: 25,
      defaultTimeLimitMinutes: 90,
      topics: [],
    },
  ],
  questionTypes: ["recognition", "decision", "application", "trap_training", "recall"],
  difficultyLevels: ["foundation", "simulation", "advanced", "mastery"],
  timingRules: {
    totalTimeLimitMinutes: 90,
    warningThresholdMinutes: 5,
  },
  scoringRules: {
    pointsPerQuestion: 1,
    penalizeGuessing: false,
    // No scaledScoreRange — a class exam is graded on its own percentage,
    // not against any standardized scale.
  },
  topicBlueprint: [],
  weaknessAnalytics: {
    minAttemptsForSignal: 3,
    weakAccuracyThreshold: 60,
    strongAccuracyThreshold: 85,
  },
};
