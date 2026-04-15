/**
 * passesSectionDedupe.ts
 *
 * Section-specific semantic deduplication for the narrative page view.
 *
 * Three levels of protection:
 *   L1: exact normalized text match
 *   L2: token overlap > threshold (after stopword removal)
 *   L3: function-role clash (rule restates signal, trap matches rule without contrast)
 */

import type { SentenceCandidate } from "./buildSupportNeighborhood"
import type { SectionOutput } from "./types"

export type DedupeCheckResult = {
  allow: boolean
  reason?: string
  similarity: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "if", "then", "this", "that",
  "these", "those", "to", "of", "in", "on", "for", "with", "by", "as",
  "at", "is", "are", "was", "were", "be", "been", "being", "it", "its",
  "from", "into", "than", "may", "can", "will", "would", "should", "could",
  "which", "where", "when", "what", "how", "who", "there", "their", "they",
  "them", "have", "has", "had", "not", "also", "very", "just",
])

const ACTION_VERB_RE = /\bshould\b|must\b|use\b|apply\b|identify\b|distinguish\b|avoid\b|do not\b|before\b|evaluate\b|consider\b|look for\b/i
const CONTRAST_RE   = /\bhowever\b|whereas\b|unlike\b|in contrast\b|but\b|do not\b|avoid\b|wrong\b|trap\b|mistake\b|confuse\b|not enough\b|pitfall\b/i

function candidateText(c: SentenceCandidate): string {
  return (c.cleanedText || c.text || "").trim()
}

function normalizeStr(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function tokenSet(text: string): Set<string> {
  return new Set(
    normalizeStr(text)
      .split(" ")
      .filter((t) => t.length > 2 && !STOPWORDS.has(t))
  )
}

function tokenOverlap(a: string, b: string): number {
  const ta = tokenSet(a)
  const tb = tokenSet(b)
  if (!ta.size || !tb.size) return 0
  let overlap = 0
  for (const t of ta) if (tb.has(t)) overlap++
  const union = new Set([...ta, ...tb]).size || 1
  return overlap / union
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Check whether `candidate` should be allowed into `currentSection`,
 * given the sections already selected.
 *
 * Returns { allow: false } if any deduplication rule triggers.
 */
export function passesSectionDedupe(
  candidate: SentenceCandidate,
  currentSection: "main_signal" | "rule" | "trap" | "grounded_support",
  selected: SectionOutput[]
): DedupeCheckResult {
  const cText = candidateText(candidate)

  for (const section of selected) {
    const primaryText = section.primary ? candidateText(section.primary) : null

    if (primaryText) {
      // L1: exact normalized match
      if (normalizeStr(cText) === normalizeStr(primaryText)) {
        return { allow: false, reason: "exact_duplicate", similarity: 1 }
      }

      // L2: lexical overlap above threshold
      const overlap = tokenOverlap(cText, primaryText)
      const threshold = currentSection === "grounded_support" ? 0.60 : 0.75

      if (overlap > threshold) {
        return { allow: false, reason: "too_similar", similarity: overlap }
      }

      // L3: function-role clashes

      // Rule must add an instruction — reject if it restates the signal without an action verb
      if (currentSection === "rule" && section.section === "main_signal") {
        if (overlap > 0.45 && !ACTION_VERB_RE.test(cText)) {
          return { allow: false, reason: "rule_restates_signal_no_action", similarity: overlap }
        }
      }

      // Trap must carry a contrast or warning signal
      if (currentSection === "trap" && section.section === "rule") {
        if (
          overlap > 0.50 &&
          !CONTRAST_RE.test(cText) &&
          !candidate.roleHints?.isWarning &&
          !candidate.roleHints?.isContrast
        ) {
          return { allow: false, reason: "trap_matches_rule_no_contrast", similarity: overlap }
        }
      }

      // Grounded support cannot closely restate any primary
      if (currentSection === "grounded_support" && overlap > 0.60) {
        return { allow: false, reason: "support_restates_section", similarity: overlap }
      }
    }

    // Also check against each support sentence in the existing section
    for (const sup of section.support) {
      const supText = candidateText(sup)
      if (normalizeStr(cText) === normalizeStr(supText)) {
        return { allow: false, reason: "exact_duplicate_in_support", similarity: 1 }
      }
      const supOverlap = tokenOverlap(cText, supText)
      if (supOverlap > 0.80) {
        return { allow: false, reason: "too_similar_to_support", similarity: supOverlap }
      }
    }
  }

  return { allow: true, similarity: 0 }
}
