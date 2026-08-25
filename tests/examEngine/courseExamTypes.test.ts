// tests/examEngine/courseExamTypes.test.ts
// C6 (Phase 0 audit) — COURSE_EXAM_TYPES maps the roadmap's four Course Exam
// types onto the already-generic ExamScope/PracticeMode systems, rather than
// inventing a new pipeline concept. Locks in that all four exist, each maps
// to a real ExamScope id and a real PracticeMode id (both already tested
// elsewhere — examScope.test.ts, bookCatalogue's PRACTICE_MODES), and that
// every questionCount fits inside its mapped PracticeMode's questionRange
// (otherwise the generator's slider would silently clamp the type's own
// preset the instant it renders).

import { COURSE_EXAM_TYPES } from "@/lib/examEngine/courseExamTypes";
import { EXAM_SCOPE_OPTIONS } from "@/lib/examEngine/examScope";
import { PRACTICE_MODES } from "@/lib/apex/bookCatalogue";

describe("COURSE_EXAM_TYPES", () => {
  it("REQUIRED: has exactly the four roadmap types, in order", () => {
    expect(COURSE_EXAM_TYPES.map((t) => t.id)).toEqual([
      "chapter-quiz",
      "unit-exam",
      "midterm",
      "cumulative-final",
    ]);
  });

  it("REQUIRED: every type's scope is a real, known ExamScope id", () => {
    const validScopes = new Set(EXAM_SCOPE_OPTIONS.map((o) => o.id));
    for (const type of COURSE_EXAM_TYPES) {
      expect(validScopes.has(type.scope)).toBe(true);
    }
  });

  it("REQUIRED: every type's practiceMode is a real, known PracticeMode id", () => {
    const validModes = new Set(PRACTICE_MODES.map((m) => m.id));
    for (const type of COURSE_EXAM_TYPES) {
      expect(validModes.has(type.practiceMode)).toBe(true);
    }
  });

  it("REQUIRED: every type's questionCount fits inside its mapped PracticeMode's questionRange", () => {
    for (const type of COURSE_EXAM_TYPES) {
      const mode = PRACTICE_MODES.find((m) => m.id === type.practiceMode)!;
      const [min, max] = mode.questionRange;
      expect(type.questionCount).toBeGreaterThanOrEqual(min);
      expect(type.questionCount).toBeLessThanOrEqual(max);
    }
  });

  it("chapter-quiz and unit-exam scope to selected-chapters — the student must actually pick material for a chapter-scale exam", () => {
    const chapterQuiz = COURSE_EXAM_TYPES.find((t) => t.id === "chapter-quiz")!;
    const unitExam = COURSE_EXAM_TYPES.find((t) => t.id === "unit-exam")!;
    expect(chapterQuiz.scope).toBe("selected-chapters");
    expect(unitExam.scope).toBe("selected-chapters");
  });

  it("cumulative-final scopes to entire-book — a final covers the whole course", () => {
    expect(COURSE_EXAM_TYPES.find((t) => t.id === "cumulative-final")!.scope).toBe("entire-book");
  });

  it("chapter-quiz is untimed (practice mode) — a quick check, not exam conditions", () => {
    expect(COURSE_EXAM_TYPES.find((t) => t.id === "chapter-quiz")!.practiceMode).toBe("practice");
  });
});
