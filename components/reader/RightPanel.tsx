import React from "react";
import type { ActivePageContext, PanelTab, ResolvedPanelPayload, RightPanelState } from "@/lib/readerContracts";
import { usePageInsights } from "@/hooks/usePageInsights";
import type { DecisionPath } from "@/lib/insights/types";

interface RightPanelProps {
  ctx: ActivePageContext;
  state: RightPanelState;
  onTabChange: (tab: PanelTab) => void;
  onAudienceChange: (value: RightPanelState["audience"]) => void;
  onDepthChange: (value: RightPanelState["depth"]) => void;
  onDensityChange: (value: RightPanelState["density"]) => void;
  payload?: ResolvedPanelPayload;
  onEvidenceClick?: (snippet: string, evidenceId?: string) => void;
  resolveEvidenceId?: (snippet: string) => string | undefined;
  focusedEvidenceId?: string | null;
}

export function RightPanel({ ctx, state }: RightPanelProps) {
  const pageModel = usePageInsights(ctx.pageText || "", state.audience === "expert");

  return (
    <aside className="flex h-full min-h-0 w-full flex-col overflow-y-auto border-l border-white/10 bg-[rgb(11,18,34)]">
      <div className="flex flex-col gap-4 p-4 text-white">
        <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4">
          <div className="text-xs uppercase tracking-wide text-emerald-300">{pageModel.pageType.replace(/_/g, " ")}</div>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">{pageModel.pageSummary}</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4">
          <div className="mb-2 text-xs uppercase text-slate-400">What matters most</div>
          <ul className="space-y-1 text-sm text-slate-200">
            {pageModel.topTakeaways.slice(0, 3).map((takeaway, index) => (
              <li key={`${takeaway}-${index}`}>• {takeaway}</li>
            ))}
          </ul>
        </div>

        <DecisionPathsSection decisionPaths={pageModel.decisionPaths} />
      </div>
    </aside>
  );
}

function DecisionPathsSection({ decisionPaths }: { decisionPaths: DecisionPath[] }) {
  if (!decisionPaths?.length) return null;

  return (
    <div className="rounded-2xl border border-emerald-500/20 bg-slate-950/70 p-4">
      <div className="mb-3 text-xs uppercase text-emerald-300">How to think about this</div>
      <div className="space-y-4">
        {decisionPaths.slice(0, 3).map((path) => (
          <DecisionPathCard key={path.id} path={path} />
        ))}
      </div>
    </div>
  );
}

function DecisionPathCard({ path }: { path: DecisionPath }) {
  return (
    <div className="space-y-2 rounded-xl border border-white/10 bg-slate-900/80 p-4">
      <Row label="Condition" value={path.condition} color="text-emerald-300" />
      <Row label="Interpretation" value={path.interpretation} color="text-cyan-300" />
      <Row label="Implication" value={path.implication} color="text-violet-300" />
      <Row label="Next move" value={path.nextMove} color="text-amber-300" />
      {path.trap ? <Row label="Trap" value={path.trap} color="text-rose-300" /> : null}
    </div>
  );
}

function Row({ label, value, color }: { label: string; value: string; color: string }) {
  if (!value) return null;
  return (
    <div className="text-sm leading-snug">
      <span className={`font-semibold ${color}`}>{label.toUpperCase()}</span>
      <span className="text-slate-300"> — {value}</span>
    </div>
  );
}
