// lib/enhancedSpeech.ts
"use client";

export interface VoiceOption {
  name: string;
  lang: string;
  gender?: 'male' | 'female';
  quality: 'standard' | 'premium' | 'neural';
  description?: string;
  voice: SpeechSynthesisVoice;
}

export interface SpeechSettings {
  voice: SpeechSynthesisVoice | null;
  rate: number;
  pitch: number;
  volume: number;
  autoSpeak: boolean;
  highlightWords: boolean;
}

export class EnhancedSpeechService {
  private static instance: EnhancedSpeechService;
  private voices: VoiceOption[] = [];
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private isInitialized = false;
  private listeners: Set<() => void> = new Set();

  static getInstance(): EnhancedSpeechService {
    if (!EnhancedSpeechService.instance) {
      EnhancedSpeechService.instance = new EnhancedSpeechService();
    }
    return EnhancedSpeechService.instance;
  }

  private constructor() {
    if (typeof window !== 'undefined') {
      this.initializeVoices();
      speechSynthesis.addEventListener('voiceschanged', () => this.initializeVoices());
    }
  }

  private initializeVoices() {
    const systemVoices = speechSynthesis.getVoices();
    
    this.voices = systemVoices
      .filter(voice => voice.lang.startsWith('en'))
      .map(voice => {
        const isNeural = voice.name.toLowerCase().includes('neural') || 
                        voice.name.toLowerCase().includes('premium') ||
                        voice.name.toLowerCase().includes('enhanced');
        
        const isPremium = voice.name.toLowerCase().includes('premium') ||
                         voice.name.toLowerCase().includes('pro') ||
                         voice.localService === false;

        const gender = this.detectGender(voice.name);
        
        return {
          name: voice.name,
          lang: voice.lang,
          gender,
          quality: isNeural ? 'neural' : isPremium ? 'premium' : 'standard',
          description: this.getVoiceDescription(voice),
          voice
        };
      })
      .sort((a, b) => {
        // Sort by quality (neural > premium > standard), then by name
        const qualityOrder = { neural: 3, premium: 2, standard: 1 };
        const qualityDiff = qualityOrder[b.quality] - qualityOrder[a.quality];
        if (qualityDiff !== 0) return qualityDiff;
        return a.name.localeCompare(b.name);
      });

    this.isInitialized = true;
    this.notifyListeners();
  }

  private detectGender(voiceName: string): 'male' | 'female' | undefined {
    const name = voiceName.toLowerCase();
    
    // Common patterns for gender detection
    const femalePatterns = ['female', 'woman', 'girl', 'samantha', 'alex', 'victoria', 'karen', 'susan', 'allison', 'ava', 'serena', 'zoe'];
    const malePatterns = ['male', 'man', 'boy', 'daniel', 'tom', 'fred', 'ralph', 'albert', 'bruce', 'aaron', 'oliver'];
    
    if (femalePatterns.some(pattern => name.includes(pattern))) return 'female';
    if (malePatterns.some(pattern => name.includes(pattern))) return 'male';
    
    return undefined;
  }

  private getVoiceDescription(voice: SpeechSynthesisVoice): string {
    const parts = [];
    
    if (voice.localService) {
      parts.push('Local');
    } else {
      parts.push('Cloud');
    }
    
    if (voice.name.toLowerCase().includes('neural')) {
      parts.push('Neural');
    } else if (voice.name.toLowerCase().includes('premium')) {
      parts.push('Premium');
    }
    
    const gender = this.detectGender(voice.name);
    if (gender) {
      parts.push(gender.charAt(0).toUpperCase() + gender.slice(1));
    }
    
    return parts.join(' • ');
  }

  getVoices(): VoiceOption[] {
    return this.voices;
  }

  getBestVoices(): VoiceOption[] {
    // Return top 5 highest quality voices
    return this.voices.slice(0, 5);
  }

  getVoicesByGender(gender: 'male' | 'female'): VoiceOption[] {
    return this.voices.filter(v => v.gender === gender);
  }

  findVoiceByName(name: string): VoiceOption | null {
    return this.voices.find(v => v.name === name) || null;
  }

