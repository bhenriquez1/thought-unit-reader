// lib/engines/insightsEngine.ts
// Generates InsightsResult from extracted text
// What Matters: High-yield items detected on the page/chapter
// What You May Be Missing: Missing nodes based on expected structure

import type {
  DocID,
  PageIndex,
  ChapterID,
  InsightsResult,
  InsightItem,
  EvidenceRef,
  Tag,
  ExtractionMode,
  PageExtractionResult,
  ChapterExtractionResult,
  RelationNodeType,
  EXPECTED_REASONING_STRUCTURE,
} from './types';
import { putInsights, getInsights } from '../storage/indexedDB';

// ============================================================================
// Pattern Detection for High-Yield Items
// ============================================================================

interface DetectedPattern {
  type: 'definition' | 'process' | 'rule' | 'exception' | 'trap' | 'threshold' | 'diagnosis' | 'treatment';
  match: string;
  context: string;
  confidence: number;
  tags: Tag[];
}

const DETECTION_PATTERNS: Array<{
  type: DetectedPattern['type'];
  patterns: RegExp[];
  baseTags: Tag[];
  confidenceBoost: number;
}> = [
  {
    type: 'definition',
    patterns: [
      /([A-Z][a-z]+(?:\s+[A-Za-z]+)*)\s+(?:is|are)\s+(?:defined as|a|an|the)\s+([^.]+)/gi,
      /(?:definition|term):\s*([^.]+)/gi,
      /([A-Z][a-z]+(?:\s+[A-Za-z]+)*)\s+refers to\s+([^.]+)/gi,
    ],
    baseTags: ['DEFINITION'],
    confidenceBoost: 0.9,
  },
  {
    type: 'process',
    patterns: [
      /([A-Z][a-z]+(?:\s+[A-Za-z]+)*)\s+(?:causes|leads to|results in|produces)\s+([^.]+)/gi,
      /(?:process|mechanism):\s*([^.]+)/gi,
      /([A-Z][a-z]+(?:\s+[A-Za-z]+)*)\s+→\s+([^.]+)/gi,
    ],
    baseTags: ['HIGH_YIELD'],
    confidenceBoost: 0.85,
  },
  {
    type: 'rule',
    patterns: [
      /(?:always|never|must|should)\s+([^.]+)/gi,
      /(?:rule|principle):\s*([^.]+)/gi,
      /(?:remember|note that)\s+([^.]+)/gi,
    ],
    baseTags: ['HIGH_YIELD'],
    confidenceBoost: 0.8,
  },
  {
    type: 'exception',
    patterns: [
      /(?:except|however|but not|unlike|exception)\s+([^.]+)/gi,
      /(?:exception|caveat):\s*([^.]+)/gi,
      /([A-Z][a-z]+(?:\s+[A-Za-z]+)*)\s+is contraindicated\s+([^.]+)/gi,
    ],
    baseTags: ['EXCEPTION', 'TRAP'],
    confidenceBoost: 0.95,
  },
  {
    type: 'trap',
    patterns: [
      /(?:do not confuse|confused with|mistaken for|look-alike)\s+([^.]+)/gi,
      /(?:common mistake|pitfall|trap):\s*([^.]+)/gi,
      /(?:NOT|not the same as)\s+([^.]+)/gi,
    ],
    baseTags: ['TRAP'],
    confidenceBoost: 0.95,
  },
  {
    type: 'threshold',
    patterns: [
      /(\d+(?:\.\d+)?)\s*(?:mg|ml|mm|%|mmHg|mEq|IU|mcg|g\/dL)/gi,
      /(?:threshold|cutoff|level):\s*(\d+[^.]*)/gi,
      /(?:greater than|less than|above|below)\s*(\d+[^.]*)/gi,
    ],
    baseTags: ['HIGH_YIELD'],
    confidenceBoost: 0.85,
  },
  {
    type: 'diagnosis',
    patterns: [
      /(?:diagnos(?:is|ed|tic)|pathognomonic|present with)\s+([^.]+)/gi,
      /(?:classic|typical|hallmark)\s+(?:finding|sign|symptom)\s+([^.]+)/gi,
      /([A-Z][a-z]+(?:\s+[A-Za-z]+)*)\s+(?:is diagnosed by|confirmed by)\s+([^.]+)/gi,
    ],
    baseTags: ['DIAGNOSIS', 'DAT'],
    confidenceBoost: 0.85,
  },
  {
    type: 'treatment',
    patterns: [
      /(?:treat(?:ment|ed)?|therapy|manage(?:ment|d)?)\s+(?:of|for|with)\s+([^.]+)/gi,
      /(?:first-line|drug of choice|gold standard)\s+([^.]+)/gi,
      /([A-Z][a-z]+(?:\s+[A-Za-z]+)*)\s+is treated with\s+([^.]+)/gi,
    ],
    baseTags: ['TREATMENT'],
    confidenceBoost: 0.8,
  },
];

