// components/ProgressiveView.tsx
"use client";

import React, { useEffect, useState, useRef } from "react";
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
  onGenerateNote?: (text: string, mnemonic?: string) => void;

  /** NEW: unify with PDF selection hook */
  selBind?: { onMouseUp?: (e: React.MouseEvent) => void };
  /** Optional: pass the hook’s live selection text down */
  externalSelectionText?: string;
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
  onGenerateNote,

  // NEW (optional)
  selBind,
  externalSelectionText,
}: ProgressiveViewProps) {
  const [loaded, setLoaded] = useState(false);
  const [selectionText, setSelectionText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [dictationText, setDictationText] = useState("");
  const [showNoteEditor, setShowNoteEditor] = useState(false);
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

  /* -------------------- Normalize any unit → text -------------------- */
  const unitToText = (u: PVUnit): string => {
    if (u == null) return "";
    if (typeof u === "string") return u;
    if (Array.isArray(u)) return u.join(" ");
    const maybeText = (u as any).text;
    return typeof maybeText === "string" ? maybeText : JSON.stringify(u);
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

  /* -------------------- Main UI -------------------- */
  return (
    <>
      <div
        className="p-4 overflow-y-auto"
        style={{ fontSize: `${fontSize}px`, fontFamily, lineHeight: lineSpacing }}
        onMouseUp={selBind?.onMouseUp ?? handleMouseUp}
      >
        {unitText.split(" ").map((word, idx) => (
          <span
            key={idx}
            className={
              word === highlightedWord
                ? "bg-yellow-400 text-black px-1 rounded"
                : "hover:bg-gray-700 cursor-pointer px-1 rounded"
            }
            onClick={() => {
              onWordClick?.(word);
              // also push into unified selection pipeline
              setSelectionText(word);
              onTextSelect?.(word);
            }}
          >
            {word}{" "}
          </span>
        ))}

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
          onGenerateNote={() => setShowNoteEditor(true)}
          startReview={startReview}
        />
      </div>

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
    </>
  );
}