// tests/api/examQuestionGenGrounding.test.ts
// X2 — pages/api/exam-question-gen.ts's groundAndNormalizeQuestions is the
// real rejection gate: a raw AI question survives only if its claimed
// sourceQuote is a verifiable substring of the request's conceptText.
// Exported directly for testability, matching the same precedent as
// professor-lesson-plan.ts's professorCompletionBudget.

import { groundAndNormalizeQuestions, type RequestBody, type RawQuestion } from "@/pages/api/exam-question-gen";
import { QUESTION_GENERATOR_VERSION } from "@/lib/examEngine/questionGrounding";

const CONCEPT_TEXT =
  "The mitochondria is the powerhouse of the cell. It produces ATP through cellular respiration, " +
  "a process that occurs primarily in the inner membrane. Enzymes embedded in the membrane drive the electron transport chain.";

function baseRequest(overrides: Partial<RequestBody> = {}): RequestBody {
  return {
    examProfileId: "dat",
    bookId: "doc-1",
    conceptId: "note-1",
    conceptText: CONCEPT_TEXT,
    topic: "Cell Biology",
    questionType: "recognition",
    difficulty: "foundation",
    ...overrides,
  };
}

function groundedQuestion(overrides: Partial<RawQuestion> = {}): RawQuestion {
  return {
    stem: "What organelle produces ATP for the cell?",
    choices: ["Mitochondria", "Nucleus", "Ribosome", "Golgi apparatus"],
    correctIndex: 0,
    whyCorrect: "The mitochondria performs cellular respiration.",
    whyWrong: ["", "The nucleus stores genetic material.", "Ribosomes synthesize proteins.", "The Golgi apparatus packages proteins."],
    skillTested: "Organelle function",
    sourceQuote: "The mitochondria is the powerhouse of the cell.",
    ...overrides,
  };
}

describe("groundAndNormalizeQuestions — the X2 rejection gate", () => {
  it("REQUIRED: accepts a question whose sourceQuote is real, stamping sourceEvidence/generatorVersion/pageTruthKey", () => {
    const req = baseRequest({ pageTruthKey: "doc-1::3::t" });
    const { questions, rejectedCount } = groundAndNormalizeQuestions({ questions: [groundedQuestion()] }, req, 5);
    expect(rejectedCount).toBe(0);
    expect(questions).toHaveLength(1);
    expect(questions[0].sourceEvidence).toEqual(["The mitochondria is the powerhouse of the cell."]);
    expect(questions[0].generatorVersion).toBe(QUESTION_GENERATOR_VERSION);
    expect(questions[0].pageTruthKey).toBe("doc-1::3::t");
  });

  it("REQUIRED: rejects a question whose sourceQuote is fabricated (not present in conceptText)", () => {
    const req = baseRequest();
    const { questions, rejectedCount } = groundAndNormalizeQuestions(
      { questions: [groundedQuestion({ sourceQuote: "Photosynthesis converts sunlight into chemical energy in chloroplasts." })] },
      req, 5,
    );
    expect(questions).toHaveLength(0);
    expect(rejectedCount).toBe(1);
  });

  it("REQUIRED: rejects a question with no sourceQuote at all", () => {
    const req = baseRequest();
    const { questions, rejectedCount } = groundAndNormalizeQuestions(
      { questions: [groundedQuestion({ sourceQuote: undefined })] },
      req, 5,
    );
    expect(questions).toHaveLength(0);
    expect(rejectedCount).toBe(1);
  });

  it("grounded and ungrounded questions in the same batch are filtered independently — one bad question doesn't sink the batch", () => {
    const req = baseRequest();
    const { questions, rejectedCount } = groundAndNormalizeQuestions(
      {
        questions: [
          groundedQuestion(),
          groundedQuestion({ sourceQuote: "This fact does not appear anywhere in the source." }),
        ],
      },
      req, 5,
    );
    expect(questions).toHaveLength(1);
    expect(rejectedCount).toBe(1);
  });

  it("shape validation still applies before grounding — malformed choices are dropped without counting as a grounding rejection", () => {
    const req = baseRequest();
    const { questions, rejectedCount } = groundAndNormalizeQuestions(
      { questions: [groundedQuestion({ choices: ["only one choice"] })] },
      req, 5,
    );
    expect(questions).toHaveLength(0);
    expect(rejectedCount).toBe(0);
  });

  it("caps output at the requested fallbackCount", () => {
    const req = baseRequest();
    const many = Array.from({ length: 5 }, () => groundedQuestion());
    const { questions } = groundAndNormalizeQuestions({ questions: many }, req, 2);
    expect(questions).toHaveLength(2);
  });
});
