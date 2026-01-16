// lib/tocParserV2.ts
// TOC v2 Parser - Enhanced Table of Contents and Page Generation
// Provides: single TOC tree, all pages as PageBlocks, tocAnchors mapping, structured warnings

import {
  type TocNode,
  type PageBlock,
  type ParseResult,
  type ParseOptions,
  type ParseProgress,
  type Warning,
  type ContentBlock,
  type TocAnchors,
  type ConfidenceScore,
  createWarning,
  generateTocId,
  normalizeHeadingText,
  PARSER_VERSION
} from './tocTypes';

import {
  calculateTitleConfidence,
  detectHeadingType,
  calculateNodeConfidence,
  detectScannedPage,
  generatePageWarnings,
  generateTocWarnings,
  mergeTocTrees,
  calculateDocumentConfidence,
  extractContentBlocks
} from './tocScoring';

/**
 * PDF Outline Node from pdf.js
 */
interface PdfOutlineNode {
  title?: string;
  dest?: any;
  url?: string;
  pageNumber?: number;
  pageIndex?: number;
  page?: number;
  items?: PdfOutlineNode[];
  subChapters?: PdfOutlineNode[];
  children?: PdfOutlineNode[];
  level?: number;
  bold?: boolean;
  italic?: boolean;
}

/**
 * Main parsing function - extracts TOC and pages from document
 * This is the primary API for TOC v2
 */
