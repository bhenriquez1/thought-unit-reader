// lib/page-intelligence/clusters.ts
// Lightweight topic clustering using keyword extraction and Jaccard similarity

import type { Cluster, Segment } from './types';
import { generateId } from './types';

// ============================================================================
// Configuration
// ============================================================================

const MIN_KEYWORD_LENGTH = 3;
const MAX_KEYWORDS_PER_SEGMENT = 10;
const MIN_CLUSTER_SIZE = 2;
const SIMILARITY_THRESHOLD = 0.15; // Jaccard similarity threshold for clustering

// ============================================================================
// Stopwords for keyword extraction
// ============================================================================

const STOPWORDS = new Set([
  // Common English
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing',
  'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can',
  'and', 'or', 'but', 'if', 'then', 'else', 'when', 'where', 'why', 'how',
  'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some',
  'such', 'no', 'not', 'only', 'same', 'so', 'than', 'too', 'very', 'just',
  'also', 'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them',
  'their', 'we', 'us', 'our', 'you', 'your', 'he', 'she', 'him', 'her',
  'of', 'in', 'to', 'for', 'with', 'on', 'at', 'by', 'from', 'as', 'into',
  'through', 'during', 'before', 'after', 'above', 'below', 'between',
  'under', 'again', 'further', 'once', 'here', 'there', 'any', 'which',
  'what', 'who', 'whom', 'whose', 'about', 'over', 'out', 'up', 'down',
  'been', 'being', 'because', 'while', 'until', 'although', 'however',
  'therefore', 'thus', 'hence', 'whereas', 'whether', 'either', 'neither',
  // Common medical/scientific
  'patient', 'patients', 'case', 'cases', 'study', 'studies', 'result',
  'results', 'include', 'including', 'includes', 'show', 'shows', 'shown',
  'found', 'find', 'known', 'called', 'used', 'use', 'using', 'often',
  'usually', 'typically', 'commonly', 'generally', 'may', 'can', 'within',
]);

// ============================================================================
// Keyword Extraction
// ============================================================================

/**
 * Extract keywords from text
 */
export function extractKeywords(text: string): string[] {
  // Tokenize: split on non-alphanumeric
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(token =>
      token.length >= MIN_KEYWORD_LENGTH &&
      !STOPWORDS.has(token) &&
      !/^\d+$/.test(token) // Skip pure numbers
    );

  // Count frequencies
  const freq = new Map<string, number>();
  for (const token of tokens) {
    freq.set(token, (freq.get(token) || 0) + 1);
  }

  // Sort by frequency, take top N
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_KEYWORDS_PER_SEGMENT)
    .map(([word]) => word);
}

// ============================================================================
// Similarity Calculation
// ============================================================================

/**
 * Calculate Jaccard similarity between two keyword sets
 */
export function jaccardSimilarity(set1: Set<string>, set2: Set<string>): number {
  if (set1.size === 0 || set2.size === 0) return 0;

  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  return intersection.size / union.size;
}

// ============================================================================
// Clustering Algorithm
// ============================================================================

interface SegmentKeywords {
  segmentId: string;
  keywords: Set<string>;
  segment: Segment;
}

/**
 * Cluster segments based on keyword similarity
 */
