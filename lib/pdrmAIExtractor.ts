// lib/pdrmAIExtractor.ts
// AI-powered PDRM Extraction Service
// Extracts structured Pattern/Decision/Risk/Mnemonic from text
// Supports both highlight-driven and page-driven extraction

import { 
  type PDRMFields, 
  type PDRMType,
  type PDRMEntry,
  type PDRMEvidence,
  determinePrimaryType,
  usePdrmStore 
} from './stores/pdrmStore';

// ============================================================================
// Types
// ============================================================================

export interface ExtractionRequest {
  text: string;
  pageNumber: number;
  documentId: string;
  highlightId?: string;
  chapterTitle?: string;
  context?: string;  // Surrounding text for better extraction
}

export interface ExtractionResult {
  fields: PDRMFields;
  primaryType: PDRMType | 'general';
  confidence: number;
  isImportant: boolean;
}

export interface PageExtractionResult {
  entries: Array<{
    fields: PDRMFields;
    primaryType: PDRMType | 'general';
    confidence: number;
    quote: string;
  }>;
  pageNumber: number;
}

// ============================================================================
// Debounce & Rate Limiting
// ============================================================================

const DEBOUNCE_MS = 500;
const MIN_REQUEST_INTERVAL_MS = 1000;

let lastRequestTime = 0;
const pendingRequests: Map<string, NodeJS.Timeout> = new Map();

function debounceKey(documentId: string, pageNumber: number): string {
  return `page_${documentId}_${pageNumber}`;
}

// Cancel pending request for a key
export function cancelPendingExtraction(key: string): void {
  const timeout = pendingRequests.get(key);
  if (timeout) {
    clearTimeout(timeout);
    pendingRequests.delete(key);
  }
}

// ============================================================================
// PDRM Extraction Prompt/Schema
// ============================================================================

const PDRM_EXTRACTION_PROMPT = `You are a medical study assistant. Extract ONLY high-signal, testable facts from the text.

OUTPUT FORMAT (JSON):
{
  "pattern": "Recurring concept/category this represents (or empty string)",
  "decisionRule": "If-then rule, diagnostic criteria, or treatment decision implied (or empty string)",
  "risk": "Common trap, mistake, contraindication, or edge-case to watch for (or empty string)",
  "mnemonic": "Short anchor phrase to remember this (2-5 words, or empty string)"
}

RULES:
- Extract ONLY decision rules, mechanisms, and testable facts
- Keep each field to 1-2 sentences MAX
- Leave field empty if not applicable
- Focus on "what would be asked on an exam"
- No verbose paragraphs
- No generic summaries

TEXT TO ANALYZE:
`;

const PAGE_EXTRACTION_PROMPT = `You are a medical study assistant. Extract the 3-8 MOST IMPORTANT testable facts from this page.

OUTPUT FORMAT (JSON array, max 8 items):
[
  {
    "quote": "The exact key phrase from the text (15-50 words)",
    "pattern": "Recurring concept this represents",
    "decisionRule": "If-then rule or criteria implied",
    "risk": "Common trap or edge-case",
    "mnemonic": "Short anchor phrase (2-5 words)"
  }
]

RULES:
- Select ONLY high-yield, exam-relevant facts
- Maximum 8 items per page
- Each quote must be directly from the text
- Leave fields empty string if not applicable
- Focus on: diagnoses, treatments, mechanisms, contraindications, criteria

PAGE TEXT:
`;

// ============================================================================
// Heuristic Extraction (Fallback when no LLM available)
// ============================================================================

export function extractPDRMHeuristic(text: string): ExtractionResult {
  const fields: PDRMFields = {
    pattern: '',
    decisionRule: '',
    risk: '',
    mnemonic: ''
  };
  
  const lowerText = text.toLowerCase();
  
  // Pattern detection
  const patternIndicators = [
    /\b(characterized by|defined as|consists of|includes?|features?)\b/i,
    /\b(type|class|category|group|family)\b/i,
    /\b(mechanism|pathway|process)\b/i
  ];
  if (patternIndicators.some(p => p.test(text))) {
    fields.pattern = extractKeyPhrase(text, 'pattern');
  }
  
  // Decision Rule detection
  const decisionIndicators = [
    /\b(if|when|should|must|requires?|indicates?)\b.*\b(then|treat|give|use|avoid)\b/i,
    /\b(criteria|diagnosis|indication|contraindication)\b/i,
    /\b(first[- ]line|treatment of choice|gold standard)\b/i,
    /\b(greater than|less than|>|<|≥|≤)\s*\d/i
  ];
  if (decisionIndicators.some(p => p.test(text))) {
    fields.decisionRule = extractKeyPhrase(text, 'decision');
  }
  
  // Risk detection
  const riskIndicators = [
    /\b(risk|danger|warning|caution|avoid|never|contraindicated)\b/i,
    /\b(side effect|adverse|complication|toxicity)\b/i,
    /\b(mistake|error|trap|pitfall|commonly missed)\b/i,
    /\b(except|unless|but not|however)\b/i
  ];
  if (riskIndicators.some(p => p.test(text))) {
    fields.risk = extractKeyPhrase(text, 'risk');
  }
  
  // Mnemonic detection (acronyms, memorable phrases)
  const acronymMatch = text.match(/\b[A-Z]{2,6}\b/);
  if (acronymMatch) {
    fields.mnemonic = acronymMatch[0];
  }
  
  const primaryType = determinePrimaryType(fields);
  
  // Confidence based on how many indicators matched
  const matchCount = [fields.pattern, fields.decisionRule, fields.risk, fields.mnemonic]
    .filter(f => f.length > 0).length;
  const confidence = Math.min(0.3 + matchCount * 0.2, 0.9);
  
  // Important-only check
  const isImportant = checkImportance(text, fields);
  
  return { fields, primaryType, confidence, isImportant };
}

