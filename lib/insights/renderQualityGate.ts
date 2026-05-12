// lib/insights/renderQualityGate.ts
// Strict render gate — prevents weak/broken/artifact/boilerplate content from
// appearing in Concept Blocks, Mini Test, STR Compression, and Reading Map.

import type { UltraConceptBlock } from "@/lib/insights/buildUltraPageView";

// ---------------------------------------------------------------------------
// Boilerplate / copyright / publisher debris patterns
// ---------------------------------------------------------------------------

export const BOILERPLATE_RE =
  /^(Cengage Learning|Copyright|All rights reserved|No part of this work|Editorial review|Printed in|ISBN[-\s]|Chapter outline|Page intentionally left blank|Learning objectives?|Key (concepts?|terms?|takeaways?)|Table of contents?|Objectives?:|By the end of (this|the)|After (reading|studying) this|This chapter (covers?|reviews?|presents?)|In this chapter)/i;

export const PUBLISHER_DEBRIS_RE =
  /\b(Cengage|ISBN|copyright|©|\bAll rights\b|reserved\s+by|permissions? department|editorial review|printed in (the )?U\.?S\.?A?)\b/i;

// ---------------------------------------------------------------------------
// Title quality gate
// ---------------------------------------------------------------------------

const WEAK_TITLE_PATTERN_RE =
  /^(Introduction\s*[IVX\d]*|In\s+Fact|Of\s+the|Were\s+\w|Water\s+\w|Solution\s+When|In\s+This|Section\s+\d|Chapter\s+\d|Example\s+\d)/i;

const TITLE_ARTIFACT_RE = /\b(Chapter|Cengage|Figure|Table)\b/;

