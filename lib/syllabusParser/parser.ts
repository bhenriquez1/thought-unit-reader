// lib/syllabusParser/parser.ts
// Syllabus Intelligence Parser - Deterministic parsing (no LLM required for v1)

// ============================================================================
// Types
// ============================================================================

export type SyllabusBlockType = 'WEEK' | 'MODULE' | 'EXAM' | 'ASSIGNMENT' | 'LECTURE' | 'LAB' | 'DISCUSSION';

export interface DateRange {
  start?: string;  // ISO date or original text
  end?: string;
}

export interface Reading {
  kind: 'CHAPTER' | 'PAGES' | 'SECTION' | 'TEXT' | 'URL';
  value: string;        // Original text
  normalized?: {
    chapter?: number;
    pageStart?: number;
    pageEnd?: number;
    section?: string;
  };
}

export interface SyllabusBlock {
  id: string;
  type: SyllabusBlockType;
  label: string;           // e.g., "Week 1", "Module 2", "Midterm Exam"
  dateRange?: DateRange;
  topics: string[];        // Extracted topic titles
  readings: Reading[];     // Chapter/page references
  deliverables: string[];  // Assignments, quizzes due
  rawText: string;         // Original block text
}

export interface ParsedSyllabus {
  blocks: SyllabusBlock[];
  metadata: {
    courseTitle?: string;
    instructor?: string;
    term?: string;
    totalWeeks?: number;
    examCount?: number;
  };
}

// ============================================================================
// Block Detection Patterns
// ============================================================================

const BLOCK_PATTERNS = {
  // Week patterns
  week: [
    /^Week\s*(\d+)/im,
    /^Wk\.?\s*(\d+)/im,
    /^W(\d+)\b/im,
  ],

  // Module/Unit patterns
  module: [
    /^Module\s*(\d+)/im,
    /^Unit\s*(\d+)/im,
    /^Part\s*(\d+)/im,
    /^Section\s*(\d+)/im,
  ],

  // Exam patterns
  exam: [
    /\b(Exam|Test)\s*#?(\d+)/i,
    /\b(Midterm|Final)\s*(Exam|Test)?/i,
    /\b(Quiz)\s*#?(\d+)/i,
    /\bAssessment\s*#?(\d+)/i,
  ],

  // Assignment patterns
  assignment: [
    /\b(HW|Homework)\s*#?(\d+)/i,
    /\b(Assignment|Assign\.?)\s*#?(\d+)/i,
    /\b(Lab)\s*#?(\d+)/i,
    /\b(Project)\s*#?(\d+)?/i,
    /\b(Discussion)\s*(Post|Board)?\s*#?(\d+)?/i,
    /\b(Paper|Essay)\s*#?(\d+)?/i,
  ],

  // Lecture patterns
  lecture: [
    /^Lecture\s*(\d+)/im,
    /^Lec\.?\s*(\d+)/im,
    /^Class\s*(\d+)/im,
    /^Session\s*(\d+)/im,
  ],
};

// ============================================================================
// Date Detection Patterns
// ============================================================================

const DATE_PATTERNS = [
  // MM/DD or MM/DD/YY
  /(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/g,

  // Month Day or Month Day, Year
  /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:,?\s*(\d{4}))?\b/gi,

  // Day Month or Day Month Year
  /\b(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)(?:\s*,?\s*(\d{4}))?\b/gi,
];

const DATE_RANGE_PATTERNS = [
  // "Jan 15 - Jan 22" or "1/15 - 1/22"
  /(\d{1,2}\/\d{1,2})\s*[-–—to]+\s*(\d{1,2}\/\d{1,2})/i,
  /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2})\s*[-–—to]+\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)?[a-z]*\s*\d{1,2})/i,
];

// ============================================================================
// Reading Detection Patterns
// ============================================================================

const READING_PATTERNS = {
  // Chapter references
  chapter: [
    /\bCh(?:apter)?\.?\s*(\d+)(?:\s*[-–—&,]\s*(\d+))?/gi,
    /\bChapters?\s+(\d+)\s*(?:[-–—&,and]\s*(\d+))?/gi,
  ],

  // Page references
  pages: [
    /\bpp?\.?\s*(\d+)\s*[-–—]\s*(\d+)/gi,
    /\bpages?\s+(\d+)\s*[-–—to]\s*(\d+)/gi,
    /\bpp?\.?\s*(\d+)(?:\s*,\s*(\d+))*\b/gi,
  ],

  // Section references (e.g., "3.1", "3.1-3.4")
  section: [
    /\b(\d+\.\d+)(?:\s*[-–—]\s*(\d+\.\d+))?/g,
    /\bSect(?:ion)?\.?\s*(\d+(?:\.\d+)?)(?:\s*[-–—]\s*(\d+(?:\.\d+)?))?/gi,
  ],
};

