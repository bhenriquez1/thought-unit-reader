// lib/enhancedSpeech.ts
"use client";

// Import Butler Speech Engine for smart speech understanding
import { 
  butlerSpeechEngine,
  type ButlerHighlight,
  type SpeechMode,
  type ButlerSpeechOptions,
  DEFAULT_BUTLER_SPEECH
} from './butlerSpeechEngine';
import { 
  analyzeTextWithButler,
  getReadableContent,
  type ButlerAnalysisResult 
} from './butlerThoughtUnits';

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
  speechMode?: SpeechMode; // Add Butler speech mode
  useButlerAnalysis?: boolean; // Enable Butler smart speech
}

export class EnhancedSpeechService {
  private static instance: EnhancedSpeechService;
  private voices: VoiceOption[] = [];
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private initialized = false;
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
          quality: (isNeural ? 'neural' : isPremium ? 'premium' : 'standard') as 'standard' | 'premium' | 'neural',
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

    this.initialized = true;
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
    const parts: string[] = [];
    
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
    return this.initialized;
  }

  // Enhanced text processing for better speech with comprehensive grammar and natural language processing
  preprocessText(text: string, options: { mode?: 'reading' | 'explanation' | 'study' } = {}): string {
    const mode = options.mode || 'reading';
    
    let processedText = text;
    
    // Phase 1: Grammar correction and normalization
    processedText = this.correctGrammar(processedText);
    
    // Phase 2: Academic and technical text processing
    processedText = this.processAcademicText(processedText);
    
    // Phase 3: Natural language enhancement
    processedText = this.enhanceNaturalLanguage(processedText, mode);
    
    // Phase 4: SSML and prosody enhancement
    processedText = this.addProsodyControls(processedText, mode);
    
    return processedText;
  }

  private correctGrammar(text: string): string {
    return text
      // Fix common sentence structure issues
      .replace(/([a-z])([A-Z])/g, '$1. $2') // Add periods between sentences
      .replace(/\s+([.!?])/g, '$1') // Remove spaces before punctuation
      .replace(/([.!?])([a-zA-Z])/g, '$1 $2') // Add space after punctuation
      .replace(/([,;:])([a-zA-Z])/g, '$1 $2') // Add space after commas, semicolons, colons
      
      // Fix capitalization
      .replace(/^([a-z])/gm, (match) => match.toUpperCase()) // Capitalize first letter of lines
      .replace(/([.!?]\s+)([a-z])/g, (match, p1, p2) => p1 + p2.toUpperCase()) // Capitalize after periods
      
      // Fix common punctuation issues
      .replace(/\s*,\s*,\s*/g, ', ') // Fix double commas
      .replace(/\s*\.\s*\.\s*/g, '. ') // Fix double periods
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  private processAcademicText(text: string): string {
    return text
      // Academic abbreviations and references
      .replace(/\bFig\.?\s*(\d+(?:\.\d+)?)/gi, 'Figure $1')
      .replace(/\bTable\.?\s*(\d+(?:\.\d+)?)/gi, 'Table $1')
      .replace(/\bCh\.?\s*(\d+)/gi, 'Chapter $1')
      .replace(/\bSec\.?\s*(\d+(?:\.\d+)?)/gi, 'Section $1')
      .replace(/\bEq\.?\s*(\d+(?:\.\d+)?)/gi, 'Equation $1')
      .replace(/\bRef\.?\s*(\d+)/gi, 'Reference $1')
      .replace(/\bpp\.?\s*(\d+)/gi, 'pages $1')
      .replace(/\bp\.?\s*(\d+)/gi, 'page $1')
      
      // Author citations
      .replace(/\b(\w+)\s+et\s+al\.?/gi, '$1 and colleagues')
      .replace(/\b(\w+)\s*&\s*(\w+)/g, '$1 and $2')
      
      // Common academic abbreviations
      .replace(/\be\.g\./gi, 'for example')
      .replace(/\bi\.e\./gi, 'that is')
      .replace(/\betc\./gi, 'and so forth')
      .replace(/\bvs\.?/gi, 'versus')
      .replace(/\bcf\.?/gi, 'compare')
      .replace(/\bviz\.?/gi, 'namely')
      .replace(/\bN\.B\.?/gi, 'note well')
      .replace(/\bQ\.E\.D\.?/gi, 'which was to be demonstrated')
      
      // Scientific notation and formulas
      .replace(/\bH2O\b/g, 'water')
      .replace(/\bCO2\b/g, 'carbon dioxide')
      .replace(/\bO2\b/g, 'oxygen')
      .replace(/\bN2\b/g, 'nitrogen')
      .replace(/\bNaCl\b/g, 'sodium chloride')
      .replace(/\bDNA\b/g, 'D-N-A')
      .replace(/\bRNA\b/g, 'R-N-A')
      .replace(/\bATP\b/g, 'A-T-P')
      
      // Mathematical expressions
      .replace(/\b(\d+(?:\.\d+)?)\s*±\s*(\d+(?:\.\d+)?)/g, '$1, plus or minus $2')
      .replace(/\b(\d+(?:\.\d+)?)\s*×\s*(\d+(?:\.\d+)?)/g, '$1 times $2')
      .replace(/\b(\d+(?:\.\d+)?)\s*÷\s*(\d+(?:\.\d+)?)/g, '$1 divided by $2')
      .replace(/\b(\d+(?:\.\d+)?)\s*≈\s*(\d+(?:\.\d+)?)/g, '$1 approximately equals $2')
      .replace(/\b(\d+(?:\.\d+)?)\s*≤\s*(\d+(?:\.\d+)?)/g, '$1 is less than or equal to $2')
      .replace(/\b(\d+(?:\.\d+)?)\s*≥\s*(\d+(?:\.\d+)?)/g, '$1 is greater than or equal to $2')
      .replace(/\b(\d+(?:\.\d+)?)\s*<\s*(\d+(?:\.\d+)?)/g, '$1 is less than $2')
      .replace(/\b(\d+(?:\.\d+)?)\s*>\s*(\d+(?:\.\d+)?)/g, '$1 is greater than $2')
      
      // Statistical notation
      .replace(/\bn\s*=\s*(\d+)/gi, 'n equals $1')
      .replace(/\bp\s*<\s*(\d+(?:\.\d+)?)/gi, 'p less than $1')
      .replace(/\bp\s*>\s*(\d+(?:\.\d+)?)/gi, 'p greater than $1')
      .replace(/\br\s*=\s*(\d+(?:\.\d+)?)/gi, 'r equals $1')
      
      // Units and measurements
      .replace(/\b(\d+(?:\.\d+)?)\s*mm\b/g, '$1 millimeters')
      .replace(/\b(\d+(?:\.\d+)?)\s*cm\b/g, '$1 centimeters')
      .replace(/\b(\d+(?:\.\d+)?)\s*m\b/g, '$1 meters')
      .replace(/\b(\d+(?:\.\d+)?)\s*km\b/g, '$1 kilometers')
      .replace(/\b(\d+(?:\.\d+)?)\s*mg\b/g, '$1 milligrams')
      .replace(/\b(\d+(?:\.\d+)?)\s*g\b/g, '$1 grams')
      .replace(/\b(\d+(?:\.\d+)?)\s*kg\b/g, '$1 kilograms')
      .replace(/\b(\d+(?:\.\d+)?)\s*ml\b/g, '$1 milliliters')
      .replace(/\b(\d+(?:\.\d+)?)\s*l\b/g, '$1 liters')
      .replace(/\b(\d+(?:\.\d+)?)\s*°C\b/g, '$1 degrees Celsius')
      .replace(/\b(\d+(?:\.\d+)?)\s*°F\b/g, '$1 degrees Fahrenheit')
      .replace(/\b(\d+(?:\.\d+)?)\s*K\b/g, '$1 Kelvin')
      
      // Percentages and symbols
      .replace(/\b(\d+(?:\.\d+)?)\s*%/g, '$1 percent')
      .replace(/\b(\d+(?:\.\d+)?)\s*°/g, '$1 degrees')
      .replace(/\$/g, 'dollars')
      .replace(/&/g, 'and')
      .replace(/@/g, 'at')
      .replace(/#/g, 'number');
  }

  private enhanceNaturalLanguage(text: string, mode: string): string {
    let enhanced = text;
    
    // Add transitional phrases for better flow
    enhanced = enhanced
      .replace(/\bHowever,/g, 'However,')
      .replace(/\bTherefore,/g, 'Therefore,')
      .replace(/\bFurthermore,/g, 'Furthermore,')
      .replace(/\bMoreover,/g, 'Moreover,')
      .replace(/\bNevertheless,/g, 'Nevertheless,')
      .replace(/\bConsequently,/g, 'Consequently,')
      .replace(/\bIn contrast,/g, 'In contrast,')
      .replace(/\bAs a result,/g, 'As a result,')
      .replace(/\bOn the other hand,/g, 'On the other hand,')
      .replace(/\bIn addition,/g, 'In addition,');
    
    // Remove redundant phrases
    enhanced = enhanced
      .replace(/\b(very|really|quite|rather|extremely)\s+(very|really|quite|rather|extremely)\s+/gi, '$1 ')
      .replace(/\b(the|a|an)\s+(the|a|an)\s+/gi, '$1 ')
      .replace(/\bthat\s+that\b/gi, 'that')
      .replace(/\bwhich\s+which\b/gi, 'which');
    
    // Enhance clarity based on mode
    if (mode === 'explanation') {
      enhanced = enhanced
        .replace(/\bThis\b/g, 'This concept')
        .replace(/\bThat\b/g, 'That idea')
        .replace(/\bIt\b/g, 'This');
    }
    
    return enhanced;
  }

  private addProsodyControls(text: string, mode: string): string {
    let prosodyText = text;
    
    // Add contextual pauses based on punctuation and content
    prosodyText = prosodyText
      .replace(/([.!?])\s+/g, '$1 <break time="700ms"/> ')
      .replace(/([,;:])\s+/g, '$1 <break time="300ms"/> ')
      .replace(/(\w+)\s*-\s*(\w+)/g, '$1 <break time="200ms"/> $2') // Dashes
      .replace(/\s*\(\s*/g, ' <break time="200ms"/> <prosody rate="0.9">(')
      .replace(/\s*\)\s*/g, ')</prosody> <break time="200ms"/> ');
    
    // Add emphasis for key terms and concepts
    prosodyText = prosodyText
      .replace(/\b(important|significant|crucial|essential|critical|key|major|primary|fundamental)\b/gi, 
               '<emphasis level="moderate">$1</emphasis>')
      .replace(/\b(however|therefore|furthermore|moreover|consequently|nevertheless)\b/gi, 
               '<emphasis level="moderate">$1</emphasis>')
      .replace(/\b(first|second|third|finally|lastly|in conclusion)\b/gi, 
               '<emphasis level="strong">$1</emphasis>');
    
    // Adjust rate based on content complexity and mode
    if (mode === 'study') {
      prosodyText = `<prosody rate="0.85">${prosodyText}</prosody>`;
    } else if (mode === 'explanation') {
      prosodyText = `<prosody rate="0.9" pitch="+5%">${prosodyText}</prosody>`;
    }
    
    // Add breathing pauses for long passages
    const sentences = prosodyText.split(/(?<=[.!?])\s+/);
    if (sentences.length > 3) {
      const midPoint = Math.floor(sentences.length / 2);
      sentences[midPoint] = sentences[midPoint] + ' <break time="1s"/>';
      prosodyText = sentences.join(' ');
    }
    
    return prosodyText;
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
          pitch: 1.0,
          volume: 0.8,
          highlightWords: false
        };
    }
  }
}
