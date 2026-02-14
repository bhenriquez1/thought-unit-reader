// lib/relationshipSchema/importanceEngine.ts
// Importance Engine - Scoring logic for ranking what matters

import type {
  ImportanceFactors,
  ImportanceBucket,
  RankedInsight,
  InsightType,
  DomainTag,
  EvidenceSpan,
  Relation,
  PatternCluster,
  DecisionRule,
  Concept,
  DocRef,
} from './types';
import { IMPORTANCE_WEIGHTS, IMPORTANCE_THRESHOLDS } from './types';

// ============================================================================
// DAT High-Yield Keywords (examFrequency factor)
// ============================================================================

const DAT_KEYWORDS: Record<string, number> = {
  // Dental-specific (high frequency)
  'caries': 0.9,
  'pulpitis': 0.9,
  'periodontal': 0.9,
  'enamel': 0.85,
  'dentin': 0.85,
  'pulp': 0.85,
  'odontoblast': 0.8,
  'ameloblast': 0.8,
  'cementum': 0.8,
  'gingiva': 0.8,
  'oral lesion': 0.8,
  'oral mucosa': 0.8,
  'salivary': 0.75,
  'mandible': 0.75,
  'maxilla': 0.75,
  'tmj': 0.75,

  // Anatomy (high frequency)
  'cranial nerve': 0.8,
  'trigeminal': 0.85,
  'facial nerve': 0.8,
  'anatomy': 0.8,
  'innervation': 0.75,
  'blood supply': 0.75,

  // Systemic/medical
  'endocrine': 0.7,
  'diabetes': 0.75,
  'autoimmune': 0.7,
  'inflammation': 0.5,
  'infection': 0.6,
  'malignancy': 0.7,
  'cancer': 0.7,

  // Pain/diagnosis
  'pain referral': 0.7,
  'differential': 0.75,
  'diagnosis': 0.7,

  // Pharmacology
  'anesthetic': 0.8,
  'local anesthetic': 0.85,
  'antibiotic': 0.7,
  'analgesic': 0.7,
};

// ============================================================================
// Pattern Detection Regexes
// ============================================================================

// Diagnostic cue patterns
const DIAGNOSTIC_CUES = [
  /pathognomonic/i,
  /hallmark/i,
  /classic\s+(sign|feature|finding|presentation)/i,
  /suggests?\s+\w+/i,
  /indicates?\s+\w+/i,
  /diagnostic\s+(of|for)/i,
  /characteristic\s+(of|for)/i,
  /if\s+.+then\s+suspect/i,
  /presence\s+of\s+.+\s+suggests?/i,
  /differential\s+diagnosis/i,
];

// Action/decision patterns
const ACTION_PATTERNS = [
  /\btreat(ment)?\b/i,
  /\bmanage(ment)?\b/i,
  /\bworkup\b/i,
  /\btest\s+for\b/i,
  /\bcontraindicated\b/i,
  /\bfirst[- ]line\b/i,
  /\burgent(ly)?\b/i,
  /\bimmediate(ly)?\b/i,
  /\bif\s+.+\s+then\s+(do|give|use|avoid|consider)/i,
  /\bdo\s+not\b/i,
  /\bmust\s+(not\s+)?/i,
  /\balways\b/i,
  /\bnever\b/i,
];

// Red flag/danger patterns
const RED_FLAG_PATTERNS = [
  /\bemergency\b/i,
  /\blife[- ]threatening\b/i,
  /\bmalignant\b/i,
  /\bmalignancy\b/i,
  /\bsepsis\b/i,
  /\bairway\b/i,
  /\bbleeding\b/i,
  /\brapid\s+onset\b/i,
  /\brapid\s+progression\b/i,
  /\bweakness\b/i,
  /\bvision\s+loss\b/i,
  /\bfacial\s+droop\b/i,
  /\bludwig/i,
  /\bcellulitis\b/i,
  /\btrismus\b/i,
  /\bswelling\s+(of\s+)?(the\s+)?floor\s+of\s+mouth/i,
  /\bred\s+flag\b/i,
  /\bwarning\s+sign\b/i,
  /\bdanger\b/i,
  /\bcritical\b/i,
];

// Systemic patterns
const SYSTEMIC_PATTERNS = [
  /\bsystemic\b/i,
  /\bendocrine\b/i,
  /\bautoimmune\b/i,
  /\bmalignancy\b/i,
  /\bmetabolic\b/i,
  /\binfection\b/i,
  /\bmulti[- ]organ\b/i,
  /\bwidespread\b/i,
  /\bgeneralized\b/i,
];

