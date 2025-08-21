"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ThoughtUnit as BaseThoughtUnit, ReadingStats } from "@/types/reading";
import { saveReadingProgress, loadReadingProgress } from "@/lib/firebase";
import RightBrainToolbar from "@/components/RightBrainToolbar";
import { useStartReview } from "@/hooks/useStartReview";
import { chunkText, stableChunkId } from "@/lib/chunkers";
import { loadUnderstood, markUnderstood } from "@/lib/understoodStore";
import ProgressRing from "@/components/ProgressRing";
import { Document, Page } from "react-pdf";

type HRUnit = BaseThoughtUnit | string | string[] | { text?: string };

interface EnhancedHybridReaderProps {
  bookId: string;
  userId: string;

  // PDF Integration - Primary view
  pdfUrl: string;
  currentPage: number;
  pdfPageCount?: number;
  onPageChange: (page: number) => void;

  sampleText: string;
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

  onTextSelect?: (text: string) => void;
  onGenerateNote?: (text: string, mnemonic?: string, mode?: "sketch" | "highYield") => void;

  selBind?: { onMouseUp?: (e: React.MouseEvent) => void };
  externalSelectionText?: string;

  // Voice settings
  selectedVoice?: SpeechSynthesisVoice;
  onVoiceChange?: (voice: SpeechSynthesisVoice) => void;
  speechRate?: number;
  onSpeechRateChange?: (rate: number) => void;
}

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

// Enhanced PDF highlighting overlay
function createHighlightOverlay(
  pdfContainer: HTMLElement,
  highlightText: string,
  color: string = "rgba(255, 235, 59, 0.3)"
) {
  // Remove existing highlights
  const existingHighlights = pdfContainer.querySelectorAll('.pdf-highlight-overlay');
  existingHighlights.forEach(el => el.remove());

  if (!highlightText.trim()) return;

  // Find text nodes in PDF
  const walker = document.createTreeWalker(
    pdfContainer,
    NodeFilter.SHOW_TEXT,
    null
  );

  const textNodes: Text[] = [];
  let node;
  while (node = walker.nextNode()) {
    textNodes.push(node as Text);
  }

  // Search for matching text and create highlights
  textNodes.forEach(textNode => {
    const text = textNode.textContent || '';
    const regex = new RegExp(escapeRegExp(highlightText), 'gi');
    const matches = [...text.matchAll(regex)];

    matches.forEach(match => {
      if (match.index !== undefined) {
        const range = document.createRange();
        range.setStart(textNode, match.index);
        range.setEnd(textNode, match.index + match[0].length);

        const rect = range.getBoundingClientRect();
        const containerRect = pdfContainer.getBoundingClientRect();

        const highlight = document.createElement('div');
        highlight.className = 'pdf-highlight-overlay';
        highlight.style.cssText = `
          position: absolute;
          left: ${rect.left - containerRect.left}px;
          top: ${rect.top - containerRect.top}px;
          width: ${rect.width}px;
          height: ${rect.height}px;
          background-color: ${color};
          pointer-events: none;
          z-index: 10;
          border-radius: 2px;
          animation: highlightPulse 2s ease-in-out infinite;
        `;

        pdfContainer.appendChild(highlight);
      }
    });
  });
}

const COMPREHENSION_PROMPTS = [
  { label: "Explain", build: (ctx: string) => `Explain in your own words:\n\n${ctx}` },
  { label: "Analogy", build: (ctx: string) => `Create a vivid analogy for this idea:\n\n${ctx}` },
  { label: "Example", build: (ctx: string) => `Give a concrete example that demonstrates:\n\n${ctx}` },
  { label: "Why →", build: (ctx: string) => `Why does this happen? Justify the steps:\n\n${ctx}` },
] as const;

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

