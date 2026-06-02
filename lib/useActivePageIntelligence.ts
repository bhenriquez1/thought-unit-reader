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
import { buildUltraPageView, adaptPageInsightModel, isValidCoreParagraph } from "@/lib/insights/buildUltraPageView";
import { findMainTeachingZone } from "@/lib/insights/findMainTeachingZone";
import { extractConceptBlocks as extractConceptBlocksCore } from "@/lib/insights/extractConceptBlocks";
import { buildParagraphRoleMap } from "@/lib/highlights/paragraphRoleMap";
import { detectPageDomain } from "@/lib/insights/detectPageDomain";
import { buildPageStoryV2, type PageStoryV2 } from "@/lib/insights/buildPageStoryV2";
import { buildPageStoryV3, type PageStoryV3 } from "@/lib/insights/buildPageStoryV3";
import { buildNarrativePageView, type NarrativeBuildResult } from "@/lib/insights/buildNarrativePageView";
import type { NarrativePageView as LegacyNarrativeView, SectionOutput } from "@/lib/insights/types";
import { evaluatePageTruth, type PageTruthGateResult } from "@/lib/insights/evaluatePageTruth";
import { buildPageStory } from "@/lib/insights/buildPageStory";
import type { PageInsightModel } from "@/lib/insights/types";
import type { PageStory } from "@/lib/insights/buildPageStory";
import { normalizeClinicalText, type ClinicalNormalizationResult } from "@/lib/normalization/normalizeClinicalText";
import { selectTeachingSource } from "@/lib/insights/selectTeachingSource";
import {
  makeModelCacheKey, makeAnchorCacheKey,
  getModelCacheEntry, setModelCacheEntry,
  getAnchorCacheEntry, setAnchorCacheEntry,
  computePageConfidence, cacheStats,
} from "@/lib/insights/studyModelCache";

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
  pageRole?: string; // from detectPageRole: "cover" | "contents" | "chapter_opener" | "section_opener" | "copyright_frontmatter" | "history_background" | "regular_teaching" | "table_formula" | "image_scan_heavy"
};

interface UseActivePageIntelligenceArgs {
  documentId: string;
  pageNumber: number;
  ctx: ActivePageContext;
  /** True once the PDF text layer has delivered ≥50 chars for this page.
   *  When false the primary effect skips processing and waits for re-fire. */
  pageTextReady: boolean;
  audience: AudienceMode;
  depth: DepthMode;
}

function hashText(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  return String(hash);
}

function buildPageTruthKey(documentId: string, pageNumber: number, textReady: boolean): string {
  // Include text-readiness so the primary effect re-fires when text arrives for an
  // already-navigated page. Without this, the effect runs once with empty text
  // (classifies as chapter_title), then never re-runs when the PDF text layer delivers
  // the actual content — leaving the right panel permanently empty on first visit.
  return `${documentId}::${pageNumber}::${textReady ? "t" : "f"}`;
}

