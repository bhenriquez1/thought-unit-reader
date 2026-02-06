/**
 * ⚡ Core Extractor
 *
 * Ultra-fast paragraph-aware extraction engine:
 * - 4-paragraph windowing
 * - Strict validation with Zod
 * - Decision-compression with triggers A-H
 * - Lazy-loaded attachments
 */

import type { CoreItem, CoreResponse, CoreExtractionRequest, ParagraphMeta } from './types';
import {
  validateCoreResponse,
  safeParseCoreResponse,
  truncateToLimits,
  CORE_LIMITS,
  type CoreItemType,
} from './schema';
import {
  extractParagraphs,
  buildParagraphMeta,
  extractViewportParagraphs,
  getCombinedText,
  generateWindowCacheKey,
} from './paragraphExtractor';

// ============================================================================
// Types
// ============================================================================

export interface ExtractionResult {
  success: boolean;
  data: CoreResponse | null;
  error: string | null;
  cached: boolean;
  extractionTimeMs: number;
}

// ============================================================================
// Cache
// ============================================================================

const extractionCache = new Map<string, CoreResponse>();
const MAX_CACHE_SIZE = 100;

function getCached(key: string): CoreResponse | null {
  return extractionCache.get(key) || null;
}

function setCache(key: string, data: CoreResponse): void {
  // Evict oldest if cache is full
  if (extractionCache.size >= MAX_CACHE_SIZE) {
    const firstKey = extractionCache.keys().next().value;
    if (firstKey) extractionCache.delete(firstKey);
  }
  extractionCache.set(key, data);
}

export function clearCache(): void {
  extractionCache.clear();
}

// ============================================================================
// Claude Prompt
// ============================================================================

const SYSTEM_PROMPT = `You are a decision-compression engine. Extract core concepts from text with surgical precision.

STRICT RULES:
- Max ${CORE_LIMITS.MAX_ITEMS} items per extraction
- Max ${CORE_LIMITS.MAX_SENTENCES_TOTAL} total sentences (core + exceptions combined)
- Max ${CORE_LIMITS.MAX_SENTENCE_LENGTH} characters per sentence
- Max ${CORE_LIMITS.MAX_TRIGGERS_PER_ITEM} triggers per item
- Max ${CORE_LIMITS.MAX_EXCEPTIONS_PER_ITEM} exceptions per item

TRIGGER CODES (use these to tag concepts):
A = Conditional (IF-THEN rules)
B = Contrast (BUT, HOWEVER, EXCEPT)
C = Causation (BECAUSE, THEREFORE)
D = Definition (IS, MEANS, REFERS TO)
E = Enumeration (LIST, STEPS, TYPES)
F = Formula (EQUATION, CALCULATION)
G = Gradation (SCALE, SPECTRUM, RANGE)
H = Hierarchy (PARENT-CHILD, CLASSIFICATION)

OUTPUT FORMAT (strict JSON):
{
  "version": "core.v1",
  "scope": {
    "book_id": "<provided>",
    "chapter": "<if known>",
    "page": <number>,
    "paragraph_range": [<start>, <end>]
  },
  "items": [
    {
      "id": "<unique-id>",
      "core_sentence": "<max 160 chars, captures the decision/rule>",
      "triggers": ["<A-H>"],
      "exceptions": [
        { "trigger": "<A-H>", "sentence": "<max 160 chars>" }
      ],
      "confidence": <0-1>,
      "source": {
        "page": <number>,
        "paragraph_index": <number>,
        "char_range": [<start>, <end>]
      },
      "attachments_available": {
        "procedure": <true if text contains steps>,
        "example": <true if text contains example>,
        "visual": <true if text references figure>
      }
    }
  ],
  "stats": {
    "input_paragraphs": <count>,
    "items_returned": <count>,
    "sentences_total": <count>
  },
  "stop_reason": "<clarity_reached|cap_reached>"
}

EXTRACTION PRIORITIES:
1. Decision rules (IF X THEN Y)
2. Definitions with exceptions
3. Cause-effect relationships
4. Classifications/hierarchies
5. Formulas/calculations

QUALITY OVER QUANTITY: Stop when clarity is achieved, don't fill to max.`;

