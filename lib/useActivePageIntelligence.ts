import { useEffect, useMemo, useRef, useState } from "react";
import type { ActivePageContext, AudienceMode, DepthMode, HighlightTarget } from "@/lib/readerContracts";
import { extractPageSignals } from "@/lib/right-panel/extractPageSignals";
import { classifyPage } from "@/lib/right-panel/classifyPage";
import { buildResolvedPanelPayload } from "@/lib/panelEngine";
import { buildModeProfile } from "@/lib/right-panel/modeProfile";
import { deriveHighlightTargets } from "@/lib/highlightMapping";
import { processPage } from "@/lib/insights/processPage";
import { classifyPageContent, type PageContentClass } from "@/lib/pdf/classifyPageContent";
import { extractPriorityHighlights, type ExtractPriorityHighlightsResult } from "@/lib/highlights/extractPriorityHighlights";
import { buildHighlightNeighborhoods, flattenNeighborhoods, type HighlightNeighborhood } from "@/lib/highlights/buildHighlightNeighborhoods";
import { adaptPageInsightModel, isValidCoreParagraph } from "@/lib/insights/buildUltraPageView";
import { extractConceptBlocks as extractConceptBlocksCore } from "@/lib/insights/extractConceptBlocks";
import { buildParagraphRoleMap } from "@/lib/highlights/paragraphRoleMap";
import { buildPageStoryV2, type PageStoryV2 } from "@/lib/insights/buildPageStoryV2";
import { buildPageStoryV3, type PageStoryV3 } from "@/lib/insights/buildPageStoryV3";
import { buildNarrativePageView, type NarrativeBuildResult } from "@/lib/insights/buildNarrativePageView";
import type { NarrativePageView as LegacyNarrativeView, SectionOutput } from "@/lib/insights/types";
import { evaluatePageTruth, type PageTruthGateResult } from "@/lib/insights/evaluatePageTruth";
import { buildPageStory } from "@/lib/insights/buildPageStory";
import type { PageInsightModel } from "@/lib/insights/types";
import type { PageStory } from "@/lib/insights/buildPageStory";
import { normalizeClinicalText, type ClinicalNormalizationResult } from "@/lib/normalization/normalizeClinicalText";
import { findMainTeachingZone } from "@/lib/insights/findMainTeachingZone";

export type ActivePageIntelligenceStatus = "idle" | "loading" | "ready" | "error";

export type FormulaSignal = {
  kind: "equation" | "expression" | "reaction" | "symbolic_definition" | "graph_reference" | "table_reference";
  text: string;
  confidence: number;
};

export type ActivePageIntelligenceSnapshot = {
  status: ActivePageIntelligenceStatus;
  pageTruthKey: string;
  isCurrentPage: boolean;
  pageClass: PageContentClass | null;
  pageTruth: PageTruthGateResult | null;
  pageModel: PageInsightModel | null;
  story: PageStory | null;
  storyV2: PageStoryV2 | null;
  storyV3: PageStoryV3 | null;
  priorityHighlights: ExtractPriorityHighlightsResult;
  normResult: ClinicalNormalizationResult | null;
};

interface UseActivePageIntelligenceArgs {
  documentId: string;
  pageNumber: number;
  ctx: ActivePageContext;
  audience: AudienceMode;
  depth: DepthMode;
}

function hashText(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  return String(hash);
}

function buildPageTruthKey(documentId: string, pageNumber: number, pageText: string): string {
  return `${documentId}::${pageNumber}::${hashText(pageText || "")}`;
}

