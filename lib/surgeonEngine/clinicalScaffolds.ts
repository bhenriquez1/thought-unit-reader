// lib/surgeonEngine/clinicalScaffolds.ts
// Bridge: PageIntelligence → ClinicalScaffold
// Converts page-intelligence pipeline output into surgeon-engine scaffold format
// Pure functions + types, no circular imports

import type {
  ClinicalScaffold,
  EvidenceRef,
  Evidence,
  ID,
  ChapterId,
} from './types';

import type {
  PageIntelligence,
  Signal,
  Relation,
  Insight,
} from '../page-intelligence/types';

// ============================================================================
// Context
// ============================================================================

export interface ScaffoldContext {
  bookId: ID;
  page: number;
  chapterId?: ChapterId;
}

// ============================================================================
// Section helpers — extract each scaffold section from PageIntelligence
// ============================================================================

/**
 * Mechanism — cause/effect signals + mechanism insights
 */
export function extractMechanismObservations(pi: PageIntelligence): string[] {
  const results: string[] = [];

  // cause_effect signals → observation
  for (const sig of pi.signals) {
    if (sig.type === 'cause_effect' && sig.label) {
      results.push(sig.label);
    }
  }

  // cause / leads_to relations → "A → B"
  for (const rel of pi.relations) {
    if (rel.type === 'causes' || rel.type === 'leads_to') {
      results.push(`${rel.from} → ${rel.to}`);
    }
  }

  return [...new Set(results)].slice(0, 4);
}

/**
 * Definition — definition signals mapped to hypotheses
 */
export function extractDefinitionHypotheses(
  pi: PageIntelligence
): { label: string; rationale?: string; confidence: number }[] {
  const results: { label: string; rationale?: string; confidence: number }[] = [];

  for (const sig of pi.signals) {
    if (sig.type === 'definition' && sig.label) {
      results.push({ label: sig.label, confidence: sig.score / 100 });
    }
  }

  // "is_a" relations → definitions
  for (const rel of pi.relations) {
    if (rel.type === 'is_a') {
      results.push({
        label: `${rel.from} is a type of ${rel.to}`,
        rationale: 'Definitional relationship',
        confidence: rel.score / 100,
      });
    }
  }

  return results.slice(0, 4);
}

/**
 * Stepwise process — list signals as ordered test/procedure steps
 */
export function extractStepwiseProcess(pi: PageIntelligence): string[] {
  const results: string[] = [];

  for (const sig of pi.signals) {
    if (sig.type === 'list' && sig.label) {
      results.push(sig.label);
    }
  }

  // Diagnostic signals → test steps
  for (const sig of pi.signals) {
    if (sig.type === 'diagnostic' && sig.label) {
      results.push(sig.label);
    }
  }

  return [...new Set(results)].slice(0, 5);
}

/**
 * Clinical correlation — risk factors + clinical actionability
 */
export function extractClinicalCorrelation(pi: PageIntelligence): string[] {
  const results: string[] = [];

  for (const sig of pi.signals) {
    if (sig.type === 'risk_factor' && sig.label) {
      results.push(`Risk: ${sig.label}`);
    }
  }

  for (const rel of pi.relations) {
    if (rel.type === 'associated_with') {
      results.push(`${rel.from} associated with ${rel.to}`);
    }
  }

  return [...new Set(results)].slice(0, 4);
}

/**
 * DAT trap — exception + contrast signals → decide rules
 */
export function extractDATTrapDecisions(pi: PageIntelligence): string[] {
  const results: string[] = [];

  for (const sig of pi.signals) {
    if ((sig.type === 'exception' || sig.type === 'contrast') && sig.label) {
      results.push(sig.label);
    }
  }

  // Contraindicated relations
  for (const rel of pi.relations) {
    if (rel.type === 'contraindicated') {
      results.push(`${rel.from} contraindicated with ${rel.to}`);
    }
  }

  return [...new Set(results)].slice(0, 4);
}

/**
 * High-yield summary — top scoring insights → verify/summary items
 */
export function extractHighYieldSummary(pi: PageIntelligence): string[] {
  const sorted = [...pi.insights]
    .filter(i => i.score >= 60)
    .sort((a, b) => b.score - a.score);

  return sorted.map(i => i.title).slice(0, 4);
}

/**
 * Treatment actions from treatment signals
 */
export function extractTreatmentActions(pi: PageIntelligence): string[] {
  const results: string[] = [];

  for (const sig of pi.signals) {
    if (sig.type === 'treatment' && sig.label) {
      results.push(sig.label);
    }
  }

  // indicates relations → suggested treatments
  for (const rel of pi.relations) {
    if (rel.type === 'indicates') {
      results.push(`${rel.to} indicated for ${rel.from}`);
    }
  }

  return [...new Set(results)].slice(0, 4);
}

// ============================================================================
// Evidence builders
// ============================================================================

