// lib/notelab/cognitiveProcessor.ts
// Cognitive Intelligence Layer for NoteLab
// Groups, links, and generates decision rules from notes

// ============================================================================
// Types
// ============================================================================

export interface CognitiveNote {
  id: string;
  content: string;
  category: 'pattern' | 'decision' | 'rule' | 'mnemonic' | 'exception' | 'fact';
  pageNumber: number;
  chapterId?: string;
  source: 'auto' | 'manual' | 'imported';
  confidence: number;
  linkedNoteIds: string[];
  groupId?: string;
}

export interface CognitiveGroup {
  id: string;
  title: string;
  kind: 'concept' | 'process' | 'diagnostic' | 'treatment' | 'risk';
  noteIds: string[];
  decisionRule?: GeneratedDecisionRule;
  highYield: boolean;
  confidence: number;
}

export interface GeneratedDecisionRule {
  id: string;
  condition: string;
  action: string;
  exceptions: string[];
  sourceNoteIds: string[];
  confidence: number;
}

export interface NoteLink {
  sourceId: string;
  targetId: string;
  relationType: 'causes' | 'prevents' | 'requires' | 'contrasts' | 'elaborates' | 'supports';
  strength: number;
}

export interface CognitiveProcessingResult {
  groups: CognitiveGroup[];
  links: NoteLink[];
  decisionRules: GeneratedDecisionRule[];
  highYieldNotes: string[];
  weakAreas: string[];
}

// ============================================================================
// Cognitive Processing Engine
// ============================================================================

/**
 * Process notes to extract cognitive structure
 */
export function processNotesCognitively(
  notes: CognitiveNote[]
): CognitiveProcessingResult {
  console.log('🧠 Cognitive Processor: Processing', notes.length, 'notes');

  // Step 1: Detect links between notes
  const links = detectNoteLinks(notes);
  console.log('🧠 Cognitive Processor: Found', links.length, 'links');

  // Step 2: Group related notes into cognitive clusters
  const groups = buildCognitiveGroups(notes, links);
  console.log('🧠 Cognitive Processor: Created', groups.length, 'groups');

  // Step 3: Generate decision rules from patterns
  const decisionRules = generateDecisionRules(notes, groups);
  console.log('🧠 Cognitive Processor: Generated', decisionRules.length, 'decision rules');

  // Step 4: Identify high-yield content
  const highYieldNotes = identifyHighYieldNotes(notes, groups);

  // Step 5: Detect weak areas (gaps in knowledge)
  const weakAreas = detectWeakAreas(notes, groups);

  return {
    groups,
    links,
    decisionRules,
    highYieldNotes,
    weakAreas,
  };
}

// ============================================================================
// Link Detection
// ============================================================================

const LINK_PATTERNS: Array<{
  pattern: RegExp;
  type: NoteLink['relationType'];
}> = [
  { pattern: /\b(causes?|leads?\s+to|results?\s+in)\b/i, type: 'causes' },
  { pattern: /\b(prevents?|blocks?|inhibits?)\b/i, type: 'prevents' },
  { pattern: /\b(requires?|needs?|depends?\s+on)\b/i, type: 'requires' },
  { pattern: /\b(unlike|contrast|whereas|however|but)\b/i, type: 'contrasts' },
  { pattern: /\b(specifically|namely|for\s+example|such\s+as)\b/i, type: 'elaborates' },
  { pattern: /\b(therefore|thus|confirms?|supports?)\b/i, type: 'supports' },
];

function detectNoteLinks(notes: CognitiveNote[]): NoteLink[] {
  const links: NoteLink[] = [];
  const conceptIndex = buildConceptIndex(notes);

  for (let i = 0; i < notes.length; i++) {
    for (let j = i + 1; j < notes.length; j++) {
      const noteA = notes[i];
      const noteB = notes[j];

      // Skip if already linked
      if (noteA.linkedNoteIds.includes(noteB.id)) continue;

      // Check for shared concepts
      const sharedConcepts = findSharedConcepts(noteA.content, noteB.content, conceptIndex);
      if (sharedConcepts.length > 0) {
        // Determine relation type
        const relationType = detectRelationType(noteA.content, noteB.content);
        const strength = Math.min(1, sharedConcepts.length * 0.3);

        links.push({
          sourceId: noteA.id,
          targetId: noteB.id,
          relationType: relationType,
          strength,
        });
      }
    }
  }

  return links;
}

