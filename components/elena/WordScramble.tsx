// components/elena/WordScramble.tsx
// Word Scramble — tap letters in the correct order to spell a vocabulary word.
// Cycles through the child's word collection one word at a time.

import React, { useState, useEffect, useCallback } from "react";
import { loadVocabWords } from "@/lib/elena/idbStore";
import type { VocabWord } from "@/lib/elena/vocabulary";

/* ─── Helpers ────────────────────────────────────────────────────────────────── */

function scramble(word: string): string[] {
  const letters = word.toUpperCase().split("");
  // Keep scrambling until the result differs from the original (for short words)
  for (let attempt = 0; attempt < 10; attempt++) {
    for (let i = letters.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [letters[i], letters[j]] = [letters[j], letters[i]];
    }
    if (letters.join("") !== word.toUpperCase()) break;
  }
  return letters.map((l, i) => `${l}-${i}`); // "A-0", "B-1", "--3" for hyphens — decode with lastIndexOf
}

/* ─── Props ──────────────────────────────────────────────────────────────────── */

interface WordScrambleProps {
  childProfileId: string;
  onBack:         () => void;
  onWin:          () => void;
}

/* ─── Component ──────────────────────────────────────────────────────────────── */

export default function WordScramble({ childProfileId, onBack, onWin }: WordScrambleProps) {
  const [words,     setWords]     = useState<VocabWord[]>([]);
  const [wordIdx,   setWordIdx]   = useState(0);
  const [tiles,     setTiles]     = useState<string[]>([]);   // scrambled tile IDs in bank
  const [chosen,    setChosen]    = useState<string[]>([]);   // tile IDs player has picked
  const [feedback,  setFeedback]  = useState<"correct" | "wrong" | null>(null);
  const [score,     setScore]     = useState(0);
  const [done,      setDone]      = useState(false);

  useEffect(() => {
    loadVocabWords(childProfileId)
      .then(ws => {
        // Shuffle words; prefer reviewing+mastered for a bit of challenge
        const sorted = [...ws].sort((a, b) => {
          const order = { mastered: 0, reviewing: 1, new: 2 };
          return order[a.status] - order[b.status];
        });
        setWords(sorted);
        if (sorted.length > 0) setTiles(scramble(sorted[0].word));
      })
      .catch(() => {});
  }, [childProfileId]);

  const currentWord = words[wordIdx] ?? null;
  const answer      = currentWord?.word.toUpperCase() ?? "";
  const chosenLetters = chosen.map(id => id.slice(0, id.lastIndexOf("-")));

  const pickTile = useCallback((tileId: string) => {
    if (feedback) return;
    setTiles(prev => prev.filter(t => t !== tileId));
    setChosen(prev => [...prev, tileId]);
  }, [feedback]);

  const unpickTile = useCallback((tileId: string) => {
    if (feedback) return;
    setChosen(prev => prev.filter(t => t !== tileId));
    setTiles(prev => [...prev, tileId]);
  }, [feedback]);

  const checkAnswer = useCallback(() => {
    const attempt = chosenLetters.join("");
    if (attempt === answer) {
      setFeedback("correct");
      setScore(s => s + 1);
      setTimeout(() => {
        const next = wordIdx + 1;
        if (next >= words.length) {
          setDone(true);
          onWin();
        } else {
          setWordIdx(next);
          setTiles(scramble(words[next].word));
          setChosen([]);
          setFeedback(null);
        }
      }, 1200);
    } else {
      setFeedback("wrong");
      setTimeout(() => {
        // Return chosen tiles to bank and reset
        setTiles(scramble(currentWord!.word));
        setChosen([]);
        setFeedback(null);
      }, 1000);
    }
  }, [chosenLetters, answer, wordIdx, words, currentWord, onWin]);

  /* ─── Not enough words ───────────────────────────────────────────────────── */

  if (words.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center">
        <div className="text-5xl mb-4">📚</div>
        <h3 className="text-white font-bold text-base mb-2">No words yet!</h3>
        <p className="text-slate-400 text-sm mb-6">
          Visit the Words tab and tap "✨ Find words" to build your collection first.
        </p>
        <button
          onClick={onBack}
          className="text-sm bg-indigo-600/40 hover:bg-indigo-600/60 border border-indigo-400/30 text-indigo-200 rounded-xl px-5 py-2.5 transition-colors"
        >
          ← Back to Games
        </button>
      </div>
    );
  }

  /* ─── All done ───────────────────────────────────────────────────────────── */

  if (done) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center">
        <div className="text-5xl mb-3 animate-bounce">🎉</div>
        <h3 className="text-white font-bold text-xl mb-2">Word Wizard!</h3>
        <p className="text-yellow-300 text-sm mb-1">You unscrambled all {words.length} words!</p>
        <p className="text-slate-400 text-xs mb-8">Score: {score} / {words.length} — you earned a ⭐!</p>
        <div className="flex gap-3">
          <button
            onClick={() => { setWordIdx(0); setTiles(scramble(words[0].word)); setChosen([]); setFeedback(null); setScore(0); setDone(false); }}
            className="text-sm font-semibold bg-amber-600/40 hover:bg-amber-600/60 border border-amber-400/30 text-amber-200 rounded-2xl px-6 py-2.5 transition-colors"
          >
            Play Again
          </button>
          <button
            onClick={onBack}
            className="text-sm bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-400/20 text-indigo-200 rounded-2xl px-6 py-2.5 transition-colors"
          >
            Games Menu
          </button>
        </div>
      </div>
    );
  }

  /* ─── Playing ────────────────────────────────────────────────────────────── */

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-white/8">
        <button onClick={onBack} className="text-slate-400 hover:text-slate-200 text-sm transition-colors">← Back</button>
        <span className="text-white font-bold text-sm">🔤 Word Scramble</span>
        <span className="text-slate-400 text-sm tabular-nums">{wordIdx + 1}/{words.length}</span>
      </div>

      {/* Progress bar */}
      <div className="flex-shrink-0 px-4 py-2">
        <div className="h-1.5 rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-400 transition-all duration-500"
            style={{ width: `${(wordIdx / words.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6">
        {/* Definition hint */}
        <div className="w-full bg-indigo-900/40 border border-indigo-400/20 rounded-2xl p-4 text-center">
          <div className="text-2xl mb-1">{currentWord?.emoji}</div>
          <p className="text-indigo-100 text-sm leading-relaxed">{currentWord?.definition}</p>
          {currentWord?.sourceBookTitle && (
            <p className="text-indigo-400/50 text-[10px] mt-1">
              from {currentWord.sourceBookTitle}
            </p>
          )}
        </div>

        {/* Answer slots */}
        <div className="flex gap-1.5 flex-wrap justify-center">
          {answer.split("").map((_, i) => {
            const tileId  = chosen[i];
            const letter  = tileId ? tileId.slice(0, tileId.lastIndexOf("-")) : null;
            return (
              <button
                key={i}
                onClick={() => tileId && unpickTile(tileId)}
                disabled={!tileId || !!feedback}
                className={`w-10 h-10 rounded-xl border-2 font-bold text-base flex items-center justify-center transition-all ${
                  feedback === "correct"
                    ? "border-emerald-400 bg-emerald-500/20 text-emerald-200"
                    : feedback === "wrong"
                    ? "border-red-400 bg-red-500/20 text-red-200"
                    : letter
                    ? "border-indigo-400 bg-indigo-700/40 text-white"
                    : "border-white/20 bg-white/5 text-transparent"
                }`}
              >
                {letter ?? "_"}
              </button>
            );
          })}
        </div>

        {/* Feedback message */}
        {feedback === "correct" && (
          <p className="text-emerald-300 font-bold text-sm animate-pulse">✅ Correct! Great job!</p>
        )}
        {feedback === "wrong" && (
          <p className="text-red-300 font-semibold text-sm">❌ Not quite — try again!</p>
        )}

        {/* Letter bank */}
        <div className="flex gap-2 flex-wrap justify-center">
          {tiles.map(tileId => {
            const letter = tileId.split("-")[0];
            return (
              <button
                key={tileId}
                onClick={() => pickTile(tileId)}
                disabled={!!feedback}
                className="w-11 h-11 rounded-xl border border-violet-400/40 bg-violet-700/30 hover:bg-violet-600/40 active:scale-95 font-bold text-base text-violet-100 transition-all"
              >
                {letter}
              </button>
            );
          })}
        </div>

        {/* Check / clear buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => { setTiles(scramble(currentWord!.word)); setChosen([]); }}
            disabled={chosen.length === 0 || !!feedback}
            className="text-xs text-slate-400 hover:text-slate-200 disabled:opacity-30 transition-colors"
          >
            Clear
          </button>
          <button
            onClick={checkAnswer}
            disabled={chosenLetters.length !== answer.length || !!feedback}
            className="text-sm font-semibold bg-violet-600/40 hover:bg-violet-600/60 disabled:opacity-40 border border-violet-400/30 text-violet-100 rounded-xl px-6 py-2 transition-colors"
          >
            Check ✓
          </button>
        </div>
      </div>
    </div>
  );
}
