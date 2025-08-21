// lib/enhancedSpeech.ts
import React from 'react';

export interface EnhancedSpeechOptions {
  voice?: SpeechSynthesisVoice;
  rate?: number;
  pitch?: number;
  volume?: number;
  naturalPauses?: boolean;
  punctuationEmphasis?: boolean;
}

export class EnhancedSpeechService {
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private isPlaying = false;
  private onStateChange?: (isPlaying: boolean) => void;

  constructor(onStateChange?: (isPlaying: boolean) => void) {
    this.onStateChange = onStateChange;
  }

  // Get available voices, prioritizing natural-sounding ones
  getAvailableVoices(): SpeechSynthesisVoice[] {
    const voices = speechSynthesis.getVoices();
    
    // Sort voices to prioritize natural-sounding ones
    return voices
      .filter(voice => voice.lang.startsWith('en'))
      .sort((a, b) => {
        // Prioritize neural/natural voices
        const aIsNatural = a.name.toLowerCase().includes('neural') || 
                          a.name.toLowerCase().includes('natural') ||
                          a.name.toLowerCase().includes('premium');
        const bIsNatural = b.name.toLowerCase().includes('neural') || 
                          b.name.toLowerCase().includes('natural') ||
                          b.name.toLowerCase().includes('premium');
        
        if (aIsNatural && !bIsNatural) return -1;
        if (!aIsNatural && bIsNatural) return 1;
        
        // Then prioritize by quality indicators
        const aQuality = a.name.toLowerCase().includes('enhanced') ? 1 : 0;
        const bQuality = b.name.toLowerCase().includes('enhanced') ? 1 : 0;
        
        return bQuality - aQuality;
      });
  }

  // Enhanced text preprocessing for natural speech
  private preprocessText(text: string, options: EnhancedSpeechOptions): string {
    let processed = text;

    if (options.naturalPauses) {
      // Add natural pauses at punctuation
      processed = processed
        .replace(/\./g, '. ') // Period pause
        .replace(/,/g, ', ') // Comma pause
        .replace(/;/g, '; ') // Semicolon pause
        .replace(/:/g, ': ') // Colon pause
        .replace(/\?/g, '? ') // Question pause
        .replace(/!/g, '! ') // Exclamation pause
        .replace(/\n/g, '. ') // Line break pause
        .replace(/\s+/g, ' ') // Clean up extra spaces
        .trim();
    }

    if (options.punctuationEmphasis) {
      // Add SSML-like emphasis for important punctuation
      processed = processed
        .replace(/\*\*(.*?)\*\*/g, '$1') // Remove markdown bold but keep text
        .replace(/\*(.*?)\*/g, '$1') // Remove markdown italic but keep text
        .replace(/([.!?])\s*$/gm, '$1 ') // Ensure sentence endings have space
        .replace(/([,:;])/g, '$1 '); // Add slight pause after punctuation
    }

    return processed;
  }