function buildConceptIndex(notes: CognitiveNote[]): Map<string, string[]> {
  const index = new Map<string, string[]>();

  // Common medical/scientific terms to extract as concepts
  const conceptPatterns = [
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g, // Proper nouns
    /\b(\w+(?:itis|osis|emia|ectomy|plasty|scopy|pathy))\b/gi, // Medical suffixes
    /\b(\w+(?:ase|ine|ol|ide|ate))\b/gi, // Chemical suffixes
    /\b((?:hyper|hypo|poly|oligo|macro|micro)\w+)\b/gi, // Medical prefixes
  ];

  for (const note of notes) {
    const concepts: string[] = [];
    for (const pattern of conceptPatterns) {
      const matches = note.content.matchAll(pattern);
      for (const match of matches) {
        const concept = match[1].toLowerCase();
        if (concept.length >= 4) {
          concepts.push(concept);
          const existing = index.get(concept) || [];
          if (!existing.includes(note.id)) {
            existing.push(note.id);
            index.set(concept, existing);
          }
        }
      }
    }
  }

  return index;
}

function findSharedConcepts(
  textA: string,
  textB: string,
  conceptIndex: Map<string, string[]>
): string[] {
  const shared: string[] = [];
  const wordsA = new Set(textA.toLowerCase().split(/\W+/).filter(w => w.length >= 4));
  const wordsB = new Set(textB.toLowerCase().split(/\W+/).filter(w => w.length >= 4));

  for (const word of wordsA) {
    if (wordsB.has(word) && conceptIndex.has(word)) {
      shared.push(word);
    }
  }

  return shared;
}

function detectRelationType(textA: string, textB: string): NoteLink['relationType'] {
  const combined = `${textA} ${textB}`.toLowerCase();

  for (const { pattern, type } of LINK_PATTERNS) {
    if (pattern.test(combined)) {
      return type;
    }
  }

  return 'supports'; // Default relation
}

// ============================================================================
// Cognitive Grouping
// ============================================================================

function buildCognitiveGroups(
  notes: CognitiveNote[],
  links: NoteLink[]
): CognitiveGroup[] {
  const groups: CognitiveGroup[] = [];
  const assigned = new Set<string>();

  // Build adjacency list from links
  const adjacency = new Map<string, string[]>();
  for (const link of links) {
    const sourceList = adjacency.get(link.sourceId) || [];
    const targetList = adjacency.get(link.targetId) || [];
    sourceList.push(link.targetId);
    targetList.push(link.sourceId);
    adjacency.set(link.sourceId, sourceList);
    adjacency.set(link.targetId, targetList);
  }

  // Group by connected components
  for (const note of notes) {
    if (assigned.has(note.id)) continue;

    // BFS to find all connected notes
    const groupNoteIds: string[] = [];
    const queue = [note.id];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      assigned.add(current);
      groupNoteIds.push(current);

      const neighbors = adjacency.get(current) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          queue.push(neighbor);
        }
      }
    }

    // Determine group properties
    const groupNotes = notes.filter(n => groupNoteIds.includes(n.id));
    const kind = detectGroupKind(groupNotes);
    const title = generateGroupTitle(groupNotes, kind);
    const highYield = isHighYieldGroup(groupNotes);
    const confidence = groupNotes.reduce((sum, n) => sum + n.confidence, 0) / groupNotes.length;

    groups.push({
      id: `group_${groups.length}`,
      title,
      kind,
      noteIds: groupNoteIds,
      highYield,
      confidence,
    });
  }

  // Also create singleton groups for unlinked notes
  for (const note of notes) {
    if (!assigned.has(note.id)) {
      const kind = detectGroupKind([note]);
      groups.push({
        id: `group_${groups.length}`,
        title: note.content.substring(0, 50) + '...',
        kind,
        noteIds: [note.id],
        highYield: note.category === 'pattern' || note.category === 'decision',
        confidence: note.confidence,
      });
    }
  }

  return groups;
}

