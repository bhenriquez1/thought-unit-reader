// lib/surgeonEngine/patternEngine.ts
// Pattern Recognition Engine
// Extract reusable clinical patterns and cluster them

import type {
  ExtractedUnit,
  Pattern,
  PatternType,
  PatternCluster,
  EvidenceRef,
  ID,
} from './types';

// ============================================================================
// Pattern Detection Cue Phrases
// ============================================================================

const PRESENTATION_CUES: RegExp[] = [
  /\bpresents?\s+with\b/i,
  /\bcharacterized\s+by\b/i,
  /\bsigns?\s+and\s+symptoms?\b/i,
  /\bclinical\s+(features?|findings?|presentation|manifestation)\b/i,
  /\bpatient\s+(complains?|reports?|presents?)\b/i,
  /\bon\s+examination\b/i,
  /\bappearance\b/i,
  /\btypically\s+(seen|found|appears?)\b/i,
];

const MECHANISM_CUES: RegExp[] = [
  /\bmechanism\b/i,
  /\bpathophysiology\b/i,
  /\bpathogenesis\b/i,
  /\bcaused?\s+by\b/i,
  /\bresults?\s+(in|from)\b/i,
  /\bleads?\s+to\b/i,
  /\bdue\s+to\b/i,
  /\bmediated\s+by\b/i,
  /\btriggers?\b/i,
  /\bcascade\b/i,
  /\bpathway\b/i,
  /\binvolves?\b/i,
];

const DIAGNOSTIC_CUES: RegExp[] = [
  /\bdiagnos(is|ed|tic)\b/i,
  /\bconfirm(s|ed)?\s+by\b/i,
  /\bgold\s+standard\b/i,
  /\bif\s+.+\s+then\b/i,
  /\btest\s+(of\s+choice|for)\b/i,
  /\bradiograph(ic|y)\b/i,
  /\bbiopsy\b/i,
  /\bhistolog(y|ical)\b/i,
  /\bworkup\b/i,
  /\binvestigation\b/i,
];

const TREATMENT_CUES: RegExp[] = [
  /\btreat(ment|ed)?\b/i,
  /\bmanage(ment|d)?\b/i,
  /\btherapy\b/i,
  /\bfirst[- ]line\b/i,
  /\bdrug\s+of\s+choice\b/i,
  /\bprescribe\b/i,
  /\badminister\b/i,
  /\bsurgical\b/i,
  /\bprocedure\b/i,
  /\bintervention\b/i,
  /\bstep\s+\d\b/i,
];

const RISK_CUES: RegExp[] = [
  /\brisk\s+factor\b/i,
  /\bpredispos(e|ing|ition)\b/i,
  /\betiology\b/i,
  /\bcause\b/i,
  /\bassociated\s+with\b/i,
  /\bincreased?\s+risk\b/i,
  /\bprotective\s+factor\b/i,
  /\bcomplication\b/i,
  /\bsequela\b/i,
];

const ANATOMY_CUES: RegExp[] = [
  /\banatom(y|ical)\b/i,
  /\binnervat(ed|ion)\b/i,
  /\bblood\s+supply\b/i,
  /\borigin\s+and\s+insertion\b/i,
  /\bfunction\s+of\b/i,
  /\bstructure\b/i,
  /\battachment\b/i,
  /\blandmark\b/i,
  /\bforamen\b/i,
  /\bbranch(es)?\s+of\b/i,
];

const DEFINITION_CUES: RegExp[] = [
  /\bdefined?\s+as\b/i,
  /\brefers?\s+to\b/i,
  /\bis\s+a\s+(type|form|condition|disease)\b/i,
  /\btermed?\b/i,
  /\bknown\s+as\b/i,
  /\bsynonym\b/i,
];

// ============================================================================
// Pattern Type Classifier
// ============================================================================