// Exception patterns (high value for differentials)
const EXCEPTION_PATTERNS = [
  /\bexcept\b/i,
  /\bhowever\b/i,
  /\bunless\b/i,
  /\bbut\s+not\b/i,
  /\brare\s+case\b/i,
  /\batypical\b/i,
  /\bdistinguish\s+from\b/i,
  /\bdifferentiate\s+from\b/i,
  /\bvs\.?\b/i,
  /\bdifferential\b/i,
];

// Rarity patterns (penalty)
const RARITY_PATTERNS = [
  /\brare\b/i,
  /\buncommon\b/i,
  /\bunusual\b/i,
  /\binfrequent\b/i,
  /\b1\s+in\s+\d+/i,
  /\bseldom\b/i,
  /\bnot\s+often\b/i,
];

// Ambiguity patterns (penalty)
const AMBIGUITY_PATTERNS = [
  /\bmay\b/i,
  /\bmight\b/i,
  /\bcan\s+be\b/i,
  /\bsometimes\b/i,
  /\boccasionally\b/i,
  /\bpossible\b/i,
  /\bpossibly\b/i,
  /\bcontroversial\b/i,
  /\bdebated\b/i,
  /\buncertain\b/i,
];

// ============================================================================
// Factor Computation Functions
// ============================================================================

function countMatches(text: string, patterns: RegExp[]): number {
  return patterns.filter(p => p.test(text)).length;
}

function hasPattern(text: string, patterns: RegExp[]): boolean {
  return patterns.some(p => p.test(text));
}

/**
 * A) diagnosticWeight (0..1)
 * Increase if text contains diagnostic cue phrases
 */
function computeDiagnosticWeight(text: string, relation?: Relation): number {
  const cueHits = countMatches(text, DIAGNOSTIC_CUES);
  const hasIfThenPattern = /if\s+.+\s+then/i.test(text);
  const hasConditionName = /\b(disease|syndrome|disorder|condition)\b/i.test(text);
  const hasFindingName = /\b(sign|symptom|finding|presentation)\b/i.test(text);
  const mentionsDifferential = /differential/i.test(text);

  // Boost for diagnostic predicates
  const predicateBoost =
    relation?.predicate === 'confirms' ? 0.3 :
    relation?.predicate === 'suggests' ? 0.2 :
    relation?.predicate === 'rules_out' ? 0.25 :
    relation?.predicate === 'indicates' ? 0.2 : 0;

  const score =
    0.2 * (cueHits >= 1 ? 1 : 0) +
    0.2 * (cueHits >= 2 ? 1 : 0) +
    0.2 * (hasIfThenPattern ? 1 : 0) +
    0.2 * (hasConditionName && hasFindingName ? 1 : 0) +
    0.2 * (mentionsDifferential ? 1 : 0) +
    predicateBoost;

  return Math.min(1, score);
}

/**
 * B) examFrequency (0..1)
 * DAT high-yield keyword matching
 */
function computeExamFrequency(text: string, tags: string[]): number {
  const lowerText = text.toLowerCase();
  const allText = [lowerText, ...tags.map(t => t.toLowerCase())].join(' ');

  let matchCount = 0;
  let maxWeight = 0;

  for (const [keyword, weight] of Object.entries(DAT_KEYWORDS)) {
    if (allText.includes(keyword.toLowerCase())) {
      matchCount++;
      maxWeight = Math.max(maxWeight, weight);
    }
  }

  return Math.min(1, 0.15 * matchCount + maxWeight);
}

/**
 * C) decisionImpact (0..1)
 * Boost if implies action/decision
 */
function computeDecisionImpact(text: string, relation?: Relation): number {
  const hasActionVerb = hasPattern(text, ACTION_PATTERNS);
  const hasIfThenPattern = /if\s+.+\s+then/i.test(text);
  const mentionsContraindication = /contraindicated/i.test(text);

  // Boost for treatment predicates
  const predicateBoost =
    relation?.predicate === 'treats' ? 0.2 :
    relation?.predicate === 'contraindicates' ? 0.3 : 0;

  const score =
    0.35 * (hasActionVerb ? 1 : 0) +
    0.35 * (hasIfThenPattern ? 1 : 0) +
    0.3 * (mentionsContraindication ? 1 : 0) +
    predicateBoost;

  return Math.min(1, score);
}