export async function parseDocument(
  source: File | string,
  options: ParseOptions = {}
): Promise<ParseResult> {
  const startTime = Date.now();
  const warnings: Warning[] = [];
  
  // Progress callback wrapper
  const reportProgress = (progress: Partial<ParseProgress>) => {
    options.progressCallback?.({
      stage: 'init',
      percentComplete: 0,
      message: 'Starting...',
      ...progress
    });
  };
  
  reportProgress({ stage: 'init', message: 'Initializing parser', percentComplete: 5 });
  
  try {
    // Check file type
    if (source instanceof File) {
      const fileName = source.name.toLowerCase();
      
      // DOCX not supported yet
      if (fileName.endsWith('.docx') || fileName.endsWith('.doc')) {
        warnings.push(createWarning(
          'DOCX_NOT_SUPPORTED_YET',
          'DOCX format is not yet supported. Please convert to PDF or TXT.',
          { severity: 'error' }
        ));
        
        return createEmptyResult(warnings, startTime);
      }
      
      // Only PDF and TXT supported
      if (!fileName.endsWith('.pdf') && !fileName.endsWith('.txt')) {
        warnings.push(createWarning(
          'UNKNOWN_ERROR',
          `Unsupported file format: ${fileName.split('.').pop()}. Supported: PDF, TXT`,
          { severity: 'error' }
        ));
        
        return createEmptyResult(warnings, startTime);
      }
    }
    
    reportProgress({ stage: 'extracting', message: 'Extracting content', percentComplete: 10 });
    
    // Extract pages and text
    const { pages, pageTexts, totalPages, documentTitle } = await extractPages(source, options, reportProgress);
    
    if (pages.length === 0) {
      warnings.push(createWarning(
        'EMPTY_PAGE_DETECTED',
        'No pages could be extracted from the document.',
        { severity: 'error' }
      ));
      return createEmptyResult(warnings, startTime);
    }
    
    // Generate page warnings (scanned pages, empty pages, etc.)
    for (const page of pages) {
      warnings.push(...generatePageWarnings(page));
    }
    
    reportProgress({ stage: 'analyzing', message: 'Analyzing document structure', percentComplete: 50 });
    
    // Build TOC from various sources
    const tocSources: TocNode[][] = [];
    
    // 1. Try to extract from PDF outline (if available)
    // This will be passed separately via setPdfOutline()
    
    // 2. Build TOC from detected headings in page content
    const headingBasedToc = buildTocFromHeadings(pages, totalPages);
    if (headingBasedToc.length > 0) {
      tocSources.push(headingBasedToc);
    }
    
    // 3. Build TOC from text patterns
    const patternBasedToc = buildTocFromPatterns(pageTexts, totalPages);
    if (patternBasedToc.length > 0) {
      tocSources.push(patternBasedToc);
    }
    
    reportProgress({ stage: 'building_toc', message: 'Building table of contents', percentComplete: 70 });
    
    // Merge TOC sources
    const { merged: toc, warnings: mergeWarnings } = mergeTocTrees(tocSources);
    warnings.push(...mergeWarnings);
    
    // Generate TOC warnings
    warnings.push(...generateTocWarnings(toc, totalPages));
    
    // Build tocAnchors mapping
    const tocAnchors = buildTocAnchors(toc);
    
    reportProgress({ stage: 'building_pages', message: 'Finalizing pages', percentComplete: 90 });
    
    // Calculate overall confidence
    const confidenceOverall = calculateDocumentConfidence(toc, pages);
    
    reportProgress({ stage: 'complete', message: 'Parsing complete', percentComplete: 100 });
    
    return {
      toc,
      pages,
      tocAnchors,
      warnings,
      metadata: {
        documentTitle,
        totalPages,
        parseTimestamp: Date.now(),
        parserVersion: PARSER_VERSION,
        confidenceOverall
      }
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    warnings.push(createWarning(
      'UNKNOWN_ERROR',
      `Parsing failed: ${errorMessage}`,
      { severity: 'error' }
    ));
    
    return createEmptyResult(warnings, startTime);
  }
}

/**
 * Create empty result with warnings
 */
function createEmptyResult(warnings: Warning[], startTime: number): ParseResult {
  return {
    toc: [],
    pages: [],
    tocAnchors: {},
    warnings,
    metadata: {
      totalPages: 0,
      parseTimestamp: Date.now(),
      parserVersion: PARSER_VERSION,
      confidenceOverall: 0
    }
  };
}

/**
 * Extract pages from source file
 */
async function extractPages(
  source: File | string,
  options: ParseOptions,
  reportProgress: (progress: Partial<ParseProgress>) => void
): Promise<{
  pages: PageBlock[];
  pageTexts: string[];
  totalPages: number;
  documentTitle?: string;
}> {
  // For TXT files
  if (source instanceof File && source.name.toLowerCase().endsWith('.txt')) {
    const text = await source.text();
    const lines = text.split('\n');
    
    // Create single page for TXT
    const page = createPageBlock(0, text, false);
    
    return {
      pages: [page],
      pageTexts: [text],
      totalPages: 1,
      documentTitle: source.name.replace('.txt', '')
    };
  }
  
  // For PDF files - we need to use pdf.js
  // This will be called from the component that has access to the PDF document
  // For now, return placeholder that will be filled by setPdfPages()
  
  return {
    pages: [],
    pageTexts: [],
    totalPages: 0,
    documentTitle: source instanceof File ? source.name.replace('.pdf', '') : undefined
  };
}

/**
 * Create a PageBlock from raw text
 */
export function createPageBlock(
  pageIndex: number,
  rawText: string,
  hasImages: boolean = false
): PageBlock {
  const trimmedText = rawText.trim();
  const isScanned = detectScannedPage(trimmedText, hasImages);
  const isEmpty = trimmedText.length === 0;
  
  // Extract content blocks
  const blocks = extractContentBlocks(rawText);
  
  // Extract headings from blocks
  const detectedHeadings = blocks
    .filter(b => b.type === 'heading')
    .map(b => b.text);
  
  // Calculate confidence based on content quality
  let confidence = 0.5;
  if (isEmpty) confidence = 0;
  else if (isScanned) confidence = 0.2;
  else if (trimmedText.length > 100) confidence = 0.8;
  else if (trimmedText.length > 20) confidence = 0.6;
  
  // Adjust for structured content
  if (blocks.length > 1) confidence = Math.min(1, confidence + 0.1);
  if (detectedHeadings.length > 0) confidence = Math.min(1, confidence + 0.1);
  
  return {
    pageIndex,
    rawText,
    blocks,
    detectedHeadings,
    confidence,
    isScanned,
    isEmpty,
    metadata: {
      charCount: rawText.length,
      wordCount: rawText.split(/\s+/).filter(w => w.length > 0).length,
      lineCount: rawText.split('\n').length,
      hasImages
    }
  };
}

/**
 * Build TOC from detected headings in pages
 */
function buildTocFromHeadings(pages: PageBlock[], totalPages: number): TocNode[] {
  const nodes: TocNode[] = [];
  const nodeStack: TocNode[] = []; // Stack for building hierarchy
  
  for (const page of pages) {
    for (const heading of page.detectedHeadings) {
      const { type, level, confidence } = detectHeadingType(heading);
      
      // Only include headings with reasonable confidence
      if (confidence < 0.4) continue;
      
      const node: TocNode = {
        id: generateTocId(normalizeHeadingText(heading), page.pageIndex),
        title: heading,
        pageIndex: page.pageIndex,
        level,
        confidence: calculateNodeConfidence({
          title: heading,
          pageIndex: page.pageIndex,
          level,
          children: []
        }, totalPages),
        children: [],
        headingType: type
      };
      
      // Build hierarchy
      while (nodeStack.length > 0 && nodeStack[nodeStack.length - 1].level >= level) {
        nodeStack.pop();
      }
      
      if (nodeStack.length === 0) {
        nodes.push(node);
      } else {
        nodeStack[nodeStack.length - 1].children.push(node);
      }
      
      nodeStack.push(node);
    }
  }
  
  return nodes;
}

/**
 * Build TOC from text patterns (fallback when no headings detected)
 */
function buildTocFromPatterns(pageTexts: string[], totalPages: number): TocNode[] {
  const nodes: TocNode[] = [];
  const seenTitles = new Set<string>();
  
  // Heading patterns to look for
  const patterns = [
    // Chapter patterns
    { regex: /^(Chapter|CHAPTER)\s+(\d+|[IVX]+)[\s\-:]*(.*)$/gim, level: 1 },
    { regex: /^(Section|SECTION)\s+(\d+\.?\d*)[\s\-:]*(.*)$/gim, level: 2 },
    { regex: /^(\d+)\s+([A-Z][A-Za-z\s]{5,})$/gim, level: 1 },
    { regex: /^(\d+\.\d+)\s+(.+)$/gim, level: 2 },
    { regex: /^(\d+\.\d+\.\d+)\s+(.+)$/gim, level: 3 },
  ];
  
  pageTexts.forEach((text, pageIndex) => {
    const lines = text.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length < 3 || trimmed.length > 200) continue;
      
      for (const { regex, level } of patterns) {
        regex.lastIndex = 0; // Reset regex state
        const match = regex.exec(trimmed);
        
        if (match) {
          const title = (match[3] || match[2] || match[1] || trimmed).trim();
          const normalizedTitle = normalizeHeadingText(title);
          
          // Skip duplicates
          if (seenTitles.has(normalizedTitle)) continue;
          seenTitles.add(normalizedTitle);
          
          const node: TocNode = {
            id: generateTocId(normalizedTitle, pageIndex),
            title,
            pageIndex,
            level,
            confidence: calculateNodeConfidence({
              title,
              pageIndex,
              level,
              children: []
            }, totalPages),
            children: []
          };
          
          nodes.push(node);
          break; // Only match first pattern per line
        }
      }
    }
  });
  
  // Sort by page order
  nodes.sort((a, b) => a.pageIndex - b.pageIndex);
  
  // Build hierarchy from flat list
  return buildHierarchy(nodes);
}

