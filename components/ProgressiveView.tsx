"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import type { ThoughtUnit as BaseThoughtUnit, ReadingStats } from "@/types/reading";
import { useStartReview } from "@/hooks/useStartReview";
import RightBrainToolbar from "@/components/RightBrainToolbar";
import RightBrainNoteEditor from "@/components/RightBrainNoteEditor";

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

/* ------------------------------------------------------------------ */
/* Right-Brain “idea chunking” — simple, robust chunker for phrases   */
/* ------------------------------------------------------------------ */
function chunkIntoIdeas(text: string): string[] {
  const T = (text || "").replace(/\s+/g, " ").trim();
  if (!T) return [];

  // Split into sentences conservatively
  const sentences = T.split(/(?<=[.!?])\s+(?=[A-Z(])/).map((s) => s.trim()).filter(Boolean);

  const chunks: string[] = [];
  for (const s of sentences) {
    // Micro-split long sentences on punctuation/conjunctions
    const parts = s
      .split(/\s*(?:;|:|—|–|--|, and |, but | and | but | however | whereas )\s*/i)
      .map((p) => p.trim())
      .filter(Boolean);

    for (const p of parts) {
      const tokens = p.split(/\s+/).filter(Boolean);

      // Prefer windows around “information-dense” tokens (caps, numbers)
      const info = tokens.map((w) => (/[A-Z]\w+/.test(w) || /\d/.test(w) ? 2 : 1));

      for (let i = 0; i < tokens.length; ) {
        // Window size: 2–6, expand a bit if the window is low-info
        let win = 3;
        let score = 0;
        while (win < 6 && i + win <= tokens.length && score < win + 1) {
          score = info.slice(i, i + win).reduce((a, b) => a + b, 0);
          if (score < win + 1) win++;
          else break;
        }
        if (i + win > tokens.length) win = tokens.length - i;
        chunks.push(tokens.slice(i, i + win).join(" "));
        i += win;
      }
    }
  }

  return chunks.length ? chunks : [T];
}

/** Normalize any unit → text */
function unitToText(u: PVUnit): string {
  if (u == null) return "";
  if (typeof u === "string") return u;
  if (Array.isArray(u)) return u.join(" ");
  const maybeText = (u as any).text;
  return typeof maybeText === "string" ? maybeText : JSON.stringify(u);
}

export default function ProgressiveView({
  bookId,
  userId,
  thoughtUnits,
  currentThoughtUnit,
  readingSpeed,
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

  const { isReviewMode, currentCard, startReview, gradeCard } = useStartReview(userId);

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
    async function loadProgress() {
      if (!userId || !bookId) return;
      try {
        const ref = doc(db, "users", userId, "pdfLibrary", bookId, "progress", "readingState");
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data() as any;
          if (typeof data.readingSpeed === "number") {
            setReadingSpeed?.(data.readingSpeed);
          }
        }
        setLoaded(true);
      } catch (err) {
        console.error("❌ Error loading reading progress:", err);
        setLoaded(true);
      }
    }
    loadProgress();
  }, [userId, bookId, setReadingSpeed]);

  /* -------------------- Save reading state -------------------- */
  useEffect(() => {
    if (!loaded || !userId || !bookId) return;
    (async () => {
      try {
        const ref = doc(db, "users", userId, "pdfLibrary", bookId, "progress", "readingState");
        await setDoc(ref, {
          currentThoughtUnit,
          readingSpeed,
          highlightedWord,
          currentPage,
          updatedAt: new Date().toISOString(),
        });
      } catch (err) {
        console.error("❌ Error saving reading progress:", err);
      }
    })();
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

  /* -------------------- Right-Brain idea chunks -------------------- */
  const chunks = useMemo(() => chunkIntoIdeas(unitText), [unitText]);
  const [activeIdx, setActiveIdx] = useState(0);

  // Reset when unit text changes
  useEffect(() => setActiveIdx(0), [unitText]);

  // Advance based on readingSpeed (WPM → ms per chunk)
  useEffect(() => {
    if (!chunks.length) return;
    // conservative: base on WPM, but ensure a comfy minimum
    const msPerChunk = Math.max(600, (60_000 / Math.max(120, readingSpeed)) * 1.2);
    const t = window.setInterval(
      () => setActiveIdx((i) => (i + 1) % chunks.length),
      msPerChunk
    );
    return () => window.clearInterval(t);
  }, [chunks.length, readingSpeed]);

  /* -------------------- Review mode -------------------- */
  if (isReviewMode) {
    return (
      <div className="p-4 bg-gray-900 text-white rounded-lg">
        <h3 className="text-lg font-bold mb-4">📅 Review Mode</h3>
        {currentCard ? (
          <>
            <p className="mb-3">
              <strong>Question:</strong> {currentCard.front}
            </p>
            <p className="mb-3">
              <strong>Answer:</strong> {currentCard.back}
            </p>
            <button onClick={gradeCard} className="bg-blue-500 hover:bg-blue-600 px-3 py-1 rounded">
              Next Card
            </button>
          </>
        ) : (
          <p>🎉 All cards reviewed!</p>
        )}
      </div>
    );
  }

  /* -------------------- Effective selection text -------------------- */
  const effectiveSelection = (externalSelectionText?.trim() || selectionText || dictationText).trim();

  /* --------------- Forward note generation (global/fallback) --------------- */
  const forwardGenerateNote = (text?: string, mnemonic?: string, mode?: "sketch" | "highYield") => {
    if (onGenerateNote) {
      onGenerateNote(text ?? effectiveSelection, mnemonic, mode);
    } else {
      // fallback to local modal if parent didn’t supply a handler
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
        {/* Idea-chunk rendering; fallback to words if chunking yields 0 */}
        {chunks.length > 0 ? (
          <div>
            {chunks.map((chunk, idx) => {
              const isActive = idx === activeIdx;
              const includesHighlight =
                highlightedWord && new RegExp(`\\b${highlightedWord}\\b`).test(chunk);

              return (
                <span
                  key={idx}
                  className={`idea-chunk ${isActive ? "active" : ""} ${
                    includesHighlight ? "hl" : ""
                  } cursor-pointer`}
                  onClick={() => {
                    onWordClick?.(chunk);
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
                onWordClick?.(word);
                setSelectionText(word);
                onTextSelect?.(word);
              }}
            >
              {word}{" "}
            </span>
          ))
        )}

        <div className="mt-4">
          <button
            onClick={toggleRecording}
            className={`px-3 py-1 rounded text-white ${
              isRecording ? "bg-red-500" : "bg-gray-500 hover:bg-gray-600"
            }`}
          >
            🎙️ {isRecording ? "Stop Dictation" : "Start Dictation"}
          </button>
          {dictationText && (
            <p className="mt-2 text-sm text-green-400">Live dictation: {dictationText}</p>
          )}
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

      {/* Fallback local editor (used only if parent didn’t handle onGenerateNote) */}
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
          0% {
            box-shadow: 0 0 0 0 rgba(250, 204, 21, 0.35);
            background: rgba(250, 204, 21, 0.12);
          }
          70% {
            box-shadow: 0 0 0 10px rgba(250, 204, 21, 0);
            background: rgba(250, 204, 21, 0.18);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(250, 204, 21, 0);
            background: rgba(250, 204, 21, 0.12);
          }
        }
        .idea-chunk {
          border-radius: 0.25rem;
          padding: 0 0.15rem;
          transition: background 120ms ease;
        }
        .idea-chunk.active {
          animation: ideaPulse 1200ms ease-out;
        }
        .idea-chunk:hover {
          background: rgba(250, 204, 21, 0.22);
        }
        .idea-chunk.hl {
          outline: 1px solid rgba(250, 204, 21, 0.5);
        }
      `}</style>
    </>
  );
}