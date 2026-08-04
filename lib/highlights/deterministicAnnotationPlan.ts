// lib/highlights/deterministicAnnotationPlan.ts
// Deterministic, AI-free base SurgeonAnnotationPlan — the "grounded" tier of
// the pipeline:
//
//   exact current-page text
//     → deterministic grounded base annotation plan   (THIS FILE)
//     → optional OpenAI enrichment                    (pages/api/page-annotation-plan.ts)
//     → one SurgeonAnnotationPlan
//     → one PdfEvidenceOverlay (exclusive owner — see PR #609)
//
// Runs entirely client-side, no network call, zero risk of hallucination —
// every span is extracted directly from the real page text handed to it, so
// grounding is definitionally guaranteed (there is nothing to verify against;
// the text IS the source — running it through groundSurgeonQuotes.ts still
// happens downstream for pipeline uniformity, but it will always succeed at
// the "exact" tier). This exists so a temporary OpenAI outage/degrade never
// means an empty overlay: PR #609 removed the OLD legacy AI-anchor pipeline
// as a fallback (that pipeline required its own AI call and had no density
// limiting), but replacing "wrong-quality AI fallback" with "always literally
// nothing" was never the intent. This is a distinct, deterministic tier of
// the SAME new pipeline — not a reintroduction of the removed legacy one.
//
// Deliberately conservative: precision over recall, same density philosophy
// as limitAnnotationDensity.ts. A handful of confident, well-typed
// annotations beats a page covered in regex guesses.

import type { SurgeonAnnotation, SurgeonAnnotationPlan, CanonicalType } from "../insights/pageAnnotationPlan";
import { DEFAULT_TREATMENT } from "../insights/pageAnnotationPlan";

// ── Sentence splitting ──────────────────────────────────────────────────────
// Self-contained (not shared with groundSurgeonQuotes.ts/textCleanup.ts) —
// this one must return exact spans against the RAW, unmodified text so every
// extracted quote is a verbatim substring by construction.

const SENTENCE_END_CHARS = new Set([".", "!", "?"]);

export interface DeterministicSentence {
  text:  string;
  start: number;
  end:   number;
}

