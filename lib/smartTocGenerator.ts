/**
 * Smart TOC Generator
 *
 * Generates TOC for any PDF using multiple strategies:
 * 1. PDF outline (getOutline) - fastest, most accurate
 * 2. Heading detection - scans pages for heading patterns
 * 3. OCR fallback - for scanned PDFs with no text
 */

// ============================================================================
// Types
// ============================================================================

export interface SmartTOCEntry {
  title: string;
  pageNumber: number;
  level: number;
  children?: SmartTOCEntry[];
  source: 'outline' | 'heading' | 'ocr';
  confidence: number;
}

export interface TOCGeneratorResult {
  entries: SmartTOCEntry[];
  source: 'outline' | 'heading' | 'ocr' | 'none';
  pageCount: number;
  processingTimeMs: number;
  hasText: boolean;
}

export interface PDFOutlineItem {
  title: string;
  dest?: string | any[] | null;
  items?: PDFOutlineItem[];
}

// ============================================================================
// Heading Detection Patterns
// ============================================================================

const HEADING_PATTERNS = {
  // Chapter patterns
  chapter: [
    /^Chapter\s+(\d+|[IVXLCDM]+)[:\.\s]/i,
    /^CHAPTER\s+(\d+|[IVXLCDM]+)/,
    /^Ch\.\s*(\d+)/i,
  ],
  // Section patterns
  section: [
    /^(\d+\.)+\s+[A-Z]/,           // 1.2.3 Title
    /^Section\s+(\d+\.?)+/i,
    /^Part\s+(\d+|[IVXLCDM]+)/i,
  ],
  // Subsection patterns
  subsection: [
    /^(\d+\.)+\d+\s+[A-Z]/,        // 1.2.3 Title
    /^\s*[a-z]\)\s+[A-Z]/,         // a) Title
    /^\s*\(\d+\)\s+[A-Z]/,         // (1) Title
  ],
  // Other structural elements
  structural: [
    /^Introduction$/i,
    /^Conclusion$/i,
    /^Summary$/i,
    /^Appendix\s*[A-Z]?/i,
    /^References$/i,
    /^Bibliography$/i,
    /^Index$/i,
    /^Glossary$/i,
    /^Preface$/i,
    /^Acknowledgments?$/i,
    /^Table of Contents$/i,
    /^List of (Figures|Tables)/i,
  ],
};

// Font size thresholds for heading detection
const FONT_SIZE_THRESHOLDS = {
  h1: 18,
  h2: 14,
  h3: 12,
};

// ============================================================================
// Strategy 1: PDF Outline
// ============================================================================

/**
 * Extract TOC from PDF outline/bookmarks
 */
export async function extractFromOutline(
  pdfDocument: any, // PDFDocumentProxy from PDF.js
): Promise<SmartTOCEntry[]> {
  try {
    const outline = await pdfDocument.getOutline();
    if (!outline || outline.length === 0) {
      return [];
    }

    return await parseOutlineItems(outline, pdfDocument, 0);
  } catch (error) {
    console.warn('Failed to extract outline:', error);
    return [];
  }
}

async function parseOutlineItems(
  items: PDFOutlineItem[],
  pdfDocument: any,
  level: number
): Promise<SmartTOCEntry[]> {
  const entries: SmartTOCEntry[] = [];

  for (const item of items) {
    let pageNumber = 1;

    // Resolve destination to page number
    if (item.dest) {
      try {
        let dest = item.dest;
        if (typeof dest === 'string') {
          dest = await pdfDocument.getDestination(dest);
        }
        if (dest && Array.isArray(dest)) {
          const ref = dest[0];
          if (ref) {
            pageNumber = await pdfDocument.getPageIndex(ref) + 1;
          }
        }
      } catch (e) {
        // Use default page 1 if destination resolution fails
      }
    }

    const entry: SmartTOCEntry = {
      title: item.title?.trim() || 'Untitled',
      pageNumber,
      level,
      source: 'outline',
      confidence: 1.0,
    };

    // Process children recursively
    if (item.items && item.items.length > 0) {
      entry.children = await parseOutlineItems(item.items, pdfDocument, level + 1);
    }

    entries.push(entry);
  }

  return entries;
}