/**
 * D) redFlagWeight (0..1)
 * Boost for danger terms
 */
function computeRedFlagWeight(text: string, cluster?: PatternCluster): number {
  const redFlagHits = countMatches(text, RED_FLAG_PATTERNS);
  const mentionsEmergency = /emergency|urgent|immediate/i.test(text);
  const rapidProgression = /rapid\s+(onset|progression)/i.test(text);

  // Boost for risk clusters
  const clusterBoost = cluster?.kind === 'risk' ? 0.2 : 0;

  const score =
    0.25 * Math.min(1, redFlagHits / 2) +
    0.35 * (mentionsEmergency ? 1 : 0) +
    0.4 * (rapidProgression ? 1 : 0) +
    clusterBoost;

  return Math.min(1, score);
}

/**
 * E) systemicSignificance (0..1)
 * Boost if disease is systemic or implies multi-organ
 */
function computeSystemicSignificance(text: string): number {
  const systemicHits = countMatches(text, SYSTEMIC_PATTERNS);
  const multiSystemMention = (text.match(/\b(cardiovascular|respiratory|neurologic|gastrointestinal|renal|hepatic|endocrine)\b/gi) || []).length >= 2;
  const explicitSystemic = /\bsystemic\b/i.test(text);

  const score =
    0.25 * Math.min(1, systemicHits / 2) +
    0.25 * (multiSystemMention ? 1 : 0) +
    0.5 * (explicitSystemic ? 1 : 0);

  return Math.min(1, score);
}

/**
 * F) exceptionValue (0..1)
 * Boost for "except / distinguish / vs / differential" patterns
 */
function computeExceptionValue(text: string, cluster?: PatternCluster): number {
  const hasExcept = /\bexcept\b/i.test(text);
  const hasDistinguish = /distinguish|differentiate/i.test(text);
  const hasDifferential = /differential/i.test(text);

  // Boost for exception clusters
  const clusterBoost = cluster?.kind === 'exception' ? 0.3 : 0;

  const score =
    0.4 * (hasExcept ? 1 : 0) +
    0.3 * (hasDistinguish ? 1 : 0) +
    0.3 * (hasDifferential ? 1 : 0) +
    clusterBoost;

  return Math.min(1, score);
}

/**
 * G) evidenceStrength (0..1)
 * Boost when multiple evidence spans, figure refs, strong cues
 */
function computeEvidenceStrength(
  evidence: EvidenceSpan[],
  text: string
): number {
  const hasMultipleEvidence = evidence.length >= 2;
  const hasFigureRef = /\b(figure|fig\.?|table)\s*\d/i.test(text);
  const cueHits = countMatches(text, DIAGNOSTIC_CUES);

  const score =
    0.25 * (evidence.length >= 1 ? 1 : 0) +
    0.25 * (hasMultipleEvidence ? 1 : 0) +
    0.25 * (hasFigureRef ? 1 : 0) +
    0.25 * (cueHits >= 2 ? 1 : 0);

  return Math.min(1, score);
}

/**
 * H) rarityPenalty (0..1)
 * Penalize rare/obscure, unless marked "classic/hallmark"
 */
function computeRarityPenalty(text: string, examFrequency: number): number {
  const rareHits = countMatches(text, RARITY_PATTERNS);
  const isClassic = /\b(classic|hallmark|pathognomonic)\b/i.test(text);

  if (isClassic) return 0; // No penalty for classic findings

  const score =
    0.4 * (rareHits > 0 ? 1 : 0) +
    0.6 * (examFrequency < 0.2 ? 1 : 0);

  return Math.min(1, score);
}

/**
 * I) ambiguityPenalty (0..1)
 * Penalize hedgy language (unless differential list)
 */
function computeAmbiguityPenalty(text: string): number {
  const isDifferential = /differential/i.test(text);
  if (isDifferential) return 0; // No penalty for differentials

  const hedgeHits = countMatches(text, AMBIGUITY_PATTERNS);
  const noConditionName = !/\b(disease|syndrome|disorder|condition)\b/i.test(text);
  const noFindingName = !/\b(sign|symptom|finding)\b/i.test(text);

  const score =
    0.2 * Math.min(1, hedgeHits / 2) +
    0.4 * (noConditionName ? 1 : 0) +
    0.4 * (noFindingName ? 1 : 0);

  return Math.min(1, score);
}

