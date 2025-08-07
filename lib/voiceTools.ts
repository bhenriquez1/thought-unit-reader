// lib/voiceTools.ts

/**
 * 🔊 SpeechRecognitionAPI
 * Converts spoken voice to text using the Web Speech API.
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
      if (onError) onError();
    };

    recognition.onend = () => {
      if (onError) onError(); // fallback in case of failure
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
 * 🔈 SpeechSynthesisAPI
 * Reads aloud text using the Web Speech Synthesis API.
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