function extractFormulaSignals(rawText: string): FormulaSignal[] {
  if (!rawText) return [];
  const lines = rawText.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const out: FormulaSignal[] = [];

  const eqPattern = /([A-Za-z0-9)\]]\s*=\s*[A-Za-z0-9([\-+*/^]|[0-9A-Za-z].*[=<>≤≥])/;
  const chemPattern = /([A-Z][a-z]?\d*[\+\-]?(?:\s*\+\s*[A-Z][a-z]?\d*[\+\-]?)*\s*(?:->|→|⇌)\s*[A-Z][a-z]?\d*[\+\-]?)/;
  // Sequence/convergence notation: {aₙ}, {a_n}, lim n→∞, Δx, Δy, standalone →
  const sequencePattern = /\{[A-Za-z][₀-₉_][A-Za-z0-9]*\}|\blim\s+[a-z]\s*→|[ΔδΣ][A-Za-z]|\b[a-z]_\{?n\}?\s*(?:→|→\s*[0-9∞])|→\s*(?:[0-9∞]|\\infty)/;
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
    if (sequencePattern.test(line)) {
      out.push({ kind: "equation", text: line, confidence: 0.85 });
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
  pageTextReady,
  audience,
  depth,
}: UseActivePageIntelligenceArgs) {
  const mode = useMemo(() => buildModeProfile(audience, depth), [audience, depth]);
  const payloadKey = `${documentId}:${pageNumber}:${audience}:${depth}`;
  const pageTruthKey = useMemo(
    () => buildPageTruthKey(documentId, pageNumber, pageTextReady),
    [documentId, pageNumber, pageTextReady]
  );

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
  const [confidence, setConfidence] = useState<number>(0);
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

  // Primary effect: fires when page identity changes (documentId, pageNumber) OR
  // when text-readiness flips from false→true (textReady encoded in pageTruthKey).
  // This ensures the pipeline re-runs after onGetTextSuccess delivers page text,
  // which arrives asynchronously after navigation.
  useEffect(() => {
    const requestKey = pageTruthKey;
    latestRequestRef.current = requestKey;

    // Page text not yet available — show idle, wait for the "t" key to re-fire.
    if (!pageTextReady) {
      setStatus("idle");
      setPageModel(null);
      setNormResult(null);
      setPageTruth(null);
      setConfidence(0);
      return;
    }

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

    setConfidence(0);

    Promise.resolve().then(() => {
      if (latestRequestRef.current !== requestKey) return;

      // ── Cache check ────────────────────────────────────────────────────────
      const textForHash = (snapshot.pageText || "").slice(0, 4000);
      const textHash = hashText(textForHash);
      const modelKey = makeModelCacheKey(documentId, pageNumber, textHash);
      const cached = getModelCacheEntry(modelKey);
      if (cached) {
        console.log("[STUDYMODEL_CACHE_HIT]", {
          page:       pageNumber,
          documentId,
          pageKind:   cached.normResult.pageKind,
          confidence: cached.confidence,
          ageMs:      Date.now() - cached.timestamp,
          cacheSize:  cacheStats(),
        });
        setPageModel(cached.pageModel);
        setNormResult(cached.normResult);
        setPageClass(cached.pageClass);
        setConfidence(cached.confidence);
        setStatus("ready");
        return;
      }
      console.log("[STUDYMODEL_CACHE_MISS]", {
        page:      pageNumber,
        documentId,
        textLen:   (snapshot.pageText || "").length,
        cacheSize: cacheStats(),
      });

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

      // Normalization gate — runs BEFORE processPage so pageKind is available
      // for teaching source selection. Full pageText is always passed here for
      // accurate classification (the selector narrows it afterward).
      const normHeadingLines = (snapshot.pageText || "")
        .split(/\n+/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && l.length < 90 && !/[.!?]$/.test(l))
        .slice(0, 6);
      const localNormResult = normalizeClinicalText({
        pageText: snapshot.pageText || "",
        pageTitle: null,
        pageNumber,
        headingLines: normHeadingLines,
      });

      // Zone the page text and select only the authoritative teaching source
      // before processPage sees it. This prevents figure captions, sidebar
      // callouts, and exercise prompts from ranking above the actual lesson.
      const teachingSource = selectTeachingSource(snapshot.pageText || "", localNormResult.pageKind);
      console.log("[TRACE sourceSelector]", {
        pageNumber,
        pageKind: localNormResult.pageKind,
        zones: teachingSource.zones,
        selectedZone: teachingSource.selectedZone,
        selectedWordCount: teachingSource.selectedWordCount,
        suppressedReason: teachingSource.suppressedReason,
      });
      if (teachingSource.mathPath) {
        console.log("[TRACE mathPath]", {
          pageNumber,
          ...teachingSource.mathPath,
        });
      }

      // Use the selected source text for concept extraction. Do NOT fall back
      // to raw snapshot.pageText — that would re-admit captions and sidebars
      // that selectTeachingSource deliberately excluded. When selectedText is
      // empty (e.g. figure-heavy pages with insufficient mainBody), processPage
      // receives an empty string and produces no paragraphs. The normalization
      // gate (shouldRenderFullPanel) then shows "Not available" — correct.
      const sourceTextForProcessing = teachingSource.selectedText ?? "";
      console.log("[TRACE currentPageSource]", {
        documentId,
        pageNumber,
        pageKind: localNormResult.pageKind,
        rawPageTextLength: (snapshot.pageText || "").length,
        selectedTextLength: sourceTextForProcessing.length,
        suppressedReason: teachingSource.suppressedReason,
        // First 80 chars of selected text to confirm content matches the active book
        first80: sourceTextForProcessing.slice(0, 80),
      });
      const parsedModel = processPage(sourceTextForProcessing);
      const localPageModel: PageInsightModel = {
        ...parsedModel,
        documentId,
        pageNumber,
        requestKey,
      };

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

      const localPageDomain = detectPageDomain(snapshot.pageText || "");
      const localParagraphRoleMap = buildParagraphRoleMap(
        snapshot.pageText || "",
        localPageStory,
        snapshot.paragraphTexts?.length ? snapshot.paragraphTexts : undefined,
        localPageDomain,
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
        domain: localPageDomain,
      });

      // Use currentPageRef (render-time, not effect-time) so this check is valid
      // even before the new page's primary effect has fired and updated latestRequestRef.
      if (currentPageRef.current.pageTruthKey !== requestKey) {
        console.warn("[TRACE staleGuard] blocking stale commit", {
          requestKey,
          currentKey: currentPageRef.current.pageTruthKey,
          requestDocId: documentId,
          currentDocId: currentPageRef.current.documentId,
          requestPage: pageNumber,
          currentPage: currentPageRef.current.pageNumber,
        });
        return;
      }

      // Extra guard: if the model's documentId doesn't match the active document,
      // the source text came from a different PDF — hard-block the commit.
      if (localPageModel.documentId !== currentPageRef.current.documentId) {
        console.warn("[TRACE staleGuard] documentId mismatch — discarding result", {
          modelDocId: localPageModel.documentId,
          activeDocId: currentPageRef.current.documentId,
        });
        return;
      }

      // [TRACE] temporary pipeline instrumentation — all logs use [TRACE] prefix for easy console filtering
      const _traceValid = (localPageModel.paragraphInsights ?? []).filter(isValidCoreParagraph);
      const _traceZone  = findMainTeachingZone(_traceValid, { pageKind: localNormResult.pageKind });
      const _tracePage  = adaptPageInsightModel({ ...localPageModel, paragraphInsights: _traceZone });
      const _traceConcepts = extractConceptBlocksCore(_tracePage);
      const _traceNeighborhoods = _traceConcepts.length > 0
        ? buildHighlightNeighborhoods(_traceConcepts, { pageKind: localNormResult.pageKind })
        : [];
      const _traceStructuralSteps = _traceNeighborhoods.filter(n => n.depthLevel !== "anchor_only").length;
      const _traceMathSteps = localNormResult.pageKind === "mathematical_exposition"
        ? _traceNeighborhoods.filter(n => ["definition", "mechanism", "example"].includes(n.conceptRole ?? "")).length
        : 0;
      const _traceOverlaySuppressedReason = !localNormResult.shouldRenderFullPanel
        ? "normalization_gate"
        : teachingSource.suppressedReason
        ? `source_suppressed:${teachingSource.suppressedReason}`
        : _traceConcepts.length === 0
        ? "no_concepts"
        : _traceNeighborhoods.length === 0
        ? "insufficient_structural_steps"
        : null;
      console.log("[TRACE useActivePageIntelligence]", {
        pageNumber,
        pageKind: localNormResult.pageKind,
        shouldRenderFullPanel: localNormResult.shouldRenderFullPanel,
        canRenderRightPanel: localPageTruth.canRenderRightPanel,
        instructionalScore: _traceValid.length > 0 ? Math.round((_traceConcepts.length / _traceValid.length) * 100) / 100 : 0,
        paragraphCount: (localPageModel.paragraphInsights ?? []).length,
        validParagraphCount: _traceValid.length,
        teachingZoneCount: _traceZone.length,
        conceptCount: _traceConcepts.length,
        structuralStepCount: _traceStructuralSteps,
        mathStepCount: _traceMathSteps,
        overlaySuppressedReason: _traceOverlaySuppressedReason,
      });
      console.log("[TRACE overlayPath]", {
        pageNumber,
        stepCount: _traceStructuralSteps,
        roles: _traceNeighborhoods.map(n => n.conceptRole ?? "detail"),
        suppressedReason: _traceOverlaySuppressedReason,
      });
      console.log("[TRACE leftRightSourceCompare]", {
        pageNumber,
        sourceTextLength: sourceTextForProcessing.length,
        neighborhoodCount: _traceNeighborhoods.length,
        neighborhoodTitles: _traceNeighborhoods.map(n => n.title?.slice(0, 40)),
        anchorTexts: _traceNeighborhoods.map(n => n.anchor.text.slice(0, 60)),
        sourceWasFiltered: teachingSource.suppressedReason === null && sourceTextForProcessing.length < (snapshot.pageText || "").length,
      });

      // ── Confidence + cache store ───────────────────────────────────────────
      const localConfidence = computePageConfidence(localPageModel, localNormResult);
      if (localConfidence < 0.5) {
        console.log("[LOW_CONFIDENCE_PAGE]", {
          page:       pageNumber,
          documentId,
          pageKind:   localNormResult.pageKind,
          confidence: localConfidence,
          paragraphs: (localPageModel.paragraphInsights ?? []).length,
          reason:     !localNormResult.shouldRenderFullPanel
            ? "panel_suppressed"
            : teachingSource.suppressedReason ?? "sparse_content",
        });
      }
      setModelCacheEntry(modelKey, {
        pageModel:   localPageModel,
        normResult:  localNormResult,
        pageClass:   localPageClass,
        confidence:  localConfidence,
        textHash,
        timestamp:   Date.now(),
        generatedBy: "local_nlp",
      });
      console.log("[STUDYMODEL_STORED]", {
        page:        pageNumber,
        documentId,
        pageKind:    localNormResult.pageKind,
        confidence:  localConfidence,
        cacheSize:   cacheStats(),
        generatedBy: "local_nlp",
      });

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
      setConfidence(localConfidence);
      setStatus("ready");
    }).catch((err: unknown) => {
      if (latestRequestRef.current !== requestKey) return;
      setError(err instanceof Error ? err.message : "Failed to build active page intelligence.");
      setStatus("error");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageTruthKey, documentId, pageNumber, pageTextReady]);

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

    // Check anchor cache — prevents highlights from changing on back-navigation
    const anchorKey = makeAnchorCacheKey(
      pageModel.documentId ?? documentId,
      pageModel.pageNumber ?? pageNumber,
      pageModel.requestKey ?? "",
    );
    const cachedAnchors = getAnchorCacheEntry(anchorKey);
    if (cachedAnchors) {
      console.log("[ANCHOR_CACHE_HIT]", {
        page:  pageNumber,
        count: cachedAnchors.length,
        roles: cachedAnchors.map(n => n.conceptRole ?? "detail"),
      });
      return cachedAnchors;
    }
    console.log("[ANCHOR_CACHE_MISS]", { page: pageNumber });
    const validInsights = (pageModel.paragraphInsights ?? []).filter((p, arrayIdx) => {
      if (isValidCoreParagraph(p)) return true;
      // Always include the first 2 page-order paragraphs when they have ≥25 chars.
      // isValidCoreParagraph rejects short paragraphs (< 80 chars without a definitional
      // phrase), but a 35-char intro like "The diagnosis interview" is essential structural
      // context that must survive into findMainTeachingZone and concept extraction.
      return arrayIdx <= 1 && (p.cleanedText || p.rawText || "").trim().length >= 25;
    });
    const zoneInsights = findMainTeachingZone(validInsights, { pageKind: normResult?.pageKind });
    const adapted = adaptPageInsightModel({
      ...pageModel,
      paragraphInsights: zoneInsights,
    });
    const allConcepts = extractConceptBlocksCore(adapted);

    // ── Quality-gate alignment ────────────────────────────────────────────────
    // buildUltraPageView applies passesConceptQualityGate, enforceEducationalHierarchy,
    // and a hard cap of 3 before producing the right panel's concept blocks. The left
    // panel must use the SAME filtered set so both panels reference identical source
    // anchors. We call buildUltraPageView here to get the surviving concept IDs, then
    // filter allConcepts to match — preserving the raw ConceptBlockInput data (support
    // sentences, trapCandidates) needed by buildHighlightNeighborhoods.
    const ultraView = buildUltraPageView(pageModel, { existingNormResult: normResult });
    const activeIds = new Set(ultraView?.blocks.map(b => b.conceptId) ?? []);

    // If ultraView returned blocks, use only those concepts. Fall back to all concepts
    // when ultraView returns null (e.g. math fallback / chapter intro paths).
    const qualifiedConcepts = activeIds.size > 0
      ? allConcepts.filter(c => activeIds.has(c.id))
      : allConcepts;

    const rawNeighborhoods = qualifiedConcepts.length > 0
      ? buildHighlightNeighborhoods(qualifiedConcepts, { pageKind: normResult.pageKind })
      : [];

    // Strategic highlight density: keep ≤3 neighborhoods, anchor-only for blocks 2+.
    // Block 1 keeps support sentences for context; subsequent blocks show only their
    // anchor to avoid visual noise — max ~4 highlights total on any page.
    const neighborhoods = rawNeighborhoods.slice(0, 3).map((n, i) =>
      i === 0 ? n : { ...n, support: [], additional: [] }
    );

    // ── [TRACE ANCHOR SELECTION] ──────────────────────────────────────────────
    // Verifies: domain, pageThesis, which block produced each anchor, anchorText
    // sent to the PDF viewer, depth level, and support/trap availability.
    // Filter in DevTools: "[TRACE ANCHOR SELECTION]"
    console.log("[TRACE ANCHOR SELECTION]", {
      page: pageNumber,
      domain: ultraView?._debug?.domain ?? "unknown",
      pageThesis: ultraView?.pageThesis?.slice(0, 100) ?? null,
      totalConcepts: allConcepts.length,
      qualityFiltered: qualifiedConcepts.length,
      highlightCount: neighborhoods.length,
      anchors: neighborhoods.map((n, i) => ({
        block: i + 1,
        role: n.conceptRole ?? "detail",
        title: n.title?.slice(0, 40),
        anchorText: n.anchor.text.slice(0, 80),
        anchorLen: n.anchor.text.length,
        depth: n.depthLevel,
        supportCount: n.support.length,
        hasTrap: !!n.trap,
      })),
      // LLM synthesis cannot overwrite anchorText — it only affects pattern/mechanism/rule
      // fields on the UltraConceptBlock display layer. anchorText = c.anchorSentence (raw PDF).
      synthesisOverwritesAnchors: false,
    });

    // [TRACE sentenceMap] — raw sentence pool feeding the left panel
    console.log("[TRACE sentenceMap]", {
      documentId: pageModel.documentId,
      pageNumber,
      paragraphCount: (pageModel.paragraphInsights ?? []).length,
      validCount: validInsights.length,
      zoneCount: zoneInsights.length,
      conceptCount: allConcepts.length,
      qualifiedCount: qualifiedConcepts.length,
      neighborhoodCount: neighborhoods.length,
      zoneSentences: zoneInsights.slice(0, 4).map((p: any) => (p.cleanedText ?? "").slice(0, 60)),
    });

    // [TRACE guidedPath] — what the left panel will render
    console.log("[TRACE guidedPath]", {
      documentId: pageModel.documentId,
      pageNumber,
      steps: neighborhoods.map((n) => ({
        role: n.conceptRole,
        depth: n.depthLevel,
        anchor: n.anchor.text.slice(0, 60),
        supportCount: n.support.length,
      })),
    });

    // Store in anchor cache — stable across back-navigation
    if (anchorKey) {
      setAnchorCacheEntry(anchorKey, neighborhoods);
      console.log("[ANCHOR_STORED]", {
        page:  pageNumber,
        count: neighborhoods.length,
        roles: neighborhoods.map(n => n.conceptRole ?? "detail"),
      });
    }

    return neighborhoods;
  }, [pageModel, pageNumber, normResult, documentId]);

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
  }, [pageModel, signals, pageNumber, audience, limitedEvidence, priorityHighlights]);

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
    confidence,
    pageRole: signals.pageRole ?? undefined,
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