// ============================================================================
// Main Scoring Functions
// ============================================================================

/**
 * Compute all importance factors for a piece of content
 */
export function computeImportanceFactors(
  text: string,
  evidence: EvidenceSpan[],
  tags: string[] = [],
  relation?: Relation,
  cluster?: PatternCluster
): ImportanceFactors {
  const examFrequency = computeExamFrequency(text, tags);

  return {
    diagnosticWeight: computeDiagnosticWeight(text, relation),
    examFrequency,
    decisionImpact: computeDecisionImpact(text, relation),
    redFlagWeight: computeRedFlagWeight(text, cluster),
    systemicSignificance: computeSystemicSignificance(text),
    exceptionValue: computeExceptionValue(text, cluster),
    evidenceStrength: computeEvidenceStrength(evidence, text),
    rarityPenalty: computeRarityPenalty(text, examFrequency),
    ambiguityPenalty: computeAmbiguityPenalty(text),
  };
}

/**
 * Compute weighted importance score (0-100)
 */
export function computeImportanceScore(factors: ImportanceFactors): number {
  const scoreRaw =
    IMPORTANCE_WEIGHTS.diagnosticWeight * factors.diagnosticWeight +
    IMPORTANCE_WEIGHTS.examFrequency * factors.examFrequency +
    IMPORTANCE_WEIGHTS.decisionImpact * factors.decisionImpact +
    IMPORTANCE_WEIGHTS.redFlagWeight * factors.redFlagWeight +
    IMPORTANCE_WEIGHTS.systemicSignificance * factors.systemicSignificance +
    IMPORTANCE_WEIGHTS.exceptionValue * factors.exceptionValue +
    IMPORTANCE_WEIGHTS.evidenceStrength * factors.evidenceStrength +
    IMPORTANCE_WEIGHTS.rarityPenalty * factors.rarityPenalty +
    IMPORTANCE_WEIGHTS.ambiguityPenalty * factors.ambiguityPenalty;

  return Math.max(0, Math.min(100, Math.round(scoreRaw)));
}

/**
 * Assign bucket based on score
 */
export function assignBucket(score: number): ImportanceBucket {
  if (score >= IMPORTANCE_THRESHOLDS.CRITICAL) return 'CRITICAL';
  if (score >= IMPORTANCE_THRESHOLDS.HIGH_YIELD) return 'HIGH_YIELD';
  if (score >= IMPORTANCE_THRESHOLDS.IMPORTANT) return 'IMPORTANT';
  return 'CONTEXT';
}

/**
 * Determine insight type based on content
 */
export function determineInsightType(
  text: string,
  relation?: Relation,
  cluster?: PatternCluster
): InsightType {
  // Red flags take priority
  if (hasPattern(text, RED_FLAG_PATTERNS)) return 'RED_FLAG';

  // Decision rules
  if (/if\s+.+\s+then/i.test(text) || relation?.predicate === 'contraindicates') {
    return 'DECISION_RULE';
  }

  // Differentials
  if (/differential|distinguish|vs\./i.test(text) || cluster?.kind === 'exception') {
    return 'DIFFERENTIAL';
  }

  // Exam traps
  if (/trap|common\s+mistake|often\s+confused/i.test(text)) {
    return 'EXAM_TRAP';
  }

  // Clinical pearls
  if (/pearl|tip|remember|key\s+point/i.test(text)) {
    return 'CLINICAL_PEARL';
  }

  // Diagnostic signals
  if (hasPattern(text, DIAGNOSTIC_CUES) || cluster?.kind === 'diagnostic') {
    return 'DIAGNOSTIC_SIGNAL';
  }

  // Default
  return 'HIGH_YIELD_ASSOCIATION';
}

/**
 * Determine domain tag
 */
export function determineDomain(text: string, tags: string[]): DomainTag {
  const allText = [text, ...tags].join(' ').toLowerCase();

  const dentalTerms = /\b(dental|tooth|teeth|oral|pulp|enamel|dentin|gingiva|periodontal|caries|mandible|maxilla|tmj)\b/i;
  const medicalTerms = /\b(systemic|cardiac|hepatic|renal|pulmonary|neurologic|endocrine|autoimmune)\b/i;

  const hasDental = dentalTerms.test(allText);
  const hasMedical = medicalTerms.test(allText);

  if (hasDental && hasMedical) return 'BOTH';
  if (hasDental) return 'DENTAL';
  if (hasMedical) return 'MEDICAL';
  return 'GENERAL';
}

