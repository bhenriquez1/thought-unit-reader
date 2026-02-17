// lib/page-intelligence/relations.ts
// Extract concept relations from text segments

import type { Relation, RelationType, Segment } from './types';
import { generateId } from './types';

// ============================================================================
// Relation Extraction Patterns
// ============================================================================

interface RelationPattern {
  type: RelationType;
  pattern: RegExp;
  fromGroup: number;
  toGroup: number;
  baseScore: number;
}

const RELATION_PATTERNS: RelationPattern[] = [
  // Causes / Leads to
  {
    type: 'causes',
    pattern: /\b([A-Za-z][\w\s-]{2,30})\s+(?:causes?|lead(?:s)?\s+to|result(?:s)?\s+in)\s+([A-Za-z][\w\s-]{2,30})/i,
    fromGroup: 1,
    toGroup: 2,
    baseScore: 0.85,
  },
  {
    type: 'leads_to',
    pattern: /\b([A-Za-z][\w\s-]{2,30})\s+(?:leads?\s+to|progresses?\s+to|develops?\s+into)\s+([A-Za-z][\w\s-]{2,30})/i,
    fromGroup: 1,
    toGroup: 2,
    baseScore: 0.8,
  },
  // Associated with
  {
    type: 'associated_with',
    pattern: /\b([A-Za-z][\w\s-]{2,30})\s+(?:is\s+)?associated\s+with\s+([A-Za-z][\w\s-]{2,30})/i,
    fromGroup: 1,
    toGroup: 2,
    baseScore: 0.75,
  },
  // Is a (classification)
  {
    type: 'is_a',
    pattern: /\b([A-Za-z][\w\s-]{2,30})\s+is\s+(?:a|an)\s+(?:type\s+of\s+)?([A-Za-z][\w\s-]{2,30})/i,
    fromGroup: 1,
    toGroup: 2,
    baseScore: 0.9,
  },
  // Part of
  {
    type: 'part_of',
    pattern: /\b([A-Za-z][\w\s-]{2,30})\s+(?:consists?\s+of|contains?|includes?|comprises?)\s+([A-Za-z][\w\s-]{2,30})/i,
    fromGroup: 2, // Note: reversed - the contained item is "from"
    toGroup: 1,
    baseScore: 0.8,
  },
  // Contraindicated
  {
    type: 'contraindicated',
    pattern: /\b([A-Za-z][\w\s-]{2,30})\s+(?:is\s+)?contraindicated\s+(?:in|for|with)\s+([A-Za-z][\w\s-]{2,30})/i,
    fromGroup: 1,
    toGroup: 2,
    baseScore: 0.9,
  },
  // Indicates
  {
    type: 'indicates',
    pattern: /\b([A-Za-z][\w\s-]{2,30})\s+(?:indicates?|suggests?|signifies?)\s+([A-Za-z][\w\s-]{2,30})/i,
    fromGroup: 1,
    toGroup: 2,
    baseScore: 0.8,
  },
  // Due to (reverse causation)
  {
    type: 'causes',
    pattern: /\b([A-Za-z][\w\s-]{2,30})\s+(?:due to|because of|caused by)\s+([A-Za-z][\w\s-]{2,30})/i,
    fromGroup: 2, // Reversed - cause is in second group
    toGroup: 1,
    baseScore: 0.85,
  },
];

// ============================================================================
// Concept Cleaning
// ============================================================================

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'shall', 'can', 'and', 'or', 'but',
  'if', 'then', 'else', 'when', 'where', 'why', 'how', 'all', 'each',
  'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
  'not', 'only', 'same', 'so', 'than', 'too', 'very', 'just', 'also',
  'this', 'that', 'these', 'those', 'it', 'its', 'of', 'in', 'to', 'for',
  'with', 'on', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'between', 'under', 'again',
]);

function cleanConcept(text: string): string {
  // Remove leading/trailing whitespace and punctuation
  let cleaned = text.trim().replace(/^[,.\s]+|[,.\s]+$/g, '');

  // Remove common leading articles
  cleaned = cleaned.replace(/^(the|a|an)\s+/i, '');

  // Normalize whitespace
  cleaned = cleaned.replace(/\s+/g, ' ');

  return cleaned;
}

