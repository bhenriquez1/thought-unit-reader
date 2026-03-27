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

export function resolvePanelPayload(
  ctx: ActivePageContext,
  _audience: AudienceMode,
  _depth: DepthMode,
): ResolvedPanelPayload {
  const signals = extractPageSignals(ctx);
  const classification = classifyPage(signals);

  return {
    classification,
    priority: buildPriorityPayload(ctx, classification, signals),
    explain: buildExplainPayload(ctx, classification, signals),
    relations: buildRelationsPayload(ctx, classification, signals),
    compare: buildComparePayload(ctx, classification, signals),
    insights: buildInsightsPayload(classification, signals),
  };
}
