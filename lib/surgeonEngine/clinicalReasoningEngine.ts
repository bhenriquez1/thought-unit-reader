// lib/surgeonEngine/clinicalReasoningEngine.ts
// Clinical Reasoning Engine (PR4B)
// Detects IF→THEN chains and clinical decision patterns from ParagraphUnit[].
// Returns AnchoredItem(kind="clinical_flow") with {nodes, edges} payload.
// Universal — not dental/medical-specific.

import type { ParagraphUnit, AnchoredItem, SourceRef } from '../page-intelligence/types';
import type { ClinicalNode, ClinicalEdge, ClinicalFlow, ClinicalNodeType } from './types';

// ============================================================================
// Pattern definitions
// ============================================================================

// Conditional openers that introduce IF→THEN chains
const CONDITIONAL_RES = [
  /\bif\b.{3,}/i,
  /\bwhen\b.{3,}/i,
  /\bunless\b.{3,}/i,
  /\bgiven that\b.{3,}/i,
  /\bin (the )?case of\b/i,
  /\bprovided that\b/i,
];

// Consequence markers (THEN side)
const CONSEQUENCE_RES = [
  /\bthen\b.{3,}/i,
  /\btherefore\b.{3,}/i,
  /\bthus\b.{3,}/i,
  /\bhence\b.{3,}/i,
  /\bleads? to\b/i,
  /\bresults? in\b/i,
];

// Test/result patterns
const TEST_RESULT_RES = [
  /\b(positive|negative|elevated|increased|decreased|abnormal|normal)\s+(result|finding|level|test)\b/i,
  /\b(if|when)\s+(result|finding|test)\s+is\s+(positive|negative|elevated)\b/i,
  /\b(sign|symptom|lab|CBC|CT|MRI|X-ray|biopsy|culture)\s+(shows?|reveals?|indicates?)\b/i,
];

// Action verb patterns (clinical decisions)
const ACTION_VERB_RES = [
  /\b(treat|manage|prescribe|refer|monitor|administer|initiate|start|stop|discontinue|switch)\b/i,
];

// Node type classification heuristics
const NODE_TYPE_PATTERNS: Array<{ re: RegExp; type: ClinicalNodeType }> = [
  { re: /\b(presents? with|complains? of|chief complaint)\b/i, type: 'chief-complaint' },
  { re: /\b(sign|symptom|finding|presents?)\b/i, type: 'finding' },
  { re: /\b(risk factor|predispos|susceptib)\b/i, type: 'risk-factor' },
  { re: /\b(differential|rule out|consider)\b/i, type: 'differential' },
  { re: /\b(test|lab|CBC|MRI|CT|biopsy|culture|measure)\b/i, type: 'test' },
  { re: /\b(diagnos(is|ed|e)|confirme?d?)\b/i, type: 'diagnosis' },
  { re: /\b(treat|therapy|management|prescrib|drug|medic|intervention)\b/i, type: 'treatment' },
  { re: /\b(complication|adverse|side effect|sequela)\b/i, type: 'complication' },
  { re: /\b(follow.?up|monitor|surveil)\b/i, type: 'follow-up' },
];

// ============================================================================
// Helpers
// ============================================================================

function isConditional(text: string): boolean {
  return CONDITIONAL_RES.some(re => re.test(text));
}

function hasConsequence(text: string): boolean {
  return CONSEQUENCE_RES.some(re => re.test(text));
}

function hasTestResult(text: string): boolean {
  return TEST_RESULT_RES.some(re => re.test(text));
}

function hasActionVerb(text: string): boolean {
  return ACTION_VERB_RES.some(re => re.test(text));
}

function classifyNodeType(text: string): ClinicalNodeType {
  for (const { re, type } of NODE_TYPE_PATTERNS) {
    if (re.test(text)) return type;
  }
  return 'finding';
}

function makeSentenceLabel(text: string): string {
  // Extract a short label from text (first meaningful phrase, ≤ 60 chars)
  const first = text.split(/[.;]/)[0]?.trim() ?? text;
  return first.length > 60 ? first.slice(0, 57) + '…' : first;
}

