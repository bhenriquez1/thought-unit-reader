"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ThoughtUnit as BaseThoughtUnit, ReadingStats } from "@/types/reading";
import { saveReadingProgress, loadReadingProgress } from "@/lib/firebase";
import RightBrainToolbar from "@/components/RightBrainToolbar";
import { useStartReview } from "@/hooks/useStartReview";

import { chunkText, stableChunkId } from "@/lib/chunkers";
import { loadUnderstood, markUnderstood } from "@/lib/understoodStore";
import ProgressRing from "@/components/ProgressRing"; // ⬅️ NEW

type HRUnit = BaseThoughtUnit | string | string[] | { text?: string };

interface HybridReaderProps {
  bookId: string;
  userId: string;

  sampleText: string;
  currentPage: number;
  pdfPageCount?: number;

  readingSpeed?: number;
  isReading?: boolean;
  isPaused?: boolean;

  currentThoughtUnit: number;
  setCurrentThoughtUnit: React.Dispatch<React.SetStateAction<number>>;
  thoughtUnits: HRUnit[];

  highlightedWord: string;
  setHighlightedWord: (word: string) => void;

  stats?: ReadingStats;
  fontSize: number;
  fontFamily: string;
  lineSpacing: number;
  clickSwitchesTo?: boolean;

  onWordClick: (word: string) => void;
  setReadingSpeed?: (speed: number) => void;
  setCurrentPage: (page: number) => void;

  onTextSelect?: (text: string) => void;
  onGenerateNote?: (text: string, mnemonic?: string, mode?: "sketch" | "highYield") => void;

  selBind?: { onMouseUp?: (e: React.MouseEvent) => void };
  externalSelectionText?: string;
}

