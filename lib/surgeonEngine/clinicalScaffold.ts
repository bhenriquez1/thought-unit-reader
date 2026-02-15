// lib/surgeonEngine/clinicalScaffold.ts
// Clinical Reasoning Flow: Observe -> Hypothesize -> Test -> Decide -> Act -> Verify
// The core of Surgeon View for dental/medical reasoning

import type {
  ClinicalScaffold,
  ExtractedUnit,
  Pattern,
  PatternCluster,
  EvidenceRef,
  ID,
} from './types';

// ============================================================================
// Extraction Helpers
// ============================================================================

/**
 * Extract key clinical findings from text (OBSERVE step)
 */
function extractObservations(text: string): string[] {
  const observations: string[] = [];

  // Clinical findings
  const findingPatterns = [
    /\bpresents?\s+with\s+(.{10,80}?)[.;,]/i,
    /\bcharacterized\s+by\s+(.{10,80}?)[.;,]/i,
    /\bfindings?\s+(?:include|are|show)\s+(.{10,80}?)[.;,]/i,
    /\bon\s+examination[,:]\s+(.{10,80}?)[.;,]/i,
    /\bsigns?\s+(?:include|are)\s+(.{10,80}?)[.;,]/i,
    /\bsymptoms?\s+(?:include|are)\s+(.{10,80}?)[.;,]/i,
    /\bradiographic(?:ally)?\s+(.{10,80}?)[.;,]/i,
    /\bclinically[,:]\s+(.{10,80}?)[.;,]/i,
  ];

  for (const pattern of findingPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      observations.push(match[1].trim());
    }
  }

  // If no pattern matches, use first 2 sentences as observation summary
  if (observations.length === 0) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 15);
    observations.push(...sentences.slice(0, 2).map(s => s.trim()));
  }

  return [...new Set(observations)].slice(0, 4);
}

/**
 * Extract hypotheses/diagnoses from text (HYPOTHESIZE step)
 */
function extractHypotheses(text: string): { label: string; rationale?: string; confidence: number }[] {
  const hypotheses: { label: string; rationale?: string; confidence: number }[] = [];

  // Direct diagnosis mentions
  const dxPatterns = [
    /\bdiagnosis\s+(?:is|of|:)\s+(.{5,40})/i,
    /\bmost\s+likely\s+(.{5,40})/i,
    /\bconsistent\s+with\s+(.{5,40})/i,
    /\bsuspect\s+(.{5,40})/i,
    /\bindicative\s+of\s+(.{5,40})/i,
  ];

  for (const pattern of dxPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      hypotheses.push({
        label: match[1].replace(/[.;,].*/, '').trim(),
        confidence: 0.8,
      });
    }
  }

  // Differential diagnoses
  const ddxMatch = text.match(/\bdifferential\s+(?:diagnosis|dx)\s*(?:includes?|:)?\s*(.{10,150})/i);
  if (ddxMatch) {
    const items = ddxMatch[1].split(/[,;]/).map(s => s.trim()).filter(s => s.length > 2 && s.length < 50);
    for (const item of items.slice(0, 4)) {
      hypotheses.push({
        label: item,
        rationale: 'Listed in differential diagnosis',
        confidence: 0.6,
      });
    }
  }

  // "vs" pattern
  const vsMatch = text.match(/\b(\w[\w\s]{2,25})\s+vs\.?\s+(\w[\w\s]{2,25})/i);
  if (vsMatch && hypotheses.length === 0) {
    hypotheses.push(
      { label: vsMatch[1].trim(), confidence: 0.7 },
      { label: vsMatch[2].trim(), confidence: 0.6 },
    );
  }

  // Fallback: extract disease/condition names
  if (hypotheses.length === 0) {
    const conditionMatch = text.match(/\b(\w+(?:\s+\w+)?)\s+(?:is\s+a|is\s+an|is\s+the)\s+(?:condition|disease|disorder|syndrome|lesion)/i);
    if (conditionMatch) {
      hypotheses.push({
        label: conditionMatch[1].trim(),
        confidence: 0.5,
      });
    }
  }

  return hypotheses.slice(0, 4);
}

/**
 * Extract testing/confirmation criteria (TEST step)
 */
