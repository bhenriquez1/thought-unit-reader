// lib/insights/extractConceptBlocks.ts
// Concept extraction engine: structured page model → scored concept blocks.
// Both LEFT highlights and RIGHT ULTRA view derive from this single output.

import { cleanSentence } from "./sentenceCleanup";
import { isRenderableSentence } from "./isRenderableSentence";
import { TRAP_RE, REASON_RE } from "./dedupeSectionCandidates";
import { inferConceptTitle } from "./inferConceptTitle";

export type ConceptImportance = "very_high" | "high" | "medium" | "low";

export type ConceptRole =
  | "definition"    // "X is defined as", "X is characterized by"
  | "mechanism"     // "X causes", "X leads to", "because"
  | "variation"     // "unlike X", "in contrast", "however"
  | "measurement"   // numbers with units, "unit of", "equal to"
  | "example"       // "for example", "such as"
  | "detail";       // everything else

export const ROLE_PRIORITY: Record<ConceptRole, number> = {
  definition:  6,
  mechanism:   5,
  variation:   4,
  measurement: 3,
  example:     2,
  detail:      1,
};

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
  conceptRole: ConceptRole;
}

const MAX_BLOCKS = 5;
const MIN_BLOCKS = 2;

// Use canonical signal regexes from dedupeSectionCandidates (TRAP_RE, REASON_RE)
// Keep local lists only for score boosting
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
  return TRAP_RE.test(text);
}

function hasRuleSignal(text: string): boolean {
  return REASON_RE.test(text) || RULE_MARKERS.some((m) => normalize(text).includes(m));
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
  const total = sentences.length;
  return (
    [...sentences].sort((a, b) => {
      const diff = sentenceScore(b) - sentenceScore(a);
      if (Math.abs(diff) > 0.5) return diff;
      // Tie-break 1: prefer sentences in the 12–28 word range (highest specificity)
      const aWords = a.text.split(/\s+/).length;
      const bWords = b.text.split(/\s+/).length;
      const aOpt = Math.abs(aWords - 20);
      const bOpt = Math.abs(bWords - 20);
      if (aOpt !== bOpt) return aOpt - bOpt;
      // Tie-break 2: prefer sentences near the middle of the paragraph
      const aPos = Math.abs(sentences.indexOf(a) / Math.max(total - 1, 1) - 0.5);
      const bPos = Math.abs(sentences.indexOf(b) / Math.max(total - 1, 1) - 0.5);
      return aPos - bPos;
    })[0] ?? null
  );
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
  const headingText = paragraph.headingId ? headingMap.get(paragraph.headingId)?.text : undefined;
  return inferConceptTitle(cleanSentence(anchor.text), headingText);
}

function classifyConceptRole(anchorText: string, supportTexts: string[]): ConceptRole {
  const lower = anchorText.toLowerCase();

  // Definition: explicit definitional copula or structural "is a/the X that/which"
  if (/\b(is defined as|is characterized by|refers to|is called|is known as|is a type of|is described as|is the process of|is the ability to|consists of)\b/.test(lower)) return "definition";
  if (/\b(defined as|means that|means \w|is (a|an|the) \w+ (that|which|of))\b/.test(lower)) return "definition";
  if (/\b(is (a|an|the) \w[\w\s]+ (that|which|used|found|located|formed|produced|made))\b/.test(lower)) return "definition";

  // Mechanism: causal / process language including science relational verbs
  if (/\b(causes?|leads? to|results? in|because|therefore|thus|hence|consequently|triggers?|stimulates?|inhibits?|activates?|promotes?|mediates?|drives?|prevents?|allows?)\b/.test(lower)) return "mechanism";
  if (/\b(depends? on|regulated by|controlled by|initiated by|releases?|absorbs?|determines?|identifies?|governs?|regulates?|establishes?|reveals?)\b/.test(lower)) return "mechanism";

  // Variation / contrast / exception
  if (/\b(unlike|however|in contrast|whereas|although|despite|rather than|on the other hand|except)\b/.test(lower)) return "variation";
  if (/\b(not all|not every|does not|cannot|different from|differs from|distinguished from)\b/.test(lower)) return "variation";

  // Formula: mathematical relationship — definitional in math context (checked before measurement)
  if (/[=∫∂∑]|lim\b|d\/d[xt]|\\frac|\bintegral\b|\bderivative\b/i.test(anchorText)) return "definition";

  // Measurement: numeric values with domain units, or quantitative framing
  if (/\b\d+(\.\d+)?\s*(daltons?|da\b|amu|mol\b|kg\b|g\b|cm\b|mm\b|nm\b|km\b|l\b|ml\b|pa\b|kpa\b|hz\b|ev\b|kev\b|mev\b|degrees?|°|%)/i.test(anchorText)) return "measurement";
  if (/\b(unit of|measured in|is approximately|is equal to|equals approximately|range(s)? from|between \d+ and \d+)\b/i.test(lower)) return "measurement";
  if (/\b(atomic (mass|weight|number)|molecular (weight|mass)|mass number|proton number|neutron number)\b/.test(lower) && /\d/.test(anchorText)) return "measurement";

  // Example: illustrative instance
  if (/\b(for example|for instance|such as|e\.g\.|i\.e\.|including|just as|consider)\b/.test(lower)) return "example";

  return "detail";
}

