// components/elena/MemoryMatch.tsx
// Memory Match — flip cards to pair each word with its definition.
// Loads vocabulary words from IndexedDB. Requires at least 2 words.
// Max 6 word pairs per round (12 cards).

import React, { useState, useEffect, useCallback, useRef } from "react";
import { loadVocabWords } from "@/lib/elena/idbStore";
import type { VocabWord } from "@/lib/elena/vocabulary";

/* ─── Types ──────────────────────────────────────────────────────────────────── */

type Card = {
  id:     string;   // unique per card (two cards share a pairId)
  pairId: string;   // same for the word card and its definition card
  type:   "word" | "def";
  label:  string;
  emoji:  string;
};

type GameState = "idle" | "playing" | "won";

/* ─── Helpers ────────────────────────────────────────────────────────────────── */

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildCards(words: VocabWord[]): Card[] {
  const pairs: Card[] = [];
  words.slice(0, 6).forEach(w => {
    pairs.push({ id: `${w.id}-w`, pairId: w.id, type: "word", label: w.word,       emoji: w.emoji });
    pairs.push({ id: `${w.id}-d`, pairId: w.id, type: "def",  label: w.definition, emoji: w.emoji });
  });
  return shuffle(pairs);
}

/* ─── Props ──────────────────────────────────────────────────────────────────── */

interface MemoryMatchProps {
  childProfileId: string;
  onBack:         () => void;
  onWin:          () => void;
}

/* ─── Component ──────────────────────────────────────────────────────────────── */

