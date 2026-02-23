'use client';
// components/NarrationPanel.tsx
// Enhanced Narration Controls Panel
// Embeds into any existing panel — no new top-level panel added.
//
// Features:
//  • Speed slider 0.75×–1.35× with live label
//  • Profile dropdown: Calm | Professor | Exam Mode
//  • Announce media toggle (speaks "Pause — check figure/equation")
//  • Preference persisted to localStorage via lib/speech/profiles
//  • Emits VoiceProfile + speed via onChange so parent can wire into SpeechEngine

import React, { useState, useEffect, useCallback } from 'react';
import {
  PROFILE_PRESETS,
  DEFAULT_PROFILE_ID,
  loadNarrationPreference,
  saveNarrationPreference,
  resolveProfile,
  clampSpeed,
  type ProfileId,
  type VoiceProfile,
} from '@/lib/speech/profiles';

// ============================================================================
// Props
// ============================================================================

export interface NarrationPanelProps {
  /** Called whenever the effective VoiceProfile changes */
  onChange?: (profile: VoiceProfile, announceMedia: boolean) => void;
  className?: string;
}

// ============================================================================
// Speed slider helpers
// ============================================================================

const SPEED_MIN = 0.75;
const SPEED_MAX = 1.35;
const SPEED_STEP = 0.05;

function formatSpeed(v: number): string {
  return `${v.toFixed(2)}×`;
}

// ============================================================================
// Component
// ============================================================================

export const NarrationPanel: React.FC<NarrationPanelProps> = ({
  onChange,
  className = '',
}) => {
  // ─── Load persisted state ────────────────────────────────────────────────
  const [profileId, setProfileId] = useState<ProfileId>(DEFAULT_PROFILE_ID);
  const [speedOverride, setSpeedOverride] = useState<number | null>(null);
  const [announceMedia, setAnnounceMedia] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const pref = loadNarrationPreference();
    setProfileId(pref.profileId);
    setSpeedOverride(pref.speedOverride);
    setAnnounceMedia(pref.announceMedia);
    setLoaded(true);
  }, []);

  // ─── Derived profile ─────────────────────────────────────────────────────
  const effectiveProfile = resolveProfile(profileId, speedOverride);

  // ─── Emit changes ────────────────────────────────────────────────────────
  const emit = useCallback(
    (pid: ProfileId, so: number | null, am: boolean) => {
      const profile = resolveProfile(pid, so);
      onChange?.(profile, am);
      saveNarrationPreference({ profileId: pid, speedOverride: so, announceMedia: am });
    },
    [onChange],
  );

  // Emit on mount once loaded
  useEffect(() => {
    if (loaded) emit(profileId, speedOverride, announceMedia);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  // ─── Handlers ────────────────────────────────────────────────────────────

  const handleProfileChange = (pid: ProfileId) => {
    setProfileId(pid);
    // When switching profile, clear speed override so profile default applies
    setSpeedOverride(null);
    emit(pid, null, announceMedia);
  };

  const handleSpeedSlider = (raw: number) => {
    const clamped = clampSpeed(raw);
    setSpeedOverride(clamped);
    emit(profileId, clamped, announceMedia);
  };

  const handleResetSpeed = () => {
    setSpeedOverride(null);
    emit(profileId, null, announceMedia);
  };

  const handleAnnounceMedia = (checked: boolean) => {
    setAnnounceMedia(checked);
    emit(profileId, speedOverride, checked);
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className={`flex flex-col gap-3 ${className}`}>

      {/* ── Profile selector ─────────────────────────────────────────────── */}
      <div>
        <div className="text-[9px] text-gray-500 uppercase tracking-wide mb-1.5">
          Voice Profile
        </div>
        <div className="flex gap-1">
          {(Object.keys(PROFILE_PRESETS) as ProfileId[]).map((pid) => {
            const preset = PROFILE_PRESETS[pid];
            const active = pid === profileId;
            return (
              <button
                key={pid}
                onClick={() => handleProfileChange(pid)}
                title={preset.description}
                className={`flex-1 px-2 py-1 rounded text-[10px] font-medium border transition-colors ${
                  active
                    ? 'bg-teal-700/50 border-teal-500/70 text-teal-200'
                    : 'bg-gray-800/40 border-gray-700/50 text-gray-400 hover:border-gray-600 hover:text-gray-300'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
        <div className="mt-1 text-[9px] text-gray-600 italic">
          {PROFILE_PRESETS[profileId].description}
        </div>
      </div>

      {/* ── Speed slider ─────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px] text-gray-500 uppercase tracking-wide">Speed</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono text-teal-300">
              {formatSpeed(effectiveProfile.speed)}
            </span>
            {speedOverride !== null && (
              <button
                onClick={handleResetSpeed}
                title="Reset to profile default"
                className="text-[8px] text-gray-600 hover:text-gray-400 underline"
              >
                reset
              </button>
            )}
          </div>
        </div>
        <input
          type="range"
          min={SPEED_MIN}
          max={SPEED_MAX}
          step={SPEED_STEP}
          value={effectiveProfile.speed}
          onChange={(e) => handleSpeedSlider(parseFloat(e.target.value))}
          className="w-full h-1.5 accent-teal-500 cursor-pointer"
        />
        <div className="flex justify-between text-[8px] text-gray-700 mt-0.5">
          <span>{SPEED_MIN}×</span>
          <span>1.0×</span>
          <span>{SPEED_MAX}×</span>
        </div>
      </div>

      {/* ── Cadence summary ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-1 text-[9px]">
        <div className="bg-gray-800/40 rounded px-1.5 py-1 text-center">
          <div className="text-gray-600">comma</div>
          <div className="text-gray-400 font-mono">{Math.round(180 * effectiveProfile.pauseMultiplier)}ms</div>
        </div>
        <div className="bg-gray-800/40 rounded px-1.5 py-1 text-center">
          <div className="text-gray-600">period</div>
          <div className="text-gray-400 font-mono">{Math.round(320 * effectiveProfile.pauseMultiplier)}ms</div>
        </div>
        <div className="bg-gray-800/40 rounded px-1.5 py-1 text-center">
          <div className="text-gray-600">heading</div>
          <div className="text-gray-400 font-mono">{Math.round(520 * effectiveProfile.pauseMultiplier)}ms</div>
        </div>
      </div>

      {/* ── Announce media toggle ─────────────────────────────────────────── */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={announceMedia}
          onChange={(e) => handleAnnounceMedia(e.target.checked)}
          className="rounded accent-teal-500"
        />
        <span className="text-[10px] text-gray-400">
          Announce figures/equations before pause
        </span>
      </label>

      {/* ── Emphasis badge ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] text-gray-600">Emphasis:</span>
        <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
          effectiveProfile.emphasisIntensity === 'high'
            ? 'bg-yellow-900/40 text-yellow-400'
            : effectiveProfile.emphasisIntensity === 'low'
            ? 'bg-gray-800/60 text-gray-500'
            : 'bg-gray-800/40 text-gray-700'
        }`}>
          {effectiveProfile.emphasisIntensity === 'high' ? 'Strong' :
           effectiveProfile.emphasisIntensity === 'low'  ? 'Subtle' : 'Off'}
        </span>
      </div>
    </div>
  );
};

export default NarrationPanel;
