// components/ChunkRail.tsx
"use client";

import React, { useEffect, useRef } from "react";
import { motion } from "framer-motion";

interface ChunkRailProps {
  chunks: string[];
  activeIdx: number;
  setActiveIdx: React.Dispatch<React.SetStateAction<number>> | ((idx: number) => void);
  onPick?: (text: string) => void;
  onListToggle?: () => void;
  className?: string;
  // Enhanced props for badges
  understoodMap?: Record<string, boolean>;
  noteMap?: Record<string, boolean>;
  quizMap?: Record<string, boolean>;
  // Compact mode
  compact?: boolean;
}

function truncateText(text: string, maxLength: number = 40): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

function stableChunkId(text: string): string {
  const t = (text || "").replace(/\s+/g, " ").trim().toLowerCase();
  let h = 2166136261 >>> 0;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return (h >>> 0).toString(36);
}

export default function ChunkRail({
  chunks,
  activeIdx,
  setActiveIdx,
  onPick,
  onListToggle,
  className = "",
  understoodMap = {},
  noteMap = {},
  quizMap = {},
  compact = false,
}: ChunkRailProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeChipRef = useRef<HTMLButtonElement>(null);

  // Enhanced scroll active chip into view when activeIdx changes
  useEffect(() => {
    if (activeChipRef.current && containerRef.current) {
      activeChipRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [activeIdx]);

  // Enhanced keyboard navigation handler
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft" && activeIdx > 0) {
      e.preventDefault();
      const newIdx = activeIdx - 1;
      if (typeof setActiveIdx === 'function') {
        setActiveIdx(newIdx);
      }
      onPick?.(chunks[newIdx]);
    } else if (e.key === "ArrowRight" && activeIdx < chunks.length - 1) {
      e.preventDefault();
      const newIdx = activeIdx + 1;
      if (typeof setActiveIdx === 'function') {
        setActiveIdx(newIdx);
      }
      onPick?.(chunks[newIdx]);
    } else if (e.key === "Enter") {
      e.preventDefault();
      onPick?.(chunks[activeIdx]);
    }
  };

  if (!chunks.length) return null;

  return (
    <motion.div 
      className={`space-y-2 ${className}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Enhanced header with progress and toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-300">💭 Chunks</span>
          {!compact && (
            <>
              <div className="flex-1 bg-gray-700 h-1 rounded min-w-[100px]">
                <motion.div 
                  className="bg-yellow-400 h-1 rounded"
                  initial={{ width: 0 }}
                  animate={{ width: `${((activeIdx + 1) / chunks.length) * 100}%` }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                />
              </div>
              <span className="text-xs opacity-75">{activeIdx + 1}/{chunks.length}</span>
            </>
          )}
        </div>
        
        {onListToggle && (
          <button
            onClick={onListToggle}
            className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 transition-colors"
            title={compact ? "Expand chunks" : "Compact chunks"}
          >
            {compact ? "⬍" : "⬌"}
          </button>
        )}
      </div>

      {/* Enhanced horizontal scrollable chips with badges */}
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
          const chunkId = stableChunkId(chunk);
          const isUnderstood = understoodMap[chunkId];
          const hasNote = noteMap[chunkId];
          const hasQuiz = quizMap[chunkId];
          
          return (
            <motion.button
              key={idx}
              ref={isActive ? activeChipRef : null}
              onClick={() => {
                if (typeof setActiveIdx === 'function') {
                  setActiveIdx(idx);
                }
                onPick?.(chunk);
              }}
              className={`
                relative flex-shrink-0 px-3 py-2 rounded-full text-xs font-medium transition-all duration-200
                whitespace-nowrap min-w-fit border
                ${isActive
                  ? 'bg-gradient-to-r from-yellow-500 to-orange-500 text-black border-yellow-400 shadow-lg'
                  : 'bg-gray-700/50 text-gray-300 border-gray-600/50 hover:bg-yellow-500/20 hover:border-yellow-500/50 hover:text-yellow-300'
                }
              `}
              role="tab"
              aria-selected={isActive}
              aria-label={`Chunk ${idx + 1}: ${truncateText(chunk, 50)}`}
              title={chunk}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ 
                opacity: 1, 
                scale: isActive ? 1.05 : 1,
              }}
              transition={{ duration: 0.2, delay: idx * 0.02 }}
              whileHover={{ scale: isActive ? 1.05 : 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <span className="font-semibold">{idx + 1}:</span>{" "}
              <span>{truncateText(chunk, compact ? 20 : 40)}</span>
              
              {/* Enhanced badges */}
              {(isUnderstood || hasNote || hasQuiz) && (
                <div className="absolute -top-1 -right-1 flex gap-0.5">
                  {isUnderstood && (
                    <motion.span 
                      className="w-3 h-3 bg-green-500 rounded-full flex items-center justify-center text-[8px] text-white font-bold"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      title="Understood"
                    >
                      ✓
                    </motion.span>
                  )}
                  {hasNote && (
                    <motion.span 
                      className="w-3 h-3 bg-blue-500 rounded-full flex items-center justify-center text-[8px] text-white"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 30, delay: 0.1 }}
                      title="Has note"
                    >
                      📝
                    </motion.span>
                  )}
                  {hasQuiz && (
                    <motion.span 
                      className="w-3 h-3 bg-purple-500 rounded-full flex items-center justify-center text-[8px] text-white"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 30, delay: 0.2 }}
                      title="Has quiz"
                    >
                      ?
                    </motion.span>
                  )}
                </div>
              )}
              
              {/* Active pulse animation */}
              {isActive && (
                <motion.div
                  className="absolute inset-0 rounded-full border-2 border-yellow-400"
                  initial={{ opacity: 0, scale: 1 }}
                  animate={{ 
                    opacity: [0.5, 0, 0.5],
                    scale: [1, 1.1, 1]
                  }}
                  transition={{ 
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                />
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Enhanced keyboard hint */}
      {!compact && (
        <motion.div 
          className="text-xs text-gray-500 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          Use ← → arrow keys to navigate • Enter to select • Focus to enable keyboard navigation
        </motion.div>
      )}
    </motion.div>
  );
}