export default function MemoryMatch({ childProfileId, onBack, onWin }: MemoryMatchProps) {
  const [words,     setWords]     = useState<VocabWord[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [cards,     setCards]     = useState<Card[]>([]);
  const [flipped,   setFlipped]   = useState<Set<string>>(new Set());
  const [matched,   setMatched]   = useState<Set<string>>(new Set());
  const [disabled,  setDisabled]  = useState(false);
  const [moves,     setMoves]     = useState(0);
  const [gameState, setGameState] = useState<GameState>("idle");
  const flipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (flipTimerRef.current) clearTimeout(flipTimerRef.current); }, []);

  useEffect(() => {
    let alive = true;
    loadVocabWords(childProfileId)
      .then(ws => { if (alive) setWords(ws); })
      .catch(() => { if (alive) setLoadError(true); });
    return () => { alive = false; };
  }, [childProfileId]);

  const startGame = useCallback(() => {
    const picked = shuffle(words).slice(0, 6);
    setCards(buildCards(picked));
    setFlipped(new Set());
    setMatched(new Set());
    setMoves(0);
    setDisabled(false);
    setGameState("playing");
  }, [words]);

  const handleFlip = useCallback((card: Card) => {
    if (disabled || matched.has(card.pairId) || flipped.has(card.id)) return;

    const newFlipped = new Set(flipped).add(card.id);
    setFlipped(newFlipped);

    const openIds = [...newFlipped];
    if (openIds.length < 2) return;

    // Two cards open — check for match
    setDisabled(true);
    setMoves(m => m + 1);

    const [aId, bId] = openIds;
    const a = cards.find(c => c.id === aId)!;
    const b = cards.find(c => c.id === bId)!;

    if (a.pairId === b.pairId && a.type !== b.type) {
      // Match!
      const newMatched = new Set(matched).add(a.pairId);
      setMatched(newMatched);
      setFlipped(new Set());
      setDisabled(false);
      if (newMatched.size === cards.length / 2) {
        setGameState("won");
        onWin();
      }
    } else {
      // No match — flip back after delay
      flipTimerRef.current = setTimeout(() => {
        setFlipped(new Set());
        setDisabled(false);
      }, 1000);
    }
  }, [disabled, matched, flipped, cards, onWin]);

  /* ─── Not enough words ───────────────────────────────────────────────────── */

  if (loadError || (words.length < 2 && gameState === "idle")) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center">
        <div className="text-5xl mb-4">📚</div>
        <h3 className="text-white font-bold text-base mb-2">Not enough words yet!</h3>
        <p className="text-slate-400 text-sm mb-6">
          {loadError
            ? "Could not load your word list. Try again."
            : "You need at least 2 words in your collection. Go to the Words tab and tap \"✨ Find words\"!"}
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

  /* ─── Idle — start screen ────────────────────────────────────────────────── */

  if (gameState === "idle") {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center">
        <div className="text-5xl mb-4">🃏</div>
        <h3 className="text-white font-bold text-lg mb-2">Memory Match</h3>
        <p className="text-slate-400 text-sm mb-2">
          Flip cards to match each word with its definition.
        </p>
        <p className="text-indigo-300/70 text-xs mb-8">
          {words.length} word{words.length !== 1 ? "s" : ""} in your collection
          {words.length > 6 ? " — up to 6 will be used per round" : ""}
        </p>
        <button
          onClick={startGame}
          className="text-sm font-semibold bg-emerald-600/40 hover:bg-emerald-600/60 border border-emerald-400/30 text-emerald-200 rounded-2xl px-8 py-3 transition-colors mb-4"
        >
          ▶ Start Game
        </button>
        <button onClick={onBack} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
          ← Back
        </button>
      </div>
    );
  }

  /* ─── Won screen ─────────────────────────────────────────────────────────── */

  if (gameState === "won") {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center">
        <div className="text-5xl mb-3 animate-bounce">🏆</div>
        <h3 className="text-white font-bold text-xl mb-2">Amazing job!</h3>
        <p className="text-yellow-300 text-sm mb-1">You matched all the pairs!</p>
        <p className="text-slate-400 text-xs mb-8">{moves} move{moves !== 1 ? "s" : ""} — you earned a ⭐!</p>
        <div className="flex gap-3">
          <button
            onClick={startGame}
            className="text-sm font-semibold bg-emerald-600/40 hover:bg-emerald-600/60 border border-emerald-400/30 text-emerald-200 rounded-2xl px-6 py-2.5 transition-colors"
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

  /* ─── Playing — card grid ────────────────────────────────────────────────── */

  const pairCount = cards.length / 2;
  const cols      = pairCount <= 3 ? "grid-cols-3" : pairCount <= 4 ? "grid-cols-4" : "grid-cols-4";

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-white/8">
        <button onClick={onBack} className="text-slate-400 hover:text-slate-200 text-sm transition-colors">← Back</button>
        <span className="text-white font-bold text-sm">🃏 Memory Match</span>
        <span className="text-slate-400 text-sm tabular-nums">{matched.size}/{pairCount} pairs</span>
      </div>

      {/* Progress bar */}
      <div className="flex-shrink-0 px-4 py-2">
        <div className="h-1.5 rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
            style={{ width: `${(matched.size / pairCount) * 100}%` }}
          />
        </div>
      </div>

      {/* Card grid */}
      <div className={`flex-1 overflow-y-auto px-4 pb-4 grid ${cols} gap-2.5 content-start pt-2`}>
        {cards.map(card => {
          const isFlipped  = flipped.has(card.id);
          const isMatched  = matched.has(card.pairId);
          const faceUp     = isFlipped || isMatched;

          return (
            <button
              key={card.id}
              onClick={() => handleFlip(card)}
              disabled={faceUp && !isFlipped}
              className={`rounded-xl border aspect-square flex flex-col items-center justify-center p-2 text-center transition-all duration-200 ${
                isMatched
                  ? "border-emerald-400/40 bg-emerald-500/15 cursor-default"
                  : faceUp
                  ? "border-indigo-400/50 bg-indigo-800/40"
                  : "border-white/15 bg-white/5 hover:bg-white/10 active:scale-95"
              }`}
            >
              {faceUp ? (
                <>
                  <span className="text-lg mb-1">{card.emoji}</span>
                  <span className={`text-[10px] leading-tight font-medium line-clamp-3 ${
                    isMatched ? "text-emerald-200" : "text-white"
                  }`}>
                    {card.label}
                  </span>
                  {card.type === "word" && (
                    <span className="text-[8px] text-indigo-400/70 mt-0.5 uppercase tracking-wide">word</span>
                  )}
                </>
              ) : (
                <span className="text-2xl">?</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Move counter */}
      <div className="flex-shrink-0 text-center py-2 text-xs text-slate-500 tabular-nums">
        {moves} move{moves !== 1 ? "s" : ""}
      </div>
    </div>
  );
}