export function clusterSegments(segments: Segment[]): Cluster[] {
  // Step 1: Extract keywords for each segment
  const segmentKeywords: SegmentKeywords[] = segments
    .filter(s => s.kind !== 'heading') // Skip headings for clustering
    .map(segment => ({
      segmentId: segment.id,
      keywords: new Set(extractKeywords(segment.text)),
      segment,
    }));

  // Step 2: Find headings to use as cluster labels
  const headings = segments.filter(s => s.kind === 'heading');

  // Step 3: Build similarity matrix and cluster
  const clusters: Map<string, Set<string>> = new Map(); // clusterId -> segmentIds
  const clusterKeywords: Map<string, Set<string>> = new Map(); // clusterId -> keywords
  const segmentToCluster: Map<string, string> = new Map(); // segmentId -> clusterId

  for (let i = 0; i < segmentKeywords.length; i++) {
    const seg = segmentKeywords[i];

    // Find best matching cluster
    let bestClusterId: string | null = null;
    let bestSimilarity = 0;

    for (const [clusterId, keywords] of clusterKeywords) {
      const similarity = jaccardSimilarity(seg.keywords, keywords);
      if (similarity > bestSimilarity && similarity >= SIMILARITY_THRESHOLD) {
        bestSimilarity = similarity;
        bestClusterId = clusterId;
      }
    }

    if (bestClusterId) {
      // Add to existing cluster
      clusters.get(bestClusterId)!.add(seg.segmentId);
      // Update cluster keywords
      for (const kw of seg.keywords) {
        clusterKeywords.get(bestClusterId)!.add(kw);
      }
      segmentToCluster.set(seg.segmentId, bestClusterId);
    } else {
      // Create new cluster
      const newClusterId = generateId('clus');
      clusters.set(newClusterId, new Set([seg.segmentId]));
      clusterKeywords.set(newClusterId, new Set(seg.keywords));
      segmentToCluster.set(seg.segmentId, newClusterId);
    }
  }

  // Step 4: Convert to Cluster objects, filter small clusters
  const result: Cluster[] = [];

  for (const [clusterId, segmentIds] of clusters) {
    if (segmentIds.size < MIN_CLUSTER_SIZE) continue;

    const keywords = clusterKeywords.get(clusterId)!;
    const topKeywords = Array.from(keywords).slice(0, 6);

    // Try to find a relevant heading for this cluster
    let label = topKeywords.slice(0, 3).join(', ');

    // Check if any segment in cluster follows a heading
    const clusterSegments = segments.filter(s => segmentIds.has(s.id));
    for (const seg of clusterSegments) {
      const segIndex = segments.indexOf(seg);
      if (segIndex > 0 && segments[segIndex - 1].kind === 'heading') {
        label = segments[segIndex - 1].text;
        break;
      }
    }

    // Calculate cluster score based on keyword density
    const score = Math.min(1, topKeywords.length / 6 + segmentIds.size / 10);

    result.push({
      id: clusterId,
      label: label.slice(0, 60), // Truncate long labels
      keywords: topKeywords,
      segmentIds: Array.from(segmentIds),
      score,
    });
  }

  // Sort by score descending
  result.sort((a, b) => b.score - a.score);

  return result;
}

// ============================================================================
// Utility: Get segments for a cluster
// ============================================================================

export function getClusterSegments(cluster: Cluster, allSegments: Segment[]): Segment[] {
  const idSet = new Set(cluster.segmentIds);
  return allSegments.filter(s => idSet.has(s.id));
}

// ============================================================================
// Utility: Find cluster for a segment
// ============================================================================

export function findClusterForSegment(segmentId: string, clusters: Cluster[]): Cluster | null {
  return clusters.find(c => c.segmentIds.includes(segmentId)) || null;
}

// ============================================================================
// Utility: Merge overlapping clusters
// ============================================================================

export function mergeSimilarClusters(clusters: Cluster[], threshold: number = 0.4): Cluster[] {
  if (clusters.length <= 1) return clusters;

  const merged: Cluster[] = [];
  const used = new Set<string>();

  for (let i = 0; i < clusters.length; i++) {
    if (used.has(clusters[i].id)) continue;

    const current = clusters[i];
    const toMerge = [current];

    for (let j = i + 1; j < clusters.length; j++) {
      if (used.has(clusters[j].id)) continue;

      const other = clusters[j];
      const similarity = jaccardSimilarity(
        new Set(current.keywords),
        new Set(other.keywords)
      );

      if (similarity >= threshold) {
        toMerge.push(other);
        used.add(other.id);
      }
    }

    used.add(current.id);

    if (toMerge.length === 1) {
      merged.push(current);
    } else {
      // Merge clusters
      const allSegmentIds = new Set<string>();
      const allKeywords = new Set<string>();
      let maxScore = 0;
      let bestLabel = current.label;

      for (const cluster of toMerge) {
        for (const id of cluster.segmentIds) allSegmentIds.add(id);
        for (const kw of cluster.keywords) allKeywords.add(kw);
        if (cluster.score > maxScore) {
          maxScore = cluster.score;
          bestLabel = cluster.label;
        }
      }

      merged.push({
        id: generateId('clus'),
        label: bestLabel,
        keywords: Array.from(allKeywords).slice(0, 8),
        segmentIds: Array.from(allSegmentIds),
        score: maxScore,
      });
    }
  }

  return merged;
}