export function splitIntoSentencesWithSpans(text: string): DeterministicSentence[] {
  const sentences: DeterministicSentence[] = [];

  const pushSentence = (segStart: number, end: number) => {
    const raw = text.slice(segStart, end);
    const leadingWs = raw.length - raw.trimStart().length;
    const start = segStart + leadingWs;
    const sentenceText = text.slice(start, end).trim();
    if (sentenceText.length >= 20) {
      sentences.push({ text: sentenceText, start, end });
    }
  };

  // A paragraph break (blank line) is ALWAYS a boundary, independent of
  // punctuation — otherwise an unpunctuated heading line merges into the next
  // paragraph's first sentence (e.g. "Atomic Structure\n\nDalton proposed…"
  // would otherwise become one "sentence" spanning both).
  const PARAGRAPH_BREAK_RE = /\n\s*\n/g;
  let paraStart = 0;
  let match: RegExpExecArray | null;
  const paragraphBounds: Array<{ start: number; end: number }> = [];
  while ((match = PARAGRAPH_BREAK_RE.exec(text)) !== null) {
    paragraphBounds.push({ start: paraStart, end: match.index });
    paraStart = match.index + match[0].length;
  }
  paragraphBounds.push({ start: paraStart, end: text.length });

  for (const para of paragraphBounds) {
    let segStart = para.start;
    for (let i = para.start; i < para.end; i++) {
      if (!SENTENCE_END_CHARS.has(text[i])) continue;
      const rest = text.slice(i + 1, para.end);
      // Only a real sentence boundary when followed by whitespace + a
      // capital/digit/quote/paren, or end-of-paragraph — avoids splitting on
      // "3.5", "e.g.", "Dr.", decimal/abbreviation periods.
      const isBoundary = rest.length === 0 || /^\s+[A-Z0-9"'“(]/.test(rest);
      if (!isBoundary) continue;
      pushSentence(segStart, i + 1);
      segStart = i + 1;
    }
    // Trailing fragment with no terminal punctuation within this paragraph
    // (e.g. a heading line) is still its own segment, bounded by the
    // paragraph break — never merged into the next paragraph.
    if (segStart < para.end) pushSentence(segStart, para.end);
  }

  return sentences;
}

// ── Heuristic detectors ──────────────────────────────────────────────────────
// Each returns a CanonicalType when a sentence matches, or null. Checked in
// priority order per sentence — first match wins, so more specific patterns
// (trap/contrast) are checked before the broad definition pattern.

const DEFINITION_RE = /^[A-Z][\w\s()'-]{0,60}?\s+(?:is|are|refers to|is defined as|means|denotes)\s+/;
const TRAP_RE       = /\b(?:be careful|common mistake|do not confuse|watch out|caution|warning:|note that students often)\b/i;
const CONTRAST_RE   = /\b(?:however,|in contrast,|unlike |on the other hand,|whereas )/i;
const FORMULA_RE    = /[=≈≤≥±]/;

function detectSentenceType(sentence: string): CanonicalType | null {
  if (TRAP_RE.test(sentence))       return "trap";
  if (CONTRAST_RE.test(sentence))   return "comparison";
  if (FORMULA_RE.test(sentence))    return "definition"; // no dedicated "formula" type — deferred (see pageAnnotationPlan.ts notes)
  if (DEFINITION_RE.test(sentence)) return "definition";
  return null;
}

const REASON_BY_TYPE: Record<CanonicalType, string> = {
  definition:         "Defines a term or states a formula on this page.",
  mechanism:          "Describes a numbered procedure or sequence on this page.",
  procedure:          "Describes a numbered procedure or sequence on this page.",
  decision:           "A decision point identified on this page.",
  comparison:         "Contrasts two things on this page.",
  trap:               "Flags a common mistake or warning on this page.",
  clinicalPearl:       "An expert insight identified on this page.",
  supportingEvidence: "Supporting detail on this page.",
};

// ── Numbered-procedure detection ─────────────────────────────────────────────
// Consecutive numbered lines ("1. ...", "2. ...") merge into ONE annotation
// spanning from the first step's start to the last step's end — matches the
// "multi-sentence concept = one continuous highlight" rule used throughout
// this pipeline, never several fragmented per-step annotations.

const NUMBERED_LINE_RE = /^\s*(\d+)[.)]\s+\S/;

function detectProcedureSpans(text: string): Array<{ start: number; end: number }> {
  const lines = text.split("\n");
  const spans: Array<{ start: number; end: number }> = [];
  let offset = 0;
  let runStart: number | null = null;
  let runEnd: number | null = null;
  let expectedNext = 1;

  const flush = () => {
    if (runStart !== null && runEnd !== null) spans.push({ start: runStart, end: runEnd });
    runStart = null;
    runEnd = null;
    expectedNext = 1;
  };

  for (const line of lines) {
    const match = line.match(NUMBERED_LINE_RE);
    const num = match ? parseInt(match[1], 10) : null;
    if (num !== null && (num === expectedNext || (runStart === null && num === 1))) {
      const lineStart = offset + (line.length - line.trimStart().length);
      if (runStart === null) runStart = lineStart;
      runEnd = offset + line.trimEnd().length;
      expectedNext = num + 1;
    } else if (num === null || num !== expectedNext) {
      flush();
    }
    offset += line.length + 1; // +1 for the split "\n"
  }
  flush();

  // Require at least 2 steps to count as a "procedure" (a single numbered
  // line is more likely a citation/footnote than a procedure).
  return spans.filter(s => s.end - s.start > 40);
}

// ── Heading detection ─────────────────────────────────────────────────────────
// The first short, non-empty line — used as a single low-importance
// definition-type annotation naming the page's topic. Skipped entirely if it
// overlaps a span already captured by another detector.

function detectHeadingSpan(text: string): { start: number; end: number } | null {
  const firstNewline = text.indexOf("\n");
  const firstLine = (firstNewline === -1 ? text : text.slice(0, firstNewline)).trim();
  if (firstLine.length < 4 || firstLine.length > 80) return null;
  const start = text.indexOf(firstLine);
  if (start === -1) return null;
  return { start, end: start + firstLine.length };
}

function spansOverlap(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

// ── Caps ──────────────────────────────────────────────────────────────────────
// Deliberately tighter than limitAnnotationDensity.ts's AI-plan caps — this is
// a coarse regex pass, not a page-aware model, so it should offer fewer,
// higher-confidence candidates and let limitAnnotationDensity.ts (already run
// on every plan downstream, AI or deterministic) make the final density call.

const MAX_DEFINITIONS = 3;
const MAX_TRAPS        = 2;
const MAX_COMPARISONS  = 1;
const MAX_PROCEDURES   = 1;

/**
 * Build a deterministic, AI-free SurgeonAnnotationPlan from raw page text.
 * pageThesis/pageRole are best-effort placeholders (never shown directly —
 * annotations are what render) since there is no AI call to produce a real
 * thesis; callers should not treat this plan's pageThesis as authoritative.
 */
export function buildDeterministicAnnotationPlan(
  pageText: string,
  pageTruthKey: string,
): SurgeonAnnotationPlan {
  // pageThesis is a non-empty placeholder (SurgeonAnnotationPlanSchema requires
  // min(1)) — this plan is a plain TS object, never Zod-parsed, but keeping it
  // schema-valid means it can be cached/round-tripped through the same store
  // as an AI-produced plan without a special case. Never shown directly —
  // annotations are what render.
  const PLACEHOLDER_THESIS = "Deterministic baseline — no AI thesis generated.";

  if (!pageText || pageText.trim().length < 40) {
    return { pageTruthKey, pageThesis: PLACEHOLDER_THESIS, pageRole: "definition", annotations: [] };
  }

  const annotations: SurgeonAnnotation[] = [];
  const claimedSpans: Array<{ start: number; end: number }> = [];

  const addAnnotation = (
    span: { start: number; end: number },
    exactQuote: string,
    canonicalType: CanonicalType,
    importance: SurgeonAnnotation["importance"],
  ) => {
    if (claimedSpans.some(s => spansOverlap(s, span))) return false;
    claimedSpans.push(span);
    annotations.push({
      canonicalType,
      exactQuote,
      reason:     REASON_BY_TYPE[canonicalType],
      importance,
      treatment:  DEFAULT_TREATMENT[canonicalType],
      spanScope:  "fullSentence",
    });
    return true;
  };

  // 1. Numbered procedures — highest structural signal, claimed first so
  //    sentence-level detectors don't fragment a procedure's own steps.
  const procedureSpans = detectProcedureSpans(pageText);
  let procedureCount = 0;
  for (const span of procedureSpans) {
    if (procedureCount >= MAX_PROCEDURES) break;
    const quote = pageText.slice(span.start, span.end).trim();
    if (addAnnotation(span, quote, "procedure", "high")) procedureCount++;
  }

  // 2. Sentence-level detectors (trap / comparison / formula / definition).
  const sentences = splitIntoSentencesWithSpans(pageText);
  let definitionCount = 0, trapCount = 0, comparisonCount = 0;
  for (const sentence of sentences) {
    const type = detectSentenceType(sentence.text);
    if (!type) continue;
    if (type === "trap" && trapCount < MAX_TRAPS) {
      if (addAnnotation(sentence, sentence.text, "trap", "high")) trapCount++;
    } else if (type === "comparison" && comparisonCount < MAX_COMPARISONS) {
      if (addAnnotation(sentence, sentence.text, "comparison", "supporting")) comparisonCount++;
    } else if (type === "definition" && definitionCount < MAX_DEFINITIONS) {
      const importance = definitionCount === 0 ? "critical" : "high";
      if (addAnnotation(sentence, sentence.text, "definition", importance)) definitionCount++;
    }
  }

  // 3. Heading — only if it doesn't overlap anything already claimed.
  const headingSpan = detectHeadingSpan(pageText);
  if (headingSpan) {
    const quote = pageText.slice(headingSpan.start, headingSpan.end).trim();
    addAnnotation(headingSpan, quote, "definition", "supporting");
  }

  return {
    pageTruthKey,
    pageThesis: PLACEHOLDER_THESIS,
    pageRole:   procedureCount > 0 ? "procedure" : "definition",
    annotations,
  };
}
