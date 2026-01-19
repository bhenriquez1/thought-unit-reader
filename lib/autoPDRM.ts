// lib/autoPDRM.ts
// Automatic PDRM Classification for Highlights
// Classifies text as Pattern, Decision, Risk/Mistake, Mnemonic, or General

import type { PDRMMetadata } from './stores/annotationStore';

// ============================================================================
// Classification Types
// ============================================================================

export type PDRMType = 'pattern' | 'decision' | 'risk' | 'mnemonic' | 'general';

export interface ClassificationResult {
  type: PDRMType;
  confidence: number;
  pdrm: PDRMMetadata;
  reason: string;
}

// ============================================================================
// Keyword Patterns for Classification
// ============================================================================

const PATTERN_KEYWORDS = [
  // Core concepts
  'principle', 'concept', 'theory', 'model', 'framework',
  'mechanism', 'process', 'pathway', 'cycle', 'system',
  // Definitions
  'is defined as', 'refers to', 'means', 'known as',
  'characterized by', 'consists of', 'composed of',
  // Structure
  'structure', 'function', 'role', 'purpose', 'type',
  'classification', 'category', 'group', 'class',
  // Medical/Scientific
  'anatomy', 'physiology', 'pathology', 'etiology',
  'morphology', 'histology', 'biochemistry'
];

const DECISION_KEYWORDS = [
  // Actions
  'treatment', 'therapy', 'intervention', 'procedure',
  'management', 'approach', 'protocol', 'guideline',
  // Choices
  'first-line', 'second-line', 'preferred', 'recommended',
  'indicated', 'contraindicated', 'when to', 'if...then',
  // Clinical
  'diagnosis', 'differential', 'workup', 'evaluation',
  'assessment', 'prognosis', 'outcome',
  // Decision language
  'should', 'must', 'always', 'never', 'critical',
  'important to', 'essential', 'required'
];

const RISK_KEYWORDS = [
  // Warnings
  'warning', 'caution', 'danger', 'risk', 'hazard',
  'adverse', 'side effect', 'complication', 'toxicity',
  // Errors
  'mistake', 'error', 'pitfall', 'common error',
  'misdiagnosis', 'missed', 'overlooked',
  // Negatives
  'avoid', 'do not', 'never', 'contraindicated',
  'fatal', 'lethal', 'dangerous', 'harmful',
  // Exceptions
  'except', 'unless', 'however', 'but', 'although',
  'beware', 'careful', 'note that'
];

const MNEMONIC_KEYWORDS = [
  // Memory aids
  'remember', 'recall', 'memorize', 'tip',
  'trick', 'mnemonic', 'acronym', 'abbreviation',
  // Lists
  'a-b-c', 'steps', 'phases', 'stages',
  // Patterns
  'rule of', 'law of', 'formula', 'equation',
  // Associations
  'associated with', 'linked to', 'related to',
  'think of', 'visualize', 'imagine'
];

// ============================================================================
// Classification Logic
// ============================================================================

function countKeywords(text: string, keywords: string[]): number {
  const lowerText = text.toLowerCase();
  return keywords.filter(kw => lowerText.includes(kw.toLowerCase())).length;
}

function hasListStructure(text: string): boolean {
  // Check for numbered lists (1., 2., etc) or bullet points
  return /(\d+\.|•|-)/.test(text);
}

function hasAcronymPattern(text: string): boolean {
  // Check for all-caps words that might be acronyms
  return /\b[A-Z]{2,}\b/.test(text);
}

function hasClinicalDecisionLanguage(text: string): boolean {
  return /\b(if|when|then|should|must|always|never)\b/i.test(text);
}

function hasWarningLanguage(text: string): boolean {
  return /\b(warning|caution|avoid|danger|risk|error|mistake)\b/i.test(text);
}

// ============================================================================
// Main Classification Function
// ============================================================================

