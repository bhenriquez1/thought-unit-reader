// lib/highlights/buildHighlightBucketsFromConcepts.ts
// Derives precise, sentence-level highlight targets from concept blocks.
// LEFT PANEL = where to look. Each tier must earn its place.

import { cleanSentence } from "@/lib/insights/sentenceCleanup";
import { isRenderableSentence } from "@/lib/insights/isRenderableSentence";
import type { ConceptBlockInput } from "@/lib/insights/extractConceptBlocks";
import { REASON_RE, TRAP_RE } from "@/lib/insights/dedupeSectionCandidates";

export type HighlightTier = "important" | "support" | "additional" | "trap";

export interface ConceptHighlightTarget {
  id: string;
  text: string;
  normalizedText: string;
  tier: HighlightTier;
  sentenceId?: string;
  conceptId: string;
  confidence: number;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/\u00ad/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pushUnique(
  out: ConceptHighlightTarget[],
  candidate: ConceptHighlightTarget,
  seen: Set<string>
): void {
  const text = cleanSentence(candidate.text);
  if (!isRenderableSentence(text)) return;
  const key = normalize(text);
  if (seen.has(key)) return;
  seen.add(key);
  out.push({ ...candidate, text, normalizedText: key });
}

export function buildHighlightBucketsFromConcepts(
  concepts: ConceptBlockInput[]
): ConceptHighlightTarget[] {
  const out: ConceptHighlightTarget[] = [];
  const seen = new Set<string>();

  concepts.forEach((concept, index) => {
    // IMPORTANT — anchor sentence: the main signal from this concept neighborhood
    pushUnique(out, {
      id: `important-${concept.id}`,
      text: concept.anchorSentence,
      normalizedText: "",
      tier: "important",
      sentenceId: concept.anchorSentenceId,
      conceptId: concept.id,
      confidence: Math.min(1, 0.92 - index * 0.07),
    }, seen);

    // SUPPORT — pick the explanation/justification sentence from the same neighborhood
    // Prefer a sentence with REASON signal; fall back to first support sentence
    const reasonSentence = concept.supportSentences.find((s) => REASON_RE.test(s));
    const primarySupport = reasonSentence ?? concept.supportSentences[0];
    if (primarySupport) {
      const idx = concept.supportSentences.indexOf(primarySupport);
      pushUnique(out, {
        id: `support-${concept.id}-0`,
        text: primarySupport,
        normalizedText: "",
        tier: "support",
        sentenceId: concept.supportSentenceIds[idx] ?? concept.supportSentenceIds[0],
        conceptId: concept.id,
        confidence: 0.78,
      }, seen);
    }

    // SUPPORT (second) — second explanation sentence from same neighborhood, if available and distinct
    const secondSupport = concept.supportSentences.find(
      (s) => s !== primarySupport && !TRAP_RE.test(s)
    );
    if (secondSupport) {
      const idx = concept.supportSentences.indexOf(secondSupport);
      pushUnique(out, {
        id: `support-${concept.id}-1`,
        text: secondSupport,
        normalizedText: "",
        tier: "support",
        sentenceId: concept.supportSentenceIds[idx],
        conceptId: concept.id,
        confidence: 0.68,
      }, seen);
    }

    // ADDITIONAL — a secondary detail from the neighborhood (3rd+ support sentence)
    const additionalSentence = concept.supportSentences.find(
      (s) => s !== primarySupport && s !== secondSupport && !TRAP_RE.test(s)
    );
    if (additionalSentence) {
      const idx = concept.supportSentences.indexOf(additionalSentence);
      pushUnique(out, {
        id: `additional-${concept.id}-0`,
        text: additionalSentence,
        normalizedText: "",
        tier: "additional",
        sentenceId: concept.supportSentenceIds[idx],
        conceptId: concept.id,
        confidence: 0.52,
      }, seen);
    }

    // TRAP — real contrast/exception/confusion sentence from same neighborhood
    const trapSentence = concept.trapCandidates[0]
      ?? concept.supportSentences.find((s) => TRAP_RE.test(s));
    if (trapSentence) {
      pushUnique(out, {
        id: `trap-${concept.id}-0`,
        text: trapSentence,
        normalizedText: "",
        tier: "trap",
        conceptId: concept.id,
        confidence: 0.85,
      }, seen);
    }
  });

  return out;
}
