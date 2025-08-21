"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ThoughtUnit as BaseThoughtUnit, ReadingStats } from "@/types/reading";
import { useStartReview } from "@/hooks/useStartReview";
import RightBrainToolbar from "@/components/RightBrainToolbar";
import RightBrainNoteEditor from "@/components/RightBrainNoteEditor";
import { saveReadingProgress, loadReadingProgress } from "@/lib/firebase";
import { chunkText, stableChunkId } from "@/lib/chunkers";
import { loadUnderstood, markUnderstood } from "@/lib/understoodStore";
import { Document, Page } from "react-pdf";

type PVUnit = BaseThoughtUnit | string | string[] | { text?: string };

interface EnhancedProgressiveViewProps {
  bookId: string;
  userId: string;
  thoughtUnits: PVUnit[];
  currentThoughtUnit: number;
  
  // PDF Integration
  pdfUrl?: string;
  currentPage: number;
  pdfPageCount?: number;
  onPageChange?: (page: number) => void;

  readingSpeed: number;
  isReading?: boolean;
  isPaused?: boolean;

  stats?: ReadingStats;
  highlightedWord: string;

  fontSize: number;
  fontFamily: string;
  lineSpacing: number;

  onWordClick?: (word: string) => void;
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

// Enhanced chunk highlighting with core idea extraction
function extractCoreIdea(chunk: string): string {
  const sentences = chunk.split(/[.!?]+/).filter(s => s.trim().length > 10);
  if (sentences.length === 0) return chunk;
  
  // Find sentence with key indicators (definitions, main concepts)
  const keyIndicators = ['is', 'are', 'means', 'refers to', 'defined as', 'concept of'];
  const coreIdea = sentences.find(s => 
    keyIndicators.some(indicator => s.toLowerCase().includes(indicator))
  ) || sentences[0];
  
  return coreIdea.trim();
}

// Right-brain focused chunk analysis
function analyzeChunkForRightBrain(chunk: string) {
  const words = chunk.split(/\s+/).filter(Boolean);
  const keyTerms = words.filter(w => 
    w.length > 5 || 
    /^[A-Z]/.test(w) || 
    /\d/.test(w)
  );
  
  return {
    coreIdea: extractCoreIdea(chunk),
    keyTerms: keyTerms.slice(0, 3),
    visualCues: words.filter(w => 
      ['diagram', 'figure', 'chart', 'graph', 'image', 'illustration'].includes(w.toLowerCase())
    ),
    actionWords: words.filter(w => 
      ['process', 'method', 'step', 'procedure', 'technique'].includes(w.toLowerCase())
    )
  };
}

export default function EnhancedProgressiveView({
  bookId,
  userId,
  thoughtUnits,
  currentThoughtUnit,
  pdfUrl,
  currentPage,
  pdfPageCount,
  onPageChange,
  readingSpeed,
  isReading = true,
  isPaused = false,
  highlightedWord,
  fontSize,
  fontFamily,
  lineSpacing,
  onWordClick,
  setReadingSpeed,
  onTextSelect,
  onGenerateNote,
  selBind,
  externalSelectionText,
  selectedVoice,
  onVoiceChange,
  speechRate = 1.0,
  onSpeechRateChange,
}: EnhancedProgressiveViewProps) {
  const [loaded, setLoaded] = useState(false);
  const [selectionText, setSelectionText] = useState("");
  const [showNoteEditor, setShowNoteEditor] = useState(false);
  const [localPaused, setLocalPaused] = useState(false);
  
  // Enhanced chunking with right-brain focus
  const [chunkChars, setChunkChars] = useState(200); // Smaller chunks for better focus
  const [chunkMode, setChunkMode] = useState<"semantic" | "sentence" | "bullet-first">("semantic");
  const [focusMode, setFocusMode] = useState<"core" | "detail" | "visual">("core");
  
  // PDF view integration
  const [pdfScale, setPdfScale] = useState(0.8);
  const [showPdfOverlay, setShowPdfOverlay] = useState(true);
  
  // Voice and speech
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(false);
  
  // Understood tracking
  const [understoodMap, setUnderstoodMap] = useState<Record<string, true>>({});
  
  const { isReviewMode, currentCard, startReview, gradeCard } = useStartReview(userId);

  // Load available voices
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

  // Load understood map
  useEffect(() => {
    if (!bookId) return;
    loadUnderstood(userId || "guest", bookId)
      .then((m) => setUnderstoodMap(m || {}))
      .catch(() => {});
  }, [userId, bookId]);

  // Load saved progress
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
    return () => { cancelled = true; };
  }, [userId, bookId, setReadingSpeed]);

  // Empty states
  if (!thoughtUnits || thoughtUnits.length === 0) {
    return (
      <div className="p-4 flex items-center justify-center text-gray-400 italic">
        📂 Please upload a PDF to start Enhanced Progressive Reading.
      </div>
    );
  }

  const rawUnit = thoughtUnits[currentThoughtUnit - 1];
  if (!rawUnit) {
    return (
      <div className="p-4 flex items-center justify-center text-gray-400 italic">
        ⏳ Preparing your enhanced reading view...
      </div>
    );
  }

  const unitText = unitToText(rawUnit);

  // Enhanced chunking with right-brain analysis
  const chunks = useMemo(
    () => chunkText(unitText, { mode: chunkMode, targetChars: chunkChars }),
    [unitText, chunkMode, chunkChars]
  );

  const [activeIdx, setActiveIdx] = useState(0);
  useEffect(() => setActiveIdx(0), [unitText, chunkMode, chunkChars]);

  // Auto-advance with speech integration
  useEffect(() => {
    if (!chunks.length || !isReading || isPaused || localPaused) return;
    const msPerChunk = Math.max(800, (60_000 / Math.max(120, readingSpeed)) * 1.5);
    const t = window.setInterval(
      () => setActiveIdx((i) => {
        const nextIdx = Math.min(i + 1, chunks.length - 1);
        if (autoSpeak && nextIdx !== i) {
          speakChunk(chunks[nextIdx]);
        }
        return nextIdx;
      }),
      msPerChunk
    );
    return () => window.clearInterval(t);
  }, [chunks, readingSpeed, isReading, isPaused, localPaused, autoSpeak]);

  const activeChunk = chunks[activeIdx] || "";
  const activeChunkId = stableChunkId(activeChunk);
  const isUnderstood = !!understoodMap[activeChunkId];
  const chunkAnalysis = analyzeChunkForRightBrain(activeChunk);

  // Enhanced speech function
  const speakChunk = (text: string) => {
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
        if (autoSpeak) speakChunk(chunks[nextIdx]);
      } else if (e.key === "ArrowLeft" || e.key.toLowerCase() === "k") {
        const prevIdx = Math.max(activeIdx - 1, 0);
        setActiveIdx(prevIdx);
        if (autoSpeak) speakChunk(chunks[prevIdx]);
      } else if (e.key.toLowerCase() === "g") {
        e.preventDefault();
        toggleUnderstood();
      } else if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (isSpeaking) {
          stopSpeaking();
        } else {
          speakChunk(activeChunk);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chunks.length, activeChunkId, activeIdx, activeChunk, isSpeaking, autoSpeak]);

  function toggleUnderstood() {
    setUnderstoodMap((m) => {
      const next = { ...m };
      if (next[activeChunkId]) delete next[activeChunkId];
      else next[activeChunkId] = true;
      return next;
    });
    markUnderstood(userId || "guest", bookId, activeChunkId).catch(() => {});
  }

  const handleMouseUp = () => {
    const selection = window.getSelection()?.toString().trim() || "";
    setSelectionText(selection);
    onTextSelect?.(selection);
  };

  const effectiveSelection = (externalSelectionText?.trim() || selectionText).trim();

  return (
    <div className="grid grid-cols-3 gap-4 p-4 h-full">
      {/* PDF View (Left - 40%) */}
      {pdfUrl && showPdfOverlay && (
        <div className="col-span-1 bg-gray-800 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between p-2 bg-gray-700">
            <h4 className="text-sm font-semibold text-yellow-400">PDF View</h4>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPdfScale(s => Math.max(0.5, s - 0.1))}
                className="text-xs px-2 py-1 bg-gray-600 rounded hover:bg-gray-500"
              >
                -
              </button>
              <span className="text-xs">{Math.round(pdfScale * 100)}%</span>
              <button
                onClick={() => setPdfScale(s => Math.min(2.0, s + 0.1))}
                className="text-xs px-2 py-1 bg-gray-600 rounded hover:bg-gray-500"
              >
                +
              </button>
              <button
                onClick={() => setShowPdfOverlay(false)}
                className="text-xs px-2 py-1 bg-red-600 rounded hover:bg-red-500"
              >
                ✕
              </button>
            </div>
          </div>
          <div className="h-full overflow-auto">
            <Document file={pdfUrl}>
              <Page 
                pageNumber={currentPage} 
                scale={pdfScale}
                renderTextLayer={false}
                renderAnnotationLayer={false}
              />
            </Document>
          </div>
        </div>
      )}

      {/* Enhanced Progressive View (Center/Right) */}
      <div 
        className={`${showPdfOverlay && pdfUrl ? 'col-span-2' : 'col-span-3'} bg-gray-800 p-4 rounded-lg overflow-y-auto`}
        style={{ fontSize: `${fontSize}px`, fontFamily, lineHeight: lineSpacing }}
        onMouseUp={selBind?.onMouseUp ?? handleMouseUp}
      >
        {/* Enhanced Controls */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-[11px] opacity-75">Focus</span>
            <select
              className="text-xs bg-gray-700 rounded px-2 py-1"
              value={focusMode}
              onChange={(e) => setFocusMode(e.target.value as any)}
            >
              <option value="core">Core Ideas</option>
              <option value="detail">Details</option>
              <option value="visual">Visual Cues</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] opacity-75">Chunk</span>
            <input
              type="range"
              min={100}
              max={300}
              step={20}
              value={chunkChars}
              onChange={(e) => setChunkChars(Number(e.target.value))}
              className="w-20"
            />
            <span className="text-xs">{chunkChars}</span>
          </div>

          <button
            onClick={() => setLocalPaused((p) => !p)}
            className="text-[11px] px-2 py-1 rounded bg-gray-700 hover:bg-gray-600"
          >
            {localPaused || isPaused ? "▶️ Resume" : "⏸️ Pause"}
          </button>

          <button
            onClick={toggleUnderstood}
            className={`text-[11px] px-2 py-1 rounded ${
              isUnderstood ? "bg-green-500 text-black" : "bg-gray-700 hover:bg-gray-600"
            }`}
          >
            {isUnderstood ? "✓ Got it" : "Got it?"}
          </button>

          {!showPdfOverlay && pdfUrl && (
            <button
              onClick={() => setShowPdfOverlay(true)}
              className="text-[11px] px-2 py-1 rounded bg-blue-600 hover:bg-blue-500"
            >
              📄 Show PDF
            </button>
          )}
        </div>

        {/* Voice Controls */}
        <div className="flex items-center gap-3 mb-4 p-3 bg-gray-900/50 rounded-lg">
          <div className="flex items-center gap-2">
            <span className="text-xs opacity-75">Voice:</span>
            <select
              className="text-xs bg-gray-700 rounded px-2 py-1 max-w-40"
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
                    {voice.name} ({voice.lang})
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
              className="w-16"
            />
            <span className="text-xs">{speechRate}x</span>
          </div>

          <button
            onClick={() => setAutoSpeak(!autoSpeak)}
            className={`text-xs px-2 py-1 rounded ${
              autoSpeak ? "bg-green-600" : "bg-gray-700 hover:bg-gray-600"
            }`}
          >
            🔊 Auto
          </button>

          <button
            onClick={() => isSpeaking ? stopSpeaking() : speakChunk(activeChunk)}
            className={`text-xs px-2 py-1 rounded ${
              isSpeaking ? "bg-red-600 hover:bg-red-500" : "bg-blue-600 hover:bg-blue-500"
            }`}
          >
            {isSpeaking ? "⏹️ Stop" : "🎵 Speak"}
          </button>
        </div>

        {/* Right-Brain Analysis Panel */}
        {focusMode === "core" && (
          <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <h5 className="text-sm font-semibold text-yellow-400 mb-2">🧠 Core Idea</h5>
            <p className="text-lg font-medium mb-2">{chunkAnalysis.coreIdea}</p>
            {chunkAnalysis.keyTerms.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                <span className="text-xs opacity-75">Key terms:</span>
                {chunkAnalysis.keyTerms.map((term, i) => (
                  <span key={i} className="text-xs bg-yellow-500/20 px-2 py-1 rounded">
                    {term}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Enhanced Chunk Display */}
        <div className="space-y-2">
          {chunks.map((chunk, idx) => {
            const isActive = idx === activeIdx;
            const includesHighlight = highlightedWord && 
              new RegExp(`\\b${escapeRegExp(highlightedWord)}\\b`).test(chunk);
            const chunkId = stableChunkId(chunk);
            const understood = !!understoodMap[chunkId];

            return (
              <div
                key={`${idx}-${chunkId}`}
                className={`
                  idea-chunk p-3 rounded-lg cursor-pointer transition-all duration-300
                  ${isActive ? 'active bg-yellow-500/20 border-2 border-yellow-500/50' : 'bg-gray-700/30'}
                  ${includesHighlight ? 'ring-2 ring-yellow-400' : ''}
                  ${understood ? 'border-l-4 border-green-500' : ''}
                  hover:bg-yellow-500/10
                `}
                onClick={() => {
                  setActiveIdx(idx);
                  onWordClick?.(chunk);
                  setSelectionText(chunk);
                  onTextSelect?.(chunk);
                  if (autoSpeak) speakChunk(chunk);
                }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    {focusMode === "core" ? (
                      <div>
                        <div className="font-medium text-yellow-300 mb-1">
                          {analyzeChunkForRightBrain(chunk).coreIdea}
                        </div>
                        <div className="text-sm opacity-75">{chunk}</div>
                      </div>
                    ) : (
                      <div>{chunk}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    {understood && <span className="text-green-400 text-xs">✓</span>}
                    {isActive && isSpeaking && <span className="text-blue-400 text-xs animate-pulse">🔊</span>}
                    <span className="text-xs opacity-50">{idx + 1}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <RightBrainToolbar
          userId={userId}
          bookId={bookId}
          currentPage={currentPage}
          selectionText={effectiveSelection}
          onGenerateNote={onGenerateNote}
          startReview={startReview}
        />
      </div>

      {/* Fallback note editor */}
      {showNoteEditor && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-6 z-50">
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

      {/* Enhanced Styles */}
      <style jsx>{`
        @keyframes coreIdeaPulse {
          0%   { box-shadow: 0 0 0 0 rgba(250, 204, 21, 0.4); }
          70%  { box-shadow: 0 0 0 15px rgba(250, 204, 21, 0); }
          100% { box-shadow: 0 0 0 0 rgba(250, 204, 21, 0); }
        }
        .idea-chunk.active {
          animation: coreIdeaPulse 2s ease-out infinite;
        }
      `}</style>
    </div>
  );
}
