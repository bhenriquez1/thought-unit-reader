// lib/canonical/builder.ts
// Converts raw page text chunks into CanonicalThoughtUnits, applying DAT
// classification from the book-level subject.
//
// Called by the Reader's extraction pipeline after each batch of pages.

import {
  type CanonicalThoughtUnit,
  type DatSection,
  type DatUnitType,
  buildCanonicalId,
  datSectionFromSubject,
} from './types';
import { classifyDATSubject } from './classifier';

// ── Unit type detection via simple lexicon ──────────────────────────────────

const UNIT_TYPE_PATTERNS: Array<{ type: DatUnitType; patterns: RegExp[] }> = [
  {
    type: 'definition',
    patterns: [/\bis\s+defined\s+as\b/i, /\brefers?\s+to\b/i, /\bis\s+called\b/i, /\bis\s+termed\b/i, /\bmeans?\b/i],
  },
  {
    type: 'mechanism',
    patterns: [/\bleads?\s+to\b/i, /\bresults?\s+in\b/i, /\bcauses?\b/i, /\bpathway\b/i, /\bprocess\b/i],
  },
  {
    type: 'formula',
    patterns: [/[A-Z]\s*=\s*[A-Z]/, /\bequation\b/i, /\bformula\b/i, /\bΔ[A-Z]\b/, /\b\d+\s*[+\-×÷]\s*\d+/],
  },
  {
    type: 'contrast',
    patterns: [/\bhowever\b/i, /\bin\s+contrast\b/i, /\bunlike\b/i, /\bwhereas\b/i, /\bexcept\b/i],
  },
  {
    type: 'clinical_application',
    patterns: [/\btreatment\b/i, /\bdiagnos/i, /\bsymptom\b/i, /\btherapy\b/i, /\bmanagement\b/i],
  },
  {
    type: 'example',
    patterns: [/\bfor\s+example\b/i, /\bsuch\s+as\b/i, /\bfor\s+instance\b/i, /\billustrat/i],
  },
];

function detectUnitType(text: string): DatUnitType {
  for (const { type, patterns } of UNIT_TYPE_PATTERNS) {
    if (patterns.some((p) => p.test(text))) return type;
  }
  return 'fact';
}

// ── DAT topic detection from text ───────────────────────────────────────────

const TOPIC_LEXICON: Array<{ topic: string; patterns: RegExp[] }> = [
  { topic: 'Cell Biology',      patterns: [/\bcell\b/i, /\bmembrane\b/i, /\borganel/i, /\bnucleus\b/i] },
  { topic: 'Genetics',          patterns: [/\bgene\b/i, /\ballele\b/i, /\bDNA\b/, /\bRNA\b/, /\bmeiosis\b/i] },
  { topic: 'Biochemistry',      patterns: [/\benzyme\b/i, /\bprotein\b/i, /\bmetabolism\b/i, /\bATP\b/] },
  { topic: 'Atomic Structure',  patterns: [/\batom\b/i, /\belectron\b/i, /\bproton\b/i, /\bneutron\b/i] },
  { topic: 'Chemical Bonding',  patterns: [/\bcovalent\b/i, /\bionic\b/i, /\bpolar\b/i, /\bbond\b/i] },
  { topic: 'Thermodynamics',    patterns: [/\benthalpy\b/i, /\bentropy\b/i, /\bGibbs\b/, /\bΔH\b/, /\bΔG\b/] },
  { topic: 'Stereochemistry',   patterns: [/\bchiral\b/i, /\benantiomer\b/i, /\bstereoisomer\b/i] },
  { topic: 'Reaction Mechanisms', patterns: [/\bSN1\b/, /\bSN2\b/, /\bnucleophile\b/i, /\belectrophile\b/i] },
];

function detectTopic(text: string, datSection: DatSection): string {
  for (const { topic, patterns } of TOPIC_LEXICON) {
    if (patterns.some((p) => p.test(text))) return topic;
  }
  switch (datSection) {
    case 'biology':           return 'General Biology';
    case 'general_chemistry': return 'General Chemistry';
    case 'organic_chemistry': return 'Organic Chemistry';
    default:                  return 'General';
  }
}

// ── DAT relevance scoring ───────────────────────────────────────────────────

const HIGH_YIELD_PATTERNS = [
  /\bmost\s+common\b/i, /\bhigh.yield\b/i, /\bkey\b/i, /\bimportant\b/i,
  /\bhallmark\b/i, /\bgold\s+standard\b/i, /\bremember\b/i, /\bclassic\b/i,
];

function scoreDatRelevance(text: string): number {
  let score = 0.3; // baseline
  for (const p of HIGH_YIELD_PATTERNS) {
    if (p.test(text)) { score += 0.1; break; }
  }
  if (text.length > 200) score += 0.1;
  if (/\d+/.test(text)) score += 0.05; // numbers/thresholds are testable
  return Math.min(1, score);
}

// ── Public builder ──────────────────────────────────────────────────────────

export interface RawPageChunk {
  text: string;
  /** Character offset of this chunk in the page's full extracted text. */
  startChar: number;
  endChar: number;
}

export interface BuildCanonicalUnitsOptions {
  documentId: string;
  bookId: string;
  bookTitle?: string;
  /** 0-based page index. */
  pageIndex: number;
  chunks: RawPageChunk[];
  sourceUltraNoteId?: string;
}

export function buildCanonicalUnits(
  opts: BuildCanonicalUnitsOptions,
): CanonicalThoughtUnit[] {
  const { documentId, bookId, bookTitle, pageIndex, chunks, sourceUltraNoteId } = opts;

  const { subject, confidence } = classifyDATSubject(bookId, bookTitle);
  const datSection: DatSection = datSectionFromSubject(subject);
  const classConfidence = confidence === 'high' ? 0.85 : 0.45;

  const now = Date.now();

  return chunks.map((chunk, unitIndex) => {
    const id = buildCanonicalId(documentId, pageIndex, unitIndex);
    const datTopic = detectTopic(chunk.text, datSection);
    const datUnitType = detectUnitType(chunk.text);
    const datRelevance = scoreDatRelevance(chunk.text);

    const quote = chunk.text.slice(0, 180).replace(/\s+/g, ' ').trim();

    const unit: CanonicalThoughtUnit = {
      id,
      documentId,
      pageIndex,
      unitIndex,
      text: chunk.text,
      anchor: {
        pageIndex,
        startChar: chunk.startChar,
        endChar: chunk.endChar,
        quote,
      },
      datSection,
      datTopic,
      datUnitType,
      datRelevance,
      classificationConfidence: classConfidence,
      classificationSource: confidence === 'high' ? 'title_keyword' : 'title_keyword',
      difficulty: datRelevance > 0.6 ? 0.6 : 0.4,
      sourceUltraNoteId,
      createdAt: now,
      updatedAt: now,
    };
    return unit;
  });
}
