// lib/tocScoring.ts
// TOC v2 Confidence Scoring and Warning Generation

import {
  type TocNode,
  type PageBlock,
  type Warning,
  type WarningCode,
  type ConfidenceScore,
  type ContentBlock,
  createWarning
} from './tocTypes';

/**
 * Heading detection patterns with confidence scores
 */
const HEADING_PATTERNS: Array<{
  pattern: RegExp;
  type: 'part' | 'chapter' | 'section' | 'subsection' | 'appendix';
  level: number;
  confidence: number;
}> = [
  // Parts (level 0)
  { pattern: /^(Part|PART)\s+([IVX]+|\d+)\s*[:.]?\s*(.*)$/i, type: 'part', level: 0, confidence: 0.95 },
  
  // Chapters (level 1)
  { pattern: /^(Chapter|CHAPTER|Ch\.?)\s+(\d+|[IVX]+)\s*[:.]?\s*(.*)$/i, type: 'chapter', level: 1, confidence: 0.95 },
  { pattern: /^(\d+)\s+([A-Z][A-Za-z\s]{5,})$/i, type: 'chapter', level: 1, confidence: 0.7 },
  
  // Sections (level 2)
  { pattern: /^(Section|SECTION|Sec\.?)\s+(\d+\.?\d*)\s*[:.]?\s*(.*)$/i, type: 'section', level: 2, confidence: 0.9 },
  { pattern: /^(\d+\.\d+)\s+(.+)$/i, type: 'section', level: 2, confidence: 0.85 },
  
  // Subsections (level 3)
  { pattern: /^(\d+\.\d+\.\d+)\s+(.+)$/i, type: 'subsection', level: 3, confidence: 0.85 },
  
  // Appendix (level 1)
  { pattern: /^(Appendix|APPENDIX|App\.?)\s+([A-Z]|\d+)\s*[:.]?\s*(.*)$/i, type: 'appendix', level: 1, confidence: 0.9 },
  
  // Common document sections (level 1)
  { pattern: /^(Executive Summary|Introduction|Conclusion|References|Bibliography|Index|Glossary|Preface|Foreword|Acknowledgments)\s*$/i, type: 'chapter', level: 1, confidence: 0.9 },
  
  // ALL CAPS headings (lower confidence)
  { pattern: /^[A-Z][A-Z\s\-:'()]{10,}$/, type: 'chapter', level: 1, confidence: 0.5 },
  
  // Title Case with minimum words (lowest confidence)
  { pattern: /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,5})$/, type: 'section', level: 2, confidence: 0.4 },
];

/**
 * Calculate confidence score for a heading/title
 */
export function calculateTitleConfidence(title: string): number {
  if (!title || title.trim().length === 0) return 0;
  
  const cleanTitle = title.trim();
  let maxConfidence = 0.3; // Base confidence
  
  // Check against known patterns
  for (const { pattern, confidence } of HEADING_PATTERNS) {
    if (pattern.test(cleanTitle)) {
      maxConfidence = Math.max(maxConfidence, confidence);
    }
  }
  
  // Adjust based on title characteristics
  const adjustments: number[] = [];
  
  // Length adjustments
  if (cleanTitle.length < 3) adjustments.push(-0.3);
  if (cleanTitle.length > 200) adjustments.push(-0.2);
  if (cleanTitle.length >= 5 && cleanTitle.length <= 100) adjustments.push(0.1);
  
  // Just a number - probably page number
  if (/^\d+$/.test(cleanTitle)) adjustments.push(-0.5);
  
  // Contains number prefix - likely structured
  if (/^\d+\./.test(cleanTitle)) adjustments.push(0.15);
  
  // Proper capitalization
  if (/^[A-Z][a-z]/.test(cleanTitle)) adjustments.push(0.05);
  
  // Calculate final confidence
  const totalAdjustment = adjustments.reduce((a, b) => a + b, 0);
  return Math.max(0, Math.min(1, maxConfidence + totalAdjustment));
}

/**
 * Detect heading type and level from text
 */
export function detectHeadingType(text: string): {
  type: 'part' | 'chapter' | 'section' | 'subsection' | 'appendix' | 'unknown';
  level: number;
  confidence: number;
} {
  const cleanText = text.trim();
  
  for (const { pattern, type, level, confidence } of HEADING_PATTERNS) {
    if (pattern.test(cleanText)) {
      return { type, level, confidence };
    }
  }
  
  return { type: 'unknown', level: 2, confidence: 0.3 };
}

/**
 * Calculate overall confidence for a TOC node
 */
