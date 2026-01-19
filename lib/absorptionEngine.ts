// lib/absorptionEngine.ts
// Absorption Panel Content Engine - Generates high-yield cockpit notes per page
// Features:
// - Page-specific content extraction
// - High-yield phrase auto-detection
// - Caching per {pdfId, pageNumber}
// - Auto-save to NoteLab (deduplicated)

import classifyHighlight, { getPDRMTypeLabel, getPDRMTypeColor } from './autoPDRM';

// ============================================================================
// Types
// ============================================================================

export type ImportanceLevel = 'high' | 'med' | 'low';
export type SpanKind = 'high-yield' | 'term' | 'warning' | 'pattern' | 'decision' | 'mnemonic';
export type PDRMTag = 'pattern' | 'decision' | 'risk' | 'mnemonic';

export interface HighlightSpan {
  start: number;
  end: number;
  kind: SpanKind;
}

export interface AbsorptionBullet {
  id: string;
  text: string;
  importance: ImportanceLevel;
  tags: PDRMTag[];
  spans: HighlightSpan[];
  confidence: number;
}

export interface AbsorptionBlock {
  id: string;
  pdfId: string;
  page: number;
  chapterId?: string;
  chapterTitle?: string;
  bullets: AbsorptionBullet[];
  generatedAt: number;
  textHash: string;
}

export interface AbsorptionCache {
  [key: string]: AbsorptionBlock; // key = `${pdfId}:${page}`
}

// ============================================================================
// Cache
// ============================================================================

const absorptionCache: AbsorptionCache = {};

function getCacheKey(pdfId: string, page: number): string {
  return `${pdfId}:${page}`;
}

function hashText(text: string): string {
  // Simple hash for deduplication
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// ============================================================================
// High-Yield Detection Keywords
// ============================================================================

const HIGH_YIELD_PATTERNS = {
  // Clinical patterns
  pattern: [
    /\b(pathognomonic|diagnostic|hallmark|classic|typical|characteristic|specific)\b/i,
    /\b(gold standard|first[- ]?line|treatment of choice|drug of choice)\b/i,
    /\b(most common|most likely|most important|always|never)\b/i,
    /\b(\d+%|percent|incidence|prevalence|sensitivity|specificity)\b/i,
  ],
  // Decision rules
  decision: [
    /\b(if|when|should|must|indicated|contraindicated)\b.{5,}/i,
    /\b(criteria|rule|algorithm|guideline|protocol)\b/i,
    /\b(step|first|then|next|followed by)\b/i,
  ],
  // Risks and warnings
  risk: [
    /\b(warning|caution|danger|adverse|side effect|complication)\b/i,
    /\b(fatal|lethal|life[- ]?threatening|emergency|urgent)\b/i,
    /\b(avoid|contraindicated|do not|never|risk)\b/i,
    /\b(mistake|error|pitfall|common error)\b/i,
  ],
  // Mnemonics
  mnemonic: [
    /\b[A-Z]{3,}\b(?=.*(?:stands for|remember|mnemonic))/i,
    /\b(remember|mnemonic|acronym|stands for)\b/i,
  ],
  // General high-yield
  highYield: [
    /\b(key|essential|critical|important|note|remember|high[- ]?yield)\b/i,
    /\b(definition|mechanism|cause|etiology|pathophysiology)\b/i,
  ],
};

// ============================================================================
// Content Extraction
// ============================================================================

interface ThoughtUnit {
  text: string;
  id?: string;
}

/**
 * Detects high-yield spans within text
 */
function detectHighYieldSpans(text: string): { spans: HighlightSpan[]; tags: PDRMTag[] } {
  const spans: HighlightSpan[] = [];
  const tags: Set<PDRMTag> = new Set();

  // Check each pattern category
  for (const [category, patterns] of Object.entries(HIGH_YIELD_PATTERNS)) {
    for (const pattern of patterns) {
      const matches = text.matchAll(new RegExp(pattern, 'gi'));
      for (const match of matches) {
        if (match.index !== undefined) {
          const kind: SpanKind = category === 'risk' ? 'warning' : 
                                  category === 'mnemonic' ? 'mnemonic' :
                                  category === 'decision' ? 'decision' :
                                  category === 'pattern' ? 'pattern' : 'high-yield';
          
          spans.push({
            start: match.index,
            end: match.index + match[0].length,
            kind
          });

          // Add tag based on category
          if (category === 'pattern') tags.add('pattern');
          else if (category === 'decision') tags.add('decision');
          else if (category === 'risk') tags.add('risk');
          else if (category === 'mnemonic') tags.add('mnemonic');
        }
      }
    }
  }

  // Merge overlapping spans
  const mergedSpans = mergeOverlappingSpans(spans);

  return { spans: mergedSpans, tags: Array.from(tags) };
}

/**
 * Merge overlapping highlight spans
 */
function mergeOverlappingSpans(spans: HighlightSpan[]): HighlightSpan[] {
  if (spans.length === 0) return [];

  // Sort by start position
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const merged: HighlightSpan[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];

    if (current.start <= last.end) {
      // Overlapping - merge
      last.end = Math.max(last.end, current.end);
      // Keep the more important kind
      if (current.kind === 'warning' || current.kind === 'high-yield') {
        last.kind = current.kind;
      }
    } else {
      merged.push(current);
    }
  }

  return merged;
}

