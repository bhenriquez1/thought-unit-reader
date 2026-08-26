"use client";

import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { savePendingExam } from '@/lib/db/examStore';
import { DAT_SECTIONS } from '@/types/apex-exam';
import { buildExam } from '@/lib/examEngine/examBuilder';
import { builtExamToGeneratedExam } from '@/lib/examEngine/legacyAdapter';
import { DAT_EXAM_PROFILE } from '@/lib/examEngine/profiles/datProfile';
import { CUSTOM_EXAM_PROFILE, CUSTOM_EXAM_PROFILE_ID } from '@/lib/examEngine/profiles/customProfile';
import { BOARD_LICENSURE_EXAM_PROFILE_ID } from '@/lib/examEngine/profiles/boardLicensureProfile';
import { COURSE_EXAM_PROFILE_ID } from '@/lib/examEngine/profiles/courseExamProfile';
import { COURSE_EXAM_TYPES } from '@/lib/examEngine/courseExamTypes';
import type { CourseExamType } from '@/lib/examEngine/courseExamTypes';
import { EXAM_PROFILE_CATALOG } from '@/lib/examEngine/profiles/profileCatalog';
import { resolveProfileById } from '@/lib/examEngine/profiles/profileRegistry';
import type { ExamProfile } from '@/lib/examEngine/types';
import {
  getUserBookCatalogue,
  DAT_SUBJECTS,
  PRACTICE_MODES,
  DIFFICULTY_OPTIONS,
  tocToPageRanges,
  setSubjectOverride,
  computeSourceSufficiency,
} from '@/lib/apex/bookCatalogue';
import { useTocStore } from '@/lib/stores/tocStore';
import { getNotesByBook } from '@/lib/notelab/ultraNoteStore';
import type { DATSubject, PracticeMode } from '@/lib/apex/bookCatalogue';
import type { DifficultyLevel } from '@/lib/examEngine/types';
import type { GeneratedExam } from '@/lib/apex/examGenerator';
import { getReadingProgress } from '@/lib/reader/readingProgressStore';
import type { ReadingProgressRecord } from '@/lib/reader/readingProgressStore';
import { EXAM_SCOPE_OPTIONS, resolveExamScope, defaultScopeFor } from '@/lib/examEngine/examScope';
import type { ExamScope } from '@/lib/examEngine/examScope';
import { getNodesByBook, getNodeProgress } from '@/lib/knowledge/knowledgeGraphStore';
import type { KnowledgeNode, KnowledgeNodeProgress } from '@/lib/knowledge/knowledgeGraphSchema';

const SECTION_COLORS: Record<string, string> = {
  'survey-natural-sciences': 'from-green-600 to-emerald-600',
  'perceptual-ability': 'from-blue-600 to-cyan-600',
  'reading-comprehension': 'from-purple-600 to-violet-600',
  'quantitative-reasoning': 'from-orange-600 to-red-600',
};

const SUBJECT_ICONS: Record<string, string> = {
  Biology: '🧬',
  'General Chemistry': '⚗️',
  'Organic Chemistry': '🔬',
  Other: '📚',
};

const SUBJECT_COLORS: Record<string, string> = {
  Biology: 'bg-emerald-900/60 border-emerald-500/40 text-emerald-300',
  'General Chemistry': 'bg-blue-900/60 border-blue-500/40 text-blue-300',
  'Organic Chemistry': 'bg-purple-900/60 border-purple-500/40 text-purple-300',
  Other: 'bg-gray-800/60 border-gray-500/40 text-gray-300',
};

