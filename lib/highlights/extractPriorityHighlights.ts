import { cleanSentence } from "@/lib/insights/sentenceCleanup";
import { isRenderableSentence } from "@/lib/insights/isRenderableSentence";
import type { DecisionPath, PageInsightModel, ParagraphInsight } from "@/lib/insights/types";
import type { PageStory } from "@/lib/insights/buildPageStory";
import type { PageContentClass } from "@/lib/pdf/classifyPageContent";

export type HighlightPriority = "main" | "support" | "weak";

export type PriorityHighlightSpan = {
  id: string;
  documentId: string;
  pageNumber: number;
  text: string;
  priority: HighlightPriority;
  confidence: number;
  kind:
    | "core_claim"
    | "mechanism"
    | "definition"
    | "contrast"
    | "process_step"
    | "clinical_rule"
    | "evidence_sentence"
    | "heading_anchor";
  paragraphId?: string;
  sentenceId?: string;
  evidenceId?: string;
  startOffset?: number;
  endOffset?: number;
};

type ExtractPriorityHighlightsArgs = {
  documentId: string;
  pageNumber: number;
  pageClass: PageContentClass;
  pageModel: PageInsightModel | null;
  maxMain?: number;
  maxSupport?: number;
  maxWeak?: number;
  story?: PageStory | null;
};

type ScoredHighlightCandidate = {
  id: string;
  text: string;
  confidence: number;
  score: number;
  kind: PriorityHighlightSpan["kind"];
  paragraphId?: string;
  sentenceId?: string;
  evidenceId?: string;
  startOffset?: number;
  endOffset?: number;
  source: "paragraph" | "takeaway" | "sequence" | "summary";
};

export function extractPriorityHighlights({
  documentId,
  pageNumber,
  pageClass,
  pageModel,
  maxMain = 2,
  maxSupport = 4,
  maxWeak = 3,
  story = null,
}: ExtractPriorityHighlightsArgs): PriorityHighlightSpan[] {
  if (!pageModel) return [];
  if (pageClass === "image_only" || pageClass === "failed_sparse") return [];

  if (story) {
    const spans: PriorityHighlightSpan[] = [];
    const mainBlock = [story.mainIdea, story.support[0]].filter(Boolean).join(" ");
    spans.push({
      id: `story-main-${pageNumber}`,
      documentId,
      pageNumber,
      text: normalizeText(mainBlock) || story.mainIdea,
      priority: "main",
      confidence: story.confidence,
      kind: "core_claim",
    });
    story.support.slice(0, maxSupport).forEach((line, index) => spans.push({
      id: `story-support-${pageNumber}-${index}`,
      documentId,
      pageNumber,
      text: line,
      priority: "support",
      confidence: Math.max(0.5, story.confidence - 0.1),
      kind: "evidence_sentence",
    }));
    story.weakSupport.slice(0, maxWeak).forEach((line, index) => spans.push({
      id: `story-weak-${pageNumber}-${index}`,
      documentId,
      pageNumber,
      text: line,
      priority: "weak",
      confidence: Math.max(0.35, story.confidence - 0.2),
      kind: "evidence_sentence",
    }));
    return spans.filter((item) => isRenderableSentence(item.text));
  }

  const budgets = getBudgetsForPageClass(pageClass, { maxMain, maxSupport, maxWeak });
  const candidates = synthesizePriorityBlocks(collectHighlightCandidates(pageModel, pageClass));
  if (!candidates.length) return [];

  const main = candidates
    .filter((candidate) => candidate.score >= 0.78)
    .slice(0, budgets.main)
    .map((candidate) => toHighlight(candidate, documentId, pageNumber, "main"));

  const used = new Set(main.map((item) => item.id));
  const support = candidates
    .filter((candidate) => !used.has(candidate.id) && candidate.score >= 0.56)
    .slice(0, budgets.support)
    .map((candidate) => toHighlight(candidate, documentId, pageNumber, "support"));

  support.forEach((item) => used.add(item.id));

  const weak = candidates
    .filter((candidate) => !used.has(candidate.id) && candidate.score >= 0.34)
    .slice(0, budgets.weak)
    .map((candidate) => toHighlight(candidate, documentId, pageNumber, "weak"));

  return [...main, ...support, ...weak];
}