// ============================================================================
// Generate Insights from Extraction
// ============================================================================

export async function generateInsights(
  extraction: PageExtractionResult | ChapterExtractionResult
): Promise<InsightsResult> {
  const { docId, text, evidence } = extraction;
  const scope = extraction.mode === 'PAGE'
    ? { mode: 'PAGE' as ExtractionMode, pageIndex: (extraction as PageExtractionResult).pageIndex }
    : { mode: 'CHAPTER' as ExtractionMode, chapterId: (extraction as ChapterExtractionResult).chapterId };

  // Check cache first
  const cacheKey = scope.pageIndex !== undefined
    ? `page:${scope.pageIndex}`
    : `chapter:${scope.chapterId}`;

  const cached = await getInsights<InsightsResult>(docId);
  if (cached && (cached as any)[cacheKey]) {
    return (cached as any)[cacheKey];
  }

  // Detect patterns in text
  const detectedPatterns = detectPatterns(text);

  // Generate "What Matters" items
  const whatMatters = generateWhatMatters(detectedPatterns, docId, scope, evidence);

  // Generate "What You May Be Missing" based on expected structure
  const whatMissing = generateWhatMissing(detectedPatterns, docId, scope);

  const result: InsightsResult = {
    docId,
    scope,
    generatedAt: Date.now(),
    whatMatters,
    whatMissing,
  };

  // Store in IndexedDB
  const existingInsights = (await getInsights<InsightsResult>(docId)) || {};
  existingInsights[cacheKey] = result;
  await putInsights(docId, existingInsights);

  return result;
}