/* ---------------- helpers ---------------- */
function unitToText(u: HRUnit): string {
  if (u == null) return "";
  if (typeof u === "string") return u;
  if (Array.isArray(u)) return u.join(" ");
  const t = (u as any).text;
  return typeof t === "string" ? t : JSON.stringify(u);
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function keyTokenFromChunk(chunk: string): string | null {
  const words = (chunk || "").split(/\s+/).filter(Boolean);
  const scored = words
    .map((w) => ({
      w,
      s: (/[A-Z]\w+/.test(w) ? 2 : 0) + (w.length >= 6 ? 1 : 0) + (/\d/.test(w) ? 1 : 0),
    }))
    .sort((a, b) => b.s - a.s);
  return scored[0]?.w || null;
}

function renderOriginalWithCue(
  text: string,
  token: string | null,
  styleClasses = "bg-yellow-500/20 rounded px-0.5"
) {
  if (!token?.trim()) return <p>{text || "📄 Original text will appear here."}</p>;
  try {
    const re = new RegExp(`(${escapeRegExp(token)})`, "gi");
    const parts = (text || "").split(re);
    return (
      <p>
        {parts.map((part, i) =>
          re.test(part) ? (
            <span key={i} className={styleClasses}>
              {part}
            </span>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </p>
    );
  } catch {
    return <p>{text}</p>;
  }
}

/* ---------------- comprehension prompts ---------------- */
const COMPREHENSION_PROMPTS = [
  { label: "Explain", build: (ctx: string) => `Explain in your own words:\n\n${ctx}` },
  { label: "Analogy", build: (ctx: string) => `Create a vivid analogy for this idea:\n\n${ctx}` },
  { label: "Example", build: (ctx: string) => `Give a concrete example that demonstrates:\n\n${ctx}` },
  { label: "Why →",   build: (ctx: string) => `Why does this happen? Justify the steps:\n\n${ctx}` },
] as const;

/* ---------------- tiny quiz helper ---------------- */
function makeTwoChoiceQuiz(from: string) {
  const words = (from || "").split(/\W+/).filter((w) => w.length >= 4);
  const correct = keyTokenFromChunk(from) || words[0] || "concept";
  let distractor = correct;
  for (const w of words) {
    if (!new RegExp(`\\b${escapeRegExp(correct)}\\b`, "i").test(w)) {
      distractor = w;
      break;
    }
  }
  const options = [correct, distractor].sort(() => Math.random() - 0.5);
  const answer = options.indexOf(correct);
  return { prompt: "Which term appears in this idea?", options, answer };
}

export default function HybridReader({
  bookId,
  userId,
  thoughtUnits,
  currentThoughtUnit,
  setCurrentThoughtUnit,
  fontSize,
  fontFamily,
  lineSpacing,
  highlightedWord,
  setHighlightedWord,
  onWordClick,
  onTextSelect,
  onGenerateNote,
  sampleText,
  currentPage,
  setCurrentPage,
  readingSpeed = 200,
  setReadingSpeed,
  isReading = true,
  isPaused = false,
  selBind,
  externalSelectionText,
}: HybridReaderProps) {
  const [selectionText, setSelectionText] = useState("");
  const [promptIdx, setPromptIdx] = useState(0);

  // Right-Brain phases in Hybrid
  const [phase, setPhase] = useState<"gist" | "pattern" | "detail">("gist");

  // Local pause so we can Space-bar pause here without changing parent props
  const [localPaused, setLocalPaused] = useState(false);

  // Chunking knob
  const [chunkChars, setChunkChars] = useState(260);
  const [chunkMode, setChunkMode] = useState<"semantic" | "sentence" | "bullet-first">("semantic");

  // Understood map (Got it)
  const [understoodMap, setUnderstoodMap] = useState<Record<string, true>>({});

  // Review flow
  const { isReviewMode, currentCard, startReview, gradeCard } = useStartReview(userId);

  /* -------------------- Load saved progress -------------------- */
  useEffect(() => {
    if (!userId || !bookId) return;
    loadReadingProgress(userId, bookId).then((progress: any) => {
      if (!progress) return;
      if (typeof progress.currentPage === "number") setCurrentPage(progress.currentPage);
      if (typeof progress.currentThoughtUnit === "number")
        setCurrentThoughtUnit(progress.currentThoughtUnit);
      if (typeof progress.highlightedWord === "string") setHighlightedWord(progress.highlightedWord);
      if (typeof progress.readingSpeed === "number") setReadingSpeed?.(progress.readingSpeed);
    });
  }, [userId, bookId, setCurrentPage, setCurrentThoughtUnit, setHighlightedWord, setReadingSpeed]);

  /* -------------------- Load understood map -------------------- */
  useEffect(() => {
    if (!bookId) return;
    loadUnderstood(userId || "guest", bookId).then((m) => setUnderstoodMap(m || {})).catch(() => {});
  }, [userId, bookId]);

  /* -------------------- Throttled save progress -------------------- */
  const saveTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!userId || !bookId) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveReadingProgress(userId, bookId, {
        currentPage,
        currentThoughtUnit,
        highlightedWord,
        readingSpeed,
      }).catch(() => {});
    }, 500) as unknown as number;
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    };
  }, [userId, bookId, currentPage, currentThoughtUnit, highlightedWord, readingSpeed]);

  /* -------------------- Selection fallback -------------------- */
  const handleMouseUp = () => {
    if (typeof window === "undefined") return;
    const sel = window.getSelection()?.toString().trim() || "";
    setSelectionText(sel);
    if (sel) onTextSelect?.(sel);
  };

  /* -------------------- Empty states -------------------- */
  if (!thoughtUnits?.length) {
    return (
      <div
        className="p-4 flex items-center justify-center text-gray-400 italic"
        style={{ fontSize: `${fontSize}px`, fontFamily, lineHeight: lineSpacing }}
      >
        📂 Please upload a PDF to start Hybrid Reading.
      </div>
    );
  }

  const rawUnit = thoughtUnits[currentThoughtUnit - 1];
  if (!rawUnit) {
    return (
      <div
        className="p-4 flex items-center justify-center text-gray-400 italic"
        style={{ fontSize: `${fontSize}px`, fontFamily, lineHeight: lineSpacing }}
      >
        ⏳ Preparing your reading view...
      </div>
    );
  }

  const unitText = unitToText(rawUnit);

  /* -------------------- Idea chunks with knob -------------------- */
  const chunks = useMemo(
    () => chunkText(unitText, { mode: chunkMode, targetChars: chunkChars }),
    [unitText, chunkMode, chunkChars]
  );
  const [activeIdx, setActiveIdx] = useState(0);
  useEffect(() => setActiveIdx(0), [unitText, chunkChars, chunkMode]);

  // auto-advance only when actually reading
  useEffect(() => {
    if (!chunks.length || !isReading || isPaused || localPaused) return;
    const msPerChunk = Math.max(600, (60_000 / Math.max(120, readingSpeed)) * 1.2);
    const t = window.setInterval(() => setActiveIdx((i) => Math.min(i + 1, chunks.length - 1)), msPerChunk);
    return () => window.clearInterval(t);
  }, [chunks.length, readingSpeed, isReading, isPaused, localPaused]);

  const activeChunk = chunks[activeIdx] || "";
  const cueToken = keyTokenFromChunk(activeChunk);
  const activeChunkId = stableChunkId(activeChunk);
  const isUnderstood = !!understoodMap[activeChunkId];

  const effectiveSelection = (externalSelectionText?.trim() || selectionText).trim();

  // memoize highlight regex used in Progressive spans
  const hlRegex = useMemo(() => {
    if (!highlightedWord) return null;
    try {
      return new RegExp(`\\b${escapeRegExp(highlightedWord)}\\b`);
    } catch {
      return null;
    }
  }, [highlightedWord]);

  // comprehension prompt
  const activePrompt = COMPREHENSION_PROMPTS[promptIdx];
  const promptContext = (effectiveSelection || activeChunk || unitText || sampleText).trim();

  /* -------------------- Hotkeys -------------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const editable = (e.target as HTMLElement)?.getAttribute?.("contenteditable") === "true";
      if (tag === "INPUT" || tag === "TEXTAREA" || editable) return;

      if (e.code === "Space") {
        e.preventDefault();
        setLocalPaused((p) => !p);
      } else if (e.key === "ArrowRight" || e.key.toLowerCase() === "j") {
        setActiveIdx((i) => Math.min(i + 1, chunks.length - 1));
      } else if (e.key === "ArrowLeft" || e.key.toLowerCase() === "k") {
        setActiveIdx((i) => Math.max(i - 1, 0));
      } else if (e.key.toLowerCase() === "g") {
        e.preventDefault();
        toggleUnderstood();
      } else if (e.key.toLowerCase() === "q") {
        e.preventDefault();
        setShowQuiz(true);
      } else if (e.key === "Enter") {
        onGenerateNote?.(activePrompt.build(promptContext), undefined, "highYield");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chunks.length, promptContext, promptIdx, activeChunk]);

  /* -------------------- Understood toggle -------------------- */
  function toggleUnderstood() {
    setUnderstoodMap((m) => {
      const next = { ...m };
      if (next[activeChunkId]) delete next[activeChunkId];
      else next[activeChunkId] = true;
      return next;
    });
    markUnderstood(userId || "guest", bookId, activeChunkId).catch(() => {});
  }

  /* -------------------- Quick quiz -------------------- */
  const [showQuiz, setShowQuiz] = useState(false);
  const quiz = useMemo(() => makeTwoChoiceQuiz(activeChunk), [activeChunk]);
  const [quizPick, setQuizPick] = useState<number | null>(null);
  useEffect(() => {
    setQuizPick(null);
  }, [quiz.prompt, activeChunkId]);

  /* -------------------- Progress (percent understood) -------------------- */
  const understoodCount = useMemo(
    () => chunks.reduce((n, c) => n + (understoodMap[stableChunkId(c)] ? 1 : 0), 0),
    [chunks, understoodMap]
  );
  const understoodPct = chunks.length ? Math.round((understoodCount / chunks.length) * 100) : 0;

  /* -------------------- Main dual-panel UI -------------------- */
  return (
    <div className="grid grid-cols-2 gap-4 p-4 h-full">
      {/* Original View (left) */}
      <div
        className="bg-gray-800 p-4 rounded-lg overflow-y-auto shadow-inner"
        onMouseUp={selBind?.onMouseUp ?? handleMouseUp}
        style={{ fontSize: `${fontSize}px`, fontFamily, lineHeight: lineSpacing }}
      >
        <h4 className="text-sm font-semibold text-yellow-400 mb-3">Original View</h4>
        {renderOriginalWithCue(
          (unitText || sampleText || "📄 Original text will appear here when a PDF is uploaded."),
          cueToken
        )}

        <RightBrainToolbar
          userId={userId}
          bookId={bookId}
          currentPage={currentPage}
          selectionText={effectiveSelection}
          onGenerateNote={onGenerateNote}
          startReview={startReview}
        />
      </div>

      {/* Progressive Idea View (right) */}
      <div
        className="bg-gray-800 p-4 rounded-lg overflow-y-auto shadow-inner"
        onMouseUp={selBind?.onMouseUp ?? handleMouseUp}
        style={{ fontSize: `${fontSize}px`, fontFamily, lineHeight: lineSpacing }}
      >
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-yellow-400">Progressive View</h4>

          {/* HUD: chunking + phase + understood + progress ring */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] opacity-75">Chunk</span>
            <input
              type="range"
              min={120}
              max={480}
              step={20}
              value={chunkChars}
              onChange={(e) => setChunkChars(Number(e.target.value))}
            />
            <select
              className="text-xs bg-gray-700 rounded px-1 py-0.5"
              value={chunkMode}
              onChange={(e) => setChunkMode(e.target.value as any)}
              title="Chunking strategy"
            >
              <option value="semantic">Semantic</option>
              <option value="sentence">Sentence</option>
              <option value="bullet-first">Bullet-first</option>
            </select>

            <div className="mx-2 h-4 w-px bg-gray-600" />

            <div className="flex gap-1">
              {(["gist", "pattern", "detail"] as const).map((p) => (
                <button
                  key={p}
                  className={`text-[11px] px-2 py-0.5 rounded ${
                    phase === p ? "bg-yellow-500 text-black" : "bg-gray-700 hover:bg-gray-600"
                  }`}
                  onClick={() => setPhase(p)}
                  title="Right-Brain phases"
                >
                  {p}
                </button>
              ))}
            </div>

            {/* progress ring + count */}
            <div className="flex items-center gap-1 ml-2">
              <ProgressRing percent={understoodPct} size={28} />
              <span className="text-[11px] opacity-75">{understoodCount}/{chunks.length}</span>
            </div>

            <button
              onClick={toggleUnderstood}
              className={`ml-2 text-[11px] px-2 py-0.5 rounded ${
                isUnderstood ? "bg-green-500 text-black" : "bg-gray-700 hover:bg-gray-600"
              }`}
              title="Mark this idea as understood (G)"
            >
              {isUnderstood ? "Got it ✓" : "Got it"}
            </button>
          </div>
        </div>

        {/* Idea chunks */}
        {chunks.length ? (
          <div>
            {chunks.map((chunk, idx) => {
              const isActive = idx === activeIdx;
              const includes = hlRegex ? hlRegex.test(chunk) : false;

              return (
                <span
                  key={`${idx}-${stableChunkId(chunk)}`}
                  className={`idea-chunk ${isActive ? "active" : ""} ${includes ? "hl" : ""} cursor-pointer`}
                  onClick={() => {
                    onWordClick(chunk);
                    setHighlightedWord(chunk);
                    setSelectionText(chunk);
                    onTextSelect?.(chunk);
                    setActiveIdx(idx);
                  }}
                >
                  {chunk}{" "}
                </span>
              );
            })}
          </div>
        ) : (
          unitText.split(" ").map((word, idx) => (
            <span
              key={idx}
              className={
                word === highlightedWord
                  ? "bg-yellow-400 text-black px-1 rounded"
                  : "hover:bg-gray-700 cursor-pointer px-1 rounded"
              }
              onClick={() => {
                onWordClick(word);
                setHighlightedWord(word);
                setSelectionText(word);
                onTextSelect?.(word);
              }}
            >
              {word}{" "}
            </span>
          ))
        )}

        {/* Right-Brain micro-routine & actions */}
        <div className="mt-3 border border-gray-700 rounded-lg p-3 bg-gray-900/60">
          <div className="text-xs uppercase tracking-wide text-gray-300 mb-2">
            Right-Brain: {phase === "gist" ? "Gist" : phase === "pattern" ? "Pattern" : "Detail"}
          </div>

          {phase === "gist" && (
            <div className="text-sm opacity-95">
              <p className="text-lg leading-7 font-semibold mb-1">{cueToken || "Key idea"}</p>
              <p>{(activeChunk || unitText).split(/(?<=[.!?])\s+/)[0]}</p>
            </div>
          )}

          {phase === "pattern" && (
            <div className="text-sm opacity-95">
              <p className="mb-2">Look for relations:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  Cause → effect?{" "}
                  <span className="opacity-70">(because, therefore, leads to, results in)</span>
                </li>
                <li>
                  Compare / contrast?{" "}
                  <span className="opacity-70">(whereas, however, in contrast, similarly)</span>
                </li>
                <li>Sequence? (first, next, then, finally)</li>
              </ul>
              <div className="mt-2 text-xs opacity-80">
                Sketch plan: <code>[A]</code> → <code>[B]</code> (labels & arrows)
              </div>
            </div>
          )}

          {phase === "detail" && <div className="text-sm">{activeChunk || unitText}</div>}

          {/* Action bar */}
          <div className="mt-3 flex flex-wrap gap-2">
            {COMPREHENSION_PROMPTS.map((p, i) => (
              <button
                key={p.label}
                className={`text-xs px-2 py-1 rounded ${
                  i === promptIdx ? "bg-yellow-500 text-black" : "bg-gray-700 hover:bg-gray-600"
                }`}
                onClick={() => {
                  setPromptIdx(i);
                  onGenerateNote?.(p.build(promptContext), undefined, "highYield");
                }}
              >
                {p.label}
              </button>
            ))}

            <button
              className="text-xs px-2 py-1 rounded bg-purple-600 hover:bg-purple-500"
              onClick={() => setShowQuiz(true)}
              title="Quick quiz (Q)"
            >
              Quiz me
            </button>
          </div>
        </div>

        {/* Quick quiz modal-ish card */}
        {showQuiz && (
          <div className="mt-3 border border-gray-700 rounded-lg p-3 bg-gray-900/80">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs uppercase tracking-wide text-gray-300">Quick quiz</div>
              <button
                className="text-xs px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600"
                onClick={() => setShowQuiz(false)}
              >
                Close
              </button>
            </div>
            <div className="text-sm mb-2">{quiz.prompt}</div>
            <div className="flex gap-2">
              {quiz.options.map((opt, idx) => {
                const picked = quizPick === idx;
                const correct = quiz.answer === idx;
                const cls =
                  quizPick == null
                    ? "bg-gray-700 hover:bg-gray-600"
                    : picked && correct
                    ? "bg-green-600"
                    : picked && !correct
                    ? "bg-red-600"
                    : "bg-gray-700";
                return (
                  <button
                    key={idx}
                    className={`text-xs px-2 py-1 rounded ${cls}`}
                    onClick={() => setQuizPick(idx)}
                    disabled={quizPick != null}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <RightBrainToolbar
          userId={userId}
          bookId={bookId}
          currentPage={currentPage}
          selectionText={effectiveSelection}
          onGenerateNote={onGenerateNote}
          startReview={startReview}
        />
      </div>

      {/* Local styles for gentle idea-pulse */}
      <style jsx>{`
        @keyframes ideaPulse {
          0%   { box-shadow: 0 0 0 0 rgba(250, 204, 21, 0.35); background: rgba(250, 204, 21, 0.12); }
          70%  { box-shadow: 0 0 0 10px rgba(250, 204, 21, 0);   background: rgba(250, 204, 21, 0.18); }
          100% { box-shadow: 0 0 0 0 rgba(250, 204, 21, 0);      background: rgba(250, 204, 21, 0.12); }
        }
        .idea-chunk { border-radius: 0.25rem; padding: 0 0.15rem; transition: background 120ms ease; }
        .idea-chunk.active { animation: ideaPulse 1200ms ease-out; }
        .idea-chunk:hover { background: rgba(250, 204, 21, 0.22); }
        .idea-chunk.hl { outline: 1px solid rgba(250, 204, 21, 0.5); }
      `}</style>
    </div>
  );
}