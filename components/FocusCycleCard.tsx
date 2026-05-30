import React, { useEffect, useState } from 'react';
import { useFocusCycleStore, type FocusCyclePresetId } from '@/lib/stores/focusCycleStore';
import ProgressRing from '@/components/ProgressRing';
import { focusAudio, FOCUS_SOUNDS, type FocusSoundId } from '@/lib/focus/focusAudio';

interface FocusCycleCardProps {
  onClose?: () => void;
}

const formatTime = (totalSeconds: number): string => {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const presetOrder: FocusCyclePresetId[] = ['quick_pass', 'standard_cycle', 'deep_mode', 'exam_review'];

export default function FocusCycleCard({ onClose }: FocusCycleCardProps) {
  const {
    activePresetId,
    selectPreset,
    timerRunning,
    timerRemainingSeconds,
    timerPhase,
    startTimer,
    pauseTimer,
    resetTimer,
    skipPhase,
    tick,
    getActivePreset,
    getCurrentPhase,
  } = useFocusCycleStore();

  const [soundId, setSoundId] = useState<FocusSoundId>('off');
  const [volume, setVolume] = useState(0.5);

  // Drive the countdown with a 1-second interval while running.
  useEffect(() => {
    if (!timerRunning) return;
    const id = window.setInterval(() => tick(), 1000);
    return () => window.clearInterval(id);
  }, [timerRunning, tick]);

  const preset = getActivePreset();
  const currentPhase = getCurrentPhase();
  const isBreak = currentPhase?.type === 'break';

  // Audio: play the chosen sound while the timer runs; stop when paused or "off".
  useEffect(() => {
    if (timerRunning && soundId !== 'off') {
      void focusAudio.play(soundId);
    } else {
      focusAudio.stop();
    }
    return () => { /* keep audio across re-renders; stop handled above */ };
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

  // Progress for the ring: fraction of the current phase elapsed.
  const phaseTotalSeconds = (currentPhase?.durationMinutes ?? 1) * 60;
  const elapsed = phaseTotalSeconds - timerRemainingSeconds;
  const progress = phaseTotalSeconds > 0 ? (elapsed / phaseTotalSeconds) * 100 : 0;

  const phaseIndex = (preset?.phases.findIndex(p => p === currentPhase) ?? 0) + 1;
  const phaseCount = preset?.phases.length ?? 0;

  return (
    <div className="rounded-2xl border border-white/10 bg-neutral-900/95 p-5 shadow-2xl backdrop-blur">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold text-white">Focus Cycle</h3>
        {onClose && (
          <button onClick={onClose} className="text-white/50 hover:text-white" aria-label="Close">✕</button>
        )}
      </div>

      {/* Preset selector */}
      <div className="mb-4 grid grid-cols-2 gap-2">
        {presetOrder.map((id) => (
          <button
            key={id}
            onClick={() => selectPreset(id)}
            className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
              activePresetId === id
                ? 'border-amber-400/40 bg-amber-400/15 text-amber-200'
                : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
            }`}
          >
            {useFocusCycleStore.getState().presets[id].label}
          </button>
        ))}
      </div>

      {/* Timer display — progress ring with centered phase + countdown */}
      <div className="mb-4 flex flex-col items-center rounded-xl border border-white/10 bg-black/30 p-4">
        <ProgressRing progress={progress} size={150} strokeWidth={9}>
          <p className={`text-[11px] uppercase tracking-wide ${isBreak ? 'text-emerald-300/70' : 'text-amber-300/70'}`}>
            {currentPhase?.label ?? 'Idle'}
          </p>
          <p className="mt-0.5 text-3xl font-bold tabular-nums text-white">{formatTime(timerRemainingSeconds)}</p>
          <p className="mt-0.5 text-[10px] text-white/40">Phase {phaseIndex} of {phaseCount}</p>
        </ProgressRing>
      </div>

      {/* Ambient audio */}
      <div className="mb-4 rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wide text-white/40">Ambient Sound</span>
          {isBreak && soundId !== 'off' && timerRunning && (
            <span className="text-[10px] text-emerald-300/70">break · ducked</span>
          )}
        </div>
        <select
          value={soundId}
          onChange={(e) => setSoundId(e.target.value as FocusSoundId)}
          className="mb-2 w-full rounded-lg border border-white/10 bg-neutral-800 px-2 py-1.5 text-xs text-white/90 focus:border-amber-400/40 focus:outline-none"
        >
          {FOCUS_SOUNDS.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <span className="text-white/30 text-xs">🔈</span>
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
          <span className="text-white/30 text-xs">🔊</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-2">
        {!timerRunning ? (
          <button
            onClick={startTimer}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-400"
          >
            Start
          </button>
        ) : (
          <button
            onClick={pauseTimer}
            className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20"
          >
            Pause
          </button>
        )}
        <button
          onClick={resetTimer}
          className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20"
        >
          Reset
        </button>
        <button
          onClick={skipPhase}
          className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