function isValidConcept(text: string): boolean {
  const cleaned = cleanConcept(text);

  // Must have at least 2 characters
  if (cleaned.length < 2) return false;

  // Must not be just a stopword
  if (STOPWORDS.has(cleaned.toLowerCase())) return false;

  // Must contain at least one letter
  if (!/[a-zA-Z]/.test(cleaned)) return false;

  // Must not be too long
  if (cleaned.length > 50) return false;

  return true;
}

// ============================================================================
// Main Relation Extractor
// ============================================================================

export interface ExtractRelationsOptions {
  segments: Segment[];
  minScore?: number;
  deduplicateRelations?: boolean;
}

/**
 * Extract concept relations from segments
 */
export function extractRelations(options: ExtractRelationsOptions): Relation[] {
  const { segments, minScore = 0.5, deduplicateRelations = true } = options;
  const relations: Relation[] = [];
  const seenRelations = new Set<string>();

  for (const segment of segments) {
    const text = segment.text;

    for (const pattern of RELATION_PATTERNS) {
      const matches = text.matchAll(new RegExp(pattern.pattern, 'gi'));

      for (const match of matches) {
        const fromRaw = match[pattern.fromGroup];
        const toRaw = match[pattern.toGroup];

        if (!fromRaw || !toRaw) continue;

        const from = cleanConcept(fromRaw);
        const to = cleanConcept(toRaw);

        // Validate concepts
        if (!isValidConcept(from) || !isValidConcept(to)) continue;

        // Skip self-relations
        if (from.toLowerCase() === to.toLowerCase()) continue;

        // Calculate score
        let score = pattern.baseScore;

        // Boost for exact pattern match (vs partial)
        if (match[0].length > 30) score += 0.05;

        // Skip low-scoring relations
        if (score < minScore) continue;

        // Deduplicate
        const key = `${pattern.type}:${from.toLowerCase()}:${to.toLowerCase()}`;
        if (deduplicateRelations && seenRelations.has(key)) continue;
        seenRelations.add(key);

        relations.push({
          id: generateId('rel'),
          type: pattern.type,
          from,
          to,
          evidenceSegmentIds: [segment.id],
          score,
        });
      }
    }
  }

  // Sort by score descending
  relations.sort((a, b) => b.score - a.score);

  return relations;
}

// ============================================================================
// Utility: Get relations by type
// ============================================================================

export function getRelationsByType(relations: Relation[], type: RelationType): Relation[] {
  return relations.filter(r => r.type === type);
}

// ============================================================================
// Utility: Get relations involving a concept
// ============================================================================

export function getRelationsForConcept(relations: Relation[], concept: string): Relation[] {
  const lower = concept.toLowerCase();
  return relations.filter(r =>
    r.from.toLowerCase().includes(lower) ||
    r.to.toLowerCase().includes(lower)
  );
}

// ============================================================================
// Utility: Build concept graph
// ============================================================================

export interface ConceptNode {
  concept: string;
  relations: Relation[];
}

export function buildConceptGraph(relations: Relation[]): Map<string, ConceptNode> {
  const graph = new Map<string, ConceptNode>();

  const getOrCreate = (concept: string): ConceptNode => {
    const key = concept.toLowerCase();
    if (!graph.has(key)) {
      graph.set(key, { concept, relations: [] });
    }
    return graph.get(key)!;
  };

  for (const relation of relations) {
    const fromNode = getOrCreate(relation.from);
    const toNode = getOrCreate(relation.to);
    fromNode.relations.push(relation);
    toNode.relations.push(relation);
  }

  return graph;
}

// ============================================================================
// Utility: Format relation as text
// ============================================================================

const RELATION_VERBS: Record<RelationType, string> = {
  causes: 'causes',
  leads_to: 'leads to',
  associated_with: 'is associated with',
  is_a: 'is a type of',
  part_of: 'is part of',
  contraindicated: 'is contraindicated in',
  indicates: 'indicates',
};

export function formatRelation(relation: Relation): string {
  const verb = RELATION_VERBS[relation.type];
  return `${relation.from} ${verb} ${relation.to}`;
}

// ============================================================================
// Export patterns for testing
// ============================================================================

export { RELATION_PATTERNS };
