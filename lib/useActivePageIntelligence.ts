import { useMemo } from "react";
import type { ActivePageContext, AudienceMode, DepthMode, HighlightTarget } from "@/lib/readerContracts";
import { extractPageSignals } from "@/lib/right-panel/extractPageSignals";
import { classifyPage } from "@/lib/right-panel/classifyPage";
import { resolvePanelPayload } from "@/lib/panelEngine";
import { buildModeProfile } from "@/lib/right-panel/modeProfile";
import { deriveHighlightTargets } from "@/lib/highlightMapping";

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
  const panelPayloads = useMemo(() => resolvePanelPayload(ctx, audience, depth), [ctx, audience, depth]);
  const limitedEvidence =
    classification.confidence < 0.35 ||
    (ctx.pageText || "").trim().length < 120 ||
    ["cover", "contents", "chapter_opener", "section_opener", "copyright_frontmatter", "image_scan_heavy"].includes(signals.pageRole || "");
  const highlightTargets: HighlightTarget[] = useMemo(
    () => deriveHighlightTargets(signals, pageNumber, audience, limitedEvidence),
    [signals, pageNumber, audience, limitedEvidence],
  );
  const highlightKey = `${documentId}:${pageNumber}`;

  return {
    payloadKey,
    highlightKey,
    signals,
    classification,
    panelPayloads,
    highlightTargets,
    limitedEvidence,
  };
}