function extractFormulaSignals(rawText: string): FormulaSignal[] {
  if (!rawText) return [];
  const lines = rawText.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const out: FormulaSignal[] = [];

  const eqPattern = /([A-Za-z0-9)\]]\s*=\s*[A-Za-z0-9([\-+*/^]|[0-9A-Za-z].*[=<>≤≥])/;
  const chemPattern = /([A-Z][a-z]?\d*[\+\-]?(?:\s*\+\s*[A-Z][a-z]?\d*[\+\-]?)*\s*(?:->|→|⇌)\s*[A-Z][a-z]?\d*[\+\-]?)/;
  const graphPattern = /\b(graph|figure|plot|curve|parabola|slope|intercept)\b/i;
  const tablePattern = /\b(table|values|data set|distribution)\b/i;
  const symbolicPattern = /\b(let|define|denote|where|given by|represented by)\b/i;

  for (const line of lines) {
    if (eqPattern.test(line)) {
      out.push({ kind: "equation", text: line, confidence: 0.95 });
      continue;
    }
    if (chemPattern.test(line)) {
      out.push({ kind: "reaction", text: line, confidence: 0.95 });
      continue;
    }
    if (graphPattern.test(line)) {
      out.push({ kind: "graph_reference", text: line, confidence: 0.75 });
      continue;
    }
    if (tablePattern.test(line)) {
      out.push({ kind: "table_reference", text: line, confidence: 0.7 });
      continue;
    }
    if (symbolicPattern.test(line) && /[A-Za-z]\([A-Za-z]\)|[xyznrt]=|f\(x\)|[=]/.test(line)) {
      out.push({ kind: "symbolic_definition", text: line, confidence: 0.72 });
    }
  }

  const seen = new Set<string>();
  return out.filter((item) => {
    const key = `${item.kind}::${item.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 12);
}

function pickStoryMode(pageClass: PageContentClass, formulaCount: number) {
  if (pageClass === "table_heavy") return "relation" as const;
  if (pageClass === "form_page") return "apply" as const;
  if ((pageClass === "mixed_visual" || pageClass === "sparse_text" || pageClass === "failed_sparse") && formulaCount > 0) return "explain" as const;
  return "insight" as const;
}

export function useActivePageIntelligence({
  documentId,
  pageNumber,
  ctx,
  audience,
  depth,
}: UseActivePageIntelligenceArgs) {
  const mode = useMemo(() => buildModeProfile(audience, depth), [audience, depth]);
  const payloadKey = `${documentId}:${pageNumber}:${audience}:${depth}`;
  const pageTruthKey = useMemo(() => buildPageTruthKey(documentId, pageNumber, ctx.pageText || ""), [ctx.pageText, documentId, pageNumber]);

  const [status, setStatus] = useState<ActivePageIntelligenceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [signals, setSignals] = useState(() => extractPageSignals(ctx, {
    minYield: 1,
    minSignals: 2,
    maxSignals: 8,
  }));
  const [classification, setClassification] = useState(() => classifyPage(signals));
  const [panelPayloads, setPanelPayloads] = useState(() => buildResolvedPanelPayload(ctx, classifyPage(signals), signals, audience, depth));
  const [pageModel, setPageModel] = useState<PageInsightModel | null>(null);
  const [pageStory, setPageStory] = useState<PageStory | null>(null);
  const [pageStoryV2, setPageStoryV2] = useState<PageStoryV2 | null>(null);
  const [pageStoryV3, setPageStoryV3] = useState<PageStoryV3 | null>(null);
  const [pageClass, setPageClass] = useState<PageContentClass | null>(null);
  const [pageTruth, setPageTruth] = useState<PageTruthGateResult | null>(null);
  const [formulaSignals, setFormulaSignals] = useState<FormulaSignal[]>([]);
  const [priorityHighlights, setPriorityHighlights] = useState<ExtractPriorityHighlightsResult>({ pageNumber, main: [], support: [], weak: [], all: [], stats: { candidatesSeen: 0, candidatesAccepted: 0, blocksMerged: 0, spansResolved: 0, usedStory: false, usedFallback: false } });
  const [normResult, setNormResult] = useState<ClinicalNormalizationResult | null>(null);
  const latestRequestRef = useRef<string>("");
  // Always holds the latest ctx so the page-processing effect reads current
  // values without ctx itself being a dependency (avoids spurious re-runs
  // when nearbyText / activeTopicTitle update on the same page).
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  // currentPageRef is updated synchronously at render time — BEFORE any effects
  // fire. This means it always reflects the page that React is currently rendering,
  // even in the window between when a new page triggers a re-render and when the
  // new page's primary effect actually runs. The commit stale check uses this ref
  // instead of latestRequestRef (which is updated inside the effect) to prevent
  // page N-1's microtask from committing results after page N has already started.
  const currentPageRef = useRef({ documentId, pageNumber, pageTruthKey });
  currentPageRef.current = { documentId, pageNumber, pageTruthKey };

  // Primary effect: fires only when the page identity changes (documentId,
  // pageNumber, or pageText hash). Does NOT re-run when nearbyText or other
  // auxiliary ctx fields update.
  useEffect(() => {
    const requestKey = pageTruthKey;
    latestRequestRef.current = requestKey;
    const snapshot = ctxRef.current;

    // Synchronous reset — clear all stale state before async work begins
    const freshSignals = extractPageSignals(snapshot, { minYield: 1, minSignals: 2, maxSignals: 8 });
    const freshClassification = classifyPage(freshSignals);
    setSignals(freshSignals);
    setClassification(freshClassification);
    setPanelPayloads(buildResolvedPanelPayload(snapshot, freshClassification, freshSignals, audience, depth));
    setStatus("loading");
    setError(null);
    setPageModel(null);
    setPageStory(null);
    setPageStoryV2(null);
    setPageStoryV3(null);
    setPageClass(null);
    setPageTruth(null);
    setFormulaSignals([]);
    setPriorityHighlights({ pageNumber, main: [], support: [], weak: [], all: [], stats: { candidatesSeen: 0, candidatesAccepted: 0, blocksMerged: 0, spansResolved: 0, usedStory: false, usedFallback: false } });
    setNormResult(null);

    Promise.resolve().then(() => {
      if (latestRequestRef.current !== requestKey) return;

      const localSignals = extractPageSignals(snapshot, {
        minYield: 1,
        minSignals: 2,
        maxSignals: 8,
      });
      const localClassification = classifyPage(localSignals);
      const localPayloads = buildResolvedPanelPayload(snapshot, localClassification, localSignals, audience, depth);
      const rawPageClass = classifyPageContent(snapshot.pageText || "");
      const localFormulaSignals = extractFormulaSignals(snapshot.pageText || "");
      const localPageClass: PageContentClass =
        localFormulaSignals.length >= 2 && (rawPageClass === "sparse_text" || rawPageClass === "failed_sparse")
          ? "mixed_visual"
          : rawPageClass;
      const parsedModel = processPage(snapshot.pageText || "");
      const localPageModel: PageInsightModel = {
        ...parsedModel,
        documentId,
        pageNumber,
        requestKey,
      };

      // Normalization gate — computed once per page change, shared by both highlight
      // and right-panel pipelines so suppression is consistent and early.
      const normHeadingLines = (snapshot.pageText || "")
        .split(/\n+/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && l.length < 90 && !/[.!?]$/.test(l))
        .slice(0, 6);
      const localNormResult = normalizeClinicalText({
        pageText: snapshot.pageText || "",
        pageTitle: localPageModel.pageSummary ?? undefined,
        pageNumber,
        headingLines: normHeadingLines,
      });

      const localPageStory = localPageModel.pageStory || buildPageStory({
        pageClass: localPageClass,
        pageModel: localPageModel,
        mode: pickStoryMode(localPageClass, localFormulaSignals.length),
        role: "general",
        depth: "standard",
      });
      const localPageTruth = evaluatePageTruth({
        visibleDocumentId: documentId,
        sourceDocumentId: documentId,
        visiblePageNumber: pageNumber,
        sourcePageNumber: pageNumber,
        parseReady: true,
        contentClass: localPageClass,
        pageModel: localPageModel,
        visiblePageText: snapshot.pageText || "",
        formulaSignalsCount: localFormulaSignals.length,
      });
      const localPageStoryV2 = buildPageStoryV2({
        documentId,
        pageNumber,
        truthKey: requestKey,
        pageText: snapshot.pageText || "",
      });
      const localPageStoryV3 = buildPageStoryV3({
        documentId,
        pageNumber,
        truthKey: requestKey,
        pageText: snapshot.pageText || "",
      });

      const localCandidates = buildSentenceCandidatesFromPageModel(localPageModel, pageNumber);
      const localNarrativeResult: NarrativeBuildResult | null = localCandidates.length > 0
        ? buildNarrativePageView({
            candidates: localCandidates,
            pageNumber,
            pageTitle: localPageModel.pageSummary,
            maxSupportPerSection: 3,
          })
        : null;
      // Bridge to legacy NarrativePageView format for extractPriorityHighlights
      const localNarrativePageView: LegacyNarrativeView | null = localNarrativeResult
        ? bridgeToLegacyNarrativeView(localNarrativeResult, pageNumber)
        : null;

      const localParagraphRoleMap = buildParagraphRoleMap(
        snapshot.pageText || "",
        localPageStory,
        snapshot.paragraphTexts?.length ? snapshot.paragraphTexts : undefined,
      );
      const localHighlights = extractPriorityHighlights({
        documentId,
        pageNumber,
        pageText: snapshot.pageText || "",
        // Provide pre-split paragraph texts so resolveBlockSpans can try
        // paragraph-level anchoring before falling back to sentence-level.
        paragraphTexts: snapshot.paragraphTexts?.length ? snapshot.paragraphTexts : undefined,
        paragraphRoleMap: localParagraphRoleMap.length ? localParagraphRoleMap : undefined,
        narrativePageView: localNarrativePageView ?? undefined,
        pageClass: localPageClass,
        pageModel: localPageModel,
        pageStory: localPageStory,
      });

      // Use currentPageRef (render-time, not effect-time) so this check is valid
      // even before the new page's primary effect has fired and updated latestRequestRef.
      if (currentPageRef.current.pageTruthKey !== requestKey) return;

      setSignals(localSignals);
      setClassification(localClassification);
      setPanelPayloads(localPayloads);
      setPageClass(localPageClass);
      setFormulaSignals(localFormulaSignals);
      setPageModel(localPageModel);
      setPageStory(localPageStory);
      setPageStoryV2(localPageStoryV2);
      setPageStoryV3(localPageStoryV3);
      setPageTruth(localPageTruth);
      setPriorityHighlights(localHighlights);
      setNormResult(localNormResult);
      setStatus("ready");
    }).catch((err: unknown) => {
      if (latestRequestRef.current !== requestKey) return;
      setError(err instanceof Error ? err.message : "Failed to build active page intelligence.");
      setStatus("error");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageTruthKey, documentId, pageNumber]);

  // Audience/depth tuning effect: only re-runs when audience or depth changes
  // on the SAME page. Skips during active page load to avoid overwriting the
  // clean reset state before the primary effect commits its result.
  useEffect(() => {
    if (status === "loading") return;
    const snapshot = ctxRef.current;
    const tunedSignals = extractPageSignals(snapshot, {
      minYield: mode.minYield,
      minSignals: mode.label === "student" ? 2 : 3,
      maxSignals: mode.maxEvidence,
    });
    setSignals(tunedSignals);
    setClassification(classifyPage(tunedSignals));
    setPanelPayloads(buildResolvedPanelPayload(snapshot, classifyPage(tunedSignals), tunedSignals, audience, depth));
  }, [status, mode, audience, depth]);

  const limitedEvidence =
    classification.confidence < 0.35 ||
    (ctx.pageText || "").trim().length < 120 ||
    ["cover", "contents", "chapter_opener", "section_opener", "copyright_frontmatter", "image_scan_heavy"].includes(signals.pageRole || "");

  const highlightNeighborhoods: HighlightNeighborhood[] = useMemo(() => {
    if (!pageModel || !normResult?.shouldRenderFullPanel) return [];
    const filteredParagraphs = (pageModel.paragraphInsights ?? []).filter(isValidCoreParagraph);
    const teachingZoneParagraphs = findMainTeachingZone(filteredParagraphs);
    const adapted = adaptPageInsightModel({
      ...pageModel,
      paragraphInsights: teachingZoneParagraphs,
    });
    const concepts = extractConceptBlocksCore(adapted);
    return concepts.length > 0 ? buildHighlightNeighborhoods(concepts) : [];
  }, [pageModel, pageNumber, normResult]);

  const highlightTargets: HighlightTarget[] = useMemo(() => {
    if (!normResult?.shouldRenderFullPanel) return [];
    // Primary: neighborhood-derived highlights in concept-cluster order
    if (highlightNeighborhoods.length > 0) {
      return flattenNeighborhoods(highlightNeighborhoods).map((line, index) => {
        // Extract conceptId from id prefix (e.g. "important-concept-p-0" → neighborhoodId "neighborhood-concept-p-0")
        const neighborhoodId = highlightNeighborhoods.find((n) =>
          n.anchor.id === line.id ||
          n.support.some((s) => s.id === line.id) ||
          n.additional.some((a) => a.id === line.id) ||
          n.trap?.id === line.id
        )?.id;
        const neighborhoodTitle = highlightNeighborhoods.find((n) => n.id === neighborhoodId)?.title;
        return {
          id: line.id,
          page: pageNumber,
          text: line.text,
          normalizedText: line.normalizedText,
          level: line.tier,
          score: line.score,
          sourceParagraphIndex: index,
          kind: line.tier === "trap" ? "clinical" : line.tier === "important" ? "mechanism" : "application",
          evidenceRefId: line.sentenceId ?? line.id,
          neighborhoodId,
          neighborhoodTitle,
        } satisfies HighlightTarget;
      });
    }

    // Fallback: priority highlights from extractPriorityHighlights pipeline
    const priorityItems = priorityHighlights.pageNumber === pageNumber
      ? priorityHighlights.all
      : [];
    const priority = priorityItems.map((item, index) => ({
      id: `priority-${item.id}`,
      page: pageNumber,
      text: item.text,
      normalizedText: item.text
        .toLowerCase()
        .replace(/\u00ad/g, "")
        .replace(/[^\w\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
      level: item.kind.startsWith("trap") ? "trap"
        : item.priority === "main" ? "important"
        : item.priority === "support" ? "support"
        : "additional",
      score: item.confidence,
      sourceParagraphIndex: index,
      kind: item.kind.startsWith("trap") ? "clinical"
        : (item.kind === "main_mechanism" || item.kind === "main_pattern") ? "mechanism"
        : (item.kind === "support_distinction" || item.kind === "support_relation" || item.kind === "weak_caveat") ? "comparison"
        : "application",
      evidenceRefId: item.id,
      support: item.support?.length ? item.support : undefined,
      evidence: item.evidence?.length ? item.evidence : undefined,
    } satisfies HighlightTarget));

    if (priority.length) {
      const dominant = priority.filter((t) => t.level === "important").slice(0, 3);
      const traps    = priority.filter((t) => t.level === "trap").slice(0, 2);
      const subdued  = priority.filter((t) => t.level === "support").slice(0, 3);
      const faint    = priority.filter((t) => t.level === "additional").slice(0, 2);
      return [...dominant, ...traps, ...subdued, ...faint];
    }
    const derived = deriveHighlightTargets(signals, pageNumber, audience, limitedEvidence);
    return derived.filter((t) => t.level !== "additional").slice(0, 4);
  }, [pageModel, signals, pageNumber, audience, limitedEvidence, priorityHighlights, highlightNeighborhoods, normResult]);

  const highlightKey = `${documentId}:${pageNumber}`;
  const isCurrentPage = Boolean(
    status === "ready"
      && pageModel
      && latestRequestRef.current === pageTruthKey
      && pageModel.requestKey === pageTruthKey
      && pageModel.pageNumber === pageNumber
      && pageModel.documentId === documentId
      // Ensure sparse/image-heavy pages (canRenderRightPanel: false) don't
      // expose stale right-panel content from a previous page.
      && (pageTruth?.canRenderRightPanel !== false),
  );

  return {
    payloadKey,
    highlightKey,
    signals,
    classification,
    panelPayloads,
    pageModel,
    story: pageStory,
    storyV2: pageStoryV2,
    storyV3: pageStoryV3,
    pageClass,
    pageTruth,
    pageTruthKey,
    formulaSignals,
    priorityHighlights,
    status,
    error,
    isCurrentPage,
    highlightTargets,
    highlightNeighborhoods,
    limitedEvidence,
    normResult,
  };
}

// ---------------------------------------------------------------------------
// Adapter: PageInsightModel → SentenceCandidate[]
// Temporary bridge until the backend stores native sentence candidates.
// ---------------------------------------------------------------------------

function buildSentenceCandidatesFromPageModel(
  pageModel: any,
  pageNumber: number
): any[] {
  const candidates: any[] = [];

  (pageModel?.paragraphInsights || []).forEach((p: any, paragraphIndex: number) => {
    const texts = [p.meaning, p.summary, p.takeaway, p.text].filter(Boolean);

    texts.forEach((text: string, sentenceIndex: number) => {
      candidates.push({
        id: `${p.id || `p-${paragraphIndex}`}-s-${sentenceIndex}`,
        text,
        cleanedText: text,
        normalizedText: text,
        pageNumber,
        paragraphId: p.id || `p-${paragraphIndex}`,
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
          salience: p.priorityScore ?? p.score ?? 0.5,
          instructional: /should|must|identify|compare|apply|diagnosis|rule/i.test(text)
            ? 0.8
            : 0.35,
          actionability: /should|must|use|apply|remember|avoid/i.test(text)
            ? 0.8
            : 0.25,
          warning: /avoid|trap|mistake|wrong|pitfall|do not/i.test(text)
            ? 0.85
            : 0.1,
          supportStrength: /because|therefore|results in|means|explains/i.test(text)
            ? 0.8
            : 0.35,
          centrality: sentenceIndex === 0 ? 0.8 : 0.45,
        },
      });
    });
  });

  return candidates;
}

// ---------------------------------------------------------------------------
// Bridge: NarrativeBuildResult → legacy NarrativePageView (for extractPriorityHighlights)
// ---------------------------------------------------------------------------

function bridgeToLegacyNarrativeView(
  result: NarrativeBuildResult,
  pageNumber: number
): LegacyNarrativeView {
  function toSectionOutput(
    section: "main_signal" | "rule" | "trap" | "grounded_support",
    sel: NonNullable<NarrativeBuildResult["mainSignal"]> | undefined
  ): SectionOutput | undefined {
    if (!sel) return undefined;
    return {
      section,
      primary: sel.primary ?? sel.anchor,
      support: sel.supporting,
      rejected: sel.rejected.map((r) => r.candidate),
    };
  }

  return {
    pageNumber,
    mainSignal: toSectionOutput("main_signal", result.mainSignal),
    rule: toSectionOutput("rule", result.rule),
    trap: toSectionOutput("trap", result.trap),
    groundedSupport: toSectionOutput("grounded_support", result.groundedSupport),
  };
}
