// tests/examEngine/legacyAdapterMisconception.test.ts
// C7 (Phase 0 audit) — EngineQuestion.misconceptionTested (generation-time
// metadata: the misconception a wrong answer would reveal) used to be
// dropped at the EngineQuestion -> DATQuestion boundary, same way
// sourceEvidence still is — DATQuestion had no field to carry it, so
// lib/datApex/datLearningState.ts had no way to fire misconception-observed
// even though that event kind's reducer already existed. Locks in that it
// now survives the conversion, matching the existing pattern already
// verified for examProfileId (tests/apex/resultsPageProfileIdentity.test.ts).
//
// Real behavioral test — engineQuestionToDATQuestion is a pure function.

import { engineQuestionToDATQuestion } from "@/lib/examEngine/legacyAdapter";
import type { EngineQuestion } from "@/lib/examEngine/types";

function fixtureEngineQuestion(overrides: Partial<EngineQuestion> = {}): EngineQuestion {
  return {
    id: "q1",
    examProfileId: "dat",
    section: "survey-natural-sciences",
    subject: "Biology",
    unit: "Cell Biology",
    topic: "Osmosis",
    concept: "Water potential",
    difficulty: "simulation",
    questionType: "recognition",
    skillTested: "identify direction of water movement",
    sourceBookId: "campbell-biology",
    stem: "Which direction does water move?",
    choices: ["Into the cell", "Out of the cell", "No movement", "Cannot be determined"],
    correctIndex: 0,
    whyCorrect: "because",
    whyWrong: ["", "wrong", "wrong", "wrong"],
    createdAt: new Date(0).toISOString(),
    ...overrides,
  };
}

describe("engineQuestionToDATQuestion — misconceptionTested survives the conversion", () => {
  it("REQUIRED: carries misconceptionTested through when present", () => {
    const q = fixtureEngineQuestion({ misconceptionTested: "confuses osmosis with diffusion" });
    const dat = engineQuestionToDATQuestion(q);
    expect(dat.misconceptionTested).toBe("confuses osmosis with diffusion");
  });

  it("stays undefined when the generator didn't produce one — nothing fabricated", () => {
    const q = fixtureEngineQuestion({ misconceptionTested: undefined });
    const dat = engineQuestionToDATQuestion(q);
    expect(dat.misconceptionTested).toBeUndefined();
  });
});
