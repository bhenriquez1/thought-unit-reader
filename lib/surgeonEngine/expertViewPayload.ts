// lib/surgeonEngine/expertViewPayload.ts
// Cross-engine "Expert View Payload" builder
// Assembles all engine outputs for a given page into one render-ready object

import type {
  ExpertViewPayload,
  ExtractedUnit,
  ImportanceScore,
  TrapTag,
  Pattern,
  PatternCluster,
  ClinicalScaffold,
  ID,
} from './types';

/**
 * Build the Expert View payload for a specific page.
 * This is what the UI renders: units + importance + traps + clusters + scaffold.
 */
export function buildExpertViewPayload(
  page: number,
  bookId: ID,
  allUnits: Record<ID, ExtractedUnit>,
  allImportance: Record<ID, ImportanceScore>,
  allTraps: Record<ID, TrapTag[]>,
  allPatterns: Record<ID, Pattern>,
  allClusters: PatternCluster[],
  scaffold?: ClinicalScaffold
): ExpertViewPayload {
  // Filter units for this page
  const pageUnits = Object.values(allUnits)
    .filter(u => u.page === page)
    .sort((a, b) => {
      // Sort by bbox y-position if available, else by unitId
      if (a.bbox && b.bbox) return a.bbox.y - b.bbox.y;
      return a.unitId.localeCompare(b.unitId);
    });

  // Gather importance scores for page units
  const importance: Record<ID, ImportanceScore> = {};
  for (const unit of pageUnits) {
    const score = allImportance[unit.unitId];
    if (score) importance[unit.unitId] = score;
  }

  // Gather traps for page units
  const traps: Record<ID, TrapTag[]> = {};
  for (const unit of pageUnits) {
    const unitTraps = allTraps[unit.unitId];
    if (unitTraps && unitTraps.length > 0) traps[unit.unitId] = unitTraps;
  }

  // Filter clusters that touch this page
  const pageClusters = allClusters.filter(c => {
    if (!c.pageRange) return false;
    return c.pageRange.start <= page && c.pageRange.end >= page;
  });

  // Gather patterns for page clusters
  const clusterPatterns: Record<ID, Pattern[]> = {};
  for (const cluster of pageClusters) {
    const patterns = cluster.patternIds
      .map(id => allPatterns[id])
      .filter(Boolean);
    if (patterns.length > 0) {
      clusterPatterns[cluster.clusterId] = patterns;
    }
  }

  return {
    bookId,
    page,
    units: pageUnits,
    importance,
    traps,
    clusters: pageClusters,
    patterns: clusterPatterns,
    scaffold,
  };
}

/**
 * Get summary stats for the Expert View payload
 */
export function getPayloadStats(payload: ExpertViewPayload): {
  totalUnits: number;
  highYieldCount: number;
  trapCount: number;
  clusterCount: number;
  hasScaffold: boolean;
} {
  const highYieldCount = Object.values(payload.importance)
    .filter(s => s.label === 'HIGH_YIELD').length;

  const trapCount = Object.values(payload.traps)
    .reduce((sum, tags) => sum + tags.length, 0);

  return {
    totalUnits: payload.units.length,
    highYieldCount,
    trapCount,
    clusterCount: payload.clusters.length,
    hasScaffold: !!payload.scaffold,
  };
}

export default {
  buildExpertViewPayload,
  getPayloadStats,
};
