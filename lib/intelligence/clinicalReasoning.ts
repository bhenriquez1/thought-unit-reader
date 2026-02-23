// lib/intelligence/clinicalReasoning.ts
// Clinical Reasoning Detection — heuristic flow-frame analysis
// Detects when a paragraph contains clinical reasoning structure
// (Presentation → Findings → Differential → Decision → Management)

// ============================================================================
// Output types
// ============================================================================

export type ClinicalFlowNodeType =
  | 'Presentation'
  | 'Findings'
  | 'Differential'
  | 'Decision'
  | 'NextStep';

export interface ClinicalFlowNode {
  type: ClinicalFlowNodeType;
  text: string; // sentence or phrase from source
}

export interface ClinicalReasoningResult {
  isClinicalReasoning: boolean;
  confidence: number; // 0..1
  nodes: ClinicalFlowNode[];
  triggers: string[]; // which markers fired
}

// ============================================================================
// Marker sets (spec-defined)
// ============================================================================

const PRESENTATION_MARKERS = [
  'chief complaint', 'presents with', 'complains of', 'symptom',
  'pain', 'swelling', 'fever', 'bleeding',
];

const FINDINGS_MARKERS = [
  'exam reveals', 'on examination', 'clinical findings', 'radiographic',
  'x-ray', 'ct', 'mri', 'labs', 'test shows',
];

const DIFFERENTIAL_MARKERS = [
  'differential', 'consider', 'rule out', 'vs', 'versus',
  'distinguish', 'mimics',
];

const DECISION_MARKERS = [
  'therefore', 'thus', 'so', 'indicates', 'suggests',
  'consistent with', 'diagnosis',
];

const MANAGEMENT_MARKERS = [
  'treat', 'management', 'therapy', 'antibiotic', 'surgery',
  'follow-up', 'refer', 'monitor',
];

const IF_THEN_RE = /\bif\b.{3,120}\bthen\b/i;
const DIAG_TEST_TREAT_RE = /\b(diagnosis|test|treat|diagnos)\b/i;

// ============================================================================
// Helpers
// ============================================================================

/** Split text into sentences (simple heuristic: ". " or ".\n") */
function splitSentences(text: string): string[] {
  return text
    .replace(/([.!?])\s+/g, '$1\n')
    .split('\n')
    .map(s => s.trim())
    .filter(s => s.length > 8);
}

/** Find first sentence containing any of the given markers */
function extractNode(
  sentences: string[],
  markers: string[],
): string | null {
  const lower_markers = markers.map(m => m.toLowerCase());
  for (const s of sentences) {
    const sl = s.toLowerCase();
    if (lower_markers.some(m => sl.includes(m))) {
      return s.length > 160 ? s.slice(0, 160) + '…' : s;
    }
  }
  return null;
}

function hasAny(lower: string, markers: string[]): boolean {
  return markers.some(m => lower.includes(m));
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Detect clinical reasoning structure within a paragraph.
 * Returns a confidence score and extracted flow nodes.
 */
export function detectClinicalReasoning(text: string): ClinicalReasoningResult {
  const lower     = text.toLowerCase();
  const sentences = splitSentences(text);

  // Presence booleans per frame
  const hasPresentation = hasAny(lower, PRESENTATION_MARKERS);
  const hasFindings     = hasAny(lower, FINDINGS_MARKERS);
  const hasDifferential = hasAny(lower, DIFFERENTIAL_MARKERS);
  const hasDecision     = hasAny(lower, DECISION_MARKERS);
  const hasManagement   = hasAny(lower, MANAGEMENT_MARKERS);
  const hasIfThen       = IF_THEN_RE.test(lower);
  const hasDiagTest     = DIAG_TEST_TREAT_RE.test(lower);

  const presenceScore =
    (hasPresentation ? 0.20 : 0) +
    (hasFindings     ? 0.20 : 0) +
    (hasDifferential ? 0.20 : 0) +
    (hasDecision     ? 0.20 : 0) +
    (hasManagement   ? 0.20 : 0);

  // Trigger condition: ≥2 frames OR if/then + clinical vocab
  const isClinicalReasoning =
    presenceScore >= 0.40 || (hasIfThen && hasDiagTest);

  const confidence = Math.min(1, presenceScore + (hasIfThen ? 0.10 : 0));

  // Extract nodes (first matching sentence per frame)
  const nodes: ClinicalFlowNode[] = [];
  const triggers: string[] = [];

  const pText = extractNode(sentences, PRESENTATION_MARKERS);
  if (pText) { nodes.push({ type: 'Presentation', text: pText }); triggers.push('presentation'); }

  const fText = extractNode(sentences, FINDINGS_MARKERS);
  if (fText) { nodes.push({ type: 'Findings', text: fText }); triggers.push('findings'); }

  const dText = extractNode(sentences, DIFFERENTIAL_MARKERS);
  if (dText) { nodes.push({ type: 'Differential', text: dText }); triggers.push('differential'); }

  const decText = extractNode(sentences, DECISION_MARKERS);
  if (decText) { nodes.push({ type: 'Decision', text: decText }); triggers.push('decision'); }

  const mText = extractNode(sentences, MANAGEMENT_MARKERS);
  if (mText) { nodes.push({ type: 'NextStep', text: mText }); triggers.push('management'); }

  if (hasIfThen) triggers.push('if-then rule');

  return { isClinicalReasoning, confidence, nodes, triggers };
}
