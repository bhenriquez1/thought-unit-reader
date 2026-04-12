import { cleanSentence } from "@/lib/insights/sentenceCleanup";
import { isRenderableSentence } from "@/lib/insights/isRenderableSentence";
import type { PageInsightModel, ParagraphInsight } from "@/lib/insights/types";
import type { PageStory } from "@/lib/insights/buildPageStory";
import type { PageContentClass } from "@/lib/pdf/classifyPageContent";
import type { ParagraphRoleBlock, ParagraphRole } from "@/lib/highlights/paragraphRoleMap";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type PriorityTier = "main" | "support" | "weak";

export type SemanticHighlightKind =
  | "main_pattern"
  | "main_mechanism"
  | "support_explanation"
  | "support_relation"
  | "support_distinction"
  | "support_decision"
  | "support_application"
  | "trap_warning"
  | "trap_boundary"
  | "weak_caveat";

export type HighlightSource =
  | "story_pattern"
  | "story_mechanism"
  | "story_distinction"
  | "story_relation"
  | "story_decision"
  | "story_application"
  | "story_trap"
  | "paragraph_cluster"
  | "formula_cluster"
  | "fallback";

export type TextSpan = {
  start: number;
  end: number;
};

export type PriorityHighlightBlock = {
  id: string;
  priority: PriorityTier;
  kind: SemanticHighlightKind;
  source: HighlightSource;
  text: string;
  shortLabel?: string;
  spans: TextSpan[];
  score: number;
  confidence: number;
  paragraphIndexes?: number[];
  evidence?: string[];
  support?: string[];
  blockId?: string;
  blockField?: string;
  isMerged: boolean;
};

export type ExtractPriorityHighlightsInput = {
  documentId?: string;
  pageNumber: number;
  pageText: string;
  /** Pre-split paragraph texts from the current page for paragraph-level span anchoring */
  paragraphTexts?: string[];
  /** Pre-classified paragraph roles — adds full-paragraph candidates for primary/trap paragraphs not already covered by story blocks */
  paragraphRoleMap?: ParagraphRoleBlock[];
  pageClass?: PageContentClass | string;
  pageModel?: PageInsightModel | null;
  pageStory?: PageStory | null;
  maxMain?: number;
  maxSupport?: number;
  maxWeak?: number;
  mergeWindowChars?: number;
};

export type ExtractPriorityHighlightsResult = {
  pageTruthKey?: string;
  pageNumber: number;
  documentId?: string;
  main: PriorityHighlightBlock[];
  support: PriorityHighlightBlock[];
  weak: PriorityHighlightBlock[];
  all: PriorityHighlightBlock[];
  stats: {
    candidatesSeen: number;
    candidatesAccepted: number;
    blocksMerged: number;
    spansResolved: number;
    usedStory: boolean;
    usedFallback: boolean;
  };
};

// ---------------------------------------------------------------------------
// Base scores by semantic kind
// ---------------------------------------------------------------------------

const BASE_KIND_SCORE: Record<SemanticHighlightKind, number> = {
  main_pattern: 100,
  main_mechanism: 96,
  trap_warning: 92,
  support_decision: 90,
  support_explanation: 88,
  support_distinction: 86,
  support_relation: 84,
  support_application: 83,
  trap_boundary: 80,
  weak_caveat: 70,
};

// ---------------------------------------------------------------------------
// Internal candidate type
// ---------------------------------------------------------------------------

