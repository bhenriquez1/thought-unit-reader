// lib/page-intelligence/segmenter.ts
// Turn page text into structured segments (paragraphs, headings, lists)

import type { Segment, SegmentKind } from './types';
import { generateId } from './types';

// ============================================================================
// Configuration
// ============================================================================

const MIN_PARAGRAPH_LENGTH = 20;
const MAX_HEADING_LENGTH = 100;
const HEADING_ALL_CAPS_THRESHOLD = 0.7; // 70% uppercase = heading
const TINY_LINE_THRESHOLD = 15; // Lines shorter than this get merged

// ============================================================================
// Patterns for segment detection
// ============================================================================

const LIST_PATTERNS = [
  /^[\•\-\*\>\→]\s+/,           // Bullet points: •, -, *, >, →
  /^\d+[\.\)\:]\s+/,             // Numbered: 1. 1) 1:
  /^\([a-z]\)\s+/i,              // Lettered: (a), (A)
  /^[a-z][\.\)]\s+/i,            // Lettered: a. a)
  /^[ivxIVX]+[\.\)]\s+/,         // Roman numerals: i. ii. III)
];

const CAPTION_PATTERNS = [
  /^(Figure|Fig\.?|Table|Chart|Graph|Diagram|Image|Photo)\s*\d+/i,
  /^Source:/i,
  /^Note:/i,
];

const TABLE_HINT_PATTERNS = [
  /\|\s*\|/,                     // Table cell dividers
  /^\s*[\w]+\s{3,}[\w]+/,        // Wide spacing suggesting columns
  /\t{2,}/,                      // Multiple tabs (tabular data)
];

// ============================================================================
// Helpers
// ============================================================================

function isAllCaps(text: string): boolean {
  const letters = text.replace(/[^a-zA-Z]/g, '');
  if (letters.length < 3) return false;
  const uppercase = text.replace(/[^A-Z]/g, '');
  return uppercase.length / letters.length >= HEADING_ALL_CAPS_THRESHOLD;
}

function isTitleCase(text: string): boolean {
  const words = text.trim().split(/\s+/);
  if (words.length < 2 || words.length > 12) return false;

  const capitalizedWords = words.filter(w => {
    if (w.length < 2) return true; // Skip tiny words
    return /^[A-Z]/.test(w);
  });

  return capitalizedWords.length / words.length >= 0.6;
}

function isHeading(text: string): boolean {
  const trimmed = text.trim();

  // Too long for heading
  if (trimmed.length > MAX_HEADING_LENGTH) return false;

  // All caps
  if (isAllCaps(trimmed)) return true;

  // Title case with short length
  if (trimmed.length < 60 && isTitleCase(trimmed)) return true;

  // Numbered sections: "1.1 Introduction" or "Chapter 1"
  if (/^(\d+\.)+\s+[A-Z]/.test(trimmed)) return true;
  if (/^(Chapter|Section|Part)\s+\d+/i.test(trimmed)) return true;

  // Ends with colon (common heading pattern)
  if (trimmed.length < 50 && trimmed.endsWith(':')) return true;

  return false;
}

function isList(text: string): boolean {
  return LIST_PATTERNS.some(pattern => pattern.test(text.trim()));
}

function isCaption(text: string): boolean {
  return CAPTION_PATTERNS.some(pattern => pattern.test(text.trim()));
}

function isTableHint(text: string): boolean {
  return TABLE_HINT_PATTERNS.some(pattern => pattern.test(text));
}

function detectKind(text: string): SegmentKind {
  if (isCaption(text)) return 'caption';
  if (isTableHint(text)) return 'tableHint';
  if (isList(text)) return 'list';
  if (isHeading(text)) return 'heading';
  return 'paragraph';
}

// ============================================================================
// Main Segmenter
// ============================================================================

export interface SegmentOptions {
  pageNumber: number;
  preserveWhitespace?: boolean;
}

/**
 * Segment page text into structured units
 *
 * Logic:
 * 1. Split on double newlines for paragraphs
 * 2. Detect headings by ALL CAPS or Title Case + short length
 * 3. Detect lists: lines starting with •, -, 1), (a), etc.
 * 4. Merge tiny lines into previous paragraph
 */
