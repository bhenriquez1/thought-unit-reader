/**
 * Syllabus Engine
 *
 * Manages syllabus data and links it to book Blueprint (TOC):
 * - Parse uploaded syllabus files
 * - Auto-generate syllabus from book TOC
 * - Link syllabus items to Blueprint sections
 * - Calculate exam importance scores
 */

import type { SmartTOCEntry } from './smartTocGenerator';

// ============================================================================
// Types
// ============================================================================

export interface LearningOutcome {
  id: string;
  code?: string;      // e.g., "LO1", "2.1"
  description: string;
  verbs: string[];    // Bloom's taxonomy verbs
  topics: string[];   // Related topics
}

export interface AssessmentItem {
  id: string;
  name: string;
  weight: number;     // 0-100
  type: 'exam' | 'quiz' | 'assignment' | 'project' | 'participation';
  topics?: string[];
  date?: string;
}

export interface SyllabusUnit {
  id: string;
  title: string;
  description?: string;
  outcomes: string[]; // LearningOutcome IDs
  topics: string[];
  weekNumber?: number;
  estimatedHours?: number;
  linkedPages?: {
    startPage: number;
    endPage: number;
  };
  examImportance: number; // 0-100 computed score
  tags: string[];
}

export interface Syllabus {
  id: string;
  courseTitle: string;
  courseCode?: string;
  instructor?: string;
  description?: string;
  outcomes: LearningOutcome[];
  assessments: AssessmentItem[];
  units: SyllabusUnit[];
  source: 'uploaded' | 'auto-generated' | 'hybrid';
  createdAt: number;
  linkedBookId?: string;
}

export interface BlueprintLink {
  syllabusUnitId: string;
  tocEntryTitle: string;
  tocPageNumber: number;
  matchType: 'exact' | 'keyword' | 'fuzzy';
  confidence: number;
}

// ============================================================================
// Syllabus Parser
// ============================================================================

/**
 * Parse syllabus from uploaded text
 */
export function parseSyllabusText(text: string): Partial<Syllabus> {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  const syllabus: Partial<Syllabus> = {
    outcomes: [],
    assessments: [],
    units: [],
    source: 'uploaded',
  };

  // Extract course title (usually first line or after "Course:")
  const titleMatch = text.match(/(?:Course|Title)[:\s]+(.+?)(?:\n|$)/i);
  if (titleMatch) {
    syllabus.courseTitle = titleMatch[1].trim();
  } else if (lines.length > 0) {
    syllabus.courseTitle = lines[0];
  }

  // Extract learning outcomes
  const outcomePatterns = [
    /(?:Learning Outcomes?|Objectives?|Goals?)[:\s]*\n([\s\S]*?)(?=\n\n|\n[A-Z]|\$)/i,
    /(?:LO\d+|SLO\d+)[:\.\s]+(.+)/gi,
    /(?:Students? (?:will|should|can))[:\s]+(.+)/gi,
  ];

  for (const pattern of outcomePatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const outcomeText = match[1].trim();
      if (outcomeText.length > 10) {
        const verbs = extractBloomsVerbs(outcomeText);
        syllabus.outcomes!.push({
          id: `outcome-${syllabus.outcomes!.length + 1}`,
          description: outcomeText,
          verbs,
          topics: extractTopics(outcomeText),
        });
      }
    }
  }

  // Extract assessments
  const assessmentPatterns = [
    /(?:Assessment|Grading|Evaluation)[:\s]*\n([\s\S]*?)(?=\n\n|\n[A-Z]|\$)/i,
    /(\w+(?:\s+\w+)?)\s*[-–:]\s*(\d+)%/gi,
  ];

  const assessmentMatch = text.match(assessmentPatterns[0]);
  if (assessmentMatch) {
    const assessmentText = assessmentMatch[1];
    const weightMatches = assessmentText.matchAll(/(\w+(?:\s+\w+)?)\s*[-–:]\s*(\d+)%/gi);
    for (const match of weightMatches) {
      syllabus.assessments!.push({
        id: `assessment-${syllabus.assessments!.length + 1}`,
        name: match[1].trim(),
        weight: parseInt(match[2], 10),
        type: classifyAssessmentType(match[1]),
      });
    }
  }

  // Extract units/modules/weeks
  const unitPatterns = [
    /(?:Week|Module|Unit|Chapter)\s*(\d+)[:\.\s]+(.+?)(?=\n(?:Week|Module|Unit|Chapter)|\n\n|\$)/gi,
    /(\d+\.)\s+(.+?)(?=\n\d+\.|\n\n|\$)/gi,
  ];

  for (const pattern of unitPatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const title = match[2].trim();
      if (title.length > 3) {
        const topics = extractTopics(title);
        syllabus.units!.push({
          id: `unit-${syllabus.units!.length + 1}`,
          title,
          topics,
          outcomes: [],
          weekNumber: parseInt(match[1], 10) || undefined,
          examImportance: 50, // Default, will be computed later
          tags: [],
        });
      }
    }
  }

  return syllabus;
}