  speak(
    text: string, 
    settings: Partial<SpeechSettings> = {},
    onWordBoundary?: (word: string, charIndex: number) => void,
    onEnd?: () => void,
    onError?: (error: SpeechSynthesisErrorEvent) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.stop(); // Stop any current speech
      
      if (!text.trim()) {
        resolve();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      
      // Apply settings
      if (settings.voice) {
        utterance.voice = settings.voice;
      }
      
      utterance.rate = settings.rate ?? 1.0;
      utterance.pitch = settings.pitch ?? 1.0;
      utterance.volume = settings.volume ?? 1.0;
      
      // Enhanced event handlers
      utterance.onstart = () => {
        console.log('🎵 Speech started');
      };
      
      utterance.onend = () => {
        console.log('🎵 Speech ended');
        this.currentUtterance = null;
        onEnd?.();
        resolve();
      };
      
      utterance.onerror = (event) => {
        console.error('🎵 Speech error:', event);
        this.currentUtterance = null;
        onError?.(event);
        reject(event);
      };
      
      utterance.onpause = () => {
        console.log('🎵 Speech paused');
      };
      
      utterance.onresume = () => {
        console.log('🎵 Speech resumed');
      };
      
      // Word boundary events for highlighting
      if (onWordBoundary) {
        utterance.onboundary = (event) => {
          if (event.name === 'word') {
            const word = text.substring(event.charIndex, event.charIndex + event.charLength);
            onWordBoundary(word, event.charIndex);
          }
        };
      }
      
      this.currentUtterance = utterance;
      speechSynthesis.speak(utterance);
    });
  }

  stop(): void {
    if (this.currentUtterance) {
      speechSynthesis.cancel();
      this.currentUtterance = null;
    }
  }

  pause(): void {
    if (this.isSpeaking()) {
      speechSynthesis.pause();
    }
  }

  resume(): void {
    if (this.isPaused()) {
      speechSynthesis.resume();
    }
  }

  isSpeaking(): boolean {
    return speechSynthesis.speaking && !speechSynthesis.paused;
  }

  isPaused(): boolean {
    return speechSynthesis.paused;
  }

  isInitialized(): boolean {
    return this.isInitialized;
  }

  // Enhanced text processing for better speech
  preprocessText(text: string): string {
    return text
      // Add pauses for better pacing
      .replace(/([.!?])\s+/g, '$1 <break time="500ms"/> ')
      .replace(/([,;:])\s+/g, '$1 <break time="200ms"/> ')
      // Expand common abbreviations
      .replace(/\be\.g\./gi, 'for example')
      .replace(/\bi\.e\./gi, 'that is')
      .replace(/\betc\./gi, 'etcetera')
      .replace(/\bvs\./gi, 'versus')
      .replace(/\bdr\./gi, 'doctor')
      .replace(/\bmr\./gi, 'mister')
      .replace(/\bms\./gi, 'miss')
      // Handle numbers and symbols better
      .replace(/\b(\d+)%/g, '$1 percent')
      .replace(/\b(\d+)°/g, '$1 degrees')
      .replace(/\$/g, 'dollars')
      .replace(/&/g, 'and')
      // Clean up extra whitespace
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Chunk text for better speech pacing
  chunkTextForSpeech(text: string, maxChunkLength: number = 200): string[] {
    const sentences = text.split(/(?<=[.!?])\s+/);
    const chunks: string[] = [];
    let currentChunk = '';
    
    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length <= maxChunkLength) {
        currentChunk += (currentChunk ? ' ' : '') + sentence;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk);
        }
        currentChunk = sentence;
      }
    }
    
    if (currentChunk) {
      chunks.push(currentChunk);
    }
    
    return chunks;
  }

  // Advanced speech with word highlighting
  async speakWithHighlighting(
    text: string,
    settings: Partial<SpeechSettings> = {},
    onWordHighlight?: (word: string, startIndex: number, endIndex: number) => void,
    onComplete?: () => void
  ): Promise<void> {
    const processedText = this.preprocessText(text);
    const chunks = this.chunkTextForSpeech(processedText, 300);
    
    let globalCharIndex = 0;
    
    for (const chunk of chunks) {
      await this.speak(
        chunk,
        settings,
        (word, charIndex) => {
          const globalStart = globalCharIndex + charIndex;
          const globalEnd = globalStart + word.length;
          onWordHighlight?.(word, globalStart, globalEnd);
        }
      );
      globalCharIndex += chunk.length + 1; // +1 for space between chunks
    }
    
    onComplete?.();
  }

  // Event listener management
  addListener(callback: () => void): void {
    this.listeners.add(callback);
  }

  removeListener(callback: () => void): void {
    this.listeners.delete(callback);
  }

  private notifyListeners(): void {
    this.listeners.forEach(callback => callback());
  }

  // Get recommended settings for different use cases
  getRecommendedSettings(useCase: 'reading' | 'explanation' | 'quick'): Partial<SpeechSettings> {
    const bestVoice = this.getBestVoices()[0]?.voice || null;
    
    switch (useCase) {
      case 'reading':
        return {
          voice: bestVoice,
          rate: 0.9,
          pitch: 1.0,
          volume: 0.8,
          highlightWords: true
        };
      case 'explanation':
        return {
          voice: bestVoice,
          rate: 0.8,
          pitch: 1.1,
          volume: 0.9,
          highlightWords: true
        };
      case 'quick':
        return {
          voice: bestVoice,
          rate: 1.3,
          pitch: 1.0,
          volume: 0.7,
          highlightWords: false
        };
      default:
        return {
          voice: bestVoice,
          rate: 1.0,
