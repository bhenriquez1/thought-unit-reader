// components/ChunkRail.tsx
"use client";

import React, { useEffect, useRef } from "react";

interface ChunkRailProps {
  chunks: string[];
  activeIdx: number;
  setActiveIdx: React.Dispatch<React.SetStateAction<number>>;
  onPick?: (text: string) => void;
  className?: string;
}

function truncateText(text: string, maxLength: number = 40): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

export default function ChunkRail({
  chunks,
  activeIdx,
  setActiveIdx,
  onPick,
  className = "",
}: ChunkRailProps) {
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
      const newIdx = activeIdx - 1;
      setActiveIdx(newIdx);
      onPick?.(chunks[newIdx]);
    } else if (e.key === "ArrowRight" && activeIdx < chunks.length - 1) {
      e.preventDefault();
      const newIdx = activeIdx + 1;
      setActiveIdx(newIdx);
      onPick?.(chunks[newIdx]);
    }
  };

  if (!chunks.length) return null;

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Header with progress */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-300">💭 Idea Chunks</span>
          <div className="flex-1 bg-gray-700 h-1 rounded min-w-[100px]">
            <div 
              className="bg-yellow-400 h-1 rounded transition-all duration-300"
              style={{ width: `${((activeIdx + 1) / chunks.length) * 100}%` }}
            />
          </div>
          <span className="text-xs opacity-75">{activeIdx + 1}/{chunks.length}</span>
        </div>
      </div>

      {/* Horizontal scrollable chips */}
      <div
        ref={containerRef}
        className="flex gap-2 overflow-x-auto no-scrollbar pb-2"
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="tablist"
        aria-label="Idea chunks navigation"
      >
        {chunks.map((chunk, idx) => {
          const isActive = idx === activeIdx;
          return (
            <button
              key={idx}
              ref={isActive ? activeChipRef : null}
              onClick={() => {
                setActiveIdx(idx);
                onPick?.(chunk);
              }}
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
