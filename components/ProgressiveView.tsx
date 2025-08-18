"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ThoughtUnit as BaseThoughtUnit, ReadingStats } from "@/types/reading";
import { useStartReview } from "@/hooks/useStartReview";
import RightBrainToolbar from "@/components/RightBrainToolbar";
import RightBrainNoteEditor from "@/components/RightBrainNoteEditor";
import { saveReadingProgress, loadReadingProgress } from "@/lib/firebase";
import { chunkText, stableChunkId } from "@/lib/chunkers";
import { loadUnderstood, markUnderstood } from "@/lib/understoodStore";

/** Accept any “thought unit” shape we’ve used so far */
type PVUnit = BaseThoughtUnit | string | string[] | { text?: string };

interface ProgressiveViewProps {
  bookId: string;
  userId: string;
  thoughtUnits: PVUnit[];
  currentThoughtUnit: number;

  readingSpeed: number;
  isReading?: boolean;
  isPaused?: boolean;

  stats?: ReadingStats;
  highlightedWord: string;
  currentPage: number;
  pdfPageCount?: number;

  fontSize: number;
  fontFamily: string;
  lineSpacing: number;

  onWordClick?: (word: string) => void;
  setReadingSpeed?: (speed: number) => void;
  onTextSelect?: (text: string) => void;

  /** parent handler → opens global Right-Brain (with templates) */
  onGenerateNote?: (text: string, mnemonic?: string, mode?: "sketch" | "highYield") => void;

  /** Unify with usePdfSelection — spread this so selections go through the same pipeline */
  selBind?: { onMouseUp?: (e: React.MouseEvent) => void };
  /** Optional: pass the hook’s live selection text down (e.g., from index.tsx) */
  externalSelectionText?: string;
}