type CandidateBlock = {
  id: string;
  priority: PriorityTier;
  kind: SemanticHighlightKind;
  source: HighlightSource;
  text: string;
  shortLabel: string;
  support: string[];
  evidence: string[];
  blockId?: string;
  blockField?: string;
  score: number;
  confidence: number;
};

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function extractPriorityHighlights({
  documentId,
  pageNumber,
  pageText,
  paragraphTexts,
  paragraphRoleMap,
  pageClass,
  pageModel,
  pageStory,
  maxMain = 2,
  maxSupport = 4,
  maxWeak = 2,
  mergeWindowChars = 220,
}: ExtractPriorityHighlightsInput): ExtractPriorityHighlightsResult {
  // Build a paragraph index from the page text for paragraph-level span anchoring.
  // Prefer caller-provided paragraphTexts (already split by splitParagraphs), then
  // fall back to a simple blank-line split. Each entry records the paragraph text
  // and its character offset within pageText.
  const pageParagraphIndex = buildParagraphIndex(pageText, paragraphTexts);
  const empty = (stats: Partial<ExtractPriorityHighlightsResult["stats"]> = {}): ExtractPriorityHighlightsResult => ({
    pageNumber,
    documentId,
    main: [],
    support: [],
    weak: [],
    all: [],
    stats: { candidatesSeen: 0, candidatesAccepted: 0, blocksMerged: 0, spansResolved: 0, usedStory: false, usedFallback: false, ...stats },
  });

  if (!pageText) return empty();
  if (pageClass === "image_only" || pageClass === "copyright_frontmatter") return empty();

  // ------- Build candidates -------
  let candidates: CandidateBlock[] = [];
  let usedStory = false;
  let usedFallback = false;

  if (pageStory) {
    candidates = buildStoryCandidates(pageStory, pageNumber, pageParagraphIndex);
    usedStory = true;
  }

  if (!candidates.length && pageModel) {
    candidates = buildFallbackCandidates(pageModel, pageClass as PageContentClass | undefined);
    usedFallback = true;
  }

  // Add paragraph-role candidates for paragraphs not already covered by
  // story blocks. These produce full-paragraph highlights for primary/trap
  // paragraphs that story extraction may have only partially captured.
  if (paragraphRoleMap?.length) {
    const roleCandidates = buildRoleMapCandidates(paragraphRoleMap, candidates, pageNumber);
    if (roleCandidates.length) candidates = [...candidates, ...roleCandidates];
  }

  const candidatesSeen = candidates.length;
  if (!candidatesSeen) return empty({ usedStory, usedFallback });

  // ------- Score modifiers -------
  for (const c of candidates) {
    c.score = applyScoreModifiers(c);
  }

  // ------- Deduplicate -------
  const deduped = deduplicate(candidates);

  // ------- Resolve spans -------
  const resolved: PriorityHighlightBlock[] = [];
  let spansResolved = 0;

  for (const c of deduped) {
    const spans = resolveBlockSpans(pageText, c.text, c.support, c.evidence, pageParagraphIndex);
    if (!spans.length && !usedFallback) continue; // strict: skip blocks with no span unless fallback
    if (spans.length) spansResolved++;
    resolved.push({
      id: c.id,
      priority: c.priority,
      kind: c.kind,
      source: c.source,
      text: c.text,
      shortLabel: c.shortLabel,
      spans,
      score: c.score,
      confidence: c.confidence,
      evidence: c.evidence.length ? c.evidence : undefined,
      support: c.support.length ? c.support : undefined,
      blockId: c.blockId,
      blockField: c.blockField,
      isMerged: false,
    });
  }

  // ------- Merge adjacent blocks -------
  const merged = mergeAdjacentBlocks(resolved, mergeWindowChars);
  const blocksMerged = resolved.length - merged.length;

  // ------- Bucket into tiers -------
  const mainBlocks = merged.filter((b) => b.priority === "main").slice(0, maxMain);
  const supportBlocks = merged.filter((b) => b.priority === "support").slice(0, maxSupport);
  const weakBlocks = merged.filter((b) => b.priority === "weak").slice(0, maxWeak);

  const all = [...mainBlocks, ...supportBlocks, ...weakBlocks].sort((a, b) => b.score - a.score);

  return {
    pageNumber,
    documentId,
    main: mainBlocks,
    support: supportBlocks,
    weak: weakBlocks,
    all,
    stats: {
      candidatesSeen,
      candidatesAccepted: merged.length,
      blocksMerged,
      spansResolved,
      usedStory,
      usedFallback,
    },
  };
}

// ---------------------------------------------------------------------------
// Story-first candidate builder
// ---------------------------------------------------------------------------

