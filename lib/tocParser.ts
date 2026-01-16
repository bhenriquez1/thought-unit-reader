// lib/tocParser.ts
// Enhanced TOC utilities with universal PDF compatibility
// Handles multiple PDF outline formats and robust fallback generation
//
// TOC v2 Feature Flag: Set TOC_V2=true in environment or use useTocV2() to enable
// v2 provides: single TOC tree, PageBlocks, tocAnchors, structured warnings

// ============================================================================
// TOC v2 Re-exports (when enabled via feature flag)
// ============================================================================
import * as TocV2 from './tocParserV2';
import * as TocTypes from './tocTypes';

// Re-export v2 types and functions
export {
  // Functions
  parseDocument,
  updateResultWithPdfPages,
  convertPdfOutlineToToc,
  createPageBlock,
  isFileTypeSupported,
  flattenToc,
  findTocNodeById,
  findTocNodeForPage,
} from './tocParserV2';

// Re-export types from tocTypes
export {
  type TocNode,
  type PageBlock,
  type ParseResult,
  type ParseOptions,
  type Warning,
  type WarningCode,
  type TocAnchors,
  type ConfidenceScore,
  type ContentBlock,
  type ParseProgress,
  // Type utilities
  tocNodeToLegacy,
  legacyToTocNode,
  normalizeHeadingText,
  generateTocId,
  createWarning,
  PARSER_VERSION
} from './tocTypes';

export {
  // Scoring utilities
  calculateTitleConfidence as calculateTitleConfidenceV2,
  detectHeadingType,
  calculateNodeConfidence,
  detectScannedPage,
  generatePageWarnings,
  generateTocWarnings,
  mergeTocTrees,
  calculateDocumentConfidence,
  extractContentBlocks
} from './tocScoring';

// Feature flag check for v2
const TOC_V2_ENABLED = typeof process !== 'undefined' && 
  (process.env?.NEXT_PUBLIC_TOC_V2 === 'true' || process.env?.TOC_V2 === 'true');

/** Check if TOC v2 is enabled */
export function useTocV2(): boolean {
  return TOC_V2_ENABLED;
}

// ============================================================================
// Legacy TOC Types and Functions (v1 - for backward compatibility)
// ============================================================================

export interface TOCEntry {
  title: string;
  pageNumber: number;        // 1-based
  subChapters?: TOCEntry[];  // children
  level?: number;            // depth level for styling
  confidence?: number;       // 0-1, how confident we are this is a real heading
}

// Smart TOC Entry extends regular TOC with PDRM integration
export interface SmartTOCEntry extends TOCEntry {
  id: string;                // Unique identifier for chapter/section
  chapterText?: string;      // Extracted chapter content
  pdrmSections: {
    pattern?: PDRMSectionData;
    decision?: PDRMSectionData;
    mechanism?: PDRMSectionData;
    application?: PDRMSectionData;
    wrongAnswers?: PDRMSectionData;
    visualAnchor?: PDRMSectionData;
    crossLinks?: PDRMSectionData;
    reflection?: PDRMSectionData;
  };
  butlerInsights: ButlerInsightSummary[];
  isProcessed: boolean;      // Has PDRM analysis been completed
  processingStatus: 'pending' | 'processing' | 'complete' | 'error';
  subChapters?: SmartTOCEntry[];  // Override to use Smart entries
}

export interface PDRMSectionData {
  content: string;
  confidence: number;
  insights: ButlerInsightSummary[];
  processingTime: number;
}

export interface ButlerInsightSummary {
  id: string;
  type: 'explain' | 'compare' | 'quiz' | 'mnemonic' | 'timeline' | 'diagram';
  title: string;
  content: string;
  confidence: number;
  anchors: {
    page: number;
    textRange?: { start: number; end: number };
    sectionType: string;
  };
  icon: string;
}

/** Enhanced outline node shape (handles multiple PDF formats). */
export type PdfOutlineNode = {
  title?: string;
  dest?: any;                // PDF destination object
  url?: string;              // URL destination
  pageNumber?: number;       // 1-based if available
  pageIndex?: number;        // 0-based page index
  page?: number;             // alternative page field
  items?: PdfOutlineNode[];  // pdf.js-style children
  subChapters?: PdfOutlineNode[]; // alt key some tools use
  children?: PdfOutlineNode[]; // another common children key
  level?: number;            // nesting level
  bold?: boolean;            // formatting hint
  italic?: boolean;          // formatting hint
  color?: [number, number, number]; // RGB color
};