function extractBloomsVerbs(text: string): string[] {
  const bloomsVerbs = [
    'remember', 'recall', 'recognize', 'identify', 'list', 'define',
    'understand', 'explain', 'describe', 'interpret', 'summarize',
    'apply', 'use', 'implement', 'demonstrate', 'solve',
    'analyze', 'compare', 'contrast', 'examine', 'differentiate',
    'evaluate', 'assess', 'critique', 'judge', 'justify',
    'create', 'design', 'develop', 'construct', 'produce',
  ];

  const found: string[] = [];
  const lower = text.toLowerCase();

  for (const verb of bloomsVerbs) {
    if (lower.includes(verb)) {
      found.push(verb);
    }
  }

  return found;
}

function extractTopics(text: string): string[] {
  // Extract noun phrases and key terms
  const topics: string[] = [];

  // Remove common words
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
    'will', 'should', 'can', 'be', 'is', 'are', 'was', 'were', 'been',
    'have', 'has', 'had', 'do', 'does', 'did', 'this', 'that', 'these', 'those',
  ]);

  const words = text.toLowerCase().split(/\s+/);
  const filtered = words.filter((w) => w.length > 3 && !stopWords.has(w));

  // Extract capitalized terms from original text
  const capitalizedTerms = text.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) || [];
  topics.push(...capitalizedTerms);

  // Add filtered words
  topics.push(...filtered.slice(0, 5));

  return [...new Set(topics)];
}

function classifyAssessmentType(name: string): AssessmentItem['type'] {
  const lower = name.toLowerCase();
  if (/exam|test|final|midterm/.test(lower)) return 'exam';
  if (/quiz/.test(lower)) return 'quiz';
  if (/project|presentation/.test(lower)) return 'project';
  if (/participation|attendance/.test(lower)) return 'participation';
  return 'assignment';
}

// ============================================================================
// Auto-Generate Syllabus from TOC
// ============================================================================

/**
 * Generate syllabus structure from book TOC
 */
export function generateSyllabusFromTOC(
  tocEntries: SmartTOCEntry[],
  bookTitle: string
): Syllabus {
  const units: SyllabusUnit[] = [];

  // Convert top-level TOC entries to units
  for (const entry of tocEntries) {
    if (entry.level === 0) {
      const topics = extractTopics(entry.title);

      units.push({
        id: `unit-auto-${units.length + 1}`,
        title: entry.title,
        topics,
        outcomes: [],
        linkedPages: {
          startPage: entry.pageNumber,
          endPage: findEndPage(entry, tocEntries),
        },
        examImportance: 50,
        tags: ['auto-generated'],
      });
    }
  }

  return {
    id: `syllabus-auto-${Date.now()}`,
    courseTitle: bookTitle,
    outcomes: [],
    assessments: [
      { id: 'exam-1', name: 'Final Exam', weight: 40, type: 'exam' },
      { id: 'exam-2', name: 'Midterm', weight: 30, type: 'exam' },
      { id: 'quiz-1', name: 'Quizzes', weight: 20, type: 'quiz' },
      { id: 'hw-1', name: 'Homework', weight: 10, type: 'assignment' },
    ],
    units,
    source: 'auto-generated',
    createdAt: Date.now(),
  };
}