function synthesizePriorityBlocks(candidates: ScoredHighlightCandidate[]): ScoredHighlightCandidate[] {
  const out: ScoredHighlightCandidate[] = [];
  const used = new Set<string>();
  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    if (used.has(candidate.id)) continue;

    const currentIndex = paragraphNumber(candidate.paragraphId);
    const next = candidates[i + 1];
    const nextIndex = paragraphNumber(next?.paragraphId);
    const canMerge = currentIndex !== null
      && nextIndex !== null
      && Math.abs(currentIndex - nextIndex) === 1
      && candidate.score >= 0.62
      && (next?.score || 0) >= 0.54;

    if (canMerge && next) {
      used.add(candidate.id);
      used.add(next.id);
      out.push({
        ...candidate,
        id: `${candidate.id}+${next.id}`,
        text: cleanSentence(`${candidate.text} ${next.text}`),
        confidence: clamp((candidate.confidence + next.confidence) / 2, 0, 1),
        score: clamp(Math.max(candidate.score, next.score) + 0.08, 0, 1),
        kind: candidate.kind,
        source: candidate.source,
      });
      i += 1;
      continue;
    }

    out.push(candidate);
    used.add(candidate.id);
  }
  return out;
}

function paragraphNumber(id?: string): number | null {
  if (!id) return null;
  const match = id.match(/(\d+)$/);
  return match ? Number(match[1]) : null;
}

function collectHighlightCandidates(pageModel: PageInsightModel, pageClass: PageContentClass): ScoredHighlightCandidate[] {
  const candidates: ScoredHighlightCandidate[] = [];
  const seen = new Set<string>();

  const push = (candidate: ScoredHighlightCandidate | null) => {
    if (!candidate || !candidate.text || seen.has(candidate.id)) return;
    seen.add(candidate.id);
    candidates.push(candidate);
  };

  push(buildSummaryCandidate(pageModel.pageSummary));
  for (const takeaway of pageModel.topTakeaways || []) push(buildTakeawayCandidate(takeaway));
  for (const paragraph of pageModel.paragraphInsights || []) push(buildParagraphCandidate(paragraph, pageClass));
  for (const sequence of pageModel.decisionPaths || []) push(buildSequenceCandidate(sequence));

  return candidates
    .filter((item) => isRenderableSentence(item.text))
    .sort((a, b) => b.score - a.score);
}

function buildSummaryCandidate(text: string): ScoredHighlightCandidate | null {
  const normalized = normalizeText(text);
  if (!normalized) return null;
  return {
    id: `summary:${hashText(normalized)}`,
    text: normalized,
    confidence: 0.84,
    score: 0.86,
    kind: inferHighlightKind(normalized, "summary"),
    source: "summary",
  };
}

function buildTakeawayCandidate(text: string): ScoredHighlightCandidate | null {
  const normalized = normalizeText(text);
  if (!normalized) return null;
  return {
    id: `takeaway:${hashText(normalized)}`,
    text: normalized,
    confidence: 0.72,
    score: scoreText(normalized, "takeaway"),
    kind: inferHighlightKind(normalized, "takeaway"),
    source: "takeaway",
  };
}

function buildParagraphCandidate(paragraph: ParagraphInsight, pageClass: PageContentClass): ScoredHighlightCandidate | null {
  const normalized = normalizeText(paragraph.summary || paragraph.cleanedText || paragraph.rawText || "");
  if (!normalized) return null;
  return {
    id: paragraph.id || `paragraph:${hashText(normalized)}`,
    text: normalized,
    confidence: paragraph.confidence ?? 0.62,
    score: scoreParagraph(paragraph, normalized, pageClass),
    kind: mapParagraphKindToHighlightKind(paragraph.paragraphType, normalized, pageClass),
    paragraphId: paragraph.id,
    source: "paragraph",
  };
}

function buildSequenceCandidate(sequence: DecisionPath): ScoredHighlightCandidate | null {
  const preferred = sequence.interpretation || sequence.implication || sequence.nextMove || sequence.condition || "";
  const normalized = normalizeText(preferred);
  if (!normalized) return null;
  return {
    id: sequence.id || `sequence:${hashText(normalized)}`,
    text: normalized,
    confidence: sequence.confidence ?? 0.58,
    score: scoreSequence(normalized, sequence),
    kind: inferHighlightKind(normalized, "sequence"),
    source: "sequence",
  };
}

function scoreParagraph(paragraph: ParagraphInsight, text: string, pageClass: PageContentClass): number {
  let score = paragraph.confidence ?? 0.55;
  score += Math.max(0, paragraph.priorityScore || 0) * 0.03;

  if (paragraph.paragraphType === "definition") score += 0.1;
  if (paragraph.paragraphType === "cause_effect") score += 0.12;
  if (paragraph.paragraphType === "comparison") score += 0.09;
  if (paragraph.paragraphType === "process") score += 0.08;
  if (paragraph.paragraphType === "clinical_reasoning" || paragraph.paragraphType === "decision") score += 0.12;

  score += scoreTextSignals(text);
  if (pageClass === "form_page" && /\byes\b|\bno\b|_{2,}/i.test(text)) score -= 0.18;
  if (pageClass === "table_heavy" && text.length < 18) score -= 0.1;
  return clamp(score, 0, 1);
}

