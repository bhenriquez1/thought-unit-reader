/**
 * Butler-Style Thought Unit Analysis System
 * Precise main idea identification with fluff filtering
 * Based on David Butler's "Reading with the Right Brain" methodology
 */

import { 
  ButlerHighlight, 
  SpeechPriority, 
  createButlerHighlight, 
  getImportanceFromConfidence 
} from './butlerSpeechEngine';

export interface FluffPattern {
  pattern: RegExp;
  description: string;
  confidence: number;
  replacement?: string;
}

export interface MainIdeaPattern {
  pattern: RegExp;
  weight: number;
  description: string;
  type: 'main-idea' | 'supporting-concept' | 'definition' | 'process' | 'relationship';
}

export interface ButlerAnalysisResult {
  highlights: ButlerHighlight[];
  mainIdeas: ButlerHighlight[];
  supportingConcepts: ButlerHighlight[];
  definitions: ButlerHighlight[];
  processes: ButlerHighlight[];
  relationships: ButlerHighlight[];
  fluffContent: ButlerHighlight[];
  cleanedText: string;
  comprehensionScore: number;
  readingTime: number;
}

/**
 * Fluff patterns that should be filtered or de-emphasized
 */
const FLUFF_PATTERNS: FluffPattern[] = [
  {
    pattern: /\b(it is important to understand that|we can see that|it should be noted|it is clear that|obviously|clearly|of course|naturally|surely)\b/gi,
    description: "Unnecessary filler phrases",
    confidence: 0.9,
    replacement: ""
  },
  {
    pattern: /\b(in my opinion|personally|i believe|i think|it seems to me)\b/gi,
    description: "Opinion markers in factual content",
    confidence: 0.8,
    replacement: ""
  },
  {
    pattern: /\b(as we all know|everyone knows|it goes without saying)\b/gi,
    description: "Assumed knowledge phrases",
    confidence: 0.9,
    replacement: ""
  },
  {
    pattern: /\b(to be honest|frankly|basically|essentially|actually)\b/gi,
    description: "Conversational filler",
    confidence: 0.7,
    replacement: ""
  },
  {
    pattern: /\b(the fact of the matter is|when all is said and done|at the end of the day)\b/gi,
    description: "Verbose connectors",
    confidence: 0.8,
    replacement: ""
  },
  {
    pattern: /\b(it is worth noting|it is interesting to note|it should be mentioned)\b/gi,
    description: "Note-taking fluff",
    confidence: 0.7,
    replacement: ""
  }
];

/**
 * Patterns for identifying main ideas and concepts
 */
const MAIN_IDEA_PATTERNS: MainIdeaPattern[] = [
  // Primary main ideas (Gold)
  {
    pattern: /\b(the main point|the key concept|the primary purpose|the central idea|the core principle|most importantly)\b/i,
    weight: 10,
    description: "Explicit main idea markers",
    type: "main-idea"
  },
  {
    pattern: /\b(in essence|fundamentally|the essence|the heart of)\b/i,
    weight: 9,
    description: "Essential concept markers",
    type: "main-idea"
  },
  {
    pattern: /\b(the main|the key|the primary|the central|the fundamental|the crucial)\b/i,
    weight: 7,
    description: "Main concept indicators",
    type: "main-idea"
  },
  {
    pattern: /^([^.!?]*(?:is|are|means|represents|defines)[^.!?]*[.!?])/gmi,
    weight: 8,
    description: "Definition sentences",
    type: "definition"
  },
  {
    pattern: /\b(hypothesis|thesis|argument|proposition|theory|principle)\b/i,
    weight: 8,
    description: "Academic concept markers",
    type: "main-idea"
  },

  // Supporting concepts (Blue)
  {
    pattern: /\b(because|since|due to|as a result|therefore|thus|hence|consequently)\b/i,
    weight: 6,
    description: "Causal relationships",
    type: "supporting-concept"
  },
  {
    pattern: /\b(for example|such as|including|like|specifically|namely|instance)\b/i,
    weight: 5,
    description: "Examples and elaborations",
    type: "supporting-concept"
  },
  {
    pattern: /\b(furthermore|moreover|additionally|also|besides|in addition)\b/i,
    weight: 4,
    description: "Additional information",
    type: "supporting-concept"
  },
  {
    pattern: /\b(research shows|studies indicate|evidence suggests|data reveals)\b/i,
    weight: 7,
    description: "Evidence-based statements",
    type: "supporting-concept"
  },

  // Processes (Purple)
  {
    pattern: /\b(process|procedure|method|technique|approach|system|mechanism|pathway)\b/i,
    weight: 7,
    description: "Process indicators",
    type: "process"
  },
  {
    pattern: /\b(first|second|third|next|then|finally|lastly|subsequently)\b/i,
    weight: 6,
    description: "Sequential steps",
    type: "process"
  },
  {
    pattern: /\b(occurs?|happens?|takes? place|develops?|functions?|operates?)\b/i,
    weight: 5,
    description: "Action/function indicators",
    type: "process"
  },

  // Relationships (Yellow/Khaki)
  {
    pattern: /\b(relationship|connection|link|association|correlation)\b/i,
    weight: 6,
    description: "Relationship indicators",
    type: "relationship"
  },
  {
    pattern: /\b(affects?|influences?|impacts?|interacts? with|relates to)\b/i,
    weight: 5,
    description: "Interaction indicators",
    type: "relationship"
  },
  {
    pattern: /\b(similar to|different from|compared to|unlike|in contrast|however)\b/i,
    weight: 5,
    description: "Comparison indicators",
    type: "relationship"
  }
];