// ============================================================================
// Strategy 2: Heading Detection
// ============================================================================

export interface TextItemWithStyle {
  str: string;
  fontName: string;
  fontSize: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Detect headings from page text content
 */
export async function extractFromHeadings(
  pdfDocument: any,
  maxPages: number = 50 // Limit for performance
): Promise<SmartTOCEntry[]> {
  const entries: SmartTOCEntry[] = [];
  const numPages = Math.min(pdfDocument.numPages, maxPages);

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    try {
      const page = await pdfDocument.getPage(pageNum);
      const textContent = await page.getTextContent();

      const pageHeadings = detectHeadingsOnPage(textContent, pageNum);
      entries.push(...pageHeadings);
    } catch (error) {
      console.warn(`Failed to process page ${pageNum}:`, error);
    }
  }

  // Post-process to build hierarchy
  return buildHeadingHierarchy(entries);
}

function detectHeadingsOnPage(
  textContent: any,
  pageNumber: number
): SmartTOCEntry[] {
  const headings: SmartTOCEntry[] = [];
  const items = textContent.items || [];

  // Group items by line (similar Y position)
  const lines = groupItemsByLine(items);

  for (const line of lines) {
    const text = line.map((item: any) => item.str).join('').trim();
    if (!text || text.length < 3 || text.length > 200) continue;

    // Check patterns
    const headingInfo = classifyHeading(text, line);
    if (headingInfo) {
      headings.push({
        title: cleanHeadingTitle(text),
        pageNumber,
        level: headingInfo.level,
        source: 'heading',
        confidence: headingInfo.confidence,
      });
    }
  }

  return headings;
}

function groupItemsByLine(items: any[]): any[][] {
  const lines: any[][] = [];
  const threshold = 5; // Y tolerance

  for (const item of items) {
    if (!item.str?.trim()) continue;

    // Find existing line with similar Y
    const existingLine = lines.find(
      (line) => Math.abs(line[0].transform[5] - item.transform[5]) < threshold
    );

    if (existingLine) {
      existingLine.push(item);
    } else {
      lines.push([item]);
    }
  }

  // Sort lines by Y (top to bottom)
  lines.sort((a, b) => b[0].transform[5] - a[0].transform[5]);

  return lines;
}

function classifyHeading(
  text: string,
  lineItems: any[]
): { level: number; confidence: number } | null {
  // Check chapter patterns (level 0)
  for (const pattern of HEADING_PATTERNS.chapter) {
    if (pattern.test(text)) {
      return { level: 0, confidence: 0.9 };
    }
  }

  // Check section patterns (level 1)
  for (const pattern of HEADING_PATTERNS.section) {
    if (pattern.test(text)) {
      return { level: 1, confidence: 0.85 };
    }
  }

  // Check subsection patterns (level 2)
  for (const pattern of HEADING_PATTERNS.subsection) {
    if (pattern.test(text)) {
      return { level: 2, confidence: 0.8 };
    }
  }

  // Check structural elements (level 0)
  for (const pattern of HEADING_PATTERNS.structural) {
    if (pattern.test(text)) {
      return { level: 0, confidence: 0.95 };
    }
  }

  // Check by font size (if available)
  const avgFontSize = getAverageFontSize(lineItems);
  if (avgFontSize >= FONT_SIZE_THRESHOLDS.h1) {
    return { level: 0, confidence: 0.7 };
  }
  if (avgFontSize >= FONT_SIZE_THRESHOLDS.h2) {
    return { level: 1, confidence: 0.6 };
  }

  // Check if line is all caps (potential heading)
  if (text === text.toUpperCase() && text.length > 5 && text.length < 100) {
    return { level: 1, confidence: 0.5 };
  }

  return null;
}

function getAverageFontSize(items: any[]): number {
  if (items.length === 0) return 0;
  const sizes = items
    .map((item) => item.height || 12)
    .filter((h) => h > 0);
  return sizes.length > 0
    ? sizes.reduce((a, b) => a + b, 0) / sizes.length
    : 0;
}

