// lib/voiceTools.ts
import OpenAI from "openai";

/**
 * 🔈 SpeechSynthesisAPI — Web-based TTS
 * Reads aloud text using the built-in browser Speech Synthesis API.
 */
export const SpeechSynthesisAPI = {
  speak(text: string) {
    if (!window.speechSynthesis) {
      alert("Your browser does not support text-to-speech.");
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  }
};

/**
 * 🔊 SpeechRecognitionAPI — Voice to Text (Web)
 * Converts spoken voice to text using the Web Speech Recognition API.
 */
export const SpeechRecognitionAPI = {
  recognition: null as SpeechRecognition | null,

  start({
    onResult,
    onError
  }: {
    onResult: (result: string) => void;
    onError?: () => void;
  }) {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Your browser does not support speech recognition.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript;
      onResult(transcript);
    };

    recognition.onerror = () => {
      if (onError) onError?.();
    };

    recognition.onend = () => {
      if (onError) onError?.();
    };

    recognition.start();
    this.recognition = recognition;
  },

  stop() {
    this.recognition?.stop();
    this.recognition = null;
  }
};

/**
 * 🧠 synthesizeVoiceFromText — AI TTS (Ninja Nerd–style voice output)
 * Generates natural-sounding audio from text using OpenAI's TTS model.
 */
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

export async function synthesizeVoiceFromText(
  script: string,
  voice: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer" = "alloy"
): Promise<Blob> {
  const response = await openai.audio.speech.create({
    model: "tts-1",
    voice,
    input: script
  });

  const arrayBuffer = await response.arrayBuffer();
  return new Blob([arrayBuffer], { type: "audio/mpeg" });
}