// lib/canonical/builder.ts
// Converts raw page text chunks into CanonicalThoughtUnits, applying DAT
// classification from the book-level subject.
//
// Called by the Reader's extraction pipeline after each batch of pages.

import {
  type CanonicalThoughtUnit,
  type DatSection,
  type DatUnitType,
  type BoundingBox,
  type CanonicalProvenance,
  buildCanonicalId,
  datSectionFromSubject,
} from './types';
import { classifyDATSubject } from './classifier';
import { TextLayerRegistry } from '../page-intelligence/textLayerIndex';
import { PageBridgeRegistry } from '../page-intelligence/pageBridgeRegistry';
import { STRUCTURE_VERSION, PARAGRAPH_ALGORITHM_VERSION } from '../pdf/structuredPageText';
import { scoreChunk, mapToSemanticLabel, SCORING_VERSION } from './semanticScoring';

// ── Version constants ────────────────────────────────────────────────────────

/** Bump when the anchor enrichment algorithm changes. */
export const EXTRACTOR_VERSION = 1;

/** Current ReaderAnchor schema version. */
const ANCHOR_VERSION = 1;

// ── Canonical hash (djb2) ────────────────────────────────────────────────────

function djb2(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(h, 33) ^ str.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function computeCanonicalHash(documentId: string, pageIndex: number, text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();
  return djb2(`${documentId}|${pageIndex}|${normalized}`);
}

// ── Bounding box helpers ─────────────────────────────────────────────────────

function uniteBBoxes(boxes: Array<{ x: number; y: number; w: number; h: number }>): BoundingBox {
  if (boxes.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  const x  = Math.min(...boxes.map(b => b.x));
  const y  = Math.min(...boxes.map(b => b.y));
  const x2 = Math.max(...boxes.map(b => b.x + b.w));
  const y2 = Math.max(...boxes.map(b => b.y + b.h));
  return { x, y, w: x2 - x, h: y2 - y };
}

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
  /** 0–1 from the semantic domain classifier — fed into the importanceScore formula. */
  domainConfidence?: number;
}

export function buildCanonicalUnits(
  opts: BuildCanonicalUnitsOptions,
): CanonicalThoughtUnit[] {
  const { documentId, bookId, bookTitle, pageIndex, chunks, sourceUltraNoteId, domainConfidence } = opts;

  const { subject, confidence } = classifyDATSubject(bookId, bookTitle);
  const datSection: DatSection = datSectionFromSubject(subject);
  const classConfidence = confidence === 'high' ? 0.85 : 0.45;

  const now = Date.now();
  const totalUnits = chunks.length;

  // Resolve bridge and text-layer index once per page call.
  const bridge = PageBridgeRegistry.get(pageIndex);
  const pageIndex_ = pageIndex; // alias for closure clarity
  const textIndex = TextLayerRegistry.get(pageIndex_);

  const provenance: CanonicalProvenance = {
    extractedAt: now,
    extractorVersion: EXTRACTOR_VERSION,
    structureVersion: STRUCTURE_VERSION,
    paragraphAlgorithmVersion: PARAGRAPH_ALGORITHM_VERSION,
    hasGeometricGrounding: bridge !== undefined,
  };

  return chunks.map((chunk, unitIndex) => {
    const id = buildCanonicalId(documentId, pageIndex, unitIndex);
    const datTopic = detectTopic(chunk.text, datSection);
    const datUnitType = detectUnitType(chunk.text);
    const datRelevance = scoreDatRelevance(chunk.text);

    // ── Phase 1C: semantic scoring ─────────────────────────────────────────
    const semantic = scoreChunk(chunk.text, {
      datRelevance,
      unitIndex,
      totalUnits,
      domainConfidence: domainConfidence ?? classConfidence,
    });

    if (process.env.NODE_ENV === "development") {
      // Dev-only diagnostics — never persisted in production
      console.debug("[semanticScoring]", id, semantic.breakdown);
    }

    const quote = chunk.text.slice(0, 180).replace(/\s+/g, ' ').trim();
    const normalizedSourceText = chunk.text.replace(/\s+/g, ' ').trim();
    const canonicalHash = computeCanonicalHash(documentId, pageIndex, chunk.text);

    // ── Anchor enrichment ──────────────────────────────────────────────────
    let pdfTextItemIndexes: number[] | undefined;
    let boundingBoxes: BoundingBox[] | undefined;
    let groundingState: CanonicalThoughtUnit["anchor"]["groundingState"];
    let groundingConfidence: number | undefined;

    if (bridge) {
      // Exact match: find a ParagraphMapping whose char span contains this chunk.
      const mapping = bridge.paragraphMappings.find(
        m => m.startChar === chunk.startChar ||
             (m.startChar <= chunk.startChar && chunk.endChar <= m.endChar),
      );

      if (mapping && mapping.itemIndexes.length > 0) {
        pdfTextItemIndexes = mapping.itemIndexes;
        groundingState = "exact";
        groundingConfidence = 1.0;

        if (textIndex) {
          const tokenBoxes = pdfTextItemIndexes
            .map(idx => textIndex.tokens.find(t => t.itemIndex === idx)?.bbox)
            .filter((b): b is { x: number; y: number; w: number; h: number } => b !== undefined);
          if (tokenBoxes.length > 0) {
            boundingBoxes = [uniteBBoxes(tokenBoxes)];
          }
        }
      }
    }

    // Legacy fallback: if no bridge or mapping not found, try quote-based search
    // in the TextLayerRegistry's concatenated fullText.
    if (!groundingState && textIndex) {
      const quoteNorm = normalizedSourceText.toLowerCase().slice(0, 50);
      const textNorm = textIndex.fullText.toLowerCase();
      const pos = textNorm.indexOf(quoteNorm);
      if (pos !== -1) {
        const end = pos + quoteNorm.length;
        const matchedTokens = textIndex.tokens.filter(t => t.endChar > pos && t.startChar < end);
        if (matchedTokens.length > 0) {
          pdfTextItemIndexes = matchedTokens.map(t => t.itemIndex);
          boundingBoxes = [uniteBBoxes(matchedTokens.map(t => t.bbox))];
          groundingState = "fuzzy";
          groundingConfidence = 0.5;
        }
      }
    }

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
        exactSourceText: chunk.text,
        normalizedSourceText,
        ...(pdfTextItemIndexes !== undefined && { pdfTextItemIndexes }),
        ...(boundingBoxes !== undefined && { boundingBoxes }),
        ...(groundingState !== undefined && { groundingState }),
        ...(groundingConfidence !== undefined && { groundingConfidence }),
        anchorVersion: ANCHOR_VERSION,
      },
      canonicalHash,
      provenance,
      // ── Phase 1C: semantic metadata ────────────────────────────────────────
      canonicalType:      semantic.canonicalType,
      semanticLabel:      semantic.semanticLabel,
      semanticConfidence: semantic.semanticConfidence,
      importanceScore:    semantic.importanceScore,
      domainConfidence:   domainConfidence ?? classConfidence,
      scoringVersion:     SCORING_VERSION,
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