function extractTrapCandidates(sentences: SourceSentence[]): string[] {
  // Sort by trap signal strength: TRAP_RE match first, then by length (longer = more specific)
  const trapSentences = sentences
    .map((s) => cleanSentence(s.text))
    .filter((text) => hasContrast(text) && isRenderableSentence(text))
    .sort((a, b) => {
      const aStrong = /\b(however|unlike|in contrast|rather than|should not be confused|do not confuse|not the same|different from)\b/i.test(a);
      const bStrong = /\b(however|unlike|in contrast|rather than|should not be confused|do not confuse|not the same|different from)\b/i.test(b);
      if (aStrong && !bStrong) return -1;
      if (!aStrong && bStrong) return 1;
      return b.length - a.length;
    });
  return dedupeSentences(trapSentences).slice(0, 2);
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
    conceptRole: classifyConceptRole(anchorText, support),
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
        // Prefer the higher-priority role when merging
        if (ROLE_PRIORITY[candidate.conceptRole] > ROLE_PRIORITY[merged.conceptRole]) {
          merged.conceptRole = candidate.conceptRole;
        }
      }
    }

    out.push(merged);
  }
  return out;
}

function selectBestConcepts(concepts: ConceptBlockInput[]): ConceptBlockInput[] {
  if (!concepts.length) return [];

  // Group by role, sorted by score within each group
  const byRole = new Map<ConceptRole, ConceptBlockInput[]>();
  for (const c of concepts) {
    const role = c.conceptRole;
    if (!byRole.has(role)) byRole.set(role, []);
    byRole.get(role)!.push(c);
  }
  for (const [, group] of byRole) {
    group.sort((a, b) => b.score - a.score);
  }

  const selected: ConceptBlockInput[] = [];
  const usedIds = new Set<string>();

  // First pass: one best from each high-priority role in tier order
  for (const role of ["definition", "mechanism", "variation"] as ConceptRole[]) {
    const best = byRole.get(role)?.[0];
    if (best && !usedIds.has(best.id)) {
      selected.push(best);
      usedIds.add(best.id);
    }
  }

  // Second pass: fill remaining slots with best available by score
  const remaining = [...concepts]
    .filter((c) => !usedIds.has(c.id))
    .sort((a, b) => {
      const diff = b.score - a.score;
      if (Math.abs(diff) > 0.5) return diff;
      const aWords = a.anchorSentence.split(/\s+/).length;
      const bWords = b.anchorSentence.split(/\s+/).length;
      return Math.abs(aWords - 20) - Math.abs(bWords - 20);
    });

  for (const c of remaining) {
    if (selected.length >= MAX_BLOCKS) break;
    selected.push(c);
    usedIds.add(c.id);
  }

  // Ensure at least MIN_BLOCKS
  if (selected.length < MIN_BLOCKS) {
    for (const c of [...concepts].sort((a, b) => b.score - a.score)) {
      if (selected.length >= MIN_BLOCKS) break;
      if (!usedIds.has(c.id)) {
        selected.push(c);
        usedIds.add(c.id);
      }
    }
  }

  // Enforce strict hierarchy in final order:
  // definition first (if present), mechanism second (if present),
  // then remaining by role priority + score.
  return sortConceptsByStrictHierarchy(selected);
}

function sortConceptsByStrictHierarchy<T extends {
  conceptRole?: ConceptRole;
  score?: number;
}>(concepts: T[]): T[] {
  const ranked = [...concepts].sort((a, b) => {
    const roleA = ROLE_PRIORITY[a.conceptRole ?? "detail"] ?? 0;
    const roleB = ROLE_PRIORITY[b.conceptRole ?? "detail"] ?? 0;
    if (roleA !== roleB) return roleB - roleA;
    return (b.score ?? 0) - (a.score ?? 0);
  });

  const definitions = ranked.filter((c) => c.conceptRole === "definition");
  const mechanisms = ranked.filter((c) => c.conceptRole === "mechanism");
  const variations = ranked.filter((c) => c.conceptRole === "variation");
  const measurements = ranked.filter((c) => c.conceptRole === "measurement");
  const examples = ranked.filter((c) => c.conceptRole === "example");
  const details = ranked.filter((c) => !c.conceptRole || c.conceptRole === "detail");

  const ordered: T[] = [];
  const used = new Set<T>();

  if (definitions.length > 0) {
    ordered.push(definitions[0]);
    used.add(definitions[0]);
  }

  if (mechanisms.length > 0) {
    const mech = mechanisms.find((c) => !used.has(c));
    if (mech) {
      ordered.push(mech);
      used.add(mech);
    }
  }

  for (const bucket of [definitions, mechanisms, variations, measurements, examples, details]) {
    for (const item of bucket) {
      if (used.has(item)) continue;
      ordered.push(item);
      used.add(item);
    }
  }

  return ordered;
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
