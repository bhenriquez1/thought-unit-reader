// lib/highlights/buildHighlightBucketsFromConcepts.ts
// Derives precise, sentence-level highlight targets from concept blocks.
// LEFT PANEL = where to look. Each tier must earn its place.

import { cleanSentence } from "@/lib/insights/sentenceCleanup";
import { isRenderableSentence } from "@/lib/insights/isRenderableSentence";
import type { ConceptBlockInput } from "@/lib/insights/extractConceptBlocks";

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
    // Important: the anchor sentence of each concept
    pushUnique(out, {
      id: `important-${concept.id}`,
      text: concept.anchorSentence,
      normalizedText: "",
      tier: "important",
      sentenceId: concept.anchorSentenceId,
      conceptId: concept.id,
      confidence: Math.min(1, 0.92 - index * 0.07),
    }, seen);

    // Support: first two support sentences
    concept.supportSentences.slice(0, 2).forEach((text, i) => {
      pushUnique(out, {
        id: `support-${concept.id}-${i}`,
        text,
        normalizedText: "",
        tier: "support",
        sentenceId: concept.supportSentenceIds[i],
        conceptId: concept.id,
        confidence: Math.min(1, 0.78 - i * 0.05),
      }, seen);
    });

    // Additional: third support sentence only
    if (concept.supportSentences[2]) {
      pushUnique(out, {
        id: `additional-${concept.id}-0`,
        text: concept.supportSentences[2],
        normalizedText: "",
        tier: "additional",
        sentenceId: concept.supportSentenceIds[2],
        conceptId: concept.id,
        confidence: 0.55,
      }, seen);
    }

    // Trap: first trap candidate only
    if (concept.trapCandidates[0]) {
      pushUnique(out, {
        id: `trap-${concept.id}-0`,
        text: concept.trapCandidates[0],
        normalizedText: "",
        tier: "trap",
        conceptId: concept.id,
        confidence: 0.82,
      }, seen);
    }
  });

  return out;
}