function classifyPatternType(text: string): PatternType {
  const scores: { type: PatternType; score: number }[] = [
    { type: 'PRESENTATION', score: countMatches(text, PRESENTATION_CUES) * 2 },
    { type: 'MECHANISM', score: countMatches(text, MECHANISM_CUES) * 2 },
    { type: 'DIAGNOSTIC_PATHWAY', score: countMatches(text, DIAGNOSTIC_CUES) * 2 },
    { type: 'TREATMENT_PATHWAY', score: countMatches(text, TREATMENT_CUES) * 2 },
    { type: 'RISK_PATTERN', score: countMatches(text, RISK_CUES) * 2 },
    { type: 'ANATOMY_FUNCTION', score: countMatches(text, ANATOMY_CUES) * 2 },
    { type: 'DEFINITIONAL_SCHEMA', score: countMatches(text, DEFINITION_CUES) * 2 },
  ];

  scores.sort((a, b) => b.score - a.score);

  if (scores[0].score === 0) return 'DEFINITIONAL_SCHEMA';
  return scores[0].type;
}

function countMatches(text: string, patterns: RegExp[]): number {
  return patterns.filter(p => p.test(text)).length;
}

// ============================================================================
// Trigger Extraction
// ============================================================================

function extractTrigger(text: string, type: PatternType): string {
  // Try to extract the main phrase that triggers this pattern
  const triggerPatterns: Record<PatternType, RegExp[]> = {
    PRESENTATION: [/\bpresents?\s+with\s+(.{10,60})/i, /\bcharacterized\s+by\s+(.{10,60})/i],
    MECHANISM: [/\bcaused?\s+by\s+(.{10,60})/i, /\bleads?\s+to\s+(.{10,60})/i, /\bresults?\s+in\s+(.{10,60})/i],
    DIAGNOSTIC_PATHWAY: [/\bdiagnosed?\s+by\s+(.{10,60})/i, /\bconfirmed?\s+by\s+(.{10,60})/i],
    TREATMENT_PATHWAY: [/\btreated?\s+with\s+(.{10,60})/i, /\bmanaged?\s+with\s+(.{10,60})/i],
    RISK_PATTERN: [/\brisk\s+factors?\s+(?:include|are)\s+(.{10,60})/i, /\bassociated\s+with\s+(.{10,60})/i],
    ANATOMY_FUNCTION: [/\bfunction\s+(?:of|is)\s+(.{10,60})/i, /\binnervated?\s+by\s+(.{10,60})/i],
    DEFINITIONAL_SCHEMA: [/\bis\s+defined?\s+as\s+(.{10,60})/i, /\brefers?\s+to\s+(.{10,60})/i],
  };

  for (const pattern of (triggerPatterns[type] || [])) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1].replace(/[.;,]$/, '').trim();
    }
  }

  // Fallback: first sentence up to 80 chars
  const firstSentence = text.split(/[.!?]/)[0] || '';
  return firstSentence.slice(0, 80).trim();
}

// ============================================================================
// Interpretation Generator
// ============================================================================

function generateInterpretation(text: string, type: PatternType): string {
  const interpretations: Record<PatternType, (text: string) => string> = {
    PRESENTATION: (t) => {
      const match = t.match(/\b(suggests?|indicates?|consistent\s+with)\s+(\w+[\w\s]{3,30})/i);
      return match ? `Suggests ${match[2].trim()}` : 'Clinical presentation pattern for differential consideration';
    },
    MECHANISM: (t) => {
      const match = t.match(/\b(leads?\s+to|results?\s+in|causes?)\s+(\w+[\w\s]{3,30})/i);
      return match ? `Pathophysiologic pathway leading to ${match[2].trim()}` : 'Mechanistic process underlying clinical finding';
    },
    DIAGNOSTIC_PATHWAY: (t) => {
      const match = t.match(/\b(confirms?|diagnos\w+)\s+(\w+[\w\s]{3,30})/i);
      return match ? `Diagnostic approach for ${match[2].trim()}` : 'Diagnostic reasoning pathway';
    },
    TREATMENT_PATHWAY: (t) => {
      const match = t.match(/\b(treat\w+|manag\w+|therap\w+)\s+(?:of|for|with)\s+(\w+[\w\s]{3,30})/i);
      return match ? `Treatment approach for ${match[2].trim()}` : 'Stepwise management protocol';
    },
    RISK_PATTERN: (t) => {
      const match = t.match(/\brisk\s+(?:of|for)\s+(\w+[\w\s]{3,30})/i);
      return match ? `Risk factors contributing to ${match[1].trim()}` : 'Risk factor pattern for clinical consideration';
    },
    ANATOMY_FUNCTION: (t) => {
      const match = t.match(/\b(function|role|action)\s+(?:of|is)\s+(\w+[\w\s]{3,30})/i);
      return match ? `Functional significance of ${match[2].trim()}` : 'Structure-function relationship with clinical relevance';
    },
    DEFINITIONAL_SCHEMA: (t) => {
      return 'Core concept definition for foundational understanding';
    },
  };

  return interpretations[type](text);
}

