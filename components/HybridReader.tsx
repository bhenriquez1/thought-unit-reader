"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { ThoughtUnit as BaseThoughtUnit, ReadingStats } from "@/types/reading";
import { saveReadingProgress, loadReadingProgress } from "@/lib/firebase";
import RightBrainToolbar from "@/components/RightBrainToolbar";
import { useStartReview } from "@/hooks/useStartReview";

type HRUnit = BaseThoughtUnit | string | string[] | { text?: string };

interface HybridReaderProps {
  fileUrl: string;
  pdfId: string;
  userId: string;
  sampleText: string;
  currentPage: number;
  pdfPageCount?: number;
  readingSpeed?: number;
  isReading?: boolean;
  isPaused?: boolean;
  currentThoughtUnit: number;
  setCurrentThoughtUnit: (unit: number) => void;
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
  /** align with toolbar: allow optional mode */
  onGenerateNote?: (text: string, mnemonic?: string, mode?: "sketch" | "highYield") => void;

  /** Unified selection binding from usePdfSelection() */
  selBind?: { onMouseUp?: (e: React.MouseEvent) => void };
  /** Optional: pass the hook’s live selection text (keeps popup/notes in sync) */
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

/** pick a “key token” to lightly highlight in Original view */
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

/** render Original text with a subtle highlight for token */
function renderOriginalWithCue(
  text: string,
  token: string | null,
  styleClasses = "bg-yellow-500/20 rounded px-0.5"
) {
  if (!token || !token.trim()) return <p>{text || "📄 Original text will appear here."}</p>;
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
function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default function HybridReader({
  pdfId,
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
  selBind,
  externalSelectionText,
}: HybridReaderProps) {
  const [selectionText, setSelectionText] = useState("");

  // Review flow (one hook call at top-level; pass result down)
  const { isReviewMode, currentCard, startReview, gradeCard } = useStartReview(userId);

  /* -------------------- Load saved reading progress -------------------- */
  useEffect(() => {
    if (!userId || !pdfId) return;
    loadReadingProgress(userId, pdfId).then((progress: any) => {
      if (!progress) return;
      if (typeof progress.currentPage === "number") setCurrentPage(progress.currentPage);
      if (typeof progress.currentThoughtUnit === "number")
        setCurrentThoughtUnit(progress.currentThoughtUnit);
      if (typeof progress.highlightedWord === "string") setHighlightedWord(progress.highlightedWord);
    });
  }, [userId, pdfId, setCurrentPage, setCurrentThoughtUnit, setHighlightedWord]);

  /* -------------------- Save reading progress -------------------- */
  useEffect(() => {
    if (!userId || !pdfId) return;
    saveReadingProgress(userId, pdfId, {
      currentPage,
      currentThoughtUnit,
      highlightedWord,
    });
  }, [userId, pdfId, currentPage, currentThoughtUnit, highlightedWord]);

  /* -------------------- Fallback selection (when selBind isn’t provided) -------------------- */
  const getSelectionText = () =>
    (typeof window !== "undefined" ? window.getSelection()?.toString().trim() : "") || "";

  const handleMouseUp = () => {
    const sel = getSelectionText();
    setSelectionText(sel);
    if (sel) onTextSelect?.(sel);
  };

  /* -------------------- Empty states -------------------- */
  if (!thoughtUnits || thoughtUnits.length === 0) {
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

  // reset active on unit change
  useEffect(() => setActiveIdx(0), [unitText]);

  // auto-advance based on readingSpeed
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
          bookId={pdfId}
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
          bookId={pdfId}
          currentPage={currentPage}
          selectionText={effectiveSelection}
          onGenerateNote={onGenerateNote}
          startReview={startReview}
        />
      </div>

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
    </div>
  );
}