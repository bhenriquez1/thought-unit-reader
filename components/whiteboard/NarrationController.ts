// components/whiteboard/NarrationController.ts
// Web Speech API wrapper for step-by-step whiteboard narration.
// Routes through speechController so whiteboard TTS is coordinated with
// StudySpeechPanel, ChiefResident, and all other speech surfaces — only one
// surface can speak at a time.

import {
  claimSpeech,
  registerActiveUtterance,
  notifySpeechEnd,
  notifySpeechError,
  releaseSpeech,
  isSpeechStale,
} from "@/lib/speech/speechController";

export class NarrationController {
  private _token: number | null = null;

  speak(text: string, onEnd?: () => void): void {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    // Claim speech — force-stops any other surface (StudySpeech, ChiefResident, etc.)
    const token = claimSpeech("whiteboard");
    this._token = token;

    const u = new SpeechSynthesisUtterance(text.slice(0, 500));
    u.rate   = 0.88;
    u.pitch  = 1.0;
    u.volume = 1.0;

    u.onend = () => {
      if (isSpeechStale(token)) return;
      notifySpeechEnd(token, "whiteboard");
      this._token = null;
      onEnd?.();
    };

    u.onerror = (e) => {
      if (isSpeechStale(token)) return;
      notifySpeechError(token, "whiteboard", String(e.error));
      this._token = null;
    };

    registerActiveUtterance(token, u, () => {
      // Force-stopped by a competing speech surface — treat as done so UI resets
      this._token = null;
      onEnd?.();
    });

    window.speechSynthesis.speak(u);
  }

  stop(): void {
    if (this._token !== null) {
      releaseSpeech(this._token);
      this._token = null;
    }
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const synth = window.speechSynthesis;
    try { if (synth.speaking || synth.pending) synth.pause(); } catch {}
    try { synth.cancel(); } catch {}
  }

  get isSpeaking(): boolean {
    return typeof window !== "undefined" && (window.speechSynthesis?.speaking ?? false);
  }
}
