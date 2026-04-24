// lib/page-intelligence/continuity.ts
// Insight Continuity Engine — always returns structured intelligence
// Even for sparse pages this returns meaningful scaffolding (never empty)

import type { Insight, Segment, Signal, ParagraphUnit } from './types';

// ============================================================================
// Types
// ============================================================================

export interface InsightContinuity {
  /** The dominant concept or theme on this page */
  corePattern: string;
  /** How this connects to prior/adjacent content — a conceptual bridge */
  conceptualBridge: string;
  /** Why this matters clinically — downstream application */
  clinicalConnection: string;
  /** What students most frequently misunderstand about this topic */
  commonMisunderstanding: string;
  /**
   * Quality indicator:
   * - 'rich'    — derived from ≥3 insights + ≥2 paragraph units
   * - 'minimal' — derived from sparse data (1–2 items)
   * - 'stub'    — page had no extractable content; generic scaffold returned
   */
  quality: 'rich' | 'minimal' | 'stub';
}

// ============================================================================
// Builder
// ============================================================================

/**
 * Build an InsightContinuity object for a page.
 * Always returns a fully-populated struct — never throws, never returns null.
 */
export function buildInsightContinuity(
  insights: Insight[],
  segments: Segment[],
  signals: Signal[],
  paragraphUnits: ParagraphUnit[]
): InsightContinuity {
  // ── corePattern ─────────────────────────────────────────────────────────
  const topInsight = insights[0];
  const headings = segments.filter(s => s.kind === 'heading');
  const defUnits = paragraphUnits.filter(u => u.role === 'definition');

  let corePattern: string;
  if (topInsight) {
    corePattern = topInsight.title;
  } else if (headings.length > 0) {
    corePattern = headings[0].text.slice(0, 120);
  } else if (defUnits.length > 0) {
    const terms = defUnits[0].keyTerms.slice(0, 3).join(', ');
    corePattern = terms || defUnits[0].text.slice(0, 80);
  } else if (segments.length > 0) {
    corePattern = segments[0].text.slice(0, 80);
  } else {
    corePattern = 'Review page content to identify core concept';
  }

  // ── conceptualBridge ────────────────────────────────────────────────────
  const mechUnits = paragraphUnits.filter(u => u.role === 'mechanism');
  const causeEffectSig = signals.find(s => s.type === 'cause_effect');

  let conceptualBridge: string;
  if (mechUnits.length > 0) {
    conceptualBridge = mechUnits[0].text.slice(0, 120);
  } else if (causeEffectSig) {
    const bridgeSeg = segments.find(s => causeEffectSig.evidenceSegmentIds.includes(s.id));
    conceptualBridge = bridgeSeg
      ? bridgeSeg.text.slice(0, 120)
      : 'Connects through causal relationships — see Relations tab for chains';
  } else if (insights.length > 1) {
    conceptualBridge = `Builds on: ${insights[1].title}`;
  } else {
    conceptualBridge = 'Connects to broader system or category — review adjacent pages for full picture';
  }

  // ── clinicalConnection ──────────────────────────────────────────────────
  const clinUnits = paragraphUnits.filter(u => u.role === 'clinical');
  const clinSig = signals.find(s => s.type === 'diagnostic' || s.type === 'treatment');

  let clinicalConnection: string;
  if (clinUnits.length > 0) {
    clinicalConnection = clinUnits[0].text.slice(0, 120);
  } else if (clinSig) {
    const clinSeg = segments.find(s => clinSig.evidenceSegmentIds.includes(s.id));
    clinicalConnection = clinSeg
      ? clinSeg.text.slice(0, 120)
      : 'Relevant to clinical decision-making — see Clinical Relevance tab';
  } else if (topInsight?.body) {
    clinicalConnection = topInsight.body.slice(0, 120);
  } else {
    clinicalConnection = 'Foundational concept with downstream clinical and diagnostic applications';
  }

  // ── commonMisunderstanding ──────────────────────────────────────────────
  const trapUnits = paragraphUnits.filter(u => u.role === 'exam_trap' || u.role === 'warning');
  const contrastSig = signals.find(s => s.type === 'contrast' || s.type === 'exception');

  let commonMisunderstanding: string;
  if (trapUnits.length > 0) {
    commonMisunderstanding = trapUnits[0].text.slice(0, 120);
  } else if (contrastSig) {
    const contrastSeg = segments.find(s => contrastSig.evidenceSegmentIds.includes(s.id));
    commonMisunderstanding = contrastSeg
      ? contrastSeg.text.slice(0, 120)
      : 'Watch: confusable terms or boundary conditions often tested in distractors';
  } else {
    commonMisunderstanding =
      'Verify exact terminology — confusable terms frequently appear in exam distractors';
  }

  // ── quality ─────────────────────────────────────────────────────────────
  const quality: InsightContinuity['quality'] =
    insights.length >= 3 && paragraphUnits.length >= 2
      ? 'rich'
      : insights.length >= 1 || paragraphUnits.length >= 1
        ? 'minimal'
        : 'stub';

  return {
    corePattern,
    conceptualBridge,
    clinicalConnection,
    commonMisunderstanding,
    quality,
  };
}