function buildStoryCandidates(
  story: PageStory,
  pageNumber: number,
  paragraphIndex: ParagraphIndexEntry[],
): CandidateBlock[] {
  const candidates: CandidateBlock[] = [];
  const n = pageNumber;

  // ── Main: pattern ──────────────────────────────────────────────────────────
  const patternText = story.patternBlock?.trigger || story.mainIdeaBlock?.text || null;
  if (patternText && isRenderableSentence(patternText)) {
    // Enrich text with paragraph evidence so SmartPDFViewer has more words
    // to match, reducing missed anchors on OCR text.
    const patEvidence = pickBestEvidence(
      story.mainIdeaBlock?.evidence || [],
      patternText,
      paragraphIndex,
    );
    candidates.push({
      id: `pat-${n}`,
      priority: "main",
      kind: "main_pattern",
      source: "story_pattern",
      text: clean(patternText),
      shortLabel: "Important",
      support: compact([story.patternBlock?.context, ...(story.mainIdeaBlock?.support.slice(0, 1) || [])]),
      evidence: patEvidence,
      blockId: "patternBlock",
      blockField: "patternBlock",
      score: story.patternBlock?.trigger ? BASE_KIND_SCORE.main_pattern : BASE_KIND_SCORE.main_pattern - 4,
      confidence: story.confidence,
    });
  }

  // ── Main: mechanism ────────────────────────────────────────────────────────
  // Only emit mechanism if it's clearly distinct from pattern (> 28% different
  // words). If they're near-identical, the pattern block already covers it and
  // emitting both creates duplicate highlights.
  if (story.mechanismBlock?.text && isRenderableSentence(story.mechanismBlock.text)) {
    const patSimilarity = patternText ? textSimilarity(story.mechanismBlock.text, patternText) : 0;
    if (patSimilarity < 0.72) {
      const mechEvidence = pickBestEvidence(story.mechanismBlock.evidence, story.mechanismBlock.text, paragraphIndex);
      candidates.push({
        id: `mech-${n}`,
        priority: "main",
        kind: "main_mechanism",
        source: "story_mechanism",
        text: clean(story.mechanismBlock.text),
        shortLabel: "Important",
        support: story.mechanismBlock.support.slice(0, 3),
        evidence: mechEvidence,
        blockId: "mechanismBlock",
        blockField: "mechanismBlock",
        score: BASE_KIND_SCORE.main_mechanism,
        confidence: story.confidence,
      });
    }
  } else if (story.supportingLogic[0] && isRenderableSentence(story.supportingLogic[0])) {
    // Only use the first supportingLogic entry — don't spread multiple entries
    // into separate candidates; that was the "fake diversity" path.
    const logicSimilarity = patternText ? textSimilarity(story.supportingLogic[0], patternText) : 0;
    if (logicSimilarity < 0.72) {
      candidates.push({
        id: `mech-${n}`,
        priority: "main",
        kind: "main_mechanism",
        source: "story_mechanism",
        text: clean(story.supportingLogic[0]),
        shortLabel: "Important",
        support: [],
        evidence: [],
        score: BASE_KIND_SCORE.main_mechanism - 6,
        confidence: story.confidence * 0.85,
      });
    }
  }

  // ── Support: bottom line ───────────────────────────────────────────────────
  // Use the new bottomLineBlock (distinct irreversible takeaway) as a support
  // block so the insight mode's "read in this order" list has a clear third item.
  if (story.bottomLineBlock?.text && isRenderableSentence(story.bottomLineBlock.text)) {
    const btmSimilarity = patternText ? textSimilarity(story.bottomLineBlock.text, patternText) : 0;
    if (btmSimilarity < 0.65) {
      candidates.push({
        id: `btm-${n}`,
        priority: "support",
        kind: "support_explanation",
        source: "story_pattern",
        text: clean(story.bottomLineBlock.text),
        shortLabel: "Important",
        support: story.bottomLineBlock.support.slice(0, 2),
        evidence: story.bottomLineBlock.evidence.slice(0, 2),
        blockId: "bottomLineBlock",
        blockField: "bottomLineBlock",
        score: BASE_KIND_SCORE.support_explanation + 2,
        confidence: story.confidence * 0.9,
      });
    }
  }

  // ── Support: decision ──────────────────────────────────────────────────────
  if (story.decisionBlock?.action && isRenderableSentence(story.decisionBlock.action)) {
    candidates.push({
      id: `dec-${n}`,
      priority: "support",
      kind: "support_decision",
      source: "story_decision",
      text: clean(story.decisionBlock.action),
      shortLabel: "Support",
      support: story.decisionBlock.nextSteps.slice(0, 2),
      evidence: compact([story.decisionBlock.threshold]),
      blockId: "decisionBlock",
      blockField: "decisionBlock",
      score: BASE_KIND_SCORE.support_decision,
      confidence: story.confidence * 0.9,
    });
  }

  // ── Support: distinction ───────────────────────────────────────────────────
  if (story.distinctionBlock?.text && isRenderableSentence(story.distinctionBlock.text)) {
    candidates.push({
      id: `dist-${n}`,
      priority: "support",
      kind: "support_distinction",
      source: "story_distinction",
      text: clean(story.distinctionBlock.text),
      shortLabel: "Additional",
      support: story.distinctionBlock.support.slice(0, 2),
      evidence: story.distinctionBlock.evidence.slice(0, 2),
      blockId: "distinctionBlock",
      blockField: "distinctionBlock",
      score: BASE_KIND_SCORE.support_distinction,
      confidence: story.confidence * 0.88,
    });
  } else if (story.comparisonSignals[0] && isRenderableSentence(story.comparisonSignals[0])) {
    candidates.push({
      id: `dist-${n}`,
      priority: "support",
      kind: "support_distinction",
      source: "story_distinction",
      text: clean(story.comparisonSignals[0]),
      shortLabel: "Additional",
      support: story.comparisonSignals.slice(1, 3),
      evidence: [],
      score: BASE_KIND_SCORE.support_distinction - 5,
      confidence: story.confidence * 0.8,
    });
  }

  // ── Support: relation ──────────────────────────────────────────────────────
  if (story.relationBlock?.text && isRenderableSentence(story.relationBlock.text)) {
    candidates.push({
      id: `rel-${n}`,
      priority: "support",
      kind: "support_relation",
      source: "story_relation",
      text: clean(story.relationBlock.text),
      shortLabel: "Additional",
      support: story.relationBlock.support.slice(0, 2),
      evidence: story.relationBlock.evidence.slice(0, 2),
      blockId: "relationBlock",
      blockField: "relationBlock",
      score: BASE_KIND_SCORE.support_relation,
      confidence: story.confidence * 0.87,
    });
  } else if (story.relationSignals[0] && isRenderableSentence(story.relationSignals[0])) {
    candidates.push({
      id: `rel-${n}`,
      priority: "support",
      kind: "support_relation",
      source: "story_relation",
      text: clean(story.relationSignals[0]),
      shortLabel: "Additional",
      support: story.relationSignals.slice(1, 3),
      evidence: [],
      score: BASE_KIND_SCORE.support_relation - 5,
      confidence: story.confidence * 0.78,
    });
  }

  // ── Support: application ───────────────────────────────────────────────────
  if (story.applicationBlock?.text && isRenderableSentence(story.applicationBlock.text)) {
    candidates.push({
      id: `app-${n}`,
      priority: "support",
      kind: "support_application",
      source: "story_application",
      text: clean(story.applicationBlock.text),
      shortLabel: "Support",
      support: story.applicationBlock.support.slice(0, 2),
      evidence: story.applicationBlock.evidence.slice(0, 2),
      blockId: "applicationBlock",
      blockField: "applicationBlock",
      score: BASE_KIND_SCORE.support_application,
      confidence: story.confidence * 0.86,
    });
  } else if (story.applySignals[0] && isRenderableSentence(story.applySignals[0])) {
    candidates.push({
      id: `app-${n}`,
      priority: "support",
      kind: "support_application",
      source: "story_application",
      text: clean(story.applySignals[0]),
      shortLabel: "Support",
      support: story.applySignals.slice(1, 3),
      evidence: [],
      score: BASE_KIND_SCORE.support_application - 5,
      confidence: story.confidence * 0.76,
    });
  }

  // ── Trap (elevated to "support" priority) ──────────────────────────────────
  // Traps are semantically important — "weak" hid them below generic support
  // blocks. Now they're "support" priority so they appear in the reading order
  // list and overlay alongside other support blocks with distinct coloring.
  if (story.trapBlock?.trap && isRenderableSentence(story.trapBlock.trap)) {
    candidates.push({
      id: `trap-${n}`,
      priority: "support",   // ← was "weak"
      kind: "trap_warning",
      source: "story_trap",
      text: clean(story.trapBlock.trap),
      shortLabel: "Warning",
      support: compact([story.trapBlock.whyWrong, story.trapBlock.consequence]),
      evidence: compact([story.trapBlock.confusionWith]),
      blockId: "trapBlock",
      blockField: "trapBlock",
      score: BASE_KIND_SCORE.trap_warning,
      confidence: story.confidence * 0.92,
    });
    // Boundary as a weak sub-block (keeps visual separation from the main trap)
    if (story.trapBlock.consequence && isRenderableSentence(story.trapBlock.consequence)) {
      candidates.push({
        id: `bound-${n}`,
        priority: "weak",
        kind: "trap_boundary",
        source: "story_trap",
        text: clean(story.trapBlock.consequence),
        shortLabel: "Warning",
        support: compact([story.trapBlock.whyWrong]),
        evidence: [],
        score: BASE_KIND_SCORE.trap_boundary,
        confidence: story.confidence * 0.82,
      });
    }
  } else if (story.trap?.sentence && isRenderableSentence(story.trap.sentence)) {
    candidates.push({
      id: `trap-${n}`,
      priority: "support",   // ← was "weak"
      kind: "trap_warning",
      source: "story_trap",
      text: clean(story.trap.sentence),
      shortLabel: "Warning",
      support: [],
      evidence: [],
      score: BASE_KIND_SCORE.trap_warning - 6,
      confidence: story.confidence * 0.8,
    });
  } else if (story.trapSignals[0] && isRenderableSentence(story.trapSignals[0])) {
    candidates.push({
      id: `trap-${n}`,
      priority: "weak",      // low-confidence fallback trap stays weak
      kind: "trap_warning",
      source: "story_trap",
      text: clean(story.trapSignals[0]),
      shortLabel: "Warning",
      support: story.trapSignals.slice(1, 3),
      evidence: [],
      score: BASE_KIND_SCORE.trap_warning - 10,
      confidence: story.confidence * 0.72,
    });
  }

  // ── Weak caveat from weakSupport ───────────────────────────────────────────
  for (const wline of story.weakSupport.slice(0, 1)) {
    if (!isRenderableSentence(wline)) continue;
    if (candidates.some((c) => textSimilarity(c.text, wline) > 0.8)) continue;
    candidates.push({
      id: `cav-${n}-${candidates.length}`,
      priority: "weak",
      kind: "weak_caveat",
      source: "story_trap",
      text: clean(wline),
      shortLabel: "Note",
      support: [],
      evidence: [],
      score: BASE_KIND_SCORE.weak_caveat,
      confidence: story.confidence * 0.7,
    });
  }

  return candidates.filter((c) => c.text.length >= 15);
}

