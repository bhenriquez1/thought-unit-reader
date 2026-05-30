// lib/focus/focusAudio.ts
// Free / Creative-Commons audio engine for the Focus Cycle.
//
// Two sources, no bundled files, no licensing cost:
//   1. SomaFM — listener-supported, CC-friendly internet radio with stable direct
//      MP3 stream URLs that play in a plain <audio> element.
//   2. Web Audio — brown / white / pink noise generated procedurally in-browser.
//
// Adaptive behavior is driven by the Focus Cycle: focus phases play at full volume,
// break phases auto-duck so the timer feels like it "breathes" between work and rest.

export type FocusSoundId =
  | "off"
  | "brown_noise"
  | "white_noise"
  | "pink_noise"
  | "ambient"      // SomaFM Drone Zone — deep ambient
  | "lofi"         // SomaFM Fluid — instrumental hip-hop / lo-fi
  | "groove"       // SomaFM Groove Salad — chilled downtempo
  | "classical";   // SomaFM Sonic Universe / Classical — instrumental

export interface FocusSoundOption {
  id: FocusSoundId;
  label: string;
  kind: "noise" | "stream";
  /** Direct stream URL for "stream" sounds. */
  url?: string;
}

// Stream URLs are SomaFM's public direct MP3 endpoints (free, legal to stream).
export const FOCUS_SOUNDS: FocusSoundOption[] = [
  { id: "off",         label: "Off",          kind: "noise" },
  { id: "brown_noise", label: "Brown Noise",  kind: "noise" },
  { id: "pink_noise",  label: "Pink Noise",   kind: "noise" },
  { id: "white_noise", label: "White Noise",  kind: "noise" },
  { id: "ambient",     label: "Ambient",      kind: "stream", url: "https://ice1.somafm.com/dronezone-128-mp3" },
  { id: "lofi",        label: "Lo-Fi",        kind: "stream", url: "https://ice1.somafm.com/fluid-128-mp3" },
  { id: "groove",      label: "Groove",       kind: "stream", url: "https://ice1.somafm.com/groovesalad-128-mp3" },
  { id: "classical",   label: "Classical",    kind: "stream", url: "https://ice1.somafm.com/sonicuniverse-128-mp3" },
];

/**
 * Singleton audio controller. Holds at most one active source at a time
 * (either an <audio> stream or a Web Audio noise node) and exposes a tiny
 * play / stop / volume API that React components can drive without re-creating
 * audio nodes on every render.
 */
class FocusAudioEngine {
  private audioEl: HTMLAudioElement | null = null;
  private ctx: AudioContext | null = null;
  private noiseSource: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private current: FocusSoundId = "off";
  private baseVolume = 0.5;

  /** Switch to a sound. "off" stops everything. Safe to call repeatedly. */
  async play(id: FocusSoundId): Promise<void> {
    if (typeof window === "undefined") return;
    if (id === this.current && id !== "off") return; // already playing this source
    this.stop();
    this.current = id;
    if (id === "off") return;

    const opt = FOCUS_SOUNDS.find((s) => s.id === id);
    if (!opt) return;

    if (opt.kind === "stream" && opt.url) {
      const el = new Audio(opt.url);
      el.loop = true;
      el.crossOrigin = "anonymous";
      el.volume = this.baseVolume;
      this.audioEl = el;
      try {
        await el.play();
      } catch (e) {
        // Autoplay can be blocked until a user gesture — the play() is triggered
        // from the Start button click, so this normally succeeds.
        console.warn("[focusAudio] stream play blocked", e);
      }
      return;
    }

    // Noise synthesis (brown / pink / white) via Web Audio.
    this.startNoise(id);
  }

  /** Generate a looping noise buffer and route it through a gain node. */
  private startNoise(id: FocusSoundId): void {
    const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctor) return;
    const ctx: AudioContext = this.ctx ?? new Ctor();
    this.ctx = ctx;
    if (ctx.state === "suspended") void ctx.resume();

    const seconds = 4;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    if (id === "white_noise") {
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    } else if (id === "brown_noise") {
      let last = 0;
      for (let i = 0; i < data.length; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02;
        data[i] = last * 3.5; // compensate for the lower amplitude of brown noise
      }
    } else {
      // pink noise — Paul Kellet's economical approximation
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < data.length; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.96900 * b2 + w * 0.1538520;
        b3 = 0.86650 * b3 + w * 0.3104856;
        b4 = 0.55000 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = this.baseVolume;
    src.connect(gain).connect(ctx.destination);
    src.start();
    this.noiseSource = src;
    this.gain = gain;
  }

  /** Stop and tear down whatever is currently playing. */
  stop(): void {
    if (this.audioEl) {
      this.audioEl.pause();
      this.audioEl.src = "";
      this.audioEl = null;
    }
    if (this.noiseSource) {
      try { this.noiseSource.stop(); } catch { /* already stopped */ }
      this.noiseSource.disconnect();
      this.noiseSource = null;
    }
    this.gain = null;
    this.current = "off";
  }

  /** Set the base volume (0..1) used for both streams and noise. */
  setVolume(v: number): void {
    this.baseVolume = Math.max(0, Math.min(1, v));
    if (this.audioEl) this.audioEl.volume = this.baseVolume;
    if (this.gain && this.ctx) {
      this.gain.gain.setTargetAtTime(this.baseVolume, this.ctx.currentTime, 0.2);
    }
  }

  /**
   * Adaptive duck: during break phases drop to a fraction of base volume so the
   * sound recedes; during focus phases restore full base volume. Does not change
   * the stored base volume — only the live output level.
   */
  duck(toFraction: number): void {
    const level = this.baseVolume * Math.max(0, Math.min(1, toFraction));
    if (this.audioEl) this.audioEl.volume = level;
    if (this.gain && this.ctx) {
      this.gain.gain.setTargetAtTime(level, this.ctx.currentTime, 0.4);
    }
  }

  get currentId(): FocusSoundId {
    return this.current;
  }
}

// Module-level singleton — survives component remounts.
export const focusAudio = new FocusAudioEngine();