/** ---------- Enhanced Outline → TOC (preferred) ---------- */
export function outlineToTOC(nodes?: PdfOutlineNode[] | null): TOCEntry[] {
  if (!nodes?.length) return [];
  
  console.log('🧭 Processing PDF outline:', nodes);
  
  const processNode = (node: PdfOutlineNode, level: number = 0): TOCEntry => {
    // Extract page number from various possible fields
    let pageNumber = 1;
    
    if (typeof node.pageNumber === 'number' && node.pageNumber > 0) {
      pageNumber = node.pageNumber;
    } else if (typeof node.pageIndex === 'number' && node.pageIndex >= 0) {
      pageNumber = node.pageIndex + 1; // Convert 0-based to 1-based
    } else if (typeof node.page === 'number' && node.page > 0) {
      pageNumber = node.page;
    } else if (node.dest && typeof node.dest === 'object') {
      // Try to extract page from destination object
      if (Array.isArray(node.dest) && typeof node.dest[0] === 'number') {
        pageNumber = node.dest[0] + 1; // Usually 0-based
      } else if (node.dest.pageIndex !== undefined) {
        pageNumber = node.dest.pageIndex + 1;
      } else if (node.dest.page !== undefined) {
        pageNumber = node.dest.page;
      }
    }
    
    // Clean up title
    const title = (node.title ?? "Untitled").toString().trim();
    
    // Get children from various possible fields
    const children = node.items || node.subChapters || node.children || [];
    
    return {
      title,
      pageNumber: Math.max(1, Math.floor(pageNumber)),
      level,
      confidence: calculateTitleConfidence(title),
      subChapters: children.length > 0 ? children.map(child => processNode(child, level + 1)) : undefined
    };
  };
  
  const result = nodes.map(node => processNode(node));
  console.log('🧭 Processed TOC entries:', result);
  return result;
}

/** Calculate confidence score for a title (0-1) */
function calculateTitleConfidence(title: string): number {
  let confidence = 0.5; // base confidence
  
  // Higher confidence for structured titles
  if (/^(Chapter|Section|Part|Unit)\s+\d+/i.test(title)) confidence += 0.3;
  if (/^\d+\.\d*\s/.test(title)) confidence += 0.2; // numbered sections
  if (/^[A-Z][a-z]/.test(title)) confidence += 0.1; // proper capitalization
  if (title.length > 5 && title.length < 100) confidence += 0.1; // reasonable length
  if (!/^\d+$/.test(title)) confidence += 0.1; // not just a number
  
  // Lower confidence for suspicious titles
  if (title.length < 3) confidence -= 0.3;
  if (title.length > 150) confidence -= 0.2;
  if (/^(page|p\.|fig|figure|table|appendix)\s*\d*$/i.test(title)) confidence -= 0.4;
  
  return Math.max(0, Math.min(1, confidence));
}

/** ---------- Enhanced Public API ---------- */
export function generateTOC(url: string): Promise<TOCEntry[]>;
export function generateTOC(text: string, numPages: number): Promise<TOCEntry[]>;
export function generateTOC(file: File): Promise<TOCEntry[]>;
export async function generateTOC(arg1: string | File, arg2?: number): Promise<TOCEntry[]> {
  if (arg1 instanceof File) {
    // File-based TOC generation
    return generateTOCFromFile(arg1);
  } else if (typeof arg2 === "number") {
    // Legacy signature: (text, numPages)
    return buildTOCFromText(arg1, arg2);
  }
  // URL signature: try to extract from PDF if possible
  return generateTOCFromURL(arg1);
}

