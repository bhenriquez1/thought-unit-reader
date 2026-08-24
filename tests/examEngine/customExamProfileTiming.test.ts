// tests/examEngine/customExamProfileTiming.test.ts
// P1 fix — flagged by automated review on #668 (unresolved discussions on
// lib/examEngine/profileGeneration.ts:109 and :97, posted just after
// merge).
//
// Two related bugs in how a non-DAT ExamProfile's timing/size flowed
// through to the proctor:
//
// 1. builtExamToGeneratedExam computed each section's time limit ONLY from
//    DAT_SECTIONS (a DAT-specific lookup table), falling back to a
//    hardcoded 30 minutes for any section id it didn't recognize — every
//    section of every non-DAT profile. The proctor's live countdown timer
//    reads exactly this per-section value, not config.totalTimeLimit, so a
//    Custom Exam profile configured for 60 minutes silently ran out after
//    30.
// 2. generateFullSimulationExam hardcoded questionCount: 280 (DAT's real
//    total) for every profile, including Custom Exam, whose sole section
//    declares only 20.
//
// Real behavioral tests — dependencies are mocked so the actual fixed
// logic runs for real.

jest.mock("@/lib/examEngine/examBuilder", () => ({ buildExam: jest.fn() }));

import { builtExamToGeneratedExam } from "@/lib/examEngine/legacyAdapter";
import { generateFullSimulationExam } from "@/lib/examEngine/profileGeneration";
import { buildExam } from "@/lib/examEngine/examBuilder";
import { CUSTOM_EXAM_PROFILE } from "@/lib/examEngine/profiles/customProfile";
import { DAT_EXAM_PROFILE } from "@/lib/examEngine/profiles/datProfile";
import type { BuiltExam } from "@/lib/examEngine/examBuilder";
import type { EngineQuestion } from "@/lib/examEngine/types";

function fakeQuestion(overrides: Partial<EngineQuestion> = {}): EngineQuestion {
  return {
    id: "q1", examProfileId: "custom", section: "general", subject: "General",
    unit: "unit", topic: "topic", concept: "concept", difficulty: "simulation",
    questionType: "recognition", skillTested: "recall", sourceBookId: "book-1",
    sourcePageNumber: 1, stem: "stem", choices: ["A", "B", "C", "D"], correctIndex: 0,
    whyCorrect: "because", whyWrong: ["", "", "", ""], createdAt: new Date(0).toISOString(),
    ...overrides,
  };
}

function fakeBuiltExam(questions: EngineQuestion[]): BuiltExam {
  return {
    id: "exam-1", examProfileId: "custom", bookId: "book-1", difficulty: "simulation", questions,
    metadata: { generatedAt: new Date(0).toISOString(), totalQuestions: questions.length, conceptsUsed: 1, sectionBreakdown: {}, questionTypeBreakdown: {} },
  };
}

describe("builtExamToGeneratedExam — section time limits are profile-aware", () => {
  it("REQUIRED: a Custom Exam question's section gets its time limit from CUSTOM_EXAM_PROFILE, not the DAT-only 30-minute fallback", () => {
    const built = fakeBuiltExam([fakeQuestion({ section: "general" })]);
    const exam = builtExamToGeneratedExam(built, 60, "full-dat", CUSTOM_EXAM_PROFILE);
    const section = exam.config.sections.find((s) => s.sectionId === "general");
    expect(section?.timeLimit).toBe(CUSTOM_EXAM_PROFILE.sections[0].defaultTimeLimitMinutes);
    expect(section?.timeLimit).toBe(60);
  });

  it("DAT sections are unaffected — resolve to the same DAT_SECTIONS-derived value whether or not a profile is passed", () => {
    const built = fakeBuiltExam([fakeQuestion({ section: "survey-natural-sciences", examProfileId: "dat" })]);
    const withProfile = builtExamToGeneratedExam(built, 100, "full-dat", DAT_EXAM_PROFILE);
    const withoutProfile = builtExamToGeneratedExam(built, 100, "full-dat");
    expect(withProfile.config.sections[0].timeLimit).toBeGreaterThan(0);
    expect(withProfile.config.sections[0].timeLimit).toBe(withoutProfile.config.sections[0].timeLimit);
  });

  it("falls back to 30 minutes only when neither the profile nor DAT_SECTIONS recognizes the section id (no profile passed)", () => {
    const built = fakeBuiltExam([fakeQuestion({ section: "totally-unknown-section" })]);
    const exam = builtExamToGeneratedExam(built, 60, "full-dat");
    expect(exam.config.sections[0].timeLimit).toBe(30);
  });
});

describe("generateFullSimulationExam — question count derives from the profile's own sections", () => {
  const mockBuildExam = buildExam as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockBuildExam.mockImplementation(async (opts: { questionCount: number }) =>
      fakeBuiltExam(Array.from({ length: Math.min(opts.questionCount, 5) }, (_, i) => fakeQuestion({ id: `q${i}` }))),
    );
  });

  it("REQUIRED: requests Custom Exam's real section size (20), not DAT's hardcoded 280", async () => {
    await generateFullSimulationExam("book-1", "Book", CUSTOM_EXAM_PROFILE);
    expect(mockBuildExam).toHaveBeenCalledWith(expect.objectContaining({ questionCount: 20 }));
  });

  it("DAT's derived total is unchanged — still 280 (100+90+50+40), matching the previous hardcoded value", async () => {
    await generateFullSimulationExam("book-1", "Book", DAT_EXAM_PROFILE);
    expect(mockBuildExam).toHaveBeenCalledWith(expect.objectContaining({ questionCount: 280 }));
  });
});
