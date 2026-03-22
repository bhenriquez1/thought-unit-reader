// lib/anchorSync.ts
// Enhanced anchor-based synchronization system for bidirectional PDF-chunk sync

export interface AnchorToken {
  word: string;
  score: number;
  position: number; // position in original text
}

export interface PageTextIndex {
  pageNumber: number;
  text: string;
  normalizedText: string;
  spans: TextSpanInfo[];
  lastUpdated: number;
}

export interface TextSpanInfo {
  element: HTMLElement;
  text: string;
  normalizedText: string;
  bounds: DOMRect;
  startIndex: number;
  endIndex: number;
}

export interface MatchResult {
  found: boolean;
  score: number;
  matchedTokens: string[];
  position?: { start: number; end: number };
  element?: HTMLElement;
  confidence: number;
}

export interface ChunkAnchor {
  chunkId: string;
  tokens: AnchorToken[];
  originalText: string;
  normalizedText: string;
  pageGuess?: number;
}

// Common stopwords to filter out
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your',
  'his', 'her', 'its', 'our', 'their', 'from', 'up', 'about', 'into', 'over', 'after'
]);

// Enhanced word scoring for anchor token selection
function scoreWord(word: string, position: number, totalWords: number): number {
  let score = 0;
  
  // Length bonus (prefer longer words)
  if (word.length >= 6) score += 3;
  else if (word.length >= 4) score += 1;
  
  // Capitalization bonus (proper nouns, technical terms)
  if (/^[A-Z]/.test(word)) score += 2;
  if (/^[A-Z][A-Z]+$/.test(word)) score += 1; // Acronyms
  
  // Numbers and technical terms
  if (/\d/.test(word)) score += 2;
  if (/[A-Za-z]\d|\d[A-Za-z]/.test(word)) score += 3; // Mixed alphanumeric
  
  // Position bonus (prefer words from beginning and end)
  const relativePos = position / totalWords;
  if (relativePos < 0.3 || relativePos > 0.7) score += 1;
  
  // Technical/academic terms
  if (/^(process|method|system|function|structure|analysis|theory|concept|principle|mechanism)$/i.test(word)) {
    score += 2;
  }
  
  // Penalty for very common words that might have slipped through
  if (['said', 'like', 'just', 'also', 'only', 'even', 'way', 'time', 'work', 'use'].includes(word.toLowerCase())) {
    score -= 2;
  }
  
  return Math.max(0, score);
}