export function isWeakTitle(title: string): boolean {
  const t = (title ?? "").trim();
  if (!t || t.length < 3) return true;
  if (t.split(/\s+/).length === 1 && t.length < 4) return true;
  if (WEAK_TITLE_PATTERN_RE.test(t)) return true;
  if (TITLE_ARTIFACT_RE.test(t)) return true;
  if (BOILERPLATE_RE.test(t)) return true;
  // Purely Roman numeral sequence — ordinal stub
  if (/^[IVXLCDM\s]+$/.test(t)) return true;
  // Starts lowercase — OCR artifact or mid-sentence fragment
  if (/^[a-z]/.test(t)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Fragment quality gate — catches broken/boilerplate/low-signal text
// ---------------------------------------------------------------------------

const FIELD_ARTIFACT_RE = /\b(Chapter|Cengage|Figure|Table)\b/;

// Dangling connectors at end of a field — sentence was cut mid-clause
export const BAD_FIELD_ENDING_RE =
  /\b(of|to|by|with|as|the|a|an|and|or|but|because|therefore)$/i;

const TRAILING_WEAK_WORD_RE =
  /\b(the|a|an|of|to|with|and|or|because|therefore|when|which|since|that|as|for|from|in|at|by)$/i;

// These words at the START signal a mid-sentence fragment or OCR artifact
const LEADING_FRAGMENT_WORDS_RE =
  /^(and |or |but |so |therefore |thus |hence |however |although |because |since |when |while |where |which |that |this is |it is |there is |there are )/i;

export function isWeakField(text: string | undefined | null): boolean {
  if (!text) return true;
  const t = text.trim();
  if (!t) return true;
  if (BOILERPLATE_RE.test(t)) return true;
  if (PUBLISHER_DEBRIS_RE.test(t)) return true;
  if (FIELD_ARTIFACT_RE.test(t)) return true;
  if (TRAILING_WEAK_WORD_RE.test(t)) return true;
  if (BAD_FIELD_ENDING_RE.test(t)) return true;
  if (LEADING_FRAGMENT_WORDS_RE.test(t)) return true;
  if (t.split(/\s+/).length < 5) return true;
  const isFormula = /[=∫∂∑]|lim\b|d\/d[xt]|\bintegral\b|\bderivative\b/i.test(t);
  if (!isFormula && !/[.!?:)]$/.test(t)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// isWeakFragment — stronger sentence-level gate used for compression / mini test
// ---------------------------------------------------------------------------

export function isWeakFragment(text: string): boolean {
  if (!text) return true;
  // Strip common label prefixes ("Rule 1:", "How:", "Trap:") for content analysis
  const content = text.replace(/^(Rule \d+|How|Trap|Apply|Flow|Step \d+|Key|Note):\s*/i, "").trim();
  if (!content) return true;

  // Publisher / boilerplate
  if (BOILERPLATE_RE.test(content)) return true;
  if (PUBLISHER_DEBRIS_RE.test(content)) return true;
  if (FIELD_ARTIFACT_RE.test(content)) return true;

  const isFormula = /[=∫∂∑]|lim\b|d\/d[xt]|\bintegral\b|\bderivative\b/i.test(content);

  // Mid-sentence start
  if (!isFormula && LEADING_FRAGMENT_WORDS_RE.test(content)) return true;
  // Lowercase start (unless formula or intentional lowercase term)
  if (!isFormula && /^[a-z]/.test(content)) return true;

  // Dangling connector at end
  if (TRAILING_WEAK_WORD_RE.test(content)) return true;

  // Too few meaningful words
  const words = content.split(/\s+/);
  if (!isFormula && words.length < 5) return true;

  // No verb-like word — syntactically incomplete
  if (
    !isFormula &&
    !/\b(is|are|was|were|has|have|had|will|would|can|could|should|may|might|must|do|does|did|shows?|causes?|leads?|results?|depends?|occurs?|becomes?|represents?|means?|involves?|requires?|prevents?|contains?|allows?|produces?|defines?|forms?|creates?|generates?|converts?|transforms?|regulates?|increases?|decreases?|reduces?|promotes?|inhibits?|activates?|binds?|connects?|follows?|indicates?|suggests?|demonstrates?|measures?|calculates?|equals?|approximates?)\b/i.test(
      content
    )
  )
    return true;

  return false;
}

// ---------------------------------------------------------------------------
// isCompleteThought — strongest gate: rejects outputs that are cognitively
// incomplete for a struggling reader. Applied to highlights and concept fields.
// ---------------------------------------------------------------------------

export function isCompleteThought(text: string): boolean {
  if (isWeakFragment(text)) return false;
  const t = text.trim();

  // Reject pure noun list: two or more commas, no finite verb
  // "Rocks, metals, oils, gases" → not a thought
  const commaCount = (t.match(/,/g) ?? []).length;
  if (
    commaCount >= 2 &&
    !/\b(is|are|was|were|can|will|may|might|could|should|has|have|does|do|did|causes?|leads?|results?|produces?|functions?|enables?|allows?|forms?|represents?|means?|includes?|contains?|consists?)\b/i.test(t)
  ) return false;

  // Reject conditional fragment without a main clause:
  // "If it were a bad injury" — no resolved consequence
  if (/^if\s+(it|he|she|they|this|that|there|the\s+\w+)\b/i.test(t) && !/,\s*\w{3}/.test(t)) return false;

  // Reject template question where the extracted subject is a symbolic expression:
  // "What condition causes As n → ∞ to converge?"
  if (/\b(causes?|leads?|makes?|forces?|allows?)\s+(as\s+[a-z]\s*[→→]|lim\s*_|∑|∫|aₙ|[a-z]_n)/i.test(t)) return false;

  // Reject isolated symbolic fragment that is not a full equation:
  // "As n → ∞" alone — symbolic context without declarative meaning
  if (/^(as|for|when)\s+[a-z]\s*[→→]\s*[∞\d]/i.test(t) && t.split(/\s+/).length < 7) return false;

  return true;
}

// ---------------------------------------------------------------------------
// Verbatim-copy detection — sentences this long are likely straight from the book
// ---------------------------------------------------------------------------

export function isLikelyVerbatimCopy(text: string): boolean {
  const content = text.replace(/^(Rule \d+|How|Trap|Apply|Flow|Step \d+|Key|Note):\s*/i, "").trim();
  return content.split(/\s+/).length > 15;
}

// ---------------------------------------------------------------------------
// Block quality gate
// ---------------------------------------------------------------------------

export function countStrongCoreFields(
  block: UltraConceptBlock,
  domain?: string
): number {
  const primary =
    domain === "math"
      ? (block.given ?? block.surgicalReason)
      : block.surgicalReason;
  const coreFields: (string | undefined | null)[] = [
    block.pattern,
    primary,
    block.trap,
    block.rule,
  ];
  return coreFields.filter((f) => !isWeakField(f)).length;
}

export function isWeakBlock(
  block: UltraConceptBlock,
  domain?: string
): boolean {
  if (isWeakTitle(block.title)) return true;
  if (countStrongCoreFields(block, domain) < 3) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Text similarity — for Core Idea / Page Thesis deduplication
// ---------------------------------------------------------------------------

function tokenSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

export function isSimilarText(
  a: string,
  b: string,
  threshold = 0.72
): boolean {
  const aTokens = tokenSet(a);
  const bTokens = tokenSet(b);
  if (!aTokens.size || !bTokens.size) return false;
  let overlap = 0;
  for (const t of aTokens) {
    if (bTokens.has(t)) overlap++;
  }
  const union = new Set([...aTokens, ...bTokens]).size;
  return union > 0 && overlap / union >= threshold;
}