function extractKeyPhrase(text: string, type: string): string {
  // Extract the most relevant sentence for the type
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  
  // Return first meaningful sentence (max 150 chars)
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (trimmed.length > 15 && trimmed.length < 200) {
      return trimmed.length > 150 ? trimmed.substring(0, 147) + '...' : trimmed;
    }
  }
  
  return text.length > 150 ? text.substring(0, 147) + '...' : text;
}

function checkImportance(text: string, fields: PDRMFields): boolean {
  // Too short
  if (text.length < 20) return false;
  
  // Has structured PDRM content
  const hasContent = Object.values(fields).some(f => f.length > 10);
  if (!hasContent) return false;
  
  // High-signal indicators
  const importantPatterns = [
    /\b(most|least|always|never|first|only)\b/i,
    /\d+\s*(%|mg|ml|g|kg|mmHg|cm|mm)\b/i,
    /\b(diagnosis|treatment|mechanism|pathophysiology)\b/i,
    /\b(criteria|indication|contraindication)\b/i
  ];
  
  return importantPatterns.some(p => p.test(text));
}

// ============================================================================
// Page-Level Heuristic Extraction
// ============================================================================

export function extractPagePDRMHeuristic(
  pageText: string, 
  pageNumber: number,
  maxEntries: number = 6
): PageExtractionResult {
  const entries: PageExtractionResult['entries'] = [];
  
  // Split into paragraphs/sentences
  const paragraphs = pageText.split(/\n\n+/).filter(p => p.trim().length > 30);
  
  for (const para of paragraphs) {
    if (entries.length >= maxEntries) break;
    
    // Extract PDRM for this paragraph
    const result = extractPDRMHeuristic(para);
    
    // Only include if important
    if (result.isImportant && result.primaryType !== 'general') {
      entries.push({
        fields: result.fields,
        primaryType: result.primaryType,
        confidence: result.confidence,
        quote: para.length > 100 ? para.substring(0, 97) + '...' : para
      });
    }
  }
  
  // If we found nothing, try sentence-level
  if (entries.length === 0) {
    const sentences = pageText.match(/[^.!?]+[.!?]+/g) || [];
    
    for (const sentence of sentences) {
      if (entries.length >= Math.min(maxEntries, 3)) break;
      
      const trimmed = sentence.trim();
      if (trimmed.length < 30 || trimmed.length > 300) continue;
      
      const result = extractPDRMHeuristic(trimmed);
      
      if (result.confidence >= 0.5) {
        entries.push({
          fields: result.fields,
          primaryType: result.primaryType,
          confidence: result.confidence,
          quote: trimmed
        });
      }
    }
  }
  
  return { entries, pageNumber };
}

// ============================================================================
// Main Extraction Functions (with debounce)
// ============================================================================

/**
 * Extract PDRM from a highlight (immediate, no debounce)
 */
export async function extractFromHighlight(
  request: ExtractionRequest
): Promise<ExtractionResult> {
  // For now, use heuristic extraction
  // In future, this could call an LLM API
  return extractPDRMHeuristic(request.text);
}

/**
 * Extract PDRM for an entire page (debounced)
 * Returns a promise that resolves with entries or null if cancelled
 */