// Normalize text for consistent matching
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    // Fix hyphenation across line breaks
    .replace(/\s*-\s*\n\s*/g, '')
    .replace(/-\n/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

// Extract anchor tokens from chunk text - optimized for performance
export function extractAnchorTokens(text: string, maxTokens: number = 4): AnchorToken[] {
  const normalized = normalizeText(text);
  const words = normalized.split(/\W+/).filter(Boolean);
  
  const scoredWords = words
    .map((word, index) => ({
      word,
      score: scoreWord(word, index, words.length),
      position: index
    }))
    .filter(item => 
      item.word.length >= 3 && 
      !STOPWORDS.has(item.word.toLowerCase()) &&
      item.score > 0
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, maxTokens);
  
  return scoredWords;
}

// Create chunk anchor for sync matching
export function createChunkAnchor(chunkId: string, text: string, pageGuess?: number): ChunkAnchor {
  const tokens = extractAnchorTokens(text);
  const normalizedText = normalizeText(text);
  
  return {
    chunkId,
    tokens,
    originalText: text,
    normalizedText,
    pageGuess
  };
}

// Build page text index from PDF page elements
export function buildPageTextIndex(pageNumber: number, pageContainer: HTMLElement): PageTextIndex | undefined {
  if (!pageContainer) return undefined;
  
  const textLayer = pageContainer.querySelector('.textLayer') as HTMLElement;
  if (!textLayer) return undefined;
  
  const spans = Array.from(textLayer.querySelectorAll('span')) as HTMLElement[];
  const spanInfos: TextSpanInfo[] = [];
  let fullText = '';
  let currentIndex = 0;
  
  spans.forEach(span => {
    const text = span.textContent || '';
    if (!text.trim()) return;
    
    const normalizedText = normalizeText(text);
    const bounds = span.getBoundingClientRect();
    
    spanInfos.push({
      element: span,
      text,
      normalizedText,
      bounds,
      startIndex: currentIndex,
      endIndex: currentIndex + text.length
    });
    
    fullText += (fullText ? ' ' : '') + text;
    currentIndex += text.length + 1; // +1 for space
  });
  
  return {
    pageNumber,
    text: fullText,
    normalizedText: normalizeText(fullText),
    spans: spanInfos,
    lastUpdated: Date.now()
  };
}

// Score match between anchor tokens and page text - optimized with confidence threshold
export function scoreMatch(anchor: ChunkAnchor, pageIndex: PageTextIndex): MatchResult {
  if (!anchor.tokens.length || !pageIndex.normalizedText) {
    return { found: false, score: 0, matchedTokens: [], confidence: 0 };
  }
  
  const pageText = pageIndex.normalizedText;
  const matchedTokens: string[] = [];
  let totalScore = 0;
  let positionBonus = 0;
  
  // Early exit if text is too short for meaningful matching
  if (pageText.length < 50) {
    return { found: false, score: 0, matchedTokens: [], confidence: 0 };
  }
  
  // Check each anchor token - optimized with early exit
  for (let index = 0; index < anchor.tokens.length; index++) {
    const token = anchor.tokens[index];
    const tokenRegex = new RegExp(`\\b${token.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    const matches = [...pageText.matchAll(tokenRegex)];
    
    if (matches.length > 0) {
      matchedTokens.push(token.word);
      totalScore += token.score;
      
      // Position bonus for tokens found in expected order
      const firstMatchPos = matches[0].index || 0;
      const relativePos = firstMatchPos / pageText.length;
      
      // Bonus for maintaining relative order
      if (index === 0 || relativePos > positionBonus) {
        positionBonus += 0.1;
      }
    }
    
    // Early exit if we have enough matches for confidence
    if (matchedTokens.length >= 2 && index >= 2) break;
  }
  
  // Calculate confidence based on token coverage and order
  const tokenCoverage = matchedTokens.length / anchor.tokens.length;
  const scoreNormalized = totalScore / Math.max(1, anchor.tokens.reduce((sum, t) => sum + t.score, 0));
  const confidence = (tokenCoverage * 0.6) + (scoreNormalized * 0.3) + (positionBonus * 0.1);
  
  return {
    found: matchedTokens.length > 0,
    score: totalScore + positionBonus,
    matchedTokens,
    confidence: Math.min(1, confidence)
  };
}

// Find best matching chunk for visible page content
export function findChunkInPage(
  anchor: ChunkAnchor, 
  pageIndex: PageTextIndex,
  contextWindow: number = 400
): MatchResult {
  const baseMatch = scoreMatch(anchor, pageIndex);
  
  if (!baseMatch.found) {
    return baseMatch;
  }
  
  // Try to find specific position in page
  const pageText = pageIndex.normalizedText;
  let bestPosition: { start: number; end: number } | undefined;
  let bestElement: HTMLElement | undefined;
  
  // Look for the first anchor token to establish position
  if (anchor.tokens.length > 0) {
    const firstToken = anchor.tokens[0];
    const tokenRegex = new RegExp(`\\b${firstToken.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    const match = tokenRegex.exec(pageText);
    
    if (match && match.index !== undefined) {
      const start = Math.max(0, match.index - contextWindow / 2);
      const end = Math.min(pageText.length, match.index + contextWindow / 2);
      bestPosition = { start, end };
      
      // Find corresponding DOM element
      let charCount = 0;
      for (const span of pageIndex.spans) {
        if (charCount <= match.index && match.index < charCount + span.text.length) {
          bestElement = span.element;
          break;
        }
        charCount += span.text.length + 1;
      }
    }
  }
  
  return {
    ...baseMatch,
    position: bestPosition,
    element: bestElement
  };
}

// Highlight chunk in PDF page
export function highlightChunkInPDF(
  pageContainer: HTMLElement,
  matchResult: MatchResult,
  highlightClass: string = 'chunk-highlight'
): void {
  // Clear existing highlights
  const existingHighlights = pageContainer.querySelectorAll(`.${highlightClass}`);
  existingHighlights.forEach(el => el.classList.remove(highlightClass));
  
  if (!matchResult.found || !matchResult.element) return;
  
  // Highlight the matched element and nearby elements
  const textLayer = pageContainer.querySelector('.textLayer');
  if (!textLayer) return;
  
  const spans = Array.from(textLayer.querySelectorAll('span')) as HTMLElement[];
  const targetIndex = spans.indexOf(matchResult.element);
  
  if (targetIndex === -1) return;
  
  // Highlight target and surrounding spans for context
  const startIndex = Math.max(0, targetIndex - 2);
  const endIndex = Math.min(spans.length - 1, targetIndex + 5);
  
  for (let i = startIndex; i <= endIndex; i++) {
    spans[i].classList.add(highlightClass);
    if (i === targetIndex) {
      spans[i].classList.add('primary-match');
    }
  }
  
  // Scroll to highlighted element
  matchResult.element.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
    inline: 'nearest'
  });
}

// Debounced function creator for performance - optimized delays
export function createDebounced<T extends (...args: any[]) => any>(
  func: T,
  delay: number = 250 // Default to 250ms for better performance
): T & { cancel: () => void } {
  let timeoutId: number | null = null;
  
  const debounced = ((...args: Parameters<T>) => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    
    timeoutId = window.setTimeout(() => {
      func(...args);
      timeoutId = null;
    }, delay);
  }) as T & { cancel: () => void };
  
  debounced.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };
  
  return debounced;
}

