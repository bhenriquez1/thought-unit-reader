// lib/datApex/datLearningState.ts
// X3 — DAT Apex activity begins writing into the SAME shared Learning State
// engine (recordLearningEvent/applyLearningEvent/saveNodeProgress) the
// adult Reader, Recall, and Elena Mode already use, via the
// "dat-question-answered" event kind — already fully defined and reducer-
// tested in lib/knowledge/learningStateEvents.ts since an earlier phase,
// but never called from anywhere until now.
//
// Scope note: this is intentionally additive, not a consolidation of DAT
// Apex's four existing scoring/readiness systems (lib/apex/apexScoringEngine.ts
// + lib/stores/apexEngineStore.ts, lib/datApex/scoring.ts +
// readinessUpdater.ts, lib/examEngine/weaknessAnalytics.ts). All four keep
// running exactly as before. A full consolidation onto one shared model is a
// larger migration — those four systems use three disjoint storage
// technologies (IDB, localStorage×2 shapes) and zero shared types today,
// with no existing test coverage on any of them, so rewriting them without
// the ability to verify DAT Apex live in this environment would risk
// silently corrupting real scoring data. This starts the shared-engine path
// for the one case that's safe to add without touching the others: grounded
// (AI-generated, X2-provenance) questions get a real Learning State write
// alongside whatever the legacy systems already do.
//
// Only questions carrying real grounding (sourceBookId + sourceThoughtUnitIds
// — populated exclusively for AI-generated questions via the Universal Exam
// Engine bridge, see types/apex-exam.ts's DATQuestion) produce a write;
// legacy static-question-bank questions have neither field and are silently
// skipped — there is no canonical unit to attribute their performance to.

import { recordLearningEvent } from "@/lib/knowledge/recordLearningEvent";
import type { DATQuestion } from "@/types/apex-exam";

interface DatResponseLike {
  questionId: string;
  /** null means the question was left unanswered — no evidence of
   *  correctness to record, so recordDatAttemptLearningState skips it. */
  selectedChoiceId: string | null;
}

/** Records one grounded question's answer as a Learning State event on
 *  every CanonicalThoughtUnit it was generated from. No-ops (not an error)
 *  for a question with no grounding. */
export async function recordDatQuestionAnswered(
  question: DATQuestion,
  correct: boolean,
  occurredAt: string,
): Promise<void> {
  const documentId = question.sourceBookId;
  const unitIds = question.sourceThoughtUnitIds;
  if (!documentId || !unitIds || unitIds.length === 0) return;

  await Promise.all(
    unitIds.map((unitId) =>
      recordLearningEvent(unitId, documentId, {
        kind: "dat-question-answered",
        correct,
        timeMs: null,
        occurredAt,
        sourceId: question.id,
      }),
    ),
  );
}

/** Records Learning State events for every response in a submitted attempt.
 *  Fire-and-forget from the caller's perspective — a single question's
 *  write failure never blocks the others. */
export async function recordDatAttemptLearningState(
  questions: DATQuestion[],
  responses: DatResponseLike[],
  occurredAt: string,
): Promise<void> {
  const byId = new Map(questions.map((q) => [q.id, q]));
  await Promise.all(
    responses.map((r) => {
      if (r.selectedChoiceId === null) return Promise.resolve();
      const q = byId.get(r.questionId);
      if (!q) return Promise.resolve();
      const correct = r.selectedChoiceId === q.correctAnswer;
      return recordDatQuestionAnswered(q, correct, occurredAt).catch(() => {});
    }),
  );
}
