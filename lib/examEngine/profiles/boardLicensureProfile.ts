// lib/examEngine/profiles/boardLicensureProfile.ts
// C5 (Phase 0 audit) — the third real ExamProfile, after DAT and Custom
// Exam. profileCatalog.ts has listed "Board / Licensure" as a visible
// "Coming soon" entry since Product-split Phase 1; this is the actual
// implementation that flips it to available.
//
// Deliberately generic rather than modeled on any single named board or
// licensure exam (e.g. a specific dental/medical/nursing board): this app
// has no verified, lawful, public spec for one particular board exam's
// official blueprint to encode, and C6's grounded-generation pipeline rule
// against fabricating proprietary exam content applies here too — inventing
// a specific board's section weighting/timing would misrepresent it as
// authoritative when it isn't. What IS true generically across most
// board/licensure exams (bar, medical, dental, nursing, etc.), and is safe
// to encode: they gate entry into a profession rather than rank applicants,
// so they're graded pass/fail against a fixed competency bar (no percentile
// scaledScoreRange like DAT's 1-30), and they typically separate
// foundational/basic-science knowledge from applied clinical judgment. Like
// CUSTOM_EXAM_PROFILE, this profile draws its actual questions entirely from
// the student's own uploaded source material — no external question bank.
import type { ExamProfile } from "@/lib/examEngine/types";

export const BOARD_LICENSURE_EXAM_PROFILE_ID = "board-licensure";

export const BOARD_LICENSURE_EXAM_PROFILE: ExamProfile = {
  id: BOARD_LICENSURE_EXAM_PROFILE_ID,
  examName: "Board / Licensure Exam",
  sections: [
    {
      id: "foundational-sciences",
      name: "Foundational Sciences",
      shortName: "Foundational",
      defaultQuestionCount: 60,
      defaultTimeLimitMinutes: 90,
      topics: [],
    },
    {
      id: "clinical-application",
      name: "Clinical Application",
      shortName: "Clinical",
      defaultQuestionCount: 60,
      defaultTimeLimitMinutes: 90,
      topics: [],
    },
  ],
  questionTypes: ["recognition", "decision", "application", "trap_training", "recall"],
  difficultyLevels: ["foundation", "simulation", "advanced", "mastery"],
  timingRules: {
    totalTimeLimitMinutes: 180,
    warningThresholdMinutes: 10,
  },
  scoringRules: {
    pointsPerQuestion: 1,
    penalizeGuessing: false,
    // No scaledScoreRange — board/licensure exams are pass/fail against a
    // fixed competency bar, not a percentile scale like DAT's.
  },
  topicBlueprint: [],
  weaknessAnalytics: {
    minAttemptsForSignal: 3,
    weakAccuracyThreshold: 60,
    strongAccuracyThreshold: 85,
  },
};
