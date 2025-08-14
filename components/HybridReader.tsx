// components/HybridReader.tsx
"use client";

import React, { useEffect, useState } from "react";
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
  onGenerateNote?: (text: string, mnemonic?: string) => void;

  /** Unified selection binding from usePdfSelection() */
  selBind?: { onMouseUp?: (e: React.MouseEvent) => void };
  /** Optional: pass the hook’s live selection text (keeps popup/notes in sync) */
  externalSelectionText?: string;
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
  selBind,               // unified selection handler (optional)
  externalSelectionText, // live selection from usePdfSelection (optional)
}: HybridReaderProps) {
  const [selectionText, setSelectionText] = useState("");

  // Review flow
  const { isReviewMode, currentCard, startReview, gradeCard } = useStartReview(userId);

  /* -------------------- Load saved reading progress -------------------- */
  useEffect(() => {
    if (!userId || !pdfId) return;
    loadReadingProgress(userId, pdfId).then((progress: any) => {
      if (!progress) return;
      if (typeof progress.currentPage === "number") setCurrentPage(progress.currentPage);
      if (typeof progress.currentThoughtUnit === "number")
        setCurrentThoughtUnit(progress.currentThoughtUnit);
      if (typeof progress.highlightedWord === "string")
        setHighlightedWord(progress.highlightedWord);
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

  /* -------------------- Normalize unit → text -------------------- */
  const unitToText = (u: HRUnit): string => {
    if (u == null) return "";
    if (typeof u === "string") return u;
    if (Array.isArray(u)) return u.join(" ");
    const t = (u as any).text;
    return typeof t === "string" ? t : JSON.stringify(u);
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
            <button
              onClick={gradeCard}
              className="bg-blue-500 hover:bg-blue-600 px-3 py-1 rounded"
            >
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
      {/* Original View */}
      <div
        className="bg-gray-800 p-4 rounded-lg overflow-y-auto shadow-inner"
        onMouseUp={selBind?.onMouseUp ?? handleMouseUp}
      >
        <h4 className="text-sm font-semibold text-yellow-400 mb-3">Original View</h4>
        <p style={{ fontSize: `${fontSize}px`, fontFamily, lineHeight: lineSpacing }}>
          {sampleText || "📄 Original text will appear here when a PDF is uploaded."}
        </p>
        <RightBrainToolbar
          userId={userId}
          bookId={pdfId}
          currentPage={currentPage}
          selectionText={effectiveSelection}
          onGenerateNote={onGenerateNote}
          startReview={startReview}
        />
      </div>

      {/* Progressive View */}
      <div
        className="bg-gray-800 p-4 rounded-lg overflow-y-auto shadow-inner"
        onMouseUp={selBind?.onMouseUp ?? handleMouseUp}
      >
        <h4 className="text-sm font-semibold text-yellow-400 mb-3">Progressive View</h4>
        <div style={{ fontSize, fontFamily, lineHeight: lineSpacing }}>
          {unitText.split(" ").map((word, idx) => (
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
                // push into unified selection pipeline
                setSelectionText(word);
                onTextSelect?.(word);
              }}
            >
              {word}{" "}
            </span>
          ))}
        </div>
        <RightBrainToolbar
          userId={userId}
          bookId={pdfId}
          currentPage={currentPage}
          selectionText={effectiveSelection}
          onGenerateNote={onGenerateNote}
          startReview={startReview}
        />
      </div>
    </div>
  );
}