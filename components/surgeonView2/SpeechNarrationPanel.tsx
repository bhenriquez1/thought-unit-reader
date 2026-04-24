// components/surgeonView2/SpeechNarrationPanel.tsx
// Ninja Nerd Speech Narration Panel
// Controls: provider selector, style toggle, play/pause/stop, speed,
// "Read from selection", and live word + sentence highlight sync.

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { ParagraphUnit, PageIntelligence } from '@/lib/page-intelligence/types';
import {
  SpeechEngine,
  isWebSpeechAvailable,
  getWebSpeechVoices,
  type SpeechProvider,
  type SpeechState,
  type SpeechEngineConfig,
} from '@/lib/speech';
import type { WordBoundary } from '@/lib/speech/narrationPlan';

// ============================================================================
// Types
// ============================================================================

interface SpeechNarrationPanelProps {
  /** Units to narrate — typically pageIntelligence.paragraphUnits sorted by position */
  paragraphUnits?: ParagraphUnit[];
  /** Full page intelligence (used to derive units + context) */
  pageIntelligence?: PageIntelligence | null;
  /** Called when a paragraph becomes active during playback — for highlight sync */
  onActiveParagraph?: (paragraphId: string | null) => void;
  /** Called when active word changes — for word-level PDF highlight */
  onActiveWord?: (wb: WordBoundary | null, charOffset: number, paragraphId: string) => void;
  /** ElevenLabs config (optional — required for ElevenLabs provider) */
  elevenLabsConfig?: { apiKey: string; voiceId: string };
  /** Azure config (optional — required for Azure provider) */
  azureConfig?: { subscriptionKey: string; region: string; voiceName?: string };
  className?: string;
}

// ============================================================================
// Rate options
// ============================================================================

const RATE_OPTIONS = [
  { label: '0.8×', value: 0.8 },
  { label: '1.0×', value: 1.0 },
  { label: '1.2×', value: 1.2 },
];

// ============================================================================
// Provider badge
// ============================================================================

const PROVIDER_META: Record<SpeechProvider, { label: string; icon: string; tier: string }> = {
  webspeech: { label: 'Web Speech', icon: '🌐', tier: 'Tier B' },
  elevenlabs: { label: 'ElevenLabs', icon: '🎙️', tier: 'Tier A' },
  azure: { label: 'Azure TTS', icon: '☁️', tier: 'Tier A' },
};

// ============================================================================
// Main Component
// ============================================================================

