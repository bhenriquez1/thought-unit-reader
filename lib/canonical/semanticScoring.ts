// lib/canonical/semanticScoring.ts
// Canonical semantic classification engine for CanonicalThoughtUnit.
//
// Consumes a ParagraphSignal (from paragraphScoring.ts) and produces:
//   canonicalType      — one of 23 CanonicalSemanticType values
//   semanticConfidence — 0–1 confidence in the assigned type
//   importanceScore    — 0–1 study-salience score
//   semanticLabel      — legacy SemanticLabel derived from canonicalType
//
// The existing scoreParagraphs() in paragraphScoring.ts is unchanged; this
// module wraps it to promote its signals into the canonical contract.

import type { RawBlock } from "../paragraphSegmentation";
import { scoreParagraphs } from "../paragraphScoring";
import type { ParagraphSignal } from "../readerContracts";
import type { CanonicalSemanticType } from "../semantic/types";
import type { SemanticLabel } from "./types";

// ── Version ───────────────────────────────────────────────────────────────────

/** Bump when classification logic or weight formula changes. */
export const SCORING_VERSION = 1;

// ── Public interfaces ─────────────────────────────────────────────────────────

export interface SemanticScoreOptions {
  /** 0–1 from classifyDATSubject; used in importance score. */
  datRelevance?: number;
  /** 0-based position of this chunk on the page. */
  unitIndex?: number;
  /** Total chunks on the page (for position normalisation). */
  totalUnits?: number;
  /** 0–1 confidence from the semantic domain classifier. */
  domainConfidence?: number;
}

/**
 * Per-component breakdown of the importanceScore computation.
 * Always computed; attached to logs in dev builds only — not persisted.
 */
export interface ImportanceBreakdown {
  definition: number;
  mechanism: number;
  exam: number;
  clinical: number;
  formula: number;
  fillerPenalty: number;
  heading: number;
  dat: number;
  position: number;
  domain: number;
  yieldBase: number;
  final: number;
}

export interface SemanticScore {
  canonicalType: CanonicalSemanticType;
  semanticConfidence: number;
  importanceScore: number;
  semanticLabel: SemanticLabel;
  /** Always populated internally; only surfaced in dev builds. */
  breakdown: ImportanceBreakdown;
}

// ── Synthetic block helper ────────────────────────────────────────────────────

/** Synthesise a minimal RawBlock from a chunk of text so we can call scoreParagraphs(). */
function makeSyntheticBlock(text: string, index = 0): RawBlock {
  const t = text.trim();
  let blockType: RawBlock["blockType"] = "paragraph";
  if (/^\s*[-•*]\s+/.test(t) || /^\s*(\d+|[A-Za-z])[.)]\s+/.test(t)) {
    blockType = "bullet";
  } else if (/^[A-Z][A-Z0-9\s\-:&]{4,}$/.test(t) && t.length < 90) {
    blockType = "heading";
  } else if (/^\s*(fig(?:ure)?\.?\s*\d+|table\s*\d+|chart\s*\d+)\b/i.test(t)) {
    blockType = "caption";
  } else if (/^\s*(©|copyright|doi\b|references?|bibliography)\b/i.test(t)) {
    blockType = "reference";
  }
  return { text, index, blockType };
}

// ── Canonical type classification ─────────────────────────────────────────────

const CONTRAINDICATION_RE = /\bcontraindicated?|should not be used|not indicated\b/i;
const INDICATION_RE = /\bindicated? for\b|appropriate when|use in\b|used when\b/i;
const TREATMENT_RE = /\btreatment of choice|first[\s-]line|managed? with|therapy for\b/i;
const COMPLICATION_RE = /\bcomplication|side effect|adverse event|sequela\b/i;
const PEARL_RE = /\bpearl|key point|must know|high[\s-]yield|board\b/i;
const EXAM_TRIGGER_RE = /\bexam|quiz|dat\b|test\b|remember\b/i;
const TRAP_RE = /\btrap|pitfall|mistake|confus|common error\b/i;
const WARNING_RE = /\bcaution|avoid\b|danger|do not|warning|never\b/i;
const CAUSE_RE = /\bcaused by|etiology|risk factor\b/i;
const EFFECT_RE = /\bresults? in|leads? to|consequence\b/i;
const PROCESS_RE = /\bstep|first\b.{0,30}\bthen|next|finally|sequence|step-by-step\b/i;
const CLASSIFICATION_RE = /\btype|class|categor|group|kind\b/i;
const FINDING_RE = /\bsign\b|symptom|presents? (as|with)|finding|manifest/i;
const EVIDENCE_RE = /\bstudy|research|evidence|trial|shown|demonstrated\b/i;
const EXAMPLE_RE = /\bfor example|for instance|consider\b|e\.g\.|such as\b/i;
const MNEMONIC_RE = /\bmnemonic|remember as|acronym\b/i;

