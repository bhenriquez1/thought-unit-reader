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
// Only questions carrying real grounding (sourceBookId + sourceKnowledgeNodeIds
// — populated exclusively for AI-generated questions via the Universal Exam
// Engine bridge, see types/apex-exam.ts's DATQuestion) produce a write;
// legacy static-question-bank questions have neither field and are skipped —
// there is no Knowledge Graph node to attribute their performance to.
//
// TestLab-Reader progress integration — this used to key Learning State
// writes on question.sourceThoughtUnitIds, but recordLearningEvent's first
// argument is a Knowledge Graph NODE id (it calls getNodeProgress/
// saveNodeProgress, which are keyed by KnowledgeNodeProgress.nodeId — see
// lib/knowledge/recordLearningEvent.ts). CanonicalThoughtUnit ids and
// KnowledgeNode ids are different id spaces in this app, so every prior
// write here was silently creating an orphaned KnowledgeNodeProgress record
// under a thought-unit id that no real node ever has — invisible to Reader,
// Recall, or any other Learning State reader. Now keyed on the real
// sourceKnowledgeNodeIds (lib/examEngine/examBuilder.ts populates these from
// the same nodes Reader's resolveOrCreateNode creates), so a weak answer
// here actually lands on the node Reader/Recall already track.
//
// timeMs stays null — the proctor UI (app/apex/proctor/page.tsx) does not
// currently capture per-question timing, only per-section time remaining;
// wiring true per-question timeMs would mean instrumenting the live timed-
// exam clock, which is out of scope for this pass to avoid destabilizing
// exam timing mechanics without the ability to verify them live.
//
// Write failures are no longer silently swallowed: recordDatAttemptLearningState
// returns a { written, failed } summary so the caller can log/surface a
// failure instead of a blanket .catch(() => {}).

import { recordLearningEvent } from "@/lib/knowledge/recordLearningEvent";
import type { DATQuestion } from "@/types/apex-exam";

interface DatResponseLike {
  questionId: string;
  /** null means the question was left unanswered — no evidence of
   *  correctness to record, so recordDatAttemptLearningState skips it. */
  selectedChoiceId: string | null;
}

export interface LearningStateWriteSummary {
  written: number;
  failed: number;
}

/** Records one grounded question's answer as a Learning State event on
 *  every Knowledge Graph node it was resolved against. No-ops (not an
 *  error) for a question with no grounding. Throws if any individual node
 *  write fails, so callers can count/report it — never silently dropped. */
export async function recordDatQuestionAnswered(
  question: DATQuestion,
  correct: boolean,
  occurredAt: string,
): Promise<void> {
  const documentId = question.sourceBookId;
  const nodeIds = question.sourceKnowledgeNodeIds;
  if (!documentId || !nodeIds || nodeIds.length === 0) return;

  await Promise.all(
    nodeIds.map((nodeId) =>
      recordLearningEvent(nodeId, documentId, {
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
 *  A single question's write failure never blocks the others (each is
 *  caught individually), but IS counted and returned — callers must not
 *  blanket-swallow the result the way this used to be called. */
export async function recordDatAttemptLearningState(
  questions: DATQuestion[],
  responses: DatResponseLike[],
  occurredAt: string,
): Promise<LearningStateWriteSummary> {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const results = await Promise.all(
    responses.map(async (r) => {
      if (r.selectedChoiceId === null) return null;
      const q = byId.get(r.questionId);
      if (!q) return null;
      const correct = r.selectedChoiceId === q.correctAnswer;
      try {
        await recordDatQuestionAnswered(q, correct, occurredAt);
        return true;
      } catch {
        return false;
      }
    }),
  );
  const attempted = results.filter((r) => r !== null) as boolean[];
  return {
    written: attempted.filter(Boolean).length,
    failed:  attempted.filter((ok) => !ok).length,
  };
}
