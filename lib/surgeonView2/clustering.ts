// lib/surgeonView2/clustering.ts
// Concept clustering and pearls detection for Surgeon View 2.0

import type { CoreConceptV2, ConceptCluster, Pearl, PearlType, ConceptPriority } from './types';

// ============================================================================
// Concept Clustering
// ============================================================================

interface ClusterCandidate {
  concepts: CoreConceptV2[];
  title: string;
  subtitle?: string;
}

/**
 * Cluster concepts by semantic similarity and page proximity
 */
export function clusterConcepts(concepts: CoreConceptV2[]): ConceptCluster[] {
  if (concepts.length === 0) return [];

  const clusters: ConceptCluster[] = [];
  const assigned = new Set<string>();

  // Sort by page, then paragraph
  const sorted = [...concepts].sort((a, b) => {
    if (a.anchor.pageIndex !== b.anchor.pageIndex) {
      return a.anchor.pageIndex - b.anchor.pageIndex;
    }
    return a.anchor.paragraphIndex - b.anchor.paragraphIndex;
  });

  // Group by common keywords/themes
  const themeGroups = groupByTheme(sorted);

  // Create clusters from theme groups
  themeGroups.forEach((group, idx) => {
    if (group.concepts.length >= 2) {
      const pageStart = Math.min(...group.concepts.map(c => c.anchor.pageIndex));
      const pageEnd = Math.max(...group.concepts.map(c => c.anchor.pageIndex));
      const highestPriority = getHighestPriority(group.concepts);

      clusters.push({
        id: `cluster_${Date.now()}_${idx}`,
        title: group.title,
        subtitle: group.subtitle,
        conceptIds: group.concepts.map(c => c.id),
        priority: highestPriority,
        collapsed: false,
        pageRange: { start: pageStart, end: pageEnd },
      });

      group.concepts.forEach(c => assigned.add(c.id));
    }
  });

  // Create single-concept "clusters" for unassigned concepts
  sorted.forEach(concept => {
    if (!assigned.has(concept.id)) {
      clusters.push({
        id: `cluster_single_${concept.id}`,
        title: concept.label,
        conceptIds: [concept.id],
        priority: concept.priority,
        collapsed: false,
        pageRange: { start: concept.anchor.pageIndex, end: concept.anchor.pageIndex },
      });
    }
  });

  return clusters;
}

/**
 * Group concepts by common themes/keywords
 */
function groupByTheme(concepts: CoreConceptV2[]): ClusterCandidate[] {
  const groups: Map<string, ClusterCandidate> = new Map();

  // Extract key terms from labels and one-liners
  concepts.forEach(concept => {
    const terms = extractKeyTerms(concept.label + ' ' + concept.oneLiner);
    const bestTerm = findBestClusterTerm(terms, groups);

    if (bestTerm) {
      const existing = groups.get(bestTerm);
      if (existing) {
        existing.concepts.push(concept);
      } else {
        groups.set(bestTerm, {
          concepts: [concept],
          title: capitalizeFirst(bestTerm),
        });
      }
    }
  });

  // Merge small groups and generate subtitles
  const result: ClusterCandidate[] = [];
  groups.forEach((group, key) => {
    if (group.concepts.length >= 2) {
      // Generate subtitle from concept count
      group.subtitle = `${group.concepts.length} concepts`;
      result.push(group);
    }
  });

  return result;
}

/**
 * Extract key terms for clustering
 */
function extractKeyTerms(text: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
    'of', 'in', 'to', 'for', 'with', 'on', 'at', 'by', 'from', 'as',
    'into', 'through', 'during', 'before', 'after', 'above', 'below',
    'and', 'or', 'but', 'if', 'then', 'else', 'when', 'where', 'why',
    'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
    'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so',
    'than', 'too', 'very', 'just', 'also', 'now', 'here', 'there', 'this',
    'that', 'these', 'those', 'which', 'what', 'who', 'whom', 'whose',
  ]);

  return text
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3 && !stopWords.has(word));
}

/**
 * Find best term for clustering based on existing groups
 */
function findBestClusterTerm(terms: string[], existing: Map<string, ClusterCandidate>): string | null {
  // Check if any term matches existing cluster
  for (const term of terms) {
    if (existing.has(term)) {
      return term;
    }
  }

  // Return first meaningful term
  return terms[0] || null;
}

/**
 * Get highest priority from a list of concepts
 */