// ============================================================================
// Topic Extraction Patterns
// ============================================================================

const TOPIC_INDICATORS = [
  /^[-•*]\s+(.+)$/gm,                      // Bullet points
  /^(?:Topic|Subject|Content)s?:\s*(.+)/im, // Explicit topic label
  /^\d+\.\s+(.+)$/gm,                       // Numbered items
  /^([A-Z][^.!?\n]{10,60})$/gm,             // Title-like lines
];

// ============================================================================
// Main Parser
// ============================================================================

/**
 * Parse syllabus text into structured blocks
 */
export function parseSyllabus(text: string): ParsedSyllabus {
  const blocks: SyllabusBlock[] = [];
  const metadata = extractMetadata(text);

  // Split into potential blocks
  const rawBlocks = splitIntoBlocks(text);

  rawBlocks.forEach((rawBlock, idx) => {
    const block = parseBlock(rawBlock, idx);
    if (block) {
      blocks.push(block);
    }
  });

  // Sort blocks by type priority and label
  blocks.sort((a, b) => {
    const typePriority: Record<SyllabusBlockType, number> = {
      WEEK: 1, MODULE: 2, LECTURE: 3, LAB: 4, DISCUSSION: 5, ASSIGNMENT: 6, EXAM: 7
    };
    const aPriority = typePriority[a.type] || 99;
    const bPriority = typePriority[b.type] || 99;
    if (aPriority !== bPriority) return aPriority - bPriority;

    // Extract numbers from labels for sorting
    const aNum = parseInt(a.label.match(/\d+/)?.[0] || '0');
    const bNum = parseInt(b.label.match(/\d+/)?.[0] || '0');
    return aNum - bNum;
  });

  return { blocks, metadata };
}

/**
 * Split text into potential blocks based on headers and whitespace
 */
function splitIntoBlocks(text: string): string[] {
  const blocks: string[] = [];

  // Try splitting by double newlines first
  const paragraphs = text.split(/\n\s*\n/);

  let currentBlock = '';

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    // Check if this paragraph starts a new block
    const startsNewBlock = isBlockHeader(trimmed);

    if (startsNewBlock && currentBlock) {
      blocks.push(currentBlock.trim());
      currentBlock = trimmed;
    } else if (startsNewBlock) {
      currentBlock = trimmed;
    } else {
      currentBlock += '\n\n' + trimmed;
    }
  }

  if (currentBlock.trim()) {
    blocks.push(currentBlock.trim());
  }

  return blocks;
}

/**
 * Check if text starts with a block header pattern
 */
function isBlockHeader(text: string): boolean {
  const firstLine = text.split('\n')[0];

  for (const patterns of Object.values(BLOCK_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(firstLine)) return true;
    }
  }

  return false;
}

/**
 * Parse a single block of text
 */
function parseBlock(text: string, index: number): SyllabusBlock | null {
  const blockType = detectBlockType(text);
  if (!blockType) return null;

  const label = extractBlockLabel(text, blockType);
  const dateRange = extractDateRange(text);
  const topics = extractTopics(text);
  const readings = extractReadings(text);
  const deliverables = extractDeliverables(text);

  return {
    id: `block_${blockType.toLowerCase()}_${index}_${Date.now()}`,
    type: blockType,
    label,
    dateRange,
    topics,
    readings,
    deliverables,
    rawText: text,
  };
}

/**
 * Detect the type of block
 */
function detectBlockType(text: string): SyllabusBlockType | null {
  const firstLine = text.split('\n')[0].toLowerCase();

  // Check each block type
  for (const pattern of BLOCK_PATTERNS.exam) {
    if (pattern.test(text)) return 'EXAM';
  }

  for (const pattern of BLOCK_PATTERNS.week) {
    if (pattern.test(firstLine)) return 'WEEK';
  }

  for (const pattern of BLOCK_PATTERNS.module) {
    if (pattern.test(firstLine)) return 'MODULE';
  }

  for (const pattern of BLOCK_PATTERNS.lecture) {
    if (pattern.test(firstLine)) return 'LECTURE';
  }

  for (const pattern of BLOCK_PATTERNS.assignment) {
    if (pattern.test(text)) return 'ASSIGNMENT';
  }

  return null;
}

/**
 * Extract block label (e.g., "Week 1", "Module 2")
 */