/**
 * Build hierarchy from flat list of nodes based on levels
 */
function buildHierarchy(flatNodes: TocNode[]): TocNode[] {
  const result: TocNode[] = [];
  const stack: TocNode[] = [];
  
  for (const node of flatNodes) {
    // Pop stack until we find a parent with lower level
    while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
      stack.pop();
    }
    
    if (stack.length === 0) {
      result.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }
    
    stack.push(node);
  }
  
  return result;
}

/**
 * Build tocAnchors mapping from TOC tree
 */
function buildTocAnchors(toc: TocNode[]): TocAnchors {
  const anchors: TocAnchors = {};
  
  function traverse(nodes: TocNode[]): void {
    for (const node of nodes) {
      anchors[node.id] = node.pageIndex;
      traverse(node.children);
    }
  }
  
  traverse(toc);
  return anchors;
}

/**
 * Convert PDF outline to TocNodes
 * Call this when you have access to the PDF outline
 */
export function convertPdfOutlineToToc(
  outline: PdfOutlineNode[] | null,
  totalPages: number
): TocNode[] {
  if (!outline || outline.length === 0) return [];
  
  function processNode(node: PdfOutlineNode, level: number = 0, parentPath: string = ''): TocNode {
    // Extract page number from various possible fields
    let pageIndex = 0;
    
    if (typeof node.pageIndex === 'number' && node.pageIndex >= 0) {
      pageIndex = node.pageIndex;
    } else if (typeof node.pageNumber === 'number' && node.pageNumber > 0) {
      pageIndex = node.pageNumber - 1; // Convert 1-based to 0-based
    } else if (typeof node.page === 'number' && node.page > 0) {
      pageIndex = node.page - 1;
    } else if (node.dest && Array.isArray(node.dest) && typeof node.dest[0] === 'number') {
      pageIndex = node.dest[0];
    }
    
    // Ensure page is within bounds
    pageIndex = Math.max(0, Math.min(pageIndex, totalPages - 1));
    
    const title = (node.title || 'Untitled').toString().trim();
    const normalizedTitle = normalizeHeadingText(title);
    const headingPath = parentPath ? `${parentPath}/${normalizedTitle}` : normalizedTitle;
    
    // Get children from various possible fields
    const children = node.items || node.subChapters || node.children || [];
    
    const tocNode: TocNode = {
      id: generateTocId(headingPath, pageIndex),
      title,
      pageIndex,
      level,
      confidence: calculateNodeConfidence({
        title,
        pageIndex,
        level,
        children: []
      }, totalPages),
      children: children.map(child => processNode(child, level + 1, headingPath))
    };
    
    return tocNode;
  }
  
  return outline.map(node => processNode(node));
}