/**
 * Generate "why it matters" text
 */
export function generateWhyItMatters(
  text: string,
  insightType: InsightType,
  relation?: Relation
): string {
  // Type-based templates
  const templates: Record<InsightType, string> = {
    'RED_FLAG': 'Recognizing this early can prevent serious complications.',
    'DECISION_RULE': 'This guides clinical decision-making and treatment selection.',
    'DIFFERENTIAL': 'Distinguishing this from look-alikes is crucial for accurate diagnosis.',
    'EXAM_TRAP': 'This is commonly tested and often confused with similar conditions.',
    'CLINICAL_PEARL': 'This insight helps with quick pattern recognition.',
    'DIAGNOSTIC_SIGNAL': 'This finding points to specific diagnoses.',
    'HIGH_YIELD_ASSOCIATION': 'Understanding this relationship aids clinical reasoning.',
  };

  // Predicate-specific enhancements
  if (relation?.predicate === 'causes') {
    return 'Understanding causation helps predict and prevent outcomes.';
  }
  if (relation?.predicate === 'treats') {
    return 'This treatment approach is directly actionable.';
  }
  if (relation?.predicate === 'contraindicates') {
    return 'Avoiding this prevents harm - critical for patient safety.';
  }

  return templates[insightType];
}

// ============================================================================
// RankedInsight Creation
// ============================================================================

/**
 * Create a RankedInsight from a Relation
 */
export function createRankedInsightFromRelation(
  relation: Relation,
  subjectLabel: string,
  objectLabel: string,
  concepts: Record<string, Concept>,
  cluster?: PatternCluster
): RankedInsight {
  const claim = `${subjectLabel} ${relation.predicate.replace(/_/g, ' ')} ${objectLabel}`;
  const fullText = [claim, relation.evidence.map(e => e.quote || '').join(' ')].join(' ');

  // Extract tags from concept types
  const subj = concepts[relation.subjId];
  const obj = concepts[relation.objId];
  const tags: string[] = [];
  if (subj?.type) tags.push(subj.type);
  if (obj?.type) tags.push(obj.type);
  if (cluster?.kind) tags.push(cluster.kind);

  // Convert DocRef to EvidenceSpan
  const evidence: EvidenceSpan[] = relation.evidence.map(ref => ({
    page: ref.page,
    text: ref.quote || '',
    bbox: ref.bbox ? { x: ref.bbox[0], y: ref.bbox[1], w: ref.bbox[2] - ref.bbox[0], h: ref.bbox[3] - ref.bbox[1] } : undefined,
  }));

  const factors = computeImportanceFactors(fullText, evidence, tags, relation, cluster);
  const score = computeImportanceScore(factors);
  const bucket = assignBucket(score);
  const insightType = determineInsightType(fullText, relation, cluster);
  const domain = determineDomain(fullText, tags);

  return {
    id: `ri_${relation.id}_${Date.now()}`,
    type: insightType,
    title: `${subjectLabel} → ${objectLabel}`,
    claim,
    whyItMatters: generateWhyItMatters(fullText, insightType, relation),
    tags,
    domain,
    evidence,
    factors,
    score,
    bucket,
    confidence: relation.confidence,
    sourceId: relation.id,
    sourceType: 'relation',
    computedAt: Date.now(),
  };
}

/**
 * Create a RankedInsight from a PatternCluster
 */
export function createRankedInsightFromCluster(
  cluster: PatternCluster,
  concepts: Record<string, Concept>
): RankedInsight {
  const conceptLabels = cluster.conceptIds
    .slice(0, 3)
    .map(id => concepts[id]?.label || id)
    .join(', ');

  const claim = cluster.summary || `${cluster.title}: ${conceptLabels}`;
  const fullText = [claim, cluster.title].join(' ');

  const tags = [cluster.kind, ...cluster.conceptIds.slice(0, 3)];

  const evidence: EvidenceSpan[] = cluster.refs.map(ref => ({
    page: ref.page,
    text: ref.quote || '',
  }));

  const factors = computeImportanceFactors(fullText, evidence, tags, undefined, cluster);
  const score = computeImportanceScore(factors);
  const bucket = assignBucket(score);
  const insightType = determineInsightType(fullText, undefined, cluster);
  const domain = determineDomain(fullText, tags);

  return {
    id: `ri_${cluster.id}_${Date.now()}`,
    type: insightType,
    title: cluster.title,
    claim,
    whyItMatters: generateWhyItMatters(fullText, insightType),
    tags,
    domain,
    evidence,
    factors,
    score,
    bucket,
    confidence: cluster.confidence,
    sourceId: cluster.id,
    sourceType: 'cluster',
    computedAt: Date.now(),
  };
}