function scoreSequence(text: string, sequence: DecisionPath): number {
  let score = sequence.confidence ?? 0.52;
  if (sequence.nextMove) score += 0.06;
  if (sequence.trap) score += 0.03;
  if (sequence.implication) score += 0.06;
  score += scoreTextSignals(text);
  return clamp(score, 0, 1);
}

function scoreText(text: string, source: ScoredHighlightCandidate["source"]): number {
  let score = 0.45;
  if (source === "summary") score += 0.22;
  if (source === "takeaway") score += 0.12;
  score += scoreTextSignals(text);
  return clamp(score, 0, 1);
}

function scoreTextSignals(text: string): number {
  const lower = text.toLowerCase();
  let score = 0;
  if (/\bdefines?\b|\bdefined as\b|\brefers to\b|\bis called\b/.test(lower)) score += 0.08;
  if (/\bbecause\b|\btherefore\b|\bthus\b|\bleads? to\b|\bresults? in\b/.test(lower)) score += 0.08;
  if (/\bhowever\b|\bwhereas\b|\bin contrast\b|\bdiffers?\b/.test(lower)) score += 0.06;
  if (/\bmust\b|\bshould\b|\bimportant\b|\bkey\b|\bmain\b/.test(lower)) score += 0.06;
  if (/\bfirst\b|\bnext\b|\bthen\b|\bfinally\b|\bstep\b/.test(lower)) score += 0.05;
  if (/\bdiagnosis\b|\bmanagement\b|\bmechanism\b|\bpathway\b/.test(lower)) score += 0.05;
  if (text.length > 60 && text.length < 240) score += 0.05;
  return score;
}

function toHighlight(candidate: ScoredHighlightCandidate, documentId: string, pageNumber: number, priority: HighlightPriority): PriorityHighlightSpan {
  return {
    id: candidate.id,
    documentId,
    pageNumber,
    text: candidate.text,
    priority,
    confidence: candidate.confidence,
    kind: candidate.kind,
    paragraphId: candidate.paragraphId,
    sentenceId: candidate.sentenceId,
    evidenceId: candidate.evidenceId,
    startOffset: candidate.startOffset,
    endOffset: candidate.endOffset,
  };
}

function normalizeText(input: string): string {
  const cleaned = cleanSentence((input || "").replace(/\s+/g, " ").trim());
  if (!cleaned || !isRenderableSentence(cleaned)) return "";
  return cleaned;
}

function mapParagraphKindToHighlightKind(kind: string | undefined, text: string, pageClass: PageContentClass): PriorityHighlightSpan["kind"] {
  if (pageClass === "form_page") return "evidence_sentence";
  switch (kind) {
    case "definition":
      return "definition";
    case "cause_effect":
      return "mechanism";
    case "comparison":
      return "contrast";
    case "process":
      return "process_step";
    case "clinical_reasoning":
    case "decision":
      return "clinical_rule";
    default:
      return inferHighlightKind(text, "paragraph");
  }
}

function inferHighlightKind(text: string, source: ScoredHighlightCandidate["source"]): PriorityHighlightSpan["kind"] {
  const lower = text.toLowerCase();
  if (/\bdefined as\b|\brefers to\b|\bis called\b/.test(lower)) return "definition";
  if (/\bbecause\b|\bleads? to\b|\bresults? in\b|\bmechanism\b/.test(lower)) return "mechanism";
  if (/\bhowever\b|\bwhereas\b|\bin contrast\b|\bdiffers?\b/.test(lower)) return "contrast";
  if (/\bfirst\b|\bnext\b|\bthen\b|\bfinally\b|\bstep\b/.test(lower)) return "process_step";
  if (/\bmust\b|\bshould\b|\brule\b|\bdiagnosis\b|\bmanagement\b/.test(lower)) return "clinical_rule";
  if (source === "summary") return "evidence_sentence";
  return "core_claim";
}

function getBudgetsForPageClass(pageClass: PageContentClass, input: { maxMain: number; maxSupport: number; maxWeak: number }) {
  switch (pageClass) {
    case "prose":
    case "prose_with_headings":
      return { main: input.maxMain, support: input.maxSupport, weak: input.maxWeak };
    case "mixed_visual":
      return { main: 1, support: 3, weak: 2 };
    case "sparse_text":
      return { main: 1, support: 2, weak: 1 };
    case "form_page":
      return { main: 1, support: 3, weak: 1 };
    case "table_heavy":
      return { main: 1, support: 2, weak: 1 };
    default:
      return { main: 0, support: 0, weak: 0 };
  }
}

function hashText(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(36);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