function cleanHeadingTitle(text: string): string {
  return text
    .replace(/^[\d.]+\s*/, '') // Remove leading numbers
    .replace(/\s+/g, ' ')       // Normalize whitespace
    .trim();
}

function buildHeadingHierarchy(entries: SmartTOCEntry[]): SmartTOCEntry[] {
  // Sort by page then by level
  entries.sort((a, b) => {
    if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
    return a.level - b.level;
  });

  // Remove duplicates (same title on same page)
  const unique = entries.filter((entry, index, arr) => {
    const prevIndex = arr.findIndex(
      (e) => e.title === entry.title && e.pageNumber === entry.pageNumber
    );
    return prevIndex === index;
  });

  return unique;
}

// ============================================================================
// Strategy 2b: TOC Recovery Scan (pages 1-25 for "Contents" page)
// ============================================================================

/**
 * TOC Recovery Scan: looks for a "Contents" or "Table of Contents" page
 * in pages 1-25 and parses chapter/section entries from it.
 */
export async function tocRecoveryScan(
  pdfDocument: any,
  maxPages: number = 25
): Promise<SmartTOCEntry[]> {
  const entries: SmartTOCEntry[] = [];
  const numPages = Math.min(pdfDocument.numPages, maxPages);

  // Patterns that indicate a TOC page
  const TOC_PAGE_MARKERS = [
    /table\s+of\s+contents/i,
    /\bcontents\b/i,
  ];

  // Patterns for TOC entries: "Chapter 1 ... 15" or "1. Introduction ... 3"
  const TOC_ENTRY_PATTERNS = [
    // "Chapter 1: Title ........ 15" or "Chapter I Title 15"
    /^(Chapter\s+(?:\d+|[IVXLCDM]+)[:\.\s]+.+?)\s+(\d+)\s*$/im,
    // "1. Title ........ 15" or "1 Title 15"
    /^(\d+[\.\)]\s*.+?)\s+(\d+)\s*$/m,
    // "Section 1.2 Title ... 45"
    /^((?:Section|Part)\s+[\d\.]+.+?)\s+(\d+)\s*$/im,
    // "Introduction ........ 1" (structural with dots/spaces + page num)
    /^([A-Z][a-zA-Z\s]+?)\s*[\.·…\s]{3,}\s*(\d+)\s*$/m,
    // Numbered section: "1.2 Title .... 23"
    /^((?:\d+\.)+\d*\s+[A-Z].+?)\s+(\d+)\s*$/m,
  ];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    try {
      const page = await pdfDocument.getPage(pageNum);
      const textContent = await page.getTextContent();
      const lines = groupItemsByLine(textContent.items || []);
      const fullText = lines.map((line: any[]) => line.map((item: any) => item.str).join('')).join('\n');

      // Check if this looks like a TOC page
      const isTocPage = TOC_PAGE_MARKERS.some(p => p.test(fullText));
      if (!isTocPage) continue;

      // Parse each line for TOC entries
      const textLines = fullText.split('\n').map((l: string) => l.replace(/[\.·…]{3,}/g, '   ').trim()).filter(Boolean);

      for (const line of textLines) {
        // Skip the "Contents" header itself
        if (/^(table\s+of\s+)?contents$/i.test(line.trim())) continue;

        for (const pattern of TOC_ENTRY_PATTERNS) {
          const match = line.match(pattern);
          if (match) {
            const title = match[1].replace(/\s+/g, ' ').trim();
            const targetPage = parseInt(match[2], 10);
            if (targetPage > 0 && targetPage <= pdfDocument.numPages && title.length > 2) {
              const level = /^Chapter\s/i.test(title) ? 0
                : /^(?:Section|Part)\s/i.test(title) ? 0
                : /^\d+\.\d+/.test(title) ? 1
                : 0;
              entries.push({
                title: cleanHeadingTitle(title),
                pageNumber: targetPage,
                level,
                source: 'heading',
                confidence: 0.8,
              });
            }
            break; // matched, move to next line
          }
        }
      }

      // If we found entries on a TOC page, don't scan more pages
      if (entries.length > 0) break;
    } catch (error) {
      console.warn(`TOC recovery scan failed on page ${pageNum}:`, error);
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  return entries.filter(e => {
    const key = `${e.title}|${e.pageNumber}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ============================================================================
// Strategy 3: OCR Fallback (stub - requires Tesseract.js)
// ============================================================================

/**
 * Check if pages have extractable text
 */
export async function checkHasText(pdfDocument: any): Promise<boolean> {
  try {
    // Check first few pages
    const pagesToCheck = Math.min(5, pdfDocument.numPages);

    for (let i = 1; i <= pagesToCheck; i++) {
      const page = await pdfDocument.getPage(i);
      const textContent = await page.getTextContent();
      const text = textContent.items
        .map((item: any) => item.str)
        .join('')
        .trim();

      if (text.length > 50) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * OCR pages and extract headings (stub implementation)
 */
export async function extractFromOCR(
  pdfDocument: any,
  maxPages: number = 20
): Promise<SmartTOCEntry[]> {
  // This would require Tesseract.js integration
  // For now, return empty array
  console.warn('OCR extraction not implemented - requires Tesseract.js');
  return [];
}

// ============================================================================
// Main Generator Function
// ============================================================================

/**
 * Generate TOC using best available strategy
 */
export async function generateSmartTOC(
  pdfDocument: any
): Promise<TOCGeneratorResult> {
  const startTime = performance.now();
  let entries: SmartTOCEntry[] = [];
  let source: TOCGeneratorResult['source'] = 'none';
  let hasText = true;

  try {
    // Strategy 1: Try PDF outline first (fastest)
    entries = await extractFromOutline(pdfDocument);
    if (entries.length >= 3) {
      source = 'outline';
    } else {
      entries = []; // Discard weak outline results
    }

    // Strategy 2: If no outline, try heading detection
    if (entries.length === 0) {
      hasText = await checkHasText(pdfDocument);

      if (hasText) {
        entries = await extractFromHeadings(pdfDocument);
        if (entries.length >= 3) {
          source = 'heading';
        } else {
          entries = []; // Discard weak results
        }
      }
    }

    // Strategy 2b: If <3 results or only generic stubs, run TOC Recovery Scan
    if (entries.length < 3) {
      const recovered = await tocRecoveryScan(pdfDocument);
      if (recovered.length >= 1) {
        entries = recovered;
        source = 'heading';
      }
    }

    // Strategy 3: If no text, try OCR (expensive)
    if (entries.length === 0 && !hasText) {
      entries = await extractFromOCR(pdfDocument);
      if (entries.length > 0) {
        source = 'ocr';
      }
    }

    // If still no entries, return explicit "not detected" state (no fake stubs)
    if (entries.length === 0) {
      source = 'none';
    }

    return {
      entries,
      source,
      pageCount: pdfDocument.numPages,
      processingTimeMs: performance.now() - startTime,
      hasText,
    };
  } catch (error) {
    console.error('TOC generation failed:', error);
    return {
      entries: [],
      source: 'none',
      pageCount: pdfDocument?.numPages || 0,
      processingTimeMs: performance.now() - startTime,
      hasText: false,
    };
  }
}

/**
 * Create basic page-based TOC as fallback
 */
function createBasicTOC(pageCount: number): SmartTOCEntry[] {
  const entries: SmartTOCEntry[] = [];
  const chunkSize = Math.ceil(pageCount / 10);

  for (let i = 0; i < 10 && i * chunkSize < pageCount; i++) {
    const startPage = i * chunkSize + 1;
    entries.push({
      title: `Pages ${startPage}-${Math.min((i + 1) * chunkSize, pageCount)}`,
      pageNumber: startPage,
      level: 0,
      source: 'outline',
      confidence: 0.5,
    });
  }

  return entries;
}

// ============================================================================
// Flatten TOC for display
// ============================================================================

export function flattenTOC(entries: SmartTOCEntry[]): SmartTOCEntry[] {
  const flat: SmartTOCEntry[] = [];

  function traverse(items: SmartTOCEntry[]) {
    for (const item of items) {
      flat.push(item);
      if (item.children) {
        traverse(item.children);
      }
    }
  }

  traverse(entries);
  return flat;
}