/**
 * Butler Thought Unit Analyzer Class
 */
export class ButlerThoughtUnitAnalyzer {
  
  /**
   * Analyze text using Butler methodology
   */
  public analyzeText(text: string): ButlerAnalysisResult {
    const startTime = Date.now();
    
    // Step 1: Identify and mark fluff content
    const fluffAnalysis = this.identifyFluffContent(text);
    
    // Step 2: Extract main ideas and concepts
    const conceptAnalysis = this.extractMainIdeasAndConcepts(text);
    
    // Step 3: Analyze paragraph-level main ideas
    const paragraphAnalysis = this.analyzeParagraphMainIdeas(text);
    
    // Step 4: Combine and rank all highlights
    const allHighlights = [
      ...fluffAnalysis.fluffHighlights,
      ...conceptAnalysis.highlights,
      ...paragraphAnalysis.highlights
    ];
    
    // Step 5: Remove overlaps and optimize
    const optimizedHighlights = this.optimizeHighlights(allHighlights);
    
    // Step 6: Categorize highlights
    const categorized = this.categorizeHighlights(optimizedHighlights);
    
    // Step 7: Generate cleaned text
    const cleanedText = this.generateCleanedText(text, categorized.fluffContent);
    
    // Step 8: Calculate comprehension metrics
    const comprehensionScore = this.calculateComprehensionScore(categorized);
    const readingTime = this.estimateReadingTime(cleanedText);
    
    const processingTime = Date.now() - startTime;
    console.log(`🧠 Butler analysis completed in ${processingTime}ms`);
    
    return {
      highlights: optimizedHighlights,
      mainIdeas: categorized.mainIdeas,
      supportingConcepts: categorized.supportingConcepts,
      definitions: categorized.definitions,
      processes: categorized.processes,
      relationships: categorized.relationships,
      fluffContent: categorized.fluffContent,
      cleanedText,
      comprehensionScore,
      readingTime
    };
  }

  /**
   * Identify fluff content that should be filtered
   */
  private identifyFluffContent(text: string): { fluffHighlights: ButlerHighlight[]; fluffCount: number } {
    const fluffHighlights: ButlerHighlight[] = [];
    let fluffCount = 0;

    FLUFF_PATTERNS.forEach(fluffPattern => {
      let match;
      while ((match = fluffPattern.pattern.exec(text)) !== null) {
        fluffCount++;
        
        const highlight = createButlerHighlight(
          match[0],
          'fluff',
          'gray',
          fluffPattern.confidence,
          match.index,
          match.index + match[0].length
        );
        
        fluffHighlights.push(highlight);
      }
    });

    console.log(`🗑️ Identified ${fluffCount} fluff patterns`);
    return { fluffHighlights, fluffCount };
  }

  /**
   * Extract main ideas and concepts using patterns
   */
  private extractMainIdeasAndConcepts(text: string): { highlights: ButlerHighlight[] } {
    const highlights: ButlerHighlight[] = [];

    MAIN_IDEA_PATTERNS.forEach(pattern => {
      let match;
      while ((match = pattern.pattern.exec(text)) !== null) {
        const confidence = Math.min(pattern.weight / 10, 1.0);
        const importance = getImportanceFromConfidence(confidence);
        
        const highlight = createButlerHighlight(
          match[0],
          pattern.type,
          importance,
          confidence,
          match.index,
          match.index + match[0].length
        );
        
        highlights.push(highlight);
      }
    });

    return { highlights };
  }

