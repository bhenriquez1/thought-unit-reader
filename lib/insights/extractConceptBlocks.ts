// lib/insights/extractConceptBlocks.ts
// Concept extraction engine: structured page model → scored concept blocks.
// Both LEFT highlights and RIGHT ULTRA view derive from this single output.

import { cleanSentence } from "./sentenceCleanup";
import { isRenderableSentence } from "./isRenderableSentence";

export type ConceptImportance = "very_high" | "high" | "medium" | "low";

export interface SourceSentence {
  id: string;
  text: string;
  paragraphId?: string;
  headingId?: string;
  score?: number;
}

export interface SourceParagraph {
  id: string;
  text: string;
  sentenceIds: string[];
  headingId?: string;
  score?: number;
}

export interface SourceHeading {
  id: string;
  text: string;
  level?: number;
  score?: number;
}

export interface PageModelForConcepts {
  documentId: string;
  pageNumber: number;
  pageTitle?: string | null;
  pageSummary?: string | null;
  headings?: SourceHeading[];
  paragraphs?: SourceParagraph[];
  sentences?: SourceSentence[];
}

export interface ConceptBlockInput {
  id: string;
  title: string;
  anchorSentence: string;
  anchorSentenceId?: string;
  supportSentences: string[];
  supportSentenceIds: string[];
  trapCandidates: string[];
  headingText?: string;
  paragraphIds: string[];
  importance: ConceptImportance;
  score: number;
}

const MAX_BLOCKS = 5;
const MIN_BLOCKS = 2;

const CONTRAST_MARKERS = [
  "however", "but", "although", "whereas", "in contrast",
  "rather than", "except", "instead", "conversely", "unlike", "not",
];

const RULE_MARKERS = [
  "defined as", "is called", "refers to", "means", "therefore",
  "thus", "in other words", "results in", "causes", "leads to", "because",
];

const LOW_VALUE_OPENERS = [
  "for example", "in addition", "also", "moreover", "furthermore",
];

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function startsWithLowValueOpener(text: string): boolean {
  const lower = normalize(text);
  return LOW_VALUE_OPENERS.some((m) => lower.startsWith(m));
}

function hasContrast(text: string): boolean {
  const lower = normalize(text);
  return CONTRAST_MARKERS.some((m) => lower.includes(m));
}

function hasRuleSignal(text: string): boolean {
  const lower = normalize(text);
  return RULE_MARKERS.some((m) => lower.includes(m));
}

