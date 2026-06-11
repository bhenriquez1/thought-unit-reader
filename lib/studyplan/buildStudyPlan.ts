// lib/studyplan/buildStudyPlan.ts
// Deterministic helpers that turn a scored diagnostic into weak topics, and
// weak topics into a study plan that links back to existing NoteLab notes,
// RecallLab sets, and Study Guide Lab records for the same book.

import type { UltraNote } from "@/lib/notelab/ultraNoteStore";
import type { RecallSet } from "@/lib/recalllab/recallStore";
import type { StudyGuideRecord } from "@/lib/studyguide/types";
import type {
  DiagnosticAnswer,
  DiagnosticAttempt,
  DiagnosticQuestion,
  StudyPlanAction,
  StudyPlanBlock,
  StudyPlanRecord,
  WeakTopic,
} from "./types";

/** Loose topic match — exact match, or shared significant word (len > 3). */
function topicMatches(a: string, b: string): boolean {
  const an = (a || "").toLowerCase().trim();
  const bn = (b || "").toLowerCase().trim();
  if (!an || !bn) return false;
  if (an === bn) return true;
  const aWords = new Set(an.split(/\W+/).filter(w => w.length > 3));
  const bWords = bn.split(/\W+/).filter(w => w.length > 3);
  return bWords.some(w => aWords.has(w));
}

export function computeWeakTopics(
  questions: DiagnosticQuestion[],
  answers: DiagnosticAnswer[],
): WeakTopic[] {
  const byTopic = new Map<string, WeakTopic>();
  for (const q of questions) {
    const ans = answers.find(a => a.questionId === q.id);
    const entry = byTopic.get(q.topic) ?? { topic: q.topic, missed: 0, total: 0, pages: [] };
    entry.total += 1;
    if (!ans || !ans.correct) entry.missed += 1;
    if (q.page && !entry.pages.includes(q.page)) entry.pages.push(q.page);
    byTopic.set(q.topic, entry);
  }
  return Array.from(byTopic.values())
    .filter(t => t.missed > 0)
    .sort((a, b) => (b.missed / b.total) - (a.missed / a.total));
}

export function buildStudyPlan(
  attempt: DiagnosticAttempt,
  notes: UltraNote[],
  recallSets: RecallSet[],
  guides: StudyGuideRecord[],
): StudyPlanRecord {
  const weakTopics = attempt.weakTopics.length > 0
    ? attempt.weakTopics
    : computeWeakTopics(attempt.questions, attempt.answers);

  const blocks: StudyPlanBlock[] = weakTopics.map((wt, i) => {
    const actions: StudyPlanAction[] = [];
    const firstPage = wt.pages[0];

    if (firstPage) {
      actions.push({ type: "read_page", label: `Re-read page ${firstPage} in the book`, page: firstPage });
    }

    const note = notes.find(n => topicMatches(wt.topic, n.topic) || wt.pages.includes(n.pageNumber));
    if (note) {
      actions.push({
        type: "review_note",
        label: `Review NoteLab notes: "${note.topic}"`,
        page: note.pageNumber,
        refId: note.id,
      });
    }

    const recall = recallSets.find(r => topicMatches(wt.topic, r.topic) || wt.pages.includes(r.pageNumber));
    if (recall) {
      actions.push({
        type: "review_recall",
        label: `Drill RecallLab set: "${recall.topic}" (${recall.cards.length} cards)`,
        page: recall.pageNumber,
        refId: recall.id,
      });
    }

    const guide = guides.find(g => topicMatches(wt.topic, g.topic) || topicMatches(wt.topic, g.chapterTitle));
    if (guide) {
      actions.push({
        type: "review_guide",
        label: `Read Study Guide section: "${guide.topic || guide.chapterTitle}"`,
        refId: guide.id,
      });
    }

    actions.push({
      type: "practice",
      label: `Answer ${Math.min(5, wt.missed + 2)} practice questions on ${wt.topic}`,
    });

    return {
      id: `spb-${attempt.id}-${i}`,
      title: `Day ${i + 1} — ${wt.topic}`,
      topic: wt.topic,
      pages: wt.pages,
      actions,
      estimatedMinutes: 20 + wt.missed * 5,
    };
  });

  return {
    id: `sp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    bookId: attempt.bookId,
    bookTitle: attempt.bookTitle,
    createdAt: Date.now(),
    diagnosticId: attempt.id,
    weakTopics,
    blocks,
  };
}