function detectGroupKind(notes: CognitiveNote[]): CognitiveGroup['kind'] {
  const categories = notes.map(n => n.category);
  const content = notes.map(n => n.content.toLowerCase()).join(' ');

  if (categories.includes('decision') || /\b(if|when|criteria|indicated)\b/.test(content)) {
    return 'diagnostic';
  }
  if (categories.includes('pattern') || /\b(process|pathway|mechanism)\b/.test(content)) {
    return 'process';
  }
  if (/\b(treat|therapy|management|drug)\b/.test(content)) {
    return 'treatment';
  }
  if (/\b(risk|complication|contraindicated|danger)\b/.test(content)) {
    return 'risk';
  }
  return 'concept';
}

function generateGroupTitle(notes: CognitiveNote[], kind: CognitiveGroup['kind']): string {
  // Extract most common significant terms
  const termCounts = new Map<string, number>();
  const stopWords = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'are', 'was', 'has', 'have', 'from']);

  for (const note of notes) {
    const words = note.content.toLowerCase().split(/\W+/).filter(w => w.length >= 4 && !stopWords.has(w));
    for (const word of words) {
      termCounts.set(word, (termCounts.get(word) || 0) + 1);
    }
  }

  // Get top term
  const sortedTerms = [...termCounts.entries()].sort((a, b) => b[1] - a[1]);
  const topTerm = sortedTerms[0]?.[0] || 'Unknown';

  const kindLabels: Record<CognitiveGroup['kind'], string> = {
    concept: 'Concept',
    process: 'Process',
    diagnostic: 'Diagnostic',
    treatment: 'Treatment',
    risk: 'Risk',
  };

  return `${capitalize(topTerm)} ${kindLabels[kind]}`;
}

function isHighYieldGroup(notes: CognitiveNote[]): boolean {
  // High yield if contains patterns, decisions, or multiple exceptions
  const hasPattern = notes.some(n => n.category === 'pattern');
  const hasDecision = notes.some(n => n.category === 'decision');
  const hasException = notes.some(n => n.category === 'exception');

  return hasPattern || hasDecision || (hasException && notes.length >= 2);
}

// ============================================================================
// Decision Rule Generation
// ============================================================================

function generateDecisionRules(
  notes: CognitiveNote[],
  groups: CognitiveGroup[]
): GeneratedDecisionRule[] {
  const rules: GeneratedDecisionRule[] = [];

  // Pattern 1: IF condition + THEN action
  const conditionalPattern = /(?:if|when)\s+(.+?),?\s*(?:then|you\s+should|consider)\s+(.+?)(?:\.|$)/gi;

  // Pattern 2: X indicates Y
  const indicatesPattern = /(.+?)\s+(?:indicates?|suggests?|means?)\s+(.+?)(?:\.|$)/gi;

  // Pattern 3: In cases of X, do Y
  const casesPattern = /(?:in\s+cases?\s+of|for|with)\s+(.+?),?\s*(?:use|give|treat\s+with|avoid)\s+(.+?)(?:\.|$)/gi;

  for (const note of notes) {
    if (note.category !== 'decision' && note.category !== 'pattern') continue;

    const text = note.content;
    let match;

    // Try conditional pattern
    const conditionalRegex = new RegExp(conditionalPattern.source, 'gi');
    while ((match = conditionalRegex.exec(text)) !== null) {
      const condition = match[1].trim();
      const action = match[2].trim();
      if (condition.length >= 5 && action.length >= 5) {
        rules.push({
          id: `rule_${rules.length}`,
          condition,
          action,
          exceptions: [],
          sourceNoteIds: [note.id],
          confidence: note.confidence,
        });
      }
    }

    // Try indicates pattern
    const indicatesRegex = new RegExp(indicatesPattern.source, 'gi');
    while ((match = indicatesRegex.exec(text)) !== null) {
      const condition = match[1].trim();
      const action = `Consider ${match[2].trim()}`;
      if (condition.length >= 5) {
        rules.push({
          id: `rule_${rules.length}`,
          condition: `When ${condition}`,
          action,
          exceptions: [],
          sourceNoteIds: [note.id],
          confidence: note.confidence * 0.8,
        });
      }
    }
  }

  // Add exceptions from exception-type notes
  const exceptionNotes = notes.filter(n => n.category === 'exception');
  for (const rule of rules) {
    const ruleContent = rule.condition.toLowerCase() + ' ' + rule.action.toLowerCase();
    for (const excNote of exceptionNotes) {
      if (hasSignificantOverlap(ruleContent, excNote.content.toLowerCase())) {
        rule.exceptions.push(excNote.content);
        rule.sourceNoteIds.push(excNote.id);
      }
    }
  }

  return rules;
}

