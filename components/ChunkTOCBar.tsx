"use client";

import React, { useEffect, useRef } from "react";

interface ChunkTOCBarProps {
  chunks: string[];
  activeIdx: number;
  onPick: (idx: number) => void;
  compact?: boolean; // default true
  onToggleCompact?: () => void;
}

function truncateText(text: string, maxLength: number = 30): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

export default function ChunkTOCBar({
  chunks,
  activeIdx,
  onPick,
  compact = true,
  onToggleCompact,
}: ChunkTOCBarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeChipRef = useRef<HTMLButtonElement>(null);

  // Scroll active chip into view when activeIdx changes
  useEffect(() => {
    if (activeChipRef.current && containerRef.current) {
      activeChipRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [activeIdx]);

  // Keyboard navigation handler
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft" && activeIdx > 0) {
      e.preventDefault();
      onPick(activeIdx - 1);
    } else if (e.key === "ArrowRight" && activeIdx < chunks.length - 1) {
      e.preventDefault();
      onPick(activeIdx + 1);
    }
  };

  if (!compact) {
    // Expanded mode - show full vertical list
    return (
      <div className="space-y-2">
        {/* Header with toggle */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-300">📖 Reading Chunks</span>
          {onToggleCompact && (
            <button
              onClick={onToggleCompact}
              className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
              title="Switch to compact row view"
            >
              Row View
            </button>
          )}
        </div>
        
        {/* Full list */}
        <div className="max-h-80 overflow-y-auto space-y-2">
          {chunks.map((chunk, idx) => {
            const isActive = idx === activeIdx;
            return (
              <button
                key={idx}
                onClick={() => onPick(idx)}
                className={`
                  w-full text-left p-3 rounded-lg text-sm transition-all duration-200
                  ${isActive 
                    ? 'bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border-2 border-yellow-500/50 text-yellow-300' 
                    : 'bg-gray-700/30 border border-gray-600/30 hover:bg-yellow-500/10 hover:border-yellow-500/30'
                  }
                `}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="text-xs opacity-75 mb-1">Chunk {idx + 1}</div>
                    <div className="leading-relaxed">{chunk}</div>
                  </div>
                  {isActive && (
                    <span className="text-yellow-400 text-xs ml-2">●</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Compact mode - horizontal chips
  return (
    <div className="space-y-2">
      {/* Header with toggle and progress */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-300">📖 Chunks</span>
          <div className="flex-1 bg-gray-700 h-1 rounded min-w-[100px]">
            <div 
              className="bg-yellow-400 h-1 rounded transition-all duration-300"
              style={{ width: `${((activeIdx + 1) / chunks.length) * 100}%` }}
            />
          </div>
          <span className="text-xs opacity-75">{activeIdx + 1}/{chunks.length}</span>
        </div>
        {onToggleCompact && (
          <button
            onClick={onToggleCompact}
            className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
            title="Switch to full list view"
          >
            List View
          </button>
        )}
      </div>

      {/* Horizontal scrollable chips */}
      <div
        ref={containerRef}
        className="flex gap-2 overflow-x-auto no-scrollbar pb-2"
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="tablist"
        aria-label="Reading chunks navigation"
      >
        {chunks.map((chunk, idx) => {
          const isActive = idx === activeIdx;
          return (
            <button
              key={idx}
              ref={isActive ? activeChipRef : null}
              onClick={() => onPick(idx)}
              className={`
                flex-shrink-0 px-3 py-2 rounded-full text-xs font-medium transition-all duration-200
                whitespace-nowrap min-w-fit border
                ${isActive
                  ? 'bg-gradient-to-r from-yellow-500 to-orange-500 text-black border-yellow-400 shadow-lg transform scale-105'
                  : 'bg-gray-700/50 text-gray-300 border-gray-600/50 hover:bg-yellow-500/20 hover:border-yellow-500/50 hover:text-yellow-300'
                }
              `}
              role="tab"
              aria-selected={isActive}
              aria-label={`Chunk ${idx + 1}: ${truncateText(chunk, 50)}`}
              title={chunk}
            >
              <span className="font-semibold">{idx + 1}:</span>{" "}
              <span>{truncateText(chunk)}</span>
            </button>
          );
        })}
      </div>

      {/* Keyboard hint */}
      <div className="text-xs text-gray-500 text-center">
        Use ← → arrow keys to navigate when focused
      </div>
    </div>
  );
}
