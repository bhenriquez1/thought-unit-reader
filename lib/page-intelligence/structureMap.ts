// lib/page-intelligence/structureMap.ts
// Structure Map Extraction: Definition → Mechanism → Application → Clinical Relevance
// Produces a 4-stage scaffold per page for cognitive sequence learning

import type { Segment, Signal, ParagraphUnit } from './types';
import { generateId } from './types';

// ============================================================================
// Types
// ============================================================================

export type StructureMapStage =
  | 'definition'
  | 'mechanism'
  | 'application'
  | 'clinical_relevance';

export interface StructureMapNode {
  id: string;
  stage: StructureMapStage;
  /** Short display label */
  label: string;
  /** Representative text for this stage (≤ 200 chars) */
  text: string;
  /** Source segment or paragraph-unit IDs */
  sourceIds: string[];
  /** 0–1 detection confidence */
  confidence: number;
}

export interface StructureMap {
  pageNumber: number;
  /** Topic/heading for this page */
  topic: string;
  nodes: StructureMapNode[];
  /**
   * 0.0–1.0: fraction of the 4 canonical stages that were detected.
   * 1.0 = all four stages present.
   */
  completeness: number;
}

// ============================================================================
// Stage detection helpers
// ============================================================================

const DEFINITION_SIGNALS = ['is defined as', 'refers to', 'is termed', 'is called', 'means', 'known as'];
const MECHANISM_SIGNALS = ['leads to', 'results in', 'causes', 'due to', 'because', 'triggers', 'activates', 'inhibits', 'stimulates'];
const APPLICATION_SIGNALS = ['used for', 'applied to', 'in practice', 'for example', 'such as', 'in the case of', 'step', 'procedure'];
const CLINICAL_SIGNALS = ['treatment', 'diagnosis', 'therapy', 'management', 'prescrib', 'administer', 'clinical', 'patient', 'prognosis'];

function scoreText(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  return keywords.filter(kw => lower.includes(kw)).length;
}

function pickBestSegment(
  candidates: Segment[],
  keywords: string[]
): Segment | undefined {
  if (candidates.length === 0) return undefined;
  return candidates
    .map(s => ({ seg: s, score: scoreText(s.text, keywords) }))
    .sort((a, b) => b.score - a.score)[0]?.seg;
}

// ============================================================================
// Main builder
// ============================================================================

/**
 * Build a 4-stage structure map for a single page.
 * Always returns a StructureMap (possibly with 0 nodes for blank pages).
 */
export function buildStructureMap(
  segments: Segment[],
  signals: Signal[],
  paragraphUnits: ParagraphUnit[],
  pageNumber: number
): StructureMap {
  const nodes: StructureMapNode[] = [];

  // Derive page topic from first heading or top-importance paragraph unit
  const heading = segments.find(s => s.kind === 'heading');
  const topUnit = paragraphUnits.slice().sort((a, b) => b.importance - a.importance)[0];
  const topic =
    heading?.text.slice(0, 60) ??
    topUnit?.keyTerms.slice(0, 2).join(' / ') ??
    `Page ${pageNumber}`;

  // ── Stage 1: Definition ──────────────────────────────────────────────────
  {
    const defUnits = paragraphUnits.filter(u => u.role === 'definition');
    const defSignalSegIds = signals
      .filter(s => s.type === 'definition')
      .flatMap(s => s.evidenceSegmentIds);
    const defSegs = segments.filter(
      s => defSignalSegIds.includes(s.id) || scoreText(s.text, DEFINITION_SIGNALS) > 0
    );

    const best = defUnits[0]
      ? { text: defUnits[0].text, ids: [defUnits[0].id], conf: 0.9 }
      : pickBestSegment(defSegs, DEFINITION_SIGNALS) != null
        ? {
            text: pickBestSegment(defSegs, DEFINITION_SIGNALS)!.text,
            ids: defSegs.slice(0, 2).map(s => s.id),
            conf: 0.8,
          }
        : null;

    if (best) {
      nodes.push({
        id: generateId('sm'),
        stage: 'definition',
        label: 'Definition',
        text: best.text.slice(0, 200),
        sourceIds: best.ids,
        confidence: best.conf,
      });
    }
  }

  // ── Stage 2: Mechanism ───────────────────────────────────────────────────
  {
    const mechUnits = paragraphUnits.filter(u => u.role === 'mechanism');
    const mechSignalSegIds = signals
      .filter(s => s.type === 'cause_effect')
      .flatMap(s => s.evidenceSegmentIds);
    const mechSegs = segments.filter(
      s => mechSignalSegIds.includes(s.id) || scoreText(s.text, MECHANISM_SIGNALS) > 0
    );

    const best = mechUnits[0]
      ? { text: mechUnits[0].text, ids: [mechUnits[0].id], conf: 0.9 }
      : pickBestSegment(mechSegs, MECHANISM_SIGNALS) != null
        ? {
            text: pickBestSegment(mechSegs, MECHANISM_SIGNALS)!.text,
            ids: mechSegs.slice(0, 2).map(s => s.id),
            conf: 0.75,
          }
        : null;

    if (best) {
      nodes.push({
        id: generateId('sm'),
        stage: 'mechanism',
        label: 'Mechanism',
        text: best.text.slice(0, 200),
        sourceIds: best.ids,
        confidence: best.conf,
      });
    }
  }

  // ── Stage 3: Application ─────────────────────────────────────────────────
  {
    const appUnits = paragraphUnits.filter(u => u.role === 'example' || u.role === 'step');
    const appSegs = segments.filter(s => scoreText(s.text, APPLICATION_SIGNALS) > 0);

    const best = appUnits[0]
      ? { text: appUnits[0].text, ids: [appUnits[0].id], conf: 0.85 }
      : pickBestSegment(appSegs, APPLICATION_SIGNALS) != null
        ? {
            text: pickBestSegment(appSegs, APPLICATION_SIGNALS)!.text,
            ids: appSegs.slice(0, 2).map(s => s.id),
            conf: 0.7,
          }
        : null;

    if (best) {
      nodes.push({
        id: generateId('sm'),
        stage: 'application',
        label: 'Application',
        text: best.text.slice(0, 200),
        sourceIds: best.ids,
        confidence: best.conf,
      });
    }
  }

  // ── Stage 4: Clinical Relevance ──────────────────────────────────────────
  {
    const clinUnits = paragraphUnits.filter(u => u.role === 'clinical');
    const clinSignalSegIds = signals
      .filter(s => s.type === 'diagnostic' || s.type === 'treatment' || s.type === 'risk_factor')
      .flatMap(s => s.evidenceSegmentIds);
    const clinSegs = segments.filter(
      s => clinSignalSegIds.includes(s.id) || scoreText(s.text, CLINICAL_SIGNALS) > 0
    );

    const best = clinUnits[0]
      ? { text: clinUnits[0].text, ids: [clinUnits[0].id], conf: 0.9 }
      : pickBestSegment(clinSegs, CLINICAL_SIGNALS) != null
        ? {
            text: pickBestSegment(clinSegs, CLINICAL_SIGNALS)!.text,
            ids: clinSegs.slice(0, 2).map(s => s.id),
            conf: 0.75,
          }
        : null;

    if (best) {
      nodes.push({
        id: generateId('sm'),
        stage: 'clinical_relevance',
        label: 'Clinical Relevance',
        text: best.text.slice(0, 200),
        sourceIds: best.ids,
        confidence: best.conf,
      });
    }
  }

  return {
    pageNumber,
    topic,
    nodes,
    completeness: nodes.length / 4,
  };
}
