// lib/examEngine/examBuilder.ts
// Builds an exam from a book's UltraNotes, replacing the old
// ExamGenerator.fromQuestionBank() static-JSON flow. Adapts
// lib/apex/examGenerator.ts's selection logic (randomize, per-exam question
// count) but sources EngineQuestions from the AI-generated, IndexedDB-cached
// pool (questionGenerator.ts) instead of a static question bank.

import { getNotesByBook } from "@/lib/notelab/ultraNoteStore";
import type { UltraNote } from "@/lib/notelab/ultraNoteStore";
import { getOrGenerateQuestions } from "@/lib/examEngine/questionGenerator";
import type { DifficultyLevel, EngineQuestion, ExamProfile, QuestionType } from "@/lib/examEngine/types";

export interface ExamBuildOptions {
  bookId: string;
  bookTitle?: string;
  profile: ExamProfile;
  difficulty: DifficultyLevel;
  questionCount: number;
  sectionIds?: string[];          // subset of profile.sections to include; default all
  questionTypes?: QuestionType[]; // default profile.questionTypes
  randomize?: boolean;
  /** Filter notes to these inclusive page ranges (chapter selection). */
  chapterPageRanges?: { start: number; end: number }[];
  practiceMode?: 'practice' | 'practice-exam' | 'full-dat';
}

export interface BuiltExam {
  id: string;
  examProfileId: string;
  bookId: string;
  difficulty: DifficultyLevel;
  questions: EngineQuestion[];
  metadata: {
    generatedAt: string;
    totalQuestions: number;
    conceptsUsed: number;
    sectionBreakdown: Record<string, number>;
    questionTypeBreakdown: Record<string, number>;
  };
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function genId(): string {
  return `exam-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Aggregates one UltraNote's teaching content into grounding text for the
 *  AI question generator — never a static/copyrighted question bank. */
function buildConceptText(note: UltraNote): string {
  const parts: string[] = [];
  if (note.pageThesis) parts.push(note.pageThesis);
  if (note.coreIdea) parts.push(note.coreIdea);
  for (const c of note.concepts) {
    parts.push(`${c.title}: ${c.pattern} | Rule: ${c.rule} | Trap: ${c.trap}`);
  }
  for (const s of note.sections ?? []) {
    parts.push(`${s.label}: ${s.content}`);
  }
  for (const nc of note.noteCards ?? []) {
    parts.push(nc.body);
  }
  return parts.join("\n\n");
}

/** Maps an UltraNote's free-form topic to the closest profile section id by
 *  matching against topicBlueprint topic labels; falls back to the profile's
 *  first section if nothing matches. */
function matchSection(note: UltraNote, profile: ExamProfile): string {
  const lowerTopic = note.topic?.toLowerCase() ?? "";
  const blueprintMatch = profile.topicBlueprint.find(
    (b) => lowerTopic.includes(b.topic.toLowerCase()) || b.topic.toLowerCase().includes(lowerTopic),
  );
  if (blueprintMatch) return blueprintMatch.section;
  return profile.sections[0]?.id ?? "general";
}

export async function buildExam(opts: ExamBuildOptions): Promise<BuiltExam> {
  const notes = getNotesByBook(opts.bookId);
  const sectionIds = opts.sectionIds?.length ? opts.sectionIds : opts.profile.sections.map((s) => s.id);
  const questionTypes = opts.questionTypes?.length ? opts.questionTypes : opts.profile.questionTypes;

  const eligibleNotes = notes.filter((n) => sectionIds.includes(matchSection(n, opts.profile)));
  let pool = eligibleNotes.length > 0 ? eligibleNotes : notes;

  // Narrow to selected chapters when the generator provided page ranges.
  if (opts.chapterPageRanges?.length) {
    const chapterFiltered = pool.filter((n) =>
      opts.chapterPageRanges!.some(
        (r) => n.pageNumber >= r.start && n.pageNumber <= r.end,
      ),
    );
    if (chapterFiltered.length > 0) pool = chapterFiltered;
  }

  if (pool.length === 0) {
    return {
      id: genId(),
      examProfileId: opts.profile.id,
      bookId: opts.bookId,
      difficulty: opts.difficulty,
      questions: [],
      metadata: {
        generatedAt: new Date().toISOString(),
        totalQuestions: 0,
        conceptsUsed: 0,
        sectionBreakdown: {},
        questionTypeBreakdown: {},
      },
    };
  }

  // Distribute the requested count evenly across concepts, cycling question
  // types so coverage isn't biased toward one type.
  const perConcept = Math.max(1, Math.ceil(opts.questionCount / pool.length));
  const batches = await Promise.all(
    pool.map((note, i) => {
      const questionType = questionTypes[i % questionTypes.length];
      const section = matchSection(note, opts.profile);
      return getOrGenerateQuestions({
        examProfileId: opts.profile.id,
        bookId: opts.bookId,
        bookTitle: opts.bookTitle,
        conceptId: note.id,
        conceptText: buildConceptText(note),
        topic: note.topic,
        section,
        sourcePageNumber: note.pageNumber,
        questionType,
        difficulty: opts.difficulty,
        count: perConcept,
      });
    }),
  );

  let questions = batches.flat();
  if (opts.randomize ?? true) questions = shuffle(questions);
  questions = questions.slice(0, opts.questionCount);

  const sectionBreakdown: Record<string, number> = {};
  const questionTypeBreakdown: Record<string, number> = {};
  for (const q of questions) {
    sectionBreakdown[q.section] = (sectionBreakdown[q.section] ?? 0) + 1;
    questionTypeBreakdown[q.questionType] = (questionTypeBreakdown[q.questionType] ?? 0) + 1;
  }

  return {
    id: genId(),
    examProfileId: opts.profile.id,
    bookId: opts.bookId,
    difficulty: opts.difficulty,
    questions,
    metadata: {
      generatedAt: new Date().toISOString(),
      totalQuestions: questions.length,
      conceptsUsed: pool.length,
      sectionBreakdown,
      questionTypeBreakdown,
    },
  };
}