/* ---------------- helpers ---------------- */
function unitToText(u: PVUnit): string {
  if (u == null) return "";
  if (typeof u === "string") return u;
  if (Array.isArray(u)) return u.join(" ");
  const maybeText = (u as any).text;
  return typeof maybeText === "string" ? maybeText : JSON.stringify(u);
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* ---------------- tiny quiz helper ---------------- */
function makeTwoChoiceQuiz(from: string) {
  const words = (from || "").split(/\W+/).filter((w) => w.length >= 4);
  const correct = words[0] || "concept";
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

export default function ProgressiveView({
  bookId,
  userId,
  thoughtUnits,
  currentThoughtUnit,
  readingSpeed,
  isReading = true,
  isPaused = false,
  highlightedWord,
  currentPage,
  fontSize,
  fontFamily,
  lineSpacing,
  onWordClick,
  setReadingSpeed,
  onTextSelect,
  onGenerateNote, // parent handler
  selBind,
  externalSelectionText,
}: ProgressiveViewProps) {
  const [loaded, setLoaded] = useState(false);
  const [selectionText, setSelectionText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [dictationText, setDictationText] = useState("");
  const [showNoteEditor, setShowNoteEditor] = useState(false); // fallback local editor
  const recognitionRef = useRef<any>(null);

  const saveDebounceRef = useRef<number | null>(null);
  const { isReviewMode, currentCard, startReview, gradeCard } = useStartReview(userId);

  // Local pause so you can Pause in this view without changing parent state
  const [localPaused, setLocalPaused] = useState(false);

  // Chunking controls
  const [chunkChars, setChunkChars] = useState(240);
  const [chunkMode, setChunkMode] = useState<"semantic" | "sentence" | "bullet-first">("semantic");

  // Understood map (Got it ✓)
  const [understoodMap, setUnderstoodMap] = useState<Record<string, true>>({});

  /* -------------------- Dictation (browser SR) -------------------- */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;

    const rec = new SR();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (event: any) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setDictationText(transcript.trim());
    };

    rec.onerror = (err: any) => console.error("Speech recognition error", err);
    recognitionRef.current = rec;
  }, []);

  const toggleRecording = () => {
    const rec = recognitionRef.current;
    if (!rec) return;
    try {
      if (isRecording) {
        rec.stop();
        setIsRecording(false);
      } else {
        rec.start();
        setIsRecording(true);
      }
    } catch {
      /* no-op */
    }
  };

  /* -------------------- Load saved reading state -------------------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!userId || !bookId) return setLoaded(true);
      try {
        const snap = await loadReadingProgress(userId, bookId);
        if (!cancelled && snap && typeof snap.readingSpeed === "number") {
          setReadingSpeed?.(snap.readingSpeed);
        }
      } catch (err) {
        console.error("❌ Error loading reading progress:", err);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, bookId, setReadingSpeed]);

  /* -------------------- Load understood map -------------------- */
  useEffect(() => {
    if (!bookId) return;
    loadUnderstood(userId || "guest", bookId)
      .then((m) => setUnderstoodMap(m || {}))
      .catch(() => {});
  }, [userId, bookId]);

  /* -------------------- Save reading state (debounced) -------------------- */
  useEffect(() => {
    if (!loaded || !userId || !bookId) return;

    if (saveDebounceRef.current) window.clearTimeout(saveDebounceRef.current);
    saveDebounceRef.current = window.setTimeout(() => {
      (async () => {
        try {
          await saveReadingProgress(userId, bookId, {
            currentThoughtUnit,
            readingSpeed,
            highlightedWord,
            currentPage,
          });
        } catch (err) {
          console.error("❌ Error saving reading progress:", err);
        }
      })();
    }, 500) as unknown as number;

    return () => {
      if (saveDebounceRef.current) window.clearTimeout(saveDebounceRef.current);
    };
  }, [loaded, userId, bookId, currentThoughtUnit, readingSpeed, highlightedWord, currentPage]);

  /* -------------------- Selection (fallback) -------------------- */
  const getSelectionText = () =>
    (typeof window !== "undefined" ? window.getSelection()?.toString().trim() : "") || "";

  const handleMouseUp = () => {
    const selection = getSelectionText();
    setSelectionText(selection);
    onTextSelect?.(selection);
  };

  /* -------------------- Empty states -------------------- */
  if (!thoughtUnits || thoughtUnits.length === 0) {
    return (
      <div
        className="p-4 flex items-center justify-center text-gray-400 italic"
        style={{ fontSize: `${fontSize}px`, fontFamily, lineHeight: lineSpacing }}
      >
        📂 Please upload a PDF to start Progressive Reading.
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

  /* -------------------- Idea chunks with knob/strategy -------------------- */
  const chunks = useMemo(
    () => chunkText(unitText, { mode: chunkMode, targetChars: chunkChars }),
    [unitText, chunkMode, chunkChars]
  );
  const [activeIdx, setActiveIdx] = useState(0);
  useEffect(() => setActiveIdx(0), [unitText, chunkMode, chunkChars]);

  // Advance based on readingSpeed (WPM → ms per chunk), respecting isReading/isPaused/localPaused
  useEffect(() => {
    if (!chunks.length || !isReading || isPaused || localPaused) return;
    const msPerChunk = Math.max(600, (60_000 / Math.max(120, readingSpeed)) * 1.2);
    const t = window.setInterval(
      () => setActiveIdx((i) => Math.min(i + 1, chunks.length - 1)),
      msPerChunk
    );
    return () => window.clearInterval(t);
  }, [chunks.length, readingSpeed, isReading, isPaused, localPaused]);

  const activeChunk = chunks[activeIdx] || "";
  const activeChunkId = stableChunkId(activeChunk);
  const isUnderstood = !!understoodMap[activeChunkId];

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
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chunks.length, activeChunkId]);

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
  const [quizPick, setQuizPick] = useState<number | null>(null);
  const quiz = useMemo(() => makeTwoChoiceQuiz(activeChunk), [activeChunk]);
  useEffect(() => setQuizPick(null), [quiz.prompt, activeChunkId]);

  /* -------------------- Effective selection -------------------- */
  const effectiveSelection = (externalSelectionText?.trim() || selectionText || dictationText).trim();

  /* --------------- Forward note generation (global/fallback) --------------- */
  const forwardGenerateNote = (text?: string, mnemonic?: string, mode?: "sketch" | "highYield") => {
    if (onGenerateNote) {
      onGenerateNote(text ?? effectiveSelection, mnemonic, mode);
    } else {
      setShowNoteEditor(true);
    }
  };

  /* -------------------- Main UI -------------------- */
  return (
    <>
      <div
        className="p-4 overflow-y-auto"
        style={{ fontSize: `${fontSize}px`, fontFamily, lineHeight: lineSpacing }}
        onMouseUp={selBind?.onMouseUp ?? handleMouseUp}
      >
        {/* HUD */}
        <div className="flex items-center gap-3 mb-3">
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

          <button
            onClick={() => setLocalPaused((p) => !p)}
            className="text-[11px] px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600"
            title="Pause (Space)"
          >
            {localPaused || isPaused ? "Paused" : "Pause"}
          </button>

          <button
            onClick={toggleUnderstood}
            className={`text-[11px] px-2 py-0.5 rounded ${
              isUnderstood ? "bg-green-500 text-black" : "bg-gray-700 hover:bg-gray-600"
            }`}
            title="Mark this idea as understood (G)"
          >
            {isUnderstood ? "Got it ✓" : "Got it"}
          </button>
        </div>

        {/* Idea-chunk rendering; fallback to words if chunking yields 0 */}
        {chunks.length > 0 ? (
          <div>
            {chunks.map((chunk, idx) => {
              const isActive = idx === activeIdx;
              const includesHighlight =
                highlightedWord && new RegExp(`\\b${escapeRegExp(highlightedWord)}\\b`).test(chunk);

              return (
                <span
                  key={`${idx}-${stableChunkId(chunk)}`}
                  className={`idea-chunk ${isActive ? "active" : ""} ${
                    includesHighlight ? "hl" : ""
                  } cursor-pointer`}
                  onClick={() => {
                    onWordClick?.(chunk);
                    setSelectionText(chunk);
                    onTextSelect?.(chunk);
                    setActiveIdx(idx);
                  }}
                  title={isUnderstood && idx === activeIdx ? "Understood ✓" : undefined}
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
              className="hover:bg-gray-700 cursor-pointer px-1 rounded"
              onClick={() => {
                onWordClick?.(word);
                setSelectionText(word);
                onTextSelect?.(word);
              }}
            >
              {word}{" "}
            </span>
          ))
        )}

        {/* Dictation / actions */}
        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={toggleRecording}
            className={`px-3 py-1 rounded text-white ${
              isRecording ? "bg-red-500" : "bg-gray-500 hover:bg-gray-600"
            }`}
          >
            🎙️ {isRecording ? "Stop Dictation" : "Start Dictation"}
          </button>

          {dictationText && (
            <p className="text-sm text-green-400">Live dictation: {dictationText}</p>
          )}
        </div>

        <div className="mt-3">
          <button
            className="text-xs px-2 py-1 rounded bg-purple-600 hover:bg-purple-500"
            onClick={() => setShowQuiz(true)}
            title="Quick quiz"
          >
            Quiz me
          </button>
        </div>

        <RightBrainToolbar
          userId={userId}
          bookId={bookId}
          currentPage={currentPage}
          selectionText={effectiveSelection}
          onGenerateNote={forwardGenerateNote}
          startReview={startReview}
        />
      </div>

      {/* Quick quiz card */}
      {showQuiz && (
        <div className="fixed bottom-4 right-4 max-w-sm border border-gray-700 rounded-lg p-3 bg-gray-900/90 shadow-xl">
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

      {/* Fallback local editor (only used if parent didn’t handle onGenerateNote) */}
      {showNoteEditor && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-6">
          <div className="bg-gray-900 p-4 rounded-lg w-full max-w-2xl">
            <RightBrainNoteEditor
              bookId={bookId}
              initialText={effectiveSelection}
              currentPage={currentPage}
              onDone={() => setShowNoteEditor(false)}
            />
          </div>
        </div>
      )}

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
    </>
  );
}