/** ---------- Enhanced Text → TOC (robust heuristics) ---------- */
function buildTOCFromText(text: string, numPages: number): TOCEntry[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  
  console.log(`🧭 Building TOC from text: ${lines.length} lines, ${numPages} pages`);

  // Enhanced heuristics for different document types
  const patterns = [
    // Academic papers and textbooks
    { regex: /^(Chapter|CHAPTER)\s+(\d+|[IVX]+)[\s\-:]*(.*)$/i, level: 0, confidence: 0.9 },
    { regex: /^(Section|SECTION)\s+(\d+\.?\d*)[\s\-:]*(.*)$/i, level: 1, confidence: 0.8 },
    { regex: /^(\d+\.?\d*)\s+([A-Z][^.]*[^.])$/i, level: 1, confidence: 0.7 },
    { regex: /^(\d+\.\d+\.?\d*)\s+(.+)$/i, level: 2, confidence: 0.7 },
    
    // Business documents and reports
    { regex: /^(Part|PART)\s+(\d+|[IVX]+)[\s\-:]*(.*)$/i, level: 0, confidence: 0.8 },
    { regex: /^(Executive Summary|Introduction|Conclusion|References|Bibliography|Appendix)$/i, level: 0, confidence: 0.9 },
    
    // Technical manuals
    { regex: /^(\d+)\.\s+([A-Z][^.]*[^.])$/i, level: 0, confidence: 0.6 },
    { regex: /^([A-Z][A-Z\s\-:,'()]{10,})$/i, level: 0, confidence: 0.5 }, // ALL CAPS headings
    
    // Legal documents
    { regex: /^(Article|ARTICLE)\s+(\d+|[IVX]+)[\s\-:]*(.*)$/i, level: 0, confidence: 0.8 },
    
    // General patterns
    { regex: /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*):?\s*$/i, level: 0, confidence: 0.4 }, // Title Case headings
  ];

  const approxLinesPerPage = Math.max(1, Math.floor(lines.length / Math.max(1, numPages)));
  const toc: TOCEntry[] = [];
  const tocStack: TOCEntry[] = []; // Stack to handle nesting

  lines.forEach((line, index) => {
    const pageNumber = Math.min(numPages, Math.floor(index / approxLinesPerPage) + 1);
    
    // Skip very short lines or lines that look like page numbers/footers
    if (line.length < 3 || /^(page\s+)?\d+$/i.test(line) || /^\d+\s*$/.test(line)) {
      return;
    }

    // Try each pattern
    for (const pattern of patterns) {
      const match = line.match(pattern.regex);
      if (match) {
        const title = match[3] || match[2] || match[1] || line;
        const entry: TOCEntry = {
          title: title.trim(),
          pageNumber,
          level: pattern.level,
          confidence: pattern.confidence,
          subChapters: []
        };

        // Handle nesting based on level
        while (tocStack.length > 0 && (tocStack[tocStack.length - 1].level || 0) >= pattern.level) {
          tocStack.pop();
        }

        if (tocStack.length === 0) {
          // Top level entry
          toc.push(entry);
        } else {
          // Nested entry
          const parent = tocStack[tocStack.length - 1];
          if (!parent.subChapters) parent.subChapters = [];
          parent.subChapters.push(entry);
        }

        tocStack.push(entry);
        break; // Found a match, don't try other patterns
      }
    }
  });

  // If we didn't find much, create a basic page-based TOC
  if (toc.length === 0) {
    console.log('🧭 No headings found, creating page-based TOC');
    const pagesPerSection = Math.max(1, Math.floor(numPages / 10)); // Max 10 sections
    for (let i = 1; i <= numPages; i += pagesPerSection) {
      const endPage = Math.min(i + pagesPerSection - 1, numPages);
      toc.push({
        title: endPage === i ? `Page ${i}` : `Pages ${i}-${endPage}`,
        pageNumber: i,
        level: 0,
        confidence: 0.3
      });
    }
  }

  // Filter out low-confidence entries if we have enough high-confidence ones
  const highConfidenceCount = toc.filter(entry => (entry.confidence || 0) > 0.6).length;
  const filteredToc = highConfidenceCount > 3 
    ? toc.filter(entry => (entry.confidence || 0) > 0.5)
    : toc;

  console.log(`🧭 Generated ${filteredToc.length} TOC entries from text`);
  return filteredToc;
}

/** ---------- File-based TOC generation ---------- */
async function generateTOCFromFile(file: File): Promise<TOCEntry[]> {
  try {
    // Try to read text content from PDF
    const text = await extractTextFromPDF(file);
    if (text) {
      // Estimate page count from file size (rough heuristic)
      const estimatedPages = Math.max(1, Math.floor(file.size / 50000)); // ~50KB per page
      return buildTOCFromText(text, estimatedPages);
    }
  } catch (error) {
    console.warn('🧭 Could not extract text from PDF for TOC generation:', error);
  }
  
  // Fallback: create basic TOC based on file size
  const estimatedPages = Math.max(1, Math.floor(file.size / 50000));
  return createFallbackTOC(estimatedPages);
}

/** ---------- URL-based TOC generation ---------- */
async function generateTOCFromURL(url: string): Promise<TOCEntry[]> {
  try {
    // This is a placeholder - in practice, SmartPDFViewer should handle this
    // via onOutline callback. We return empty array to avoid loading PDF twice.
    console.log('🧭 URL-based TOC generation deferred to SmartPDFViewer.onOutline');
    return [];
  } catch (error) {
    console.warn('🧭 Could not generate TOC from URL:', error);
    return createFallbackTOC(10); // Default fallback
  }
}

/** ---------- Utility functions ---------- */
async function extractTextFromPDF(file: File): Promise<string | null> {
  // This would require pdf.js or similar library
  // For now, return null to use fallback methods
  return null;
}

function createFallbackTOC(numPages: number): TOCEntry[] {
  const toc: TOCEntry[] = [];
  const sectionsCount = Math.min(10, Math.max(1, Math.floor(numPages / 5)));
  const pagesPerSection = Math.ceil(numPages / sectionsCount);
  
  for (let i = 0; i < sectionsCount; i++) {
    const startPage = i * pagesPerSection + 1;
    const endPage = Math.min((i + 1) * pagesPerSection, numPages);
    
    toc.push({
      title: `Section ${i + 1}`,
      pageNumber: startPage,
      level: 0,
      confidence: 0.3
    });
  }
  
  console.log(`🧭 Created fallback TOC with ${toc.length} sections for ${numPages} pages`);
  return toc;
}

/** ---------- TOC validation and cleanup ---------- */
export function validateAndCleanTOC(toc: TOCEntry[], maxPages: number): TOCEntry[] {
  const cleanEntry = (entry: TOCEntry): TOCEntry => {
    return {
      ...entry,
      pageNumber: Math.max(1, Math.min(maxPages, entry.pageNumber)),
      title: entry.title.trim() || 'Untitled',
      subChapters: entry.subChapters?.map(cleanEntry).filter(sub => sub.title !== 'Untitled')
    };
  };
  
  return toc
    .map(cleanEntry)
    .filter(entry => entry.title !== 'Untitled' && entry.pageNumber <= maxPages)
    .sort((a, b) => a.pageNumber - b.pageNumber);
}

/** ---------- Smart TOC Generation Functions ---------- */

/**
 * Convert regular TOC entries to Smart TOC entries with PDRM placeholder structure
 */
export function convertToSmartTOC(regularTOC: TOCEntry[]): SmartTOCEntry[] {
  console.log('🧠 Converting regular TOC to Smart TOC:', regularTOC.length, 'entries');
  
  const convertEntry = (entry: TOCEntry, index: number): SmartTOCEntry => {
    const smartEntry: SmartTOCEntry = {
      ...entry,
      id: generateChapterId(entry.title, entry.pageNumber),
      pdrmSections: {}, // Will be populated by PDRM analysis
      butlerInsights: [],
      isProcessed: false,
      processingStatus: 'pending',
      subChapters: entry.subChapters?.map((sub, i) => convertEntry(sub, i))
    };
    
    return smartEntry;
  };
  
  return regularTOC.map(convertEntry);
}

/**
 * Generate a stable chapter ID from title and page number
 */
export function generateChapterId(title: string, pageNumber: number): string {
  const cleanTitle = title.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 50);
  return `chapter-${pageNumber}-${cleanTitle}`;
}

/**
 * Initialize Smart TOC entry with empty PDRM sections
 */
export function initializeSmartTOCEntry(entry: TOCEntry): SmartTOCEntry {
  return {
    ...entry,
    id: generateChapterId(entry.title, entry.pageNumber),
    pdrmSections: {
      pattern: undefined,
      decision: undefined,
      mechanism: undefined,
      application: undefined,
      wrongAnswers: undefined,
      visualAnchor: undefined,
      crossLinks: undefined,
      reflection: undefined
    },
    butlerInsights: [],
    isProcessed: false,
    processingStatus: 'pending',
    subChapters: entry.subChapters?.map(initializeSmartTOCEntry)
  };
}

/**
 * Update Smart TOC entry with PDRM analysis results
 */
export function updateSmartTOCWithPDRM(
  smartEntry: SmartTOCEntry, 
  pdrmResult: any, 
  chapterText: string
): SmartTOCEntry {
  console.log('🧠 Updating Smart TOC entry with PDRM:', smartEntry.id);
  
  // Extract Butler insights from PDRM result
  const insights: ButlerInsightSummary[] = [];
  
  if (pdrmResult.actions) {
    pdrmResult.actions.forEach((action: any, index: number) => {
      const insight: ButlerInsightSummary = {
        id: `insight-${smartEntry.id}-${index}`,
        type: action.type,
        title: getInsightTitle(action.type),
        content: action.payload?.prompt || action.reasoning || '',
        confidence: action.confidence || 0.7,
        anchors: {
          page: smartEntry.pageNumber,
          sectionType: 'auto-generated'
        },
        icon: getInsightIcon(action.type)
      };
      insights.push(insight);
    });
  }
  
  // Build PDRM sections from analysis
  const pdrmSections: SmartTOCEntry['pdrmSections'] = {};
  
  if (pdrmResult.units) {
    pdrmResult.units.forEach((unit: any) => {
      const sectionType = mapUnitToPDRMSection(unit.pdrm);
      if (sectionType) {
        pdrmSections[sectionType] = {
          content: unit.text || '',
          confidence: unit.evidence_score || 0.7,
          insights: insights.filter(insight => 
            insight.type === getInsightTypeForSection(sectionType)
          ),
          processingTime: Date.now() - (pdrmResult.processingStartTime || Date.now())
        };
      }
    });
  }
  
  return {
    ...smartEntry,
    chapterText,
    pdrmSections,
    butlerInsights: insights,
    isProcessed: true,
    processingStatus: 'complete'
  };
}

/**
 * Map PDRM unit type to section key
 */
function mapUnitToPDRMSection(pdrmType: string): keyof SmartTOCEntry['pdrmSections'] | null {
  const mapping: Record<string, keyof SmartTOCEntry['pdrmSections']> = {
    'P': 'pattern',
    'D': 'decision',
    'R': 'mechanism',
    'M': 'application'
  };
  return mapping[pdrmType] || null;
}

/**
 * Get Butler insight title for action type
 */
function getInsightTitle(actionType: string): string {
  const titles: Record<string, string> = {
    'explain': 'Butler Explanation',
    'compare': 'Comparative Analysis',
    'quiz': 'Knowledge Check',
    'mnemonic': 'Memory Aid',
    'timeline': 'Process Timeline',
    'diagram': 'Visual Diagram'
  };
  return titles[actionType] || 'Butler Insight';
}

/**
 * Get icon for Butler insight type
 */
function getInsightIcon(actionType: string): string {
  const icons: Record<string, string> = {
    'explain': '🧠',
    'compare': '⚖️',
    'quiz': '❓',
    'mnemonic': '🎯',
    'timeline': '⏱️',
    'diagram': '📊'
  };
  return icons[actionType] || '💡';
}

/**
 * Get insight type for PDRM section
 */
function getInsightTypeForSection(sectionType: string): string {
  const mapping: Record<string, string> = {
    'pattern': 'explain',
    'decision': 'quiz',
    'mechanism': 'explain',
    'application': 'compare',
    'wrongAnswers': 'quiz',
    'visualAnchor': 'mnemonic',
    'crossLinks': 'compare',
    'reflection': 'quiz'
  };
  return mapping[sectionType] || 'explain';
}

/**
 * Find Smart TOC entry by ID
 */
export function findSmartTOCEntry(smartTOC: SmartTOCEntry[], id: string): SmartTOCEntry | null {
  for (const entry of smartTOC) {
    if (entry.id === id) {
      return entry;
    }
    if (entry.subChapters) {
      const found = findSmartTOCEntry(entry.subChapters, id);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Get all Butler insights from Smart TOC
 */
export function getAllButlerInsights(smartTOC: SmartTOCEntry[]): ButlerInsightSummary[] {
  const allInsights: ButlerInsightSummary[] = [];
  
  const collectInsights = (entries: SmartTOCEntry[]) => {
    entries.forEach(entry => {
      allInsights.push(...entry.butlerInsights);
      if (entry.subChapters) {
        collectInsights(entry.subChapters);
      }
    });
  };
  
  collectInsights(smartTOC);
  return allInsights;
}

/**
 * Get processing statistics for Smart TOC
 */
export function getSmartTOCStats(smartTOC: SmartTOCEntry[]): {
  total: number;
  processed: number;
  pending: number;
  failed: number;
  avgProcessingTime: number;
} {
  let total = 0;
  let processed = 0;
  let pending = 0;
  let failed = 0;
  let totalProcessingTime = 0;
  
  const collectStats = (entries: SmartTOCEntry[]) => {
    entries.forEach(entry => {
      total++;
      switch (entry.processingStatus) {
        case 'complete':
          processed++;
          // Sum processing times from PDRM sections
          Object.values(entry.pdrmSections).forEach(section => {
            if (section) totalProcessingTime += section.processingTime;
          });
          break;
        case 'pending':
        case 'processing':
          pending++;
          break;
        case 'error':
          failed++;
          break;
      }
      if (entry.subChapters) {
        collectStats(entry.subChapters);
      }
    });
  };
  
  collectStats(smartTOC);
  
  return {
    total,
    processed,
    pending,
    failed,
    avgProcessingTime: processed > 0 ? totalProcessingTime / processed : 0
  };
}