export function extractFromPage(
  documentId: string,
  pageNumber: number,
  pageText: string,
  onStart?: () => void,
  onComplete?: (result: PageExtractionResult | null) => void
): Promise<PageExtractionResult | null> {
  return new Promise((resolve) => {
    const key = debounceKey(documentId, pageNumber);
    
    // Cancel any pending request for this page
    cancelPendingExtraction(key);
    
    // Debounce
    const timeout = setTimeout(async () => {
      pendingRequests.delete(key);
      
      // Rate limit
      const now = Date.now();
      const timeSinceLastRequest = now - lastRequestTime;
      if (timeSinceLastRequest < MIN_REQUEST_INTERVAL_MS) {
        await new Promise(r => setTimeout(r, MIN_REQUEST_INTERVAL_MS - timeSinceLastRequest));
      }
      lastRequestTime = Date.now();
      
      onStart?.();
      
      // Check if page is already cached
      const store = usePdrmStore.getState();
      if (store.isPageProcessed(documentId, pageNumber)) {
        const existing = store.getEntriesByPage(documentId, pageNumber);
        const result: PageExtractionResult = {
          entries: existing.map(e => ({
            fields: e.fields,
            primaryType: e.primaryType,
            confidence: e.confidence,
            quote: e.evidence.quote
          })),
          pageNumber
        };
        onComplete?.(result);
        resolve(result);
        return;
      }
      
      // Extract (heuristic for now)
      const result = extractPagePDRMHeuristic(pageText, pageNumber);
      
      onComplete?.(result);
      resolve(result);
    }, DEBOUNCE_MS);
    
    pendingRequests.set(key, timeout);
  });
}

/**
 * Create PDRM entry from highlight in AUTO mode
 */
export async function createAutoHighlightPDRM(
  evidence: PDRMEvidence,
  text: string
): Promise<string | null> {
  const store = usePdrmStore.getState();
  
  // Set generating indicator
  const genKey = `highlight_${evidence.highlightId}`;
  store.setGenerating(genKey);
  
  try {
    // Extract PDRM
    const result = await extractFromHighlight({ 
      text, 
      pageNumber: evidence.pageNumber,
      documentId: evidence.documentId,
      highlightId: evidence.highlightId
    });
    
    // Only create entry if important enough
    if (!result.isImportant && result.primaryType === 'general') {
      console.log('⚠️ Highlight not important enough for PDRM');
      return null;
    }
    
    // Create entry
    const id = store.addEntry({
      sourceType: 'highlight',
      status: 'complete',
      primaryType: result.primaryType,
      fields: result.fields,
      evidence: { ...evidence, quote: text.length > 100 ? text.substring(0, 97) + '...' : text },
      isAutoGenerated: true,
      confidence: result.confidence
    });
    
    console.log(`✅ Auto PDRM created: ${result.primaryType} (confidence: ${result.confidence})`);
    return id;
  } finally {
    store.setGenerating(null);
  }
}

/**
 * Create Draft PDRM entry from highlight in MANUAL mode
 */
export function createManualHighlightPDRM(evidence: PDRMEvidence): string {
  const store = usePdrmStore.getState();
  const id = store.createDraftFromHighlight(evidence);
  console.log(`📝 Draft PDRM created for manual completion`);
  return id;
}

/**
 * Process page for Auto PDRM (incremental, cached)
 */
export async function processPageForAutoPDRM(
  documentId: string,
  pageNumber: number,
  pageText: string,
  onProgress?: (status: 'start' | 'complete', count?: number) => void
): Promise<string[]> {
  const store = usePdrmStore.getState();
  
  // Already processed? Return existing
  if (store.isPageProcessed(documentId, pageNumber)) {
    const existing = store.getEntriesByPage(documentId, pageNumber);
    console.log(`📄 Page ${pageNumber} already processed (${existing.length} entries)`);
    return existing.map(e => e.id);
  }
  
  // Set generating indicator
  const genKey = `page_${documentId}_${pageNumber}`;
  store.setGenerating(genKey);
  onProgress?.('start');
  
  try {
    // Extract page PDRM
    const result = await extractFromPage(
      documentId,
      pageNumber,
      pageText,
      undefined,
      undefined
    );
    
    if (!result || result.entries.length === 0) {
      store.markPageProcessed(documentId, pageNumber, []);
      onProgress?.('complete', 0);
      return [];
    }
    
    // Create entries
    const entryIds: string[] = [];
    
    for (const extracted of result.entries) {
      const id = store.addEntry({
        sourceType: 'page',
        status: 'complete',
        primaryType: extracted.primaryType,
        fields: extracted.fields,
        evidence: {
          quote: extracted.quote,
          pageNumber,
          documentId
        },
        isAutoGenerated: true,
        confidence: extracted.confidence
      });
      entryIds.push(id);
    }
    
    // Mark page as processed
    store.markPageProcessed(documentId, pageNumber, entryIds);
    
    console.log(`✅ Page ${pageNumber} processed: ${entryIds.length} PDRM entries`);
    onProgress?.('complete', entryIds.length);
    
    return entryIds;
  } finally {
    store.setGenerating(null);
  }
}
