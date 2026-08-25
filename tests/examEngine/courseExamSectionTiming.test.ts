// tests/examEngine/courseExamSectionTiming.test.ts
// Post-merge fix — automated review on #688 (after merge) found Course
// Exam's single "general" section always got COURSE_EXAM_PROFILE's own
// fixed defaultTimeLimitMinutes (90) from builtExamToGeneratedExam,
// regardless of which PracticeMode the active Course Exam type actually
// mapped to. The proctor's live countdown reads exactly this per-section
// value, not totalTimeLimitMinutes — so an untimed Chapter Quiz (999-minute
// 'practice' mode) still auto-submitted at 90 minutes, and a 255-minute
// Cumulative Final ('full-dat' mode) was also capped at 90.
//
// Real behavioral tests — dependencies are mocked so the actual fixed
// logic runs for real, same pattern as customExamProfileTiming.test.ts
// (the P1 fix on #668 this generalizes).

import { builtExamToGeneratedExam } from "@/lib/examEngine/legacyAdapter";
import { COURSE_EXAM_PROFILE } from "@/lib/examEngine/profiles/courseExamProfile";
import { DAT_EXAM_PROFILE } from "@/lib/examEngine/profiles/datProfile";
import type { BuiltExam } from "@/lib/examEngine/examBuilder";
import type { EngineQuestion } from "@/lib/examEngine/types";

function fakeQuestion(overrides: Partial<EngineQuestion> = {}): EngineQuestion {
  return {
    id: "q1", examProfileId: "course-exam", section: "general", subject: "General",
    unit: "unit", topic: "topic", concept: "concept", difficulty: "simulation",
    questionType: "recognition", skillTested: "recall", sourceBookId: "book-1",
    sourcePageNumber: 1, stem: "stem", choices: ["A", "B", "C", "D"], correctIndex: 0,
    whyCorrect: "because", whyWrong: ["", "", "", ""], createdAt: new Date(0).toISOString(),
    ...overrides,
  };
}

function fakeBuiltExam(questions: EngineQuestion[]): BuiltExam {
  return {
    id: "exam-1", examProfileId: "course-exam", bookId: "book-1", difficulty: "simulation", questions,
    metadata: { generatedAt: new Date(0).toISOString(), totalQuestions: questions.length, conceptsUsed: 1, sectionBreakdown: {}, questionTypeBreakdown: {} },
  };
}

describe("builtExamToGeneratedExam — single-section profile's section timer tracks the real mode, not the profile's static default", () => {
  it("REQUIRED: an untimed Chapter Quiz (999-minute practice mode) gets a 999-minute section, not COURSE_EXAM_PROFILE's own 90", () => {
    const built = fakeBuiltExam([fakeQuestion()]);
    const exam = builtExamToGeneratedExam(built, 999, "practice", COURSE_EXAM_PROFILE);
    const section = exam.config.sections.find((s) => s.sectionId === "general");
    expect(section?.timeLimit).toBe(999);
    expect(section?.timeLimit).not.toBe(COURSE_EXAM_PROFILE.sections[0].defaultTimeLimitMinutes);
  });

  it("REQUIRED: a Cumulative Final (255-minute full-dat mode) gets a 255-minute section, not capped at 90", () => {
    const built = fakeBuiltExam([fakeQuestion()]);
    const exam = builtExamToGeneratedExam(built, 255, "full-dat", COURSE_EXAM_PROFILE);
    const section = exam.config.sections.find((s) => s.sectionId === "general");
    expect(section?.timeLimit).toBe(255);
  });

  it("a Unit Exam/Midterm (90-minute practice-exam mode) still correctly gets 90 minutes", () => {
    const built = fakeBuiltExam([fakeQuestion()]);
    const exam = builtExamToGeneratedExam(built, 90, "practice-exam", COURSE_EXAM_PROFILE);
    expect(exam.config.sections[0].timeLimit).toBe(90);
  });

  it("DAT (multi-section) is unaffected — each section keeps its own real distinct default, not totalTimeLimitMinutes divided or substituted", () => {
    const built = fakeBuiltExam([
      fakeQuestion({ section: "survey-natural-sciences", examProfileId: "dat" }),
      fakeQuestion({ id: "q2", section: "perceptual-ability", examProfileId: "dat" }),
    ]);
    // Pass a totalTimeLimitMinutes that matches neither section's real DAT
    // default, so a wrongly-applied single-section substitution would be
    // caught immediately.
    const exam = builtExamToGeneratedExam(built, 999, "full-dat", DAT_EXAM_PROFILE);
    const scienceSection = exam.config.sections.find((s) => s.sectionId === "survey-natural-sciences");
    const patSection = exam.config.sections.find((s) => s.sectionId === "perceptual-ability");
    expect(scienceSection?.timeLimit).not.toBe(999);
    expect(patSection?.timeLimit).not.toBe(999);
    expect(scienceSection?.timeLimit).not.toBe(patSection?.timeLimit);
  });
});
