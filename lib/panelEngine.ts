import type {
  ActivePageContext,
  AudienceMode,
  DepthMode,
  ResolvedPanelPayload,
} from "./readerContracts";
import { classifyPage } from "./right-panel/classifyPage";
import { extractPageSignals } from "./right-panel/extractPageSignals";
import { buildPriorityPayload } from "./right-panel/buildPriorityPayload";
import { buildExplainPayload } from "./right-panel/buildExplainPayload";
import { buildRelationsPayload } from "./right-panel/buildRelationsPayload";
import { buildComparePayload } from "./right-panel/buildComparePayload";
import { buildInsightsPayload } from "./right-panel/buildInsightsPayload";
import { buildModeProfile } from "./right-panel/modeProfile";

export function resolvePanelPayload(
  ctx: ActivePageContext,
  audience: AudienceMode,
  depth: DepthMode,
): ResolvedPanelPayload {
  const mode = buildModeProfile(audience, depth);
  const signals = extractPageSignals(ctx, {
    minYield: mode.minYield,
    minSignals: mode.label === "student" ? 2 : 3,
    maxSignals: mode.maxEvidence,
  });
  const classification = classifyPage(signals);

  return {
    classification,
    priority: buildPriorityPayload(ctx, classification, signals, mode),
    explain: buildExplainPayload(ctx, classification, signals, mode),
    relations: buildRelationsPayload(ctx, classification, signals),
    compare: buildComparePayload(ctx, classification, signals),
    insights: buildInsightsPayload(classification, signals, mode),
  };
}
