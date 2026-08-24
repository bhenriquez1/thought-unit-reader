// lib/examEngine/profiles/customProfile.ts
// Product-split Phase 1, item 2 — the second ExamProfile, proving the
// abstraction lib/examEngine/types.ts describes ("DAT is the first
// ExamProfile; MCAT/GRE/board-exam profiles plug into the same
// ExamProfile/EngineQuestion shapes without changing this file") actually
// generalizes rather than being DAT-shaped underneath.
//
// Deliberately the OPPOSITE structure from DAT_EXAM_PROFILE: no official
// section taxonomy, no scaled-score range, no topic blueprint sourced from
// an external standardized-test spec — a "Custom Exam" draws entirely from
// whatever the student selects (a book, or specific chapters within it),
// with no external blueprint imposed on top. This is the same idea the
// product vision describes for Custom Exam mode: "use only the uploaded
// materials without any external standardized-test blueprint."
//
// lib/examEngine/examBuilder.ts's matchSection() already falls back to
// profile.sections[0]?.id when topicBlueprint has no match — an empty
// topicBlueprint here means every note matches the one "general" section,
// so nothing is silently excluded.

import type { ExamProfile } from "@/lib/examEngine/types";

export const CUSTOM_EXAM_PROFILE_ID = "custom";

export const CUSTOM_EXAM_PROFILE: ExamProfile = {
  id: CUSTOM_EXAM_PROFILE_ID,
  examName: "Custom Exam",
  sections: [
    {
      id: "general",
      name: "General",
      shortName: "General",
      defaultQuestionCount: 20,
      // P1 fix — must match timingRules.totalTimeLimitMinutes below: Custom
      // Exam has exactly one section, so its own time limit IS the whole
      // exam's time limit. This used to be 30 while totalTimeLimitMinutes
      // was 60 — an internal inconsistency that mattered once the proctor's
      // live countdown started reading a section's own limit instead of a
      // DAT-only fallback (see legacyAdapter.ts's builtExamToGeneratedExam).
      defaultTimeLimitMinutes: 60,
      topics: [],
    },
  ],
  questionTypes: ["recognition", "decision", "application", "trap_training", "recall"],
  difficultyLevels: ["foundation", "simulation", "advanced", "mastery"],
  timingRules: {
    totalTimeLimitMinutes: 60,
    warningThresholdMinutes: 5,
  },
  scoringRules: {
    pointsPerQuestion: 1,
    penalizeGuessing: false,
    // No scaledScoreRange — there is no standardized-test scale to report
    // against for an exam with no external blueprint.
  },
  topicBlueprint: [],
  weaknessAnalytics: {
    minAttemptsForSignal: 3,
    weakAccuracyThreshold: 60,
    strongAccuracyThreshold: 85,
  },
};
