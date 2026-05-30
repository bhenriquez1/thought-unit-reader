import React, { useEffect, useMemo, useState } from 'react';
import { useFocusCycleStore, type FocusCyclePresetId } from '@/lib/stores/focusCycleStore';
import ProgressRing from '@/components/ProgressRing';
import { focusAudio, FOCUS_SOUNDS, type FocusSoundId } from '@/lib/focus/focusAudio';

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

  const [soundId, setSoundId] = useState<FocusSoundId>('off');
  const [volume, setVolume] = useState(0.5);

  const currentPreset = presets[timerPreset];
  const currentPhase = currentPreset.phases[timerPhase] ?? currentPreset.phases[0];
  const nextPhase = currentPreset.phases[(timerPhase + 1) % currentPreset.phases.length];
  const isBreak = currentPhase.type === 'break';

  // Drive the countdown with a 1-second interval while running.
  useEffect(() => {
    if (!timerRunning) return;
    const interval = window.setInterval(() => tick(), 1000);
    return () => window.clearInterval(interval);
  }, [timerRunning, tick]);

  // Audio: play the chosen sound while the timer runs; stop when paused or "off".
  useEffect(() => {
    if (timerRunning && soundId !== 'off') {
      void focusAudio.play(soundId);
    } else {
      focusAudio.stop();
    }
  }, [timerRunning, soundId]);

  // Adaptive volume: focus phases full volume, break phases recede (duck to 35%).
  useEffect(() => {
    if (!timerRunning) return;
    focusAudio.duck(isBreak ? 0.35 : 1);
  }, [isBreak, timerRunning, soundId]);

  // Live volume control.
  useEffect(() => {
    focusAudio.setVolume(volume);
  }, [volume]);

  // Tear down audio when the card unmounts.
  useEffect(() => () => focusAudio.stop(), []);

  const contextLabel = useMemo(() => {
    if (!timerBoundDocumentId) return 'No reading context bound yet';
    const pageLabel = timerBoundPage ? `Page ${timerBoundPage}` : 'Page not set';
    const sectionLabel = timerBoundSectionId ? ` · Section ${timerBoundSectionId}` : '';
    return `${pageLabel}${sectionLabel}`;
  }, [timerBoundDocumentId, timerBoundPage, timerBoundSectionId]);

  // Progress for the ring: fraction of the current phase elapsed.
  const phaseTotalSeconds = currentPhase.durationMinutes * 60;
  const elapsed = phaseTotalSeconds - timerRemainingSeconds;
  const progressPercent = phaseTotalSeconds > 0 ? (elapsed / phaseTotalSeconds) * 100 : 0;
  const phaseIndex = timerPhase + 1;
  const phaseCount = currentPreset.phases.length;

  const ringSize = compact ? 92 : 150;

  return (
    <div className={`rounded-lg border border-gray-700 bg-gray-800 text-white ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-gray-400">Focus Cycle</p>
          <h3 className="text-base font-semibold">{currentPreset.label}</h3>
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

      {/* Progress ring — fills as the current phase elapses */}
      <div className="mt-3 flex justify-center">
        <ProgressRing
          percent={progressPercent}
          size={ringSize}
          stroke={compact ? 7 : 9}
          color={isBreak ? '#34d399' : '#fbbf24'}
          trackColor="#ffffff"
          trackOpacity={0.1}
          title={`${currentPhase.label} progress`}
          label={
            <div className="flex flex-col items-center justify-center text-center">
              <span className={`text-[10px] uppercase tracking-wide ${isBreak ? 'text-emerald-300/80' : 'text-amber-300/80'}`}>
                {currentPhase.label}
              </span>
              <span className="mt-0.5 text-2xl font-bold tabular-nums text-white">{formatTime(timerRemainingSeconds)}</span>
              <span className="mt-0.5 text-[9px] text-white/40">Phase {phaseIndex} of {phaseCount}</span>
            </div>
          }
        />
      </div>

      {/* Ambient audio */}
      <div className="mt-3 rounded-md border border-gray-700 bg-gray-900/60 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wide text-gray-400">Ambient Sound</span>
          {isBreak && soundId !== 'off' && timerRunning && (
            <span className="text-[10px] text-emerald-300/70">break · ducked</span>
          )}
        </div>
        <select
          value={soundId}
          onChange={(e) => setSoundId(e.target.value as FocusSoundId)}
          className="mb-2 w-full rounded-md border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-white focus:border-amber-400/50 focus:outline-none"
        >
          {FOCUS_SOUNDS.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <span className="text-gray-500 text-xs">🔈</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="h-1 flex-1 cursor-pointer accent-amber-400"
            aria-label="Volume"
          />
          <span className="text-gray-500 text-xs">🔊</span>
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
