"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatTime, isTimeWarning, DAT_SECTIONS } from "@/types/apex-exam";
import type { GeneratedExam } from "@/lib/apex/examGenerator";
import type { DATQuestion } from "@/types/apex-exam";
import { loadPendingExam, deletePendingExam } from "@/lib/db/examStore";
import { safeSetItem } from "@/lib/storage/safeStorage";
import { saveAttempt } from "@/lib/datApex/idbStore";
import type { DatAttempt } from "@/lib/datApex/types";
import type { DatSectionId } from "@/lib/datApex/blueprint";
import { scoreDatAttempt } from "@/lib/datApex/scoring";
import { updateReadinessAfterAttempt } from "@/lib/datApex/readinessUpdater";

/* ─── Section display metadata ───────────────────────────────────────────────── */

const SECTION_COLORS: Record<string, { bg: string; text: string; border: string; ring: string }> = {
  "survey-natural-sciences": { bg: "bg-purple-900/30", text: "text-purple-300", border: "border-purple-500/40", ring: "ring-purple-500" },
  "perceptual-ability":      { bg: "bg-yellow-900/30", text: "text-yellow-300", border: "border-yellow-500/40", ring: "ring-yellow-500" },
  "reading-comprehension":   { bg: "bg-pink-900/30",   text: "text-pink-300",   border: "border-pink-500/40",   ring: "ring-pink-500"   },
  "quantitative-reasoning":  { bg: "bg-teal-900/30",   text: "text-teal-300",   border: "border-teal-500/40",   ring: "ring-teal-500"   },
};
const DEFAULT_COLORS = { bg: "bg-gray-900/30", text: "text-gray-300", border: "border-gray-500/40", ring: "ring-gray-500" };

const SECTION_NAMES: Record<string, string> = {
  "survey-natural-sciences": "Survey of Natural Sciences",
  "perceptual-ability":      "Perceptual Ability Test",
  "reading-comprehension":   "Reading Comprehension",
  "quantitative-reasoning":  "Quantitative Reasoning",
};

const SECTION_SHORT: Record<string, string> = {
  "survey-natural-sciences": "SNS",
  "perceptual-ability":      "PAT",
  "reading-comprehension":   "RC",
  "quantitative-reasoning":  "QR",
};

// Real DAT: optional 15-min break after PAT
const BREAK_AFTER_SECTION  = "perceptual-ability";
const BREAK_DURATION_SECS  = 15 * 60;

/* ─── Types ──────────────────────────────────────────────────────────────────── */

type ExamPhase = "loading" | "no_exam" | "examining" | "section-transition" | "break" | "reviewing" | "submitting";

interface SectionGroup {
  sectionId:        string;
  questions:        DATQuestion[];
  timeLimitSeconds: number;
}

interface ProctorState {
  exam:                GeneratedExam;
  sections:            SectionGroup[];
  currentSectionIdx:   number;
  currentQuestionIdx:  number;
  sectionTimeRemaining: number;
  responses:           Record<string, string>;
  flagged:             Set<string>;
  isPaused:            boolean;
  startTime:           string;
  breakTimeRemaining:  number;
  isProctored:         boolean; // Prometric/strict mode — no pause, section-locked
  pendingExamId:       string | null; // IDB key for cleanup on submit
}

/* ─── Helpers ────────────────────────────────────────────────────────────────── */

function groupBySections(exam: GeneratedExam): SectionGroup[] {
  // Preserve official section order from metadata
  const order = exam.metadata.sectionBreakdown.map(s => s.sectionId);
  for (const q of exam.questions) {
    if (!order.includes(q.sectionId)) order.push(q.sectionId);
  }
  return order
    .map(sectionId => {
      const meta      = exam.metadata.sectionBreakdown.find(s => s.sectionId === sectionId);
      const questions = exam.questions.filter(q => q.sectionId === sectionId);
      const timeLimit = meta?.timeLimit ?? DAT_SECTIONS.find(s => s.id === sectionId)?.timeLimit ?? 60;
      return { sectionId, questions, timeLimitSeconds: timeLimit * 60 };
    })
    .filter(g => g.questions.length > 0);
}

function sectionColors(sectionId: string) {
  return SECTION_COLORS[sectionId] ?? DEFAULT_COLORS;
}