function classifyCanonicalType(signal: ParagraphSignal): { type: CanonicalSemanticType; confidence: number } {
  const text = signal.text;

  // Formula takes highest priority (unambiguous lexical signal)
  if (signal.formulaScore > 0) return { type: "formula", confidence: 0.88 };

  // Contraindication (more specific than general decision)
  if (CONTRAINDICATION_RE.test(text)) return { type: "contraindication", confidence: 0.90 };

  // Indication
  if (INDICATION_RE.test(text)) {
    return { type: "indication", confidence: 0.82 };
  }

  // Treatment / management protocol
  if (TREATMENT_RE.test(text)) return { type: "treatment", confidence: 0.82 };

  // Complication / adverse outcome
  if (COMPLICATION_RE.test(text)) return { type: "complication", confidence: 0.78 };

  // Clinical pearl / high-yield clinical fact
  if (PEARL_RE.test(text) && (signal.examScore > 0 || signal.clinicalScore > 0)) {
    return { type: "clinical-pearl", confidence: 0.82 };
  }

  // High-yield exam cue (without specific clinical content)
  if (signal.examScore > 0 && EXAM_TRIGGER_RE.test(text)) {
    return { type: "high-yield", confidence: 0.76 };
  }

  // Common error / trap (must test before generic exception)
  if (signal.trapScore > 0 && TRAP_RE.test(text)) {
    return { type: "common-error", confidence: 0.82 };
  }

  // Warning / caution
  if (signal.trapScore > 0 && WARNING_RE.test(text)) {
    return { type: "warning", confidence: 0.80 };
  }

  // General exception
  if (signal.trapScore > 0) return { type: "exception", confidence: 0.70 };

  // Decision point (clinical decision making)
  if (signal.clinicalDecisionScore > 0) return { type: "decision-point", confidence: 0.76 };

  // Definition
  if (signal.definitionScore > 0) return { type: "definition", confidence: 0.88 };

  // Causal chain type
  if (CAUSE_RE.test(text)) return { type: "cause", confidence: 0.76 };
  if (EFFECT_RE.test(text) && signal.mechanismScore > 0) return { type: "effect", confidence: 0.72 };

  // Process (sequential steps within a mechanism)
  if (signal.mechanismScore > 0 && PROCESS_RE.test(text)) {
    return { type: "process", confidence: 0.76 };
  }

  // Mechanism (causal / pathway)
  if (signal.mechanismScore > 0) return { type: "mechanism", confidence: 0.76 };

  // Clinical finding
  if (signal.clinicalScore > 0 && FINDING_RE.test(text)) {
    return { type: "finding", confidence: 0.72 };
  }

  // Classification vs. relationship
  if (signal.comparisonScore > 0 && CLASSIFICATION_RE.test(text)) {
    return { type: "classification", confidence: 0.72 };
  }
  if (signal.comparisonScore > 0) return { type: "relationship", confidence: 0.66 };

  // Evidence / research reference
  if (EVIDENCE_RE.test(text)) return { type: "evidence", confidence: 0.66 };

  // Worked example
  if (EXAMPLE_RE.test(text)) return { type: "worked-example", confidence: 0.72 };

  // Memory anchor / mnemonic
  if (MNEMONIC_RE.test(text)) return { type: "memory-anchor", confidence: 0.82 };

  // Heading → core concept
  if (signal.blockType === "heading" || signal.blockType === "subheading") {
    return { type: "core-concept", confidence: 0.76 };
  }

  // Default fallback
  return { type: "core-concept", confidence: 0.40 };
}

// ── Legacy SemanticLabel mapping ──────────────────────────────────────────────

