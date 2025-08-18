"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { ThoughtUnit as BaseThoughtUnit, ReadingStats } from "@/types/reading";
import { saveReadingProgress, loadReadingProgress } from "@/lib/firebase";
import RightBrainToolbar from "@/components/RightBrainToolbar";
import { useStartReview } from "@/hooks/useStartReview";

type HRUnit = BaseThoughtUnit | string | string[] | { text?: string };

interface HybridReaderProps {
  /** ✅ canonical id (was pdfId) */
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

  /** Unified selection binding from usePdfSelection() */
  selBind?: { onMouseUp?: (e: React.MouseEvent) => void };
  /** Pass the hook’s live selection (keeps popup/notes in sync) */
  externalSelectionText?: string;
}

/* ---------------- Right-Brain idea chunking helpers ---------------- */
function unitToText(u: HRUnit): string {
  if (u == null) return "";
  if (typeof u === "string") return u;
  if (Array.isArray(u)) return u.join(" ");
  const t = (u as any).text;
  return typeof t === "string" ? t : JSON.stringify(u);
}

function chunkIntoIdeas(text: string): string[] {
  const T = (text || "").replace(/\s+/g, " ").trim();
  if (!T) return [];
  const sentences = T.split(/(?<=[.!?])\s+(?=[A-Z(])/).map((s) => s.trim()).filter(Boolean);
  const chunks: string[] = [];

  for (const s of sentences) {
    const parts = s
      .split(/\s*(?:;|:|—|–|--|, and |, but | and | but | however | whereas )\s*/i)
      .map((p) => p.trim())
      .filter(Boolean);

    for (const p of parts) {
      const tokens = p.split(/\s+/).filter(Boolean);
      const info = tokens.map((w) => (/[A-Z]\w+/.test(w) || /\d/.test(w) ? 2 : 1));

      for (let i = 0; i < tokens.length; ) {
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

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  selBind,
  externalSelectionText,
}: HybridReaderProps) {
  const [selectionText, setSelectionText] = useState("");

  // Review flow
  const { isReviewMode, currentCard, startReview, gradeCard } = useStartReview(userId);

  /* -------------------- Load saved reading progress -------------------- */
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

  /* -------------------- Save reading progress -------------------- */
  useEffect(() => {
    if (!userId || !bookId) return;
    saveReadingProgress(userId, bookId, {
      currentPage,
      currentThoughtUnit,
      highlightedWord,
      readingSpeed,
    }).catch(() => {});
  }, [userId, bookId, currentPage, currentThoughtUnit, highlightedWord, readingSpeed]);

  /* -------------------- Fallback selection -------------------- */
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

  /* -------------------- Idea chunks (Right-Brain) -------------------- */
  const chunks = useMemo(() => chunkIntoIdeas(unitText), [unitText]);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => setActiveIdx(0), [unitText]);

  useEffect(() => {
    if (!chunks.length) return;
    const msPerChunk = Math.max(600, (60_000 / Math.max(120, readingSpeed)) * 1.2);
    const t = window.setInterval(() => setActiveIdx((i) => (i + 1) % chunks.length), msPerChunk);
    return () => window.clearInterval(t);
  }, [chunks.length, readingSpeed]);

  const activeChunk = chunks[activeIdx] || "";
  const cueToken = keyTokenFromChunk(activeChunk);
  const effectiveSelection = (externalSelectionText?.trim() || selectionText).trim();

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
          sampleText || "📄 Original text will appear here when a PDF is uploaded.",
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
        <h4 className="text-sm font-semibold text-yellow-400 mb-3">Progressive View</h4>

        {chunks.length ? (
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
          0% { box-shadow: 0 0 0 0 rgba(250, 204, 21, 0.35); background: rgba(250, 204, 21, 0.12); }
          70% { box-shadow: 0 0 0 10px rgba(250, 204, 21, 0); background: rgba(250, 204, 21, 0.18); }
          100% { box-shadow: 0 0 0 0 rgba(250, 204, 21, 0); background: rgba(250, 204, 21, 0.12); }
        }
        .idea-chunk { border-radius: 0.25rem; padding: 0 0.15rem; transition: background 120ms ease; }
        .idea-chunk.active { animation: ideaPulse 1200ms ease-out; }
        .idea-chunk:hover { background: rgba(250, 204, 21, 0.22); }
        .idea-chunk.hl { outline: 1px solid rgba(250, 204, 21, 0.5); }
      `}</style>
    </div>
  );
}
