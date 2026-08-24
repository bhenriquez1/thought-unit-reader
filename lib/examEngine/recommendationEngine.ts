// lib/examEngine/recommendationEngine.ts
// Post-exam study recommendations: weakest topics, highest-return topic,
// Reader page deep links, a Recall Lab weak-topic review set built directly
// from this exam's own wrong answers (buildRecallSetFromWrongAnswers — P1
// fix, see the comment on buildStudyRecommendation's wrongAnswers param),
// and a Podcast Lab deep link. Podcast Lab's exam_cram/quiz_podcast modes
// are single-page only today, so this only deep-links the weakest topic's
// source page in page_review mode — a true cross-topic cram episode is a
// known follow-up, not silently built.

import { getNotesByBook } from "@/lib/notelab/ultraNoteStore";
import { buildRecallSetFromWrongAnswers, saveRecallSet, type WrongAnswerForReview } from "@/lib/recalllab/recallStore";
import type { ExamProfile, StudyRecommendation, TopicAccuracy, WeaknessReport } from "@/lib/examEngine/types";

export type { WrongAnswerForReview };

const WEAKEST_COUNT = 3;

function highestReturnTopic(weakestTopics: TopicAccuracy[], profile: ExamProfile): string | null {
  if (weakestTopics.length === 0) return null;
  let best: { topic: string; score: number } | null = null;
  for (const t of weakestTopics) {
    const blueprint = profile.topicBlueprint.find((b) => b.topic.toLowerCase() === t.topic.toLowerCase());
    const weight = blueprint?.weight ?? 0.05;
    const score = (100 - t.percent) * weight;
    if (!best || score > best.score) best = { topic: t.topic, score };
  }
  return best?.topic ?? null;
}

function buildNarrative(report: WeaknessReport): string {
  if (report.weakestTopics.length === 0) {
    return "Not enough attempts yet to diagnose a weak topic — keep practicing to unlock a personalized study plan.";
  }
  const parts = report.weakestTopics.slice(0, WEAKEST_COUNT).map((t) => `${t.topic} accuracy ${t.percent}%`);
  const strongest = report.strongestTopics[0];
  let narrative = `Weakest areas: ${parts.join("; ")}.`;
  if (strongest) {
    narrative += ` Compare to ${strongest.topic} at ${strongest.percent}% — focus study time on the gap.`;
  }
  return narrative;
}

export async function buildStudyRecommendation(
  report: WeaknessReport,
  profile: ExamProfile,
  bookId: string,
  // P1 fix — this used to build the "Open in Recall Lab" deck exclusively
  // from buildWeakTopicReviewSet(existingSets), which aggregates cards
  // already marked missed inside PRIOR Recall sessions — the exam this
  // recommendation is actually FOR never fed into card selection at all.
  // Passing the exam's own wrong answers here (results/page.tsx has the
  // real question stem/explanation text for each miss) lets the deck be
  // built from what the student just got wrong, not unrelated history.
  wrongAnswers: WrongAnswerForReview[] = [],
): Promise<StudyRecommendation> {
  const weakestTopics = report.weakestTopics.slice(0, WEAKEST_COUNT).map((t) => t.topic);
  const notes = getNotesByBook(bookId);

  const readerPages = report.weakestTopics
    .slice(0, WEAKEST_COUNT)
    .map((t) => {
      const note = notes.find(
        (n) => n.topic.toLowerCase() === t.topic.toLowerCase() || n.topic.toLowerCase().includes(t.topic.toLowerCase()),
      );
      return note ? { bookId, pageNumber: note.pageNumber, topic: t.topic } : null;
    })
    .filter((p): p is { bookId: string; pageNumber: number; topic: string } => p !== null);

  // A perfect-score exam has nothing to build a weak-review deck from —
  // recallSetId stays null rather than surfacing an unrelated prior deck.
  let recallSetId: string | null = null;
  const weakSet = buildRecallSetFromWrongAnswers(bookId, wrongAnswers, { bookTitle: notes[0]?.bookTitle });
  if (weakSet) {
    await saveRecallSet(weakSet);
    recallSetId = weakSet.id;
  }

  const podcastDeepLink = readerPages[0]
    ? { bookId, pageNumber: readerPages[0].pageNumber, mode: "page_review" as const }
    : null;

  const nextExamMode: StudyRecommendation["nextExamMode"] =
    report.weakestTopics.length > WEAKEST_COUNT * 2 ? "foundation"
    : report.weakestTopics.length > 0 ? "simulation"
    : "mastery";

  return {
    bookId,
    generatedAt: new Date().toISOString(),
    weakestTopics,
    highestReturnTopic: highestReturnTopic(report.weakestTopics, profile),
    readerPages,
    recallSetId,
    podcastDeepLink,
    nextExamMode,
    narrative: buildNarrative(report),
  };
}
