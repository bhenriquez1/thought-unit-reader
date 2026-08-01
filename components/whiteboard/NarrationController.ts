// components/whiteboard/NarrationController.ts
// Web Speech API wrapper for step-by-step whiteboard narration.

export class NarrationController {
  private _synth: SpeechSynthesis | null = null;

  private get synth(): SpeechSynthesis | null {
    if (typeof window === "undefined") return null;
    if (!this._synth) this._synth = window.speechSynthesis;
    return this._synth;
  }

  speak(text: string, onEnd?: () => void): void {
    if (!this.synth) return;
    this.synth.cancel();
    const u = new SpeechSynthesisUtterance(text.slice(0, 500));
    u.rate   = 0.88;
    u.pitch  = 1.0;
    u.volume = 1.0;
    if (onEnd) u.onend = onEnd;
    this.synth.speak(u);
  }

  stop(): void {
    this.synth?.cancel();
  }

  get isSpeaking(): boolean {
    return this.synth?.speaking ?? false;
  }
}
