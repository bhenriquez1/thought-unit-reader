// components/ProgressiveView.tsx
import React, { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

export interface ThoughtUnit {
  text: string;
}

export interface ReadingStats {
  wordsRead: number;
  timeElapsed: number;
  currentWPM: number;
}

interface ProgressiveViewProps {
  bookId: string; // 🔹 Unique per uploaded PDF
  userId: string; // 🔹 From Firebase Auth
  thoughtUnits: ThoughtUnit[];
  currentThoughtUnit: number;
  readingSpeed: number;
  isReading: boolean;
  isPaused: boolean;
  stats: ReadingStats;
  highlightedWord: string;
  currentPage: number;
  pdfPageCount: number;
  fontSize: number;
  fontFamily: string;
  lineSpacing: number;
  onWordClick: (word: string) => void;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  setReadingSpeed: (speed: number) => void;
  onTextSelect?: (text: string) => void;
}

export default function ProgressiveView({
  bookId,
  userId,
  thoughtUnits,
  currentThoughtUnit,
  readingSpeed,
  isReading,
  isPaused,
  stats,
  highlightedWord,
  currentPage,
  pdfPageCount,
  fontSize,
  fontFamily,
  lineSpacing,
  onWordClick,
  onStart,
  onPause,
  onReset,
  setReadingSpeed,
  onTextSelect
}: ProgressiveViewProps) {
  const [loaded, setLoaded] = useState(false);

  /** ===== Load saved reading state per book ===== **/
  useEffect(() => {
    async function loadProgress() {
      if (!userId || !bookId) return;
      try {
        const ref = doc(
          db,
          "users",
          userId,
          "pdfLibrary",
          bookId,
          "progress",
          "readingState"
        );
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data();
          if (data.currentThoughtUnit) {
            // restore reading position
            setReadingSpeed(data.readingSpeed || readingSpeed);
          }
        }
        setLoaded(true);
      } catch (err) {
        console.error("❌ Error loading reading progress:", err);
      }
    }
    loadProgress();
  }, [userId, bookId]);

  /** ===== Save reading state per book ===== **/
  useEffect(() => {
    if (!loaded || !userId || !bookId) return;
    async function saveProgress() {
      try {
        const ref = doc(
          db,
          "users",
          userId,
          "pdfLibrary",
          bookId,
          "progress",
          "readingState"
        );
        await setDoc(ref, {
          currentThoughtUnit,
          readingSpeed,
          highlightedWord,
          currentPage,
          updatedAt: new Date().toISOString()
        });
      } catch (err) {
        console.error("❌ Error saving reading progress:", err);
      }
    }
    saveProgress();
  }, [
    currentThoughtUnit,
    readingSpeed,
    highlightedWord,
    currentPage,
    loaded
  ]);

  /** ===== Handle text selection ===== **/
  const handleMouseUp = () => {
    const selection = window.getSelection()?.toString().trim();
    if (selection && onTextSelect) {
      onTextSelect(selection);
    }
  };

  /** ===== No thought units loaded ===== **/
  if (!thoughtUnits || thoughtUnits.length === 0) {
    return (
      <div
        className="progressive-view p-4 flex items-center justify-center text-gray-400 italic"
        style={{
          fontSize: `${fontSize}px`,
          fontFamily,
          lineHeight: lineSpacing
        }}
      >
        📂 Please upload a PDF to start Progressive Reading.
      </div>
    );
  }

  /** ===== Current unit out of range ===== **/
  const unit = thoughtUnits[currentThoughtUnit - 1];
  if (!unit) {
    return (
      <div
        className="progressive-view p-4 flex items-center justify-center text-gray-400 italic"
        style={{
          fontSize: `${fontSize}px`,
          fontFamily,
          lineHeight: lineSpacing
        }}
      >
        ⏳ Preparing your reading view...
      </div>
    );
  }

  /** ===== Render ===== **/
  return (
    <div
      className="progressive-view p-4 overflow-y-auto"
      style={{
        fontSize: `${fontSize}px`,
        fontFamily,
        lineHeight: lineSpacing
      }}
      onMouseUp={handleMouseUp}
    >
      {unit.text.split(" ").map((word, idx) => (
        <span
          key={idx}
          className={`${
            word === highlightedWord
              ? "bg-yellow-400 text-black px-1 rounded"
              : "hover:bg-gray-700 cursor-pointer px-1 rounded"
          }`}
          onClick={() => onWordClick(word)}
        >
          {word}{" "}
        </span>
      ))}
    </div>
  );
}