function generateNodeId(prefix: string, idx: number): string {
  return `${prefix}_${idx}`;
}

// ============================================================================
// Chain extraction
// ============================================================================

interface Chain {
  antecedentText: string;
  consequentText: string;
  paragraphUnit: ParagraphUnit;
}

/**
 * Split a paragraph into IF (antecedent) and THEN (consequent) parts.
 * Returns null if no clear chain is detectable.
 */
function extractChain(unit: ParagraphUnit): Chain | null {
  const text = unit.text;

  // Look for "if … then …" or conditional + action
  const ifMatch = text.match(/\b(if|when|unless|given that|in case of)\b(.{5,})/i);
  const thenMatch = text.match(/\b(then|therefore|thus|hence|leads? to|results? in)\b(.{5,})/i);

  if (ifMatch && thenMatch) {
    return {
      antecedentText: ifMatch[2].trim(),
      consequentText: thenMatch[2].trim(),
      paragraphUnit: unit,
    };
  }

  // For test/result + action patterns even without explicit "then"
  if (hasTestResult(text) && hasActionVerb(text)) {
    const parts = text.split(/[;,]/).filter(p => p.trim().length > 10);
    if (parts.length >= 2) {
      return {
        antecedentText: parts[0].trim(),
        consequentText: parts.slice(1).join(', ').trim(),
        paragraphUnit: unit,
      };
    }
  }

  return null;
}

// ============================================================================
// Main engine function
// ============================================================================

let _flowCounter = 0;

/**
 * Run clinical reasoning detection on ParagraphUnit[].
 * Returns one AnchoredItem per detected reasoning chain.
 *
 * The payload is a ClinicalFlow with nodes + edges.
 * Clicking an edge in the UI should jump to source.paragraphId.
 */
export function runClinicalReasoningEngine(
  units: ParagraphUnit[],
  docId: string,
): AnchoredItem[] {
  const items: AnchoredItem[] = [];

  for (const unit of units) {
    const { text } = unit;

    // Only process paragraphs that contain conditional or causal language
    if (!isConditional(text) && !hasConsequence(text) && !unit.signals.hasCausal) continue;
    // Skip very short snippets
    if (text.length < 40) continue;

    const chain = extractChain(unit);
    if (!chain) continue;

    const antecedentType = classifyNodeType(chain.antecedentText);
    const consequentType = classifyNodeType(chain.consequentText);

    const flowId = `flow_${docId}_${++_flowCounter}`;
    const nodeA: ClinicalNode = {
      id: generateNodeId(flowId, 1),
      type: antecedentType,
      label: makeSentenceLabel(chain.antecedentText),
      details: [chain.antecedentText.slice(0, 200)],
      evidence: [],
    };
    const nodeB: ClinicalNode = {
      id: generateNodeId(flowId, 2),
      type: consequentType,
      label: makeSentenceLabel(chain.consequentText),
      details: [chain.consequentText.slice(0, 200)],
      evidence: [],
    };

    const relation = unit.signals.hasCausal ? 'leads-to' as const : 'requires' as const;
    const edge: ClinicalEdge = {
      from: nodeA.id,
      to: nodeB.id,
      relation,
      note: `Detected IF→THEN in paragraph starting at char ${unit.startChar}`,
    };

    const flow: ClinicalFlow = {
      id: flowId,
      title: `${nodeA.label} → ${nodeB.label}`,
      nodes: [nodeA, nodeB],
      edges: [edge],
    };

    const source: SourceRef = {
      pageIndex: unit.pageIndex,
      paragraphId: unit.id,
      startChar: unit.startChar,
      endChar: unit.endChar,
      quote: text.slice(0, 180),
      bbox: unit.bbox,
      confidence: 0.7,
    };

    items.push({
      id: `clinical_flow:${unit.id}`,
      kind: 'clinical_flow',
      title: flow.title,
      content: `${nodeA.label} → ${nodeB.label}`,
      tags: ['clinical_flow', antecedentType, consequentType],
      source,
      payload: flow,
    });
  }

  return items;
}
