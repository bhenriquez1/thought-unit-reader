// lib/tocTypes.ts
// TOC v2 Type Definitions
// Centralized schemas and interfaces for Table of Contents parsing

/**
 * Warning codes for structured error reporting
 */
export type WarningCode =
  | 'SCANNED_PDF_DETECTED'
  | 'DOCX_NOT_SUPPORTED_YET'
  | 'LOW_CONFIDENCE_TOC'
  | 'MULTIPLE_TOC_MERGED'
  | 'EMPTY_PAGE_DETECTED'
  | 'MISSING_HEADING_TEXT'
  | 'PAGE_OUT_OF_BOUNDS'
  | 'DUPLICATE_TOC_ENTRIES'
  | 'OCR_REQUIRED'
  | 'HEADING_EXTRACTION_FAILED'
  | 'UNKNOWN_ERROR';

/**
 * Structured warning object
 */
export interface Warning {
  code: WarningCode;
  message: string;
  pageIndex?: number;
  tocId?: string;
  severity: 'info' | 'warning' | 'error';
  timestamp: number;
}

/**
 * Confidence score with breakdown
 */
export interface ConfidenceScore {
  overall: number;         // 0-1 overall confidence
  titleMatch: number;      // How well the title matches heading patterns
  hierarchyValid: number;  // How well the hierarchy is structured
  pageReliable: number;    // How reliable the page number is
}

/**
 * Table of Contents Node - single tree structure
 * Uses deterministic IDs based on heading path hash
 */
export interface TocNode {
  id: string;                    // Deterministic: hash(normalized heading path) or fallback with pageIndex
  title: string;                 // Exact title as in the book
  pageIndex: number;             // 0-based page index
  level: number;                 // Hierarchy depth: 0=Part, 1=Chapter, 2=Section, 3=Subsection
  confidence: ConfidenceScore;   // Confidence breakdown
  children: TocNode[];           // Nested children for hierarchy
  
  // Optional metadata
  originalText?: string;         // Raw text before normalization
  headingType?: 'part' | 'chapter' | 'section' | 'subsection' | 'appendix' | 'unknown';
}

/**
 * Structured block types for page content
 */
export type BlockType = 'heading' | 'paragraph' | 'list' | 'table' | 'figure' | 'code' | 'unknown';

/**
 * Structured content block within a page
 */
export interface ContentBlock {
  type: BlockType;
  text: string;
  level?: number;           // For headings: hierarchy level
  items?: string[];         // For lists: list items
  confidence: number;       // 0-1 confidence for this block
  boundingBox?: {           // Optional position info
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/**
 * Page block - one entry per PDF page
 */
export interface PageBlock {
  pageIndex: number;           // 0-based page index (MUST match PDF page)
  rawText: string;             // Best-effort raw text extraction
  blocks: ContentBlock[];      // Structured content blocks
  detectedHeadings: string[];  // Headings found on this page
  confidence: number;          // 0-1 overall confidence for this page
  isScanned: boolean;          // True if likely a scanned/image page
  isEmpty: boolean;            // True if no text content found
  metadata: {
    charCount: number;
    wordCount: number;
    lineCount: number;
    hasImages: boolean;
  };
}

/**
 * TOC Anchor mapping - tocId to pageIndex
 */
export type TocAnchors = Record<string, number>;

/**
 * Complete parsing result - the output contract
 */
export interface ParseResult {
  toc: TocNode[];                    // Single tree only (even if multiple detected → merged)
  pages: PageBlock[];                // One entry per PDF page (pages.length === PDF page count)
  tocAnchors: TocAnchors;            // tocId → pageIndex mapping
  warnings: Warning[];               // Structured warnings with codes
  metadata: {
    documentTitle?: string;
    totalPages: number;
    parseTimestamp: number;
    parserVersion: string;
    confidenceOverall: number;       // 0-1 overall document confidence
  };
}

/**
 * Input options for parsing
 */
export interface ParseOptions {
  enableOCR?: boolean;               // Enable OCR for scanned pages (not implemented yet)
  maxPages?: number;                 // Limit pages to process
  minConfidence?: number;            // Minimum confidence threshold for TOC entries
  forceRebuild?: boolean;            // Force rebuild even if cached
  progressCallback?: (progress: ParseProgress) => void;
}

/**
 * Progress tracking during parsing
 */
export interface ParseProgress {
  stage: 'init' | 'extracting' | 'analyzing' | 'building_toc' | 'building_pages' | 'complete';
  currentPage?: number;
  totalPages?: number;
  message: string;
  percentComplete: number;
}

/**
 * Legacy TOCEntry interface for backward compatibility
 */
export interface LegacyTOCEntry {
  title: string;
  pageNumber: number;         // 1-based
  subChapters?: LegacyTOCEntry[];
  level?: number;
  confidence?: number;
}

/**
 * Utility function to convert TocNode to legacy TOCEntry
 */
export function tocNodeToLegacy(node: TocNode): LegacyTOCEntry {
  return {
    title: node.title,
    pageNumber: node.pageIndex + 1,  // Convert 0-based to 1-based
    level: node.level,
    confidence: node.confidence.overall,
    subChapters: node.children.length > 0 
      ? node.children.map(tocNodeToLegacy)
      : undefined
  };
}

/**
 * Utility function to convert legacy TOCEntry to TocNode
 */
export function legacyToTocNode(entry: LegacyTOCEntry, parentPath: string = ''): TocNode {
  const normalizedTitle = normalizeHeadingText(entry.title);
  const headingPath = parentPath ? `${parentPath}/${normalizedTitle}` : normalizedTitle;
  
  return {
    id: generateTocId(headingPath, entry.pageNumber - 1),
    title: entry.title,
    pageIndex: entry.pageNumber - 1,  // Convert 1-based to 0-based
    level: entry.level ?? 0,
    confidence: {
      overall: entry.confidence ?? 0.5,
      titleMatch: entry.confidence ?? 0.5,
      hierarchyValid: 0.5,
      pageReliable: 0.5
    },
    children: (entry.subChapters || []).map(sub => legacyToTocNode(sub, headingPath))
  };
}

/**
 * Normalize heading text for consistent ID generation
 */
export function normalizeHeadingText(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '')  // Remove special chars
    .replace(/\s+/g, '-')          // Spaces to dashes
    .slice(0, 50);                  // Limit length
}

/**
 * Generate deterministic TOC ID from heading path
 * Uses simple hash for consistent IDs across parses
 */
export function generateTocId(headingPath: string, pageIndex: number): string {
  // Simple string hash for determinism
  let hash = 0;
  for (let i = 0; i < headingPath.length; i++) {
    const char = headingPath.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  const hashStr = Math.abs(hash).toString(36).slice(0, 8);
  return `toc-${hashStr}-p${pageIndex}`;
}

/**
 * Create a warning object
 */
export function createWarning(
  code: WarningCode,
  message: string,
  options?: { pageIndex?: number; tocId?: string; severity?: Warning['severity'] }
): Warning {
  return {
    code,
    message,
    pageIndex: options?.pageIndex,
    tocId: options?.tocId,
    severity: options?.severity ?? 'warning',
    timestamp: Date.now()
  };
}

/**
 * Parser version for tracking
 */
export const PARSER_VERSION = '2.0.0';
