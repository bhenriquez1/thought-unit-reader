// lib/navigationUtils.ts
"use client";

/** TOC entry shape (flexible to match existing TOCEntry types) */
type TOCLike = {
  title?: string;
  text?: string;
  pageNumber?: number;
  page?: number;
  pageIndex?: number;
  pageNum?: number;
  [key: string]: unknown;
};

/** Navigation result */
export interface NavigationResult {
  found: boolean;
  page?: number;
  title?: string;
  confidence: number; // 0-1 score for match quality
  matchType: 'exact' | 'fuzzy' | 'partial' | 'none';
}

/** Navigation history entry */
export interface NavigationHistoryEntry {
  page: number;
  title: string;
  timestamp: number;
  source: 'toc' | 'word-click' | 'manual';
}

/**
 * Extract page number from various TOC entry formats
 */
function getTocPage(entry: TOCLike): number | undefined {
  // Prefer explicit 1-based numbers
  const preferred =
    entry.pageNumber ??
    (typeof entry.page === "number" ? entry.page : undefined) ??
    (typeof entry.pageNum === "number" ? entry.pageNum : undefined);

  if (typeof preferred === "number" && Number.isFinite(preferred)) {
    const p = Math.floor(preferred);
    return p >= 1 ? p : 1;
  }

  // Fallback: 0-based pageIndex
  if (typeof entry.pageIndex === "number" && Number.isFinite(entry.pageIndex)) {
    return Math.max(1, Math.floor(entry.pageIndex) + 1);
  }

  return undefined;
}

/**
 * Extract title from TOC entry
 */
function getTocTitle(entry: TOCLike): string {
  return (entry.title ?? entry.text ?? "").toString() || "Untitled";
}

/**
 * Detect if text looks like a chapter/section reference
 */
export function detectNavigationReference(text: string): {
  isReference: boolean;
  type: 'chapter' | 'section' | 'figure' | 'table' | 'page' | 'appendix' | 'unknown';
  extractedText: string;
} {
  const cleanText = text.trim();
  
  // Common reference patterns
  const patterns = [
    { regex: /\b(chapter|ch\.?)\s*(\d+(?:\.\d+)*)/i, type: 'chapter' as const },
    { regex: /\b(section|sec\.?|§)\s*(\d+(?:\.\d+)*)/i, type: 'section' as const },
    { regex: /\b(figure|fig\.?)\s*(\d+(?:\.\d+)*)/i, type: 'figure' as const },
    { regex: /\b(table|tbl\.?)\s*(\d+(?:\.\d+)*)/i, type: 'table' as const },
    { regex: /\b(page|p\.?)\s*(\d+)/i, type: 'page' as const },
    { regex: /\b(appendix|app\.?)\s*([a-z]|\d+)/i, type: 'appendix' as const },
    // Roman numerals for chapters
    { regex: /\b(chapter|ch\.?)\s*([ivxlcdm]+)/i, type: 'chapter' as const },
    // Just numbers that might be chapters (less confident)
    { regex: /^\d+(?:\.\d+)*$/, type: 'section' as const },
  ];

  for (const pattern of patterns) {
    const match = cleanText.match(pattern.regex);
    if (match) {
      return {
        isReference: true,
        type: pattern.type,
        extractedText: match[0]
      };
    }
  }

  return {
    isReference: false,
    type: 'unknown',
    extractedText: cleanText
  };
}

/**
 * Calculate similarity between two strings (0-1)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  if (s1 === s2) return 1.0;
  if (s1.includes(s2) || s2.includes(s1)) return 0.8;
  
  // Simple word overlap scoring
  const words1 = s1.split(/\s+/);
  const words2 = s2.split(/\s+/);
  const commonWords = words1.filter(w => words2.includes(w));
  
  if (commonWords.length === 0) return 0;
  
  return (commonWords.length * 2) / (words1.length + words2.length);
}

/**
 * Search TOC for navigation target
 */
