// lib/insights/buildCompressionRules.ts
// Produces 3 STR Compression memory rules, one per role.
//
// Job separation contract:
//   Core Idea   = page-level meaning
//   Pattern     = what to notice
//   Reason      = why it matters
//   Trap        = likely confusion point
//   Rule        = operational takeaway
//   Compression = final distilled rules — must NOT copy any of the above

import { cleanSentence } from "./sentenceCleanup";
import { isRenderableSentence } from "./isRenderableSentence";
import { isTooSimilar, PATTERN_RE, REASON_RE, RULE_RE } from "./dedupeSectionCandidates";
import type { ConceptBlockInput } from "./extractConceptBlocks";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CompressionRole = "recognition" | "mechanism" | "application";

export interface CompressionConceptBlock {
  anchorSentence: string;
  supportSentences: string[];
  trapCandidates: string[];
  /** Already-displayed panel texts — used as dedup barrier */
  displayedTexts: string[];
}

export interface CompressionRule {
  role: CompressionRole;
  text: string;
}

export interface BuildCompressionRulesResult {
  rules: CompressionRule[];
  /** True if emergency pad (relaxed threshold) was needed */
  usedEmergencyPad: boolean;
}

// ---------------------------------------------------------------------------
// Role classification
// ---------------------------------------------------------------------------

function classifyRole(text: string): CompressionRole {
  if (REASON_RE.test(text)) return "mechanism";
  if (RULE_RE.test(text))   return "application";
  if (PATTERN_RE.test(text)) return "recognition";
  // Heuristic: question-like or consequence markers → application
  if (/\b(must|should|always|never|prevents?|ensures?|requires?|critical|depends)\b/i.test(text)) return "application";
  return "recognition";
}

function baseScore(text: string): number {
  let s = 0;
  if (RULE_RE.test(text))   s += 5;
  if (REASON_RE.test(text)) s += 3;
  if (PATTERN_RE.test(text)) s += 2;
  if (/\b(must|should|always|never|prevents?|ensures?|requires?|critical)\b/i.test(text)) s += 2;
  const len = text.length;
  if (len >= 40 && len <= 200) s += 3;
  return s;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Builds up to 3 STR Compression rules, one per role
 * (recognition / mechanism / application), synthesized across ALL concept
 * blocks. All panel field texts (pattern/reason/trap/rule + coreIdea) serve
 * as the dedup barrier so Compression never copies what's already shown.
 */
export function buildCompressionRules(
  concepts: ConceptBlockInput[],
  coreIdea: string,
  usedFieldTexts: string[]
): string[] {
  const result = buildCompressionRulesTyped(
    concepts.map((c) => ({
      anchorSentence:  c.anchorSentence,
      supportSentences: c.supportSentences,
      trapCandidates:  c.trapCandidates,
      displayedTexts:  [],
    })),
    coreIdea,
    usedFieldTexts
  );
  return result.rules.map((r, i) => `Rule ${i + 1}: ${r.text}`);
}

export function buildCompressionRulesTyped(
  concepts: CompressionConceptBlock[],
  coreIdea: string,
  additionalBarrier: string[] = []
): BuildCompressionRulesResult {
  // Collect candidates from every concept block, labelled by role
  interface Candidate { text: string; score: number; role: CompressionRole }
  const candidates: Candidate[] = [];

  for (const c of concepts) {
    // Support sentences: primary source — mechanisms and application rules live here
    for (const s of c.supportSentences) {
      const t = cleanSentence(s);
      if (!isRenderableSentence(t)) continue;
      candidates.push({ text: t, score: baseScore(t) + 1, role: classifyRole(t) });
    }
    // Trap candidates: great contrast/recognition rules
    for (const trap of c.trapCandidates) {
      const t = cleanSentence(trap);
      if (!isRenderableSentence(t)) continue;
      candidates.push({ text: t, score: baseScore(t), role: "recognition" });
    }
    // Anchor: lower priority (it tends to be already shown above)
    const anchor = cleanSentence(c.anchorSentence);
    if (isRenderableSentence(anchor)) {
      candidates.push({ text: anchor, score: baseScore(anchor) - 1, role: classifyRole(anchor) });
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  // Dedup barrier: coreIdea + all panel field texts
  const barrier: string[] = [coreIdea, ...additionalBarrier].filter(Boolean);
  const BARRIER_THRESHOLD = 0.35;
  const INTER_RULE_THRESHOLD = 0.35;

  const rules: CompressionRule[] = [];
  const usedRoleSet = new Set<CompressionRole>();
  const usedRuleTexts: string[] = [];

  // Pass 1: one rule per role — strict threshold
  for (const { text, role } of candidates) {
    if (rules.length >= 3) break;
    if (usedRoleSet.has(role)) continue;
    if (isTooSimilar(text, barrier, BARRIER_THRESHOLD)) continue;
    if (isTooSimilar(text, usedRuleTexts, INTER_RULE_THRESHOLD)) continue;
    rules.push({ role, text });
    usedRoleSet.add(role);
    usedRuleTexts.push(text);
  }

  // Pass 2: fill remaining slots with any role (still strict barrier)
  if (rules.length < 3) {
    for (const { text, role } of candidates) {
      if (rules.length >= 3) break;
      if (isTooSimilar(text, barrier, BARRIER_THRESHOLD)) continue;
      if (isTooSimilar(text, usedRuleTexts, INTER_RULE_THRESHOLD)) continue;
      rules.push({ role, text });
      usedRuleTexts.push(text);
    }
  }

  // Emergency pad: relax inter-rule threshold to 0.55 if still short
  let usedEmergencyPad = false;
  if (rules.length < 3) {
    usedEmergencyPad = true;
    for (const { text, role } of candidates) {
      if (rules.length >= 3) break;
      if (isTooSimilar(text, barrier, BARRIER_THRESHOLD)) continue;
      if (isTooSimilar(text, usedRuleTexts, 0.55)) continue;
      rules.push({ role, text });
      usedRuleTexts.push(text);
    }
  }

  return { rules: rules.slice(0, 3), usedEmergencyPad };
}
