import type { PageIntelligence } from '@/lib/page-intelligence';
import type { GroundedConcept } from '@/types/comprehension';

const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'are', 'was']);

export function extractGroundedConcepts(pageIntelligence: PageIntelligence): GroundedConcept[] {
  const concepts = new Map<string, GroundedConcept>();

  for (const relation of pageIntelligence.relations) {
    for (const label of [relation.from, relation.to]) {
      const normalized = label.trim().toLowerCase();
      if (!normalized || STOP.has(normalized)) continue;

      const existing = concepts.get(normalized);
      if (existing) {
        existing.confidence = Math.min(1, existing.confidence + 0.08);
        continue;
      }

      concepts.set(normalized, {
        id: `gc_${concepts.size + 1}`,
        label: label.trim(),
        confidence: Math.min(1, 0.45 + relation.score * 0.5),
        role: relation.type === 'is_a' ? 'core' : relation.type === 'leads_to' ? 'step' : 'supporting',
        pageEvidence: relation.evidenceSegmentIds.slice(0, 2).map((segmentId) => ({
          pageNumber: pageIntelligence.pageNumber,
          paragraphId: segmentId,
          text: pageIntelligence.segments.find((segment) => segment.id === segmentId)?.text?.slice(0, 220) ?? '',
        })),
      });
    }
  }

  return Array.from(concepts.values()).sort((a, b) => b.confidence - a.confidence).slice(0, 14);
}