// ---------------------------------------------------------------------------
// Paragraph-role map candidate builder
// ---------------------------------------------------------------------------

/**
 * Convert paragraph-role classifications into highlight candidates.
 *
 * Only paragraphs with a meaningful role (not low_value) are added, and only
 * when they are not already covered by an existing story candidate (to avoid
 * duplicate highlights on the same text).  The full paragraph text is used
 * so SmartPDFViewer will anchor the overlay to the whole paragraph block
 * rather than a single sentence.
 */
function buildRoleMapCandidates(
  roleMap: ParagraphRoleBlock[],
  existingCandidates: CandidateBlock[],
  pageNumber: number,
): CandidateBlock[] {
  const added: CandidateBlock[] = [];

  for (const block of roleMap) {
    if (block.role === "low_value") continue;
    if (block.text.length < 40) continue;

    // Check if an existing story candidate already covers this paragraph.
    // "Covers" = the story candidate text appears in the paragraph or vice versa.
    const blockPrefixNorm = block.text.toLowerCase().replace(/[^\w\s]/g, " ").slice(0, 55).trim();
    const alreadyCovered = existingCandidates.some((c) => {
      const cNorm = c.text.toLowerCase().replace(/[^\w\s]/g, " ").slice(0, 55).trim();
      return (
        blockPrefixNorm.includes(cNorm.slice(0, 40)) ||
        cNorm.includes(blockPrefixNorm.slice(0, 40))
      );
    });
    if (alreadyCovered) continue;

    const { kind, priority, score } = roleToKindMapping(block.role);

    added.push({
      id: `role-${block.paragraphIndex}-${pageNumber}`,
      priority,
      kind,
      source: "paragraph_cluster",
      text: block.text,
      shortLabel: shortLabelForRole(block.role),
      support: [],
      evidence: [],
      score,
      confidence: 0.72,
    });
  }

  return added;
}

