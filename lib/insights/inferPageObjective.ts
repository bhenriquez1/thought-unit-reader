// lib/insights/inferPageObjective.ts
// Infers the page's educational teaching objective before concept extraction.
// This is the "top-down" constraint the system was missing: instead of discovering
// concepts bottom-up and hoping the right one becomes the core idea, we first ask
// "what is this page TRULY TEACHING?" and use that answer to constrain everything
// downstream.
//
// The objective is synthesized from:
//   1. The first meaningful heading line (page topic)
//   2. The highest-confidence definition/rule canonical statement from normalization
//   3. normResult.coreIdea as a fallback
//
// Output is used as the PRIMARY core idea source in buildUltraPageView, ranked above
// AI-generated page summaries and above concept anchors.

import type { PageDomain } from "./detectPageDomain";

export interface PageObjective {
  topic: string;             // e.g. "Limits of Sequences"
  teachingStatement: string; // e.g. "A sequence converges when its terms approach one value"
  domain: PageDomain;
}

interface CanonicalStmt {
  normalizedText: string;
  role: string;
  confidence: number;
}

// Roles whose statements represent the page's core educational content —
// not illustrative examples, not transition phrases.
const TEACHING_ROLES = new Set([
  "definition",
  "mathematical_rule",
  "clinical_rule",
  "mechanism",
]);

// Returns true when text reads like a supporting example rather than a
// defining rule. These must never become the page's teaching statement.
export function isExampleOrFiller(text: string): boolean {
  const t = text.trim();
  // Named substance category instance: "Iodine is the trace element that..."
  if (/^[A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]+)?\s+is (a|an|the) (trace|essential|major|minor|macro|micro|most abundant|only)?\s*(element|mineral|compound|ion|vitamin|electrolyte|metalloid|halogen|nutrient)\b/i.test(t)) return true;
  // Named molecule with abundance/observational fact: "Water (H2O) is the most abundant..."
  if (/^[A-Z][a-z]{1,15}(?:\s*\([A-Za-z0-9₀-₉²³+\-]+\))?\s+is (the |a |an )?(most|least|only|found|abundant|present|common|approximately|often|mainly|primarily|widely|highly|extremely)\b/i.test(t)) return true;
  // Named deficiency/toxicity: "Iodine deficiency causes goiter"
  if (/^[A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]+)?\s+(deficiency|toxicity|poisoning|overdose|exposure)\b/i.test(t)) return true;
  // Specific named disease illustrations
  if (/\b(goiter|rickets|scurvy|pellagra|beriberi|kwashiorkor|marasmus|cretinism)\b/i.test(t)) return true;
  // Explicit example openers
  if (/^(for example,?|for instance,?|to illustrate)/i.test(t)) return true;
  // Math/prose filler: "We indicate this by saying...", "Notice that...", etc.
  if (/^(we (indicate|say|note|see|observe|call|denote|write|have seen|recall that|now turn|now consider)\b|in other words,?|notice that\b|observe that\b|here we\b|it (is|can be) (shown|seen|noted)\b|this (gives|shows|yields|follows)\b|recall (that\b|from\b))/i.test(t)) return true;
  // Generic template fallback
  if (/^this page (develops|introduces|covers|presents|explains)\b/i.test(t)) return true;
  return false;
}

function extractTopic(headingLines: string[]): string {
  for (const raw of headingLines) {
    const cleaned = raw
      .replace(/^\d+(\.\d+)*\.?\s+/, "")                    // strip "2.1 " or "2.1. "
      .replace(/^(chapter|section|unit|part)\s+\d+\.?\s*/i, "") // strip "Chapter 2 "
      .trim();
    // Skip TOC/meta headings that aren't page-topic titles
    if (/^(key concepts?|learning objectives?|table of contents|summary|review|overview|introduction|acknowledgments?|bibliography|references?)\b/i.test(cleaned)) continue;
    if (cleaned.length >= 3 && cleaned.length <= 80) return cleaned;
  }
  return "";
}

export function inferPageObjective(
  headingLines: string[],
  canonicalStatements: CanonicalStmt[],
  normCoreIdea: string | null,
  domain: PageDomain,
): PageObjective | null {
  const topic = extractTopic(headingLines);

  // Find the highest-confidence teaching statement (role = definition/rule/mechanism)
  // that isn't example-like. Canonical statements are already sorted by confidence desc.
  const bestStatement = canonicalStatements.find(
    (s) =>
      TEACHING_ROLES.has(s.role) &&
      s.confidence >= 0.52 &&
      s.normalizedText.length >= 25 &&
      !isExampleOrFiller(s.normalizedText),
  );

  const teachingStatement =
    (bestStatement && !isExampleOrFiller(bestStatement.normalizedText)
      ? bestStatement.normalizedText
      : null) ??
    (normCoreIdea && !isExampleOrFiller(normCoreIdea) ? normCoreIdea : null) ??
    "";

  if (!topic && !teachingStatement) return null;

  return { topic, teachingStatement, domain };
}
