// lib/insights/buildCompressionRules.ts
// Produces 3 distinct STR Compression memory rules.
//
// Job separation contract:
//   Core Idea  = page-level meaning
//   Pattern    = what to notice
//   Reason     = why it matters
//   Trap       = likely confusion point
//   Rule       = operational takeaway
//   Compression = final reduced memory rules — must NOT copy any of the above
//
// Source: support-sentence neighborhoods across all concept blocks.
// Barrier: coreIdea + all panel field texts (pattern / reason / trap / rule).

import { cleanSentence } from "./sentenceCleanup";
import { isRenderableSentence } from "./isRenderableSentence";
import { isTooSimilar, RULE_RE, REASON_RE } from "./dedupeSectionCandidates";
import type { ConceptBlockInput } from "./extractConceptBlocks";

function scoreForCompression(text: string): number {
  let score = 0;
  if (RULE_RE.test(text)) score += 5;
  if (REASON_RE.test(text)) score += 2;
  const len = text.length;
  if (len >= 40 && len <= 200) score += 3;
  if (/\b(must|should|always|never|requires?|ensures?|prevents?|depends|critical)\b/i.test(text)) score += 2;
  return score;
}

/**
 * Builds 3 compression rules from the full concept neighborhood.
 *
 * @param concepts     All concept blocks for the page
 * @param coreIdea     The Core Idea sentence (excluded from compression)
 * @param usedFieldTexts  All pattern/surgicalReason/trap/rule texts already shown above
 */
export function buildCompressionRules(
  concepts: ConceptBlockInput[],
  coreIdea: string,
  usedFieldTexts: string[]
): string[] {
  const candidates: Array<{ text: string; score: number }> = [];

  for (const c of concepts) {
    // Support sentences first — these are the explanation/mechanism sentences
    for (const s of c.supportSentences) {
      const t = cleanSentence(s);
      if (isRenderableSentence(t)) {
        candidates.push({ text: t, score: scoreForCompression(t) + 1 });
      }
    }
    // Anchor as secondary source
    const anchor = cleanSentence(c.anchorSentence);
    if (isRenderableSentence(anchor)) {
      candidates.push({ text: anchor, score: scoreForCompression(anchor) });
    }
    // Trap candidates for rule diversity (contrast rules are memorable)
    for (const trap of c.trapCandidates) {
      const t = cleanSentence(trap);
      if (isRenderableSentence(t)) {
        candidates.push({ text: t, score: scoreForCompression(t) });
      }
    }
  }

  // Highest score first
  candidates.sort((a, b) => b.score - a.score);

  // Exclusion barrier: stricter threshold (0.35) vs. default (0.42)
  const barrier = [coreIdea, ...usedFieldTexts].filter(Boolean);
  const rules: string[] = [];
  const usedRules: string[] = [...barrier];

  for (const { text } of candidates) {
    if (rules.length >= 3) break;
    if (isTooSimilar(text, usedRules, 0.35)) continue;
    rules.push(text);
    usedRules.push(text);
  }

  // Emergency pad: if barrier was too strict, relax to 0.55 for the last slots
  if (rules.length < 3) {
    for (const { text } of candidates) {
      if (rules.length >= 3) break;
      if (!isTooSimilar(text, rules, 0.55)) {
        rules.push(text);
      }
    }
  }

  return rules.slice(0, 3).map((r, i) => `Rule ${i + 1}: ${r}`);
}
