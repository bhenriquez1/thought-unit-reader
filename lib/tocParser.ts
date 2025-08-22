// lib/tocParser.ts
// Enhanced TOC utilities with universal PDF compatibility
// Handles multiple PDF outline formats and robust fallback generation

export interface TOCEntry {
  title: string;
  pageNumber: number;        // 1-based
  subChapters?: TOCEntry[];  // children
  level?: number;            // depth level for styling
  confidence?: number;       // 0-1, how confident we are this is a real heading
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