function detectPatterns(text: string): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const sentences = text.split(/[.!?]+/);

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (trimmed.length < 20) continue;

    for (const patternDef of DETECTION_PATTERNS) {
      for (const regex of patternDef.patterns) {
        // Reset regex state
        regex.lastIndex = 0;
        const match = regex.exec(trimmed);
        if (match) {
          patterns.push({
            type: patternDef.type,
            match: match[0],
            context: trimmed,
            confidence: patternDef.confidenceBoost,
            tags: [...patternDef.baseTags],
          });
        }
      }
    }
  }

  // Dedupe by context
  const seen = new Set<string>();
  return patterns.filter(p => {
    const key = p.context.toLowerCase().slice(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function generateWhatMatters(
  patterns: DetectedPattern[],
  docId: DocID,
  scope: InsightsResult['scope'],
  existingEvidence: EvidenceRef[]
): InsightItem[] {
  const items: InsightItem[] = [];

  // Sort patterns by confidence
  const sorted = [...patterns].sort((a, b) => b.confidence - a.confidence);

  for (const pattern of sorted.slice(0, 15)) {
    const id = `insight_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Extract title from match
    const title = extractTitle(pattern);

    // Generate why it matters based on type
    const whyItMatters = generateWhyItMatters(pattern);

    // Find matching evidence
    const evidence = existingEvidence.filter(e =>
      pattern.context.includes(e.snippet.slice(0, 30))
    );

    items.push({
      id,
      title,
      summary: pattern.context.slice(0, 150) + (pattern.context.length > 150 ? '...' : ''),
      whyItMatters,
      tags: pattern.tags,
      confidence: pattern.confidence,
      evidence: evidence.length > 0 ? evidence : [{
        docId,
        pageIndex: scope.pageIndex,
        chapterId: scope.chapterId,
        snippet: pattern.context.slice(0, 100),
      }],
    });
  }

  return items;
}

function extractTitle(pattern: DetectedPattern): string {
  // Try to extract a clean title from the match
  const words = pattern.match.split(/\s+/);

  // Find capitalized terms or key phrases
  const capitalWords = words.filter(w => /^[A-Z]/.test(w));
  if (capitalWords.length >= 2) {
    return capitalWords.slice(0, 4).join(' ');
  }

  // Fall back to first few words
  return words.slice(0, 5).join(' ');
}

function generateWhyItMatters(pattern: DetectedPattern): string {
  const templates: Record<DetectedPattern['type'], string[]> = {
    definition: [
      'Core definition - likely to appear on exams as direct recall',
      'Fundamental concept that forms the basis for clinical reasoning',
    ],
    process: [
      'Mechanism understanding is tested frequently in DAT/NBDE',
      'Knowing the pathway helps predict related clinical scenarios',
    ],
    rule: [
      'Clinical rules are high-yield for board exams',
      'Must-know principle for clinical practice',
    ],
    exception: [
      'Exceptions are classic board question material',
      'Understanding exceptions prevents common mistakes',
    ],
    trap: [
      'Common confusion point - frequently tested',
      'Knowing this distinction prevents exam errors',
    ],
    threshold: [
      'Numeric values are directly testable',
      'Thresholds guide clinical decision-making',
    ],
    diagnosis: [
      'Diagnostic criteria are commonly tested',
      'Pattern recognition for clinical vignettes',
    ],
    treatment: [
      'Treatment protocols are high-yield for exams',
      'First-line treatments are must-know content',
    ],
  };

  const options = templates[pattern.type] || ['Important concept for understanding'];
  return options[Math.floor(Math.random() * options.length)];
}

function generateWhatMissing(
  patterns: DetectedPattern[],
  docId: DocID,
  scope: InsightsResult['scope']
): InsightItem[] {
  const items: InsightItem[] = [];

  // Map pattern types to relation node types
  const patternToNode: Record<DetectedPattern['type'], RelationNodeType> = {
    definition: 'CONCEPT',
    process: 'FINDING',
    rule: 'TREATMENT',
    exception: 'EXCEPTION',
    trap: 'EXCEPTION',
    threshold: 'FINDING',
    diagnosis: 'DIAGNOSIS',
    treatment: 'TREATMENT',
  };

  // Check what types we have
  const presentTypes = new Set(patterns.map(p => patternToNode[p.type]));

  // Expected structure based on what's present
  const EXPECTED_STRUCTURE: Record<RelationNodeType, RelationNodeType[]> = {
    CONCEPT: ['SYMPTOM', 'FINDING', 'DIAGNOSIS'],
    SYMPTOM: ['FINDING', 'TEST', 'DIAGNOSIS'],
    FINDING: ['TEST', 'DIAGNOSIS', 'TREATMENT'],
    TEST: ['DIAGNOSIS', 'FINDING'],
    DIAGNOSIS: ['TREATMENT', 'RISK', 'EXCEPTION'],
    TREATMENT: ['RISK', 'EXCEPTION', 'DIAGNOSIS'],
    RISK: ['TREATMENT', 'EXCEPTION'],
    EXCEPTION: ['TREATMENT', 'DIAGNOSIS'],
  };

  // Find missing expected types
  for (const presentType of presentTypes) {
    const expected = EXPECTED_STRUCTURE[presentType] || [];
    for (const expectedType of expected) {
      if (!presentTypes.has(expectedType)) {
        const id = `missing_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        items.push({
          id,
          title: `Missing: ${formatNodeType(expectedType)}`,
          summary: `This content discusses ${formatNodeType(presentType)} but doesn't include related ${formatNodeType(expectedType).toLowerCase()} information.`,
          whyItMatters: `Complete understanding requires knowing the ${formatNodeType(expectedType).toLowerCase()} aspects.`,
          tags: ['HIGH_YIELD'],
          confidence: 0.6,
          evidence: [{
            docId,
            pageIndex: scope.pageIndex,
            chapterId: scope.chapterId,
            snippet: `Expected ${formatNodeType(expectedType)} based on ${formatNodeType(presentType)} content`,
          }],
        });
      }
    }
  }

  // Dedupe by type
  const seen = new Set<string>();
  return items.filter(item => {
    const key = item.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 5); // Limit to 5 missing suggestions
}

function formatNodeType(type: RelationNodeType): string {
  const labels: Record<RelationNodeType, string> = {
    CONCEPT: 'Concept/Definition',
    SYMPTOM: 'Symptoms',
    FINDING: 'Clinical Findings',
    TEST: 'Diagnostic Tests',
    DIAGNOSIS: 'Diagnosis',
    TREATMENT: 'Treatment',
    RISK: 'Risk Factors',
    EXCEPTION: 'Exceptions/Contraindications',
  };
  return labels[type] || type;
}

// ============================================================================
// Export
// ============================================================================

export { detectPatterns, generateWhatMatters, generateWhatMissing };