const CANONICAL_TO_SEMANTIC_LABEL: Readonly<Record<CanonicalSemanticType, SemanticLabel>> = {
  "definition":       "definition",
  "core-concept":     "master",
  "process":          "procedure",
  "mechanism":        "mechanism",
  "relationship":     "mechanism",
  "classification":   "master",
  "formula":          "formula",
  "worked-example":   "worked-example",
  "indication":       "master",
  "contraindication": "master",
  "decision-point":   "dat-tip",
  "exception":        "exception",
  "warning":          "dat-tip",
  "common-error":     "common-error",
  "material":         "master",
  "finding":          "mechanism",
  "treatment":        "procedure",
  "complication":     "dat-tip",
  "clinical-pearl":   "clinical-pearl",
  "high-yield":       "master",
  "memory-anchor":    "master",
  "evidence":         "mechanism",
  "cause":            "mechanism",
  "effect":           "mechanism",
};

export function mapToSemanticLabel(type: CanonicalSemanticType): SemanticLabel {
  return CANONICAL_TO_SEMANTIC_LABEL[type] ?? "master";
}

// ── Importance score ──────────────────────────────────────────────────────────

const IMP_WEIGHTS = {
  definition: 0.20,
  mechanism:  0.17,
  exam:       0.12,
  clinical:   0.10,
  formula:    0.07,
  heading:    0.09,
  dat:        0.09,
  position:   0.06,
  domain:     0.04,
  // positive sum = 0.94 (leaves headroom for filler adjustment)
} as const;

function computeImportanceScore(
  signal: ParagraphSignal,
  opts: SemanticScoreOptions = {},
): { score: number; breakdown: ImportanceBreakdown } {
  const {
    datRelevance   = 0,
    unitIndex      = 0,
    totalUnits     = 1,
    domainConfidence = 0,
  } = opts;

  const definition = signal.definitionScore;
  const mechanism  = signal.mechanismScore;
  const exam       = signal.examScore;
  const clinical   = signal.clinicalScore;
  const formula    = signal.formulaScore;
  const heading    = signal.blockType === "heading" || signal.blockType === "subheading" ? 1 : 0;
  const dat        = datRelevance;
  const position   = 1 - Math.min(unitIndex / Math.max(totalUnits - 1, 1), 1);
  const domain     = domainConfidence;

  // Filler penalty normalised: raw fillerPenalty ≈ 0..4.7 → 0..1
  const fillerPenalty = Math.min(signal.fillerPenalty / 4.7, 1);

  // yieldScore from scoreParagraphs() ranges roughly −8..+9.1
  const yieldBase = Math.max(0, Math.min((signal.yieldScore + 8) / 17.1, 1));

  const positive =
    definition * IMP_WEIGHTS.definition +
    mechanism  * IMP_WEIGHTS.mechanism  +
    exam       * IMP_WEIGHTS.exam       +
    clinical   * IMP_WEIGHTS.clinical   +
    formula    * IMP_WEIGHTS.formula    +
    heading    * IMP_WEIGHTS.heading    +
    dat        * IMP_WEIGHTS.dat        +
    position   * IMP_WEIGHTS.position   +
    domain     * IMP_WEIGHTS.domain;

  // Blend direct signals with the composite yieldBase, then penalise filler
  const combined = positive * 0.55 + yieldBase * 0.45;
  const final = Math.max(0, Math.min(combined - fillerPenalty * 0.30, 1));

  return {
    score: final,
    breakdown: {
      definition,
      mechanism,
      exam,
      clinical,
      formula,
      fillerPenalty,
      heading,
      dat,
      position,
      domain,
      yieldBase,
      final,
    },
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Score a raw chunk of text and produce the full canonical semantic metadata.
 * This is the primary entry point called by buildCanonicalUnits().
 */
export function scoreChunk(text: string, opts: SemanticScoreOptions = {}): SemanticScore {
  const block = makeSyntheticBlock(text, opts.unitIndex ?? 0);
  const [signal] = scoreParagraphs([block], 0);
  return scoreSignal(signal, opts);
}

/**
 * Score an already-computed ParagraphSignal.
 * Useful for callers that already have a signal from extractPageSignals().
 */
export function scoreSignal(signal: ParagraphSignal, opts: SemanticScoreOptions = {}): SemanticScore {
  const { type, confidence } = classifyCanonicalType(signal);
  const semanticLabel = mapToSemanticLabel(type);
  const { score: importanceScore, breakdown } = computeImportanceScore(signal, opts);

  return {
    canonicalType:      type,
    semanticConfidence: confidence,
    importanceScore,
    semanticLabel,
    breakdown,
  };
}