export function segmentText(text: string, options: SegmentOptions): Segment[] {
  const { pageNumber, preserveWhitespace = false } = options;
  const segments: Segment[] = [];

  if (!text || text.trim().length === 0) {
    return segments;
  }

  // Step 1: Split on double newlines
  const blocks = text.split(/\n\n+/).filter(b => b.trim().length > 0);

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const lines = block.split('\n').map(l => preserveWhitespace ? l : l.trim());

    // Process each line
    let currentParagraph: string[] = [];

    for (const line of lines) {
      if (!line) continue;

      // Check if this line should be merged with previous
      if (line.length < TINY_LINE_THRESHOLD && currentParagraph.length > 0) {
        currentParagraph.push(line);
        continue;
      }

      // If we have accumulated paragraph text, flush it
      if (currentParagraph.length > 0 && !isList(line)) {
        const paragraphText = currentParagraph.join(' ');
        if (paragraphText.length >= MIN_PARAGRAPH_LENGTH) {
          segments.push({
            id: generateId('seg'),
            pageNumber,
            kind: detectKind(paragraphText),
            text: paragraphText
          });
        }
        currentParagraph = [];
      }

      // Check line type
      const kind = detectKind(line);

      if (kind === 'list') {
        // Lists are kept as individual items
        segments.push({
          id: generateId('seg'),
          pageNumber,
          kind: 'list',
          text: line
        });
      } else if (kind === 'heading' || kind === 'caption' || kind === 'tableHint') {
        // These are kept as separate segments
        segments.push({
          id: generateId('seg'),
          pageNumber,
          kind,
          text: line
        });
      } else {
        // Regular paragraph content
        currentParagraph.push(line);
      }
    }

    // Flush any remaining paragraph
    if (currentParagraph.length > 0) {
      const paragraphText = currentParagraph.join(' ');
      if (paragraphText.length >= MIN_PARAGRAPH_LENGTH) {
        segments.push({
          id: generateId('seg'),
          pageNumber,
          kind: detectKind(paragraphText),
          text: paragraphText
        });
      }
    }
  }

  return segments;
}

// ============================================================================
// Utility: Get headings from segments
// ============================================================================

export function getHeadings(segments: Segment[]): Segment[] {
  return segments.filter(s => s.kind === 'heading');
}

// ============================================================================
// Utility: Group segments under headings
// ============================================================================

export interface HeadingGroup {
  heading: Segment | null;
  segments: Segment[];
}

export function groupSegmentsByHeading(segments: Segment[]): HeadingGroup[] {
  const groups: HeadingGroup[] = [];
  let currentGroup: HeadingGroup = { heading: null, segments: [] };

  for (const segment of segments) {
    if (segment.kind === 'heading') {
      // Start a new group
      if (currentGroup.segments.length > 0 || currentGroup.heading) {
        groups.push(currentGroup);
      }
      currentGroup = { heading: segment, segments: [] };
    } else {
      currentGroup.segments.push(segment);
    }
  }

  // Push final group
  if (currentGroup.segments.length > 0 || currentGroup.heading) {
    groups.push(currentGroup);
  }

  return groups;
}

// ============================================================================
// Utility: Merge consecutive list items
// ============================================================================

export function mergeConsecutiveLists(segments: Segment[]): Segment[] {
  const result: Segment[] = [];
  let listBuffer: string[] = [];
  let listPageNumber = 0;

  const flushList = () => {
    if (listBuffer.length > 0) {
      result.push({
        id: generateId('seg'),
        pageNumber: listPageNumber,
        kind: 'list',
        text: listBuffer.join('\n')
      });
      listBuffer = [];
    }
  };

  for (const segment of segments) {
    if (segment.kind === 'list') {
      if (listBuffer.length === 0) {
        listPageNumber = segment.pageNumber;
      }
      listBuffer.push(segment.text);
    } else {
      flushList();
      result.push(segment);
    }
  }

  flushList();
  return result;
}