function roleToKindMapping(role: ParagraphRole): { kind: SemanticHighlightKind; priority: PriorityTier; score: number } {
  switch (role) {
    case "primary_signal":      return { kind: "main_pattern",        priority: "main",    score: BASE_KIND_SCORE.main_pattern - 3 };
    case "trap_warning":        return { kind: "trap_warning",         priority: "support", score: BASE_KIND_SCORE.trap_warning - 3 };
    case "decision_rule":       return { kind: "support_decision",     priority: "support", score: BASE_KIND_SCORE.support_decision - 3 };
    case "support_explanation": return { kind: "support_explanation",  priority: "support", score: BASE_KIND_SCORE.support_explanation - 3 };
    case "support_relation":    return { kind: "support_relation",     priority: "support", score: BASE_KIND_SCORE.support_relation - 3 };
    default:                    return { kind: "weak_caveat",           priority: "weak",    score: BASE_KIND_SCORE.weak_caveat };
  }
}

function shortLabelForRole(role: ParagraphRole): string {
  switch (role) {
    case "primary_signal":      return "Important";
    case "trap_warning":        return "Warning";
    case "decision_rule":       return "Support";
    case "support_explanation": return "Support";
    case "support_relation":    return "Additional";
    default:                    return "Note";
  }
}

// ---------------------------------------------------------------------------
// Paragraph index helpers
// ---------------------------------------------------------------------------

type ParagraphIndexEntry = {
  text: string;
  normText: string;
  start: number;
  end: number;
};

/**
 * Build a character-offset index of paragraphs within `pageText` so that
 * span resolution can try paragraph-level anchoring before falling to
 * sentence-level fuzzy matching.
 */