function hasSignificantOverlap(textA: string, textB: string): boolean {
  const wordsA = new Set(textA.split(/\W+/).filter(w => w.length >= 4));
  const wordsB = new Set(textB.split(/\W+/).filter(w => w.length >= 4));

  let overlap = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) overlap++;
  }

  return overlap >= 2;
}

// ============================================================================
// High-Yield Identification
// ============================================================================

function identifyHighYieldNotes(
  notes: CognitiveNote[],
  groups: CognitiveGroup[]
): string[] {
  const highYield: string[] = [];

  // High yield criteria:
  // 1. Part of a high-yield group
  // 2. Is a decision or pattern
  // 3. Has high confidence
  // 4. Has multiple links

  const highYieldGroupNotes = new Set<string>();
  for (const group of groups) {
    if (group.highYield) {
      group.noteIds.forEach(id => highYieldGroupNotes.add(id));
    }
  }

  for (const note of notes) {
    const isInHighYieldGroup = highYieldGroupNotes.has(note.id);
    const isDecisionOrPattern = note.category === 'decision' || note.category === 'pattern';
    const hasHighConfidence = note.confidence >= 0.7;
    const hasMultipleLinks = note.linkedNoteIds.length >= 2;

    const score = (isInHighYieldGroup ? 1 : 0) +
                  (isDecisionOrPattern ? 1 : 0) +
                  (hasHighConfidence ? 0.5 : 0) +
                  (hasMultipleLinks ? 0.5 : 0);

    if (score >= 2) {
      highYield.push(note.id);
    }
  }

  return highYield;
}

// ============================================================================
// Weak Area Detection
// ============================================================================

function detectWeakAreas(
  notes: CognitiveNote[],
  groups: CognitiveGroup[]
): string[] {
  const weakAreas: string[] = [];

  // Weak area indicators:
  // 1. Groups with only 1 note (incomplete coverage)
  // 2. Low-confidence notes
  // 3. Many exceptions without clear rules

  for (const group of groups) {
    if (group.noteIds.length === 1 && !group.decisionRule) {
      weakAreas.push(`Incomplete: ${group.title} - needs more context`);
    }
    if (group.confidence < 0.5) {
      weakAreas.push(`Low confidence: ${group.title}`);
    }
  }

  // Check for exception-heavy areas without clear rules
  const exceptionGroups = groups.filter(g => {
    const groupNotes = notes.filter(n => g.noteIds.includes(n.id));
    const exceptionCount = groupNotes.filter(n => n.category === 'exception').length;
    return exceptionCount > groupNotes.length * 0.5 && !g.decisionRule;
  });

  for (const group of exceptionGroups) {
    weakAreas.push(`Many exceptions: ${group.title} - needs decision rule`);
  }

  return weakAreas;
}

// ============================================================================
// Helpers
// ============================================================================

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ============================================================================
// Integration with AutoGeneratedNotesPanel
// ============================================================================

/**
 * Convert AutoGeneratedNote to CognitiveNote format
 */
export function convertToCognitiveNote(note: {
  id: string;
  coreSentence: string;
  category: string;
  pageNumber: number;
  chapterId?: string;
}): CognitiveNote {
  return {
    id: note.id,
    content: note.coreSentence,
    category: note.category as CognitiveNote['category'],
    pageNumber: note.pageNumber,
    chapterId: note.chapterId,
    source: 'auto',
    confidence: 0.7, // Default confidence
    linkedNoteIds: [],
  };
}

/**
 * Main entry point for processing auto-generated notes
 */
export function processCognitiveStructure(
  autoNotes: Array<{
    id: string;
    coreSentence: string;
    category: string;
    pageNumber: number;
    chapterId?: string;
  }>
): CognitiveProcessingResult {
  const cognitiveNotes = autoNotes.map(convertToCognitiveNote);
  return processNotesCognitively(cognitiveNotes);
}