export const SpeechNarrationPanel: React.FC<SpeechNarrationPanelProps> = ({
  paragraphUnits,
  pageIntelligence,
  onActiveParagraph,
  onActiveWord,
  elevenLabsConfig,
  azureConfig,
  className = '',
}) => {
  // ─── State ───────────────────────────────────────────────────────────────
  const [provider, setProvider] = useState<SpeechProvider>('webspeech');
  const [cadenceEnabled, setCadenceEnabled] = useState(true);
  const [roleAwareMode, setRoleAwareMode] = useState(true);
  const [rateMultiplier, setRateMultiplier] = useState(1.0);
  const [speechState, setSpeechState] = useState<SpeechState>('idle');
  const [activeParagraphId, setActiveParagraphId] = useState<string | null>(null);
  const [activeWord, setActiveWord] = useState<WordBoundary | null>(null);
  const [webSpeechVoices, setWebSpeechVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // ─── Engine ref ──────────────────────────────────────────────────────────
  const engineRef = useRef<SpeechEngine | null>(null);

  // ─── Derived units ───────────────────────────────────────────────────────
  const units = useMemo<ParagraphUnit[]>(() => {
    if (paragraphUnits && paragraphUnits.length > 0) return paragraphUnits;
    // Fall back to page intelligence units, sorted by startChar (reading order)
    const piUnits = pageIntelligence?.paragraphUnits ?? [];
    return [...piUnits].sort((a, b) => a.startChar - b.startChar);
  }, [paragraphUnits, pageIntelligence]);

  // ─── Load web speech voices ───────────────────────────────────────────────
  useEffect(() => {
    if (!isWebSpeechAvailable()) return;
    const load = () => {
      const voices = getWebSpeechVoices();
      setWebSpeechVoices(voices);
      // Pick a good English voice by default
      const pref = voices.find(v =>
        v.lang.startsWith('en') && (v.name.includes('Neural') || v.name.includes('David') || v.name.includes('Jenny'))
      ) ?? voices.find(v => v.lang.startsWith('en'));
      if (pref && !selectedVoiceURI) setSelectedVoiceURI(pref.voiceURI);
    };
    load();
    window.speechSynthesis?.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis?.removeEventListener('voiceschanged', load);
  }, []);

  // ─── Build/update engine when config changes ──────────────────────────────
  const buildConfig = useCallback((): SpeechEngineConfig => ({
    provider,
    rateMultiplier,
    cadenceEnabled: cadenceEnabled && roleAwareMode,
    webspeech: { voiceURI: selectedVoiceURI },
    elevenlabs: elevenLabsConfig,
    azure: azureConfig,
  }), [provider, rateMultiplier, cadenceEnabled, roleAwareMode, selectedVoiceURI, elevenLabsConfig, azureConfig]);

  const getEngine = useCallback((): SpeechEngine => {
    if (!engineRef.current) {
      engineRef.current = new SpeechEngine(buildConfig(), {
        onStateChange: (state) => {
          setSpeechState(state);
          if (state === 'idle') {
            setActiveParagraphId(null);
            setActiveWord(null);
            onActiveParagraph?.(null);
          }
        },
        onWordBoundary: (wb, charOffset, paragraphId) => {
          setActiveWord(wb);
          onActiveWord?.(wb, charOffset, paragraphId);
        },
        onParagraphEnd: (paragraphId) => {
          setActiveParagraphId(paragraphId);
          onActiveParagraph?.(paragraphId);
        },
        onError: (err) => {
          setErrorMessage(err);
          setSpeechState('error');
        },
      });
    } else {
      engineRef.current.updateConfig(buildConfig());
    }
    return engineRef.current;
  }, [buildConfig, onActiveParagraph, onActiveWord]);

  // Clean up on unmount
  useEffect(() => {
    return () => engineRef.current?.stopAll();
  }, []);

  // ─── Controls ────────────────────────────────────────────────────────────

  const handlePlay = useCallback(() => {
    setErrorMessage(null);
    if (speechState === 'paused') {
      getEngine().resume();
      return;
    }
    if (units.length === 0) return;
    getEngine().speakUnits(units);
    setActiveParagraphId(units[0]?.id ?? null);
  }, [speechState, units, getEngine]);

  const handlePause = useCallback(() => {
    getEngine().pause();
  }, [getEngine]);

  const handleStop = useCallback(() => {
    getEngine().stopAll();
    setActiveParagraphId(null);
    setActiveWord(null);
  }, [getEngine]);

  const handleReadFromParagraph = useCallback((unit: ParagraphUnit) => {
    setErrorMessage(null);
    const allUnits = units;
    const idx = allUnits.findIndex(u => u.id === unit.id);
    const from = idx >= 0 ? allUnits.slice(idx) : [unit];
    getEngine().speakUnits(from.length > 0 ? from : [unit]);
    setActiveParagraphId(unit.id);
  }, [units, getEngine]);

  const isPlaying = speechState === 'playing';
  const isPaused = speechState === 'paused';
  const isLoading = speechState === 'loading';
  const hasUnits = units.length > 0;

  const availableProviders: SpeechProvider[] = [
    'webspeech',
    ...(elevenLabsConfig ? ['elevenlabs' as SpeechProvider] : []),
    ...(azureConfig ? ['azure' as SpeechProvider] : []),
  ];

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className={`flex flex-col gap-3 p-3 ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-sm">🎙️</span>
        <h3 className="text-xs font-semibold text-teal-400 uppercase tracking-wide">
          Narration
        </h3>
        <span className="text-[9px] text-gray-600 italic">
          Ninja Nerd cadence
        </span>
      </div>

      {/* Provider selector */}
      {availableProviders.length > 1 && (
        <div className="flex gap-1">
          {availableProviders.map(p => {
            const meta = PROVIDER_META[p];
            return (
              <button
                key={p}
                onClick={() => setProvider(p)}
                className={`flex-1 px-2 py-1 rounded text-[10px] font-medium border transition-colors ${
                  provider === p
                    ? 'bg-teal-700/50 border-teal-500/70 text-teal-200'
                    : 'bg-gray-800/50 border-gray-700/50 text-gray-400 hover:border-gray-600'
                }`}
              >
                <span>{meta.icon}</span> {meta.label}
                <span className="ml-1 text-[8px] text-gray-500">{meta.tier}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Web Speech voice selector */}
      {provider === 'webspeech' && webSpeechVoices.length > 0 && (
        <select
          value={selectedVoiceURI ?? ''}
          onChange={e => setSelectedVoiceURI(e.target.value || null)}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[10px] text-gray-300"
        >
          <option value="">Browser default voice</option>
          {webSpeechVoices
            .filter(v => v.lang.startsWith('en'))
            .map(v => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang})
              </option>
            ))
          }
        </select>
      )}

      {/* Style toggles */}
      <div className="flex gap-2">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={cadenceEnabled}
            onChange={e => setCadenceEnabled(e.target.checked)}
            className="rounded accent-teal-500"
          />
          <span className="text-[10px] text-gray-300">Ninja Nerd cadence</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={roleAwareMode}
            onChange={e => setRoleAwareMode(e.target.checked)}
            className="rounded accent-teal-500"
          />
          <span className="text-[10px] text-gray-300">Role-aware mode</span>
        </label>
      </div>

      {/* Speed selector */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-gray-500">Speed:</span>
        <div className="flex gap-1">
          {RATE_OPTIONS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setRateMultiplier(value)}
              className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                rateMultiplier === value
                  ? 'bg-teal-700/50 border-teal-500/60 text-teal-300'
                  : 'bg-gray-800/50 border-gray-700/50 text-gray-500 hover:text-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Main controls */}
      <div className="flex items-center gap-2">
        {/* Play / Pause */}
        <button
          onClick={isPlaying ? handlePause : handlePlay}
          disabled={isLoading || !hasUnits}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-medium text-xs transition-all ${
            isLoading
              ? 'bg-gray-700/40 border-gray-600/40 text-gray-500 cursor-wait'
              : isPlaying || isPaused
              ? 'bg-teal-700/50 border-teal-500/70 text-teal-200 hover:bg-teal-600/50'
              : 'bg-teal-800/40 border-teal-600/50 text-teal-300 hover:bg-teal-700/50 disabled:opacity-40'
          }`}
        >
          {isLoading ? (
            <span className="animate-pulse">⏳</span>
          ) : isPlaying ? (
            <><span>⏸</span> Pause</>
          ) : isPaused ? (
            <><span>▶</span> Resume</>
          ) : (
            <><span>▶</span> Play</>
          )}
        </button>

        {/* Stop */}
        {(isPlaying || isPaused) && (
          <button
            onClick={handleStop}
            className="px-2.5 py-1.5 rounded-lg border border-gray-600/50 bg-gray-700/30 text-gray-400 hover:text-gray-200 text-xs transition-colors"
          >
            ⏹ Stop
          </button>
        )}
      </div>

      {/* Error message */}
      {errorMessage && (
        <div className="p-2 bg-red-900/30 border border-red-700/50 rounded text-[10px] text-red-300">
          ⚠️ {errorMessage}
        </div>
      )}

      {/* Now reading indicator */}
      {(isPlaying || isPaused) && activeParagraphId && (
        <div className="flex items-center gap-1.5 p-2 bg-teal-900/20 border border-teal-700/30 rounded text-[10px] text-teal-400">
          <span className={isPlaying ? 'animate-pulse' : ''}>🔊</span>
          <span className="truncate">
            {activeWord ? `"${activeWord.word}"` : 'Reading…'}
          </span>
        </div>
      )}

      {/* Paragraph list — click to start from that paragraph */}
      {hasUnits && (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          <div className="text-[9px] text-gray-600 uppercase tracking-wide mb-1">
            Paragraphs — click to start reading from here
          </div>
          {units.map((unit, idx) => {
            const isActive = activeParagraphId === unit.id;
            return (
              <button
                key={unit.id}
                onClick={() => handleReadFromParagraph(unit)}
                className={`w-full text-left p-1.5 rounded text-[10px] border transition-colors ${
                  isActive
                    ? 'bg-teal-800/40 border-teal-500/50 text-teal-200'
                    : 'bg-gray-800/30 border-gray-700/40 text-gray-400 hover:border-gray-600 hover:text-gray-300'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  {isActive && <span className="text-teal-400 animate-pulse">▶</span>}
                  <span className={`text-[8px] px-1 py-0.5 rounded ${
                    unit.role === 'exam_trap' ? 'bg-orange-900/40 text-orange-400' :
                    unit.role === 'definition' ? 'bg-blue-900/40 text-blue-400' :
                    unit.role === 'formula' ? 'bg-cyan-900/40 text-cyan-400' :
                    'bg-gray-700/40 text-gray-500'
                  }`}>
                    {unit.role.replace('_', ' ')}
                  </span>
                  <span className="truncate">{unit.text.slice(0, 60)}…</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SpeechNarrationPanel;