/* ─── Component ──────────────────────────────────────────────────────────────── */

export default function ExamProctorPage() {
  const router = useRouter();
  const [phase,           setPhase]           = useState<ExamPhase>("loading");
  const [state,           setState]           = useState<ProctorState | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [autoSaveStatus,  setAutoSaveStatus]  = useState<"saved" | "saving" | "error">("saved");

  // Refs for stable callbacks that need latest state
  const stateRef    = useRef<ProctorState | null>(null);
  const submitRef   = useRef<(() => void) | null>(null);
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const breakRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { stateRef.current = state; }, [state]);

  /* ─── Load exam ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    let alive = true;
    const params      = new URLSearchParams(window.location.search);
    const examId      = params.get("examId");
    const isPrometric = params.get("prometric") === "1";

    async function loadExam() {
      let exam: GeneratedExam | null = null;

      // Primary: IDB by examId (atomic, survives hard reload)
      if (examId) {
        try { exam = await loadPendingExam(examId); } catch { /* fall through */ }
      }

      // Fallback: legacy localStorage (written by generator as backward-compat)
      if (!exam) {
        const raw = localStorage.getItem("currentExam");
        if (raw) {
          try { exam = JSON.parse(raw) as GeneratedExam; } catch { /* bad JSON */ }
        }
      }

      if (!alive) return;

      if (!exam) {
        setPhase("no_exam");
        return;
      }

      const sections    = groupBySections(exam);
      const isProctored = !!exam.config.strictMode || isPrometric;

      const s: ProctorState = {
        exam,
        sections,
        currentSectionIdx:    0,
        currentQuestionIdx:   0,
        sectionTimeRemaining: sections[0]?.timeLimitSeconds ?? exam.config.totalTimeLimit * 60,
        responses:            {},
        flagged:              new Set(),
        isPaused:             false,
        startTime:            new Date().toISOString(),
        breakTimeRemaining:   BREAK_DURATION_SECS,
        isProctored,
        pendingExamId:        examId,
      };
      setState(s);
      stateRef.current = s;
      setPhase("examining");
    }

    loadExam();
    return () => { alive = false; };
  }, []);

  /* ─── Submit exam ─────────────────────────────────────────────────────────── */

  const handleSubmitExam = useCallback(() => {
    const s = stateRef.current;
    if (!s) return;
    setPhase("submitting");

    const endTime   = new Date().toISOString();
    const attemptId = `attempt-${Date.now()}`;

    const results = {
      id:                   attemptId,
      userId:               "demo-user",
      examConfigId:         s.exam.id,
      startTime:            s.startTime,
      endTime,
      status:               "completed" as const,
      currentSectionIndex:  s.currentSectionIdx,
      currentQuestionIndex: s.currentQuestionIdx,
      totalTimeSpent:       0,
      responses:            Object.entries(s.responses).map(([questionId, answer]) => ({
        questionId,
        selectedAnswer: answer as "A" | "B" | "C" | "D" | "E",
        timeSpent:      0,
        flagged:        s.flagged.has(questionId),
        timestamp:      endTime,
      })),
      sectionTimes: [],
      lastSaved:    endTime,
      saveVersion:  1,
      _exam: s.exam,
    };

    safeSetItem("examResults", JSON.stringify(results));
    localStorage.removeItem("currentExam");
    localStorage.removeItem("examProgress");

    // Build sectionId lookup for DatAttempt responses
    const sectionIdByQuestion = new Map<string, string>();
    for (const sg of s.sections) {
      for (const q of sg.questions) sectionIdByQuestion.set(q.id, sg.sectionId);
    }

    const attempt: DatAttempt = {
      id:          attemptId,
      testFormId:  s.exam.id,
      mode:        s.exam.config.allowPause ? "practice" : "simulation",
      state:       "submitted",
      responses:   Object.entries(s.responses).map(([questionId, answer]) => ({
        questionId,
        sectionId:        (sectionIdByQuestion.get(questionId) ?? "survey-natural-sciences") as DatSectionId,
        selectedChoiceId: answer as "A" | "B" | "C" | "D" | "E",
        flagged:          s.flagged.has(questionId),
      })),
      timeRemainingSeconds: Object.fromEntries(
        s.sections.map((sg, idx) => [sg.sectionId, idx === s.currentSectionIdx ? s.sectionTimeRemaining : 0]),
      ),
      startedAt:   s.startTime,
      submittedAt: endTime,
    };

    // Fire-and-forget: persist attempt, score, update readiness, clean up pending exam
    saveAttempt(attempt)
      .then(() => {
        // Build minimal question metadata for scoring from exam questions
        const scoringQuestions = s.sections.flatMap((sg) =>
          sg.questions.map((q) => ({
            id:            q.id,
            correctAnswer: q.correctAnswer,
            topic:         q.topic,
            sectionId:     q.sectionId,
          })),
        );
        const result = scoreDatAttempt(attempt, scoringQuestions);
        // Save result back onto the attempt
        saveAttempt({ ...attempt, result }).catch(() => {});
        // Update rolling readiness state
        updateReadinessAfterAttempt("demo-user", result).catch(() => {});
      })
      .catch(() => { /* non-fatal — results are in localStorage */ });

    if (s.pendingExamId) {
      deletePendingExam(s.pendingExamId).catch(() => { /* non-fatal */ });
    }

    router.push("/apex/results");
  }, [router]);

  useEffect(() => { submitRef.current = handleSubmitExam; }, [handleSubmitExam]);

  /* ─── Advance section ─────────────────────────────────────────────────────── */

  const handleAdvanceSection = useCallback(() => {
    const s = stateRef.current;
    if (!s) return;

    const nextIdx = s.currentSectionIdx + 1;

    if (nextIdx >= s.sections.length) {
      submitRef.current?.();
      return;
    }

    const currentSectionId = s.sections[s.currentSectionIdx].sectionId;

    setState(prev => prev ? {
      ...prev,
      currentSectionIdx:    nextIdx,
      currentQuestionIdx:   0,
      sectionTimeRemaining: prev.sections[nextIdx].timeLimitSeconds,
    } : prev);

    if (currentSectionId === BREAK_AFTER_SECTION && !s.isProctored) {
      setState(prev => prev ? { ...prev, breakTimeRemaining: BREAK_DURATION_SECS } : prev);
      setPhase("break");
    } else {
      setPhase("section-transition");
    }
  }, []);

  /* ─── Section timer ───────────────────────────────────────────────────────── */

  useEffect(() => {
    if (phase !== "examining") return;
    if (!state || state.isPaused) return;

    timerRef.current = setInterval(() => {
      setState(prev => {
        if (!prev || prev.isPaused) return prev;
        const next = prev.sectionTimeRemaining - 1;
        if (next <= 0) {
          // Schedule section advance outside setState (can't call setState inside setState)
          setTimeout(() => handleAdvanceSection(), 0);
          return { ...prev, sectionTimeRemaining: 0 };
        }
        return { ...prev, sectionTimeRemaining: next };
      });
    }, 1000);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase, state?.isPaused, state?.currentSectionIdx, handleAdvanceSection]);

  /* ─── Break timer ─────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (phase !== "break") return;

    breakRef.current = setInterval(() => {
      setState(prev => {
        if (!prev) return prev;
        const next = prev.breakTimeRemaining - 1;
        if (next <= 0) {
          setPhase("section-transition");
          return { ...prev, breakTimeRemaining: 0 };
        }
        return { ...prev, breakTimeRemaining: next };
      });
    }, 1000);

    return () => { if (breakRef.current) clearInterval(breakRef.current); };
  }, [phase]);

  /* ─── Auto-save ───────────────────────────────────────────────────────────── */

  // Auto-save: mount-only effect — uses stateRef so the interval always reads
  // the latest state without restarting the 30-second clock on every answer.
  useEffect(() => {
    autoSaveRef.current = setInterval(() => {
      const s = stateRef.current;
      if (!s) return;
      setAutoSaveStatus("saving");
      try {
        localStorage.setItem("examProgress", JSON.stringify({
          exam: s.exam,
          currentState: {
            currentSectionIdx:    s.currentSectionIdx,
            currentQuestionIdx:   s.currentQuestionIdx,
            sectionTimeRemaining: s.sectionTimeRemaining,
            responses:            s.responses,
            flagged:              Array.from(s.flagged),
          },
        }));
        setAutoSaveStatus("saved");
      } catch {
        setAutoSaveStatus("error");
      }
    }, 30_000);
    return () => { if (autoSaveRef.current) clearInterval(autoSaveRef.current); };
  }, []);

  /* ─── Keyboard shortcuts ──────────────────────────────────────────────────── */

  // Use functional setState so the handler is always stable and never has TDZ/stale issues.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      setState(prev => {
        if (!prev) return prev;
        const section = prev.sections[prev.currentSectionIdx];
        const q       = section?.questions[prev.currentQuestionIdx];
        if (!q) return prev;

        if (e.key >= "1" && e.key <= "5") {
          const keys = Object.keys(q.options);
          const idx  = parseInt(e.key) - 1;
          if (idx < keys.length)
            return { ...prev, responses: { ...prev.responses, [q.id]: keys[idx] } };
        }
        if (e.key === "f" || e.key === "F") {
          e.preventDefault();
          const nf = new Set(prev.flagged);
          if (nf.has(q.id)) nf.delete(q.id); else nf.add(q.id);
          return { ...prev, flagged: nf };
        }
        if (e.key === "ArrowLeft" || e.key === "p") {
          e.preventDefault();
          return { ...prev, currentQuestionIdx: Math.max(0, prev.currentQuestionIdx - 1) };
        }
        if (e.key === "ArrowRight" || e.key === "n") {
          e.preventDefault();
          const maxIdx = (section?.questions.length ?? 1) - 1;
          return { ...prev, currentQuestionIdx: Math.min(maxIdx, prev.currentQuestionIdx + 1) };
        }
        return prev;
      });
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  /* ─── Interaction handlers ────────────────────────────────────────────────── */

  const handleAnswer = (questionId: string, answer: string) =>
    setState(prev => prev ? { ...prev, responses: { ...prev.responses, [questionId]: answer } } : prev);

  const handleFlag = (questionId: string) =>
    setState(prev => {
      if (!prev) return prev;
      const nf = new Set(prev.flagged);
      if (nf.has(questionId)) nf.delete(questionId); else nf.add(questionId);
      return { ...prev, flagged: nf };
    });

  const handleNav = (idx: number) =>
    setState(prev => {
      if (!prev) return prev;
      const maxIdx = (prev.sections[prev.currentSectionIdx]?.questions.length ?? 1) - 1;
      return { ...prev, currentQuestionIdx: Math.max(0, Math.min(maxIdx, idx)) };
    });

  const handleEndSection = () => {
    setShowReviewModal(false);
    handleAdvanceSection();
  };

  /* ─── Phase: loading ──────────────────────────────────────────────────────── */

  if (phase === "loading") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto mb-4" />
          <p className="text-gray-300">Loading exam…</p>
        </div>
      </div>
    );
  }

  if (phase === "no_exam" || !state) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold mb-4">No Exam Found</h1>
          <p className="text-gray-300 mb-6">Please generate an exam first.</p>
          <Link href="/apex/generator" className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg font-semibold transition-colors">
            Create Practice Exam
          </Link>
        </div>
      </div>
    );
  }

  /* ─── Phase: submitting ───────────────────────────────────────────────────── */

  if (phase === "submitting") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto mb-4" />
          <h1 className="text-xl font-semibold">Submitting exam…</h1>
        </div>
      </div>
    );
  }

  /* ─── Phase: section-transition ───────────────────────────────────────────── */

  if (phase === "section-transition") {
    const nextSection = state.sections[state.currentSectionIdx];
    const cols = nextSection ? sectionColors(nextSection.sectionId) : DEFAULT_COLORS;
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-950 to-gray-900 text-white flex items-center justify-center">
        <div className="max-w-md w-full text-center px-6">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-2xl font-bold mb-2">Section Complete!</h2>
          <p className="text-gray-400 mb-6">
            {nextSection
              ? `Next: Section ${state.currentSectionIdx + 1} of ${state.sections.length}`
              : "All sections done"}
          </p>
          {nextSection && (
            <div className={`${cols.bg} ${cols.border} border rounded-2xl p-5 mb-6 text-left`}>
              <div className={`text-xs font-bold uppercase tracking-wide mb-1 ${cols.text}`}>
                {SECTION_SHORT[nextSection.sectionId] ?? nextSection.sectionId}
              </div>
              <div className="text-white font-bold text-lg">
                {SECTION_NAMES[nextSection.sectionId] ?? nextSection.sectionId}
              </div>
              <div className="text-gray-400 text-sm mt-1.5 flex items-center gap-3">
                <span>{nextSection.questions.length} questions</span>
                <span>·</span>
                <span>{Math.round(nextSection.timeLimitSeconds / 60)} min</span>
              </div>
            </div>
          )}
          <button
            onClick={() => setPhase("examining")}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-colors"
          >
            Begin Section →
          </button>
        </div>
      </div>
    );
  }

  /* ─── Phase: break ────────────────────────────────────────────────────────── */

  if (phase === "break") {
    const nextSection = state.sections[state.currentSectionIdx];
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-950 to-gray-900 text-white flex items-center justify-center">
        <div className="max-w-md w-full text-center px-6">
          <div className="text-5xl mb-4">☕</div>
          <h2 className="text-2xl font-bold mb-2">Optional Break</h2>
          <p className="text-gray-400 mb-4">Take up to 15 minutes. Your section timer is paused.</p>
          <div className="text-6xl font-mono font-bold text-blue-400 mb-6 tabular-nums">
            {formatTime(state.breakTimeRemaining)}
          </div>
          {nextSection && (
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-6 text-sm text-left">
              <div className="text-gray-400 text-xs mb-1">Next section:</div>
              <div className="text-white font-semibold">
                {SECTION_NAMES[nextSection.sectionId] ?? nextSection.sectionId}
              </div>
              <div className="text-gray-400 text-xs mt-1">
                {nextSection.questions.length} questions · {Math.round(nextSection.timeLimitSeconds / 60)} min
              </div>
            </div>
          )}
          <button
            onClick={() => setPhase("section-transition")}
            className="w-full py-3 bg-green-600 hover:bg-green-500 text-white font-semibold rounded-xl transition-colors"
          >
            End Break & Continue →
          </button>
        </div>
      </div>
    );
  }

  /* ─── Phase: examining ────────────────────────────────────────────────────── */

  const currentSection  = state.sections[state.currentSectionIdx];
  const currentQuestion = currentSection?.questions[state.currentQuestionIdx] ?? null;

  if (!currentSection || !currentQuestion) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">❓</div>
          <h1 className="text-2xl font-bold mb-4">Question Not Found</h1>
          <Link href="/apex" className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg font-semibold transition-colors">
            Back to Hub
          </Link>
        </div>
      </div>
    );
  }

  const cols            = sectionColors(currentSection.sectionId);
  const isWarnTime      = isTimeWarning(state.sectionTimeRemaining, currentSection.timeLimitSeconds);
  const sectionProgress = ((state.currentQuestionIdx + 1) / currentSection.questions.length) * 100;

  const answeredInSection = currentSection.questions.filter(q => state.responses[q.id]).length;
  const flaggedInSection  = currentSection.questions.filter(q => state.flagged.has(q.id)).length;
  const unansweredTotal   = state.sections.reduce((sum, sg) =>
    sum + sg.questions.filter(q => !state.responses[q.id]).length, 0);
  const flaggedTotal = state.flagged.size;
  const isLastSection = state.currentSectionIdx === state.sections.length - 1;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-950 to-gray-900 text-white flex flex-col">

      {/* ── Pause overlay ─── */}
      {state.isPaused && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-2xl p-8 text-center max-w-sm w-full">
            <div className="text-4xl mb-4">⏸️</div>
            <h2 className="text-xl font-bold mb-4">Exam Paused</h2>
            <p className="text-gray-400 text-sm mb-6">Your section timer is paused. Click Resume when ready.</p>
            <button
              onClick={() => setState(prev => prev ? { ...prev, isPaused: false } : prev)}
              className="w-full py-3 bg-green-600 hover:bg-green-500 rounded-xl font-semibold transition-colors"
            >
              ▶ Resume Exam
            </button>
          </div>
        </div>
      )}

      {/* ── Pre-submit review modal ─── */}
      {showReviewModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 border border-white/10 rounded-2xl p-6 max-w-md w-full">
            <h2 className="text-xl font-bold mb-1">
              {isLastSection ? "Submit Exam?" : "End Section?"}
            </h2>
            <p className="text-gray-400 text-sm mb-5">
              {isLastSection
                ? "Once submitted you cannot change your answers."
                : "You cannot return to this section."}
            </p>

            <div className="space-y-2.5 mb-5">
              {state.sections.map((sg, idx) => {
                const ans   = sg.questions.filter(q => state.responses[q.id]).length;
                const flag  = sg.questions.filter(q => state.flagged.has(q.id)).length;
                const unans = sg.questions.length - ans;
                const c     = sectionColors(sg.sectionId);
                const isCur = idx === state.currentSectionIdx;
                const done  = idx < state.currentSectionIdx;
                return (
                  <div key={sg.sectionId} className={`${c.bg} ${c.border} border rounded-xl p-3 ${!done && !isCur ? "opacity-40" : ""}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-bold ${c.text}`}>
                        {SECTION_SHORT[sg.sectionId] ?? sg.sectionId} · {SECTION_NAMES[sg.sectionId] ?? sg.sectionId}
                      </span>
                      <span className="text-[10px] text-gray-500">
                        {done ? "✓ done" : isCur ? "current" : "upcoming"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-emerald-400">✓ {ans}</span>
                      {unans > 0 && <span className="text-gray-400">○ {unans} blank</span>}
                      {flag > 0  && <span className="text-yellow-400">🚩 {flag}</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            {unansweredTotal > 0 && isLastSection && (
              <div className="bg-yellow-900/30 border border-yellow-500/30 rounded-xl p-3 mb-4 text-sm text-yellow-200">
                ⚠️ {unansweredTotal} question{unansweredTotal !== 1 ? "s" : ""} left blank. Unanswered questions count as wrong on the DAT.
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setShowReviewModal(false)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 px-4 py-2.5 rounded-xl font-semibold text-sm transition-colors"
              >
                ← Keep Reviewing
              </button>
              <button
                onClick={isLastSection ? handleSubmitExam : handleEndSection}
                className={`flex-1 px-4 py-2.5 rounded-xl font-semibold text-sm transition-colors ${
                  isLastSection
                    ? "bg-red-600 hover:bg-red-500 text-white"
                    : "bg-indigo-600 hover:bg-indigo-500 text-white"
                }`}
              >
                {isLastSection ? "Submit Exam" : "End Section →"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ─── */}
      <header className="flex-shrink-0 bg-gray-900/80 backdrop-blur-sm border-b border-white/8">
        <div className="px-4 py-3 flex items-center justify-between gap-3">

          {/* Section badge + info */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <span className={`flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-md ${cols.bg} ${cols.text} border ${cols.border}`}>
              {SECTION_SHORT[currentSection.sectionId] ?? "SEC"}
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white truncate hidden sm:block">
                {SECTION_NAMES[currentSection.sectionId] ?? currentSection.sectionId}
              </div>
              <div className="text-[10px] text-gray-400 tabular-nums">
                Sec {state.currentSectionIdx + 1}/{state.sections.length} · Q{state.currentQuestionIdx + 1}/{currentSection.questions.length}
              </div>
            </div>
          </div>

          {/* Timer */}
          <div className={`flex-shrink-0 text-lg font-mono font-bold px-3 py-1 rounded-lg tabular-nums ${
            isWarnTime ? "bg-red-600 text-white animate-pulse" : "bg-gray-800 text-white"
          }`}>
            {formatTime(state.sectionTimeRemaining)}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`text-xs hidden md:inline ${
              autoSaveStatus === "saved"  ? "text-green-400" :
              autoSaveStatus === "saving" ? "text-blue-400"  : "text-red-400"
            }`}>
              {autoSaveStatus === "saved" ? "✓" : autoSaveStatus === "saving" ? "…" : "⚠"}
            </span>

            {!state.isProctored && state.exam.config.allowPause && (
              <button
                onClick={() => setState(prev => prev ? { ...prev, isPaused: !prev.isPaused } : prev)}
                className="text-xs px-2.5 py-1.5 rounded-lg bg-yellow-700/30 hover:bg-yellow-700/50 text-yellow-200 border border-yellow-600/20 transition-colors"
              >
                {state.isPaused ? "▶" : "⏸"}
              </button>
            )}

            <button
              onClick={() => setShowReviewModal(true)}
              className="text-xs px-3 py-1.5 rounded-lg bg-red-700/30 hover:bg-red-700/50 text-red-200 border border-red-600/20 transition-colors font-semibold"
            >
              {isLastSection ? "Submit" : "End Section"}
            </button>
          </div>
        </div>

        {/* Section progress bar */}
        <div className="h-0.5 bg-white/5">
          <div
            className={`h-full transition-all duration-300 ${cols.text.replace("text-", "bg-").replace("-300", "-500")}`}
            style={{ width: `${sectionProgress}%` }}
          />
        </div>
      </header>

      {/* ── Main ─── */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto p-4 space-y-4 pb-8">

          {/* Question card */}
          <div className={`${cols.bg} border ${cols.border} rounded-2xl p-5`}>
            <div className="flex items-center justify-between mb-4 gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex-shrink-0 bg-blue-600 text-white px-3 py-1 rounded-full text-sm font-bold">
                  Q{state.currentQuestionIdx + 1}
                </span>
                <span className="text-sm text-gray-400 truncate">
                  {currentQuestion.topic}{currentQuestion.difficulty && ` · ${currentQuestion.difficulty}`}
                </span>
              </div>
              <button
                onClick={() => handleFlag(currentQuestion.id)}
                className={`flex-shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                  state.flagged.has(currentQuestion.id)
                    ? "bg-yellow-600 text-white"
                    : "bg-gray-700/50 hover:bg-gray-700 text-gray-300"
                }`}
              >
                🚩 {state.flagged.has(currentQuestion.id) ? "Flagged" : "Flag"}
              </button>
            </div>

            <p className="text-base leading-relaxed mb-6 text-gray-100">{currentQuestion.stem}</p>

            <div className="space-y-2.5">
              {Object.entries(currentQuestion.options).map(([key, value]) => (
                <label
                  key={key}
                  className={`flex items-start gap-3 p-4 rounded-xl cursor-pointer transition-all border-2 ${
                    state.responses[currentQuestion.id] === key
                      ? "bg-blue-600/20 border-blue-500 text-white"
                      : "bg-white/5 border-transparent hover:bg-white/10 hover:border-white/20 text-gray-200"
                  }`}
                >
                  <input
                    type="radio"
                    name={`q-${currentQuestion.id}`}
                    value={key}
                    checked={state.responses[currentQuestion.id] === key}
                    onChange={() => handleAnswer(currentQuestion.id, key)}
                    className="mt-0.5 accent-blue-500 flex-shrink-0"
                  />
                  <span className="font-bold text-blue-400 mr-1 flex-shrink-0">{key}.</span>
                  <span className="flex-1 text-sm">{value as string}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Navigation bar */}
          <div className="flex items-center justify-between gap-4">
            <button
              onClick={() => handleNav(state.currentQuestionIdx - 1)}
              disabled={state.currentQuestionIdx === 0}
              className="flex items-center gap-2 px-4 py-2 bg-gray-700/50 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl text-sm transition-colors"
            >
              ← Prev
            </button>

            <div className="flex items-center gap-3 text-[10px] text-gray-500 hidden sm:flex">
              <span>1–5: answer</span>
              <span>F: flag</span>
              <span>←→ or P/N: navigate</span>
            </div>

            {state.currentQuestionIdx < currentSection.questions.length - 1 ? (
              <button
                onClick={() => handleNav(state.currentQuestionIdx + 1)}
                className="flex items-center gap-2 px-4 py-2 bg-gray-700/50 hover:bg-gray-700 rounded-xl text-sm transition-colors"
              >
                Next →
              </button>
            ) : (
              <button
                onClick={() => setShowReviewModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600/50 hover:bg-indigo-600 rounded-xl text-sm font-semibold transition-colors"
              >
                {isLastSection ? "Submit Exam →" : "End Section →"}
              </button>
            )}
          </div>

          {/* Question navigator */}
          <div className="bg-gray-800/40 border border-white/8 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h3 className="text-sm font-semibold text-white">Question Navigator</h3>
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <span className="text-emerald-400">✓ {answeredInSection}</span>
                {flaggedInSection > 0 && <span className="text-yellow-400">🚩 {flaggedInSection}</span>}
                <span>{currentSection.questions.length - answeredInSection} blank</span>
              </div>
            </div>

            {/* Section tabs — shown only for multi-section exams */}
            {state.sections.length > 1 && (
              <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
                {state.sections.map((sg, idx) => {
                  const c   = sectionColors(sg.sectionId);
                  const cur = idx === state.currentSectionIdx;
                  const ans = sg.questions.filter(q => state.responses[q.id]).length;
                  const locked = state.isProctored && idx > state.currentSectionIdx;
                  return (
                    <button
                      key={sg.sectionId}
                      onClick={() => {
                        if (!locked) {
                          setState(prev => {
                            if (!prev) return prev;
                            const alreadyActive = prev.currentSectionIdx === idx;
                            return {
                              ...prev,
                              currentSectionIdx:  idx,
                              currentQuestionIdx: alreadyActive ? prev.currentQuestionIdx : 0,
                              // Preserve elapsed section time — only reset when switching TO a section
                              // for the very first time (timeLimitSeconds preserved when revisiting).
                              sectionTimeRemaining: alreadyActive
                                ? prev.sectionTimeRemaining
                                : prev.sections[idx].timeLimitSeconds,
                            };
                          });
                        }
                      }}
                      disabled={locked}
                      title={locked ? "Unavailable in Prometric mode" : SECTION_NAMES[sg.sectionId] ?? sg.sectionId}
                      className={`flex-none text-xs px-2.5 py-1.5 rounded-lg border font-semibold transition-colors ${
                        cur
                          ? `${c.bg} ${c.text} ${c.border}`
                          : locked
                          ? "bg-gray-800/50 text-gray-600 border-white/5 cursor-not-allowed"
                          : "bg-gray-700/30 text-gray-400 border-white/10 hover:bg-gray-700/50"
                      }`}
                    >
                      {SECTION_SHORT[sg.sectionId] ?? sg.sectionId}
                      {" "}
                      <span className={ans === sg.questions.length ? "text-emerald-400" : ""}>
                        {ans}/{sg.questions.length}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Question grid */}
            <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(36px, 1fr))" }}>
              {currentSection.questions.map((q, idx) => {
                const answered = !!state.responses[q.id];
                const flagged  = state.flagged.has(q.id);
                const current  = idx === state.currentQuestionIdx;
                return (
                  <button
                    key={q.id}
                    onClick={() => handleNav(idx)}
                    title={`Q${idx + 1}${answered ? " · answered" : " · blank"}${flagged ? " · flagged" : ""}`}
                    className={`h-9 rounded-lg text-xs font-bold transition-all ${
                      current
                        ? `bg-blue-600 text-white ring-2 ${cols.ring} ring-offset-1 ring-offset-gray-900`
                        : flagged && answered
                        ? "bg-yellow-600 text-white hover:bg-yellow-500"
                        : flagged
                        ? "bg-yellow-700/80 text-white hover:bg-yellow-600"
                        : answered
                        ? "bg-emerald-700 text-white hover:bg-emerald-600"
                        : "bg-gray-700/60 text-gray-300 hover:bg-gray-600"
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 mt-3 text-[10px] text-gray-400 flex-wrap">
              {[
                { cls: "bg-blue-600", label: "Current" },
                { cls: "bg-emerald-700", label: "Answered" },
                { cls: "bg-yellow-600", label: "Flagged" },
                { cls: "bg-gray-700", label: "Blank" },
              ].map(({ cls, label }) => (
                <span key={label} className="flex items-center gap-1">
                  <span className={`w-3 h-3 rounded ${cls} inline-block`} />
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* Overall progress footer */}
          {state.sections.length > 1 && (
            <div className="bg-gray-800/30 border border-white/5 rounded-xl px-4 py-3 flex items-center justify-between text-xs text-gray-400">
              <span>
                Total answered: {Object.keys(state.responses).length} /{" "}
                {state.sections.reduce((s, g) => s + g.questions.length, 0)}
              </span>
              {flaggedTotal > 0 && <span className="text-yellow-400">🚩 {flaggedTotal} flagged</span>}
              <span className={unansweredTotal === 0 ? "text-emerald-400" : ""}>
                {unansweredTotal === 0 ? "All answered ✓" : `${unansweredTotal} blank`}
              </span>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