function titleCase(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((w) => (!w ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

function sentenceScore(sentence: SourceSentence): number {
  const cleaned = cleanSentence(sentence.text);
  if (!isRenderableSentence(cleaned)) return -100;

  let score = sentence.score ?? 0;
  const len = cleaned.length;
  if (len >= 45 && len <= 220) score += 3;
  if (hasRuleSignal(cleaned)) score += 3;
  if (hasContrast(cleaned)) score += 1;
  if (!startsWithLowValueOpener(cleaned)) score += 1;
  if (/[:;]/.test(cleaned)) score += 1;
  if (/\b(is|are|means|defined|consists|causes|results|leads)\b/i.test(cleaned)) score += 2;
  return score;
}

function chooseAnchorSentence(sentences: SourceSentence[]): SourceSentence | null {
  if (!sentences.length) return null;
  return [...sentences].sort((a, b) => sentenceScore(b) - sentenceScore(a))[0] ?? null;
}

function inferImportance(score: number): ConceptImportance {
  if (score >= 10) return "very_high";
  if (score >= 7)  return "high";
  if (score >= 4)  return "medium";
  return "low";
}

function dedupeSentences(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const cleaned = cleanSentence(line);
    if (!isRenderableSentence(cleaned)) continue;
    const key = normalize(cleaned);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

function inferTitle(
  paragraph: SourceParagraph,
  anchor: SourceSentence,
  headingMap: Map<string, SourceHeading>
): string {
  if (paragraph.headingId && headingMap.has(paragraph.headingId)) {
    return titleCase(headingMap.get(paragraph.headingId)!.text);
  }
  const cleaned = cleanSentence(anchor.text);
  const colonMatch = cleaned.match(/^([^:]{4,80}):/);
  if (colonMatch?.[1]) return titleCase(colonMatch[1]);
  const firstChunk = cleaned.split(/[,.]/)[0]?.trim();
  if (firstChunk && firstChunk.length >= 8 && firstChunk.length <= 60) return titleCase(firstChunk);
  return "Key Concept";
}

function extractTrapCandidates(sentences: SourceSentence[]): string[] {
  return dedupeSentences(
    sentences.map((s) => cleanSentence(s.text)).filter((text) => hasContrast(text))
  ).slice(0, 2);
}

function buildConceptFromParagraph(
  paragraph: SourceParagraph,
  sentenceMap: Map<string, SourceSentence>,
  headingMap: Map<string, SourceHeading>
): ConceptBlockInput | null {
  const sentences = paragraph.sentenceIds
    .map((id) => sentenceMap.get(id))
    .filter((s): s is SourceSentence => Boolean(s));
  if (!sentences.length) return null;

  const anchor = chooseAnchorSentence(sentences);
  if (!anchor) return null;

  const anchorText = cleanSentence(anchor.text);
  if (!isRenderableSentence(anchorText)) return null;

  const support = dedupeSentences(
    sentences.filter((s) => s.id !== anchor.id).map((s) => s.text)
  ).slice(0, 3);

  const score = (paragraph.score ?? 0) + sentenceScore(anchor) + Math.min(support.length, 3);

  return {
    id: `concept-${paragraph.id}`,
    title: inferTitle(paragraph, anchor, headingMap),
    anchorSentence: anchorText,
    anchorSentenceId: anchor.id,
    supportSentences: support,
    supportSentenceIds: sentences.filter((s) => s.id !== anchor.id).map((s) => s.id),
    trapCandidates: extractTrapCandidates(sentences),
    headingText: paragraph.headingId ? headingMap.get(paragraph.headingId)?.text : undefined,
    paragraphIds: [paragraph.id],
    importance: inferImportance(score),
    score,
  };
}

function mergeRelatedConcepts(concepts: ConceptBlockInput[]): ConceptBlockInput[] {
  const out: ConceptBlockInput[] = [];
  const used = new Set<string>();

  for (let i = 0; i < concepts.length; i++) {
    const base = concepts[i];
    if (used.has(base.id)) continue;

    const merged: ConceptBlockInput = {
      ...base,
      supportSentences: [...base.supportSentences],
      supportSentenceIds: [...base.supportSentenceIds],
      trapCandidates: [...base.trapCandidates],
      paragraphIds: [...base.paragraphIds],
    };

    for (let j = i + 1; j < concepts.length; j++) {
      const candidate = concepts[j];
      if (used.has(candidate.id)) continue;
      const sameHeading =
        Boolean(normalize(candidate.headingText ?? "")) &&
        normalize(candidate.headingText ?? "") === normalize(base.headingText ?? "");
      const similarTitle = normalize(candidate.title) === normalize(base.title);

      if (sameHeading || similarTitle) {
        used.add(candidate.id);
        merged.supportSentences = dedupeSentences([
          ...merged.supportSentences,
          candidate.anchorSentence,
          ...candidate.supportSentences,
        ]).slice(0, 4);
        merged.supportSentenceIds = Array.from(
          new Set([...merged.supportSentenceIds, ...candidate.supportSentenceIds])
        );
        merged.trapCandidates = dedupeSentences([
          ...merged.trapCandidates,
          ...candidate.trapCandidates,
        ]).slice(0, 2);
        merged.paragraphIds = Array.from(new Set([...merged.paragraphIds, ...candidate.paragraphIds]));
        merged.score += Math.max(1, Math.floor(candidate.score / 3));
        merged.importance = inferImportance(merged.score);
      }
    }

    out.push(merged);
  }
  return out;
}

function selectBestConcepts(concepts: ConceptBlockInput[]): ConceptBlockInput[] {
  const ranked = [...concepts].sort((a, b) => b.score - a.score);
  const trimmed = ranked.slice(0, MAX_BLOCKS);
  return trimmed.length >= MIN_BLOCKS ? trimmed : ranked.slice(0, Math.max(MIN_BLOCKS, ranked.length));
}

export function extractConceptBlocks(page: PageModelForConcepts): ConceptBlockInput[] {
  const paragraphs = page.paragraphs ?? [];
  const sentences  = page.sentences  ?? [];
  const headings   = page.headings   ?? [];

  const sentenceMap = new Map(sentences.map((s) => [s.id, s]));
  const headingMap  = new Map(headings.map((h) => [h.id, h]));

  const rawConcepts = paragraphs
    .map((p) => buildConceptFromParagraph(p, sentenceMap, headingMap))
    .filter((c): c is ConceptBlockInput => Boolean(c));

  return selectBestConcepts(mergeRelatedConcepts(rawConcepts));
}