function extractBlockLabel(text: string, type: SyllabusBlockType): string {
  const firstLine = text.split('\n')[0];

  const patterns: RegExp[] = BLOCK_PATTERNS[type.toLowerCase() as keyof typeof BLOCK_PATTERNS] || [];

  for (const pattern of patterns) {
    const match = firstLine.match(pattern);
    if (match) {
      return match[0].trim();
    }
  }

  // Fallback: use first line truncated
  return firstLine.substring(0, 50).trim();
}

/**
 * Extract date range from text
 */
function extractDateRange(text: string): DateRange | undefined {
  for (const pattern of DATE_RANGE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return {
        start: match[1],
        end: match[2],
      };
    }
  }

  // Try to find single dates
  const dates: string[] = [];
  for (const pattern of DATE_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      dates.push(match[0]);
    }
  }

  if (dates.length === 1) {
    return { start: dates[0] };
  } else if (dates.length >= 2) {
    return { start: dates[0], end: dates[1] };
  }

  return undefined;
}

/**
 * Extract topics from block text
 */
function extractTopics(text: string): string[] {
  const topics: string[] = [];

  for (const pattern of TOPIC_INDICATORS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const topic = match[1]?.trim();
      if (topic && topic.length > 3 && topic.length < 200) {
        // Filter out readings and dates
        if (!isReading(topic) && !isDateLike(topic)) {
          topics.push(topic);
        }
      }
    }
  }

  // Deduplicate
  return [...new Set(topics)];
}

/**
 * Extract readings (chapters, pages, sections)
 */
function extractReadings(text: string): Reading[] {
  const readings: Reading[] = [];

  // Extract chapters
  for (const pattern of READING_PATTERNS.chapter) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const chapter = parseInt(match[1]);
      const endChapter = match[2] ? parseInt(match[2]) : undefined;

      readings.push({
        kind: 'CHAPTER',
        value: match[0],
        normalized: {
          chapter,
          pageStart: undefined,
          pageEnd: undefined,
        },
      });

      // If range, add end chapter too
      if (endChapter && endChapter > chapter) {
        for (let c = chapter + 1; c <= endChapter; c++) {
          readings.push({
            kind: 'CHAPTER',
            value: `Ch ${c}`,
            normalized: { chapter: c },
          });
        }
      }
    }
  }

  // Extract pages
  for (const pattern of READING_PATTERNS.pages) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      readings.push({
        kind: 'PAGES',
        value: match[0],
        normalized: {
          pageStart: parseInt(match[1]),
          pageEnd: match[2] ? parseInt(match[2]) : parseInt(match[1]),
        },
      });
    }
  }

  // Extract sections
  for (const pattern of READING_PATTERNS.section) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      readings.push({
        kind: 'SECTION',
        value: match[0],
        normalized: {
          section: match[1],
        },
      });
    }
  }

  return readings;
}

/**
 * Extract deliverables (assignments, quizzes, etc.)
 */
function extractDeliverables(text: string): string[] {
  const deliverables: string[] = [];

  for (const pattern of BLOCK_PATTERNS.assignment) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      deliverables.push(match[0].trim());
    }
  }

  // Look for "due" statements
  const duePattern = /\b(?:due|submit|deadline):\s*([^\n]+)/gi;
  const dueMatches = text.matchAll(duePattern);
  for (const match of dueMatches) {
    deliverables.push(match[1].trim());
  }

  return [...new Set(deliverables)];
}

/**
 * Extract course metadata
 */
function extractMetadata(text: string): ParsedSyllabus['metadata'] {
  const metadata: ParsedSyllabus['metadata'] = {};

  // Course title (often at the top)
  const titleMatch = text.match(/^([A-Z][^:\n]{10,100})\n/m);
  if (titleMatch) {
    metadata.courseTitle = titleMatch[1].trim();
  }

  // Instructor
  const instructorMatch = text.match(/\b(?:Instructor|Professor|Dr\.|Prof\.)\s*:?\s*([A-Z][^\n,]{5,50})/i);
  if (instructorMatch) {
    metadata.instructor = instructorMatch[1].trim();
  }

  // Term/Semester
  const termMatch = text.match(/\b((?:Fall|Spring|Summer|Winter)\s+\d{4})/i);
  if (termMatch) {
    metadata.term = termMatch[1];
  }

  // Count weeks and exams
  metadata.totalWeeks = (text.match(/\bWeek\s*\d+/gi) || []).length;
  metadata.examCount = (text.match(/\b(?:Exam|Midterm|Final|Test)\s*#?\d*/gi) || []).length;

  return metadata;
}

// ============================================================================
// Helper Functions
// ============================================================================

function isReading(text: string): boolean {
  return /\b(?:Ch(?:apter)?\.?|pp?\.?|pages?)\s*\d/i.test(text);
}

function isDateLike(text: string): boolean {
  return /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|\d{1,2}\/\d{1,2})/i.test(text);
}
