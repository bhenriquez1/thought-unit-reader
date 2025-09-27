/**
 * Butler-Style Speech Engine
 * Smart content selection with natural human-like voice synthesis
 * Inspired by David Butler's "Reading with the Right Brain" methodology
 */

export type SpeechMode = 'smart' | 'full';
export type SpeechPriority = 'gold' | 'blue' | 'green' | 'gray';

export interface ButlerHighlight {
  id: string;
  text: string;
  importance: SpeechPriority;
  type: 'main-idea' | 'supporting-concept' | 'definition' | 'process' | 'relationship' | 'fluff';
  confidence: number;
  startIndex: number;
  endIndex: number;
  color: string;
  shouldRead: boolean;
}

export interface SpeechContent {
  primaryIdeas: ButlerHighlight[];
  supportingConcepts: ButlerHighlight[];
  keyTerms: ButlerHighlight[];
  processSteps: ButlerHighlight[];
  definitions: ButlerHighlight[];
  fluffContent: ButlerHighlight[];
}

export interface ButlerSpeechOptions {
  mode: SpeechMode;
  voice?: SpeechSynthesisVoice;
  rate: number;
  pitch: number;
  volume: number;
  naturalPausing: boolean;
  emphasizeKeyTerms: boolean;
  conversationalTone: boolean;
}

// Default Butler speech settings for natural human-like voice
export const DEFAULT_BUTLER_SPEECH: ButlerSpeechOptions = {
  mode: 'smart',
  rate: 0.85, // Slightly slower than robotic default
  pitch: 1.1, // Slightly higher pitch for clarity
  volume: 0.9, // Natural volume
  naturalPausing: true,
  emphasizeKeyTerms: true,
  conversationalTone: true
};

/**
 * Butler Speech Engine Class
 */
export class ButlerSpeechEngine {
  private availableVoices: SpeechSynthesisVoice[] = [];
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private isInitialized = false;

  constructor() {
    this.initializeVoices();
  }

  private async initializeVoices(): Promise<void> {
    return new Promise((resolve) => {
      const loadVoices = () => {
        this.availableVoices = speechSynthesis.getVoices();
        this.isInitialized = true;
        resolve();
      };

      if (speechSynthesis.getVoices().length > 0) {
        loadVoices();
      } else {
        speechSynthesis.addEventListener('voiceschanged', loadVoices, { once: true });
      }
    });
  }

  /**
   * Get the best natural-sounding voice for Butler speech
   */
  public getBestVoice(): SpeechSynthesisVoice | null {
    if (!this.isInitialized || this.availableVoices.length === 0) {
      return null;
    }

    // Prioritize natural-sounding English voices
    const preferredVoices = [
      'Microsoft Zira Desktop', // Windows
      'Google US English', // Chrome
      'Alex', // macOS
      'Samantha', // macOS
      'Karen', // macOS
      'Daniel', // macOS (UK)
    ];

    // First try preferred voices
    for (const voiceName of preferredVoices) {
      const voice = this.availableVoices.find(v => 
        v.name.includes(voiceName) && v.lang.startsWith('en')
      );
      if (voice) return voice;
    }

    // Fallback to any English voice that sounds natural
    const englishVoices = this.availableVoices.filter(v => 
      v.lang.startsWith('en') && 
      !v.name.toLowerCase().includes('eSpeak') // Avoid robotic voices
    );

    // Prefer female voices (often sound more natural)
    const femaleVoices = englishVoices.filter(v => 
      v.name.toLowerCase().includes('female') ||
      v.name.includes('Zira') ||
      v.name.includes('Samantha') ||
      v.name.includes('Karen')
    );

    if (femaleVoices.length > 0) {
      return femaleVoices[0];
    }

    return englishVoices[0] || null;
  }