function getHighestPriority(concepts: CoreConceptV2[]): ConceptPriority {
  if (concepts.some(c => c.priority === 'high')) return 'high';
  if (concepts.some(c => c.priority === 'medium')) return 'medium';
  return 'low';
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ============================================================================
// Pearls Detection (Universal High-Value Insights)
// ============================================================================

/**
 * Pearl detection patterns - universal (not medical-only)
 */
export const PEARL_PATTERNS = {
  insight: [
    /\b(key|critical|essential|important|crucial|fundamental)\s+(point|concept|idea|principle|insight)/i,
    /\b(remember|note|keep in mind|don't forget)\b/i,
    /\b(always|never|must|should always|should never)\b/i,
  ],
  tip: [
    /\b(tip|trick|shortcut|hack|quick way|easy way)\b/i,
    /\b(pro tip|best practice|recommended|suggested)\b/i,
    /\bto save time\b/i,
  ],
  warning: [
    /\b(warning|caution|careful|beware|watch out|danger)\b/i,
    /\b(common mistake|common error|pitfall|trap|gotcha)\b/i,
    /\b(don't|avoid|never)\b.*\b(mistake|error|confuse)\b/i,
  ],
  mnemonic: [
    /\b(remember|memorize|recall)\b.*\b(using|with|by)\b/i,
    /\b(acronym|mnemonic|memory aid)\b/i,
    /^[A-Z]{2,}$/m, // Acronyms on their own line
  ],
  shortcut: [
    /\b(shortcut|quick|fast|easy|simple)\s+(way|method|approach)\b/i,
    /\b(instead of|rather than|simply|just)\b/i,
  ],
  exception: [
    /\b(exception|except|unless|however|but not|excluding)\b/i,
    /\b(special case|edge case|rare|unusual)\b/i,
  ],
};

/**
 * Priority indicators for pearls
 */
const HIGH_PRIORITY_INDICATORS = [
  /\b(most important|critical|essential|must know|exam|test)\b/i,
  /\b(always|never|absolutely|definitely)\b/i,
  /\b(#1|number one|first thing|key)\b/i,
];

const MEDIUM_PRIORITY_INDICATORS = [
  /\b(important|significant|notable|useful)\b/i,
  /\b(often|usually|typically|commonly)\b/i,
];

/**
 * Detect pearls from page text
 */
export function detectPearls(
  pageText: string,
  pageIndex: number
): Pearl[] {
  const pearls: Pearl[] = [];
  const sentences = splitIntoSentences(pageText);

  sentences.forEach((sentence, sentenceIdx) => {
    const trimmed = sentence.trim();
    if (trimmed.length < 20 || trimmed.length > 500) return;

    // Check each pearl type pattern
    for (const [type, patterns] of Object.entries(PEARL_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(trimmed)) {
          const priority = determinePearlPriority(trimmed);
          const tags = extractPearlTags(trimmed);

          // Calculate paragraph index
          const textBefore = sentences.slice(0, sentenceIdx).join(' ');
          const paragraphIndex = (textBefore.match(/\n\n/g) || []).length;

          pearls.push({
            id: `pearl_${pageIndex}_${sentenceIdx}_${Date.now()}`,
            type: type as PearlType,
            content: trimmed,
            anchor: {
              pageIndex,
              paragraphIndex,
              snippetHash: generateSimpleHash(trimmed),
            },
            sourceExcerpt: getContextAroundSentence(sentences, sentenceIdx),
            priority,
            tags,
          });

          break; // One type match per sentence
        }
      }
    }
  });

  // Remove duplicates based on content similarity
  return deduplicatePearls(pearls);
}

/**
 * Split text into sentences
 */
function splitIntoSentences(text: string): string[] {
  // Handle common abbreviations
  const protectedText = text
    .replace(/\bDr\./g, 'Dr·')
    .replace(/\bMr\./g, 'Mr·')
    .replace(/\bMs\./g, 'Ms·')
    .replace(/\bMrs\./g, 'Mrs·')
    .replace(/\be\.g\./g, 'e·g·')
    .replace(/\bi\.e\./g, 'i·e·')
    .replace(/\betc\./g, 'etc·')
    .replace(/\bvs\./g, 'vs·');

  return protectedText
    .split(/(?<=[.!?])\s+/)
    .map(s => s.replace(/·/g, '.'));
}

/**
 * Determine pearl priority
 */
function determinePearlPriority(text: string): ConceptPriority {
  for (const pattern of HIGH_PRIORITY_INDICATORS) {
    if (pattern.test(text)) return 'high';
  }
  for (const pattern of MEDIUM_PRIORITY_INDICATORS) {
    if (pattern.test(text)) return 'medium';
  }
  return 'low';
}

/**
 * Extract tags from pearl content
 */
function extractPearlTags(text: string): string[] {
  const tags: string[] = [];

  if (/\b(exam|test|quiz)\b/i.test(text)) tags.push('testable');
  if (/\b(definition|define|means)\b/i.test(text)) tags.push('definition');
  if (/\b(step|process|procedure)\b/i.test(text)) tags.push('process');
  if (/\b(formula|equation|calculate)\b/i.test(text)) tags.push('formula');
  if (/\b(compare|contrast|difference|vs)\b/i.test(text)) tags.push('comparison');

  return tags;
}

/**
 * Get context around a sentence
 */
function getContextAroundSentence(sentences: string[], index: number): string {
  const start = Math.max(0, index - 1);
  const end = Math.min(sentences.length, index + 2);
  return sentences.slice(start, end).join(' ');
}

/**
 * Simple hash for deduplication
 */
function generateSimpleHash(text: string): string {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim().substring(0, 100);
  let hash = 2166136261;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Remove duplicate pearls
 */
function deduplicatePearls(pearls: Pearl[]): Pearl[] {
  const seen = new Set<string>();
  return pearls.filter(pearl => {
    const key = pearl.anchor.snippetHash;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