  /**
   * Analyze each paragraph for main ideas (Butler's key insight)
   */
  private analyzeParagraphMainIdeas(text: string): { highlights: ButlerHighlight[] } {
    const highlights: ButlerHighlight[] = [];
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 50);

    paragraphs.forEach((paragraph, paragraphIndex) => {
      const sentences = paragraph.split(/[.!?]+/).filter(s => s.trim().length > 15);
      
      if (sentences.length === 0) return;

      // Analyze each sentence for main idea potential
      const sentenceScores = sentences.map((sentence, sentenceIndex) => ({
        sentence: sentence.trim(),
        index: sentenceIndex,
        score: this.scoreSentenceAsMainIdea(sentence, sentenceIndex, sentences.length),
        startIndex: text.indexOf(sentence.trim()),
        endIndex: text.indexOf(sentence.trim()) + sentence.trim().length
      }));

      // Sort by score and take the best candidate
      sentenceScores.sort((a, b) => b.score - a.score);
      const bestSentence = sentenceScores[0];

      if (bestSentence && bestSentence.score > 0.6) {
        const importance = getImportanceFromConfidence(bestSentence.score);
        
        const highlight = createButlerHighlight(
          bestSentence.sentence,
          'main-idea',
          importance,
          bestSentence.score,
          bestSentence.startIndex,
          bestSentence.endIndex
        );
        
        highlights.push(highlight);
      }
    });