  /**
   * Extract essential content for Butler smart speech
   */
  public extractEssentialSpeechContent(
    text: string, 
    highlights: ButlerHighlight[], 
    mode: SpeechMode
  ): SpeechContent {
    const content: SpeechContent = {
      primaryIdeas: [],
      supportingConcepts: [],
      keyTerms: [],
      processSteps: [],
      definitions: [],
      fluffContent: []
    };

    // Categorize highlights by type
    highlights.forEach(highlight => {
      switch (highlight.type) {
        case 'main-idea':
          content.primaryIdeas.push(highlight);
          break;
        case 'supporting-concept':
          content.supportingConcepts.push(highlight);
          break;
        case 'definition':
          content.definitions.push(highlight);
          break;
        case 'process':
          content.processSteps.push(highlight);
          break;
        case 'relationship':
          content.keyTerms.push(highlight);
          break;
        default:
          content.fluffContent.push(highlight);
      }
    });

    // Filter based on speech mode
    if (mode === 'smart') {
      // Only include Gold and Blue content
      content.primaryIdeas = content.primaryIdeas.filter(h => 
        h.importance === 'gold' && h.confidence >= 0.7
      );
      content.supportingConcepts = content.supportingConcepts.filter(h => 
        h.importance === 'blue' && h.confidence >= 0.6
      );
      content.definitions = content.definitions.filter(h => 
        h.importance === 'green' && h.confidence >= 0.8
      );
      // Clear fluff content for smart mode
      content.fluffContent = [];
    }

    // Sort by confidence within each category
    Object.values(content).forEach(category => {
      if (Array.isArray(category)) {
        category.sort((a, b) => b.confidence - a.confidence);
      }
    });

    return content;
  }

  /**
   * Format text for natural speech delivery with pauses and emphasis
   */
  public formatForNaturalSpeech(content: SpeechContent, options: ButlerSpeechOptions): string {
    const parts: string[] = [];

    // Primary ideas first (most important)
    if (content.primaryIdeas.length > 0) {
      content.primaryIdeas.forEach((idea, index) => {
        let text = idea.text.trim();
        
        if (options.emphasizeKeyTerms) {
          text = this.addEmphasisMarkers(text);
        }
        
        parts.push(text);
        
        // Add natural pause after each primary idea
        if (options.naturalPausing && index < content.primaryIdeas.length - 1) {
          parts.push('...');
        }
      });
    }

    // Supporting concepts (if any)
    if (content.supportingConcepts.length > 0) {
      if (parts.length > 0) parts.push('...'); // Pause before supporting content
      
      content.supportingConcepts.forEach((concept, index) => {
        let text = concept.text.trim();
        
        if (options.emphasizeKeyTerms) {
          text = this.addEmphasisMarkers(text);
        }
        
        parts.push(text);
        
        if (options.naturalPausing && index < content.supportingConcepts.length - 1) {
          parts.push('...');
        }
      });
    }

    // Key definitions (if in full mode)
    if (options.mode === 'full' && content.definitions.length > 0) {
      if (parts.length > 0) parts.push('...'); // Pause before definitions
      
      content.definitions.slice(0, 3).forEach((definition, index) => { // Limit to top 3
        let text = definition.text.trim();
        
        if (options.emphasizeKeyTerms) {
          text = this.addEmphasisMarkers(text);
        }
        
        parts.push(text);
        
        if (options.naturalPausing && index < Math.min(content.definitions.length, 3) - 1) {
          parts.push('...');
        }
      });
    }

    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }

  /**
   * Add SSML-style emphasis markers for key terms
   */
  private addEmphasisMarkers(text: string): string {
    // Key terms that should be emphasized
    const emphasisPatterns = [
      /\b(important|essential|critical|vital|key|main|primary|fundamental)\b/gi,
      /\b(remember|note|understand|realize|recognize)\b/gi,
      /\b(definition|meaning|refers to|means that)\b/gi,
      /\b(process|method|technique|approach|strategy)\b/gi,
      /\b(because|therefore|thus|consequently|as a result)\b/gi
    ];

    let emphasizedText = text;
    
    emphasisPatterns.forEach(pattern => {
      emphasizedText = emphasizedText.replace(pattern, (match) => {
        // Add slight pause before and after emphasized words
        return ` ${match} `;
      });
    });

    return emphasizedText;
  }