function buildUserPrompt(request: CoreExtractionRequest, paragraphText: string): string {
  return `Extract core concepts from this text.

CONTEXT:
- Book ID: ${request.bookId}
- Chapter: ${request.chapter || 'Unknown'}
- Page: ${request.page}
- Paragraph Range: ${request.paragraphRange[0]}-${request.paragraphRange[1]}

TEXT TO ANALYZE:
"""
${paragraphText}
"""

Return ONLY valid JSON matching the specified format. No explanations.`;
}

// ============================================================================
// Mock Extraction (for development/testing)
// ============================================================================

function mockExtract(request: CoreExtractionRequest, paragraphText: string): CoreResponse {
  const sentences = paragraphText.split(/[.!?]+/).filter(s => s.trim().length > 10);

  const items: CoreItem[] = sentences.slice(0, Math.min(CORE_LIMITS.MAX_ITEMS, 3)).map((sentence, i) => {
    const trimmed = sentence.trim().slice(0, CORE_LIMITS.MAX_SENTENCE_LENGTH);
    const triggers = detectTriggers(trimmed);

    return {
      id: `${request.bookId}-p${request.page}-${i}`,
      core_sentence: trimmed,
      triggers: triggers.slice(0, CORE_LIMITS.MAX_TRIGGERS_PER_ITEM),
      exceptions: [],
      confidence: 0.7 + Math.random() * 0.3,
      source: {
        page: request.page,
        paragraph_index: request.paragraphRange[0] + i,
        char_range: [0, trimmed.length] as [number, number],
      },
      attachments_available: {
        procedure: /step|first|then|next|finally/i.test(trimmed),
        example: /example|instance|such as|e\.g\./i.test(trimmed),
        visual: /figure|diagram|chart|graph|image/i.test(trimmed),
      },
    };
  });

  const totalSentences = items.reduce((sum, item) => sum + 1 + item.exceptions.length, 0);

  return {
    version: 'core.v1',
    scope: {
      book_id: request.bookId,
      chapter: request.chapter,
      page: request.page,
      paragraph_range: request.paragraphRange,
    },
    items,
    stats: {
      input_paragraphs: request.paragraphs.length,
      items_returned: items.length,
      sentences_total: totalSentences,
    },
    stop_reason: items.length >= CORE_LIMITS.MAX_ITEMS ? 'cap_reached' : 'clarity_reached',
  };
}

function detectTriggers(text: string): Array<'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H'> {
  const triggers: Array<'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H'> = [];

  if (/\bif\b.*\bthen\b|\bwhen\b.*\b(must|should|will)\b/i.test(text)) triggers.push('A');
  if (/\bbut\b|\bhowever\b|\bexcept\b|\bunless\b|\balthough\b/i.test(text)) triggers.push('B');
  if (/\bbecause\b|\btherefore\b|\bthus\b|\bconsequently\b|\bdue to\b/i.test(text)) triggers.push('C');
  if (/\bis defined as\b|\bmeans\b|\brefers to\b|\bis a\b|\bare\b/i.test(text)) triggers.push('D');
  if (/\bfirst\b.*\bsecond\b|\bsteps?\b|\btypes?\b|\binclude\b/i.test(text)) triggers.push('E');
  if (/[=+\-*/]|\bequation\b|\bformula\b|\bcalculate\b/i.test(text)) triggers.push('F');
  if (/\brange\b|\bspectrum\b|\bscale\b|\bfrom.*to\b|\blevels?\b/i.test(text)) triggers.push('G');
  if (/\bparent\b|\bchild\b|\bsubtype\b|\bcategory\b|\bclassif/i.test(text)) triggers.push('H');

  return triggers;
}

// ============================================================================
// Main Extraction Function
// ============================================================================

