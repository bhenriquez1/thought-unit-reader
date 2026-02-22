// lib/speech/index.ts
// Unified Speech Engine
// Provider-agnostic API wrapping WebSpeech, ElevenLabs, Azure.
// Handles: play/pause/stop, click-to-start, word highlight callbacks,
// provider selection, and narration plan orchestration.

import type { ParagraphUnit } from '@/lib/page-intelligence/types';
import {
  buildNarrationPlan,
  buildPageNarrationPlans,
  findNearestWordStart,
  getActiveWord,
  type NarrationPlan,
  type WordBoundary,
} from './narrationPlan';
import {
  createWebSpeechSession,
  isWebSpeechAvailable,
  getWebSpeechVoices,
  type WebSpeechOptions,
} from './providers/webspeech';
import {
  streamElevenLabs,
  type ElevenLabsOptions,
} from './providers/elevenlabs';
import {
  streamAzureTTS,
  type AzureTTSOptions,
} from './providers/azure';

// ============================================================================
// Types
// ============================================================================

export type SpeechProvider = 'webspeech' | 'elevenlabs' | 'azure';

export type SpeechState = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

export interface SpeechEngineConfig {
  provider: SpeechProvider;
  /** Global rate multiplier: 0.8 | 1.0 | 1.2 */
  rateMultiplier?: number;
  /** Ninja Nerd cadence enabled */
  cadenceEnabled?: boolean;
  /** Provider-specific config */
  elevenlabs?: {
    apiKey: string;
    voiceId: string;
    modelId?: string;
  };
  azure?: {
    subscriptionKey: string;
    region: string;
    voiceName?: string;
  };
  webspeech?: {
    voiceURI?: string | null;
  };
}

export interface SpeechEngineCallbacks {
  onStateChange?: (state: SpeechState) => void;
  /** Current word being spoken — for live highlight */
  onWordBoundary?: (wb: WordBoundary, charOffset: number, paragraphId: string) => void;
  /** Fired when a paragraph finishes — move to next */
  onParagraphEnd?: (paragraphId: string) => void;
  onError?: (err: string) => void;
}

// ============================================================================
// Audio playback helper (for ElevenLabs / Azure raw audio chunks)
// ============================================================================

class ChunkedAudioPlayer {
  private ctx: AudioContext | null = null;
  private queue: Uint8Array[] = [];
  private playing = false;
  private onEnd?: () => void;

  constructor(onEnd?: () => void) {
    this.onEnd = onEnd;
  }

  private getCtx(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new AudioContext();
    }
    return this.ctx;
  }

  push(chunk: Uint8Array): void {
    this.queue.push(chunk);
    if (!this.playing) this.playNext();
  }

  private async playNext(): Promise<void> {
    if (this.queue.length === 0) {
      this.playing = false;
      this.onEnd?.();
      return;
    }
    this.playing = true;
    const chunk = this.queue.shift()!;
    const ctx = this.getCtx();
    try {
      const buffer = await ctx.decodeAudioData(chunk.buffer.slice(0));
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => this.playNext();
      source.start();
    } catch {
      // Skip undecodable chunk and continue
      this.playNext();
    }
  }

  stop(): void {
    this.queue = [];
    this.playing = false;
    this.ctx?.close();
    this.ctx = null;
  }
}

// ============================================================================
// Speech Engine
// ============================================================================

export class SpeechEngine {
  private config: SpeechEngineConfig;
  private callbacks: SpeechEngineCallbacks;
  private state: SpeechState = 'idle';
  private currentPlans: NarrationPlan[] = [];
  private currentPlanIdx = 0;
  private cancelCurrent: (() => void) | null = null;
  private audioPlayer: ChunkedAudioPlayer | null = null;
  private webSpeechSession: ReturnType<typeof createWebSpeechSession> | null = null;