function buildParagraphIndex(pageText: string, paragraphTexts?: string[]): ParagraphIndexEntry[] {
  if (!pageText) return [];
  const out: ParagraphIndexEntry[] = [];

  // Use caller-provided paragraph splits when available, otherwise split by blank lines
  const rawParas = paragraphTexts?.length
    ? paragraphTexts
    : pageText.split(/\n\s*\n+/).map((p) => p.replace(/\s+/g, " ").trim()).filter((p) => p.length > 30);

  let searchFrom = 0;
  for (const para of rawParas) {
    if (!para) continue;
    const idx = pageText.indexOf(para.slice(0, 40), searchFrom);
    if (idx === -1) {
      // Paragraph not found verbatim — skip (may be a re-normalised version)
      continue;
    }
    const end = Math.min(idx + para.length, pageText.length);
    out.push({ text: para, normText: normalizeForSearch(para), start: idx, end });
    searchFrom = idx + 1;
  }

  return out;
}

/**
 * Pick the best evidence strings for a story block by:
 * 1. Prefer paragraph-aligned evidence (the paragraph that contains the block text)
 * 2. Otherwise return the raw evidence strings from the block
 */
function pickBestEvidence(
  blockEvidence: string[],
  blockText: string,
  paragraphIndex: ParagraphIndexEntry[],
): string[] {
  if (!blockEvidence.length) return [];

  // Try to find the paragraph that contains the block text
  const blockNorm = normalizeForSearch(blockText).slice(0, 50);
  const hostParagraph = paragraphIndex.find((p) => p.normText.includes(blockNorm));
  if (hostParagraph) {
    // Split host paragraph into sentences and return them as evidence
    const sentences = hostParagraph.text
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 20 && s !== blockText);
    if (sentences.length) return sentences.slice(0, 3);
  }

  return blockEvidence.slice(0, 3);
}

// ---------------------------------------------------------------------------
// Fallback candidate builder (no story)
// ---------------------------------------------------------------------------

function buildFallbackCandidates(pageModel: PageInsightModel, _pageClass?: PageContentClass): CandidateBlock[] {
  const candidates: CandidateBlock[] = [];
  const seen = new Set<string>();

  const tryAdd = (text: string, priority: PriorityTier, kind: SemanticHighlightKind, id: string) => {
    const normalized = clean(text);
    if (!normalized || !isRenderableSentence(normalized)) return;
    const key = normalizeForSearch(normalized);
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({
      id,
      priority,
      kind,
      source: "fallback",
      text: normalized,
      shortLabel: shortLabelForKind(kind),
      support: [],
      evidence: [],
      score: BASE_KIND_SCORE[kind] - 15,
      confidence: 0.6,
    });
  };

  // Page summary → main pattern
  if (pageModel.pageSummary) tryAdd(pageModel.pageSummary, "main", "main_pattern", "fb-summary");

  // Paragraph insights → classify by type
  for (const para of (pageModel.paragraphInsights || []).slice(0, 8)) {
    const text = para.summary || para.cleanedText || para.rawText || "";
    const kind = fallbackKindForParagraph(para);
    const priority: PriorityTier = kind === "main_mechanism" || kind === "main_pattern" ? "main" : kind === "trap_warning" ? "weak" : "support";
    tryAdd(text, priority, kind, `fb-para-${para.id}`);
  }

  // Top takeaways → support_explanation
  for (const t of (pageModel.topTakeaways || []).slice(0, 3)) {
    tryAdd(t, "support", "support_explanation", `fb-take-${hashText(t)}`);
  }

  // Decision paths trap → trap_warning
  for (const dp of (pageModel.decisionPaths || []).slice(0, 3)) {
    if (dp.trap) tryAdd(dp.trap, "weak", "trap_warning", `fb-trap-${dp.id}`);
    if (dp.interpretation) tryAdd(dp.interpretation, "support", "support_decision", `fb-dec-${dp.id}`);
  }

  return candidates
    .filter((c) => c.text.length >= 15)
    .sort((a, b) => b.score - a.score);
}

function fallbackKindForParagraph(para: ParagraphInsight): SemanticHighlightKind {
  switch (para.paragraphType) {
    case "cause_effect": return "main_mechanism";
    case "comparison": return "support_distinction";
    case "decision": case "clinical_reasoning": return "support_decision";
    case "process": return "support_explanation";
    case "signal": case "consequence": return "trap_warning";
    default: return "main_pattern";
  }
}

// ---------------------------------------------------------------------------
// Score modifiers
// ---------------------------------------------------------------------------