  // Speak text with enhanced natural flow
  speak(text: string, options: EnhancedSpeechOptions = {}): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!text.trim()) {
        resolve();
        return;
      }

      // Stop any current speech
      this.stop();

      // Preprocess text for natural speech
      const processedText = this.preprocessText(text, {
        naturalPauses: true,
        punctuationEmphasis: true,
        ...options
      });

      const utterance = new SpeechSynthesisUtterance(processedText);
      
      // Apply voice settings
      if (options.voice) {
        utterance.voice = options.voice;
      }
      
      utterance.rate = options.rate || 1.0;
      utterance.pitch = options.pitch || 1.0;
      utterance.volume = options.volume || 1.0;

      // Event handlers
      utterance.onstart = () => {
        this.isPlaying = true;
        this.onStateChange?.(true);
      };

      utterance.onend = () => {
        this.isPlaying = false;
        this.currentUtterance = null;
        this.onStateChange?.(false);
        resolve();
      };

      utterance.onerror = (event) => {
        this.isPlaying = false;
        this.currentUtterance = null;
        this.onStateChange?.(false);
        reject(new Error(`Speech synthesis error: ${event.error}`));
      };

      utterance.onpause = () => {
        this.onStateChange?.(false);
      };

      utterance.onresume = () => {
        this.onStateChange?.(true);
      };

      this.currentUtterance = utterance;
      speechSynthesis.speak(utterance);
    });
  }

  // Speak text in chunks for better natural flow
  async speakInChunks(text: string, options: EnhancedSpeechOptions = {}): Promise<void> {
    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .filter(s => s.trim().length > 0);

    for (const sentence of sentences) {
      if (!this.isPlaying) break; // Stop if cancelled
      
      await this.speak(sentence, options);
      
      // Natural pause between sentences
      if (options.naturalPauses && this.isPlaying) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
  }

  pause(): void {
    if (speechSynthesis.speaking) {
      speechSynthesis.pause();
    }
  }

  resume(): void {
    if (speechSynthesis.paused) {
      speechSynthesis.resume();
    }
  }

  stop(): void {
    speechSynthesis.cancel();
    this.isPlaying = false;
    this.currentUtterance = null;
    this.onStateChange?.(false);
  }

  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  // Get recommended voice for natural reading
  getRecommendedVoice(): SpeechSynthesisVoice | null {
    const voices = this.getAvailableVoices();
    
    // Look for specific high-quality voices
    const preferred = [
      'Microsoft Zira - English (United States)',
      'Microsoft David - English (United States)', 
      'Google US English',
      'Alex',
      'Samantha'
    ];

    for (const voiceName of preferred) {
      const voice = voices.find(v => v.name === voiceName);
      if (voice) return voice;
    }

    // Fallback to first available English voice
    return voices[0] || null;
  }
}

// Singleton instance
let speechService: EnhancedSpeechService | null = null;

export function getEnhancedSpeechService(onStateChange?: (isPlaying: boolean) => void): EnhancedSpeechService {
  if (!speechService) {
    speechService = new EnhancedSpeechService(onStateChange);
  }
  return speechService;
}

// Hook for React components
export function useEnhancedSpeech() {
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [availableVoices, setAvailableVoices] = React.useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = React.useState<SpeechSynthesisVoice | null>(null);
  const [speechRate, setSpeechRate] = React.useState(1.0);

  const speechService = React.useMemo(() => 
    getEnhancedSpeechService(setIsPlaying), 
    []
  );

  React.useEffect(() => {
    const loadVoices = () => {
      const voices = speechService.getAvailableVoices();
      setAvailableVoices(voices);
      
      if (!selectedVoice && voices.length > 0) {
        const recommended = speechService.getRecommendedVoice();
        setSelectedVoice(recommended || voices[0]);
      }
    };

    loadVoices();
    speechSynthesis.addEventListener('voiceschanged', loadVoices);

    return () => {
      speechSynthesis.removeEventListener('voiceschanged', loadVoices);
    };
  }, [speechService, selectedVoice]);

  const speak = React.useCallback((text: string) => {
    return speechService.speak(text, {
      voice: selectedVoice || undefined,
      rate: speechRate,
      naturalPauses: true,
      punctuationEmphasis: true
    });
  }, [speechService, selectedVoice, speechRate]);

  const speakInChunks = React.useCallback((text: string) => {
    return speechService.speakInChunks(text, {
      voice: selectedVoice || undefined,
      rate: speechRate,
      naturalPauses: true,
      punctuationEmphasis: true
    });
  }, [speechService, selectedVoice, speechRate]);

  return {
    speak,
    speakInChunks,
    pause: speechService.pause.bind(speechService),
    resume: speechService.resume.bind(speechService),
    stop: speechService.stop.bind(speechService),
    isPlaying,
    availableVoices,
    selectedVoice,
    setSelectedVoice,
    speechRate,
    setSpeechRate
  };
}
