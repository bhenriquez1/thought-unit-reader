// lib/performance/OptimizedHighlightEngine.ts
/**
 * Optimized Highlighting & Pattern Pipeline
 * Addresses: Web Workers, Debounced operations, Memoization, Background processing
 */

import { markStart, markEnd, PerformanceMarks } from './PerformanceProfiler';

// Types for highlighting system
interface HighlightResult {
  spans: HighlightSpan[];
  patterns: DetectedPattern[];
  confidence: number;
  processingTime: number;
}

interface HighlightSpan {
  start: number;
  end: number;
  type: 'concept' | 'definition' | 'process' | 'relationship' | 'main-idea';
  text: string;
  confidence: number;
  metadata?: any;
}

interface DetectedPattern {
  id: string;
  name: string;
  confidence: number;
  spans: number[];
  category: 'organic-chemistry' | 'general-chemistry' | 'biology' | 'reading-comprehension';
}

interface HighlightOptions {
  enablePatternDetection: boolean;
  highlightThreshold: number;
  maxConcurrentTasks: number;
  useWebWorker: boolean;
  debounceMs: number;
  memoizeResults: boolean;
}

// Default configuration for optimal performance
const DEFAULT_HIGHLIGHT_OPTIONS: HighlightOptions = {
  enablePatternDetection: true,
  highlightThreshold: 0.6,
  maxConcurrentTasks: 2,
  useWebWorker: true,
  debounceMs: 250,
  memoizeResults: true,
};

// Memoization cache with LRU eviction
class LRUCache<T> {
  private cache = new Map<string, { value: T; timestamp: number }>();
  private maxSize: number;
  private maxAge: number;

  constructor(maxSize: number = 100, maxAge: number = 300000) { // 5 minutes
    this.maxSize = maxSize;
    this.maxAge = maxAge;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check if expired
    if (Date.now() - entry.timestamp > this.maxAge) {
      this.cache.delete(key);
      return null;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, { ...entry, timestamp: Date.now() });
    return entry.value;
  }

  set(key: string, value: T): void {
    // Remove oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, { value, timestamp: Date.now() });
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

// Debounce utility for throttling operations
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  let timeout: NodeJS.Timeout;
  
  return (...args: Parameters<T>) => {
    return new Promise((resolve) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        resolve(func(...args));
      }, wait);
    });
  };
}

class OptimizedHighlightEngine {
  private cache: LRUCache<HighlightResult>;
  private worker: Worker | null = null;
  private taskQueue: Map<string, Promise<HighlightResult>> = new Map();
  private processingCount = 0;
  private options: HighlightOptions;
  
  // Debounced processing functions
  private debouncedHighlight: (...args: any[]) => Promise<HighlightResult>;
  private debouncedPatternDetection: (...args: any[]) => Promise<DetectedPattern[]>;

  constructor(options: Partial<HighlightOptions> = {}) {
    this.options = { ...DEFAULT_HIGHLIGHT_OPTIONS, ...options };
    this.cache = new LRUCache<HighlightResult>(200, 600000); // 10 minutes cache

    // Initialize debounced functions
    this.debouncedHighlight = debounce(this.processHighlighting.bind(this), this.options.debounceMs);
    this.debouncedPatternDetection = debounce(this.detectPatterns.bind(this), this.options.debounceMs);

    // Initialize web worker if enabled
    if (this.options.useWebWorker && typeof window !== 'undefined') {
      this.initializeWorker();
    }
  }