function findEndPage(entry: SmartTOCEntry, allEntries: SmartTOCEntry[]): number {
  // Find the next entry at same or higher level
  const startIndex = allEntries.findIndex(
    (e) => e.title === entry.title && e.pageNumber === entry.pageNumber
  );

  for (let i = startIndex + 1; i < allEntries.length; i++) {
    if (allEntries[i].level <= entry.level) {
      return allEntries[i].pageNumber - 1;
    }
  }

  // No next entry, use last page estimate
  return entry.pageNumber + 20;
}

// ============================================================================
// Syllabus-Blueprint Linking
// ============================================================================

/**
 * Link syllabus units to TOC entries
 */
export function linkSyllabusToBlueprint(
  syllabus: Syllabus,
  tocEntries: SmartTOCEntry[]
): BlueprintLink[] {
  const links: BlueprintLink[] = [];

  for (const unit of syllabus.units) {
    // Skip if already has linked pages
    if (unit.linkedPages && unit.linkedPages.startPage > 0) {
      continue;
    }

    // Try exact section number match
    const exactMatch = findExactMatch(unit, tocEntries);
    if (exactMatch) {
      links.push(exactMatch);
      continue;
    }

    // Try keyword overlap
    const keywordMatch = findKeywordMatch(unit, tocEntries);
    if (keywordMatch) {
      links.push(keywordMatch);
      continue;
    }

    // Try fuzzy matching
    const fuzzyMatch = findFuzzyMatch(unit, tocEntries);
    if (fuzzyMatch) {
      links.push(fuzzyMatch);
    }
  }

  return links;
}

function findExactMatch(
  unit: SyllabusUnit,
  tocEntries: SmartTOCEntry[]
): BlueprintLink | null {
  // Extract section number from unit title (e.g., "2.1", "Chapter 3")
  const sectionMatch = unit.title.match(/^(\d+(?:\.\d+)*)/);

  if (sectionMatch) {
    const sectionNum = sectionMatch[1];
    const matched = tocEntries.find((entry) =>
      entry.title.startsWith(sectionNum) ||
      entry.title.includes(sectionNum)
    );

    if (matched) {
      return {
        syllabusUnitId: unit.id,
        tocEntryTitle: matched.title,
        tocPageNumber: matched.pageNumber,
        matchType: 'exact',
        confidence: 0.95,
      };
    }
  }

  return null;
}

function findKeywordMatch(
  unit: SyllabusUnit,
  tocEntries: SmartTOCEntry[]
): BlueprintLink | null {
  const unitWords = new Set(
    unit.title.toLowerCase().split(/\s+/).filter((w) => w.length > 3)
  );
  // Add topics to unit words
  for (const topic of unit.topics) {
    unitWords.add(topic.toLowerCase());
  }

  let bestMatch: SmartTOCEntry | null = null;
  let bestScore = 0;

  for (const entry of tocEntries) {
    const entryWords = new Set(
      entry.title.toLowerCase().split(/\s+/).filter((w) => w.length > 3)
    );

    // Count overlapping words
    let overlap = 0;
    for (const word of unitWords) {
      if (entryWords.has(word)) {
        overlap++;
      }
    }

    const score = overlap / Math.max(unitWords.size, entryWords.size);
    if (score > bestScore && score > 0.3) {
      bestScore = score;
      bestMatch = entry;
    }
  }

  if (bestMatch) {
    return {
      syllabusUnitId: unit.id,
      tocEntryTitle: bestMatch.title,
      tocPageNumber: bestMatch.pageNumber,
      matchType: 'keyword',
      confidence: bestScore,
    };
  }

  return null;
}