    console.log(`📝 Analyzed ${paragraphs.length} paragraphs, found ${highlights.length} paragraph main ideas`);
    return { highlights };
  }

  /**
   * Score a sentence for main idea potential (Butler's approach)
   */
  private scoreSentenceAsMainIdea(
    sentence: string, 
    index: number, 
    totalSentences: number
  ): number {
    let score = 0;
    const lowerSentence = sentence.toLowerCase();
    const wordCount = sentence.split(/\s+/).length;

    // Position scoring (Butler principle: main ideas often at start or end)
    if (index === 0 && wordCount >= 8) {
      score += totalSentences > 3 ? 0.4 : 0.2;
    }
    if (index === totalSentences - 1 && wordCount >= 8) {
      score += 0.3;
    }

    // Length scoring (optimal range for main ideas)
    if (wordCount >= 8 && wordCount <= 25) {
      score += 0.3;
    } else if (wordCount >= 6 && wordCount <= 30) {
      score += 0.1;
    }

    // Content scoring
    const mainIdeaIndicators = [
      /\b(main|key|primary|central|important|essential|fundamental)\b/i,
      /\b(concept|principle|theory|idea|point)\b/i,
      /\b(is|are|means|represents|defines)\b/i,
      /\b(purpose|goal|objective|aim)\b/i
    ];

    mainIdeaIndicators.forEach(indicator => {
      if (indicator.test(sentence)) {
        score += 0.15;
      }
    });

    // Penalty for example/detail markers
    const detailPenalties = [
      /\b(for example|such as|specifically|namely|instance)\b/i,
      /\b(furthermore|moreover|additionally|also)\b/i,
      /\b(however|but|although|while|whereas)\b/i
    ];

    detailPenalties.forEach(penalty => {
      if (penalty.test(sentence)) {
        score -= 0.2;
      }
    });

    // Penalty for very short or very long sentences
    if (wordCount < 6) score -= 0.3;
    if (wordCount > 30) score -= 0.1;

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Remove overlapping highlights and optimize
   */
  private optimizeHighlights(highlights: ButlerHighlight[]): ButlerHighlight[] {
    // Sort by start index
    const sorted = highlights.sort((a, b) => a.startIndex - b.startIndex);
    const optimized: ButlerHighlight[] = [];

    for (const highlight of sorted) {
      // Check for overlaps with existing highlights
      const hasOverlap = optimized.some(existing => {
        const overlapStart = Math.max(existing.startIndex, highlight.startIndex);
        const overlapEnd = Math.min(existing.endIndex, highlight.endIndex);
        const overlapLength = Math.max(0, overlapEnd - overlapStart);
        const overlapRatio = overlapLength / Math.min(
          existing.endIndex - existing.startIndex,
          highlight.endIndex - highlight.startIndex
        );
        
        return overlapRatio > 0.5; // 50% overlap threshold
      });

      if (!hasOverlap) {
        optimized.push(highlight);
      }
    }

    return optimized;
  }

  /**
   * Categorize highlights by type
   */
  private categorizeHighlights(highlights: ButlerHighlight[]): {
    mainIdeas: ButlerHighlight[];
    supportingConcepts: ButlerHighlight[];
    definitions: ButlerHighlight[];
    processes: ButlerHighlight[];
    relationships: ButlerHighlight[];
    fluffContent: ButlerHighlight[];
  } {
    const categories = {
      mainIdeas: highlights.filter(h => h.type === 'main-idea'),
      supportingConcepts: highlights.filter(h => h.type === 'supporting-concept'),
      definitions: highlights.filter(h => h.type === 'definition'),
      processes: highlights.filter(h => h.type === 'process'),
      relationships: highlights.filter(h => h.type === 'relationship'),
      fluffContent: highlights.filter(h => h.type === 'fluff')
    };

    // Sort each category by confidence
    Object.values(categories).forEach(category => {
      category.sort((a, b) => b.confidence - a.confidence);
    });

    return categories;
  }

  /**
   * Generate cleaned text with fluff removed
   */
  private generateCleanedText(text: string, fluffHighlights: ButlerHighlight[]): string {
    let cleanedText = text;

    // Sort fluff highlights by start index in descending order (to avoid index shifting)
    const sortedFluff = fluffHighlights
      .filter(h => h.confidence > 0.8) // Only remove high-confidence fluff
      .sort((a, b) => b.startIndex - a.startIndex);

    // Remove fluff content
    sortedFluff.forEach(fluff => {
      const before = cleanedText.substring(0, fluff.startIndex);
      const after = cleanedText.substring(fluff.endIndex);
      cleanedText = before + after;
    });

    // Clean up extra whitespace
    cleanedText = cleanedText
      .replace(/\s+/g, ' ')
      .replace(/\s*\.\s*/g, '. ')
      .replace(/\s*,\s*/g, ', ')
      .trim();

    return cleanedText;
  }

  /**
   * Calculate comprehension score based on highlight quality
   */
  private calculateComprehensionScore(categories: {
    mainIdeas: ButlerHighlight[];
    supportingConcepts: ButlerHighlight[];
    definitions: ButlerHighlight[];
    processes: ButlerHighlight[];
    relationships: ButlerHighlight[];
    fluffContent: ButlerHighlight[];
  }): number {
    let score = 0;

    // Main ideas contribute most to comprehension
    score += categories.mainIdeas.length * 0.4;
    score += categories.supportingConcepts.length * 0.25;
    score += categories.definitions.length * 0.15;
    score += categories.processes.length * 0.1;
    score += categories.relationships.length * 0.1;

    // Penalty for too much fluff
    const fluffRatio = categories.fluffContent.length / 
      (categories.mainIdeas.length + categories.supportingConcepts.length + 1);
    score -= fluffRatio * 0.3;

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Estimate reading time for cleaned text
   */
  private estimateReadingTime(cleanedText: string): number {
    const wordCount = cleanedText.split(/\s+/).length;
    const averageWPM = 200; // Words per minute for average reader
    return Math.ceil(wordCount / averageWPM);
  }

  /**
   * Generate visual representation of highlights for debugging
   */
  public generateHighlightMap(text: string, highlights: ButlerHighlight[]): string {
    let visualText = text;
    const sortedHighlights = highlights.sort((a, b) => b.startIndex - a.startIndex);

    sortedHighlights.forEach(highlight => {
      const colorMap = {
        gold: '🟨',
        blue: '🟦',
        green: '🟩',
        gray: '⬜'
      };

      const marker = colorMap[highlight.importance as keyof typeof colorMap] || '◻️';
      const before = visualText.substring(0, highlight.startIndex);
      const content = visualText.substring(highlight.startIndex, highlight.endIndex);
      const after = visualText.substring(highlight.endIndex);
      
      visualText = before + `${marker}[${content}]${marker}` + after;
    });

    return visualText;
  }
}

// Export singleton instance
export const butlerThoughtUnitAnalyzer = new ButlerThoughtUnitAnalyzer();

// Export utility functions
export function analyzeTextWithButler(text: string): ButlerAnalysisResult {
  return butlerThoughtUnitAnalyzer.analyzeText(text);
}

export function getHighlightsByImportance(
  highlights: ButlerHighlight[], 
  importance: SpeechPriority
): ButlerHighlight[] {
  return highlights.filter(h => h.importance === importance);
}

export function getReadableContent(analysis: ButlerAnalysisResult): {
  essential: string;
  supporting: string;
  full: string;
} {
  const essential = analysis.mainIdeas.map(h => h.text).join('. ');
  const supporting = [
    ...analysis.mainIdeas,
    ...analysis.supportingConcepts.slice(0, 3)
  ].map(h => h.text).join('. ');
  const full = analysis.cleanedText;

  return { essential, supporting, full };
}
