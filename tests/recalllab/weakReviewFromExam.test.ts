// tests/recalllab/weakReviewFromExam.test.ts
// P1 fix — the post-exam "Open in Recall Lab" recommendation used to build
// its deck exclusively from buildWeakTopicReviewSet(existingSets), which
// aggregates cards already marked missed inside PRIOR Recall sessions. The
// exam this recommendation is actually FOR never fed into card selection at
// all: a student with zero existing Recall history got no weak-review deck,
// and a student who did have history got a deck built from unrelated past
// misses instead of the exam they just took ("Avrrio Master Audit," item 37
// — TestLab → Recall). buildRecallSetFromWrongAnswers builds the deck
// directly from THIS exam's wrong answers instead.

import { buildRecallSetFromWrongAnswers, type WrongAnswerForReview } from "../../lib/recalllab/recallStore";
import fs from "fs";
import path from "path";

function wrongAnswer(overrides: Partial<WrongAnswerForReview> & { questionId: string }): WrongAnswerForReview {
  return {
    stem: `Stem for ${overrides.questionId}`,
    correctAnswerText: "The correct choice",
    explanation: "Because of X.",
    topic: "Cell Biology",
    ...overrides,
  };
}

describe("buildRecallSetFromWrongAnswers — real cards from this exam's own wrong answers", () => {
  it("REQUIRED: a perfect-score exam (no wrong answers) produces no weak-review set at all — never falls back to unrelated history", () => {
    expect(buildRecallSetFromWrongAnswers("book-1", [])).toBeNull();
  });

  it("REQUIRED: each wrong answer becomes a card whose front is the actual question stem, not a generic prompt", () => {
    const set = buildRecallSetFromWrongAnswers("book-1", [
      wrongAnswer({ questionId: "q1", stem: "What organelle produces ATP?" }),
    ]);
    expect(set?.cards[0].front).toBe("What organelle produces ATP?");
  });

  it("REQUIRED: the card's back combines the real correct answer and its explanation, not a placeholder", () => {
    const set = buildRecallSetFromWrongAnswers("book-1", [
      wrongAnswer({ questionId: "q1", correctAnswerText: "Mitochondria", explanation: "It performs oxidative phosphorylation." }),
    ]);
    expect(set?.cards[0].back).toBe("Mitochondria\n\nIt performs oxidative phosphorylation.");
  });

  it("a missing explanation still produces a usable card — just the correct answer, no dangling separator", () => {
    const set = buildRecallSetFromWrongAnswers("book-1", [
      wrongAnswer({ questionId: "q1", correctAnswerText: "Mitochondria", explanation: "" }),
    ]);
    expect(set?.cards[0].back).toBe("Mitochondria");
  });

  it("REQUIRED: every card is marked isMissed and tagged with its real topic — this is a weak-review deck, not a generic study set", () => {
    const set = buildRecallSetFromWrongAnswers("book-1", [wrongAnswer({ questionId: "q1", topic: "Genetics" })]);
    expect(set?.cards[0].isMissed).toBe(true);
    expect(set?.cards[0].tag).toBe("Genetics");
    expect(set?.cards[0].type).toBe("weak-review");
  });

  it("multiple wrong answers each become their own distinct card", () => {
    const set = buildRecallSetFromWrongAnswers("book-1", [
      wrongAnswer({ questionId: "q1" }),
      wrongAnswer({ questionId: "q2" }),
      wrongAnswer({ questionId: "q3" }),
    ]);
    expect(set?.cards).toHaveLength(3);
    expect(new Set(set?.cards.map(c => c.id)).size).toBe(3);
  });
});

describe("lib/examEngine/recommendationEngine.ts — wires the exam's own wrong answers into the recall deck", () => {
  const SRC = fs.readFileSync(path.resolve(__dirname, "../../lib/examEngine/recommendationEngine.ts"), "utf8");

  it("REQUIRED: buildStudyRecommendation accepts wrongAnswers and builds the deck from buildRecallSetFromWrongAnswers, not buildWeakTopicReviewSet", () => {
    expect(SRC).toMatch(/import \{ buildRecallSetFromWrongAnswers, saveRecallSet, type WrongAnswerForReview \} from "@\/lib\/recalllab\/recallStore";/);
    const idx = SRC.indexOf("export async function buildStudyRecommendation(");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 2200);
    expect(block).toMatch(/wrongAnswers: WrongAnswerForReview\[\] = \[\],/);
    expect(block).toMatch(/buildRecallSetFromWrongAnswers\(bookId, wrongAnswers, \{ bookTitle: notes\[0\]\?\.bookTitle \}\)/);
    // buildWeakTopicReviewSet may still appear in an explanatory comment
    // (what this function used to do) — it must never appear as a live call.
    expect(block).not.toMatch(/= buildWeakTopicReviewSet\(/);
    expect(block).not.toMatch(/getRecallSetsByBook\(/);
  });
});

describe("app/apex/results/page.tsx — passes this exam's real wrong answers, not existing Recall history", () => {
  const SRC = fs.readFileSync(path.resolve(__dirname, "../../app/apex/results/page.tsx"), "utf8");

  it("REQUIRED: builds wrongAnswers from responses that don't match the question's correctAnswer, using the exam's own question stem/explanation", () => {
    const idx = SRC.indexOf("const wrongAnswers: WrongAnswerForReview[] =");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 700);
    expect(block).toMatch(/r\.selectedAnswer && r\.selectedAnswer !== results\.exam\.questions\.find\(\(q\) => q\.id === r\.questionId\)\?\.correctAnswer/);
    expect(block).toMatch(/correctAnswerText: q\.options\[q\.correctAnswer\] \?\? q\.correctAnswer,/);
    expect(block).toMatch(/explanation: q\.explanation,/);
  });

  it("REQUIRED: the built wrongAnswers array is actually passed into buildStudyRecommendation", () => {
    expect(SRC).toMatch(/buildStudyRecommendation\(report, activeProfile, bookId, wrongAnswers\)/);
  });
});