function findFuzzyMatch(
  unit: SyllabusUnit,
  tocEntries: SmartTOCEntry[]
): BlueprintLink | null {
  // Simple fuzzy: find entry with most similar title length and some common chars
  const unitTitle = unit.title.toLowerCase();

  let bestMatch: SmartTOCEntry | null = null;
  let bestScore = 0;

  for (const entry of tocEntries) {
    const entryTitle = entry.title.toLowerCase();

    // Levenshtein-ish similarity (simplified)
    let matches = 0;
    const minLen = Math.min(unitTitle.length, entryTitle.length);

    for (let i = 0; i < minLen; i++) {
      if (unitTitle[i] === entryTitle[i]) {
        matches++;
      }
    }

    const score = matches / Math.max(unitTitle.length, entryTitle.length);
    if (score > bestScore && score > 0.2) {
      bestScore = score;
      bestMatch = entry;
    }
  }

  if (bestMatch) {
    return {
      syllabusUnitId: unit.id,
      tocEntryTitle: bestMatch.title,
      tocPageNumber: bestMatch.pageNumber,
      matchType: 'fuzzy',
      confidence: bestScore * 0.7, // Lower confidence for fuzzy
    };
  }

  return null;
}

// ============================================================================
// Exam Importance Calculation
// ============================================================================

/**
 * Calculate exam importance score for each unit
 */
export function calculateExamImportance(syllabus: Syllabus): Syllabus {
  const totalExamWeight = syllabus.assessments
    .filter((a) => a.type === 'exam' || a.type === 'quiz')
    .reduce((sum, a) => sum + a.weight, 0);

  const updatedUnits = syllabus.units.map((unit) => {
    let importance = 0;

    // Factor 1: Learning outcomes coverage (30%)
    const outcomeCoverage = unit.outcomes.length / Math.max(syllabus.outcomes.length, 1);
    importance += outcomeCoverage * 30;

    // Factor 2: Topic repetition across units (20%)
    const topicRepetition = countTopicRepetition(unit.topics, syllabus.units);
    importance += Math.min(topicRepetition * 5, 20);

    // Factor 3: Foundational dependency (30%)
    const isFoundational = isFoundationalTopic(unit.title);
    importance += isFoundational ? 30 : 15;

    // Factor 4: Assessment alignment (20%)
    const assessmentAlignment = calculateAssessmentAlignment(unit, syllabus.assessments);
    importance += assessmentAlignment * 20;

    return {
      ...unit,
      examImportance: Math.min(100, Math.round(importance)),
    };
  });

  return {
    ...syllabus,
    units: updatedUnits,
  };
}

function countTopicRepetition(topics: string[], allUnits: SyllabusUnit[]): number {
  let count = 0;
  for (const topic of topics) {
    for (const unit of allUnits) {
      if (unit.topics.includes(topic)) {
        count++;
      }
    }
  }
  return count / Math.max(topics.length, 1);
}

function isFoundationalTopic(title: string): boolean {
  const foundationalKeywords = [
    'introduction', 'basics', 'fundamentals', 'principles',
    'overview', 'foundation', 'core', 'essential',
    'chapter 1', 'unit 1', 'week 1',
  ];

  const lower = title.toLowerCase();
  return foundationalKeywords.some((kw) => lower.includes(kw));
}

function calculateAssessmentAlignment(
  unit: SyllabusUnit,
  assessments: AssessmentItem[]
): number {
  // Check if any assessment specifically mentions this unit's topics
  for (const assessment of assessments) {
    if (assessment.topics) {
      const overlap = unit.topics.filter((t) =>
        assessment.topics!.some((at) => at.toLowerCase().includes(t.toLowerCase()))
      );
      if (overlap.length > 0) {
        return assessment.weight / 100;
      }
    }
  }
  return 0.5; // Default alignment
}

// ============================================================================
// Apply Links to Syllabus
// ============================================================================

/**
 * Apply blueprint links to syllabus units
 */
export function applySyllabusLinks(
  syllabus: Syllabus,
  links: BlueprintLink[],
  tocEntries: SmartTOCEntry[]
): Syllabus {
  const updatedUnits = syllabus.units.map((unit) => {
    const link = links.find((l) => l.syllabusUnitId === unit.id);

    if (link) {
      // Find the TOC entry and next entry to determine page range
      const tocEntry = tocEntries.find(
        (e) => e.title === link.tocEntryTitle && e.pageNumber === link.tocPageNumber
      );

      if (tocEntry) {
        return {
          ...unit,
          linkedPages: {
            startPage: tocEntry.pageNumber,
            endPage: findEndPage(tocEntry, tocEntries),
          },
        };
      }
    }

    return unit;
  });

  return {
    ...syllabus,
    units: updatedUnits,
  };
}
