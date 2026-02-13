// components/surgeonView2/SpeechExplainActions.tsx
// Speech + Explain action buttons for clusters and relations in Surgeon View

import React, { useCallback } from 'react';
import { useSpeechService, useWhiteboardService } from '@/lib/speechWhiteboard';
import type { CognitiveUnitRef } from '@/lib/speechWhiteboard/types';

// ============================================================================
// Props
// ============================================================================

interface SpeechExplainActionsProps {
  unitRef: CognitiveUnitRef;
  sourceText: string;
  spanHashes: string[];
  getSpanText: (hash: string) => string;
  label?: string;
  className?: string;
  onSaveToNoteLab?: (unitRef: CognitiveUnitRef) => void;
  onDrillInStudy?: (unitRef: CognitiveUnitRef) => void;
}

// ============================================================================
// Component
// ============================================================================

export function SpeechExplainActions({
  unitRef,
  sourceText,
  spanHashes,
  getSpanText,
  label,
  className = '',
  onSaveToNoteLab,
  onDrillInStudy,
}: SpeechExplainActionsProps) {
  const speechService = useSpeechService();
  const whiteboardService = useWhiteboardService();

  const { currentSession, isSupported } = speechService;
  const { isGenerating, isVisible } = whiteboardService;

  const isPlaying =
    currentSession?.unitId === unitRef.unitId && currentSession?.status === 'playing';
  const isPaused =
    currentSession?.unitId === unitRef.unitId && currentSession?.status === 'paused';

  // ========================================
  // Handlers
  // ========================================

  const handlePlay = useCallback(() => {
    if (isPlaying) {
      speechService.pause();
    } else if (isPaused) {
      speechService.play();
    } else {
      speechService.startSession(unitRef.unitType, unitRef.unitId, spanHashes, getSpanText);
      speechService.play();
    }
  }, [isPlaying, isPaused, speechService, unitRef, spanHashes, getSpanText]);

  const handleStop = useCallback(() => {
    speechService.stop();
  }, [speechService]);

  const handleExplain = useCallback(() => {
    whiteboardService.generateExplanation(unitRef, sourceText, { relationLabel: label });
  }, [whiteboardService, unitRef, sourceText, label]);

  const handleSaveToNoteLab = useCallback(() => {
    onSaveToNoteLab?.(unitRef);
  }, [onSaveToNoteLab, unitRef]);

  const handleDrillInStudy = useCallback(() => {
    onDrillInStudy?.(unitRef);
  }, [onDrillInStudy, unitRef]);

  // ========================================
  // Render
  // ========================================

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Play/Pause Button */}
      {isSupported && spanHashes.length > 0 && (
        <button
          onClick={handlePlay}
          className={`
            flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all
            ${isPlaying
              ? 'bg-orange-500 hover:bg-orange-400 text-white'
              : 'bg-blue-600 hover:bg-blue-500 text-white'
            }
          `}
          title={isPlaying ? 'Pause' : isPaused ? 'Resume' : 'Play source spans'}
        >
          <span>{isPlaying ? '⏸️' : '▶️'}</span>
          <span className="hidden sm:inline">
            {isPlaying ? 'Pause' : isPaused ? 'Resume' : 'Play'}
          </span>
        </button>
      )}

      {/* Stop Button (only when playing/paused) */}
      {(isPlaying || isPaused) && (
        <button
          onClick={handleStop}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-red-600 hover:bg-red-500 text-white transition-all"
          title="Stop"
        >
          <span>⏹️</span>
        </button>
      )}

      {/* Explain Button */}
      <button
        onClick={handleExplain}
        disabled={isGenerating}
        className={`
          flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all
          ${isGenerating
            ? 'bg-gray-500 text-gray-300 cursor-wait'
            : isVisible
              ? 'bg-purple-500 hover:bg-purple-400 text-white'
              : 'bg-purple-600 hover:bg-purple-500 text-white'
          }
        `}
        title="Open Whiteboard explanation"
      >
        <span>🎓</span>
        <span className="hidden sm:inline">
          {isGenerating ? 'Generating...' : 'Explain'}
        </span>
      </button>

      {/* Save to NoteLab */}
      {onSaveToNoteLab && (
        <button
          onClick={handleSaveToNoteLab}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-green-600 hover:bg-green-500 text-white transition-all"
          title="Save to NoteLab"
        >
          <span>📝</span>
          <span className="hidden sm:inline">NoteLab</span>
        </button>
      )}

      {/* Drill in Study */}
      {onDrillInStudy && (
        <button
          onClick={handleDrillInStudy}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-amber-600 hover:bg-amber-500 text-white transition-all"
          title="Add to Study drills"
        >
          <span>🧠</span>
          <span className="hidden sm:inline">Drill</span>
        </button>
      )}
    </div>
  );
}

// ============================================================================
// Pause Action Panel Component
// ============================================================================

interface PauseActionPanelProps {
  onContinue: () => void;
  onExplain: () => void;
  onSaveToNoteLab: () => void;
  onDrillInStudy: () => void;
  onStop: () => void;
  pauseReason: string;
}

export function PauseActionPanel({
  onContinue,
  onExplain,
  onSaveToNoteLab,
  onDrillInStudy,
  onStop,
  pauseReason,
}: PauseActionPanelProps) {
  const reasonLabels: Record<string, string> = {
    heading: 'Section heading detected',
    figure: 'Figure/diagram detected',
    table: 'Table detected',
    formula: 'Formula detected',
    definition: 'Definition detected',
    user_paused: 'Paused',
    end_of_content: 'End of content',
  };

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-gray-900/95 backdrop-blur-md rounded-lg border border-gray-700 shadow-xl p-4 min-w-[320px]">
      <div className="text-center mb-3">
        <div className="text-sm text-gray-400">{reasonLabels[pauseReason] || 'Paused'}</div>
        <div className="text-xs text-gray-500 mt-1">Choose an action:</div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={onExplain}
          className="flex items-center justify-center gap-2 px-3 py-2 rounded bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-all"
        >
          <span>🎓</span>
          <span>Explain</span>
        </button>

        <button
          onClick={onSaveToNoteLab}
          className="flex items-center justify-center gap-2 px-3 py-2 rounded bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-all"
        >
          <span>📝</span>
          <span>NoteLab</span>
        </button>

        <button
          onClick={onDrillInStudy}
          className="flex items-center justify-center gap-2 px-3 py-2 rounded bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium transition-all"
        >
          <span>🧠</span>
          <span>Drill</span>
        </button>

        <button
          onClick={onContinue}
          className="flex items-center justify-center gap-2 px-3 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-all"
        >
          <span>▶️</span>
          <span>Continue</span>
        </button>
      </div>

      <button
        onClick={onStop}
        className="w-full mt-2 flex items-center justify-center gap-2 px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm transition-all"
      >
        <span>⏹️</span>
        <span>Stop</span>
      </button>
    </div>
  );
}

export default SpeechExplainActions;