function buildEvidenceRefs(pi: PageIntelligence, insights: Insight[]): EvidenceRef[] {
  const segIds = new Set<string>();
  for (const ins of insights) {
    for (const sid of ins.evidenceSegmentIds) segIds.add(sid);
  }

  return [...segIds].map(sid => {
    const seg = pi.segments.find(s => s.id === sid);
    return {
      unitId: sid,
      page: pi.pageNumber,
      quote: seg ? seg.text.slice(0, 100) : undefined,
    };
  });
}

function buildEvidenceSpine(pi: PageIntelligence, bookId: ID): Evidence[] {
  // One evidence entry per segment on this page
  return pi.segments.slice(0, 10).map(seg => ({
    docId: bookId,
    pageIndex: pi.pageNumber - 1, // convert 1-based → 0-based
    quote: seg.text.slice(0, 100),
    source: seg.kind === 'heading' ? ('heading' as const) : ('body' as const),
    confidence: pi.confidence ?? 0.85,
  }));
}

// ============================================================================
// Main builder
// ============================================================================

/**
 * Build a ClinicalScaffold from a PageIntelligence result.
 *
 * Maps:
 *   observe      ← mechanism / cause-effect signals
 *   hypothesize  ← definition signals + is_a relations
 *   test         ← diagnostic signals + list steps
 *   decide       ← exception / contrast (DAT traps) + contraindicated
 *   act          ← treatment signals + indicates relations
 *   verify       ← high-yield insight titles (score ≥ 60) + risk factors
 */
export function buildClinicalScaffold(
  pageIntelligence: PageIntelligence,
  context: ScaffoldContext
): ClinicalScaffold {
  const { bookId, page } = context;

  const observe = extractMechanismObservations(pageIntelligence);
  const hypothesize = extractDefinitionHypotheses(pageIntelligence);
  const test = extractStepwiseProcess(pageIntelligence);
  const decide = extractDATTrapDecisions(pageIntelligence);
  const act = extractTreatmentActions(pageIntelligence);
  const verify = [
    ...extractHighYieldSummary(pageIntelligence),
    ...extractClinicalCorrelation(pageIntelligence),
  ].slice(0, 4);

  const topInsights = [...pageIntelligence.insights]
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  return {
    scaffoldId: `scaffold_pi_${bookId}_p${page}_${Date.now().toString(36)}`,
    bookId,
    from: { page },
    observe,
    hypothesize,
    test,
    decide,
    act,
    verify,
    references: buildEvidenceRefs(pageIntelligence, topInsights),
    evidence: buildEvidenceSpine(pageIntelligence, bookId),
    createdAt: new Date().toISOString(),
  };
}

/**
 * Build scaffolds for every signal cluster in a PageIntelligence result.
 * Returns one scaffold per cluster (topic group).
 */
export function buildClusterScaffolds(
  pageIntelligence: PageIntelligence,
  context: ScaffoldContext
): ClinicalScaffold[] {
  if (pageIntelligence.clusters.length === 0) {
    return [buildClinicalScaffold(pageIntelligence, context)];
  }

  return pageIntelligence.clusters.map((cluster, idx) => {
    const clusterSegIds = new Set(cluster.segmentIds);

    // Narrow signals/relations/insights to this cluster's segments
    const clusterSignals: Signal[] = pageIntelligence.signals.filter(sig =>
      sig.evidenceSegmentIds.some(id => clusterSegIds.has(id))
    );
    const clusterRelations: Relation[] = pageIntelligence.relations.filter(rel =>
      rel.evidenceSegmentIds.some(id => clusterSegIds.has(id))
    );
    const clusterInsights: Insight[] = pageIntelligence.insights.filter(ins =>
      ins.evidenceSegmentIds.some(id => clusterSegIds.has(id))
    );

    const narrow: PageIntelligence = {
      ...pageIntelligence,
      segments: pageIntelligence.segments.filter(s => clusterSegIds.has(s.id)),
      signals: clusterSignals,
      relations: clusterRelations,
      insights: clusterInsights,
    };

    const scaffold = buildClinicalScaffold(narrow, context);
    return {
      ...scaffold,
      scaffoldId: `scaffold_pi_${context.bookId}_p${context.page}_c${idx}_${Date.now().toString(36)}`,
    };
  });
}

/**
 * Check if a scaffold built from PageIntelligence has enough content to display
 */
export function isPageScaffoldMeaningful(scaffold: ClinicalScaffold): boolean {
  const filled = [
    scaffold.observe.length > 0,
    scaffold.hypothesize.length > 0,
    scaffold.test.length > 0,
    scaffold.act.length > 0,
  ].filter(Boolean).length;
  return filled >= 2;
}

export default {
  buildClinicalScaffold,
  buildClusterScaffolds,
  isPageScaffoldMeaningful,
  extractMechanismObservations,
  extractDefinitionHypotheses,
  extractStepwiseProcess,
  extractClinicalCorrelation,
  extractDATTrapDecisions,
  extractHighYieldSummary,
  extractTreatmentActions,
};