function applyScoreModifiers(c: CandidateBlock): number {
  let score = c.score;
  const text = c.text.toLowerCase();

  // Evidence richness
  if (c.evidence.length >= 2) score += 8;
  if (c.support.length >= 2) score += 6;

  // Operator language
  if (/\bif\b|\bwhen\b|\bbecause\b|\btherefore\b|\brather than\b|\bavoid\b|\bdo not\b/.test(text)) score += 5;

  // High confidence
  if (c.confidence >= 0.9) score += 4;

  // Boilerplate penalty
  if (/^(this page|this section|in this chapter|as mentioned|as discussed|see below|see above)\b/i.test(text)) score -= 20;

  // Fragmentary penalty
  if (c.text.length < 20) score -= 10;

  return score;
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

function deduplicate(candidates: CandidateBlock[]): CandidateBlock[] {
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const accepted: CandidateBlock[] = [];

  for (const c of sorted) {
    const isDuplicate = accepted.some((a) => {
      if (textSimilarity(a.text, c.text) > 0.86) return true;
      if (a.text.includes(c.text) || c.text.includes(a.text)) return true;
      return false;
    });
    if (!isDuplicate) accepted.push(c);
  }

  return accepted;
}

// ---------------------------------------------------------------------------
// Span resolution
// ---------------------------------------------------------------------------

function resolveBlockSpans(
  pageText: string,
  blockText: string,
  support: string[] = [],
  evidence: string[] = [],
  paragraphIndex: ParagraphIndexEntry[] = [],
): TextSpan[] {
  if (!blockText || !pageText) return [];

  const pageNorm = normalizeForSearch(pageText);
  const blockNorm = normalizeForSearch(blockText);

  // 1. Paragraph-guided match — locate the host paragraph then anchor to the
  //    specific sentence within it (not the full paragraph) so each highlight
  //    covers a meaningful ~2-4 line block rather than an entire paragraph wall.
  if (paragraphIndex.length) {
    const blockPrefix = blockNorm.slice(0, 50);
    const hostParagraph = paragraphIndex.find((p) => p.normText.includes(blockPrefix));
    if (hostParagraph) {
      // Path A: exact raw match of first 40 chars within the paragraph bounds
      const needle = blockText.slice(0, 40);
      const rawIdx = pageText.indexOf(needle, hostParagraph.start);
      if (rawIdx >= hostParagraph.start && rawIdx <= hostParagraph.end) {
        return [{ start: rawIdx, end: Math.min(rawIdx + blockText.length, hostParagraph.end) }];
      }
      // Path B: normalized offset approximation within the paragraph
      const normOffset = hostParagraph.normText.indexOf(blockNorm.slice(0, 40));
      if (normOffset >= 0) {
        const approxStart = hostParagraph.start + normOffset;
        return [{ start: approxStart, end: Math.min(approxStart + blockText.length, hostParagraph.end) }];
      }
      // Path C: paragraph found but offsets unclear — use first sentence-length
      // chunk of the paragraph (avoids covering the entire wall of text).
      const sentenceEnd = Math.min(
        hostParagraph.start + Math.max(blockText.length, 180),
        hostParagraph.end,
      );
      return [{ start: hostParagraph.start, end: sentenceEnd }];
    }
  }

  // 2. Exact normalized match
  const exactIdx = pageNorm.indexOf(blockNorm);
  if (exactIdx !== -1) {
    return [{ start: exactIdx, end: exactIdx + blockNorm.length }];
  }

  // 3. Prefix match (first 60 normalized chars)
  const prefix = blockNorm.slice(0, 60).trim();
  if (prefix.length >= 20) {
    const prefixIdx = pageNorm.indexOf(prefix);
    if (prefixIdx !== -1) {
      return [{ start: prefixIdx, end: Math.min(prefixIdx + blockNorm.length, pageText.length) }];
    }
  }

  // 4. Best-sentence fuzzy match (word overlap)
  const blockWords = new Set(blockNorm.split(/\s+/).filter((w) => w.length > 3));
  if (blockWords.size >= 3) {
    const sentences = splitSentences(pageText);
    let bestScore = 0;
    let bestSpan: TextSpan | null = null;

    for (const { start, end, text: sent } of sentences) {
      const sentWords = new Set(normalizeForSearch(sent).split(/\s+/).filter((w) => w.length > 3));
      let overlap = 0;
      for (const w of blockWords) {
        if (sentWords.has(w)) overlap++;
      }
      const score = overlap / blockWords.size;
      if (score > bestScore && score >= 0.5) {
        bestScore = score;
        bestSpan = { start, end };
      }
    }

    if (bestSpan) return [bestSpan];
  }

  // 5. Support / evidence fallback — try evidence strings (may include full
  //    paragraph text from processPage's cleanedText), then support strings.
  for (const fallback of [...evidence, ...support]) {
    if (!fallback || fallback.length < 15) continue;
    const fallbackNorm = normalizeForSearch(fallback).slice(0, 50);
    const idx = pageNorm.indexOf(fallbackNorm);
    if (idx !== -1) {
      return [{ start: idx, end: Math.min(idx + fallback.length, pageText.length) }];
    }
  }

  return [];
}

function splitSentences(text: string): Array<{ text: string; start: number; end: number }> {
  const results: Array<{ text: string; start: number; end: number }> = [];
  const re = /[^.!?]+[.!?]*/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const sent = match[0].trim();
    if (sent.length >= 20) results.push({ text: sent, start: match.index, end: match.index + match[0].length });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Merge adjacent blocks
// ---------------------------------------------------------------------------

const ALLOWED_MERGE_PAIRS: Partial<Record<SemanticHighlightKind, SemanticHighlightKind[]>> = {
  main_pattern: ["main_mechanism"],
  main_mechanism: ["main_pattern"],
  support_explanation: ["support_decision"],
  support_decision: ["support_explanation"],
  support_distinction: ["support_relation"],
  support_relation: ["support_distinction"],
};

function mergeAdjacentBlocks(blocks: PriorityHighlightBlock[], windowChars: number): PriorityHighlightBlock[] {
  const out: PriorityHighlightBlock[] = [];
  const used = new Set<string>();

  for (let i = 0; i < blocks.length; i++) {
    if (used.has(blocks[i].id)) continue;
    const current = blocks[i];
    let merged = false;

    for (let j = i + 1; j < blocks.length; j++) {
      if (used.has(blocks[j].id)) continue;
      const next = blocks[j];

      if (!canMerge(current, next, windowChars)) continue;

      // Merge: combine text and spans
      used.add(current.id);
      used.add(next.id);
      const combinedBlock: PriorityHighlightBlock = {
        id: `${current.id}+${next.id}`,
        priority: current.priority,
        kind: current.kind,
        source: current.source,
        text: cleanSentence(`${current.text} ${next.text}`),
        shortLabel: current.shortLabel,
        spans: [...current.spans, ...next.spans].sort((a, b) => a.start - b.start),
        score: Math.max(current.score, next.score) + 4,
        confidence: (current.confidence + next.confidence) / 2,
        evidence: [...(current.evidence || []), ...(next.evidence || [])],
        support: [...(current.support || []), ...(next.support || [])],
        blockId: current.blockId,
        blockField: current.blockField,
        isMerged: true,
      };
      out.push(combinedBlock);
      merged = true;
      break;
    }

    if (!merged && !used.has(current.id)) {
      used.add(current.id);
      out.push(current);
    }
  }

  return out;
}

function canMerge(a: PriorityHighlightBlock, b: PriorityHighlightBlock, windowChars: number): boolean {
  if (a.priority !== b.priority) return false;
  // Trap never merges
  if (a.kind === "trap_warning" || a.kind === "trap_boundary" || b.kind === "trap_warning" || b.kind === "trap_boundary") return false;
  // Must be an allowed pair
  const allowedForA = ALLOWED_MERGE_PAIRS[a.kind] || [];
  if (!allowedForA.includes(b.kind)) return false;
  // Spans must be near-adjacent
  if (!a.spans.length || !b.spans.length) return false;
  const aEnd = Math.max(...a.spans.map((s) => s.end));
  const bStart = Math.min(...b.spans.map((s) => s.start));
  return Math.abs(bStart - aEnd) <= windowChars;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function clean(text: string): string {
  return cleanSentence((text || "").replace(/\s+/g, " ").trim());
}

function compact(items: Array<string | null | undefined>): string[] {
  return items.filter((s): s is string => Boolean(s) && s.length > 0);
}

function normalizeForSearch(text: string): string {
  // Keep aligned with SmartPDFViewer span normalization so prefix matching
  // succeeds across the extraction→viewer boundary.
  return text.toLowerCase().replace(/\u00ad/g, "").replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

function textSimilarity(a: string, b: string): number {
  const aNorm = normalizeForSearch(a);
  const bNorm = normalizeForSearch(b);
  const aWords = new Set(aNorm.split(/\s+/).filter((w) => w.length > 2));
  const bWords = new Set(bNorm.split(/\s+/).filter((w) => w.length > 2));
  if (!aWords.size || !bWords.size) return 0;
  let shared = 0;
  for (const w of aWords) {
    if (bWords.has(w)) shared++;
  }
  return shared / Math.max(aWords.size, bWords.size);
}

function shortLabelForKind(kind: SemanticHighlightKind): string {
  switch (kind) {
    case "main_pattern": return "Important";
    case "main_mechanism": return "Important";
    case "support_explanation": return "Support";
    case "support_distinction": return "Additional";
    case "support_relation": return "Additional";
    case "support_decision": return "Support";
    case "support_application": return "Support";
    case "trap_warning": return "Warning";
    case "trap_boundary": return "Warning";
    case "weak_caveat": return "Note";
  }
}

function hashText(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash.toString(36);
}
