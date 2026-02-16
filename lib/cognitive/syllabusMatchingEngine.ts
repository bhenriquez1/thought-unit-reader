// lib/cognitive/syllabusMatchingEngine.ts
// Syllabus Matching Engine - Map syllabus items to TOC nodes to page ranges
// Algorithm: Normalize -> Embed -> Top-K match -> Convert to pages -> Validate

import type {
  SyllabusItem,
  SyllabusMatch,
  TocNode,
  TocNodeId,
  SyllabusItemId,
  PageIndex,
  DocId,
  EvidenceSpan,
  KnowledgeCard,
} from './types';

// ============================================================================
// Text Normalization
// ============================================================================

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractKeywords(text: string): string[] {
  const normalized = normalizeText(text);
  const words = normalized.split(' ');

  // Filter out common stop words
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
    'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
    'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can',
    'this', 'that', 'these', 'those', 'it', 'its', 'chapter', 'section',
    'unit', 'module', 'week', 'lecture', 'introduction', 'overview',
  ]);

  return words.filter(w => w.length > 2 && !stopWords.has(w));
}

// ============================================================================
// Similarity Scoring
// ============================================================================

function computeJaccardSimilarity(set1: Set<string>, set2: Set<string>): number {
  if (set1.size === 0 || set2.size === 0) return 0;

  let intersection = 0;
  for (const item of set1) {
    if (set2.has(item)) intersection++;
  }

  const union = set1.size + set2.size - intersection;
  return intersection / union;
}

function computeOverlapCoefficient(set1: Set<string>, set2: Set<string>): number {
  if (set1.size === 0 || set2.size === 0) return 0;

  let intersection = 0;
  for (const item of set1) {
    if (set2.has(item)) intersection++;
  }

  return intersection / Math.min(set1.size, set2.size);
}

function scoreMatch(
  syllabusKeywords: Set<string>,
  tocKeywords: Set<string>,
  syllabusText: string,
  tocTitle: string
): number {
  // Jaccard similarity (40% weight)
  const jaccard = computeJaccardSimilarity(syllabusKeywords, tocKeywords);

  // Overlap coefficient (30% weight) - good for subset matching
  const overlap = computeOverlapCoefficient(syllabusKeywords, tocKeywords);

  // Exact phrase matching (20% weight)
  const syllabusNorm = normalizeText(syllabusText);
  const tocNorm = normalizeText(tocTitle);
  const phraseMatch = tocNorm.includes(syllabusNorm) || syllabusNorm.includes(tocNorm) ? 1 : 0;

  // Keyword density (10% weight)
  const commonKeywords = [...syllabusKeywords].filter(k => tocKeywords.has(k));
  const keywordDensity = commonKeywords.length / Math.max(syllabusKeywords.size, 1);

  return (
    jaccard * 0.4 +
    overlap * 0.3 +
    phraseMatch * 0.2 +
    keywordDensity * 0.1
  );
}

// ============================================================================
// TOC Traversal
// ============================================================================

function flattenToc(nodes: TocNode[]): TocNode[] {
  const result: TocNode[] = [];

  function traverse(node: TocNode) {
    result.push(node);
    if (node.children) {
      for (const child of node.children) {
        traverse(child);
      }
    }
  }

  for (const node of nodes) {
    traverse(node);
  }

  return result;
}

function getPageRange(node: TocNode, allNodes: TocNode[]): { start: PageIndex; end: PageIndex } {
  const start = node.pageStart;

  // Find end: next sibling's start - 1, or use pageEnd if specified
  if (node.pageEnd !== undefined) {
    return { start, end: node.pageEnd };
  }

  // Find next node at same or higher level
  const flatNodes = flattenToc(allNodes);
  const nodeIndex = flatNodes.findIndex(n => n.id === node.id);

  for (let i = nodeIndex + 1; i < flatNodes.length; i++) {
    if (flatNodes[i].level <= node.level) {
      return { start, end: flatNodes[i].pageStart - 1 };
    }
  }

  // No next sibling found, use a reasonable default
  return { start, end: start + 10 };
}

// ============================================================================
// Evidence Validation
// ============================================================================

