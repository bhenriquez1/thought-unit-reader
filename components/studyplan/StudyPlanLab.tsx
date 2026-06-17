"use client";
// components/studyplan/StudyPlanLab.tsx
// Study Plan Lab — diagnostic-driven, separate from the syllabus planner.
// Flow: Reader/LeftPanel content → ~30-question diagnostic → score & find weak
// topics → build a study plan that links back to NoteLab, RecallLab, and
// Study Guide Lab. Diagnostics + plans persist per bookId.

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  saveDiagnosticAttempt,
  getDiagnosticsByBook,
  saveStudyPlan,
  getStudyPlansByBook,
} from "@/lib/studyplan/studyPlanStore";
import { buildStudyPlan, computeWeakTopics } from "@/lib/studyplan/buildStudyPlan";
import { buildChapterPlan } from "@/lib/studyplan/buildChapterPlan";
import type { DiagnosticAttempt, DiagnosticAnswer, StudyPlanRecord, ChapterStudyPlan, StudyPlanBlock } from "@/lib/studyplan/types";
import { getNotesByBook } from "@/lib/notelab/ultraNoteStore";
import { getRecallSetsByBook } from "@/lib/recalllab/recallStore";
import { getStudyGuidesByBook } from "@/lib/studyguide/studyGuideStore";
import { getVisitedPages } from "@/lib/syllabus/pageVisitStore";
import type { ChapterLike, ChapterProgress, CourseProgress } from "@/lib/syllabus/chapterProgress";
import { STATUS_LABEL, STATUS_CLASS } from "@/components/syllabus/chapterStatusStyles";

interface StudyPlanLabProps {
  bookId: string;
  bookTitle?: string;
  pageTextByPage: Map<string, string>; // keyed `${bookId}:${pageNumber}`
  uploadedFile?: File | null;
  onNavigateToPage?: (page: number) => void;
  /** From the Syllabus tab's chapter-progress engine — drives the Chapters view below. */
  chapterProgressList?: Array<{ chapter: ChapterLike; progress: ChapterProgress }>;
  courseProgress?: CourseProgress;
}

function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Pull all known page text for this book out of the shared pageTextByPage map,
 *  in page order, with [PAGE n] markers so the diagnostic API can tag questions
 *  back to a source page. */
function buildBookSourceText(bookId: string, pageTextByPage: Map<string, string>): { text: string; pageCount: number } {
  const entries: { page: number; text: string }[] = [];
  for (const [key, text] of pageTextByPage.entries()) {
    const [bId, pageStr] = key.split(":");
    if (bId !== bookId) continue;
    const page = parseInt(pageStr, 10);
    if (!Number.isFinite(page) || !text?.trim()) continue;
    entries.push({ page, text: text.trim() });
  }
  entries.sort((a, b) => a.page - b.page);
  const text = entries.map(e => `[PAGE ${e.page}]\n${e.text}`).join("\n\n");
  return { text, pageCount: entries.length };
}

/** Build [PAGE n] tagged source text from a full per-page PDF extraction. */
function buildSourceTextFromPages(pages: { page: number; text: string }[]): { text: string; pageCount: number } {
  const usable = pages.filter(p => p.text?.trim());
  const text = usable.map(p => `[PAGE ${p.page}]\n${p.text.trim()}`).join("\n\n");
  return { text, pageCount: usable.length };
}

const ACTION_ICON: Record<string, string> = {
  read_page: "📖",
  review_note: "📝",
  review_recall: "🎯",
  review_guide: "🏗",
  practice: "✏️",
};

