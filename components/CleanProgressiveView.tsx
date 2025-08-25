"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { ThoughtUnit as BaseThoughtUnit, ReadingStats } from "@/types/reading";
import { chunkText, stableChunkId } from "@/lib/chunkers";
import { loadUnderstood, markUnderstood } from "@/lib/understoodStore";

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
}: CleanProgressiveViewProps) {
  // Simple state - no complex features
  const [localPaused, setLocalPaused] = useState(false);
  const [chunkSize, setChunkSize] = useState(200); // Simple chunk size control
  const [understoodMap, setUnderstoodMap] = useState<Record<string, true>>({});

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

  // Simple chunking - just semantic chunks
  const chunks = useMemo(
    () => chunkText(unitText, { mode: "semantic", targetChars: chunkSize }),
    [unitText, chunkSize]
  );

  const [activeIdx, setActiveIdx] = useState(0);
  
  // Reset when content changes
  useEffect(() => setActiveIdx(0), [unitText]);

  // Simple auto-advance
  useEffect(() => {
    if (!chunks.length || !isReading || isPaused || localPaused) return;
    
    const msPerChunk = Math.max(800, (60_000 / Math.max(150, readingSpeed)) * 1.5);
    const timer = setInterval(() => {
      setActiveIdx((i) => Math.min(i + 1, chunks.length - 1));
    }, msPerChunk);
    
    return () => clearInterval(timer);
  }, [chunks.length, readingSpeed, isReading, isPaused, localPaused]);

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
      {/* Clean, minimal header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-800">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-semibold text-yellow-400">📖 Progressive Reading</h3>
          <div className="text-sm text-gray-400">
            Chunk {activeIdx + 1} of {chunks.length}
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Simple controls */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400">Chunk Size:</label>
            <input
              type="range"
              min={120}
              max={300}
              step={20}
              value={chunkSize}
              onChange={(e) => setChunkSize(Number(e.target.value))}
              className="w-20 accent-yellow-400"
            />
            <span className="text-xs text-gray-400 w-8">{chunkSize}</span>
          </div>
          
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

      {/* Main reading area - clean and focused */}
      <div 
        className="flex-1 p-6 overflow-y-auto"
        style={{ fontSize: `${fontSize}px`, fontFamily, lineHeight: lineSpacing }}
        onMouseUp={selBind?.onMouseUp ?? handleMouseUp}
      >
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
                    ? "bg-yellow-400/20 text-yellow-100 ring-2 ring-yellow-400/50 shadow-lg" 
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
              >
                {chunk}
              </span>
            );
          })}
        </div>
      </div>

      {/* Simple footer with keyboard shortcuts */}
      <div className="px-4 py-2 bg-gray-800 border-t border-gray-700">
        <div className="flex items-center justify-center gap-6 text-xs text-gray-400">
          <span><kbd className="bg-gray-700 px-1 rounded">Space</kbd> Pause/Resume</span>
          <span><kbd className="bg-gray-700 px-1 rounded">←/→</kbd> Navigate</span>
          <span><kbd className="bg-gray-700 px-1 rounded">G</kbd> Mark as understood</span>
        </div>
      </div>

      {/* Clean animation styles */}
      <style jsx>{`
        @keyframes activeChunkPulse {
          0% { box-shadow: 0 0 0 0 rgba(250, 204, 21, 0.4); }
          70% { box-shadow: 0 0 0 10px rgba(250, 204, 21, 0); }
          100% { box-shadow: 0 0 0 0 rgba(250, 204, 21, 0); }
        }
        
        kbd {
          font-family: monospace;
          font-size: 0.75em;
          padding: 0.125rem 0.25rem;
          border-radius: 0.125rem;
        }
      `}</style>
    </div>
  );
}