export function searchTOCForNavigation(
  searchText: string,
  toc: TOCLike[]
): NavigationResult {
  if (!searchText.trim() || !toc.length) {
    return { found: false, confidence: 0, matchType: 'none' };
  }

  const reference = detectNavigationReference(searchText);
  const searchLower = searchText.toLowerCase().trim();
  
  let bestMatch: NavigationResult = { found: false, confidence: 0, matchType: 'none' };

  for (const entry of toc) {
    const title = getTocTitle(entry);
    const page = getTocPage(entry);
    
    if (!page) continue;

    const titleLower = title.toLowerCase();
    let confidence = 0;
    let matchType: NavigationResult['matchType'] = 'none';

    // Exact match
    if (titleLower === searchLower) {
      confidence = 1.0;
      matchType = 'exact';
    }
    // Contains search text
    else if (titleLower.includes(searchLower)) {
      confidence = 0.9;
      matchType = 'partial';
    }
    // Reference-based matching
    else if (reference.isReference) {
      const refText = reference.extractedText.toLowerCase();
      if (titleLower.includes(refText)) {
        confidence = 0.8;
        matchType = 'fuzzy';
      }
      // Try to match just the number/identifier
      const numberMatch = refText.match(/(\d+(?:\.\d+)*|[ivxlcdm]+|[a-z])/);
      if (numberMatch && titleLower.includes(numberMatch[1])) {
        confidence = 0.7;
        matchType = 'fuzzy';
      }
    }
    // Fuzzy similarity
    else {
      const similarity = calculateSimilarity(titleLower, searchLower);
      if (similarity > 0.5) {
        confidence = similarity * 0.6; // Lower confidence for fuzzy matches
        matchType = 'fuzzy';
      }
    }

    // Update best match if this is better
    if (confidence > bestMatch.confidence) {
      bestMatch = {
        found: true,
        page,
        title,
        confidence,
        matchType
      };
    }
  }

  return bestMatch;
}

/**
 * Navigation history manager
 */
export class NavigationHistory {
  private history: NavigationHistoryEntry[] = [];
  private maxHistory = 50;

  addEntry(page: number, title: string, source: NavigationHistoryEntry['source'] = 'manual') {
    const entry: NavigationHistoryEntry = {
      page,
      title,
      timestamp: Date.now(),
      source
    };

    // Don't add duplicate consecutive entries
    const last = this.history[this.history.length - 1];
    if (last && last.page === page) return;

    this.history.push(entry);
    
    // Trim history if too long
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
    }
  }

  getHistory(): NavigationHistoryEntry[] {
    return [...this.history];
  }

  getLastEntry(): NavigationHistoryEntry | null {
    return this.history[this.history.length - 1] || null;
  }

  getPreviousEntry(): NavigationHistoryEntry | null {
    return this.history[this.history.length - 2] || null;
  }

  canGoBack(): boolean {
    return this.history.length > 1;
  }

  clear() {
    this.history = [];
  }
}

/**
 * Enhanced word click handler that attempts navigation
 */
export function handleWordClickNavigation(
  clickedText: string,
  toc: TOCLike[],
  currentPage: number,
  onNavigate: (page: number, title: string) => void,
  onNavigationFeedback?: (result: NavigationResult) => void
): boolean {
  const result = searchTOCForNavigation(clickedText, toc);
  
  if (onNavigationFeedback) {
    onNavigationFeedback(result);
  }

  if (result.found && result.page && result.page !== currentPage) {
    onNavigate(result.page, result.title || `Page ${result.page}`);
    return true;
  }

  return false;
}

/**
 * Create visual feedback for navigation
 */
export function createNavigationFeedback(
  result: NavigationResult,
  clickedText: string
): string {
  if (!result.found) {
    return `No navigation target found for "${clickedText}"`;
  }

  const confidenceText = result.confidence > 0.8 ? 'high' : result.confidence > 0.5 ? 'medium' : 'low';
  
  return `Navigating to "${result.title}" (page ${result.page}) - ${result.matchType} match (${confidenceText} confidence)`;
}

/**
 * Extract potential navigation targets from text
 */
export function extractNavigationTargets(text: string): string[] {
  const targets: string[] = [];
  
  // Common reference patterns
  const patterns = [
    /\b(?:chapter|ch\.?)\s*\d+(?:\.\d+)*/gi,
    /\b(?:section|sec\.?|§)\s*\d+(?:\.\d+)*/gi,
    /\b(?:figure|fig\.?)\s*\d+(?:\.\d+)*/gi,
    /\b(?:table|tbl\.?)\s*\d+(?:\.\d+)*/gi,
    /\b(?:page|p\.?)\s*\d+/gi,
    /\b(?:appendix|app\.?)\s*[a-z\d]+/gi,
  ];

  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) {
      targets.push(...matches.map(m => m.trim()));
    }
  }

  return [...new Set(targets)]; // Remove duplicates
}