function extractTests(text: string): string[] {
  const tests: string[] = [];

  const testPatterns = [
    /\bconfirmed?\s+by\s+(.{10,60}?)[.;,]/i,
    /\bgold\s+standard\s+(?:is|:)\s+(.{10,60}?)[.;,]/i,
    /\btest\s+(?:of\s+choice|for)\s+(.{10,60}?)[.;,]/i,
    /\bdiagnosed?\s+(?:by|with|using)\s+(.{10,60}?)[.;,]/i,
    /\bradiograph(?:ic|y)\s+(?:shows?|reveals?|findings?)\s+(.{10,60}?)[.;,]/i,
    /\bbiopsy\s+(?:shows?|reveals?)\s+(.{10,60}?)[.;,]/i,
    /\bhistolog(?:y|ical)\s+(?:shows?|reveals?|findings?)\s+(.{10,60}?)[.;,]/i,
    /\blab(?:oratory)?\s+(?:findings?|tests?|values?)\s+(.{10,60}?)[.;,]/i,
    /\bworkup\s+(?:includes?|:)\s+(.{10,60}?)[.;,]/i,
    /\bprobing\s+depth\b/i,
    /\bCAL\b/,
    /\bHbA1c\b/i,
  ];

  for (const pattern of testPatterns) {
    const match = text.match(pattern);
    if (match) {
      const captured = match[1] || match[0];
      tests.push(captured.trim());
    }
  }

  return [...new Set(tests)].slice(0, 5);
}

/**
 * Extract decision rules and contraindications (DECIDE step)
 */
function extractDecisions(text: string): string[] {
  const decisions: string[] = [];

  const decisionPatterns = [
    /\bif\s+(.{10,60}?)\s+then\s+(.{10,60}?)[.;]/i,
    /\bcontraindicated\s+(?:in|when|if)\s+(.{10,60}?)[.;,]/i,
    /\bavoid\s+(?:in|when|if)\s+(.{10,60}?)[.;,]/i,
    /\bdo\s+not\s+(.{10,60}?)[.;,]/i,
    /\bshould\s+not\s+(.{10,60}?)[.;,]/i,
    /\bindicated\s+(?:for|when|in)\s+(.{10,60}?)[.;,]/i,
    /\bcriteria\s+(?:for|include)\s+(.{10,60}?)[.;,]/i,
  ];

  for (const pattern of decisionPatterns) {
    const match = text.match(pattern);
    if (match) {
      if (match[2]) {
        decisions.push(`IF ${match[1].trim()} THEN ${match[2].trim()}`);
      } else {
        decisions.push(match[1]?.trim() || match[0].trim());
      }
    }
  }

  return [...new Set(decisions)].slice(0, 4);
}

/**
 * Extract management/treatment steps (ACT step)
 */
function extractActions(text: string): string[] {
  const actions: string[] = [];

  const actionPatterns = [
    /\bfirst[- ]line\s+(?:treatment|therapy|management)\s+(?:is|:)\s+(.{10,60}?)[.;,]/i,
    /\btreatment\s+(?:is|includes?|:)\s+(.{10,60}?)[.;,]/i,
    /\bmanage(?:ment|d)?\s+(?:with|by|includes?|:)\s+(.{10,60}?)[.;,]/i,
    /\bdrug\s+of\s+choice\s+(?:is|:)\s+(.{10,60}?)[.;,]/i,
    /\bprescribe\s+(.{10,60}?)[.;,]/i,
    /\bsurgical\s+(.{10,60}?)[.;,]/i,
    /\bstep\s+\d+:?\s+(.{10,60}?)[.;,]/i,
    /\bprocedure\s+(?:is|involves?|:)\s+(.{10,60}?)[.;,]/i,
  ];

  for (const pattern of actionPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      actions.push(match[1].trim());
    }
  }

  return [...new Set(actions)].slice(0, 4);
}

/**
 * Extract red flags, follow-up, and complications (VERIFY step)
 */
function extractVerification(text: string): string[] {
  const verifications: string[] = [];

  const verifyPatterns = [
    /\bred\s+flag\s*:?\s+(.{10,60}?)[.;,]/i,
    /\bcomplication\s+(?:includes?|is|:)\s+(.{10,60}?)[.;,]/i,
    /\bfollow[- ]up\s+(.{10,60}?)[.;,]/i,
    /\bmonitor\s+(?:for)\s+(.{10,60}?)[.;,]/i,
    /\brecurrence\b/i,
    /\bprognosis\s+(?:is|:)\s+(.{10,60}?)[.;,]/i,
    /\bif\s+(?:untreated|left\s+untreated)\s*[,:]\s+(.{10,60}?)[.;,]/i,
    /\bwarn(?:ing)?\s+signs?\s+(?:include|are|:)\s+(.{10,60}?)[.;,]/i,
    /\blong[- ]term\s+(.{10,60}?)[.;,]/i,
  ];

  for (const pattern of verifyPatterns) {
    const match = text.match(pattern);
    if (match) {
      const captured = match[1] || match[0];
      verifications.push(captured.trim());
    }
  }

  return [...new Set(verifications)].slice(0, 4);
}

