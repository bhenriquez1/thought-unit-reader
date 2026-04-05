import { useMemo } from "react";
import type { ActivePageContext, AudienceMode, DepthMode, HighlightTarget } from "@/lib/readerContracts";
import { extractPageSignals } from "@/lib/right-panel/extractPageSignals";
import { classifyPage } from "@/lib/right-panel/classifyPage";
import { buildResolvedPanelPayload } from "@/lib/panelEngine";
import { buildModeProfile } from "@/lib/right-panel/modeProfile";
import { deriveHighlightTargets } from "@/lib/highlightMapping";
import { processPage } from "@/lib/insights/processPage";
import { classifyPageContent } from "@/lib/pdf/classifyPageContent";
import { extractPriorityHighlights } from "@/lib/highlights/extractPriorityHighlights";
import { buildPageStory } from "@/lib/insights/buildPageStory";

interface UseActivePageIntelligenceArgs {
  documentId: string;
  pageNumber: number;
  ctx: ActivePageContext;
  audience: AudienceMode;
  depth: DepthMode;
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
  const insightModel = useMemo(() => processPage(ctx.pageText || ""), [ctx.pageText]);
  const pageClass = useMemo(() => classifyPageContent(ctx.pageText || ""), [ctx.pageText]);
  const story = useMemo(() => buildPageStory({
    pageClass,
    pageModel: insightModel,
    role: audience === "expert" ? "expert" : audience === "clinical" ? "operator" : "general",
    depth: depth === "deep" ? "deep" : "standard",
    mode: "insight",
  }), [audience, depth, insightModel, pageClass]);
  const limitedEvidence =
    classification.confidence < 0.35 ||
    (ctx.pageText || "").trim().length < 120 ||
    ["cover", "contents", "chapter_opener", "section_opener", "copyright_frontmatter", "image_scan_heavy"].includes(signals.pageRole || "");
  const highlightTargets: HighlightTarget[] = useMemo(() => {
    const derived = deriveHighlightTargets(signals, pageNumber, audience, limitedEvidence);
    const priority = (pageClass === "copyright_frontmatter"
      ? []
      : extractPriorityHighlights({
          documentId,
          pageNumber,
          pageClass,
          pageModel: insightModel,
          story,
        })
    ).map((item, index) => ({
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
  }, [signals, pageNumber, audience, limitedEvidence, documentId, pageClass, insightModel, story]);
  const highlightKey = `${documentId}:${pageNumber}`;

  return {
    payloadKey,
    highlightKey,
    signals,
    classification,
    panelPayloads,
    story,
    highlightTargets,
    limitedEvidence,
  };
}