export function classifyHighlight(
  text: string,
  context?: {
    headingText?: string;
    chapterTitle?: string;
    pageIndex?: number;
  }
): ClassificationResult {
  const normalizedText = text.trim();
  
  // Short text gets lower confidence
  const lengthFactor = Math.min(1, normalizedText.length / 100);
  
  // Count keyword matches
  const patternScore = countKeywords(normalizedText, PATTERN_KEYWORDS);
  const decisionScore = countKeywords(normalizedText, DECISION_KEYWORDS);
  const riskScore = countKeywords(normalizedText, RISK_KEYWORDS);
  const mnemonicScore = countKeywords(normalizedText, MNEMONIC_KEYWORDS);
  
  // Bonus scoring based on structure
  let patternBonus = 0;
  let decisionBonus = 0;
  let riskBonus = 0;
  let mnemonicBonus = 0;
  
  // List structure suggests mnemonic
  if (hasListStructure(normalizedText)) {
    mnemonicBonus += 2;
  }
  
  // Acronyms suggest mnemonic
  if (hasAcronymPattern(normalizedText)) {
    mnemonicBonus += 1;
  }
  
  // Clinical decision language
  if (hasClinicalDecisionLanguage(normalizedText)) {
    decisionBonus += 2;
  }
  
  // Warning language
  if (hasWarningLanguage(normalizedText)) {
    riskBonus += 3;
  }
  
  // Context bonuses
  if (context?.headingText) {
    const heading = context.headingText.toLowerCase();
    if (heading.includes('principle') || heading.includes('concept')) patternBonus += 2;
    if (heading.includes('treatment') || heading.includes('management')) decisionBonus += 2;
    if (heading.includes('complication') || heading.includes('adverse')) riskBonus += 2;
    if (heading.includes('key point') || heading.includes('summary')) mnemonicBonus += 2;
  }
  
  // Calculate final scores
  const scores = {
    pattern: patternScore + patternBonus,
    decision: decisionScore + decisionBonus,
    risk: riskScore + riskBonus,
    mnemonic: mnemonicScore + mnemonicBonus
  };
  
  // Find highest score
  const maxScore = Math.max(...Object.values(scores));
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
  
  // Determine type
  let type: PDRMType = 'general';
  let reason = 'No strong classification signals detected';
  
  if (maxScore >= 2) {
    if (scores.risk === maxScore) {
      type = 'risk';
      reason = 'Contains warning/risk language';
    } else if (scores.decision === maxScore) {
      type = 'decision';
      reason = 'Contains clinical decision language';
    } else if (scores.mnemonic === maxScore) {
      type = 'mnemonic';
      reason = 'Contains memory aid patterns';
    } else if (scores.pattern === maxScore) {
      type = 'pattern';
      reason = 'Contains concept/definition language';
    }
  }
  
  // Calculate confidence
  const baseConfidence = maxScore >= 2 ? 0.6 : 0.3;
  const confidence = Math.min(0.95, baseConfidence + (maxScore * 0.1) * lengthFactor);
  
  // Build PDRM metadata
  const pdrm: PDRMMetadata = {};
  
  switch (type) {
    case 'pattern':
      pdrm.pattern = normalizedText.substring(0, 200);
      break;
    case 'decision':
      pdrm.decisionRule = normalizedText.substring(0, 200);
      break;
    case 'risk':
      pdrm.isMistake = true;
      pdrm.weakAreaTags = ['auto-classified', 'risk'];
      break;
    case 'mnemonic':
      pdrm.mnemonic = normalizedText.substring(0, 200);
      break;
    default:
      // General - no specific PDRM tag
      break;
  }
  
  return {
    type,
    confidence,
    pdrm,
    reason
  };
}

// ============================================================================
// Get PDRM Color for Type
// ============================================================================

export function getPDRMTypeColor(type: PDRMType): string {
  const colors: Record<PDRMType, string> = {
    pattern: '#9333EA',    // Purple
    decision: '#3B82F6',   // Blue
    risk: '#EF4444',       // Red
    mnemonic: '#F59E0B',   // Orange
    general: '#FFEB3B'     // Yellow (default highlight)
  };
  return colors[type];
}

// ============================================================================
// Get PDRM Type Label
// ============================================================================

export function getPDRMTypeLabel(type: PDRMType): { short: string; full: string; icon: string } {
  const labels: Record<PDRMType, { short: string; full: string; icon: string }> = {
    pattern: { short: 'P', full: 'Pattern', icon: '🎯' },
    decision: { short: 'D', full: 'Decision', icon: '⚖️' },
    risk: { short: 'R', full: 'Risk', icon: '⚠️' },
    mnemonic: { short: 'M', full: 'Mnemonic', icon: '🧠' },
    general: { short: 'G', full: 'General', icon: '📌' }
  };
  return labels[type];
}

export default classifyHighlight;