export async function extractCore(
  request: CoreExtractionRequest,
  options: {
    useCache?: boolean;
    useMock?: boolean;
    apiKey?: string;
    apiEndpoint?: string;
  } = {}
): Promise<ExtractionResult> {
  const startTime = performance.now();
  const { useCache = true, useMock = true } = options;

  // Generate cache key
  const cacheKey = generateWindowCacheKey(
    request.bookId,
    request.page,
    request.paragraphRange
  );

  // Check cache
  if (useCache) {
    const cached = getCached(cacheKey);
    if (cached) {
      return {
        success: true,
        data: cached,
        error: null,
        cached: true,
        extractionTimeMs: performance.now() - startTime,
      };
    }
  }

  try {
    const paragraphText = request.paragraphs.join('\n\n');
    let response: CoreResponse;

    if (useMock) {
      // Use mock extraction for development
      response = mockExtract(request, paragraphText);
    } else {
      // Real API call (to be implemented with actual API)
      const apiResponse = await callExtractionAPI(
        request,
        paragraphText,
        options.apiKey,
        options.apiEndpoint
      );
      response = apiResponse;
    }

    // Validate with Zod
    const parseResult = safeParseCoreResponse(response);

    if (!parseResult.success) {
      console.warn('⚡ Core validation failed, attempting truncation:', parseResult.error);

      // Try to truncate to valid limits
      if (response.items) {
        response.items = truncateToLimits(response.items as CoreItemType[]);
        response.stats.items_returned = response.items.length;
        response.stats.sentences_total = response.items.reduce(
          (sum, item) => sum + 1 + item.exceptions.length,
          0
        );

        // Re-validate after truncation
        const revalidated = safeParseCoreResponse(response);
        if (!revalidated.success) {
          return {
            success: false,
            data: null,
            error: `Validation failed after truncation: ${revalidated.error.message}`,
            cached: false,
            extractionTimeMs: performance.now() - startTime,
          };
        }
      }
    }

    // Cache the result
    if (useCache) {
      setCache(cacheKey, response);
    }

    return {
      success: true,
      data: response,
      error: null,
      cached: false,
      extractionTimeMs: performance.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Unknown extraction error',
      cached: false,
      extractionTimeMs: performance.now() - startTime,
    };
  }
}

// ============================================================================
// API Call (placeholder for real implementation)
// ============================================================================

async function callExtractionAPI(
  request: CoreExtractionRequest,
  paragraphText: string,
  apiKey?: string,
  apiEndpoint?: string
): Promise<CoreResponse> {
  const endpoint = apiEndpoint || '/api/core/extract';

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      request,
      text: paragraphText,
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: buildUserPrompt(request, paragraphText),
    }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return validateCoreResponse(data);
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Extract from page text with automatic paragraph windowing
 */
export async function extractFromPage(
  documentId: string,
  pageNumber: number,
  pageText: string,
  scrollY: number = 0,
  viewportHeight: number = 800,
  chapter?: string
): Promise<ExtractionResult> {
  // Parse paragraphs
  const rawParagraphs = extractParagraphs(pageText);
  const paragraphMeta = buildParagraphMeta(rawParagraphs, viewportHeight);

  // Get window around scroll position
  const { paragraphs, range } = extractViewportParagraphs(
    paragraphMeta,
    scrollY,
    viewportHeight
  );

  if (paragraphs.length === 0) {
    return {
      success: true,
      data: {
        version: 'core.v1',
        scope: {
          book_id: documentId,
          chapter: chapter || null,
          page: pageNumber,
          paragraph_range: [0, 0],
        },
        items: [],
        stats: {
          input_paragraphs: 0,
          items_returned: 0,
          sentences_total: 0,
        },
        stop_reason: 'clarity_reached',
      },
      error: null,
      cached: false,
      extractionTimeMs: 0,
    };
  }

  const request: CoreExtractionRequest = {
    bookId: documentId,
    chapter: chapter || null,
    page: pageNumber,
    paragraphs: paragraphs.map(p => p.text),
    paragraphRange: range,
  };

  return extractCore(request);
}

/**
 * Get prompts for debugging/inspection
 */
export function getPrompts(request: CoreExtractionRequest, paragraphText: string): {
  system: string;
  user: string;
} {
  return {
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(request, paragraphText),
  };
}
