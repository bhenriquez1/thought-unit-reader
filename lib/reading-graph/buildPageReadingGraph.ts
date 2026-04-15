// lib/reading-graph/buildPageReadingGraph.ts
//
// Builds one page-level reading graph — single source of truth for:
//   - right panel narrative
//   - left panel priority highlights
//   - grounded fallback support
//   - shadow recall
//   - TOC anchors
//   - truth gating
//
// This starter file adapts existing pipeline functions without requiring a
// full rewrite of the underlying layers. Replace bridge adapters one-by-one
// as downstream implementations strengthen.

import { processPage } from "@/lib/insights/processPage";
import {
  classifyPageContent,
  type PageContentClass as LegacyPageContentClass,
} from "@/lib/pdf/classifyPageContent";
import {
  evaluatePageTruth,
  type PageTruthGateResult,
} from "@/lib/insights/evaluatePageTruth";
import {
  buildNarrativePageView,
  type NarrativeBuildResult,
} from "@/lib/insights/buildNarrativePageView";
import { buildGroundedSupportView } from "@/lib/insights/buildGroundedSupportView";
import {
  buildShadowRecall,
  type ShadowRecallModel as LegacyShadowRecallModel,
} from "@/lib/insights/buildShadowRecall";
import {
  extractPriorityHighlights,
  type ExtractPriorityHighlightsResult,
  type PriorityHighlightBlock,
} from "@/lib/highlights/extractPriorityHighlights";

import type { PageInsightModel, ParagraphInsight } from "@/lib/insights/types";
import type { NarrativeSection as LegacyNarrativeSection } from "@/lib/insights/materializeNarrativeSupport";

import type {
  PageReadingGraph,
  ReadingGraphMeta,
  PageTruth,
  TruthBlockReason,
  PageContentClass,
  NarrativePageView,
  NarrativeSection,
  NarrativeSectionKind,
  PriorityHighlight,
  PriorityHighlightSet,
  ShadowRecallModel,
  ShadowRecallAnswerKey,
  ShadowRecallPrompt,
  GroundedSupportView,
  ReadingGraphStatus,
  ReadingGraphHeading,
  ReadingGraphBlock,
  ReadingGraphSentence,
  ReadingGraphDiagnostics,
  EvidenceAnchor,
  SupportNeighborhood,
  TocPageAnchor,
} from "./types";

// ---------------------------------------------------------------------------
// Public contract
// ---------------------------------------------------------------------------

export interface BuildPageReadingGraphInput {
  documentId: string;
  pageNumber: number;
  pageIndex: number;
  rawPageText: string;
  requestKey: string;
  pageItems?: unknown[];
  pageRects?: unknown[];
  nativeOutlinePath?: string[];
  documentVersion?: string;
  parserVersion?: string;
  datFlag?: boolean;
}

