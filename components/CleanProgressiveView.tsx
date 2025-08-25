"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { ThoughtUnit as BaseThoughtUnit, ReadingStats } from "@/types/reading";
import { chunkText, stableChunkId } from "@/lib/chunkers";
import { loadUnderstood, markUnderstood } from "@/lib/understoodStore";
import { useReaderSync } from "@/lib/readerSync";
import type { TOCEntry } from "@/lib/tocParser";

type PVUnit = BaseThoughtUnit | string | string[] | { text?: string };

interface CleanProgressiveViewProps {
  bookId: string;
  userId: string;
  thoughtUnits: PVUnit[];
  currentThoughtUnit: number;
  readingSpeed: number;
  isReading?: boolean;
  isPaused?: boolean;
  fontSize: number;
  fontFamily: string;
  lineSpacing: number;
  onWordClick?: (word: string) => void;
  onTextSelect?: (text: string) => void;
  selBind?: { onMouseUp?: (e: React.MouseEvent) => void };
  // New props for enhanced features
  totalPages?: number;
  tableOfContents?: TOCEntry[];
  onPageChange?: (page: number) => void;
}

function unitToText(u: PVUnit): string {
  if (u == null) return "";
  if (typeof u === "string") return u;
  if (Array.isArray(u)) return u.join(" ");
  const maybeText = (u as any).text;
  return typeof maybeText === "string" ? maybeText : JSON.stringify(u);
}

