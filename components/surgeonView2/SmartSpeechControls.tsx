// components/surgeonView2/SmartSpeechControls.tsx
// Smart Speech Controls - Play/Pause/Speed for High-Yield Reading

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { RankedInsight } from '@/lib/relationshipSchema/types';
import {
  SpeechMode,
  SpeechSpeed,
  SpeechConfig,
  SpeechState,
  DEFAULT_SPEECH_CONFIG,
  selectInsightsForMode,
  generateInsightScript,
  scriptToPlainText,
  isWebSpeechAvailable,
  speakText,
  stopSpeech,
  pauseSpeech,
  resumeSpeech,
  getWebSpeechRate,
} from '@/lib/speechWhiteboard/smartSpeech';

// ============================================================================
// Types
// ============================================================================

interface SmartSpeechControlsProps {
  insights: RankedInsight[];
  onInsightStart?: (insight: RankedInsight) => void;
  onInsightEnd?: (insight: RankedInsight) => void;
  onComplete?: () => void;
  className?: string;
}

// ============================================================================
// Constants
// ============================================================================

const MODE_OPTIONS: { value: SpeechMode; label: string; description: string }[] = [
  { value: 'smart_high_yield', label: 'Smart High-Yield', description: 'CRITICAL + top 5 HIGH_YIELD' },
  { value: 'exam_rapid', label: 'Exam Rapid', description: 'CRITICAL only, fast' },
  { value: 'full', label: 'Full Read', description: 'All insights' },
  { value: 'explain', label: 'Explain Mode', description: 'Top 3 with detail' },
];

const SPEED_OPTIONS: { value: SpeechSpeed; label: string }[] = [
  { value: 'slow', label: '0.8x' },
  { value: 'normal', label: '1x' },
  { value: 'fast', label: '1.3x' },
  { value: 'very_fast', label: '1.6x' },
];

// ============================================================================
// Component
// ============================================================================