export function calculateNodeConfidence(node: Partial<TocNode>, pageCount: number): ConfidenceScore {
  const titleConfidence = calculateTitleConfidence(node.title || '');
  
  // Page reliability: is the page within bounds?
  const pageReliable = node.pageIndex !== undefined && 
    node.pageIndex >= 0 && 
    node.pageIndex < pageCount ? 0.9 : 0.3;
  
  // Hierarchy validity based on level
  const level = node.level ?? 0;
  const hierarchyValid = level >= 0 && level <= 4 ? 0.8 : 0.4;
  
  // Children consistency
  const children = node.children || [];
  const childLevelsValid = children.every(c => (c.level ?? 0) > level);
  const hierarchyBonus = childLevelsValid ? 0.1 : 0;
  
  return {
    overall: Math.min(1, (titleConfidence * 0.5 + pageReliable * 0.3 + hierarchyValid * 0.2 + hierarchyBonus)),
    titleMatch: titleConfidence,
    hierarchyValid: Math.min(1, hierarchyValid + hierarchyBonus),
    pageReliable
  };
}

/**
 * Detect if a page is likely scanned (minimal text, possibly images)
 */
export function detectScannedPage(rawText: string, hasImages: boolean = false): boolean {
  const textLength = rawText.trim().length;
  
  // Very little text (< 20 chars) and has images suggests scanned
  if (textLength < 20 && hasImages) return true;
  
  // No text at all
  if (textLength === 0) return true;
  
  // Text exists but mostly non-alphanumeric (OCR garbage)
  const alphanumeric = rawText.replace(/[^a-zA-Z0-9]/g, '');
  if (alphanumeric.length < textLength * 0.3 && textLength > 10) return true;
  
  return false;
}

/**
 * Generate warnings for a page
 */
export function generatePageWarnings(page: PageBlock): Warning[] {
  const warnings: Warning[] = [];
  
  if (page.isScanned) {
    warnings.push(createWarning(
      'SCANNED_PDF_DETECTED',
      `Page ${page.pageIndex + 1} appears to be scanned. OCR not enabled; text may be incomplete.`,
      { pageIndex: page.pageIndex, severity: 'warning' }
    ));
  }
  
  if (page.isEmpty) {
    warnings.push(createWarning(
      'EMPTY_PAGE_DETECTED',
      `Page ${page.pageIndex + 1} contains no extractable text.`,
      { pageIndex: page.pageIndex, severity: 'info' }
    ));
  }
  
  if (page.confidence < 0.3) {
    warnings.push(createWarning(
      'LOW_CONFIDENCE_TOC',
      `Page ${page.pageIndex + 1} has low extraction confidence (${(page.confidence * 100).toFixed(0)}%).`,
      { pageIndex: page.pageIndex, severity: 'warning' }
    ));
  }
  
  return warnings;
}

/**
 * Generate warnings for TOC structure
 */
export function generateTocWarnings(toc: TocNode[], pageCount: number): Warning[] {
  const warnings: Warning[] = [];
  const seenIds = new Set<string>();
  
  function checkNode(node: TocNode): void {
    // Check for duplicates
    if (seenIds.has(node.id)) {
      warnings.push(createWarning(
        'DUPLICATE_TOC_ENTRIES',
        `Duplicate TOC entry detected: "${node.title}"`,
        { tocId: node.id, severity: 'warning' }
      ));
    }
    seenIds.add(node.id);
    
    // Check page bounds
    if (node.pageIndex < 0 || node.pageIndex >= pageCount) {
      warnings.push(createWarning(
        'PAGE_OUT_OF_BOUNDS',
        `TOC entry "${node.title}" references page ${node.pageIndex + 1} but document has only ${pageCount} pages.`,
        { tocId: node.id, pageIndex: node.pageIndex, severity: 'error' }
      ));
    }
    
    // Check title
    if (!node.title || node.title.trim().length === 0) {
      warnings.push(createWarning(
        'MISSING_HEADING_TEXT',
        `TOC entry at page ${node.pageIndex + 1} has no title text.`,
        { tocId: node.id, pageIndex: node.pageIndex, severity: 'warning' }
      ));
    }
    
    // Low confidence
    if (node.confidence.overall < 0.4) {
      warnings.push(createWarning(
        'LOW_CONFIDENCE_TOC',
        `Low confidence TOC entry: "${node.title}" (${(node.confidence.overall * 100).toFixed(0)}%)`,
        { tocId: node.id, severity: 'info' }
      ));
    }
    
    // Recurse children
    node.children.forEach(checkNode);
  }
  
  toc.forEach(checkNode);
  
  return warnings;
}

/**
 * Merge multiple detected TOC trees into a single tree
 * Returns merged tree and adds warning about merge
 */