export default function CleanProgressiveView({
  bookId,
  userId,
  thoughtUnits,
  currentThoughtUnit,
  readingSpeed,
  isReading = true,
  isPaused = false,
  fontSize,
  fontFamily,
  lineSpacing,
  onWordClick,
  onTextSelect,
  selBind,
  totalPages = 1,
  tableOfContents = [],
  onPageChange,
}: CleanProgressiveViewProps) {
  // Enhanced state for speed reading
  const [localPaused, setLocalPaused] = useState(false);
  const [chunkSize, setChunkSize] = useState(200);
  const [understoodMap, setUnderstoodMap] = useState<Record<string, true>>({});
  const [rsvpMode, setRsvpMode] = useState(false);
  const [chunkingMode, setChunkingMode] = useState<"semantic" | "sentence" | "phrase">("semantic");
  const [adaptiveSpeed, setAdaptiveSpeed] = useState(true);
  const [currentWPM, setCurrentWPM] = useState(0);
  const [focusPoint, setFocusPoint] = useState(true);

  // ReaderSync integration
  const { 
    page: currentPage, 
    setPage, 
    syncToChapter, 
    findNearestChapter,
    chapterBoundaries,
    cacheChunkAnchor,
    syncChunkToPDF
  } = useReaderSync();

  // Load understood chunks
  useEffect(() => {
    if (!bookId) return;
    loadUnderstood(userId || "guest", bookId)
      .then((m) => setUnderstoodMap(m || {}))
      .catch(() => {});
  }, [userId, bookId]);

  // Empty state
  if (!thoughtUnits || thoughtUnits.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 italic">
        📖 Please upload a PDF to start Progressive Reading
      </div>
    );
  }

  const rawUnit = thoughtUnits[currentThoughtUnit - 1];
  if (!rawUnit) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 italic">
        ⏳ Loading reading content...
      </div>
    );
  }

  const unitText = unitToText(rawUnit);

  // Advanced chunking strategies
  const chunks = useMemo(() => {
    switch (chunkingMode) {
      case "sentence":
        return unitText.split(/(?<=[.!?])\s+/).filter(Boolean);
      case "phrase":
        return unitText.split(/[,;:—–]|\s+(?:and|but|or|however|therefore|meanwhile)\s+/i).filter(Boolean);
      default:
        return chunkText(unitText, { mode: "semantic", targetChars: chunkSize });
    }
  }, [unitText, chunkSize, chunkingMode]);

  // Find current chapter info
  const currentChapter = useMemo(() => {
    return findNearestChapter(currentPage);
  }, [currentPage, findNearestChapter]);

  // Cache chunk anchors for PDF sync
  useEffect(() => {
    chunks.forEach((chunk, index) => {
      const chunkId = stableChunkId(chunk);
      cacheChunkAnchor(chunkId, chunk, currentPage);
    });
  }, [chunks, currentPage, cacheChunkAnchor]);

  const [activeIdx, setActiveIdx] = useState(0);
  
  // Reset when content changes
  useEffect(() => setActiveIdx(0), [unitText]);

  // Advanced auto-advance with adaptive speed
  useEffect(() => {
    if (!chunks.length || !isReading || isPaused || localPaused) return;
    
    const activeChunk = chunks[activeIdx] || "";
    let baseSpeed = readingSpeed;
    
    // Adaptive speed based on content complexity
    if (adaptiveSpeed) {
      // Slow down for complex content
      if (/[A-Z]{2,}|[0-9]+%|[∑∏∫√≈≠≤≥→↔⇌Δ±∞μ°Ωπθαβγλ]/.test(activeChunk)) {
        baseSpeed *= 0.7; // 30% slower for formulas/acronyms
      }
      // Slow down for long sentences
      if (activeChunk.length > 100) {
        baseSpeed *= 0.8; // 20% slower for long chunks
      }
      // Speed up for simple content
      if (activeChunk.length < 30 && !/[.!?]/.test(activeChunk)) {
        baseSpeed *= 1.3; // 30% faster for short phrases
      }
    }
    
    const wordsInChunk = activeChunk.split(/\s+/).length;
    const msPerChunk = Math.max(500, (wordsInChunk / baseSpeed) * 60_000);
    
    // Update WPM display
    setCurrentWPM(Math.round((wordsInChunk / (msPerChunk / 60_000))));
    
    const timer = setInterval(() => {
      setActiveIdx((i) => {
        const nextIdx = Math.min(i + 1, chunks.length - 1);
        
        // Auto-advance to next chapter when reaching end
        if (nextIdx === chunks.length - 1 && i === chunks.length - 1) {
          // Try to advance to next chapter
          const nextChapter = chapterBoundaries.find(ch => ch.page > currentPage);
          if (nextChapter && onPageChange) {
            setTimeout(() => {
              setPage(nextChapter.page, "progressive");
              onPageChange(nextChapter.page);
            }, 1000);
          }
        }
        
        return nextIdx;
      });
    }, msPerChunk);
    
    return () => clearInterval(timer);
  }, [chunks, activeIdx, readingSpeed, isReading, isPaused, localPaused, adaptiveSpeed, chapterBoundaries, currentPage, setPage, onPageChange]);

  const activeChunk = chunks[activeIdx] || "";
  const activeChunkId = stableChunkId(activeChunk);
  const isUnderstood = !!understoodMap[activeChunkId];

  // Simple keyboard controls
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      switch (e.code) {
        case "Space":
          e.preventDefault();
          setLocalPaused(p => !p);
          break;
        case "ArrowRight":
        case "KeyJ":
          setActiveIdx(i => Math.min(i + 1, chunks.length - 1));
          break;
        case "ArrowLeft":
        case "KeyK":
          setActiveIdx(i => Math.max(i - 1, 0));
          break;
        case "KeyG":
          e.preventDefault();
          toggleUnderstood();
          break;
        case "KeyR":
          e.preventDefault();
          setRsvpMode(r => !r);
          break;
        case "KeyC":
          e.preventDefault();
          jumpToNextChapter();
          break;
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [chunks.length, activeChunkId]);

  function toggleUnderstood() {
    setUnderstoodMap((m) => {
      const next = { ...m };
      if (next[activeChunkId]) {
        delete next[activeChunkId];
      } else {
        next[activeChunkId] = true;
      }
      return next;
    });
    markUnderstood(userId || "guest", bookId, activeChunkId).catch(() => {});
  }

  // Navigation functions
  function jumpToNextChapter() {
    const nextChapter = chapterBoundaries.find(ch => ch.page > currentPage);
    if (nextChapter && onPageChange) {
      setPage(nextChapter.page, "progressive");
      onPageChange(nextChapter.page);
    }
  }

  function jumpToPreviousChapter() {
    const prevChapter = [...chapterBoundaries]
      .reverse()
      .find(ch => ch.page < currentPage);
    if (prevChapter && onPageChange) {
      setPage(prevChapter.page, "progressive");
      onPageChange(prevChapter.page);
    }
  }

  function handleJumpToChapter(chapterTitle: string) {
    const success = syncToChapter(chapterTitle);
    if (success && onPageChange) {
      const newChapter = findNearestChapter(currentPage);
      if (newChapter) {
        onPageChange(newChapter.page);
      }
    }
  }

  const handleMouseUp = () => {
    const selection = window.getSelection()?.toString().trim() || "";
    if (selection) {
      onTextSelect?.(selection);
    }
  };

  // Calculate progress
  const understoodCount = chunks.reduce((count, chunk) => 
    count + (understoodMap[stableChunkId(chunk)] ? 1 : 0), 0
  );
  const progressPercent = chunks.length > 0 ? Math.round((activeIdx / chunks.length) * 100) : 0;
  const comprehensionPercent = chunks.length > 0 ? Math.round((understoodCount / chunks.length) * 100) : 0;

  return (
    <div className="h-full flex flex-col bg-gray-900">
      {/* Enhanced header with speed reading controls */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-800">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-semibold text-yellow-400">⚡ Speed Reading</h3>
          <div className="text-sm text-gray-400">
            Chunk {activeIdx + 1} of {chunks.length}
          </div>
          {currentWPM > 0 && (
            <div className="text-sm font-mono bg-blue-600/20 text-blue-300 px-2 py-1 rounded">
              {currentWPM} WPM
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-3">
          {/* Reading mode toggle */}
          <button
            onClick={() => setRsvpMode(r => !r)}
            className={`px-3 py-1 rounded text-sm font-medium ${
              rsvpMode 
                ? "bg-purple-600 text-white" 
                : "bg-gray-600 hover:bg-gray-500 text-white"
            }`}
            title="Toggle RSVP Mode"
          >
            {rsvpMode ? "📍 RSVP" : "📄 Normal"}
          </button>

          {/* Chunking mode selector */}
          <select
            value={chunkingMode}
            onChange={(e) => setChunkingMode(e.target.value as any)}
            className="bg-gray-700 text-white text-xs px-2 py-1 rounded border border-gray-600 focus:border-yellow-500 outline-none"
          >
            <option value="semantic">Smart Chunks</option>
            <option value="sentence">Sentences</option>
            <option value="phrase">Phrases</option>
          </select>

          {/* Adaptive speed toggle */}
          <label className="flex items-center gap-1 text-xs text-gray-400">
            <input
              type="checkbox"
              checked={adaptiveSpeed}
              onChange={(e) => setAdaptiveSpeed(e.target.checked)}
              className="accent-yellow-400"
            />
            Adaptive
          </label>
          
          <button
            onClick={() => setLocalPaused(p => !p)}
            className={`px-3 py-1 rounded text-sm font-medium ${
              localPaused || isPaused 
                ? "bg-green-600 hover:bg-green-500 text-white" 
                : "bg-gray-600 hover:bg-gray-500 text-white"
            }`}
          >
            {localPaused || isPaused ? "▶ Resume" : "⏸ Pause"}
          </button>
          
          <button
            onClick={toggleUnderstood}
            className={`px-3 py-1 rounded text-sm font-medium ${
              isUnderstood 
                ? "bg-green-500 text-black" 
                : "bg-gray-600 hover:bg-gray-500 text-white"
            }`}
          >
            {isUnderstood ? "✓ Got it" : "Got it?"}
          </button>
        </div>
      </div>

      {/* Chapter Navigation Bar */}
      <div className="flex items-center justify-between p-3 bg-gray-800/50 border-b border-gray-700/50">
        <div className="flex items-center gap-3">
          <button
            onClick={jumpToPreviousChapter}
            className="flex items-center gap-2 px-3 py-1 bg-yellow-600 hover:bg-yellow-500 text-black rounded text-sm transition-colors"
          >
            ← Previous Chapter
          </button>
          
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-300">Page</span>
            <span className="bg-yellow-600 text-black px-2 py-1 rounded font-mono">
              {currentPage}
            </span>
            <span className="text-gray-400">of {totalPages}</span>
          </div>
          
          <button
            onClick={jumpToNextChapter}
            className="flex items-center gap-2 px-3 py-1 bg-yellow-600 hover:bg-yellow-500 text-black rounded text-sm transition-colors"
          >
            Next Chapter →
          </button>
        </div>

        <div className="flex items-center gap-3">
          {/* Chapter Info */}
          {currentChapter && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-400">Chapter:</span>
              <span className="bg-amber-600/20 text-amber-300 px-2 py-1 rounded text-xs max-w-48 truncate">
                {currentChapter.title}
              </span>
            </div>
          )}
          
          {/* TOC Quick Jump */}
          {tableOfContents.length > 0 && (
            <select
              onChange={(e) => {
                const selectedTitle = e.target.value;
                if (selectedTitle) {
                  handleJumpToChapter(selectedTitle);
                }
              }}
              className="bg-gray-700 text-white text-xs px-2 py-1 rounded border border-gray-600 focus:border-yellow-500 outline-none"
              value=""
            >
              <option value="">Jump to Chapter...</option>
              {tableOfContents.map((entry, index) => (
                <option key={index} value={entry.title}>
                  {entry.title} (p.{entry.pageNumber})
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Progress indicators */}
      <div className="px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
          <span>Reading Progress</span>
          <span>{progressPercent}% complete</span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-2 mb-2">
          <div 
            className="bg-yellow-400 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        
        <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
          <span>Comprehension</span>
          <span>{understoodCount}/{chunks.length} chunks understood ({comprehensionPercent}%)</span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-2">
          <div 
            className="bg-green-400 h-2 rounded-full transition-all duration-300"
            style={{ width: `${comprehensionPercent}%` }}
          />
        </div>
      </div>

      {/* Main reading area - RSVP or Normal mode */}
      <div 
        className="flex-1 overflow-hidden"
        style={{ fontSize: `${fontSize}px`, fontFamily, lineHeight: lineSpacing }}
        onMouseUp={selBind?.onMouseUp ?? handleMouseUp}
      >
        {rsvpMode ? (
          // RSVP Mode - Single chunk focus
          <div className="h-full flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800">
            <div className="text-center max-w-2xl px-8">
              {/* Focus point indicator */}
              {focusPoint && (
                <div className="mb-8">
                  <div className="w-2 h-2 bg-yellow-400 rounded-full mx-auto animate-pulse"></div>
                </div>
              )}
              
              {/* Active chunk display */}
              <div 
                className="text-2xl md:text-3xl lg:text-4xl font-medium text-white leading-relaxed mb-8 p-6 bg-gray-800/50 rounded-lg border border-yellow-400/30 shadow-2xl"
                style={{ 
                  fontSize: `${fontSize * 1.5}px`,
                  animation: 'rsvpFadeIn 0.3s ease-in-out'
                }}
              >
                {activeChunk}
              </div>
              
              {/* RSVP controls */}
              <div className="flex items-center justify-center gap-4 text-sm text-gray-400">
                <div className="bg-gray-800/50 px-3 py-1 rounded">
                  {activeIdx + 1} / {chunks.length}
                </div>
                {isUnderstood && (
                  <div className="bg-green-500/20 text-green-300 px-3 py-1 rounded">
                    ✓ Understood
                  </div>
                )}
                <div className="bg-blue-600/20 text-blue-300 px-3 py-1 rounded">
                  {currentWPM} WPM
                </div>
              </div>
            </div>
          </div>
        ) : (
          // Normal Mode - All chunks visible
          <div className="h-full p-6 overflow-y-auto">
            <div className="max-w-4xl mx-auto">
              {chunks.map((chunk, idx) => {
                const isActive = idx === activeIdx;
                const chunkId = stableChunkId(chunk);
                const isChunkUnderstood = !!understoodMap[chunkId];
                
                return (
                  <span
                    key={`${idx}-${chunkId}`}
                    className={`
                      inline-block mr-2 mb-2 px-2 py-1 rounded cursor-pointer transition-all duration-200
                      ${isActive 
                        ? "bg-yellow-400/20 text-yellow-100 ring-2 ring-yellow-400/50 shadow-lg transform scale-105" 
                        : isChunkUnderstood
                        ? "bg-green-500/20 text-green-100"
                        : "bg-gray-700/50 text-gray-300 hover:bg-gray-600/50"
                      }
                    `}
                    onClick={() => {
                      setActiveIdx(idx);
                      onWordClick?.(chunk);
                      onTextSelect?.(chunk);
                    }}
                    title={isChunkUnderstood ? "Understood ✓" : "Click to focus"}
                    style={{
                      animation: isActive ? 'activeChunkPulse 2s infinite' : undefined
                    }}
                  >
                    {chunk}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Enhanced footer with keyboard shortcuts */}
      <div className="px-4 py-2 bg-gray-800 border-t border-gray-700">
        <div className="flex items-center justify-center gap-4 text-xs text-gray-400">
          <span><kbd className="bg-gray-700 px-1 rounded">Space</kbd> Pause/Resume</span>
          <span><kbd className="bg-gray-700 px-1 rounded">←/→</kbd> Navigate</span>
          <span><kbd className="bg-gray-700 px-1 rounded">G</kbd> Mark understood</span>
          <span><kbd className="bg-gray-700 px-1 rounded">R</kbd> Toggle RSVP</span>
          <span><kbd className="bg-gray-700 px-1 rounded">C</kbd> Next Chapter</span>
        </div>
      </div>

      {/* Enhanced animation styles */}
      <style jsx>{`
        @keyframes activeChunkPulse {
          0% { box-shadow: 0 0 0 0 rgba(250, 204, 21, 0.4); }
          70% { box-shadow: 0 0 0 10px rgba(250, 204, 21, 0); }
          100% { box-shadow: 0 0 0 0 rgba(250, 204, 21, 0); }
        }
        
        @keyframes rsvpFadeIn {
          0% { 
            opacity: 0; 
            transform: translateY(20px) scale(0.95); 
          }
          100% { 
            opacity: 1; 
            transform: translateY(0) scale(1); 
          }
        }
        
        @keyframes focusPointPulse {
          0%, 100% { 
            opacity: 1; 
            transform: scale(1); 
          }
          50% { 
            opacity: 0.6; 
            transform: scale(1.2); 
          }
        }
        
        kbd {
          font-family: monospace;
          font-size: 0.75em;
          padding: 0.125rem 0.25rem;
          border-radius: 0.125rem;
        }
        
        .animate-pulse {
          animation: focusPointPulse 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
