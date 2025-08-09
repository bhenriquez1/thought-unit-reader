// globals.d.ts
// Ambient types for Web Speech API + MetaMask ethereum on window.

export {};

declare global {
  /* ---------------- Web Speech API (minimal) ---------------- */

  interface SpeechRecognition extends EventTarget {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    start(): void;
    stop(): void;
    abort?: () => void;
    onresult: (event: SpeechRecognitionEvent) => void;
    onerror: (event: any) => void;
    onaudioend?: (event: any) => void;
  }

  interface SpeechRecognitionAlternative {
    transcript: string;
    confidence: number;
  }

  interface SpeechRecognitionResult {
    length: number;
    isFinal: boolean;
    0: SpeechRecognitionAlternative;
  }

  interface SpeechRecognitionResultList {
    length: number;
    item(index: number): SpeechRecognitionResult;
    [index: number]: SpeechRecognitionResult;
  }

  interface SpeechRecognitionEvent extends Event {
    resultIndex: number;
    results: SpeechRecognitionResultList;
  }

  /* ---------------- Window augmentations ---------------- */

  interface Window {
    // Web Speech constructors (Chrome uses webkit prefix)
    SpeechRecognition?: { new (): SpeechRecognition };
    webkitSpeechRecognition?: { new (): SpeechRecognition };

    // MetaMask / EIP-1193 provider
    ethereum?: {
      isMetaMask?: boolean;
      request?: (args: { method: string; params?: unknown[] }) => Promise<any>;
    };
  }
}