export function mergeTocTrees(trees: TocNode[][]): { merged: TocNode[]; warnings: Warning[] } {
  const warnings: Warning[] = [];
  
  if (trees.length === 0) {
    return { merged: [], warnings };
  }
  
  if (trees.length === 1) {
    return { merged: trees[0], warnings };
  }
  
  // Multiple trees detected - add warning
  warnings.push(createWarning(
    'MULTIPLE_TOC_MERGED',
    `Multiple TOC structures detected (${trees.length}). Merged into single tree.`,
    { severity: 'info' }
  ));
  
  // Simple merge strategy: take the tree with most entries
  // More sophisticated merge could deduplicate and combine
  let bestTree = trees[0];
  let maxEntries = countTocEntries(trees[0]);
  
  for (let i = 1; i < trees.length; i++) {
    const count = countTocEntries(trees[i]);
    if (count > maxEntries) {
      maxEntries = count;
      bestTree = trees[i];
    }
  }
  
  // Deduplicate within the best tree
  const deduped = deduplicateToc(bestTree);
  
  return { merged: deduped, warnings };
}

/**
 * Count total entries in a TOC tree
 */
function countTocEntries(nodes: TocNode[]): number {
  return nodes.reduce((sum, node) => {
    return sum + 1 + countTocEntries(node.children);
  }, 0);
}

/**
 * Deduplicate TOC entries by ID
 */
function deduplicateToc(nodes: TocNode[]): TocNode[] {
  const seen = new Set<string>();
  
  function dedupe(items: TocNode[]): TocNode[] {
    const result: TocNode[] = [];
    
    for (const node of items) {
      if (seen.has(node.id)) continue;
      seen.add(node.id);
      
      result.push({
        ...node,
        children: dedupe(node.children)
      });
    }
    
    return result;
  }
  
  return dedupe(nodes);
}

/**
 * Calculate overall document confidence
 */
export function calculateDocumentConfidence(toc: TocNode[], pages: PageBlock[]): number {
  if (pages.length === 0) return 0;
  
  // Average page confidence
  const avgPageConfidence = pages.reduce((sum, p) => sum + p.confidence, 0) / pages.length;
  
  // TOC coverage: what percentage of pages have TOC entries?
  const tocPageIndices = new Set<number>();
  function collectPages(nodes: TocNode[]): void {
    nodes.forEach(n => {
      tocPageIndices.add(n.pageIndex);
      collectPages(n.children);
    });
  }
  collectPages(toc);
  const tocCoverage = tocPageIndices.size / pages.length;
  
  // Scanned page penalty
  const scannedRatio = pages.filter(p => p.isScanned).length / pages.length;
  const scannedPenalty = scannedRatio * 0.3;
  
  // Calculate final confidence
  const confidence = (avgPageConfidence * 0.5 + tocCoverage * 0.3 + 0.2) - scannedPenalty;
  
  return Math.max(0, Math.min(1, confidence));
}

/**
 * Extract content blocks from raw text
 */
export function extractContentBlocks(rawText: string): ContentBlock[] {
  if (!rawText || rawText.trim().length === 0) {
    return [];
  }
  
  const blocks: ContentBlock[] = [];
  const lines = rawText.split('\n');
  let currentParagraph: string[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed.length === 0) {
      // Empty line - flush paragraph
      if (currentParagraph.length > 0) {
        blocks.push({
          type: 'paragraph',
          text: currentParagraph.join(' '),
          confidence: 0.8
        });
        currentParagraph = [];
      }
      continue;
    }
    
    // Check if it's a heading
    const headingInfo = detectHeadingType(trimmed);
    if (headingInfo.confidence > 0.6) {
      // Flush current paragraph first
      if (currentParagraph.length > 0) {
        blocks.push({
          type: 'paragraph',
          text: currentParagraph.join(' '),
          confidence: 0.8
        });
        currentParagraph = [];
      }
      
      blocks.push({
        type: 'heading',
        text: trimmed,
        level: headingInfo.level,
        confidence: headingInfo.confidence
      });
      continue;
    }
    
    // Check if it's a list item
    if (/^[•\-\*]\s+/.test(trimmed) || /^\d+[\.\)]\s+/.test(trimmed)) {
      // Flush current paragraph first
      if (currentParagraph.length > 0) {
        blocks.push({
          type: 'paragraph',
          text: currentParagraph.join(' '),
          confidence: 0.8
        });
        currentParagraph = [];
      }
      
      blocks.push({
        type: 'list',
        text: trimmed,
        confidence: 0.85
      });
      continue;
    }
    
    // Regular text - add to current paragraph
    currentParagraph.push(trimmed);
  }
  
  // Flush remaining paragraph
  if (currentParagraph.length > 0) {
    blocks.push({
      type: 'paragraph',
      text: currentParagraph.join(' '),
      confidence: 0.8
    });
  }
  
  return blocks;
}