  /**
   * Create natural speech synthesis utterance
   */
  public createNaturalSpeechUtterance(
    speechText: string, 
    options: ButlerSpeechOptions
  ): SpeechSynthesisUtterance {
    const utterance = new SpeechSynthesisUtterance(speechText);
    
    // Apply Butler-style natural settings
    utterance.rate = options.rate;
    utterance.pitch = options.pitch;
    utterance.volume = options.volume;
    
    // Use best available natural voice
    const bestVoice = options.voice || this.getBestVoice();
    if (bestVoice) {
      utterance.voice = bestVoice;
    }

    return utterance;
  }

  /**
   * Speak content using Butler methodology
   */
  public async speakButlerStyle(
    text: string,
    highlights: ButlerHighlight[],
    options: Partial<ButlerSpeechOptions> = {}
  ): Promise<void> {
    const speechOptions: ButlerSpeechOptions = {
      ...DEFAULT_BUTLER_SPEECH,
      ...options
    };

    // Stop any current speech
    this.stop();

    // Wait for voices to be loaded
    if (!this.isInitialized) {
      await this.initializeVoices();
    }

    // Extract content based on mode
    const speechContent = this.extractEssentialSpeechContent(text, highlights, speechOptions.mode);
    
    // Format for natural delivery
    const speechText = this.formatForNaturalSpeech(speechContent, speechOptions);
    
    if (!speechText.trim()) {
      console.warn('No content to speak in Butler mode');
      return;
    }

    // Create and speak utterance
    this.currentUtterance = this.createNaturalSpeechUtterance(speechText, speechOptions);
    
    return new Promise((resolve, reject) => {
      if (!this.currentUtterance) {
        reject(new Error('Failed to create speech utterance'));
        return;
      }

      this.currentUtterance.onend = () => {
        this.currentUtterance = null;
        resolve();
      };
      
      this.currentUtterance.onerror = (event) => {
        this.currentUtterance = null;
        reject(new Error(`Speech synthesis error: ${event.error}`));
      };
      
      speechSynthesis.speak(this.currentUtterance);
    });
  }

  /**
   * Stop current speech
   */
  public stop(): void {
    if (this.currentUtterance) {
      speechSynthesis.cancel();
      this.currentUtterance = null;
    }
  }

  /**
   * Check if currently speaking
   */
  public isSpeaking(): boolean {
    return speechSynthesis.speaking;
  }

  /**
   * Get available voices for selection
   */
  public getAvailableVoices(): SpeechSynthesisVoice[] {
    return this.availableVoices.filter(voice => voice.lang.startsWith('en'));
  }

  /**
   * Generate speech content preview (for testing)
   */
  public previewSpeechContent(
    text: string,
    highlights: ButlerHighlight[],
    mode: SpeechMode
  ): { smartContent: string; fullContent: string; highlightCount: number } {
    const smartContent = this.extractEssentialSpeechContent(text, highlights, 'smart');
    const fullContent = this.extractEssentialSpeechContent(text, highlights, 'full');
    
    const smartText = this.formatForNaturalSpeech(smartContent, { ...DEFAULT_BUTLER_SPEECH, mode: 'smart' });
    const fullText = this.formatForNaturalSpeech(fullContent, { ...DEFAULT_BUTLER_SPEECH, mode: 'full' });
    
    return {
      smartContent: smartText,
      fullContent: fullText,
      highlightCount: highlights.length
    };
  }
}

// Export singleton instance
export const butlerSpeechEngine = new ButlerSpeechEngine();

// Export utility functions
export function createButlerHighlight(
  text: string,
  type: ButlerHighlight['type'],
  importance: SpeechPriority,
  confidence: number,
  startIndex: number,
  endIndex: number
): ButlerHighlight {
  const colors = {
    gold: '#FFD700',
    blue: '#87CEEB',
    green: '#98FB98',
    gray: '#9CA3AF'
  };

  return {
    id: `highlight-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    text: text.trim(),
    importance,
    type,
    confidence,
    startIndex,
    endIndex,
    color: colors[importance],
    shouldRead: importance !== 'gray' && confidence > 0.5
  };
}

export function getImportanceFromConfidence(confidence: number): SpeechPriority {
  if (confidence >= 0.8) return 'gold';
  if (confidence >= 0.6) return 'blue';
  if (confidence >= 0.4) return 'green';
  return 'gray';
}
