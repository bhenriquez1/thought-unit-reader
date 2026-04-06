import { useEffect, useMemo, useRef, useState } from "react";
import type { ActivePageContext, AudienceMode, DepthMode, HighlightTarget } from "@/lib/readerContracts";
import { extractPageSignals } from "@/lib/right-panel/extractPageSignals";
import { classifyPage } from "@/lib/right-panel/classifyPage";
import { buildResolvedPanelPayload } from "@/lib/panelEngine";
import { buildModeProfile } from "@/lib/right-panel/modeProfile";
import { deriveHighlightTargets } from "@/lib/highlightMapping";
import { processPage } from "@/lib/insights/processPage";
import { classifyPageContent, type PageContentClass } from "@/lib/pdf/classifyPageContent";
import { extractPriorityHighlights } from "@/lib/highlights/extractPriorityHighlights";
import { evaluatePageTruth, type PageTruthGateResult } from "@/lib/insights/evaluatePageTruth";
import { buildPageStory } from "@/lib/insights/buildPageStory";
import type { PageInsightModel } from "@/lib/insights/types";
import type { PageStory } from "@/lib/insights/buildPageStory";

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
  if (pageClass === "form_page") return "apply_test" as const;
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
  const [pageClass, setPageClass] = useState<PageContentClass | null>(null);
  const [pageTruth, setPageTruth] = useState<PageTruthGateResult | null>(null);
  const [formulaSignals, setFormulaSignals] = useState<FormulaSignal[]>([]);
  const [priorityHighlights, setPriorityHighlights] = useState<ReturnType<typeof extractPriorityHighlights>>([]);
  const latestRequestRef = useRef<string>("");

  useEffect(() => {
    const requestKey = pageTruthKey;
    latestRequestRef.current = requestKey;

    setStatus("loading");
    setError(null);
    setPageModel(null);
    setPageStory(null);
    setPageClass(null);
    setPageTruth(null);
    setFormulaSignals([]);
    setPriorityHighlights([]);

    Promise.resolve().then(() => {
      const localSignals = extractPageSignals(ctx, {
        minYield: 1,
        minSignals: 2,
        maxSignals: 8,
      });
      const localClassification = classifyPage(localSignals);
      const localPayloads = buildResolvedPanelPayload(ctx, localClassification, localSignals, audience, depth);
      const rawPageClass = classifyPageContent(ctx.pageText || "");
      const localFormulaSignals = extractFormulaSignals(ctx.pageText || "");
      const localPageClass: PageContentClass =
        localFormulaSignals.length >= 2 && (rawPageClass === "sparse_text" || rawPageClass === "failed_sparse")
          ? "mixed_visual"
          : rawPageClass;
      const parsedModel = processPage(ctx.pageText || "");
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
        visiblePageText: ctx.pageText || "",
        formulaSignalsCount: localFormulaSignals.length,
      });
      const localHighlights = localPageClass === "copyright_frontmatter"
        ? []
        : extractPriorityHighlights({
            documentId,
            pageNumber,
            pageClass: localPageClass,
            pageModel: localPageModel,
            story: localPageStory,
          });

      if (latestRequestRef.current !== requestKey) return;

      setSignals(localSignals);
      setClassification(localClassification);
      setPanelPayloads(localPayloads);
      setPageClass(localPageClass);
      setFormulaSignals(localFormulaSignals);
      setPageModel(localPageModel);
      setPageStory(localPageStory);
      setPageTruth(localPageTruth);
      setPriorityHighlights(localHighlights);
      setStatus("ready");
    }).catch((err: unknown) => {
      if (latestRequestRef.current !== requestKey) return;
      setError(err instanceof Error ? err.message : "Failed to build active page intelligence.");
      setStatus("error");
    });
  }, [ctx, pageTruthKey, documentId, pageNumber]);

  useEffect(() => {
    const tunedSignals = extractPageSignals(ctx, {
      minYield: mode.minYield,
      minSignals: mode.label === "student" ? 2 : 3,
      maxSignals: mode.maxEvidence,
    });
    setSignals(tunedSignals);
    setClassification(classifyPage(tunedSignals));
    setPanelPayloads(buildResolvedPanelPayload(ctx, classifyPage(tunedSignals), tunedSignals, audience, depth));
  }, [ctx, mode, audience, depth]);

  const limitedEvidence =
    classification.confidence < 0.35 ||
    (ctx.pageText || "").trim().length < 120 ||
    ["cover", "contents", "chapter_opener", "section_opener", "copyright_frontmatter", "image_scan_heavy"].includes(signals.pageRole || "");

  const highlightTargets: HighlightTarget[] = useMemo(() => {
    const derived = deriveHighlightTargets(signals, pageNumber, audience, limitedEvidence);
    const priority = priorityHighlights.map((item, index) => ({
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

    return priority.length ? [...priority, ...derived].slice(0, 12) : derived;
  }, [signals, pageNumber, audience, limitedEvidence, priorityHighlights]);

  const highlightKey = `${documentId}:${pageNumber}`;
  const isCurrentPage = Boolean(
    status === "ready"
      && pageModel
      && latestRequestRef.current === pageTruthKey
      && pageModel.requestKey === pageTruthKey
      && pageModel.pageNumber === pageNumber
      && pageModel.documentId === documentId,
  );

  return {
    payloadKey,
    highlightKey,
    signals,
    classification,
    panelPayloads,
    pageModel,
    story: pageStory,
    pageClass,
    pageTruth,
    pageTruthKey,
    formulaSignals,
    priorityHighlights,
    status,
    error,
    isCurrentPage,
    highlightTargets,
    limitedEvidence,
  };
}
