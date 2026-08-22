// lib/examEngine/examBuilder.ts
// Builds an exam from a book's UltraNotes, replacing the old
// ExamGenerator.fromQuestionBank() static-JSON flow. Adapts
// lib/apex/examGenerator.ts's selection logic (randomize, per-exam question
// count) but sources EngineQuestions from the AI-generated, IndexedDB-cached
// pool (questionGenerator.ts) instead of a static question bank.

import { getNotesByBookAsync } from "@/lib/notelab/ultraNoteStore";
import type { UltraNote } from "@/lib/notelab/ultraNoteStore";
import { getOrGenerateQuestions } from "@/lib/examEngine/questionGenerator";
import type { DifficultyLevel, EngineQuestion, ExamProfile, QuestionType } from "@/lib/examEngine/types";
import { normalizePageRanges } from "@/lib/apex/bookCatalogue";
import { getCanonicalUnitsByPage } from "@/lib/canonical/store";
import { canonicalUnitsToDatStubs } from "@/lib/datApex/canonicalQuestionMapper";
import { getNodesByBookAndPage } from "@/lib/knowledge/knowledgeGraphStore";

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
  /** When true, chapterPageRanges is a hard scope constraint (e.g. TestLab's
   *  "Completed material only" exam scope) — zero notes matching the ranges
   *  means zero eligible questions, never a silent fallback to the full,
   *  unnarrowed pool. Without this flag chapterPageRanges keeps its original
   *  lenient behavior (falls back to the full pool when nothing matches),
   *  which the existing manual chapter-checkbox picker in
   *  app/apex/generator/page.tsx still relies on. See lib/examEngine/
   *  examScope.ts and tests/examEngine/examScope.test.ts for why a scoped
   *  exam must never leak material outside the chosen ranges. */
  strictScope?: boolean;
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

/** Normalise a question stem to a short fingerprint for duplicate detection.
 *  Strip punctuation, collapse whitespace, lowercase, take first 80 chars. */
function stemFingerprint(stem: string): string {
  return stem.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
}

/** Remove questions whose stems are too similar to an earlier one. */
function deduplicateQuestions(questions: EngineQuestion[]): EngineQuestion[] {
  const seen = new Set<string>();
  return questions.filter((q) => {
    const fp = stemFingerprint(q.stem);
    if (seen.has(fp)) return false;
    seen.add(fp);
    return true;
  });
}

/** Aggregates one UltraNote's teaching content into grounding text for the
 *  AI question generator — never a static/copyrighted question bank.
 *  `groundedStems`, when present, come from canonicalQuestionMapper's
 *  DatQuestionStubs — question angles derived directly from this page's
 *  CanonicalThoughtUnits, giving the generator a second, independently
 *  grounded signal alongside the note's own teaching content. */
function buildConceptText(note: UltraNote, groundedStems: string[] = []): string {
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
  if (groundedStems.length > 0) {
    parts.push(`Grounded question angles from the source passage: ${groundedStems.join(" | ")}`);
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
  const notes = await getNotesByBookAsync(opts.bookId);
  const sectionIds = opts.sectionIds?.length ? opts.sectionIds : opts.profile.sections.map((s) => s.id);
  const questionTypes = opts.questionTypes?.length ? opts.questionTypes : opts.profile.questionTypes;

  const eligibleNotes = notes.filter((n) => sectionIds.includes(matchSection(n, opts.profile)));
  let pool = eligibleNotes.length > 0 ? eligibleNotes : notes;

  // Narrow to selected chapters when the generator provided page ranges.
  if (opts.chapterPageRanges?.length) {
    const normalizedRanges = normalizePageRanges(opts.chapterPageRanges);
    const chapterFiltered = pool.filter((n) =>
      normalizedRanges.some(
        (r) => n.pageNumber >= r.start && n.pageNumber <= r.end,
      ),
    );
    // strictScope: an empty match means zero eligible questions, full stop —
    // NOT a fallback to the unnarrowed pool. Without strictScope, an empty
    // match keeps the original lenient "fall back to everything" behavior.
    if (chapterFiltered.length > 0 || opts.strictScope) pool = chapterFiltered;
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

  // Look up canonical units per page (best-effort, one IDB read per note).
  // Canonical units are stored under bookId == documentId used during extraction.
  // Feeds two things: the sourceThoughtUnitIds provenance stamp, and — via
  // canonicalQuestionMapper — grounded question stems derived independently
  // of the note's own teaching content.
  const canonicalUnitsByNote = await Promise.all(
    pool.map(async (note) => {
      try {
        return await getCanonicalUnitsByPage(opts.bookId, note.pageNumber - 1);
      } catch {
        return [];
      }
    }),
  );

  // TestLab-Reader progress integration — Knowledge Graph nodes already
  // resolved for this page (created as the student actually read it, see
  // pages/index.tsx's resolveOrCreateNode wiring). Best-effort: a page with
  // no nodes yet (never opened in Reader) just gets an empty provenance
  // list, same as sourceThoughtUnitIds above when a page has no canonical
  // units. Never a second identity system — these ARE the same nodes
  // Reader/Recall read and write.
  const knowledgeNodesByNote = await Promise.all(
    pool.map(async (note) => {
      try {
        return await getNodesByBookAndPage(opts.bookId, note.pageNumber);
      } catch {
        return [];
      }
    }),
  );

  const batches = await Promise.all(
    pool.map((note, i) => {
      const questionType = questionTypes[i % questionTypes.length];
      const section = matchSection(note, opts.profile);
      const units = canonicalUnitsByNote[i];
      const knowledgeNodes = knowledgeNodesByNote[i];
      const groundedStems = canonicalUnitsToDatStubs(units, { sourceBookId: opts.bookId, maxStubs: 3 })
        .map((stub) => stub.questionStem);
      return getOrGenerateQuestions({
        examProfileId: opts.profile.id,
        bookId: opts.bookId,
        bookTitle: opts.bookTitle,
        conceptId: note.id,
        conceptText: buildConceptText(note, groundedStems),
        topic: note.topic,
        section,
        sourcePageNumber: note.pageNumber,
        // Same buildPageTruthKey convention used everywhere else in the app
        // (`${documentId}::${pageNumber}::${textReady}`) — inlined rather
        // than importing lib/useActivePageIntelligence.ts's hook module for
        // one string builder.
        pageTruthKey: `${opts.bookId}::${note.pageNumber}::t`,
        sourceThoughtUnitIds: units.map((u) => u.id),
        sourceKnowledgeNodeIds: knowledgeNodes.map((n) => n.id),
        questionType,
        difficulty: opts.difficulty,
        count: perConcept,
      });
    }),
  );

  let questions = deduplicateQuestions(batches.flat());
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
