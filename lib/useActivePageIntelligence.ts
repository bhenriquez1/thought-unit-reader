import { useEffect, useMemo, useRef, useState } from "react";
import type { ActivePageContext, AudienceMode, DepthMode, HighlightTarget } from "@/lib/readerContracts";
import { extractPageSignals } from "@/lib/right-panel/extractPageSignals";
import { classifyPage } from "@/lib/right-panel/classifyPage";
import { buildResolvedPanelPayload } from "@/lib/panelEngine";
import { buildModeProfile } from "@/lib/right-panel/modeProfile";
import { deriveHighlightTargets } from "@/lib/highlightMapping";
import { processPage } from "@/lib/insights/processPage";
import { buildPageStory } from "@/lib/insights/buildPageStory";
import { classifyPageContent } from "@/lib/pdf/classifyPageContent";
import { extractPriorityHighlights } from "@/lib/highlights/extractPriorityHighlights";
import { evaluatePageTruth, type PageTruthGateResult } from "@/lib/insights/evaluatePageTruth";
import type { PageInsightModel } from "@/lib/insights/types";
import type { PageStory } from "@/lib/insights/buildPageStory";

export type ActivePageIntelligenceStatus = "idle" | "loading" | "ready" | "error";

export type FormulaSignal = {
  kind: "equation" | "expression" | "reaction" | "symbolic_definition" | "graph_reference" | "table_reference";
  text: string;
  confidence: number;
};

interface UseActivePageIntelligenceArgs {
  documentId: string;
  pageNumber: number;
  ctx: ActivePageContext;
  audience: AudienceMode;
  depth: DepthMode;
}

function buildPageTruthKey(documentId: string, pageNumber: number, pageText: string): string {
  let hash = 0;
  for (let i = 0; i < pageText.length; i += 1) hash = (hash * 31 + pageText.charCodeAt(i)) | 0;
  return `${documentId}::${pageNumber}::${hash}`;
}