// Cache for page text indexes with LRU eviction - reduced size for performance
export class PageIndexCache {
  private cache = new Map<number, PageTextIndex>();
  private maxSize: number;
  
  constructor(maxSize: number = 5) {
    this.maxSize = maxSize;
  }
  
  get(pageNumber: number): PageTextIndex | undefined {
    const item = this.cache.get(pageNumber);
    if (item) {
      // Move to end (most recently used)
      this.cache.delete(pageNumber);
      this.cache.set(pageNumber, item);
    }
    return item;
  }
  
  set(pageNumber: number, index: PageTextIndex): void {
    // Remove if already exists
    if (this.cache.has(pageNumber)) {
      this.cache.delete(pageNumber);
    }
    
    // Add to end
    this.cache.set(pageNumber, index);
    
    // Evict oldest if over limit
    if (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }
  
  clear(): void {
    this.cache.clear();
  }
  
  has(pageNumber: number): boolean {
    return this.cache.has(pageNumber);
  }
}

// Global cache instance - reduced size for better performance
export const pageIndexCache = new PageIndexCache(5);

// Utility to get visible text from page using IntersectionObserver - optimized
export function getVisiblePageText(
  pageContainer: HTMLElement,
  callback: (visibleText: string, topElement: HTMLElement | null) => void
): () => void {
  const textLayer = pageContainer.querySelector('.textLayer');
  if (!textLayer) {
    callback('', null);
    return () => {};
  }
  
  const spans = Array.from(textLayer.querySelectorAll('span')) as HTMLElement[];
  const visibleSpans: { element: HTMLElement; text: string; ratio: number }[] = [];
  
  // Throttle callback to reduce frequency
  let callbackTimeout: number | null = null;
  const throttledCallback = (visibleText: string, topElement: HTMLElement | null) => {
    if (callbackTimeout) return;
    callbackTimeout = window.setTimeout(() => {
      callback(visibleText, topElement);
      callbackTimeout = null;
    }, 200); // Throttle to 200ms
  };
  
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        const span = entry.target as HTMLElement;
        const text = span.textContent || '';
        
        if (entry.isIntersecting && text.trim()) {
          const existingIndex = visibleSpans.findIndex(v => v.element === span);
          if (existingIndex >= 0) {
            visibleSpans[existingIndex].ratio = entry.intersectionRatio;
          } else {
            visibleSpans.push({
              element: span,
              text,
              ratio: entry.intersectionRatio
            });
          }
        } else {
          const index = visibleSpans.findIndex(v => v.element === span);
          if (index >= 0) {
            visibleSpans.splice(index, 1);
          }
        }
      });
      
      // Sort by intersection ratio and position - optimized
      visibleSpans.sort((a, b) => {
        const ratioSort = b.ratio - a.ratio;
        if (Math.abs(ratioSort) > 0.1) return ratioSort;
        
        // If ratios are similar, sort by DOM position
        const aRect = a.element.getBoundingClientRect();
        const bRect = b.element.getBoundingClientRect();
        return aRect.top - bRect.top;
      });
      
      const visibleText = visibleSpans
        .slice(0, 10) // Reduced from 20 to 10 for better performance
        .map(v => v.text)
        .join(' ');
      
      const topElement = visibleSpans.length > 0 ? visibleSpans[0].element : null;
      
      throttledCallback(visibleText, topElement);
    },
    {
      root: pageContainer,
      rootMargin: '0px',
      threshold: [0, 0.5, 1.0] // Reduced thresholds for better performance
    }
  );
  
  // Observe only every 3rd span for better performance
  spans.forEach((span, index) => {
    if (index % 3 === 0) observer.observe(span);
  });
  
  return () => {
    observer.disconnect();
    if (callbackTimeout) {
      clearTimeout(callbackTimeout);
    }
  };
}

const ACTIVE_ANCHOR_CLASS = 'avrrio-source-highlight-active';

export function clearActiveHighlights(): void {
  if (typeof document === 'undefined') return;
  document
    .querySelectorAll(`.${ACTIVE_ANCHOR_CLASS}`)
    .forEach((el) => el.classList.remove(ACTIVE_ANCHOR_CLASS));
}

export function activateSourceAnchors(anchorIds: string[]): void {
  if (typeof document === 'undefined') return;
  clearActiveHighlights();
  anchorIds.forEach((anchorId) => {
    const target = document.querySelector<HTMLElement>(`[data-source-anchor-id="${CSS.escape(anchorId)}"]`);
    target?.classList.add(ACTIVE_ANCHOR_CLASS);
  });
}

export function scrollSourceIntoView(anchorId: string): void {
  if (typeof document === 'undefined') return;
  const target = document.querySelector<HTMLElement>(`[data-source-anchor-id="${CSS.escape(anchorId)}"]`);
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