/**
 * Create a RankedInsight from a DecisionRule
 */
export function createRankedInsightFromRule(
  rule: DecisionRule
): RankedInsight {
  const claim = `IF ${rule.if.text} THEN ${rule.then.text}`;
  const fullText = [claim, rule.confirm.text].join(' ');

  const tags = rule.tags || [];

  const evidence: EvidenceSpan[] = rule.refs.map(ref => ({
    page: ref.page,
    text: ref.quote || '',
  }));

  const factors = computeImportanceFactors(fullText, evidence, tags);
  const score = computeImportanceScore(factors);
  const bucket = assignBucket(score);
  const domain = determineDomain(fullText, tags);

  return {
    id: `ri_${rule.id}_${Date.now()}`,
    type: 'DECISION_RULE',
    title: rule.if.text?.slice(0, 50) || 'Decision Rule',
    claim,
    whyItMatters: 'This decision rule guides clinical reasoning and action.',
    tags,
    domain,
    evidence,
    factors,
    score,
    bucket,
    confidence: 0.8, // Rules have fixed confidence
    sourceId: rule.id,
    sourceType: 'rule',
    computedAt: Date.now(),
  };
}

// ============================================================================
// Batch Processing
// ============================================================================

/**
 * Generate all RankedInsights from store data
 */
export function generateAllRankedInsights(
  relations: Record<string, Relation>,
  clusters: Record<string, PatternCluster>,
  rules: Record<string, DecisionRule>,
  concepts: Record<string, Concept>
): RankedInsight[] {
  const insights: RankedInsight[] = [];

  // Create insights from relations
  for (const relation of Object.values(relations)) {
    const subj = concepts[relation.subjId];
    const obj = concepts[relation.objId];
    if (!subj || !obj) continue;

    // Find cluster containing this relation
    const cluster = Object.values(clusters).find(c =>
      c.relationIds.includes(relation.id)
    );

    insights.push(
      createRankedInsightFromRelation(relation, subj.label, obj.label, concepts, cluster)
    );
  }

  // Create insights from clusters (aggregated view)
  for (const cluster of Object.values(clusters)) {
    insights.push(createRankedInsightFromCluster(cluster, concepts));
  }

  // Create insights from decision rules
  for (const rule of Object.values(rules)) {
    insights.push(createRankedInsightFromRule(rule));
  }

  // Sort by score descending
  return insights.sort((a, b) => b.score - a.score);
}

/**
 * Filter insights by criteria
 */
export function filterRankedInsights(
  insights: RankedInsight[],
  options: {
    minBucket?: ImportanceBucket;
    types?: InsightType[];
    domains?: DomainTag[];
    pageFilter?: number;
    limit?: number;
  }
): RankedInsight[] {
  const { minBucket, types, domains, pageFilter, limit } = options;

  const bucketOrder: ImportanceBucket[] = ['CRITICAL', 'HIGH_YIELD', 'IMPORTANT', 'CONTEXT'];

  let filtered = insights.filter(insight => {
    // Bucket filter
    if (minBucket) {
      const minIndex = bucketOrder.indexOf(minBucket);
      const insightIndex = bucketOrder.indexOf(insight.bucket);
      if (insightIndex > minIndex) return false;
    }

    // Type filter
    if (types && !types.includes(insight.type)) return false;

    // Domain filter
    if (domains && !domains.includes(insight.domain)) return false;

    // Page filter
    if (pageFilter !== undefined) {
      if (!insight.evidence.some(e => e.page === pageFilter)) return false;
    }

    return true;
  });

  // Apply limit
  if (limit) {
    filtered = filtered.slice(0, limit);
  }

  return filtered;
}

export default {
  computeImportanceFactors,
  computeImportanceScore,
  assignBucket,
  createRankedInsightFromRelation,
  createRankedInsightFromCluster,
  createRankedInsightFromRule,
  generateAllRankedInsights,
  filterRankedInsights,
};