export default function StudyPlanLab({
  bookId,
  bookTitle,
  pageTextByPage,
  uploadedFile,
  onNavigateToPage,
  chapterProgressList = [],
  courseProgress,
}: StudyPlanLabProps) {
  const [view, setView] = useState<"intro" | "quiz" | "results" | "plan" | "chapters" | "chapterplan" | "history">("intro");

  const [activeChapterPlan, setActiveChapterPlan] = useState<ChapterStudyPlan | null>(null);
  const [chapterPlanLoading, setChapterPlanLoading] = useState(false);

  const [diagnostics, setDiagnostics] = useState<DiagnosticAttempt[]>([]);
  const [plans, setPlans] = useState<StudyPlanRecord[]>([]);

  const [activeAttempt, setActiveAttempt] = useState<DiagnosticAttempt | null>(null);
  const [activePlan, setActivePlan] = useState<StudyPlanRecord | null>(null);

  const [draftAnswers, setDraftAnswers] = useState<Map<string, number>>(new Map());

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);

  // Full-PDF extraction (optional) — gives whole-book diagnostic coverage
  // regardless of which pages were visited in the Reader.
  const [fullExtractPages, setFullExtractPages] = useState<{ page: number; text: string }[] | null>(null);
  const [fullExtractLoading, setFullExtractLoading] = useState(false);
  const [fullExtractError, setFullExtractError] = useState<string | null>(null);

  // Load history for this book and reset transient state when the document changes.
  const isFirstBookRef = useRef(true);
  useEffect(() => {
    let cancelled = false;
    Promise.all([getDiagnosticsByBook(bookId), getStudyPlansByBook(bookId)]).then(([d, p]) => {
      if (cancelled) return;
      setDiagnostics(d);
      setPlans(p);
      if (isFirstBookRef.current) {
        isFirstBookRef.current = false;
        // On first mount, pick up the most recent existing plan/attempt for this book.
        if (p.length > 0) {
          setActivePlan(p[0]);
          setActiveAttempt(d.find(x => x.id === p[0].diagnosticId) ?? d[0] ?? null);
          setView("plan");
        } else if (d.length > 0) {
          setActiveAttempt(d[0]);
          setView("results");
        } else {
          setView("intro");
        }
      } else {
        // Document changed — show this book's most recent plan/diagnostic, or intro.
        setDraftAnswers(new Map());
        setError(null);
        setProvider(null);
        setFullExtractPages(null);
        setFullExtractError(null);
        setActiveChapterPlan(null);
        if (p.length > 0) {
          setActivePlan(p[0]);
          setActiveAttempt(d.find(x => x.id === p[0].diagnosticId) ?? d[0] ?? null);
          setView("plan");
        } else if (d.length > 0) {
          setActiveAttempt(d[0]);
          setActivePlan(null);
          setView("results");
        } else {
          setActiveAttempt(null);
          setActivePlan(null);
          setView("intro");
        }
      }
      console.log("[STUDYPLAN_BOOKID_LOADED]", { bookId, diagnostics: d.length, plans: p.length });
    });
    return () => { cancelled = true; };
  }, [bookId]);

  // ── Full-PDF extraction (optional whole-book coverage) ─────────────────

  const handleExtractFullPdf = useCallback(async () => {
    if (!uploadedFile) return;
    setFullExtractError(null);
    setFullExtractLoading(true);
    try {
      const { extractTextByPageFromPdf } = await import("@/lib/pdfjs-handler");
      const pages = await extractTextByPageFromPdf(uploadedFile);
      setFullExtractPages(pages);
      console.log("[STUDYPLAN_FULL_EXTRACT]", { bookId, pages: pages.length });
    } catch (e) {
      setFullExtractError(e instanceof Error ? e.message : String(e));
      setFullExtractPages(null);
    } finally {
      setFullExtractLoading(false);
    }
  }, [uploadedFile, bookId]);

  // ── Generate diagnostic ────────────────────────────────────────────────

  const handleGenerateDiagnostic = useCallback(async () => {
    setError(null);
    setProvider(null);
    const { text, pageCount } = fullExtractPages
      ? buildSourceTextFromPages(fullExtractPages)
      : buildBookSourceText(bookId, pageTextByPage);
    if (!text.trim()) {
      setError("No page text available yet. Open this book in the Reader and browse through its pages first.");
      return;
    }

    setLoading(true);
    console.log("[STUDYPLAN_DIAGNOSTIC_START]", { bookId, pages: pageCount, chars: text.length });

    try {
      const resp = await fetch("/api/study-plan-diagnostic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookTitle, sourceText: text, questionCount: 30 }),
      });
      const data = await resp.json();
      setProvider(data.provider ?? "unknown");

      if (!data.questions || data.questions.length === 0) {
        setError(data.error || "Diagnostic generation failed — try again.");
        setLoading(false);
        return;
      }

      const attempt: DiagnosticAttempt = {
        id: genId("diag"),
        bookId,
        bookTitle,
        createdAt: Date.now(),
        questions: data.questions,
        answers: [],
        scorePct: 0,
        weakTopics: [],
      };
      setActiveAttempt(attempt);
      setActivePlan(null);
      setDraftAnswers(new Map());
      setView("quiz");
      console.log("[STUDYPLAN_DIAGNOSTIC_GENERATED]", { id: attempt.id, questions: attempt.questions.length, provider: data.provider });
    } catch (e) {
      setError(`Diagnostic generation failed: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [bookId, bookTitle, pageTextByPage, fullExtractPages]);

  // ── Submit diagnostic ──────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (!activeAttempt) return;
    const answers: DiagnosticAnswer[] = activeAttempt.questions.map(q => {
      const selected = draftAnswers.get(q.id) ?? null;
      return { questionId: q.id, selectedIndex: selected, correct: selected === q.correctIndex };
    });
    const correctCount = answers.filter(a => a.correct).length;
    const scorePct = Math.round((correctCount / Math.max(1, answers.length)) * 100);
    const weakTopics = computeWeakTopics(activeAttempt.questions, answers);

    const finished: DiagnosticAttempt = { ...activeAttempt, answers, scorePct, weakTopics };

    try {
      await saveDiagnosticAttempt(finished);
      const updated = await getDiagnosticsByBook(bookId);
      setDiagnostics(updated);
      setActiveAttempt(finished);
      setView("results");
      console.log("[STUDYPLAN_DIAGNOSTIC_SCORED]", { id: finished.id, scorePct, weakTopics: weakTopics.length });
    } catch (e) {
      setError(`Could not save diagnostic results: ${String(e)}`);
    }
  }, [activeAttempt, draftAnswers, bookId]);

  // ── Build study plan ───────────────────────────────────────────────────

  const handleBuildPlan = useCallback(async () => {
    if (!activeAttempt) return;
    setError(null);
    try {
      const notes = getNotesByBook(bookId);
      const recallSets = getRecallSetsByBook(bookId);
      const guides = await getStudyGuidesByBook(bookId);
      const plan = buildStudyPlan(activeAttempt, notes, recallSets, guides);
      await saveStudyPlan(plan);
      const updated = await getStudyPlansByBook(bookId);
      setPlans(updated);
      setActivePlan(plan);
      setView("plan");
      console.log("[STUDYPLAN_BUILT]", { id: plan.id, blocks: plan.blocks.length, weakTopics: plan.weakTopics.length });
    } catch (e) {
      setError(`Could not build study plan: ${String(e)}`);
    }
  }, [activeAttempt, bookId]);

  // ── Build chapter plan (no diagnostic needed — reads live chapter %s) ──

  const handleBuildChapterPlan = useCallback(async (chapterId: string) => {
    const entry = chapterProgressList.find((c) => c.chapter.id === chapterId);
    if (!entry) return;
    setChapterPlanLoading(true);
    try {
      const visitedPages = getVisitedPages(bookId);
      const notes = getNotesByBook(bookId);
      const recallSets = getRecallSetsByBook(bookId);
      const studyGuides = await getStudyGuidesByBook(bookId);
      const plan = buildChapterPlan(bookId, entry.chapter, entry.progress, { visitedPages, notes, recallSets, studyGuides });
      setActiveChapterPlan(plan);
      setView("chapterplan");
      console.log("[STUDYPLAN_CHAPTER_PLAN_BUILT]", { chapterId, blocks: plan.blocks.length });
    } finally {
      setChapterPlanLoading(false);
    }
  }, [bookId, chapterProgressList]);

  // ── Render: shared plan block list (used by both diagnostic plans and chapter plans) ──

  const renderBlocks = (blocks: StudyPlanBlock[]) => (
    <>
      {blocks.map((block) => (
        <div key={block.id} className="rounded-xl border border-slate-700 bg-slate-900 p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold text-white">{block.title}</div>
            <div className="text-[10px] text-slate-500">~{block.estimatedMinutes} min</div>
          </div>
          <div className="flex flex-col gap-2 mt-3">
            {block.actions.map((action, ai) => (
              <button
                key={ai}
                onClick={() => action.page && onNavigateToPage?.(action.page)}
                disabled={!action.page}
                className={`text-left text-sm rounded-lg border px-3 py-2 transition-colors ${
                  action.page
                    ? "border-slate-700 bg-slate-800/60 text-slate-200 hover:border-indigo-500/60 hover:bg-indigo-950/30 cursor-pointer"
                    : "border-slate-800 bg-slate-800/30 text-slate-400 cursor-default"
                }`}
              >
                <span className="mr-2">{ACTION_ICON[action.type] ?? "•"}</span>
                {action.label}
                {action.page && <span className="ml-2 text-[10px] text-indigo-400">→ p.{action.page}</span>}
              </button>
            ))}
          </div>
        </div>
      ))}
    </>
  );

  // ── Render: course progress banner (always visible once Syllabus has chapters) ──

  const renderCourseBanner = () => {
    if (!courseProgress || chapterProgressList.length === 0) return null;
    return (
      <div className="rounded-xl border border-indigo-500/40 bg-indigo-950/20 p-4 m-4 mb-0">
        <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-indigo-300">Course Progress</div>
        <div className="text-sm text-indigo-100 mt-1">
          {courseProgress.completedChapters}/{courseProgress.totalChapters} chapters mastered · {courseProgress.remainingChapters} remaining · ~{courseProgress.estimatedRemainingMinutes}min left
        </div>
        <div className="mt-2 grid grid-cols-4 gap-2 text-[11px] text-indigo-300/80">
          <span>Read {courseProgress.overallReadPct}%</span>
          <span>Understand {courseProgress.overallUnderstandPct}%</span>
          <span>Recall {courseProgress.overallRecallPct}%</span>
          <span>Mastery {courseProgress.overallMasteryPct}%</span>
        </div>
      </div>
    );
  };

  // ── Render: chapters list (sourced from the Syllabus chapter-progress engine) ──

  const renderChapters = () => (
    <div className="p-4 flex flex-col gap-2">
      {chapterProgressList.length === 0 ? (
        <div className="text-sm text-slate-500 py-4 text-center">
          No chapters yet — upload a syllabus in the Syllabus tab to unlock chapter plans.
        </div>
      ) : (
        chapterProgressList.map(({ chapter, progress }) => {
          const isCurrent = chapter.id === courseProgress?.currentChapterId;
          return (
            <button
              key={chapter.id}
              onClick={() => handleBuildChapterPlan(chapter.id)}
              disabled={chapterPlanLoading}
              className={`w-full text-left rounded-xl border px-3 py-2.5 transition-colors disabled:opacity-50 ${
                isCurrent ? "border-fuchsia-500/50 bg-fuchsia-950/20 hover:bg-fuchsia-950/40" : "border-slate-700 bg-slate-900 hover:border-slate-600"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-white">{progress.title}</span>
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${STATUS_CLASS[progress.status]}`}>
                  {STATUS_LABEL[progress.status]}
                </span>
              </div>
              <div className="mt-1 text-[11px] text-slate-400">
                Read {progress.readPct}% · Understand {progress.understandPct}% · Recall {progress.recallPct}% · Mastery {progress.masteryPct}%
              </div>
            </button>
          );
        })
      )}
    </div>
  );

  // ── Render: built chapter plan ──────────────────────────────────────────

  const renderChapterPlan = () => {
    if (!activeChapterPlan) return null;
    return (
      <div className="p-4 flex flex-col gap-4">
        <div className="rounded-xl border border-fuchsia-500/40 bg-fuchsia-950/20 p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-fuchsia-300">Chapter Plan</div>
          <div className="text-sm text-fuchsia-100 mt-1">{activeChapterPlan.chapterTitle}</div>
          <div className="mt-2 grid grid-cols-4 gap-2 text-[11px] text-fuchsia-300/80">
            <span>Read {activeChapterPlan.readPct}%</span>
            <span>Understand {activeChapterPlan.understandPct}%</span>
            <span>Recall {activeChapterPlan.recallPct}%</span>
            <span>Mastery {activeChapterPlan.masteryPct}%</span>
          </div>
        </div>
        {renderBlocks(activeChapterPlan.blocks)}
        <button
          onClick={() => setView("chapters")}
          className="w-full py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-bold transition-colors"
        >
          ← Back to Chapters
        </button>
      </div>
    );
  };

  // ── Render: intro ──────────────────────────────────────────────────────

  const renderIntro = () => (
    <div className="p-5 flex flex-col gap-4">
      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
        <div className="text-sm font-bold text-white mb-1">Find out what you don't know yet</div>
        <p className="text-xs text-slate-400 leading-relaxed">
          Generates ~30 diagnostic questions covering this book's content (the pages you've opened in the Reader),
          plus your saved notes, recall cards, and study guides where available. Your missed questions reveal weak
          topics, which become a personalized study plan.
        </p>
      </div>
      {uploadedFile && (
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
          <div className="text-sm font-bold text-white mb-1">Whole-book coverage (optional)</div>
          <p className="text-xs text-slate-400 leading-relaxed mb-3">
            By default, the diagnostic only covers pages you've already opened in the Reader. Extract the
            full PDF to cover every page in the book, regardless of what you've read so far.
          </p>
          {fullExtractPages ? (
            <div className="text-xs text-green-400 bg-green-950/30 border border-green-800/40 rounded-lg px-3 py-2">
              ✓ Full PDF extracted — {fullExtractPages.length} pages ready for the diagnostic.
            </div>
          ) : (
            <button
              onClick={handleExtractFullPdf}
              disabled={fullExtractLoading}
              className="w-full py-2 rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800 text-xs font-bold transition-colors disabled:opacity-40"
            >
              {fullExtractLoading ? "Extracting Full PDF…" : "📄 Extract Full PDF for Whole-Book Coverage"}
            </button>
          )}
          {fullExtractError && (
            <div className="text-xs text-red-400 bg-red-950/30 border border-red-800/40 rounded-lg px-3 py-2 mt-2">
              {fullExtractError}
            </div>
          )}
        </div>
      )}
      {error && (
        <div className="text-xs text-red-400 bg-red-950/30 border border-red-800/40 rounded-lg px-3 py-2">{error}</div>
      )}
      <button
        onClick={handleGenerateDiagnostic}
        disabled={loading}
        className="w-full py-3 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm transition-colors shadow-lg shadow-fuchsia-900/30"
      >
        {loading ? "Building Diagnostic Test…" : "🧪 Generate Diagnostic Test (~30 Qs)"}
      </button>
    </div>
  );

  // ── Render: quiz ───────────────────────────────────────────────────────

  const renderQuiz = () => {
    if (!activeAttempt) return null;
    const answeredCount = draftAnswers.size;
    return (
      <div className="p-4 flex flex-col gap-4">
        <div className="rounded-xl border border-fuchsia-700/40 bg-fuchsia-950/20 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
          <div className="text-xs text-fuchsia-300 font-semibold">
            Diagnostic Test — {answeredCount} / {activeAttempt.questions.length} answered
          </div>
          <button
            onClick={handleSubmit}
            disabled={answeredCount === 0}
            className="text-xs font-bold px-3 py-1.5 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-40 text-white transition-colors"
          >
            Submit Diagnostic
          </button>
        </div>
        {activeAttempt.questions.map((q, i) => (
          <div key={q.id} className="rounded-xl border border-slate-700 bg-slate-900 p-4">
            <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">
              Q{i + 1} · {q.topic}{q.page ? ` · p.${q.page}` : ""}
            </div>
            <div className="text-sm text-slate-100 mb-3">{q.question}</div>
            <div className="flex flex-col gap-2">
              {q.options.map((opt, oi) => (
                <label
                  key={oi}
                  className={`text-sm rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                    draftAnswers.get(q.id) === oi
                      ? "border-fuchsia-500 bg-fuchsia-950/40 text-fuchsia-200"
                      : "border-slate-700 bg-slate-800/60 text-slate-300 hover:border-slate-600"
                  }`}
                >
                  <input
                    type="radio"
                    name={q.id}
                    className="hidden"
                    checked={draftAnswers.get(q.id) === oi}
                    onChange={() => setDraftAnswers(prev => new Map(prev).set(q.id, oi))}
                  />
                  {opt}
                </label>
              ))}
            </div>
          </div>
        ))}
        <button
          onClick={handleSubmit}
          disabled={answeredCount === 0}
          className="w-full py-3 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm transition-colors"
        >
          Submit Diagnostic ({answeredCount}/{activeAttempt.questions.length} answered)
        </button>
      </div>
    );
  };

  // ── Render: results ────────────────────────────────────────────────────

  const renderResults = () => {
    if (!activeAttempt) return null;
    const isScored = activeAttempt.answers.length > 0;
    return (
      <div className="p-4 flex flex-col gap-4">
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">Diagnostic Results</div>
          <div className="text-2xl font-bold text-white mt-1">{isScored ? `${activeAttempt.scorePct}%` : "—"}</div>
          <div className="text-xs text-slate-500 mt-0.5">
            {activeAttempt.questions.length} questions · {new Date(activeAttempt.createdAt).toLocaleString()}
          </div>
        </div>

        {error && (
          <div className="text-xs text-red-400 bg-red-950/30 border border-red-800/40 rounded-lg px-3 py-2">{error}</div>
        )}

        {activeAttempt.weakTopics.length > 0 ? (
          <div className="rounded-xl border border-orange-500/40 bg-orange-950/20 p-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-orange-300 mb-3">Weak Topics</div>
            <div className="flex flex-col gap-2">
              {activeAttempt.weakTopics.map((wt, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <div className="text-orange-100">
                    {wt.topic}
                    {wt.pages.length > 0 && (
                      <span className="text-orange-400/70 text-[11px] ml-2">
                        {wt.pages.map(p => `p.${p}`).join(", ")}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-orange-300 font-semibold">{wt.missed}/{wt.total} missed</div>
                </div>
              ))}
            </div>
          </div>
        ) : isScored ? (
          <div className="rounded-xl border border-green-500/40 bg-green-950/20 p-4 text-sm text-green-200">
            🎉 No weak topics found — great work! Generate a new diagnostic later to keep checking.
          </div>
        ) : null}

        {isScored && activeAttempt.weakTopics.length > 0 && (
          <button
            onClick={handleBuildPlan}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-colors shadow-lg shadow-indigo-900/30"
          >
            🗓 Build Study Plan from Weak Topics
          </button>
        )}

        <button
          onClick={handleGenerateDiagnostic}
          disabled={loading}
          className="w-full py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-bold transition-colors disabled:opacity-40"
        >
          {loading ? "Building…" : "🔄 Retake Diagnostic"}
        </button>
      </div>
    );
  };

  // ── Render: plan ───────────────────────────────────────────────────────

  const renderPlan = () => {
    if (!activePlan) return null;
    return (
      <div className="p-4 flex flex-col gap-4">
        <div className="rounded-xl border border-indigo-500/40 bg-indigo-950/20 p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-indigo-300">Study Plan</div>
          <div className="text-sm text-indigo-100 mt-1">
            {activePlan.blocks.length} session{activePlan.blocks.length !== 1 ? "s" : ""} from {activePlan.weakTopics.length} weak topic{activePlan.weakTopics.length !== 1 ? "s" : ""}
          </div>
          <div className="text-[11px] text-indigo-400/70 mt-0.5">{new Date(activePlan.createdAt).toLocaleString()}</div>
        </div>

        {renderBlocks(activePlan.blocks)}

        <button
          onClick={handleGenerateDiagnostic}
          disabled={loading}
          className="w-full py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-bold transition-colors disabled:opacity-40"
        >
          {loading ? "Building…" : "🔄 Take New Diagnostic"}
        </button>
      </div>
    );
  };

  // ── Render: history ────────────────────────────────────────────────────

  const renderHistory = () => (
    <div className="p-4 flex flex-col gap-4">
      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-2">Diagnostics</div>
        {diagnostics.length === 0 ? (
          <div className="text-sm text-slate-500 py-4 text-center">No diagnostics taken yet for this book.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {diagnostics.map(d => (
              <button
                key={d.id}
                onClick={() => { setActiveAttempt(d); setActivePlan(null); setView("results"); }}
                className="text-left rounded-xl border border-slate-700 bg-slate-900 p-3 hover:border-fuchsia-700/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm text-white">{d.answers.length > 0 ? `${d.scorePct}%` : "Not scored"}</div>
                  <div className="text-[10px] text-slate-500">{new Date(d.createdAt).toLocaleDateString()}</div>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {d.questions.length} questions · {d.weakTopics.length} weak topics
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-2">Study Plans</div>
        {plans.length === 0 ? (
          <div className="text-sm text-slate-500 py-4 text-center">No study plans generated yet for this book.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {plans.map(p => (
              <button
                key={p.id}
                onClick={() => {
                  setActivePlan(p);
                  setActiveAttempt(diagnostics.find(d => d.id === p.diagnosticId) ?? null);
                  setView("plan");
                }}
                className="text-left rounded-xl border border-slate-700 bg-slate-900 p-3 hover:border-indigo-700/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm text-white">{p.blocks.length} sessions</div>
                  <div className="text-[10px] text-slate-500">{new Date(p.createdAt).toLocaleDateString()}</div>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">{p.weakTopics.length} weak topics</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-slate-950 text-white overflow-hidden">
      <div className="flex-shrink-0 border-b border-slate-800 px-5 py-3.5 flex items-center justify-between bg-gradient-to-r from-slate-950 to-slate-900">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-fuchsia-400">Study Plan Lab</div>
          <div className="text-xs text-slate-500 mt-0.5">Diagnostic-driven — find weak spots, build a plan to fix them.</div>
        </div>
        <div className="flex gap-2">
          {chapterProgressList.length > 0 && (
            <button
              onClick={() => setView(activeChapterPlan ? "chapterplan" : "chapters")}
              className={`text-xs px-3 py-1 rounded-lg transition-colors ${view === "chapters" || view === "chapterplan" ? "bg-fuchsia-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"}`}
            >
              Chapters
            </button>
          )}
          {activeAttempt && (
            <button
              onClick={() => setView(activeAttempt.answers.length > 0 ? "results" : "quiz")}
              className={`text-xs px-3 py-1 rounded-lg transition-colors ${view === "results" || view === "quiz" ? "bg-fuchsia-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"}`}
            >
              Diagnostic
            </button>
          )}
          {activePlan && (
            <button
              onClick={() => setView("plan")}
              className={`text-xs px-3 py-1 rounded-lg transition-colors ${view === "plan" ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"}`}
            >
              Plan
            </button>
          )}
          <button
            onClick={() => setView("history")}
            className={`text-xs px-3 py-1 rounded-lg transition-colors ${view === "history" ? "bg-slate-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"}`}
          >
            History ({diagnostics.length})
          </button>
        </div>
      </div>

      {renderCourseBanner()}

      <div className="flex-1 overflow-y-auto">
        {provider === "fallback" && (
          <div className="text-xs text-orange-400 bg-orange-950/30 border border-orange-800/40 rounded-lg px-3 py-2 m-4">
            ⚠ AI unavailable — could not generate diagnostic questions.
          </div>
        )}
        {provider === "openai+claude" && (
          <div className="text-xs text-green-400 bg-green-950/30 border border-green-800/40 rounded-lg px-3 py-2 m-4">
            ✓ Generated with Claude (whole-document topic mapping) + OpenAI (question writing).
          </div>
        )}
        {view === "intro" && renderIntro()}
        {view === "quiz" && renderQuiz()}
        {view === "results" && renderResults()}
        {view === "plan" && renderPlan()}
        {view === "chapters" && renderChapters()}
        {view === "chapterplan" && renderChapterPlan()}
        {view === "history" && renderHistory()}
      </div>
    </div>
  );
}
