// lib/speechWhiteboard/speechService.ts
// Speech Service - Unit-attached TTS playback
// Architecture: Speech attaches to cognitive units (span, relation, cluster, decisionRule)

import { create } from 'zustand';
import type {
  CognitiveUnitType,
  CognitiveUnitRef,
  SpeechSession,
  SpeechPauseReason,
  AutoPauseConfig,
  PauseActionPanel,
  SpeechServiceState,
} from './types';

// ============================================================================
// Auto-pause Detection Patterns
// ============================================================================

const HEADING_PATTERNS = /^(#{1,6}\s|Chapter\s+\d|Section\s+\d|Part\s+[IVX]+)/i;
const FIGURE_PATTERNS = /^(Figure\s+\d|Fig\.\s*\d|Image\s+\d|Diagram\s+\d)/i;
const TABLE_PATTERNS = /^(Table\s+\d|Tbl\.\s*\d)/i;
const FORMULA_PATTERNS = /[\$\\]|[=<>≤≥±∑∫∏√]/;
const DEFINITION_PATTERNS = /^([A-Z][a-z]+)\s*[:—–-]\s*[A-Z]/;

function detectPauseReason(text: string): SpeechPauseReason | null {
  if (HEADING_PATTERNS.test(text)) return 'heading';
  if (FIGURE_PATTERNS.test(text)) return 'figure';
  if (TABLE_PATTERNS.test(text)) return 'table';
  if (FORMULA_PATTERNS.test(text)) return 'formula';
  if (DEFINITION_PATTERNS.test(text)) return 'definition';
  return null;
}

// ============================================================================
// Speech Service Store
// ============================================================================

interface SpeechServiceActions {
  // Session management
  startSession: (
    unitType: CognitiveUnitType,
    unitId: string,
    spanHashes: string[],
    getSpanText: (hash: string) => string
  ) => void;
  endSession: () => void;

  // Playback control
  play: () => void;
  pause: () => void;
  stop: () => void;
  skipToSpan: (spanHash: string) => void;

  // Settings
  setRate: (rate: number) => void;
  setVoice: (voiceURI: string) => void;
  updateAutoPauseConfig: (config: Partial<AutoPauseConfig>) => void;

  // Pause actions
  showPausePanel: (reason: SpeechPauseReason, unitRef: CognitiveUnitRef) => void;
  hidePausePanel: () => void;

  // Internal
  _handleUtteranceEnd: () => void;
  _speakNextSpan: () => void;
  _checkForAutoPause: (text: string) => SpeechPauseReason | null;
}

type SpeechServiceStore = SpeechServiceState & SpeechServiceActions;

const defaultAutoPauseConfig: AutoPauseConfig = {
  pauseOnHeadings: true,
  pauseOnFigures: true,
  pauseOnTables: true,
  pauseOnFormulas: true,
  pauseOnDefinitions: false, // Optional per spec
};

// Store text content for current session (not in state to avoid serialization)
let sessionSpanTexts: Map<string, string> = new Map();
let currentUtterance: SpeechSynthesisUtterance | null = null;

export const useSpeechService = create<SpeechServiceStore>((set, get) => ({
  // Initial state
  currentSession: null,
  autoPauseConfig: defaultAutoPauseConfig,
  pauseActionPanel: {
    visible: false,
    pausedAt: null,
    pauseReason: null,
    availableActions: [],
  },
  availableVoices: [],
  isSupported: typeof window !== 'undefined' && 'speechSynthesis' in window,

  // ========================================
  // Session Management
  // ========================================

  startSession: (unitType, unitId, spanHashes, getSpanText) => {
    const { stop } = get();
    stop(); // Stop any existing session

    // Build span text map
    sessionSpanTexts.clear();
    spanHashes.forEach((hash) => {
      sessionSpanTexts.set(hash, getSpanText(hash));
    });

    const session: SpeechSession = {
      id: `speech_${Date.now()}`,
      unitType,
      unitId,
      spanHashes,
      currentSpanIndex: 0,
      currentSpanHash: spanHashes[0] || null,
      status: 'idle',
      pausedReason: null,
      pausedAtSpanHash: null,
      rate: 1.0,
      voice: null,
      startedAt: null,
      totalDuration: null,
      elapsedTime: 0,
    };

    set({ currentSession: session });

    // Load available voices
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        set({ availableVoices: voices });
      } else {
        // Voices load async
        window.speechSynthesis.onvoiceschanged = () => {
          set({ availableVoices: window.speechSynthesis.getVoices() });
        };
      }
    }
  },

  endSession: () => {
    const { stop } = get();
    stop();
    sessionSpanTexts.clear();
    set({ currentSession: null });
  },

  // ========================================
  // Playback Control
  // ========================================

  play: () => {
    const { currentSession, _speakNextSpan } = get();
    if (!currentSession) return;

    if (currentSession.status === 'paused') {
      // Resume
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.resume();
      }
      set({
        currentSession: {
          ...currentSession,
          status: 'playing',
          pausedReason: null,
        },
      });
    } else if (currentSession.status === 'idle') {
      // Start
      set({
        currentSession: {
          ...currentSession,
          status: 'playing',
          startedAt: Date.now(),
        },
      });
      _speakNextSpan();
    }
  },

  pause: () => {
    const { currentSession } = get();
    if (!currentSession || currentSession.status !== 'playing') return;

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.pause();
    }

    set({
      currentSession: {
        ...currentSession,
        status: 'paused',
        pausedReason: 'user_paused',
        pausedAtSpanHash: currentSession.currentSpanHash,
      },
    });
  },

  stop: () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    currentUtterance = null;

    const { currentSession } = get();
    if (currentSession) {
      set({
        currentSession: {
          ...currentSession,
          status: 'idle',
          currentSpanIndex: 0,
          currentSpanHash: currentSession.spanHashes[0] || null,
          pausedReason: null,
          pausedAtSpanHash: null,
        },
      });
    }
  },

  skipToSpan: (spanHash) => {
    const { currentSession, _speakNextSpan, stop } = get();
    if (!currentSession) return;

    const index = currentSession.spanHashes.indexOf(spanHash);
    if (index === -1) return;

    stop();

    set({
      currentSession: {
        ...currentSession,
        currentSpanIndex: index,
        currentSpanHash: spanHash,
        status: 'playing',
      },
    });

    _speakNextSpan();
  },

  // ========================================
  // Settings
  // ========================================

  setRate: (rate) => {
    const { currentSession } = get();
    if (!currentSession) return;

    set({
      currentSession: {
        ...currentSession,
        rate: Math.max(0.5, Math.min(2.0, rate)),
      },
    });
  },

  setVoice: (voiceURI) => {
    const { currentSession } = get();
    if (!currentSession) return;

    set({
      currentSession: {
        ...currentSession,
        voice: voiceURI,
      },
    });
  },

  updateAutoPauseConfig: (config) => {
    set((state) => ({
      autoPauseConfig: { ...state.autoPauseConfig, ...config },
    }));
  },

  // ========================================
  // Pause Actions
  // ========================================

  showPausePanel: (reason, unitRef) => {
    set({
      pauseActionPanel: {
        visible: true,
        pausedAt: unitRef,
        pauseReason: reason,
        availableActions: [
          { type: 'explain', unitRef },
          { type: 'save_to_notelab', unitRef, spanHash: unitRef.spanHash || '' },
          { type: 'drill_in_study', unitRef },
          { type: 'continue' },
          { type: 'stop' },
        ],
      },
    });
  },

  hidePausePanel: () => {
    set({
      pauseActionPanel: {
        visible: false,
        pausedAt: null,
        pauseReason: null,
        availableActions: [],
      },
    });
  },

  // ========================================
  // Internal
  // ========================================

  _handleUtteranceEnd: () => {
    const { currentSession, _speakNextSpan, hidePausePanel } = get();
    if (!currentSession) return;

    const nextIndex = currentSession.currentSpanIndex + 1;

    if (nextIndex >= currentSession.spanHashes.length) {
      // Session complete
      set({
        currentSession: {
          ...currentSession,
          status: 'completed',
          pausedReason: 'end_of_content',
        },
      });
      return;
    }

    // Move to next span
    const nextHash = currentSession.spanHashes[nextIndex];
    set({
      currentSession: {
        ...currentSession,
        currentSpanIndex: nextIndex,
        currentSpanHash: nextHash,
      },
    });

    hidePausePanel();
    _speakNextSpan();
  },

  _speakNextSpan: () => {
    const { currentSession, autoPauseConfig, _handleUtteranceEnd, showPausePanel, _checkForAutoPause } = get();
    if (!currentSession || currentSession.status !== 'playing') return;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    const spanHash = currentSession.currentSpanHash;
    if (!spanHash) return;

    const text = sessionSpanTexts.get(spanHash);
    if (!text) {
      _handleUtteranceEnd();
      return;
    }

    // Check for auto-pause conditions
    const pauseReason = _checkForAutoPause(text);
    if (pauseReason) {
      // Pause before speaking this span
      set({
        currentSession: {
          ...currentSession,
          status: 'paused',
          pausedReason: pauseReason,
          pausedAtSpanHash: spanHash,
        },
      });

      showPausePanel(pauseReason, {
        unitType: currentSession.unitType,
        unitId: currentSession.unitId,
        spanHash,
      });
      return;
    }

    // Speak the span
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = currentSession.rate;

    // Set voice if specified
    if (currentSession.voice) {
      const voices = window.speechSynthesis.getVoices();
      const voice = voices.find((v) => v.voiceURI === currentSession.voice);
      if (voice) {
        utterance.voice = voice;
      }
    }

    utterance.onend = _handleUtteranceEnd;
    utterance.onerror = (e) => {
      console.error('Speech synthesis error:', e);
      _handleUtteranceEnd();
    };

    currentUtterance = utterance;
    window.speechSynthesis.speak(utterance);
  },

  _checkForAutoPause: (text) => {
    const { autoPauseConfig } = get();
    const reason = detectPauseReason(text);

    if (!reason) return null;

    // Check if this pause reason is enabled
    switch (reason) {
      case 'heading':
        return autoPauseConfig.pauseOnHeadings ? reason : null;
      case 'figure':
        return autoPauseConfig.pauseOnFigures ? reason : null;
      case 'table':
        return autoPauseConfig.pauseOnTables ? reason : null;
      case 'formula':
        return autoPauseConfig.pauseOnFormulas ? reason : null;
      case 'definition':
        return autoPauseConfig.pauseOnDefinitions ? reason : null;
      default:
        return null;
    }
  },
}));

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get spans for a cluster (supporting spans that created the cluster/relations)
 */
export function getClusterSpans(
  clusterId: string,
  getRelationsByCluster: (id: string) => Array<{ evidence: Array<{ spanHash: string }> }>
): string[] {
  const relations = getRelationsByCluster(clusterId);
  const spanHashes = new Set<string>();

  relations.forEach((rel) => {
    rel.evidence.forEach((ev) => {
      if (ev.spanHash) {
        spanHashes.add(ev.spanHash);
      }
    });
  });

  return Array.from(spanHashes);
}

/**
 * Get spans for a relation (its evidence spans)
 */
export function getRelationSpans(
  evidence: Array<{ spanHash: string }>
): string[] {
  return evidence.map((ev) => ev.spanHash).filter(Boolean);
}

export default useSpeechService;