function extractFormulaSignals(rawText: string): FormulaSignal[] {
  if (!rawText) return [];

  const lines = rawText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const results: FormulaSignal[] = [];

  const eqPattern = /([A-Za-z0-9\)\]]\s*=\s*[A-Za-z0-9\(\[\-+*/^]|[0-9A-Za-z].*[=<>≤≥])/;
  const chemPattern = /([A-Z][a-z]?\d*[\+\-]?(?:\s*\+\s*[A-Z][a-z]?\d*[\+\-]?)*\s*(?:->|→|⇌)\s*[A-Z][a-z]?\d*[\+\-]?)/;
  const graphPattern = /\b(graph|figure|plot|curve|parabola|slope|intercept)\b/i;
  const tablePattern = /\b(table|values|data set|distribution)\b/i;
  const symbolicPattern = /\b(let|define|denote|where|given by|represented by)\b/i;

  for (const line of lines) {
    if (eqPattern.test(line)) {
      results.push({ kind: "equation", text: line, confidence: 0.95 });
      continue;
    }
    if (chemPattern.test(line)) {
      results.push({ kind: "reaction", text: line, confidence: 0.95 });
      continue;
    }
    if (graphPattern.test(line)) {
      results.push({ kind: "graph_reference", text: line, confidence: 0.75 });
      continue;
    }
    if (tablePattern.test(line)) {
      results.push({ kind: "table_reference", text: line, confidence: 0.7 });
      continue;
    }
    if (symbolicPattern.test(line) && /[A-Za-z]\([A-Za-z]\)|[xyznrt]=|f\(x\)|[=]/.test(line)) {
      results.push({ kind: "symbolic_definition", text: line, confidence: 0.72 });
    }
  }

  const seen = new Set<string>();
  return results.filter((item) => {
    const key = `${item.kind}::${item.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 12);
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
  const rawText = ctx.pageText || "";

  const pageTruthKey = useMemo(() => buildPageTruthKey(documentId, pageNumber, rawText), [documentId, pageNumber, rawText]);

  const [status, setStatus] = useState<ActivePageIntelligenceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pageModel, setPageModel] = useState<PageInsightModel | null>(null);
  const [pageStory, setPageStory] = useState<PageStory | null>(null);
  const [pageClass, setPageClass] = useState<ReturnType<typeof classifyPageContent> | null>(null);
  const [pageTruth, setPageTruth] = useState<PageTruthGateResult | null>(null);
  const [priorityHighlights, setPriorityHighlights] = useState<ReturnType<typeof extractPriorityHighlights>>([]);
  const [formulaSignals, setFormulaSignals] = useState<FormulaSignal[]>([]);

  const latestRequestRef = useRef<string>("");

  useEffect(() => {
    const requestKey = `${pageTruthKey}::${audience}::${depth}`;
    latestRequestRef.current = requestKey;

    setStatus("loading");
    setError(null);
    setPageModel(null);
    setPageStory(null);
    setPageClass(null);
    setPageTruth(null);
    setPriorityHighlights([]);
    setFormulaSignals([]);

    Promise.resolve().then(() => {
      try {
        const computedPageClass = classifyPageContent(rawText);
        const computedFormulaSignals = extractFormulaSignals(rawText);
        const model = processPage({
          documentId,
          pageNumber,
          rawText,
          pageClass: computedPageClass,
          requestKey: pageTruthKey,
          datFlag: audience === "expert",
          formulaSignals: computedFormulaSignals,
        });

        const story = model.pageStory || buildPageStory({
          pageClass: computedPageClass,
          pageModel: model,
          role: audience === "expert" ? "expert" : audience === "clinical" ? "operator" : "general",
          depth: depth === "deep" ? "deep" : "standard",
          mode: "insight",
        });

        const truth = evaluatePageTruth({
          visibleDocumentId: documentId,
          sourceDocumentId: documentId,
          visiblePageNumber: pageNumber,
          sourcePageNumber: pageNumber,
          parseReady: true,
          contentClass: computedPageClass,
          pageModel: model,
          visiblePageText: rawText,
        });

        const priority = extractPriorityHighlights({
          documentId,
          pageNumber,
          pageClass: computedPageClass,
          pageModel: model,
          story,
        });

        if (latestRequestRef.current !== requestKey) return;

        setPageClass(computedPageClass);
        setFormulaSignals(computedFormulaSignals);
        setPageModel(model);
        setPageStory(story);
        setPageTruth(truth);
        setPriorityHighlights(priority);
        setStatus("ready");
      } catch (err) {
        if (latestRequestRef.current !== requestKey) return;
        setError(err instanceof Error ? err.message : "Failed to build active page intelligence.");
        setStatus("error");
      }
    });
  }, [pageTruthKey, audience, depth, documentId, pageNumber, rawText]);

  const isCurrentPage = useMemo(() => {
    if (!pageModel) return false;
    return pageModel.documentId === documentId && pageModel.pageNumber === pageNumber && pageModel.requestKey === pageTruthKey;
  }, [pageModel, documentId, pageNumber, pageTruthKey]);

  const signals = useMemo(
    () =>
      extractPageSignals(ctx, {
        minYield: mode.minYield,
        minSignals: mode.label === "student" ? 2 : 3,
        maxSignals: mode.maxEvidence,
      }),
    [ctx, mode],
  );
  const classification = useMemo(() => classifyPage(signals), [signals]);
  const panelPayloads = useMemo(
    () => buildResolvedPanelPayload(ctx, classification, signals, audience, depth),
    [ctx, classification, signals, audience, depth],
  );

  const limitedEvidence =
    classification.confidence < 0.35 ||
    rawText.trim().length < 120 ||
    ["cover", "contents", "chapter_opener", "section_opener", "copyright_frontmatter", "image_scan_heavy"].includes(signals.pageRole || "");

  const highlightTargets: HighlightTarget[] = useMemo(() => {
    const derived = deriveHighlightTargets(signals, pageNumber, audience, limitedEvidence);
    const mappedPriority = priorityHighlights.map((item, index) => ({
      id: `priority-${item.id}`,
      page: pageNumber,
      text: item.text,
      normalizedText: item.text.toLowerCase(),
      level: item.priority === "main" ? "high_yield" : item.priority === "support" ? "supporting" : "weak",
      score: item.confidence,
      sourceParagraphIndex: index,
      kind: "application",
      evidenceRefId: item.evidenceId || item.id,
    } satisfies HighlightTarget));

    return mappedPriority.length ? [...mappedPriority, ...derived].slice(0, 12) : derived;
  }, [signals, pageNumber, audience, limitedEvidence, priorityHighlights]);

  const highlightKey = `${documentId}:${pageNumber}`;

  return {
    payloadKey,
    highlightKey,
    signals,
    classification,
    panelPayloads,
    insightModel: pageModel,
    story: pageStory,
    pageTruthKey,
    status,
    error,
    isCurrentPage,
    pageClass,
    pageTruth,
    pageModel,
    pageStory,
    priorityHighlights,
    formulaSignals,
    highlightTargets,
    limitedEvidence,
  };
}