/**
 * Update ParseResult with PDF-extracted pages
 * Call this when you have page data from pdf.js
 */
export function updateResultWithPdfPages(
  result: ParseResult,
  pageTexts: string[],
  pdfOutline?: PdfOutlineNode[] | null
): ParseResult {
  const totalPages = pageTexts.length;
  
  // Create page blocks
  const pages: PageBlock[] = pageTexts.map((text, index) => 
    createPageBlock(index, text, false)
  );
  
  // Generate page warnings
  const pageWarnings: Warning[] = [];
  for (const page of pages) {
    pageWarnings.push(...generatePageWarnings(page));
  }
  
  // Build TOC from multiple sources
  const tocSources: TocNode[][] = [];
  
  // 1. PDF outline (highest priority)
  if (pdfOutline && pdfOutline.length > 0) {
    const outlineToc = convertPdfOutlineToToc(pdfOutline, totalPages);
    if (outlineToc.length > 0) {
      tocSources.push(outlineToc);
    }
  }
  
  // 2. Headings from page content
  const headingBasedToc = buildTocFromHeadings(pages, totalPages);
  if (headingBasedToc.length > 0) {
    tocSources.push(headingBasedToc);
  }
  
  // 3. Pattern-based TOC (fallback)
  if (tocSources.length === 0) {
    const patternBasedToc = buildTocFromPatterns(pageTexts, totalPages);
    if (patternBasedToc.length > 0) {
      tocSources.push(patternBasedToc);
    }
  }
  
  // Merge TOC sources - prefer outline if available
  let toc: TocNode[];
  let mergeWarnings: Warning[] = [];
  
  if (tocSources.length > 0) {
    // If we have PDF outline, use it as primary
    if (pdfOutline && pdfOutline.length > 0) {
      toc = tocSources[0]; // Outline is first
    } else {
      const merged = mergeTocTrees(tocSources);
      toc = merged.merged;
      mergeWarnings = merged.warnings;
    }
  } else {
    toc = [];
  }
  
  // Generate TOC warnings
  const tocWarnings = generateTocWarnings(toc, totalPages);
  
  // Build anchors
  const tocAnchors = buildTocAnchors(toc);
  
  // Calculate confidence
  const confidenceOverall = calculateDocumentConfidence(toc, pages);
  
  // Check for scanned document warning
  const scannedPages = pages.filter(p => p.isScanned).length;
  if (scannedPages > totalPages * 0.5) {
    pageWarnings.push(createWarning(
      'SCANNED_PDF_DETECTED',
      `Document appears to be mostly scanned (${scannedPages}/${totalPages} pages). OCR not enabled; TOC and page text may be incomplete.`,
      { severity: 'warning' }
    ));
  }
  
  return {
    ...result,
    toc,
    pages,
    tocAnchors,
    warnings: [...result.warnings, ...pageWarnings, ...mergeWarnings, ...tocWarnings],
    metadata: {
      ...result.metadata,
      totalPages,
      confidenceOverall
    }
  };
}