  constructor(config: SpeechEngineConfig, callbacks: SpeechEngineCallbacks = {}) {
    this.config = config;
    this.callbacks = callbacks;
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Speak a single ParagraphUnit from a given character offset.
   * charOffset = 0 means start from the beginning.
   */
  async speakParagraph(unit: ParagraphUnit, fromChar = 0): Promise<void> {
    this.stopAll();
    const plan = buildNarrationPlan(unit);
    this.currentPlans = [plan];
    this.currentPlanIdx = 0;
    await this.playPlan(plan, fromChar);
  }

  /**
   * Speak a sequence of ParagraphUnits (e.g., all on a page, in order).
   * @param fromParagraphId Start from this paragraph (undefined = start from first)
   * @param fromChar Character offset within the starting paragraph
   */
  async speakUnits(
    units: ParagraphUnit[],
    fromParagraphId?: string,
    fromChar = 0,
  ): Promise<void> {
    this.stopAll();
    this.currentPlans = buildPageNarrationPlans(units);

    const startIdx = fromParagraphId
      ? this.currentPlans.findIndex(p => p.paragraphId === fromParagraphId)
      : 0;

    this.currentPlanIdx = Math.max(0, startIdx);
    await this.playFromIndex(this.currentPlanIdx, fromChar);
  }

  /**
   * Click-to-start: find the nearest word to charOffset in the plan's text,
   * then start speaking from there.
   */
  clickToStart(unit: ParagraphUnit, charOffset: number): void {
    const plan = buildNarrationPlan(unit);
    const wordStart = findNearestWordStart(plan.wordBoundaries, charOffset);
    this.speakParagraph(unit, wordStart);
  }

  pause(): void {
    if (this.state !== 'playing') return;
    this.webSpeechSession?.pause();
    this.setState('paused');
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.webSpeechSession?.resume();
    this.setState('playing');
  }

  stopAll(): void {
    this.cancelCurrent?.();
    this.cancelCurrent = null;
    this.webSpeechSession?.cancel();
    this.webSpeechSession = null;
    this.audioPlayer?.stop();
    this.audioPlayer = null;
    this.currentPlans = [];
    this.currentPlanIdx = 0;
    this.setState('idle');
  }

  updateConfig(patch: Partial<SpeechEngineConfig>): void {
    this.config = { ...this.config, ...patch };
  }

  getState(): SpeechState {
    return this.state;
  }

  // ============================================================================
  // Internal
  // ============================================================================

  private setState(s: SpeechState): void {
    this.state = s;
    this.callbacks.onStateChange?.(s);
  }

  private async playFromIndex(idx: number, fromChar = 0): Promise<void> {
    if (idx >= this.currentPlans.length) {
      this.setState('idle');
      return;
    }
    this.currentPlanIdx = idx;
    await this.playPlan(this.currentPlans[idx], idx === 0 ? fromChar : 0);
  }

  private async playPlan(plan: NarrationPlan, fromChar = 0): Promise<void> {
    this.setState('loading');
    const { provider, rateMultiplier = 1.0, cadenceEnabled = true } = this.config;

    const onEnd = () => {
      this.callbacks.onParagraphEnd?.(plan.paragraphId);
      const next = this.currentPlanIdx + 1;
      if (next < this.currentPlans.length) {
        this.playFromIndex(next, 0);
      } else {
        this.setState('idle');
      }
    };

    const onWordBoundary = (wb: WordBoundary, charOffset: number) => {
      this.callbacks.onWordBoundary?.(wb, charOffset, plan.paragraphId);
    };

    const onError = (err: string | Error) => {
      this.setState('error');
      this.callbacks.onError?.(typeof err === 'string' ? err : err.message);
    };

    if (provider === 'webspeech') {
      if (!isWebSpeechAvailable()) {
        onError('Web Speech API not available in this browser.');
        return;
      }
      const session = createWebSpeechSession(plan, {
        voiceURI: this.config.webspeech?.voiceURI,
        rateMultiplier,
        cadenceEnabled,
        onWordBoundary,
        onEnd,
        onError: (e) => onError(e),
      });
      this.webSpeechSession = session;
      session.start(fromChar);
      this.setState('playing');

    } else if (provider === 'elevenlabs') {
      if (!this.config.elevenlabs?.apiKey) {
        onError('ElevenLabs API key not configured.');
        return;
      }
      this.audioPlayer = new ChunkedAudioPlayer(onEnd);
      const cancel = await streamElevenLabs(plan, {
        apiKey: this.config.elevenlabs.apiKey,
        voiceId: this.config.elevenlabs.voiceId,
        modelId: this.config.elevenlabs.modelId,
        cadenceEnabled,
        rateMultiplier,
        onAudioChunk: (chunk) => this.audioPlayer?.push(chunk),
        onWordBoundary,
        onEnd,
        onError,
      });
      this.cancelCurrent = cancel;
      this.setState('playing');

    } else if (provider === 'azure') {
      if (!this.config.azure?.subscriptionKey) {
        onError('Azure TTS credentials not configured.');
        return;
      }
      this.audioPlayer = new ChunkedAudioPlayer(onEnd);
      const cancel = await streamAzureTTS(plan, {
        subscriptionKey: this.config.azure.subscriptionKey,
        region: this.config.azure.region,
        voiceName: this.config.azure.voiceName,
        cadenceEnabled,
        rateMultiplier,
        onAudioChunk: (chunk) => this.audioPlayer?.push(chunk),
        onEnd,
        onError,
      });
      this.cancelCurrent = cancel;
      this.setState('playing');
    }
  }
}

// ============================================================================
// Exports
// ============================================================================

export {
  buildNarrationPlan,
  buildPageNarrationPlans,
  findNearestWordStart,
  getActiveWord,
  isWebSpeechAvailable,
  getWebSpeechVoices,
};

export type { NarrationPlan, WordBoundary };
