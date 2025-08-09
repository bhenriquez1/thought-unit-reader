// hooks/useSpeechSynthesis.ts
import { useCallback } from "react";

type SpeakOptions = {
  text: string;
  rate?: number;
  pitch?: number;
  lang?: string;
  voice?: SpeechSynthesisVoice | null;
  onEnd?: () => void;
};

export function useSpeechSynthesis() {
  const supported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  const speak = useCallback(
    ({ text, rate = 1, pitch = 1, lang = "en-US", voice = null, onEnd }: SpeakOptions) => {
      if (!supported || !text) return;
      const u = new SpeechSynthesisUtterance(text);
      u.rate = rate;
      u.pitch = pitch;
      u.lang = lang;
      if (voice) u.voice = voice;
      if (onEnd) u.onend = onEnd;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    },
    [supported]
  );

  const cancel = useCallback(() => {
    if (supported) window.speechSynthesis.cancel();
  }, [supported]);

  return { supported, speak, cancel };
}

export default useSpeechSynthesis;