// ============================================================================
// Differential Extraction
// ============================================================================

function extractDifferentials(text: string): string[] {
  const differentials: string[] = [];

  // "X vs Y" pattern
  const vsMatch = text.match(/\b(\w[\w\s]{2,25})\s+vs\.?\s+(\w[\w\s]{2,25})\b/i);
  if (vsMatch) {
    differentials.push(vsMatch[1].trim(), vsMatch[2].trim());
  }

  // "differential diagnosis includes X, Y, Z"
  const ddxMatch = text.match(/differential\s+(?:diagnosis|dx)\s+(?:includes?|:)\s+(.{10,100})/i);
  if (ddxMatch) {
    const items = ddxMatch[1].split(/[,;]/).map(s => s.trim()).filter(s => s.length > 2 && s.length < 40);
    differentials.push(...items);
  }

  // "distinguish X from Y"
  const distMatch = text.match(/\bdistinguish\s+(\w[\w\s]{2,25})\s+from\s+(\w[\w\s]{2,25})\b/i);
  if (distMatch) {
    differentials.push(distMatch[1].trim(), distMatch[2].trim());
  }

  return [...new Set(differentials)].slice(0, 5);
}

// ============================================================================
// Main Pattern Extraction
// ============================================================================

/**
 * Extract patterns from a single unit
 */
export function extractPatterns(
  unit: ExtractedUnit,
  bookId: ID
): Pattern[] {
  const text = unit.cleanText || unit.text;

  // Skip very short or empty text
  if (text.length < 30) return [];

  const type = classifyPatternType(text);
  const trigger = extractTrigger(text, type);
  const interpretation = generateInterpretation(text, type);
  const differential = extractDifferentials(text);

  // Compute confidence based on how many cues match
  const allCues = [
    ...PRESENTATION_CUES, ...MECHANISM_CUES, ...DIAGNOSTIC_CUES,
    ...TREATMENT_CUES, ...RISK_CUES, ...ANATOMY_CUES, ...DEFINITION_CUES,
  ];
  const totalCueHits = countMatches(text, allCues);
  const confidence = Math.min(1, 0.3 + totalCueHits * 0.1);

  // Only return patterns with meaningful triggers
  if (trigger.length < 10 && confidence < 0.4) return [];

  return [{
    patternId: `pat_${unit.unitId}_${Date.now().toString(36)}`,
    bookId,
    type,
    trigger,
    interpretation,
    differential: differential.length > 0 ? differential : undefined,
    evidence: [{
      unitId: unit.unitId,
      page: unit.page,
      quote: text.slice(0, 120),
    }],
    confidence,
    createdAt: new Date().toISOString(),
  }];
}

/**
 * Extract patterns from all units
 */
export function extractAllPatterns(
  units: ExtractedUnit[],
  bookId: ID
): Pattern[] {
  const patterns: Pattern[] = [];
  for (const unit of units) {
    patterns.push(...extractPatterns(unit, bookId));
  }
  return patterns;
}

// ============================================================================
// Clustering Logic
// ============================================================================

/**
 * Simple keyword tokenizer for clustering
 */
function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3)
  );
}

/**
 * Jaccard similarity between two token sets
 */