export interface BuildPageReadingGraphResult {
  graph: PageReadingGraph;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function hashText(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return String(hash >>> 0);
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function makeMeta(input: BuildPageReadingGraphInput): ReadingGraphMeta {
  return {
    documentId: input.documentId,
    documentVersion: input.documentVersion,
    pageNumber: input.pageNumber,
    pageIndex: input.pageIndex,
    pageTextHash: hashText(input.rawPageText ?? ""),
    requestKey: input.requestKey,
    builtAt: nowIso(),
    parserVersion: input.parserVersion ?? "page-reading-graph-v1",
    source: "semantic_reconstruction",
  };
}

function buildEmptyTruth(): PageTruth {
  return {
    isCurrentPage: true,
    isRenderable: false,
    blockReason: "loading",
    groundedSentenceCount: 0,
    renderableSentenceCount: 0,
    proseDensity: 0,
    confidence: 0,
  };
}

function buildEmptyNarrative(): NarrativePageView {
  return { pageSummary: "", storyTitle: "", sections: [] };
}

function buildEmptyHighlights(): PriorityHighlightSet {
  return { main: [], support: [], weak: [], warning: [], all: [] };
}

function inferStatus(truth: PageTruth, hasError: boolean): ReadingGraphStatus {
  if (hasError) return "error";
  if (!truth.isRenderable) return "blocked";
  return "ready";
}

// ---------------------------------------------------------------------------
// Type bridges: convert legacy pipeline types to graph types
// ---------------------------------------------------------------------------

const TRUTH_REASON_MAP: Record<string, TruthBlockReason> = {
  loading: "loading",
  stale_page: "stale_page",
  book_changed: "book_changed",
  insufficient_prose: "insufficient_prose",
  image_only: "image_only",
  form_page: "form_page",
  table_heavy: "table_heavy",
  fragment_only: "fragment_only",
  failed_extraction: "error",
  front_matter: "front_matter",
};

function bridgeTruth(gate: PageTruthGateResult): PageTruth {
  return {
    isCurrentPage: true,
    isRenderable: gate.canRenderRightPanel,
    blockReason:
      gate.reason === "ok"
        ? undefined
        : (TRUTH_REASON_MAP[gate.reason] ?? "error"),
    groundedSentenceCount: 0,
    renderableSentenceCount: 0,
    proseDensity: 0,
    confidence: gate.confidence,
  };
}

// Existing classifyPageContent returns a slightly different enum; map to graph type.
const CLASS_MAP: Record<LegacyPageContentClass, PageContentClass> = {
  prose: "prose",
  prose_with_headings: "prose",
  form_page: "form_page",
  table_heavy: "table_heavy",
  image_only: "image_only",
  mixed_visual: "mixed_visual",
  sparse_text: "sparse_text",
  failed_sparse: "sparse_text",
  copyright_frontmatter: "copyright_frontmatter",
};

function bridgePageClass(legacy: LegacyPageContentClass): PageContentClass {
  return CLASS_MAP[legacy] ?? "sparse_text";
}

const SECTION_KIND_MAP: Record<string, NarrativeSectionKind> = {
  main_signal: "main_signal",
  rule: "rule",
  trap: "trap",
  grounded_support: "support_cluster",
};

function bridgeNarrativeSection(
  old: LegacyNarrativeSection,
  order: number
): NarrativeSection {
  return {
    id: `section-${old.key}-${order}`,
    kind: SECTION_KIND_MAP[old.key] ?? "support_cluster",
    order,
    title: old.title,
    anchorSentenceId: old.evidenceIds[0] ?? "",
    primaryText: old.lead,
    supportingText: old.support,
    weakSupportText: [],
    sentenceIds: old.evidenceIds,
    evidenceAnchorIds: old.evidenceIds,
    score: Math.max(0.4, 1.0 - order * 0.15),
    confidence: 0.8,
  };
}

function bridgeNarrative(
  result: NarrativeBuildResult,
  pageTitle: string
): NarrativePageView {
  const sections = result.narrative.sections.map((s, i) =>
    bridgeNarrativeSection(s, i)
  );
  const byKind = (kind: NarrativeSectionKind) =>
    sections.find((s) => s.kind === kind);

  return {
    pageSummary: pageTitle,
    storyTitle: pageTitle,
    sections,
    mainSignal: byKind("main_signal"),
    rule: byKind("rule"),
    trap: byKind("trap"),
  };
}

function normalizeHighlightText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bridgeHighlightBlock(
  block: PriorityHighlightBlock,
  pageNumber: number
): PriorityHighlight {
  const kind =
    block.priority === "main"
      ? ("main_signal" as const)
      : block.priority === "support"
        ? ("support" as const)
        : ("weak_support" as const);

  return {
    id: block.id,
    priority: block.priority,
    pageNumber,
    blockId: block.blockId,
    text: block.text,
    normalizedText: normalizeHighlightText(block.text),
    rects: [],
    score: block.score,
    confidence: block.confidence,
    sectionPath: [],
    kind,
  };
}

function bridgeHighlightSet(
  result: ExtractPriorityHighlightsResult,
  pageNumber: number
): PriorityHighlightSet {
  const main = result.main.map((b) => bridgeHighlightBlock(b, pageNumber));
  const support = result.support.map((b) => bridgeHighlightBlock(b, pageNumber));
  const weak = result.weak.map((b) => bridgeHighlightBlock(b, pageNumber));

  return {
    main,
    support,
    weak,
    warning: [],
    all: [...main, ...support, ...weak],
  };
}

function bridgeShadowRecall(
  old: LegacyShadowRecallModel
): ShadowRecallModel {
  const prompts: ShadowRecallPrompt[] = [];

  if (old.prompts.keyConcept) {
    prompts.push({
      id: "key_concept",
      kind: "key_concept",
      prompt: old.prompts.keyConcept,
      expectedSentenceIds: [],
      expectedAnswer: old.reveal.keyConceptTruth,
      rubric: [old.reveal.keyConceptTruth].filter(Boolean),
    });
  }
  if (old.prompts.mechanism) {
    prompts.push({
      id: "mechanism",
      kind: "mechanism",
      prompt: old.prompts.mechanism,
      expectedSentenceIds: [],
      expectedAnswer: old.reveal.mechanismTruth,
      rubric: [old.reveal.mechanismTruth].filter(Boolean),
    });
  }
  if (old.prompts.distinction) {
    prompts.push({
      id: "distinction",
      kind: "distinction",
      prompt: old.prompts.distinction,
      expectedSentenceIds: [],
      expectedAnswer: old.reveal.distinctionTruth,
      rubric: [old.reveal.distinctionTruth].filter(Boolean),
    });
  }
  if (old.prompts.testPoint) {
    prompts.push({
      id: "testable_rule",
      kind: "testable_rule",
      prompt: old.prompts.testPoint,
      expectedSentenceIds: [],
      expectedAnswer: old.reveal.testPointTruth,
      rubric: [old.reveal.testPointTruth].filter(Boolean),
    });
  }
  if (old.prompts.studentTrap) {
    prompts.push({
      id: "trap",
      kind: "trap",
      prompt: old.prompts.studentTrap,
      expectedSentenceIds: [],
      expectedAnswer: old.reveal.studentTrapTruth,
      rubric: [old.reveal.studentTrapTruth].filter(Boolean),
    });
  }

  return {
    pageLabel: old.pageLabel,
    prompts,
    answerKey: {
      keyConcept: old.reveal.keyConceptTruth,
      mechanism: old.reveal.mechanismTruth || undefined,
      distinction: old.reveal.distinctionTruth || undefined,
      testableRule: old.reveal.testPointTruth || undefined,
      trap: old.reveal.studentTrapTruth || undefined,
    } satisfies ShadowRecallAnswerKey,
    fastRecallCues: old.reveal.fastRecallCues ?? [],
  };
}

// ---------------------------------------------------------------------------
// Candidate adapter: PageInsightModel → SentenceCandidate[]
// Mirrors the same logic used in useActivePageIntelligence.ts.
// ---------------------------------------------------------------------------

type RawCandidate = {
  id: string;
  text: string;
  cleanedText: string;
  normalizedText: string;
  pageNumber: number;
  paragraphId: string;
  sentenceIndex: number;
  paragraphIndex: number;
  roleHints: Record<string, boolean>;
  scores: Record<string, number>;
};

function buildCandidatesFromPageModel(
  pageModel: PageInsightModel,
  pageNumber: number
): RawCandidate[] {
  const candidates: RawCandidate[] = [];

  for (let paragraphIndex = 0; paragraphIndex < pageModel.paragraphInsights.length; paragraphIndex += 1) {
    const p = pageModel.paragraphInsights[paragraphIndex];
    const texts = [
      (p as any).meaning,
      p.summary,
      (p as any).takeaway,
      (p as any).text,
    ].filter((t): t is string => Boolean(t));

    for (let sentenceIndex = 0; sentenceIndex < texts.length; sentenceIndex += 1) {
      const text = texts[sentenceIndex];
      candidates.push({
        id: `${p.id ?? `p-${paragraphIndex}`}-s-${sentenceIndex}`,
        text,
        cleanedText: text,
        normalizedText: text,
        pageNumber,
        paragraphId: p.id ?? `p-${paragraphIndex}`,
        sentenceIndex,
        paragraphIndex,
        roleHints: {
          isDefinition: /defined as|refers to|is called|means/i.test(text),
          isMechanism: /because|mechanism|drives|through|via|causes/i.test(text),
          isCause: /because|causes|leads to|results in/i.test(text),
          isEffect: /results in|therefore|thus|leads to/i.test(text),
          isContrast: /however|whereas|unlike|in contrast|versus|vs\./i.test(text),
          isWarning: /avoid|trap|mistake|wrong|pitfall|do not/i.test(text),
          isAction: /should|must|use|apply|identify|consider|remember/i.test(text),
          isExample: /for example|for instance|e\.g\./i.test(text),
          isEvidence: /because|this means|therefore|thus/i.test(text),
          isSummaryLike: sentenceIndex === 0,
        },
        scores: {
          salience: p.priorityScore ?? 0.5,
          instructional: /should|must|identify|compare|apply|diagnosis|rule/i.test(text) ? 0.8 : 0.35,
          actionability: /should|must|use|apply|remember|avoid/i.test(text) ? 0.8 : 0.25,
          warning: /avoid|trap|mistake|wrong|pitfall|do not/i.test(text) ? 0.85 : 0.1,
          supportStrength: /because|therefore|results in|means|explains/i.test(text) ? 0.8 : 0.35,
          centrality: sentenceIndex === 0 ? 0.8 : 0.45,
        },
      });
    }
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

function buildDiagnostics(params: {
  rawPageText: string;
  cleanedText: string;
  sentences: ReadingGraphSentence[];
  neighborhoods: SupportNeighborhood[];
  priorityHighlights: PriorityHighlightSet;
  notes: string[];
}): ReadingGraphDiagnostics {
  return {
    rawTextLength: params.rawPageText.length,
    cleanedTextLength: params.cleanedText.length,
    headingCount: 0,
    blockCount: 0,
    sentenceCount: params.sentences.length,
    renderableSentenceCount: params.sentences.filter((s) => s.isRenderable).length,
    boilerplateSentenceCount: params.sentences.filter((s) => s.isBoilerplate).length,
    fragmentSentenceCount: params.sentences.filter((s) => s.isFragment).length,
    neighborhoodCount: params.neighborhoods.length,
    highlightCount: params.priorityHighlights.all.length,
    notes: params.notes,
  };
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export function buildPageReadingGraph(
  input: BuildPageReadingGraphInput
): BuildPageReadingGraphResult {
  const meta = makeMeta(input);
  const rawPageText = input.rawPageText ?? "";
  const cleanedPageText = normalizeText(rawPageText);

  const errors: string[] = [];
  const notes: string[] = [];

  let pageClass: PageContentClass = "sparse_text";
  let truth: PageTruth = buildEmptyTruth();
  let narrative: NarrativePageView = buildEmptyNarrative();
  let groundedSupport: GroundedSupportView | undefined;
  let shadowRecall: ShadowRecallModel | undefined;
  let priorityHighlights: PriorityHighlightSet = buildEmptyHighlights();

  const headings: ReadingGraphHeading[] = [];
  const blocks: ReadingGraphBlock[] = [];
  const sentences: ReadingGraphSentence[] = [];
  const anchors: EvidenceAnchor[] = [];
  const supportNeighborhoods: SupportNeighborhood[] = [];
  const tocAnchors: TocPageAnchor[] = [];

  try {
    // 1. Classify the page
    const legacyClass = classifyPageContent(rawPageText);
    pageClass = bridgePageClass(legacyClass);

    // 2. Build page insight model
    const pageModel = processPage(rawPageText, input.datFlag);

    // 3. Evaluate page truth
    const gate = evaluatePageTruth({
      visibleDocumentId: input.documentId,
      sourceDocumentId: input.documentId,
      visiblePageNumber: input.pageNumber,
      sourcePageNumber: input.pageNumber,
      parseReady: true,
      contentClass: legacyClass,
      pageModel,
      visiblePageText: rawPageText,
    });
    truth = bridgeTruth(gate);

    if (truth.isRenderable) {
      // 4. Build narrative from sentence candidates
      const candidates = buildCandidatesFromPageModel(pageModel, input.pageNumber);
      if (candidates.length > 0) {
        const narrativeResult = buildNarrativePageView({
          candidates: candidates as any,
          pageNumber: input.pageNumber,
          pageTitle: pageModel.pageSummary,
          maxSupportPerSection: 3,
        });
        narrative = bridgeNarrative(narrativeResult, pageModel.pageSummary ?? "");
      }

      // 5. Build grounded support fallback
      groundedSupport = buildGroundedSupportView(pageModel);

      // 6. Build shadow recall (uses legacy storyV3; pass null if unavailable)
      const legacyRecall = buildShadowRecall(pageModel, null as any);
      if (legacyRecall) {
        shadowRecall = bridgeShadowRecall(legacyRecall);
      }

      // 7. Build priority highlights
      const highlightResult = extractPriorityHighlights({
        documentId: input.documentId,
        pageNumber: input.pageNumber,
        pageText: rawPageText,
        pageClass: legacyClass,
        pageModel,
        pageStory: pageModel.pageStory ?? null,
      });
      priorityHighlights = bridgeHighlightSet(highlightResult, input.pageNumber);
    }

    if (!truth.isRenderable) {
      notes.push(`Page blocked: ${truth.blockReason ?? "unknown"}`);
    }
    if (pageClass !== "prose") {
      notes.push(`Page class: ${pageClass}`);
    }
    if (priorityHighlights.main.length === 0 && truth.isRenderable) {
      notes.push("No main priority highlights were extracted.");
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown page graph error";
    errors.push(message);
  }

  const status = inferStatus(truth, errors.length > 0);

  const graph: PageReadingGraph = {
    schemaVersion: "1.0.0",
    meta,
    status,
    pageClass,
    truth,
    headings,
    blocks,
    sentences,
    anchors,
    supportNeighborhoods,
    narrative,
    groundedSupport,
    shadowRecall,
    priorityHighlights,
    tocAnchors,
    diagnostics: buildDiagnostics({
      rawPageText,
      cleanedText: cleanedPageText,
      sentences,
      neighborhoods: supportNeighborhoods,
      priorityHighlights,
      notes,
    }),
    errors: errors.length > 0 ? errors : undefined,
  };

  return { graph };
}
