import React, { useEffect, useMemo } from 'react';
import { useFocusCycleStore, type FocusCyclePresetId } from '@/lib/stores/focusCycleStore';

interface FocusCycleCardProps {
  compact?: boolean;
  onClosePrompts?: () => void;
}

function formatTime(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

const presetOrder: FocusCyclePresetId[] = ['quick_pass', 'standard_cycle', 'deep_mode', 'exam_review'];

export default function FocusCycleCard({ compact = false, onClosePrompts }: FocusCycleCardProps) {
  const {
    timerPreset,
    timerPhase,
    timerRemainingSeconds,
    timerRunning,
    timerBoundDocumentId,
    timerBoundPage,
    timerBoundSectionId,
    lastPromptPack,
    presets,
    selectPreset,
    start,
    pause,
    reset,
    skipPhase,
    tick,
    clearPromptPack,
  } = useFocusCycleStore();

  const currentPreset = presets[timerPreset];
  const currentPhase = currentPreset.phases[timerPhase] ?? currentPreset.phases[0];
  const nextPhase = currentPreset.phases[(timerPhase + 1) % currentPreset.phases.length];

  useEffect(() => {
    if (!timerRunning) return;
    const interval = window.setInterval(() => tick(), 1000);
    return () => window.clearInterval(interval);
  }, [timerRunning, tick]);

  const contextLabel = useMemo(() => {
    if (!timerBoundDocumentId) return 'No reading context bound yet';
    const pageLabel = timerBoundPage ? `Page ${timerBoundPage}` : 'Page not set';
    const sectionLabel = timerBoundSectionId ? ` · Section ${timerBoundSectionId}` : '';
    return `${pageLabel}${sectionLabel}`;
  }, [timerBoundDocumentId, timerBoundPage, timerBoundSectionId]);

  return (
    <div className={`rounded-lg border border-gray-700 bg-gray-800 text-white ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-gray-400">Focus Cycle</p>
          <h3 className="text-base font-semibold">{currentPreset.label}</h3>
          <p className="text-sm text-gray-300">{currentPhase.label} • {formatTime(timerRemainingSeconds)}</p>
          {!compact && (
            <p className="text-xs text-gray-500 mt-1">Next: {nextPhase.label} · Bound: {contextLabel}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={timerRunning ? pause : start} className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-sm">
            {timerRunning ? 'Pause' : 'Start'}
          </button>
          <button onClick={reset} className="px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 text-sm">Reset</button>
          <button onClick={skipPhase} className="px-3 py-1 rounded bg-purple-700 hover:bg-purple-600 text-sm">Skip</button>
        </div>
      </div>

      {!compact && (
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
          {presetOrder.map((presetId) => (
            <button
              key={presetId}
              onClick={() => selectPreset(presetId)}
              className={`text-left rounded-md px-3 py-2 border text-sm transition-colors ${
                timerPreset === presetId
                  ? 'border-yellow-400 bg-yellow-500/20 text-yellow-100'
                  : 'border-gray-700 bg-gray-900 hover:bg-gray-700'
              }`}
            >
              <div className="font-medium">{presets[presetId].label}</div>
              <div className="text-xs text-gray-400">
                {presets[presetId].phases.map((phase) => `${phase.durationMinutes}m ${phase.label}`).join(' → ')}
              </div>
            </button>
          ))}
        </div>
      )}

      {lastPromptPack && (
        <div className="mt-3 rounded-md border border-emerald-500/40 bg-emerald-900/20 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-emerald-300">{lastPromptPack.title}</p>
            <button
              onClick={() => {
                clearPromptPack();
                onClosePrompts?.();
              }}
              className="text-xs text-emerald-200 hover:text-white"
            >
              Dismiss
            </button>
          </div>
          <ul className="mt-2 list-disc list-inside text-sm text-emerald-100 space-y-1">
            {lastPromptPack.prompts.map((prompt) => (
              <li key={prompt}>{prompt}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