// ============================================================================
// Main Scaffold Builder
// ============================================================================

/**
 * Build a clinical scaffold from a set of units and patterns
 */
export function buildScaffold(
  units: ExtractedUnit[],
  patterns: Pattern[],
  bookId: ID,
  source: { clusterId?: ID; unitId?: ID; page?: number }
): ClinicalScaffold {
  // Combine all text from input units
  const combinedText = units.map(u => u.cleanText || u.text).join(' ');

  // Extract each scaffold section
  const observe = extractObservations(combinedText);
  const hypothesize = extractHypotheses(combinedText);
  const test = extractTests(combinedText);
  const decide = extractDecisions(combinedText);
  const act = extractActions(combinedText);
  const verify = extractVerification(combinedText);

  // Augment from patterns
  for (const pattern of patterns) {
    switch (pattern.type) {
      case 'PRESENTATION':
        if (observe.length < 4 && !observe.includes(pattern.trigger)) {
          observe.push(pattern.trigger);
        }
        break;
      case 'DIAGNOSTIC_PATHWAY':
        if (test.length < 5 && !test.includes(pattern.trigger)) {
          test.push(pattern.trigger);
        }
        break;
      case 'TREATMENT_PATHWAY':
        if (act.length < 4 && !act.includes(pattern.trigger)) {
          act.push(pattern.trigger);
        }
        break;
      case 'RISK_PATTERN':
        if (verify.length < 4) {
          verify.push(`Risk: ${pattern.trigger}`);
        }
        break;
      case 'MECHANISM':
        if (hypothesize.length < 4) {
          hypothesize.push({
            label: pattern.interpretation,
            rationale: pattern.trigger,
            confidence: pattern.confidence,
          });
        }
        break;
    }

    // Add differentials as hypotheses
    if (pattern.differential) {
      for (const d of pattern.differential) {
        if (hypothesize.length < 4 && !hypothesize.some(h => h.label === d)) {
          hypothesize.push({
            label: d,
            rationale: `From pattern: ${pattern.trigger}`,
            confidence: 0.5,
          });
        }
      }
    }
  }

  // Build references from units
  const references: EvidenceRef[] = units.map(u => ({
    unitId: u.unitId,
    page: u.page,
    quote: (u.cleanText || u.text).slice(0, 100),
  }));

  return {
    scaffoldId: `scaffold_${source.clusterId || source.unitId || 'page'}_${Date.now().toString(36)}`,
    bookId,
    from: source,
    observe: observe.slice(0, 4),
    hypothesize: hypothesize.slice(0, 4),
    test: test.slice(0, 5),
    decide: decide.slice(0, 4),
    act: act.slice(0, 4),
    verify: verify.slice(0, 4),
    references,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Build scaffold from a cluster
 */
export function buildScaffoldFromCluster(
  cluster: PatternCluster,
  allUnits: Record<ID, ExtractedUnit>,
  allPatterns: Record<ID, Pattern>,
  bookId: ID
): ClinicalScaffold {
  // Get anchor units
  const units = cluster.anchorUnitIds
    .map(id => allUnits[id])
    .filter(Boolean);

  // Get cluster's patterns
  const patterns = cluster.patternIds
    .map(id => allPatterns[id])
    .filter(Boolean);

  return buildScaffold(
    units,
    patterns,
    bookId,
    { clusterId: cluster.clusterId }
  );
}

/**
 * Build scaffold from a single unit
 */
export function buildScaffoldFromUnit(
  unit: ExtractedUnit,
  patterns: Pattern[],
  bookId: ID
): ClinicalScaffold {
  return buildScaffold(
    [unit],
    patterns,
    bookId,
    { unitId: unit.unitId, page: unit.page }
  );
}

/**
 * Check if a scaffold has enough content to be useful
 */
export function isScaffoldMeaningful(scaffold: ClinicalScaffold): boolean {
  const filledSections = [
    scaffold.observe.length > 0,
    scaffold.hypothesize.length > 0,
    scaffold.test.length > 0,
    scaffold.decide.length > 0,
    scaffold.act.length > 0,
    scaffold.verify.length > 0,
  ].filter(Boolean).length;

  return filledSections >= 3;
}

export default {
  buildScaffold,
  buildScaffoldFromCluster,
  buildScaffoldFromUnit,
  isScaffoldMeaningful,
};