/**
 * Calculate importance level based on classification and spans
 */
function calculateImportance(text: string, classification: any, spans: HighlightSpan[]): ImportanceLevel {
  // High importance criteria
  if (classification.confidence > 0.8) return 'high';
  if (classification.type !== 'general') return 'high';
  if (spans.some(s => s.kind === 'warning' || s.kind === 'high-yield')) return 'high';
  if (spans.length >= 3) return 'high';
  
  // Medium importance
  if (classification.confidence > 0.5) return 'med';
  if (spans.length >= 1) return 'med';
  if (text.length > 100 && text.length < 300) return 'med';
  
  // Low importance
  return 'low';
}

/**
 * Generate absorption content for a specific page
 */
export function generateAbsorptionContent(
  pdfId: string,
  page: number,
  thoughtUnits: ThoughtUnit[],
  chapterId?: string,
  chapterTitle?: string,
  pdfPageCount: number = 1
): AbsorptionBlock {
  const cacheKey = getCacheKey(pdfId, page);
  
  // Check cache first
  const cached = absorptionCache[cacheKey];
  if (cached) {
    // Verify cache is still valid (same content)
    const currentHash = hashText(thoughtUnits.map(u => u.text).join(''));
    if (cached.textHash === currentHash) {
      console.log(`📋 Absorption cache hit for ${pdfId} page ${page}`);
      return cached;
    }
  }

  console.log(`📋 Generating absorption content for ${pdfId} page ${page}`);

  // Calculate which thought units belong to this page
  // Distribute units roughly evenly across pages
  const unitsPerPage = Math.max(1, Math.ceil(thoughtUnits.length / pdfPageCount));
  const startIdx = (page - 1) * unitsPerPage;
  const endIdx = Math.min(startIdx + unitsPerPage, thoughtUnits.length);
  const pageUnits = thoughtUnits.slice(startIdx, endIdx);

  const bullets: AbsorptionBullet[] = [];
  let bulletId = 0;

  // Process each thought unit for this page
  for (const unit of pageUnits) {
    if (!unit.text || unit.text.length < 20) continue;

    // Clean and split into sentences/points
    const sentences = unit.text
      .split(/(?<=[.!?])\s+/)
      .filter(s => s.trim().length > 15)
      .slice(0, 10); // Limit to 10 sentences per unit

    for (const sentence of sentences) {
      const text = sentence.trim();
      if (text.length < 15) continue;

      // Classify with PDRM
      const classification = classifyHighlight(text, {
        headingText: chapterTitle,
        chapterTitle,
        pageIndex: page - 1
      });

      // Detect high-yield spans
      const { spans, tags } = detectHighYieldSpans(text);

      // Add tags from classification
      const allTags = [...new Set([...tags, ...(
        classification.type !== 'general' ? [classification.type as PDRMTag] : []
      )])];

      // Calculate importance
      const importance = calculateImportance(text, classification, spans);

      // Create bullet
      bullets.push({
        id: `abs_${pdfId}_${page}_${bulletId++}`,
        text,
        importance,
        tags: allTags,
        spans,
        confidence: classification.confidence
      });
    }
  }

  // Sort by importance (high first) and limit
  const sortedBullets = bullets
    .sort((a, b) => {
      const importanceOrder = { high: 0, med: 1, low: 2 };
      return importanceOrder[a.importance] - importanceOrder[b.importance];
    })
    .slice(0, 20); // Max 20 bullets per page

  // Create block
  const block: AbsorptionBlock = {
    id: `absblock_${pdfId}_${page}_${Date.now()}`,
    pdfId,
    page,
    chapterId,
    chapterTitle,
    bullets: sortedBullets,
    generatedAt: Date.now(),
    textHash: hashText(thoughtUnits.map(u => u.text).join(''))
  };

  // Cache it
  absorptionCache[cacheKey] = block;
  console.log(`📋 Absorption generated: ${sortedBullets.length} bullets (${sortedBullets.filter(b => b.importance === 'high').length} high-yield)`);

  return block;
}

/**
 * Clear cache for a specific PDF
 */
export function clearAbsorptionCache(pdfId?: string): void {
  if (pdfId) {
    // Clear specific PDF
    Object.keys(absorptionCache).forEach(key => {
      if (key.startsWith(`${pdfId}:`)) {
        delete absorptionCache[key];
      }
    });
  } else {
    // Clear all
    Object.keys(absorptionCache).forEach(key => delete absorptionCache[key]);
  }
  console.log(`📋 Absorption cache cleared${pdfId ? ` for ${pdfId}` : ''}`);
}

/**
 * Get cached absorption for a page (returns null if not cached)
 */
export function getCachedAbsorption(pdfId: string, page: number): AbsorptionBlock | null {
  return absorptionCache[getCacheKey(pdfId, page)] || null;
}

/**
 * Get bullets that should be auto-saved to NoteLab (high importance only)
 */
export function getAutoSaveBullets(block: AbsorptionBlock): AbsorptionBullet[] {
  return block.bullets.filter(b => b.importance === 'high');
}

/**
 * Generate a unique hash for deduplication when saving to NoteLab
 */
export function getBulletHash(pdfId: string, page: number, text: string): string {
  return `${pdfId}_${page}_${hashText(text)}`;
}