  // Main highlighting entry point
  async highlightText(
    text: string,
    page?: number,
    threshold?: number
  ): Promise<HighlightResult> {
    const cacheKey = this.generateCacheKey(text, page, threshold);
    
    // Check cache first
    if (this.options.memoizeResults) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        console.log(`🚀 Cache hit for highlight (${text.substring(0, 50)}...)`);
        return cached;
      }
    }

    // Check if already processing this text
    const existingTask = this.taskQueue.get(cacheKey);
    if (existingTask) {
      return existingTask;
    }

    // Create new processing task
    const task = this.processHighlightTask(text, page, threshold || this.options.highlightThreshold);
    this.taskQueue.set(cacheKey, task);

    try {
      const result = await task;
      
      // Cache the result
      if (this.options.memoizeResults) {
        this.cache.set(cacheKey, result);
      }
      
      return result;
    } finally {
      this.taskQueue.delete(cacheKey);
    }
  }

  private async processHighlightTask(
    text: string,
    page?: number,
    threshold: number = 0.6
  ): Promise<HighlightResult> {
    markStart(PerformanceMarks.HIGHLIGHT_COMPUTE_START);

    try {
      // Limit concurrent processing
      if (this.processingCount >= this.options.maxConcurrentTasks) {
        await this.waitForProcessingSlot();
      }

      this.processingCount++;

      const startTime = performance.now();

      // Use web worker if available, otherwise process in main thread
      let result: HighlightResult;
      
      if (this.worker && this.options.useWebWorker) {
        result = await this.processWithWorker(text, page, threshold);
      } else {
        result = await this.debouncedHighlight(text, page, threshold);
      }

      const processingTime = performance.now() - startTime;
      result.processingTime = processingTime;

      console.log(`✨ Highlighted text in ${processingTime.toFixed(2)}ms (${result.spans.length} spans, ${result.patterns.length} patterns)`);

      return result;

    } finally {
      this.processingCount--;
      markEnd(PerformanceMarks.HIGHLIGHT_COMPUTE_START);
    }
  }

  private async processHighlighting(
    text: string,
    page?: number,
    threshold: number = 0.6
  ): Promise<HighlightResult> {
    const spans = await this.extractHighlightSpans(text, threshold);
    const patterns = this.options.enablePatternDetection 
      ? await this.debouncedPatternDetection(text, spans)
      : [];

    const confidence = spans.length > 0 
      ? spans.reduce((sum, span) => sum + span.confidence, 0) / spans.length
      : 0;

    return {
      spans,
      patterns,
      confidence,
      processingTime: 0, // Will be set by caller
    };
  }

  private async extractHighlightSpans(
    text: string,
    threshold: number
  ): Promise<HighlightSpan[]> {
    markStart(PerformanceMarks.TEXT_TOKENIZATION_START);

    try {
      const spans: HighlightSpan[] = [];
      
      // Simple tokenization and concept extraction
      const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
      
      for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i].trim();
        if (!sentence) continue;

        const conceptScore = this.calculateConceptScore(sentence);
        
        if (conceptScore >= threshold) {
          const start = text.indexOf(sentence);
          const end = start + sentence.length;
          
          spans.push({
            start,
            end,
            type: this.classifyConceptType(sentence),
            text: sentence,
            confidence: conceptScore,
            metadata: {
              sentenceIndex: i,
              wordCount: sentence.split(/\s+/).length,
            }
          });
        }
      }

      return spans;

    } finally {
      markEnd(PerformanceMarks.TEXT_TOKENIZATION_START);
    }
  }

  private calculateConceptScore(text: string): number {
    const lowerText = text.toLowerCase();
    let score = 0;

    // High-value concept indicators
    const conceptIndicators = [
      // Science concepts
      { pattern: /\b(mechanism|reaction|pathway|process)\b/, weight: 0.8 },
      { pattern: /\b(therefore|thus|because|due to)\b/, weight: 0.7 },
      { pattern: /\b(important|key|essential|critical)\b/, weight: 0.6 },
      { pattern: /\b(definition|define|characterized by)\b/, weight: 0.9 },
      
      // Chemistry patterns
      { pattern: /\b(acid|base|ph|pka|equilibrium)\b/, weight: 0.7 },
      { pattern: /\b(organic|inorganic|synthesis|catalysis)\b/, weight: 0.7 },
      { pattern: /\b(electron|proton|neutron|orbital)\b/, weight: 0.6 },
      
      // Biology patterns
      { pattern: /\b(cell|protein|dna|rna|enzyme)\b/, weight: 0.7 },
      { pattern: /\b(evolution|adaptation|mutation)\b/, weight: 0.6 },
      { pattern: /\b(organ|tissue|system|function)\b/, weight: 0.6 },
      
      // Reading comprehension
      { pattern: /\b(main idea|central theme|primary)\b/, weight: 0.9 },
      { pattern: /\b(evidence|support|example|illustrate)\b/, weight: 0.5 },
    ];

    conceptIndicators.forEach(indicator => {
      if (indicator.pattern.test(lowerText)) {
        score += indicator.weight;
      }
    });

    // Length and complexity bonuses
    const wordCount = text.split(/\s+/).length;
    if (wordCount >= 10 && wordCount <= 30) {
      score += 0.2; // Sweet spot for concept sentences
    }

    // Technical terms bonus
    const technicalTerms = lowerText.match(/\b[a-z]+tion\b|\b[a-z]+ism\b|\b[a-z]+ase\b|\b[a-z]+ide\b/g);
    if (technicalTerms) {
      score += Math.min(technicalTerms.length * 0.1, 0.3);
    }

    return Math.min(score, 1.0);
  }

  private classifyConceptType(text: string): HighlightSpan['type'] {
    const lowerText = text.toLowerCase();

    if (/\b(definition|define|is|are|characterized by|means)\b/.test(lowerText)) {
      return 'definition';
    }
    
    if (/\b(process|mechanism|pathway|steps|procedure)\b/.test(lowerText)) {
      return 'process';
    }
    
    if (/\b(relationship|correlation|associated|linked|connected)\b/.test(lowerText)) {
      return 'relationship';
    }
    
    if (/\b(main|primary|key|important|central|essential)\b/.test(lowerText)) {
      return 'main-idea';
    }

    return 'concept';
  }

  private async detectPatterns(
    text: string,
    spans: HighlightSpan[]
  ): Promise<DetectedPattern[]> {
    markStart(PerformanceMarks.PATTERN_ANALYSIS_START);

    try {
      const patterns: DetectedPattern[] = [];
      const lowerText = text.toLowerCase();

      // Pattern detection rules
      const patternRules = [
        {
          id: 'acid-base',
          name: 'Acid-Base Chemistry',
          category: 'general-chemistry' as const,
          keywords: ['acid', 'base', 'ph', 'pka', 'proton', 'hydrogen', 'hydroxide'],
          confidence: 0.8,
        },
        {
          id: 'organic-mechanisms',
          name: 'Organic Reaction Mechanisms',
          category: 'organic-chemistry' as const,
          keywords: ['nucleophile', 'electrophile', 'mechanism', 'sn1', 'sn2', 'elimination'],
          confidence: 0.9,
        },
        {
          id: 'cell-biology',
          name: 'Cell Biology Concepts',
          category: 'biology' as const,
          keywords: ['cell', 'organelle', 'membrane', 'mitochondria', 'nucleus'],
          confidence: 0.7,
        },
        {
          id: 'cause-effect',
          name: 'Cause-Effect Relationships',
          category: 'reading-comprehension' as const,
          keywords: ['because', 'therefore', 'thus', 'result', 'cause', 'effect'],
          confidence: 0.8,
        },
      ];

      patternRules.forEach(rule => {
        const matchedKeywords = rule.keywords.filter(keyword => 
          lowerText.includes(keyword)
        );

        if (matchedKeywords.length >= 2) {
          const relevantSpans = spans
            .map((span, index) => ({ span, index }))
            .filter(({ span }) => 
              rule.keywords.some(keyword => 
                span.text.toLowerCase().includes(keyword)
              )
            )
            .map(({ index }) => index);

          if (relevantSpans.length > 0) {
            patterns.push({
              id: rule.id,
              name: rule.name,
              category: rule.category,
              confidence: rule.confidence * (matchedKeywords.length / rule.keywords.length),
              spans: relevantSpans,
            });
          }
        }
      });

      return patterns;

    } finally {
      markEnd(PerformanceMarks.PATTERN_ANALYSIS_START);
    }
  }

  private async processWithWorker(
    text: string,
    page?: number,
    threshold: number = 0.6
  ): Promise<HighlightResult> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('Worker not available'));
        return;
      }

      const messageId = `highlight-${Date.now()}-${Math.random()}`;
      
      const messageHandler = (event: MessageEvent) => {
        if (event.data.id === messageId) {
          this.worker!.removeEventListener('message', messageHandler);
          
          if (event.data.error) {
            reject(new Error(event.data.error));
          } else {
            resolve(event.data.result);
          }
        }
      };

      this.worker.addEventListener('message', messageHandler);
      this.worker.postMessage({
        id: messageId,
        command: 'highlight',
        text,
        page,
        threshold,
        options: this.options,
      });

      // Timeout fallback
      setTimeout(() => {
        this.worker!.removeEventListener('message', messageHandler);
        reject(new Error('Worker timeout'));
      }, 10000);
    });
  }

  private initializeWorker(): void {
    try {
      const workerBlob = new Blob([this.getWorkerScript()], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(workerBlob);
      this.worker = new Worker(workerUrl);
      
      this.worker.onerror = (error) => {
        console.error('Highlight worker error:', error);
        this.worker = null;
      };

      console.log('✅ Highlight worker initialized');
    } catch (error) {
      console.warn('Failed to initialize highlight worker:', error);
      this.worker = null;
    }
  }

  private getWorkerScript(): string {
    return `
      // Web Worker script for highlighting
      self.onmessage = function(event) {
        const { id, command, text, page, threshold, options } = event.data;
        
        if (command === 'highlight') {
          try {
            const result = processHighlightingInWorker(text, threshold, options);
            self.postMessage({ id, result });
          } catch (error) {
            self.postMessage({ id, error: error.message });
          }
        }
      };

      function processHighlightingInWorker(text, threshold, options) {
        // Simple highlighting logic for worker
        const spans = [];
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
        
        sentences.forEach((sentence, i) => {
          const trimmed = sentence.trim();
          if (!trimmed) return;

          const score = calculateSimpleConceptScore(trimmed);
          if (score >= threshold) {
            const start = text.indexOf(trimmed);
            const end = start + trimmed.length;
            
            spans.push({
              start,
              end,
              type: 'concept',
              text: trimmed,
              confidence: score,
              metadata: { sentenceIndex: i }
            });
          }
        });

        return {
          spans,
          patterns: [], // Simplified for worker
          confidence: spans.length > 0 ? spans.reduce((sum, span) => sum + span.confidence, 0) / spans.length : 0,
          processingTime: 0
        };
      }

      function calculateSimpleConceptScore(text) {
        const lowerText = text.toLowerCase();
        let score = 0;
        
        const indicators = [
          { pattern: /\\b(important|key|essential)\\b/, weight: 0.6 },
          { pattern: /\\b(definition|define)\\b/, weight: 0.9 },
          { pattern: /\\b(process|mechanism)\\b/, weight: 0.8 },
          { pattern: /\\b(therefore|because)\\b/, weight: 0.7 }
        ];
        
        indicators.forEach(indicator => {
          if (indicator.pattern.test(lowerText)) {
            score += indicator.weight;
          }
        });
        
        return Math.min(score, 1.0);
      }
    `;
  }

  private generateCacheKey(text: string, page?: number, threshold?: number): string {
    const textHash = this.simpleHash(text);
    return `${textHash}-${page || 0}-${threshold || this.options.highlightThreshold}`;
  }

  private simpleHash(str: string): string {
    let hash = 0;
    if (str.length === 0) return hash.toString();
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    
    return Math.abs(hash).toString(36);
  }

  private async waitForProcessingSlot(): Promise<void> {
    return new Promise((resolve) => {
      const checkSlot = () => {
        if (this.processingCount < this.options.maxConcurrentTasks) {
          resolve();
        } else {
          setTimeout(checkSlot, 100);
        }
      };
      checkSlot();
    });
  }

  // Light mode configuration for reduced processing
  setLightMode(enabled: boolean): void {
    this.options.enablePatternDetection = !enabled;
    this.options.useWebWorker = !enabled;
    this.options.memoizeResults = !enabled;
    
    if (enabled) {
      this.cache.clear();
    }

    console.log(`🌟 Highlight engine light mode: ${enabled ? 'ON' : 'OFF'}`);
  }

  // Update configuration at runtime
  updateOptions(newOptions: Partial<HighlightOptions>): void {
    this.options = { ...this.options, ...newOptions };
    
    // Reinitialize debounced functions if debounce time changed
    if (newOptions.debounceMs !== undefined) {
      this.debouncedHighlight = debounce(this.processHighlighting.bind(this), this.options.debounceMs);
      this.debouncedPatternDetection = debounce(this.detectPatterns.bind(this), this.options.debounceMs);
    }
  }

  // Get cache statistics
  getCacheStats(): any {
    return {
      cacheSize: this.cache.size(),
      queueSize: this.taskQueue.size,
      processingCount: this.processingCount,
      workerAvailable: !!this.worker,
      options: this.options,
    };
  }

  // Clear cache and reset
  reset(): void {
    this.cache.clear();
    this.taskQueue.clear();
    this.processingCount = 0;
    console.log('🔄 Highlight engine reset');
  }

  // Cleanup
  dispose(): void {
    console.log('🗑️ Disposing OptimizedHighlightEngine');
    
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    
    this.cache.clear();
    this.taskQueue.clear();
  }
}

// Export singleton instance
export const optimizedHighlightEngine = new OptimizedHighlightEngine();

// Export types and utilities
export type { HighlightResult, HighlightSpan, DetectedPattern, HighlightOptions };
export { OptimizedHighlightEngine, DEFAULT_HIGHLIGHT_OPTIONS, LRUCache };
