// lib/insights/renderQualityGate.ts
// Strict render gate — prevents weak/broken/artifact content from appearing in the UI.
// Applied as a final filter before content enters Concept Blocks, Mini Test,
// STR Compression, and Reading Map renderers.

import type { UltraConceptBlock } from "@/lib/insights/buildUltraPageView";

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
  // Purely Roman numeral sequence — ordinal stub
  if (/^[IVXLCDM\s]+$/.test(t)) return true;
  // Starts lowercase — OCR artifact or mid-sentence fragment
  if (/^[a-z]/.test(t)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Field / sentence quality gate
// ---------------------------------------------------------------------------

const FIELD_ARTIFACT_RE = /\b(Chapter|Cengage|Figure|Table)\b/;
const TRAILING_WEAK_WORD_RE = /\b(the|a|an|of|to|with|and|or|because|therefore)$/i;

export function isWeakField(text: string | undefined | null): boolean {
  if (!text) return true;
  const t = text.trim();
  if (!t) return true;
  if (FIELD_ARTIFACT_RE.test(t)) return true;
  if (TRAILING_WEAK_WORD_RE.test(t)) return true;
  if (t.split(/\s+/).length < 4) return true;
  const isFormula = /[=∫∂∑]|lim\b|d\/d[xt]|\bintegral\b|\bderivative\b/i.test(t);
  if (!isFormula && !/[.!?:)]$/.test(t)) return true;
  return false;
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