/**
 * Quick check if file type is supported
 */
export function isFileTypeSupported(fileName: string): { supported: boolean; warning?: Warning } {
  const ext = fileName.toLowerCase().split('.').pop();
  
  switch (ext) {
    case 'pdf':
    case 'txt':
      return { supported: true };
    case 'docx':
    case 'doc':
      return {
        supported: false,
        warning: createWarning(
          'DOCX_NOT_SUPPORTED_YET',
          'DOCX format is not yet supported. Please convert to PDF or TXT.',
          { severity: 'error' }
        )
      };
    default:
      return {
        supported: false,
        warning: createWarning(
          'UNKNOWN_ERROR',
          `Unsupported file format: ${ext}. Supported formats: PDF, TXT`,
          { severity: 'error' }
        )
      };
  }
}

/**
 * Get a flat list of all TOC entries (for debugging/display)
 */
export function flattenToc(toc: TocNode[]): Array<{ id: string; title: string; pageIndex: number; level: number }> {
  const result: Array<{ id: string; title: string; pageIndex: number; level: number }> = [];
  
  function traverse(nodes: TocNode[]): void {
    for (const node of nodes) {
      result.push({
        id: node.id,
        title: node.title,
        pageIndex: node.pageIndex,
        level: node.level
      });
      traverse(node.children);
    }
  }
  
  traverse(toc);
  return result;
}

/**
 * Find TOC node by ID
 */
export function findTocNodeById(toc: TocNode[], id: string): TocNode | null {
  for (const node of toc) {
    if (node.id === id) return node;
    const found = findTocNodeById(node.children, id);
    if (found) return found;
  }
  return null;
}

/**
 * Find TOC node for a given page
 */
export function findTocNodeForPage(toc: TocNode[], pageIndex: number): TocNode | null {
  let bestMatch: TocNode | null = null;
  let bestPage = -1;
  
  function traverse(nodes: TocNode[]): void {
    for (const node of nodes) {
      if (node.pageIndex <= pageIndex && node.pageIndex > bestPage) {
        bestMatch = node;
        bestPage = node.pageIndex;
      }
      traverse(node.children);
    }
  }
  
  traverse(toc);
  return bestMatch;
}

// Export types for convenience
export type { TocNode, PageBlock, ParseResult, ParseOptions, Warning, TocAnchors };