export const SmartSpeechControls: React.FC<SmartSpeechControlsProps> = ({
  insights,
  onInsightStart,
  onInsightEnd,
  onComplete,
  className = '',
}) => {
  const [config, setConfig] = useState<SpeechConfig>(DEFAULT_SPEECH_CONFIG);
  const [state, setState] = useState<SpeechState>({
    isPlaying: false,
    isPaused: false,
    currentInsightIndex: 0,
    totalInsights: 0,
  });
  const [isSupported, setIsSupported] = useState(true);
  const [showModeDropdown, setShowModeDropdown] = useState(false);

  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const selectedInsightsRef = useRef<RankedInsight[]>([]);

  // Check Web Speech API support
  useEffect(() => {
    setIsSupported(isWebSpeechAvailable());
  }, []);

  // Update selected insights when config or insights change
  useEffect(() => {
    selectedInsightsRef.current = selectInsightsForMode(insights, config.mode);
    setState(prev => ({
      ...prev,
      totalInsights: selectedInsightsRef.current.length,
    }));
  }, [insights, config.mode]);

  // Play current insight
  const playCurrentInsight = useCallback(() => {
    const selected = selectedInsightsRef.current;
    const index = state.currentInsightIndex;

    if (index >= selected.length) {
      setState(prev => ({ ...prev, isPlaying: false, isPaused: false }));
      onComplete?.();
      return;
    }

    const insight = selected[index];
    const script = generateInsightScript(insight, config.mode, config.speed);
    const text = scriptToPlainText(script);

    onInsightStart?.(insight);

    setState(prev => ({
      ...prev,
      isPlaying: true,
      isPaused: false,
      currentInsightId: insight.id,
    }));

    currentUtteranceRef.current = speakText(text, {
      rate: getWebSpeechRate(config.speed),
      onEnd: () => {
        onInsightEnd?.(insight);
        setState(prev => ({
          ...prev,
          currentInsightIndex: prev.currentInsightIndex + 1,
        }));
        // Auto-advance to next
        setTimeout(() => {
          if (state.isPlaying && !state.isPaused) {
            playCurrentInsight();
          }
        }, 500);
      },
      onError: (error) => {
        console.error('Speech error:', error);
        setState(prev => ({ ...prev, isPlaying: false }));
      },
    });
  }, [state.currentInsightIndex, state.isPlaying, state.isPaused, config, onInsightStart, onInsightEnd, onComplete]);

  // Control handlers
  const handlePlay = useCallback(() => {
    if (state.isPaused) {
      resumeSpeech();
      setState(prev => ({ ...prev, isPaused: false, isPlaying: true }));
    } else {
      playCurrentInsight();
    }
  }, [state.isPaused, playCurrentInsight]);

  const handlePause = useCallback(() => {
    pauseSpeech();
    setState(prev => ({ ...prev, isPaused: true, isPlaying: false }));
  }, []);

  const handleStop = useCallback(() => {
    stopSpeech();
    setState({
      isPlaying: false,
      isPaused: false,
      currentInsightIndex: 0,
      totalInsights: selectedInsightsRef.current.length,
    });
  }, []);

  const handleSkipNext = useCallback(() => {
    stopSpeech();
    setState(prev => ({
      ...prev,
      currentInsightIndex: Math.min(prev.currentInsightIndex + 1, prev.totalInsights - 1),
    }));
    if (state.isPlaying) {
      setTimeout(playCurrentInsight, 100);
    }
  }, [state.isPlaying, playCurrentInsight]);

  const handleSkipPrev = useCallback(() => {
    stopSpeech();
    setState(prev => ({
      ...prev,
      currentInsightIndex: Math.max(prev.currentInsightIndex - 1, 0),
    }));
    if (state.isPlaying) {
      setTimeout(playCurrentInsight, 100);
    }
  }, [state.isPlaying, playCurrentInsight]);

  const handleModeChange = useCallback((mode: SpeechMode) => {
    setConfig(prev => ({ ...prev, mode }));
    setShowModeDropdown(false);
    // Reset playback when mode changes
    handleStop();
  }, [handleStop]);

  const handleSpeedChange = useCallback((speed: SpeechSpeed) => {
    setConfig(prev => ({ ...prev, speed }));
  }, []);

  if (!isSupported) {
    return (
      <div className={`p-3 bg-gray-800 rounded-lg text-center ${className}`}>
        <span className="text-gray-400 text-sm">Speech not supported in this browser</span>
      </div>
    );
  }

  const selectedCount = selectedInsightsRef.current.length;
  const currentMode = MODE_OPTIONS.find(m => m.value === config.mode);

  return (
    <div className={`p-3 bg-gray-800 rounded-lg ${className}`}>
      {/* Top row: Mode selector + stats */}
      <div className="flex items-center justify-between mb-3">
        {/* Mode dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowModeDropdown(!showModeDropdown)}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm flex items-center gap-2"
          >
            <span>🔊</span>
            <span>{currentMode?.label}</span>
            <span className="text-gray-400">▼</span>
          </button>

          {showModeDropdown && (
            <div className="absolute top-full left-0 mt-1 w-64 bg-gray-700 rounded-lg shadow-lg z-10 overflow-hidden">
              {MODE_OPTIONS.map(mode => (
                <button
                  key={mode.value}
                  onClick={() => handleModeChange(mode.value)}
                  className={`w-full px-3 py-2 text-left hover:bg-gray-600 ${
                    config.mode === mode.value ? 'bg-teal-900/50' : ''
                  }`}
                >
                  <div className="text-sm font-medium">{mode.label}</div>
                  <div className="text-xs text-gray-400">{mode.description}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="text-xs text-gray-400">
          {selectedCount} insight{selectedCount !== 1 ? 's' : ''} selected
        </div>
      </div>

      {/* Controls row */}
      <div className="flex items-center gap-2">
        {/* Skip prev */}
        <button
          onClick={handleSkipPrev}
          disabled={state.currentInsightIndex === 0}
          className="p-2 hover:bg-gray-700 rounded disabled:opacity-50"
          title="Previous"
        >
          ⏮️
        </button>

        {/* Play/Pause */}
        {state.isPlaying && !state.isPaused ? (
          <button
            onClick={handlePause}
            className="p-3 bg-teal-600 hover:bg-teal-500 rounded-full"
            title="Pause"
          >
            ⏸️
          </button>
        ) : (
          <button
            onClick={handlePlay}
            disabled={selectedCount === 0}
            className="p-3 bg-teal-600 hover:bg-teal-500 rounded-full disabled:opacity-50"
            title="Play"
          >
            ▶️
          </button>
        )}

        {/* Stop */}
        <button
          onClick={handleStop}
          disabled={!state.isPlaying && !state.isPaused}
          className="p-2 hover:bg-gray-700 rounded disabled:opacity-50"
          title="Stop"
        >
          ⏹️
        </button>

        {/* Skip next */}
        <button
          onClick={handleSkipNext}
          disabled={state.currentInsightIndex >= state.totalInsights - 1}
          className="p-2 hover:bg-gray-700 rounded disabled:opacity-50"
          title="Next"
        >
          ⏭️
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Speed selector */}
        <div className="flex items-center gap-1 bg-gray-700 rounded px-1">
          {SPEED_OPTIONS.map(speed => (
            <button
              key={speed.value}
              onClick={() => handleSpeedChange(speed.value)}
              className={`px-2 py-1 text-xs rounded ${
                config.speed === speed.value
                  ? 'bg-teal-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {speed.label}
            </button>
          ))}
        </div>
      </div>

      {/* Progress */}
      {(state.isPlaying || state.isPaused) && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
            <span>Progress</span>
            <span>
              {state.currentInsightIndex + 1} / {state.totalInsights}
            </span>
          </div>
          <div className="h-1 bg-gray-700 rounded overflow-hidden">
            <div
              className="h-full bg-teal-500 transition-all"
              style={{
                width: `${((state.currentInsightIndex + 1) / state.totalInsights) * 100}%`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Read This Card Button (for individual insight)
// ============================================================================

interface ReadThisCardButtonProps {
  insight: RankedInsight;
  onStart?: () => void;
  onEnd?: () => void;
  className?: string;
}

export const ReadThisCardButton: React.FC<ReadThisCardButtonProps> = ({
  insight,
  onStart,
  onEnd,
  className = '',
}) => {
  const [isReading, setIsReading] = useState(false);

  const handleClick = useCallback(() => {
    if (isReading) {
      stopSpeech();
      setIsReading(false);
      onEnd?.();
      return;
    }

    if (!isWebSpeechAvailable()) {
      console.warn('Web Speech API not available');
      return;
    }

    const script = generateInsightScript(insight, 'smart_high_yield', 'normal');
    const text = scriptToPlainText(script);

    setIsReading(true);
    onStart?.();

    speakText(text, {
      rate: 1.0,
      onEnd: () => {
        setIsReading(false);
        onEnd?.();
      },
      onError: () => {
        setIsReading(false);
        onEnd?.();
      },
    });
  }, [insight, isReading, onStart, onEnd]);

  return (
    <button
      onClick={handleClick}
      className={`p-1 text-sm hover:bg-gray-700 rounded transition-colors ${
        isReading ? 'bg-teal-900/50 text-teal-400' : ''
      } ${className}`}
      title={isReading ? 'Stop reading' : 'Read this card'}
    >
      {isReading ? '⏹️' : '🔊'}
    </button>
  );
};

export default SmartSpeechControls;