export default function EnhancedHybridReader({
  bookId,
  userId,
  pdfUrl,
  currentPage,
  pdfPageCount,
  onPageChange,
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
  readingSpeed = 200,
  setReadingSpeed,
  isReading = true,
  isPaused = false,
  selBind,
  externalSelectionText,
  selectedVoice,
  onVoiceChange,
  speechRate = 1.0,
  onSpeechRateChange,
}: EnhancedHybridReaderProps) {
  const [selectionText, setSelectionText] = useState("");
  const [promptIdx, setPromptIdx] = useState(0);
  const [phase, setPhase] = useState<"gist" | "pattern" | "detail">("gist");
  const [localPaused, setLocalPaused] = useState(false);

  // Enhanced PDF controls
  const [pdfScale, setPdfScale] = useState(1.2);
  const [showProgressiveOverlay, setShowProgressiveOverlay] = useState(true);
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  // Chunking and progressive features
  const [chunkChars, setChunkChars] = useState(260);
  const [chunkMode, setChunkMode] = useState<"semantic" | "sentence" | "bullet-first">("semantic");
  const [understoodMap, setUnderstoodMap] = useState<Record<string, true>>({});

  // Voice and speech
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(false);

  const { isReviewMode, currentCard, startReview, gradeCard } = useStartReview(userId);

  // Load voices
  useEffect(() => {
    const loadVoices = () => {
      const voices = speechSynthesis.getVoices();
      setAvailableVoices(voices);
    };
    
    loadVoices();
    speechSynthesis.addEventListener('voiceschanged', loadVoices);
    
    return () => {
      speechSynthesis.removeEventListener('voiceschanged', loadVoices);
    };
  }, []);

  // Load saved progress
  useEffect(() => {
    if (!userId || !bookId) return;
    loadReadingProgress(userId, bookId).then((progress: any) => {
      if (!progress) return;
      if (typeof progress.currentPage === "number") onPageChange(progress.currentPage);
      if (typeof progress.currentThoughtUnit === "number")
        setCurrentThoughtUnit(progress.currentThoughtUnit);
      if (typeof progress.highlightedWord === "string") setHighlightedWord(progress.highlightedWord);
      if (typeof progress.readingSpeed === "number") setReadingSpeed?.(progress.readingSpeed);
    });
  }, [userId, bookId, onPageChange, setCurrentThoughtUnit, setHighlightedWord, setReadingSpeed]);

  // Load understood map
  useEffect(() => {
    if (!bookId) return;
    loadUnderstood(userId || "guest", bookId).then((m) => setUnderstoodMap(m || {})).catch(() => {});
  }, [userId, bookId]);

  // Throttled save progress
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

  // Enhanced speech function
  const speakText = (text: string) => {
    if (!text.trim()) return;
    
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }
    
    utterance.rate = speechRate;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    
    speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  // Selection fallback
  const handleMouseUp = () => {
    if (typeof window === "undefined") return;
    const sel = window.getSelection()?.toString().trim() || "";
    setSelectionText(sel);
    if (sel) onTextSelect?.(sel);
  };

  // Empty states
  if (!thoughtUnits?.length) {
    return (
      <div className="p-4 flex items-center justify-center text-gray-400 italic">
        📂 Please upload a PDF to start Enhanced Hybrid Reading.
      </div>
    );
  }

  const rawUnit = thoughtUnits[currentThoughtUnit - 1];
  if (!rawUnit) {
    return (
      <div className="p-4 flex items-center justify-center text-gray-400 italic">
        ⏳ Preparing your enhanced hybrid view...
      </div>
    );
  }

  const unitText = unitToText(rawUnit);

  // Enhanced chunking
  const chunks = useMemo(
    () => chunkText(unitText, { mode: chunkMode, targetChars: chunkChars }),
    [unitText, chunkMode, chunkChars]
  );
  const [activeIdx, setActiveIdx] = useState(0);
  useEffect(() => setActiveIdx(0), [unitText, chunkChars, chunkMode]);

  // Auto-advance with speech
  useEffect(() => {
    if (!chunks.length || !isReading || isPaused || localPaused) return;
    const msPerChunk = Math.max(600, (60_000 / Math.max(120, readingSpeed)) * 1.2);
    const t = window.setInterval(() => {
      setActiveIdx((i) => {
        const nextIdx = Math.min(i + 1, chunks.length - 1);
        if (autoSpeak && nextIdx !== i) {
          speakText(chunks[nextIdx]);
        }
        return nextIdx;
      });
    }, msPerChunk);
    return () => window.clearInterval(t);
  }, [chunks.length, readingSpeed, isReading, isPaused, localPaused, autoSpeak]);

  const activeChunk = chunks[activeIdx] || "";
  const cueToken = keyTokenFromChunk(activeChunk);
  const activeChunkId = stableChunkId(activeChunk);
  const isUnderstood = !!understoodMap[activeChunkId];

  const effectiveSelection = (externalSelectionText?.trim() || selectionText).trim();

  // Highlight in PDF when chunk changes
  useEffect(() => {
    if (pdfContainerRef.current && cueToken && showProgressiveOverlay) {
      setTimeout(() => {
        createHighlightOverlay(pdfContainerRef.current!, cueToken);
      }, 100);
    }
  }, [cueToken, currentPage, showProgressiveOverlay]);

  // Memoize highlight regex
  const hlRegex = useMemo(() => {
    if (!highlightedWord) return null;
    try {
      return new RegExp(`\\b${escapeRegExp(highlightedWord)}\\b`);
    } catch {
      return null;
    }
  }, [highlightedWord]);

  const activePrompt = COMPREHENSION_PROMPTS[promptIdx];
  const promptContext = (effectiveSelection || activeChunk || unitText || sampleText).trim();

  // Hotkeys
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const editable = (e.target as HTMLElement)?.getAttribute?.("contenteditable") === "true";
      if (tag === "INPUT" || tag === "TEXTAREA" || editable) return;

      if (e.code === "Space") {
        e.preventDefault();
        setLocalPaused((p) => !p);
      } else if (e.key === "ArrowRight" || e.key.toLowerCase() === "j") {
        const nextIdx = Math.min(activeIdx + 1, chunks.length - 1);
        setActiveIdx(nextIdx);
        if (autoSpeak) speakText(chunks[nextIdx]);
      } else if (e.key === "ArrowLeft" || e.key.toLowerCase() === "k") {
        const prevIdx = Math.max(activeIdx - 1, 0);
        setActiveIdx(prevIdx);
        if (autoSpeak) speakText(chunks[prevIdx]);
      } else if (e.key.toLowerCase() === "g") {
        e.preventDefault();
        toggleUnderstood();
      } else if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (isSpeaking) {
          stopSpeaking();
        } else {
          speakText(activeChunk);
        }
      } else if (e.key === "Enter") {
        onGenerateNote?.(activePrompt.build(promptContext), undefined, "highYield");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chunks.length, promptContext, promptIdx, activeChunk, activeIdx, isSpeaking, autoSpeak]);

  function toggleUnderstood() {
    setUnderstoodMap((m) => {
      const next = { ...m };
      if (next[activeChunkId]) delete next[activeChunkId];
      else next[activeChunkId] = true;
      return next;
    });
    markUnderstood(userId || "guest", bookId, activeChunkId).catch(() => {});
  }

  const [showQuiz, setShowQuiz] = useState(false);
  const quiz = useMemo(() => makeTwoChoiceQuiz(activeChunk), [activeChunk]);
  const [quizPick, setQuizPick] = useState<number | null>(null);
  useEffect(() => {
    setQuizPick(null);
  }, [quiz.prompt, activeChunkId]);

  const understoodCount = useMemo(
    () => chunks.reduce((n, c) => n + (understoodMap[stableChunkId(c)] ? 1 : 0), 0),
    [chunks, understoodMap]
  );
  const understoodPct = chunks.length ? Math.round((understoodCount / chunks.length) * 100) : 0;

  return (
    <div className="grid grid-cols-7 gap-4 p-4 h-full">
      {/* Enhanced PDF View (Left - 70% more room) */}
      <div className="col-span-4 bg-gray-800 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between p-3 bg-gray-700">
          <h4 className="text-sm font-semibold text-yellow-400">📄 PDF Reader</h4>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange(Math.max(1, currentPage - 1))}
              disabled={currentPage <= 1}
              className="text-xs px-2 py-1 bg-gray-600 rounded hover:bg-gray-500 disabled:opacity-50"
            >
              ◀
            </button>
            <span className="text-xs">{currentPage} / {pdfPageCount || '?'}</span>
            <button
              onClick={() => onPageChange(Math.min(pdfPageCount || 999, currentPage + 1))}
              disabled={currentPage >= (pdfPageCount || 999)}
              className="text-xs px-2 py-1 bg-gray-600 rounded hover:bg-gray-500 disabled:opacity-50"
            >
              ▶
            </button>
            <div className="w-px h-4 bg-gray-600 mx-2" />
            <button
              onClick={() => setPdfScale(s => Math.max(0.5, s - 0.1))}
              className="text-xs px-2 py-1 bg-gray-600 rounded hover:bg-gray-500"
            >
              -
            </button>
            <span className="text-xs">{Math.round(pdfScale * 100)}%</span>
            <button
              onClick={() => setPdfScale(s => Math.min(3.0, s + 0.1))}
              className="text-xs px-2 py-1 bg-gray-600 rounded hover:bg-gray-500"
            >
              +
            </button>
            <button
              onClick={() => setShowProgressiveOverlay(!showProgressiveOverlay)}
              className={`text-xs px-2 py-1 rounded ${
                showProgressiveOverlay ? "bg-yellow-600" : "bg-gray-600 hover:bg-gray-500"
              }`}
            >
              ✨ Highlights
            </button>
          </div>
        </div>
        <div 
          ref={pdfContainerRef}
          className="h-full overflow-auto relative"
          onMouseUp={selBind?.onMouseUp ?? handleMouseUp}
        >
          <Document file={pdfUrl}>
            <Page 
              pageNumber={currentPage} 
              scale={pdfScale}
              renderTextLayer={true}
              renderAnnotationLayer={true}
            />
          </Document>
        </div>
      </div>

      {/* Enhanced Progressive Interaction Panel (Right - 40%) */}
      <div className="col-span-2 bg-gray-800 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between p-3 bg-gray-700">
          <h4 className="text-sm font-semibold text-yellow-400">🧠 Progressive View</h4>
          <div className="flex items-center gap-2">
            <ProgressRing value={understoodPct / 100} size={24} label={`${understoodPct}%`} />
            <span className="text-xs opacity-75">{understoodCount}/{chunks.length}</span>
          </div>
        </div>

        <div className="p-4 h-full overflow-y-auto space-y-4">
          {/* Voice Controls */}
          <div className="p-3 bg-gray-900/50 rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs opacity-75">Voice:</span>
              <select
                className="text-xs bg-gray-700 rounded px-2 py-1 flex-1"
                value={selectedVoice?.name || ''}
                onChange={(e) => {
                  const voice = availableVoices.find(v => v.name === e.target.value);
                  if (voice && onVoiceChange) onVoiceChange(voice);
                }}
              >
                <option value="">Default</option>
                {availableVoices
                  .filter(v => v.lang.startsWith('en'))
                  .map(voice => (
                    <option key={voice.name} value={voice.name}>
                      {voice.name.split(' ')[0]} ({voice.lang})
                    </option>
                  ))
                }
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs opacity-75">Speed:</span>
              <input
                type="range"
                min={0.5}
                max={2.0}
                step={0.1}
                value={speechRate}
                onChange={(e) => onSpeechRateChange?.(Number(e.target.value))}
                className="flex-1"
              />
              <span className="text-xs">{speechRate}x</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setAutoSpeak(!autoSpeak)}
                className={`text-xs px-2 py-1 rounded flex-1 ${
                  autoSpeak ? "bg-green-600" : "bg-gray-700 hover:bg-gray-600"
                }`}
              >
                🔊 Auto
              </button>
              <button
                onClick={() => isSpeaking ? stopSpeaking() : speakText(activeChunk)}
                className={`text-xs px-2 py-1 rounded flex-1 ${
                  isSpeaking ? "bg-red-600 hover:bg-red-500" : "bg-blue-600 hover:bg-blue-500"
                }`}
              >
                {isSpeaking ? "⏹️ Stop" : "🎵 Speak"}
              </button>
            </div>
          </div>

          {/* Enhanced Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1">
              <span className="text-[10px] opacity-75">Chunk</span>
              <input
                type="range"
                min={120}
                max={400}
                step={20}
                value={chunkChars}
                onChange={(e) => setChunkChars(Number(e.target.value))}
                className="w-16"
              />
            </div>
            <select
              className="text-xs bg-gray-700 rounded px-1 py-0.5"
              value={chunkMode}
              onChange={(e) => setChunkMode(e.target.value as any)}
            >
              <option value="semantic">Semantic</option>
              <option value="sentence">Sentence</option>
              <option value="bullet-first">Bullet-first</option>
            </select>
            <button
              onClick={toggleUnderstood}
              className={`text-xs px-2 py-1 rounded ${
                isUnderstood ? "bg-green-500 text-black" : "bg-gray-700 hover:bg-gray-600"
              }`}
            >
              {isUnderstood ? "✓ Got it" : "Got it?"}
            </button>
          </div>

          {/* Right-Brain Phase Controls */}
          <div className="flex gap-1">
            {(["gist", "pattern", "detail"] as const).map((p) => (
              <button
                key={p}
                className={`text-xs px-2 py-1 rounded flex-1 ${
                  phase === p ? "bg-yellow-500 text-black" : "bg-gray-700 hover:bg-gray-600"
                }`}
                onClick={() => setPhase(p)}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Progressive Chunks Display */}
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {chunks.map((chunk, idx) => {
              const isActive = idx === activeIdx;
              const includes = hlRegex ? hlRegex.test(chunk) : false;
              const chunkId = stableChunkId(chunk);
              const understood = !!understoodMap[chunkId];

              return (
                <div
                  key={`${idx}-${chunkId}`}
                  className={`
                    text-sm p-2 rounded cursor-pointer transition-all duration-200
                    ${isActive ? 'bg-yellow-500/20 border border-yellow-500/50' : 'bg-gray-700/50'}
                    ${includes ? 'ring-1 ring-yellow-400' : ''}
                    ${understood ? 'border-l-2 border-green-500' : ''}
                    hover:bg-yellow-500/10
                  `}
                  onClick={() => {
                    setActiveIdx(idx);
                    onWordClick(chunk);
                    setHighlightedWord(keyTokenFromChunk(chunk) || chunk);
                    setSelectionText(chunk);
                    onTextSelect?.(chunk);
                    if (autoSpeak) speakText(chunk);
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 text-xs leading-relaxed">{chunk}</div>
                    <div className="flex items-center gap-1 ml-2">
                      {understood && <span className="text-green-400 text-xs">✓</span>}
                      {isActive && isSpeaking && <span className="text-blue-400 text-xs animate-pulse">🔊</span>}
                      <span className="text-xs opacity-40">{idx + 1}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right-Brain Analysis */}
          <div className="p-3 bg-gray-900/60 rounded-lg">
            <div className="text-xs uppercase tracking-wide text-gray-300 mb-2">
              Right-Brain: {phase === "gist" ? "Gist" : phase === "pattern" ? "Pattern" : "Detail"}
            </div>

            {phase === "gist" && (
              <div className="text-sm">
                <p className="font-semibold mb-1 text-yellow-300">{cueToken || "Key idea"}</p>
                <p className="text-xs opacity-90">{(activeChunk || unitText).split(/(?<=[.!?])\s+/)[0]}</p>
              </div>
            )}

            {phase === "pattern" && (
              <div className="text-xs space-y-1">
                <p className="mb-1">Look for relations:</p>
                <ul className="list-disc pl-4 space-y-0.5 opacity-90">
                  <li>Cause → effect? <span className="opacity-70">(because, therefore)</span></li>
                  <li>Compare/contrast? <span className="opacity-70">(however, whereas)</span></li>
                  <li>Sequence? <span className="opacity-70">(first, next, then)</span></li>
                </ul>
              </div>
            )}

            {phase === "detail" && (
              <div className="text-xs opacity-90">{activeChunk || unitText}</div>
            )}

            {/* Action buttons */}
            <div className="mt-2 flex flex-wrap gap-1">
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
              >
                Quiz
              </button>
            </div>
          </div>

          {/* Quick quiz */}
          {showQuiz && (
            <div className="p-3 bg-gray-900/80 rounded-lg border border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs uppercase tracking-wide text-gray-300">Quick Quiz</div>
                <button
                  className="text-xs px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600"
                  onClick={() => setShowQuiz(false)}
                >
                  ✕
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
      </div>

      {/* Enhanced Styles */}
      <style jsx>{`
        @keyframes highlightPulse {
          0%   { opacity: 0.3; }
          50%  { opacity: 0.6; }
          100% { opacity: 0.3; }
        }
        .pdf-highlight-overlay {
          animation: highlightPulse 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
