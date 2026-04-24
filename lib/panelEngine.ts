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
    priority: buildPriorityPayload(ctx, classification),
    explain: buildExplainPayload(ctx, classification),
    relations: buildRelationsPayload(ctx, classification),
    compare: buildComparePayload(ctx, classification),
    insights: buildInsightsPayload(classification),
  };
}