function validateWithEvidence(
  match: { tocNode: TocNode; score: number },
  syllabusItem: SyllabusItem,
  cards: KnowledgeCard[],
  pageRange: { start: PageIndex; end: PageIndex }
): { validated: boolean; confidence: number; evidence: EvidenceSpan[] } {
  const syllabusKeywords = new Set(extractKeywords(
    `${syllabusItem.title} ${syllabusItem.description || ''}`
  ));

  // Find cards in the page range
  const cardsInRange = cards.filter(card =>
    card.pageRefs.some(p => p >= pageRange.start && p <= pageRange.end)
  );

  if (cardsInRange.length === 0) {
    return { validated: false, confidence: match.score * 0.5, evidence: [] };
  }

  // Check if syllabus keywords appear in card content
  let matchedKeywords = 0;
  const evidence: EvidenceSpan[] = [];

  for (const card of cardsInRange) {
    const cardText = normalizeText(`${card.title} ${card.summary}`);
    const cardWords = new Set(cardText.split(' '));

    for (const keyword of syllabusKeywords) {
      if (cardWords.has(keyword)) {
        matchedKeywords++;
        // Add first piece of evidence
        if (evidence.length < 3 && card.evidence.length > 0) {
          evidence.push(card.evidence[0]);
        }
      }
    }
  }

  const keywordValidation = matchedKeywords / Math.max(syllabusKeywords.size, 1);
  const validated = keywordValidation > 0.3;
  const confidence = match.score * 0.6 + keywordValidation * 0.4;

  return { validated, confidence, evidence };
}

// ============================================================================
// Main Matching Algorithm
// ============================================================================

export interface MatchCandidate {
  syllabusItemId: SyllabusItemId;
  tocNodeId: TocNodeId;
  tocNode: TocNode;
  score: number;
  pageRange: { start: PageIndex; end: PageIndex };
}

export function findTopKMatches(
  syllabusItem: SyllabusItem,
  tocNodes: TocNode[],
  k: number = 3
): MatchCandidate[] {
  const syllabusText = `${syllabusItem.title} ${syllabusItem.description || ''}`;
  const syllabusKeywords = new Set(extractKeywords(syllabusText));

  const flatNodes = flattenToc(tocNodes);
  const candidates: MatchCandidate[] = [];

  for (const node of flatNodes) {
    const tocKeywords = new Set(extractKeywords(node.title));
    const score = scoreMatch(syllabusKeywords, tocKeywords, syllabusText, node.title);

    if (score > 0.1) { // Minimum threshold
      candidates.push({
        syllabusItemId: syllabusItem.id,
        tocNodeId: node.id,
        tocNode: node,
        score,
        pageRange: getPageRange(node, tocNodes),
      });
    }
  }

  // Sort by score and return top K
  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

export function matchSyllabusToToc(
  syllabusItems: SyllabusItem[],
  tocNodes: TocNode[],
  docId: DocId,
  cards: KnowledgeCard[] = []
): SyllabusMatch[] {
  const matches: SyllabusMatch[] = [];

  for (const item of syllabusItems) {
    const candidates = findTopKMatches(item, tocNodes, 3);

    if (candidates.length === 0) continue;

    // Take best candidate and validate
    const best = candidates[0];
    const validation = validateWithEvidence(
      { tocNode: best.tocNode, score: best.score },
      item,
      cards,
      best.pageRange
    );

    // Include all page ranges from top candidates
    const pageRanges = candidates
      .filter(c => c.score > best.score * 0.7) // Within 70% of best score
      .map(c => c.pageRange);

    matches.push({
      syllabusItemId: item.id,
      docId,
      tocNodeIds: candidates.map(c => c.tocNodeId),
      pageRanges,
      confidence: validation.confidence,
      evidence: validation.evidence,
    });
  }

  return matches;
}

// ============================================================================
// Utility Functions
// ============================================================================

export function getSyllabusMatchForPage(
  pageIndex: PageIndex,
  matches: SyllabusMatch[]
): SyllabusMatch[] {
  return matches.filter(match =>
    match.pageRanges.some(range =>
      pageIndex >= range.start && pageIndex <= range.end
    )
  );
}

export function getPageRangesForSyllabusItem(
  syllabusItemId: SyllabusItemId,
  matches: SyllabusMatch[]
): Array<{ start: PageIndex; end: PageIndex }> {
  const match = matches.find(m => m.syllabusItemId === syllabusItemId);
  return match?.pageRanges || [];
}

export function getTocNodesForSyllabusItem(
  syllabusItemId: SyllabusItemId,
  matches: SyllabusMatch[],
  tocNodes: TocNode[]
): TocNode[] {
  const match = matches.find(m => m.syllabusItemId === syllabusItemId);
  if (!match) return [];

  const flatNodes = flattenToc(tocNodes);
  return match.tocNodeIds
    .map(id => flatNodes.find(n => n.id === id))
    .filter((n): n is TocNode => n !== undefined);
}

export default {
  matchSyllabusToToc,
  findTopKMatches,
  getSyllabusMatchForPage,
  getPageRangesForSyllabusItem,
  getTocNodesForSyllabusItem,
};