// useSearchParams() requires a Suspense boundary in the App Router (same
// discipline as app/apex/page.tsx's DatApexPageInner) — ExamGeneratorPage
// below is the actual page body; the default export just wraps it.
function ExamGeneratorPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tocs = useTocStore((s) => s.tocs);
  const [catalogueRefreshKey, setCatalogueRefreshKey] = useState(0);
  const [books, setBooks] = useState<import('@/lib/apex/bookCatalogue').CatalogueBook[]>([]);
  useEffect(() => {
    let alive = true;
    getUserBookCatalogue()
      .then(b => { if (alive) setBooks(b); })
      .catch(() => { if (alive) setBooks([]); });
    return () => { alive = false; };
  }, [catalogueRefreshKey]);

  // --- State ---
  // Product-split Phase 1, item 2 — proves ExamProfile generalizes beyond
  // DAT: 'dat' (the official blueprint), 'custom' (no external
  // standardized-test blueprint, draws entirely from the selected source),
  // or (C5) 'board-licensure' (pass/fail, foundational + clinical sections).
  // Deep-links from the TestLab dashboard's exam-profile switcher
  // (/apex/generator?examType=custom) preselect the profile here — any
  // examType that isn't a real, available catalog entry falls back to 'dat',
  // same guard app/apex/page.tsx's readStoredActiveProfileId uses.
  const [examProfileId, setExamProfileId] = useState<string>(() => {
    const param = searchParams?.get('examType');
    return param && EXAM_PROFILE_CATALOG.some((p) => p.id === param && p.available) ? param : 'dat';
  });
  const selectedProfile: ExamProfile = resolveProfileById(examProfileId);
  const [subjectFilter, setSubjectFilter] = useState<'all' | DATSubject>('all');
  const requestedSourceBookId = searchParams?.get('sourceBookId') ?? '';
  const [bookId, setBookId] = useState<string>('');
  const [selectedChapterIds, setSelectedChapterIds] = useState<Set<string>>(new Set());
  const [chaptersExpanded, setChaptersExpanded] = useState(false);
  const [practiceMode, setPracticeMode] = useState<PracticeMode>(() => {
    const requestedMode = searchParams?.get('mode');
    if (requestedMode === 'quick') return 'practice';
    if (requestedMode === 'full') return 'full-dat';
    return 'practice-exam';
  });
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('simulation');
  const [sectionIds, setSectionIds] = useState<string[]>(DAT_SECTIONS.map((s) => s.id));
  const [questionCount, setQuestionCount] = useState(40);
  const [randomize, setRandomize] = useState(true);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [generatedExam, setGeneratedExam] = useState<GeneratedExam | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [subjectPickerOpen, setSubjectPickerOpen] = useState(false);

  // TestLab-Reader progress integration — "Completed material only" (or
  // whatever scope the student picks) must never let buildExam() draw on
  // pages the student hasn't reached. See lib/examEngine/examScope.ts.
  const [examScope, setExamScope] = useState<ExamScope>('entire-book');
  // C6 — which Course Exam type is active (Chapter Quiz/Unit Exam/Midterm/
  // Cumulative Final), only meaningful when examProfileId === COURSE_EXAM_PROFILE_ID.
  // Not itself sent to buildExam() — it's a UI-only preset that sets
  // examScope/practiceMode/questionCount, all of which buildExam() already
  // consumes generically.
  const [courseExamType, setCourseExamType] = useState<CourseExamType | null>(null);
  // Mirrors courseExamType for the bookId-load effect below to read without
  // depending on it — depending on it directly would re-run the whole
  // effect (re-fetching nodes/progress) every time a Course Exam type is
  // picked, which is unnecessary and would itself re-trigger the very
  // scope overwrite this ref exists to prevent.
  const courseExamTypeRef = useRef<CourseExamType | null>(null);
  useEffect(() => { courseExamTypeRef.current = courseExamType; }, [courseExamType]);
  const [readingProgress, setReadingProgress] = useState<ReadingProgressRecord | null>(null);
  const [allNodes, setAllNodes] = useState<KnowledgeNode[]>([]);
  const [nodeProgressById, setNodeProgressById] = useState<Map<string, KnowledgeNodeProgress>>(new Map());
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());

  // A source chosen on the canonical TestLab landing page must remain
  // selected when the student enters the detailed builder. Validate the
  // URL value against the loaded catalogue so a stale/deleted book id can
  // never create a phantom selection or widen generation to another book.
  useEffect(() => {
    if (books.length === 0 || bookId) return;
    const requested = books.find((book) => book.bookId === requestedSourceBookId);
    setBookId(requested?.bookId ?? books[0].bookId);
  }, [books, bookId, requestedSourceBookId]);

  // Reload Reader progress + Knowledge Graph nodes whenever the selected
  // book changes, and default the scope to "Completed material only" when
  // this book has a Reader progress checkpoint, "Entire book" otherwise —
  // never the reverse (a book with no linked progress has nothing to scope
  // "completed" against).
  useEffect(() => {
    let alive = true;
    if (!bookId) { setReadingProgress(null); setAllNodes([]); setNodeProgressById(new Map()); return; }
    getReadingProgress(bookId)
      .then((progress) => {
        if (!alive) return;
        setReadingProgress(progress);
        // C6 fix — a Course Exam type picked BEFORE the book loads (e.g.
        // Chapter Quiz's 'selected-chapters' scope) must not be silently
        // overwritten by the book's default scope once progress resolves.
        // Picking a type AFTER the book is already loaded is unaffected —
        // handleCourseExamTypeSelect sets examScope directly, and this
        // effect doesn't re-run just because courseExamType changed.
        if (courseExamTypeRef.current === null) {
          setExamScope(defaultScopeFor(progress));
        }
      })
      .catch(() => { if (alive) setReadingProgress(null); });
    getNodesByBook(bookId)
      .then(async (nodes) => {
        if (!alive) return;
        setAllNodes(nodes);
        const entries = await Promise.all(
          nodes.map(async (n) => [n.id, await getNodeProgress(n.id).catch(() => null)] as const),
        );
        if (!alive) return;
        const map = new Map<string, KnowledgeNodeProgress>();
        for (const [id, p] of entries) if (p) map.set(id, p);
        setNodeProgressById(map);
      })
      .catch(() => { if (alive) { setAllNodes([]); setNodeProgressById(new Map()); } });
    return () => { alive = false; };
  }, [bookId]);

  // --- Derived ---
  const modeConfig = PRACTICE_MODES.find((m) => m.id === practiceMode)!;
  const selectedBook = books.find((b) => b.bookId === bookId) ?? null;
  const toc = bookId ? (tocs[bookId] ?? null) : null;
  const tocItems = toc?.items ?? [];

  const filteredBooks = subjectFilter === 'all'
    ? books
    : books.filter((b) => b.subject === subjectFilter);

  // Chapters: flatten top-level items from TOC
  const topLevelChapters = tocItems.filter((item) => item.level === 0 || tocItems.every((t) => t.level !== 0));

  // Source coverage: count notes available given current chapter selection
  const allBookNotes = useMemo(() => bookId ? getNotesByBook(bookId) : [], [bookId]);
  const availableNoteCount = useMemo(() => {
    if (!selectedChapterIds.size) return allBookNotes.length;
    const ranges = tocToPageRanges(tocItems, selectedChapterIds);
    return allBookNotes.filter((n) =>
      ranges.some((r) => n.pageNumber >= r.start && n.pageNumber <= r.end),
    ).length;
  }, [allBookNotes, selectedChapterIds, tocItems]);
  const sufficiency = useMemo(
    () => computeSourceSufficiency(availableNoteCount, questionCount),
    [availableNoteCount, questionCount],
  );

  const resolvedScope = useMemo(
    () => resolveExamScope({
      scope: examScope,
      progress: readingProgress,
      manualPageRanges: selectedChapterIds.size > 0 ? tocToPageRanges(tocItems, selectedChapterIds) : undefined,
      allNodes,
      progressByNodeId: nodeProgressById,
      weakAccuracyThreshold: selectedProfile.weaknessAnalytics.weakAccuracyThreshold,
      minAttemptsForSignal: selectedProfile.weaknessAnalytics.minAttemptsForSignal,
      selectedNodeIds,
    }),
    [examScope, readingProgress, selectedChapterIds, tocItems, allNodes, nodeProgressById, selectedProfile, selectedNodeIds],
  );

  // When mode changes, reset questionCount to mode default
  function handleModeChange(mode: PracticeMode) {
    const cfg = PRACTICE_MODES.find((m) => m.id === mode)!;
    setPracticeMode(mode);
    setQuestionCount(cfg.defaultQuestions);
    setGeneratedExam(null);
    setGenerationError(null);
  }

  // C6 — sets scope/practiceMode/questionCount together from one Course
  // Exam type preset, rather than routing through handleModeChange (which
  // would reset questionCount to the mode's own generic default and
  // override the type's specific count).
  function handleCourseExamTypeSelect(type: CourseExamType) {
    const cfg = COURSE_EXAM_TYPES.find((t) => t.id === type)!;
    setCourseExamType(type);
    setExamScope(cfg.scope);
    setPracticeMode(cfg.practiceMode);
    setQuestionCount(cfg.questionCount);
    setGeneratedExam(null);
    setGenerationError(null);
  }

  function handleBookSelect(id: string) {
    setBookId(id);
    setSelectedChapterIds(new Set());
    setSelectedNodeIds(new Set());
    setGeneratedExam(null);
    setGenerationError(null);
    // examScope itself is re-defaulted by the bookId effect once this
    // book's Reader progress loads — not reset here to avoid a one-frame
    // flash back to 'entire-book' before that load resolves.
  }

  function toggleConceptSelection(nodeId: string) {
    setSelectedNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }

  // Switching exam type changes which profile generateExam() builds against
  // (DAT_EXAM_PROFILE vs CUSTOM_EXAM_PROFILE) — an already-generated exam
  // built under the previous profile must not survive the switch, or the
  // summary panel can show the newly selected profile while Start launches
  // the stale one. Same reset shape as handleModeChange/handleBookSelect above.
  function handleProfileChange(id: string) {
    setExamProfileId(id);
    setCourseExamType(null);
    setGeneratedExam(null);
    setGenerationError(null);
  }

  function toggleChapter(itemId: string) {
    setSelectedChapterIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function selectAllChapters() {
    setSelectedChapterIds(new Set(topLevelChapters.map((c) => c.id)));
  }

  function clearAllChapters() {
    setSelectedChapterIds(new Set());
  }

  function handleSubjectOverride(subject: DATSubject | null) {
    if (!bookId) return;
    setSubjectOverride(bookId, subject);
    setCatalogueRefreshKey((k) => k + 1);
    setSubjectPickerOpen(false);
    setGeneratedExam(null);
  }

  function handleSectionToggle(sectionId: string) {
    setSectionIds((prev) =>
      prev.includes(sectionId)
        ? prev.filter((s) => s !== sectionId)
        : [...prev, sectionId],
    );
  }

  async function generateExam() {
    if (!bookId) return;
    if (resolvedScope.blocked) {
      setGenerationError(resolvedScope.summary);
      return;
    }
    setIsGenerating(true);
    setGenerationError(null);
    try {
      const built = await buildExam({
        bookId,
        bookTitle: selectedBook?.bookTitle,
        profile: selectedProfile,
        difficulty,
        questionCount,
        // The DAT section checkboxes only apply to the DAT profile — Custom
        // Exam has one "general" section and draws from the whole selection.
        sectionIds: examProfileId === 'dat' && sectionIds.length ? sectionIds : undefined,
        randomize,
        chapterPageRanges: resolvedScope.pageRanges,
        // Hard constraint, not a preference — a chosen exam scope (in
        // particular "Completed material only") must never silently widen
        // back to the full book when the narrowed range matches nothing.
        // See lib/examEngine/examScope.ts and lib/examEngine/examBuilder.ts.
        strictScope: true,
        practiceMode,
      });

      if (built.questions.length === 0) {
        setGenerationError(
          'No questions could be generated — this book has no notes in the selected chapters/sections yet. Read and synthesize a few pages first.',
        );
        setGeneratedExam(null);
        return;
      }

      const exam = builtExamToGeneratedExam(
        built,
        modeConfig.timed ? modeConfig.defaultTimeMinutes : 999,
        practiceMode,
        selectedProfile,
      );
      setGeneratedExam(exam);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : null;
      setGenerationError(
        msg
          ? `Generation failed: ${msg}`
          : 'Question generation failed — check that an AI key is configured for /api/exam-question-gen.',
      );
    } finally {
      setIsGenerating(false);
    }
  }

  async function startExam() {
    if (!generatedExam) return;
    setIsStarting(true);
    const examId = generatedExam.id || crypto.randomUUID();
    try {
      await savePendingExam(examId, generatedExam);
    } catch {
      setGenerationError('The generated exam could not be saved. Please try again.');
      setIsStarting(false);
      return;
    }
    // Backward-compat: keep localStorage so the proctor can fall back if IDB is unavailable.
    localStorage.setItem('currentExam', JSON.stringify(generatedExam));
    router.push(`/apex/proctor?examId=${encodeURIComponent(examId)}`);
  }

  const canGenerate = !!bookId && sectionIds.length > 0 && !isGenerating && !resolvedScope.blocked;

  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_15%_0%,rgba(6,182,212,0.18),transparent_28%),radial-gradient(circle_at_85%_20%,rgba(124,58,237,0.14),transparent_32%),linear-gradient(145deg,#020617,#0b1120_48%,#111827)] text-white">
      <header className="border-b border-white/10 bg-slate-950/70 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-5 py-5">
          <Link
            href="/apex"
            className="inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white transition-colors"
          >
            ← TestLab
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">⚡ Build Practice Exam</h1>
          <p className="mt-1 text-xs text-slate-400">
            AI questions grounded in your uploaded book — never a copied question bank.
          </p>
        </div>
      </header>
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* ── Left panel ── */}
          <div className="lg:col-span-2 space-y-6">

            {/* 1 — Exam Type */}
            <section className="rounded-3xl border border-white/10 bg-slate-950/45 p-5 sm:p-6">
              <h3 className="text-lg font-semibold mb-4 text-blue-400">🎯 Exam Type</h3>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleProfileChange('dat')}
                  className={`text-left p-3 rounded-lg border-2 transition-all ${
                    examProfileId === 'dat'
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-gray-600 bg-gray-700/30 hover:border-gray-500'
                  }`}
                >
                  <div className="font-medium text-white text-sm">DAT</div>
                  <div className="text-xs text-gray-400 mt-0.5">Official section weighting and blueprint</div>
                </button>
                <button
                  onClick={() => handleProfileChange(CUSTOM_EXAM_PROFILE_ID)}
                  className={`text-left p-3 rounded-lg border-2 transition-all ${
                    examProfileId === CUSTOM_EXAM_PROFILE_ID
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-gray-600 bg-gray-700/30 hover:border-gray-500'
                  }`}
                >
                  <div className="font-medium text-white text-sm">Custom Exam</div>
                  <div className="text-xs text-gray-400 mt-0.5">No external blueprint — your source only</div>
                </button>
                <button
                  onClick={() => handleProfileChange(BOARD_LICENSURE_EXAM_PROFILE_ID)}
                  className={`text-left p-3 rounded-lg border-2 transition-all ${
                    examProfileId === BOARD_LICENSURE_EXAM_PROFILE_ID
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-gray-600 bg-gray-700/30 hover:border-gray-500'
                  }`}
                >
                  <div className="font-medium text-white text-sm">Board / Licensure</div>
                  <div className="text-xs text-gray-400 mt-0.5">Pass/fail — foundational + clinical sections</div>
                </button>
                <button
                  onClick={() => handleProfileChange(COURSE_EXAM_PROFILE_ID)}
                  className={`text-left p-3 rounded-lg border-2 transition-all ${
                    examProfileId === COURSE_EXAM_PROFILE_ID
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-gray-600 bg-gray-700/30 hover:border-gray-500'
                  }`}
                >
                  <div className="font-medium text-white text-sm">Course Exam</div>
                  <div className="text-xs text-gray-400 mt-0.5">Your class — chapter quiz, unit exam, midterm, final</div>
                </button>
                {/* TestLab is built to support more than the DAT — these
                    profiles are visibly part of the product even before
                    they have a real ExamProfile implementation, so the
                    picker never reads as "DAT with a rename." */}
                {EXAM_PROFILE_CATALOG.filter((p) => !p.available).map((p) => (
                  <div
                    key={p.id}
                    title="Coming soon"
                    className="text-left p-3 rounded-lg border-2 border-dashed border-gray-700 bg-gray-800/20 cursor-default"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-gray-500 text-sm">{p.label}</div>
                      <span className="text-[10px] bg-white/5 text-gray-500 px-1.5 py-0.5 rounded shrink-0">Coming soon</span>
                    </div>
                    <div className="text-xs text-gray-600 mt-0.5">{p.description}</div>
                  </div>
                ))}
              </div>
            </section>

            {/* 1b — Course Exam Type (only when Course Exam is the active profile) */}
            {examProfileId === COURSE_EXAM_PROFILE_ID && (
              <section className="rounded-3xl border border-white/10 bg-slate-950/45 p-5 sm:p-6">
                <h3 className="text-lg font-semibold mb-4 text-blue-400">📚 Course Exam Type</h3>
                <p className="text-xs text-gray-400 mb-4">
                  Picks a starting scope, timing, and size below — you can still adjust any of them afterward.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {COURSE_EXAM_TYPES.map((type) => (
                    <button
                      key={type.id}
                      onClick={() => handleCourseExamTypeSelect(type.id)}
                      className={`text-left p-3 rounded-lg border-2 transition-all ${
                        courseExamType === type.id
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-gray-600 bg-gray-700/30 hover:border-gray-500'
                      }`}
                    >
                      <div className="font-medium text-white text-sm">{type.icon} {type.label}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{type.description}</div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* 2 — Source Book */}
            <section className="rounded-3xl border border-white/10 bg-slate-950/45 p-5 sm:p-6">
              <h3 className="text-lg font-semibold mb-4 text-blue-400">📖 Source Book</h3>

              {books.length === 0 ? (
                <p className="text-sm text-gray-400">
                  No books with notes yet. Open a PDF in the Reader and let it synthesize a few pages, then come back.
                </p>
              ) : (
                <>
                  {/* Subject tabs */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {(['all', ...DAT_SUBJECTS] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => setSubjectFilter(s)}
                        className={`px-3 py-1 rounded-full text-sm font-medium transition-all ${
                          subjectFilter === s
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        {s === 'all' ? 'All' : `${SUBJECT_ICONS[s]} ${s}`}
                      </button>
                    ))}
                  </div>

                  {/* Book cards */}
                  {filteredBooks.length === 0 ? (
                    <p className="text-sm text-gray-400">No books in this subject yet.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {filteredBooks.map((book) => {
                        const isSelected = bookId === book.bookId;
                        const badgeClass = SUBJECT_COLORS[book.subject] ?? SUBJECT_COLORS.Other;
                        const bookToc = tocs[book.bookId];
                        return (
                          <div
                            key={book.bookId}
                            className={`text-left p-4 rounded-lg border-2 transition-all cursor-pointer ${
                              isSelected
                                ? 'border-blue-500 bg-blue-500/10'
                                : 'border-gray-600 bg-gray-700/30 hover:border-gray-500'
                            }`}
                            onClick={() => handleBookSelect(book.bookId)}
                          >
                            <div className="font-medium text-white text-sm leading-tight mb-2">
                              {book.bookTitle}
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              {/* Subject badge — low-confidence gets a ⚠️ and is editable */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleBookSelect(book.bookId);
                                  setSubjectPickerOpen((v) => !v || bookId !== book.bookId);
                                }}
                                className={`px-2 py-0.5 rounded text-xs border ${badgeClass} flex items-center gap-1`}
                                title={book.subjectConfidence === 'low' ? 'Subject inferred with low confidence — click to change' : 'Click to change subject'}
                              >
                                {SUBJECT_ICONS[book.subject]} {book.subject}
                                {book.subjectConfidence === 'low' && <span className="text-yellow-400 ml-0.5">⚠</span>}
                              </button>
                              <span className="text-xs text-gray-400">
                                {book.noteCount} note{book.noteCount !== 1 ? 's' : ''}
                              </span>
                              {bookToc && (
                                <span className="text-xs text-gray-500">
                                  · {bookToc.items.filter((i) => i.level === 0 || bookToc.items.every((t) => t.level !== 0)).length} chapters
                                </span>
                              )}
                            </div>
                            {/* Inline subject picker (only for the selected book) */}
                            {isSelected && subjectPickerOpen && (
                              <div
                                className="mt-2 flex flex-wrap gap-1"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {DAT_SUBJECTS.map((s) => (
                                  <button
                                    key={s}
                                    onClick={() => handleSubjectOverride(s)}
                                    className={`px-2 py-0.5 rounded text-xs border transition-all ${
                                      book.subject === s
                                        ? 'border-blue-400 bg-blue-800/60 text-blue-200'
                                        : 'border-gray-500 bg-gray-700 text-gray-300 hover:border-gray-400'
                                    }`}
                                  >
                                    {SUBJECT_ICONS[s]} {s}
                                  </button>
                                ))}
                                <button
                                  onClick={() => handleSubjectOverride(null)}
                                  className="px-2 py-0.5 rounded text-xs border border-gray-600 text-gray-500 hover:text-gray-300"
                                >
                                  Reset
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Subject mismatch warning — shown when the selected book's
                      subject was detected with low confidence or not at all. */}
                  {selectedBook && selectedBook.subjectConfidence === 'low' && (
                    <div className={`mt-4 rounded-lg border px-4 py-3 text-sm flex items-start gap-3 ${
                      selectedBook.subject === 'Other'
                        ? 'border-orange-500/40 bg-orange-900/20 text-orange-200'
                        : 'border-yellow-500/40 bg-yellow-900/20 text-yellow-200'
                    }`}>
                      <span className="text-lg leading-none mt-0.5" aria-hidden>
                        {selectedBook.subject === 'Other' ? '⚠️' : '⚠'}
                      </span>
                      <div>
                        {selectedBook.subject === 'Other' ? (
                          <>
                            <span className="font-medium">No DAT subject detected.</span>
                            {' '}Questions may not align with the DAT Blueprint.
                            <span className="block mt-1 text-xs opacity-75">
                              {selectedBook.classificationReason} — click the subject badge on the book card to set one manually.
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="font-medium">Subject detected with low confidence:</span>
                            {' '}<span className="font-semibold">{selectedBook.subject}</span>.
                            {' '}If questions seem off-topic, click the ⚠ badge to correct it.
                            <span className="block mt-1 text-xs opacity-75">
                              {selectedBook.classificationReason}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {/* No-TOC notice — shown when a book is selected but no chapters were detected */}
                  {bookId && topLevelChapters.length === 0 && (
                    <div className="mt-4 rounded-lg border border-gray-600/50 bg-gray-700/20 px-4 py-3 text-sm text-gray-400">
                      No reliable chapter structure was detected for this book.
                      <span className="ml-1 text-gray-300">The exam will use the entire book.</span>
                      <span className="block mt-1 text-xs text-gray-500">
                        To select specific chapters, open the book in the Reader, use Regenerate TOC in the Book Roadmap tab, then return here.
                      </span>
                    </div>
                  )}

                  {/* Chapter selector (only when a book is selected and has TOC) —
                      this selection is only applied to generation when the
                      Exam Scope section below is set to "Selected chapters/
                      pages"; for every other scope it's inert (dimmed). */}
                  {bookId && topLevelChapters.length > 0 && (
                    <div className={`mt-4 border border-gray-600 rounded-lg overflow-hidden ${examScope !== 'selected-chapters' ? 'opacity-50' : ''}`}>
                      {examScope !== 'selected-chapters' && (
                        <p className="px-4 pt-2 text-[11px] text-gray-500">
                          Only applied when Exam Scope (below) is set to &ldquo;Selected chapters/pages&rdquo;.
                        </p>
                      )}
                      <button
                        onClick={() => setChaptersExpanded((v) => !v)}
                        className="w-full flex items-center justify-between px-4 py-3 bg-gray-700/50 hover:bg-gray-700 transition-colors text-sm font-medium"
                      >
                        <span>
                          📑 Chapters
                          {selectedChapterIds.size > 0 && (
                            <span className="ml-2 text-blue-400">
                              ({selectedChapterIds.size} of {topLevelChapters.length} selected)
                            </span>
                          )}
                          {selectedChapterIds.size === 0 && (
                            <span className="ml-2 text-gray-400">(all chapters)</span>
                          )}
                        </span>
                        <span className="text-gray-400">{chaptersExpanded ? '▲' : '▼'}</span>
                      </button>

                      {chaptersExpanded && (
                        <div className="p-3 space-y-1 max-h-64 overflow-y-auto">
                          <div className="flex gap-2 mb-2">
                            <button
                              onClick={selectAllChapters}
                              className="text-xs text-blue-400 hover:text-blue-300"
                            >
                              Select all
                            </button>
                            <span className="text-gray-600">·</span>
                            <button
                              onClick={clearAllChapters}
                              className="text-xs text-gray-400 hover:text-gray-300"
                            >
                              Clear
                            </button>
                          </div>
                          {topLevelChapters.map((ch) => (
                            <label
                              key={ch.id}
                              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-700/50 cursor-pointer text-sm"
                            >
                              <input
                                type="checkbox"
                                checked={selectedChapterIds.has(ch.id)}
                                onChange={() => toggleChapter(ch.id)}
                                className="rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="flex-1 text-gray-200">{ch.title}</span>
                              <span className="text-xs text-gray-500">p.{ch.pageNumber}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </section>

            {/* 3 — Exam Scope */}
            {bookId && (
              <section className="rounded-3xl border border-white/10 bg-slate-950/45 p-5 sm:p-6">
                <h3 className="text-lg font-semibold mb-1 text-blue-400">🧭 Exam Scope</h3>
                <p className="text-xs text-gray-400 mb-4">
                  {readingProgress
                    ? `TestLab knows you've reached page ${readingProgress.furthestPageReached} in Reader for this book.`
                    : "No Reader progress found yet for this book — TestLab can't scope by what you've read until you open it in Reader."}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {EXAM_SCOPE_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => setExamScope(opt.id)}
                      className={`text-left p-3 rounded-lg border-2 transition-all ${
                        examScope === opt.id
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-gray-600 bg-gray-700/30 hover:border-gray-500'
                      }`}
                    >
                      <div className="font-medium text-white text-sm flex items-center gap-2">
                        {opt.label}
                        {opt.id === 'entire-book' && (
                          <span className="text-[10px] font-normal uppercase tracking-wide bg-amber-900/40 text-amber-300 border border-amber-600/30 px-1.5 py-0.5 rounded-full">
                            May include unread material
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">{opt.description}</div>
                    </button>
                  ))}
                </div>

                {/* Custom concepts picker — only meaningful when this scope is active */}
                {examScope === 'custom-concepts' && (
                  <div className="mt-4 border border-gray-600 rounded-lg p-3 max-h-56 overflow-y-auto">
                    {allNodes.length === 0 ? (
                      <p className="text-xs text-gray-500">No Knowledge Graph concepts recorded for this book yet — read a few pages in Reader first.</p>
                    ) : (
                      <div className="space-y-1">
                        {allNodes.map((n) => (
                          <label key={n.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-700/50 cursor-pointer text-sm">
                            <input
                              type="checkbox"
                              checked={selectedNodeIds.has(n.id)}
                              onChange={() => toggleConceptSelection(n.id)}
                              className="rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="flex-1 text-gray-200">{n.title}</span>
                            <span className="text-xs text-gray-500">p.{n.sourcePages[0] ?? '—'}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <p className={`text-xs mt-4 ${resolvedScope.blocked ? 'text-amber-400' : 'text-gray-400'}`}>
                  {resolvedScope.blocked ? '⚠ ' : ''}{resolvedScope.summary}
                </p>
              </section>
            )}

            {/* 4 — Practice Mode */}
            <section className="rounded-3xl border border-white/10 bg-slate-950/45 p-5 sm:p-6">
              <h3 className="text-lg font-semibold mb-4 text-blue-400">🎓 Practice Mode</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {PRACTICE_MODES.map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => handleModeChange(mode.id)}
                    className={`text-left p-4 rounded-lg border-2 transition-all ${
                      practiceMode === mode.id
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-gray-600 bg-gray-700/30 hover:border-gray-500'
                    }`}
                  >
                    <div className="text-2xl mb-1">{mode.icon}</div>
                    <div className="font-semibold text-white text-sm">{mode.label}</div>
                    <div className="text-xs text-gray-400 mt-1">{mode.description}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {mode.questionRange[0]}–{mode.questionRange[1]} questions
                    </div>
                  </button>
                ))}
              </div>
            </section>

            {/* 5 — Difficulty */}
            <section className="rounded-3xl border border-white/10 bg-slate-950/45 p-5 sm:p-6">
              <h3 className="text-lg font-semibold mb-4 text-blue-400">📊 Difficulty</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {DIFFICULTY_OPTIONS.map((d) => (
                  <button
                    key={d.value}
                    onClick={() => setDifficulty(d.value)}
                    className={`text-left p-3 rounded-lg border-2 transition-all ${
                      difficulty === d.value
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-gray-600 bg-gray-700/30 hover:border-gray-500'
                    }`}
                  >
                    <div className="text-lg">{d.emoji}</div>
                    <div className="font-medium text-white text-sm mt-1">{d.label}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{d.blurb}</div>
                  </button>
                ))}
              </div>
            </section>

            {/* 6 — DAT Sections (collapsed for Practice mode; DAT profile only) */}
            {examProfileId === 'dat' ? (
              <section className="rounded-3xl border border-white/10 bg-slate-950/45 p-5 sm:p-6">
                <h3 className="text-lg font-semibold mb-4 text-blue-400">📚 DAT Sections</h3>
                <div className="space-y-3">
                  {DAT_SECTIONS.map((section) => {
                    const isSelected = sectionIds.includes(section.id);
                    return (
                      <label
                        key={section.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                          isSelected
                            ? 'border-blue-500/50 bg-blue-500/5'
                            : 'border-gray-600 bg-gray-700/20 hover:border-gray-500'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSectionToggle(section.id)}
                          className="rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
                        />
                        <div className="flex-1">
                          <div className="font-medium text-white text-sm">{section.name}</div>
                          <div className="text-xs text-gray-400">{section.description}</div>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium bg-gradient-to-r ${
                            SECTION_COLORS[section.id] ?? 'from-gray-600 to-gray-700'
                          } text-white`}
                        >
                          {section.shortName}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </section>
            ) : (
              <section className="rounded-3xl border border-white/10 bg-slate-950/45 p-5 sm:p-6">
                <h3 className="text-lg font-semibold mb-2 text-blue-400">📚 Sections</h3>
                <p className="text-sm text-gray-400">
                  Custom Exam draws from your entire selected source (or selected chapters, above) — no fixed exam sections or external blueprint.
                </p>
              </section>
            )}
          </div>

          {/* ── Right panel: summary + actions ── */}
          <div className="space-y-5">
            {/* Exam summary */}
            <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-cyan-500/10 to-violet-500/10 p-5 sm:p-6">
              <h3 className="text-lg font-semibold mb-4 text-blue-400">📋 Exam Summary</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Exam Type:</span>
                  <span className="text-white font-medium">
                    {EXAM_PROFILE_CATALOG.find((p) => p.id === examProfileId)?.shortLabel ?? 'DAT'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-400">Book:</span>
                  <span className="text-white font-medium text-right truncate max-w-[55%]">
                    {selectedBook?.bookTitle ?? '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Subject:</span>
                  <span className="text-white font-medium">{selectedBook?.subject ?? '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Chapters:</span>
                  <span className="text-white font-medium">
                    {selectedChapterIds.size > 0
                      ? `${selectedChapterIds.size} selected`
                      : topLevelChapters.length > 0
                      ? 'All chapters'
                      : '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Mode:</span>
                  <span className="text-white font-medium">
                    {modeConfig.icon} {modeConfig.label}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Difficulty:</span>
                  <span className="text-white font-medium">
                    {DIFFICULTY_OPTIONS.find((d) => d.value === difficulty)?.emoji}{' '}
                    {DIFFICULTY_OPTIONS.find((d) => d.value === difficulty)?.label}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Sections:</span>
                  <span className="text-white font-medium">{examProfileId === 'dat' ? sectionIds.length : 'All (no blueprint)'}</span>
                </div>
              </div>
            </div>

            {/* Question count */}
            <div className="bg-gray-800/50 rounded-xl p-5 border border-gray-700">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Questions:{' '}
                <span className="text-blue-400 font-bold">{questionCount}</span>
                {bookId && (
                  <span className="ml-2 text-xs text-gray-500">
                    {availableNoteCount} note{availableNoteCount !== 1 ? 's' : ''} available
                    {selectedChapterIds.size > 0 ? ` in ${selectedChapterIds.size} chapter${selectedChapterIds.size !== 1 ? 's' : ''}` : ''}
                  </span>
                )}
              </label>
              <input
                type="range"
                min={modeConfig.questionRange[0]}
                max={modeConfig.questionRange[1]}
                value={Math.min(Math.max(questionCount, modeConfig.questionRange[0]), modeConfig.questionRange[1])}
                onChange={(e) => setQuestionCount(parseInt(e.target.value))}
                className="w-full accent-blue-500"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>{modeConfig.questionRange[0]}</span>
                <span>{modeConfig.questionRange[1]}</span>
              </div>

              {/* Source sufficiency warning */}
              {bookId && !sufficiency.sufficient && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-yellow-500/40 bg-yellow-900/20 p-3">
                  <span className="text-yellow-400 mt-0.5 shrink-0">⚠️</span>
                  <div>
                    <p className="text-xs text-yellow-300 leading-relaxed">{sufficiency.warning}</p>
                    <button
                      onClick={() => setQuestionCount(sufficiency.recommendedMax)}
                      className="mt-1.5 text-xs text-yellow-400 hover:text-yellow-300 underline"
                    >
                      Set to {sufficiency.recommendedMax} (recommended max)
                    </button>
                  </div>
                </div>
              )}

              {modeConfig.timed && (
                <div className="mt-3 text-sm text-gray-400">
                  Estimated time:{' '}
                  <span className="text-white font-medium">
                    {modeConfig.defaultTimeMinutes} min
                  </span>
                </div>
              )}
              {!modeConfig.timed && (
                <div className="mt-3 text-sm text-emerald-400 font-medium">Untimed</div>
              )}

              <label className="flex items-center gap-2 mt-3">
                <input
                  type="checkbox"
                  checked={randomize}
                  onChange={(e) => setRandomize(e.target.checked)}
                  className="rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-300">Randomize order</span>
              </label>
            </div>

            {/* Generate button */}
            <button
              onClick={generateExam}
              disabled={!canGenerate}
              className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed text-slate-950 font-semibold py-4 px-6 rounded-xl transition-all duration-200 shadow-lg"
            >
              {isGenerating ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  Generating…
                </span>
              ) : (
                `⚡ Generate ${modeConfig.label}`
              )}
            </button>

            {generationError && (
              <div className="bg-red-900/30 rounded-xl p-4 border border-red-500/30 text-sm text-red-200">
                {generationError}
              </div>
            )}

            {/* Generated exam actions */}
            {generatedExam && (
              <div className="bg-green-900/30 rounded-xl p-5 border border-green-500/30">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">✅</span>
                  <h4 className="font-semibold text-green-400">Exam Ready!</h4>
                </div>
                <p className="text-green-200 text-sm mb-4">
                  {generatedExam.questions.length} questions generated.
                  {generatedExam.questions.length < questionCount && (
                    <span className="block text-amber-300 mt-1">
                      Requested {questionCount} — synthesize more pages to unlock more.
                    </span>
                  )}
                </p>
                <button
                  onClick={startExam}
                  disabled={isStarting}
                  className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition-all"
                >
                  {isStarting ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                      Starting…
                    </span>
                  ) : (
                    '🚀 Start Exam'
                  )}
                </button>
              </div>
            )}

            {/* Quick presets */}
            <div className="bg-gray-800/50 rounded-xl p-5 border border-gray-700">
              <h4 className="text-sm font-semibold text-gray-300 mb-3">⚡ Quick Presets</h4>
              <div className="space-y-2">
                {[
                  {
                    label: '🌱 Foundation Quick (10q)',
                    mode: 'practice' as PracticeMode,
                    difficulty: 'foundation' as DifficultyLevel,
                    count: 10,
                  },
                  {
                    label: '🎯 Standard Practice Exam (40q)',
                    mode: 'practice-exam' as PracticeMode,
                    difficulty: 'simulation' as DifficultyLevel,
                    count: 40,
                  },
                  {
                    label: '🔥 Mastery Drill (20q)',
                    mode: 'practice-exam' as PracticeMode,
                    difficulty: 'mastery' as DifficultyLevel,
                    count: 20,
                  },
                  {
                    label: '🎓 Full DAT Simulation',
                    mode: 'full-dat' as PracticeMode,
                    difficulty: 'simulation' as DifficultyLevel,
                    count: 280,
                  },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => {
                      handleModeChange(preset.mode);
                      setDifficulty(preset.difficulty);
                      setQuestionCount(preset.count);
                      setGeneratedExam(null);
                      setGenerationError(null);
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors text-xs text-gray-200"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ExamGeneratorPageRoute() {
  return (
    <Suspense fallback={null}>
      <ExamGeneratorPage />
    </Suspense>
  );
}
