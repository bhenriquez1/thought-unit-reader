// lib/voiceTools.ts
// Safer voice utilities: prefer server /api/tts; optional client OpenAI fallback for local dev.

import OpenAI from "openai";

/** Optional local-dev fallback (set in .env.local)
 *  NEXT_PUBLIC_ALLOW_CLIENT_OPENAI=true
 *  OPENAI_API_KEY=sk-...
 */
const ALLOW_CLIENT_OPENAI =
  typeof window !== "undefined" &&
  process.env.NEXT_PUBLIC_ALLOW_CLIENT_OPENAI === "true";

let openai: OpenAI | null = null;
if (ALLOW_CLIENT_OPENAI && process.env.OPENAI_API_KEY) {
  // ⚠️ Only for local dev. Do NOT enable in production.
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

/**
 * 🔈 SpeechSynthesisAPI — Web-based TTS (browser built-in)
 */
export const SpeechSynthesisAPI = {
  speak(text: string, opts?: { rate?: number; pitch?: number; lang?: string }) {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      alert("Your browser does not support text-to-speech.");
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = opts?.lang ?? "en-US";
    utterance.rate = opts?.rate ?? 1.0;
    utterance.pitch = opts?.pitch ?? 1.0;
    window.speechSynthesis.cancel(); // stop anything currently speaking
    window.speechSynthesis.speak(utterance);
  },
  pause() {
    if (typeof window !== "undefined") window.speechSynthesis?.pause?.();
  },
  resume() {
    if (typeof window !== "undefined") window.speechSynthesis?.resume?.();
  },
  cancel() {
    if (typeof window !== "undefined") window.speechSynthesis?.cancel?.();
  },
};

/**
 * 🔊 SpeechRecognitionAPI — Voice to Text (Web Speech)
 */
export const SpeechRecognitionAPI = {
  recognition: null as SpeechRecognition | null,

  start({
    onResult,
    onError,
    lang = "en-US",
    interimResults = false,
  }: {
    onResult: (result: string) => void;
    onError?: (err?: any) => void;
    lang?: string;
    interimResults?: boolean;
  }) {
    if (typeof window === "undefined") return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Your browser does not support speech recognition.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = lang;
    recognition.interimResults = interimResults;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      // Grab the latest final result
      const res = event.results[event.results.length - 1];
      if (res?.isFinal) {
        const transcript = res[0]?.transcript ?? "";
        onResult(transcript);
      }
    };

    recognition.onerror = (e: any) => {
      onError?.(e);
    };

    recognition.onend = () => {
      // When it ends naturally (or errors), let caller know if they care
      onError?.();
    };

    recognition.start();
    this.recognition = recognition;
  },

  stop() {
    this.recognition?.stop();
    this.recognition = null;
  },
};

/**
 * 🧠 synthesizeVoiceFromText — AI TTS (Ninja Nerd–style narration)
 * Prefers calling your server /api/tts route. Falls back to client OpenAI only if explicitly allowed.
 */
export async function synthesizeVoiceFromText(
  script: string,
  voice:
    | "alloy"
    | "echo"
    | "fable"
    | "onyx"
    | "nova"
    | "shimmer" = "alloy"
): Promise<Blob> {
  if (!script || !script.trim()) {
    throw new Error("TTS: empty script");
  }

  // 1) Prefer server route (no keys in the client)
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ script, voice }),
    });

    if (res.ok) {
      // Expect audio/mpeg or audio/wav etc.
      const blob = await res.blob();
      if (blob.size > 0) return blob;
    } else {
      // If server returns JSON error, surface a usable message
      try {
        const data = await res.json();
        console.warn("TTS server error:", data?.error || res.statusText);
      } catch {
        console.warn("TTS server error:", res.statusText);
      }
    }
  } catch (e) {
    // Network/route not found — try fallback if allowed
  }

  // 2) Fallback: client OpenAI (local dev only)
  if (!openai) {
    throw new Error(
      "TTS unavailable. Add an /api/tts route OR enable local fallback by setting NEXT_PUBLIC_ALLOW_CLIENT_OPENAI=true and OPENAI_API_KEY in .env.local."
    );
  }

  // OpenAI TTS client call
  const response = await openai.audio.speech.create({
    model: "tts-1",
    voice,
    input: script,
  });

  const arrayBuffer = await response.arrayBuffer();
  return new Blob([arrayBuffer], { type: "audio/mpeg" });
}