function jaccard(a: Set<string>, b: Set<string>): number {
  let intersection = 0;
  for (const w of a) {
    if (b.has(w)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Cluster patterns by shared triggers, differentials, anatomy, management
 */
export function clusterPatterns(
  patterns: Pattern[],
  bookId: ID,
  options?: { minSimilarity?: number; maxClusterSize?: number }
): PatternCluster[] {
  const minSim = options?.minSimilarity ?? 0.15;
  const maxSize = options?.maxClusterSize ?? 12;

  if (patterns.length === 0) return [];

  // Build token sets for each pattern
  const tokenSets = patterns.map(p => ({
    pattern: p,
    tokens: tokenize(
      [p.trigger, p.interpretation, ...(p.differential || [])].join(' ')
    ),
  }));

  // Greedy clustering
  const assigned = new Set<ID>();
  const clusters: PatternCluster[] = [];

  for (let i = 0; i < tokenSets.length; i++) {
    if (assigned.has(tokenSets[i].pattern.patternId)) continue;

    const clusterPatterns: Pattern[] = [tokenSets[i].pattern];
    assigned.add(tokenSets[i].pattern.patternId);

    for (let j = i + 1; j < tokenSets.length && clusterPatterns.length < maxSize; j++) {
      if (assigned.has(tokenSets[j].pattern.patternId)) continue;

      const sim = jaccard(tokenSets[i].tokens, tokenSets[j].tokens);

      // Also check page proximity
      const pageClose = Math.abs(tokenSets[i].pattern.evidence[0]?.page - tokenSets[j].pattern.evidence[0]?.page) <= 3;

      // Also check shared differentials
      const sharedDiff = (tokenSets[i].pattern.differential || [])
        .some(d => (tokenSets[j].pattern.differential || []).includes(d));

      // Also check same type
      const sameType = tokenSets[i].pattern.type === tokenSets[j].pattern.type;

      if (sim >= minSim || (pageClose && sameType) || sharedDiff) {
        clusterPatterns.push(tokenSets[j].pattern);
        assigned.add(tokenSets[j].pattern.patternId);
      }
    }

    // Only create clusters with 2+ patterns or high-confidence single patterns
    if (clusterPatterns.length >= 2 || (clusterPatterns.length === 1 && clusterPatterns[0].confidence >= 0.7)) {
      const pages = clusterPatterns
        .flatMap(p => p.evidence.map(e => e.page))
        .sort((a, b) => a - b);

      const types = [...new Set(clusterPatterns.map(p => p.type))];

      // Pick top 3 anchor units by confidence
      const anchorUnits = clusterPatterns
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 3)
        .flatMap(p => p.evidence.map(e => e.unitId));

      // Generate cluster name
      const name = generateClusterName(clusterPatterns);

      clusters.push({
        clusterId: `clust_${bookId}_${Date.now().toString(36)}_${clusters.length}`,
        bookId,
        name,
        types,
        patternIds: clusterPatterns.map(p => p.patternId),
        anchorUnitIds: [...new Set(anchorUnits)].slice(0, 3),
        pageRange: pages.length > 0 ? { start: pages[0], end: pages[pages.length - 1] } : undefined,
        createdAt: new Date().toISOString(),
      });
    }
  }

  return clusters;
}

/**
 * Generate a descriptive cluster name from its patterns
 */
function generateClusterName(patterns: Pattern[]): string {
  // Use the most common type
  const typeCounts: Record<string, number> = {};
  for (const p of patterns) {
    typeCounts[p.type] = (typeCounts[p.type] || 0) + 1;
  }
  const dominantType = Object.entries(typeCounts)
    .sort(([, a], [, b]) => b - a)[0]?.[0] || 'PATTERN';

  // Use key words from triggers
  const allWords: Record<string, number> = {};
  for (const p of patterns) {
    const words = p.trigger.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    for (const w of words) {
      allWords[w] = (allWords[w] || 0) + 1;
    }
  }

  const topWords = Object.entries(allWords)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([word]) => word)
    .join(' ');

  const typeLabel = dominantType.replace(/_/g, ' ').toLowerCase();
  return `${topWords} (${typeLabel})`.slice(0, 50);
}

/**
 * Run full pattern extraction + clustering pipeline
 */
export function runPatternPipeline(
  units: ExtractedUnit[],
  bookId: ID
): { patterns: Pattern[]; clusters: PatternCluster[] } {
  const patterns = extractAllPatterns(units, bookId);
  const clusters = clusterPatterns(patterns, bookId);
  return { patterns, clusters };
}

export default {
  extractPatterns,
  extractAllPatterns,
  clusterPatterns,
  runPatternPipeline,
};
