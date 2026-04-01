import React, { useMemo } from "react";
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

const modes: Array<{ tab: Exclude<PanelTab, "priority">; label: string }> = [
  { tab: "insights", label: "Insight" },
  { tab: "explain", label: "Explain" },
  { tab: "compare", label: "Compare" },
  { tab: "relations", label: "Relation" },
];

export function RightPanel({
  ctx,
  state,
  onTabChange,
  onAudienceChange,
  onDepthChange,
  onDensityChange,
  onEvidenceClick,
  resolveEvidenceId,
  focusedEvidenceId,
}: RightPanelProps) {
  const pageModel = usePageInsights(ctx.pageText || "", state.audience === "expert");
  const activeMode: Exclude<PanelTab, "priority"> = (state.activeTab === "priority" ? "insights" : state.activeTab) as Exclude<PanelTab, "priority">;

  const visiblePaths = useMemo(() => {
    const base = pageModel.decisionPaths.slice(0, 3);
    if (activeMode === "compare") return base.filter((entry) => entry.template === "comparison").slice(0, 3);
    if (activeMode === "relations") return base.filter((entry) => entry.template !== "comparison").slice(0, 3);
    if (activeMode === "explain") return base.filter((entry) => entry.template === "science" || entry.template === "clinical").slice(0, 3);
    return base;
  }, [activeMode, pageModel.decisionPaths]);

  const showApplyTest = pageModel.decisionPaths.some((entry) => Boolean(entry.trap || entry.nextMove));

  return (
    <aside className="flex h-full min-h-0 w-full flex-col overflow-y-auto border-l border-white/10 bg-[rgb(11,18,34)]">
      <div className="border-b border-white/10 p-3">
        <div className="mb-2 flex gap-2 overflow-x-auto">
          {modes.map((mode) => (
            <button
              key={mode.tab}
              onClick={() => onTabChange(mode.tab)}
              className={`rounded-md px-3 py-1.5 text-xs border whitespace-nowrap ${
                activeMode === mode.tab
                  ? "border-emerald-400/40 bg-emerald-500/20 text-white"
                  : "border-white/10 bg-white/5 text-slate-200"
              }`}
            >
              {mode.label}
            </button>
          ))}
          {showApplyTest ? (
            <button
              onClick={() => onTabChange("insights")}
              className="rounded-md border border-amber-400/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-100 whitespace-nowrap"
            >
              Apply/Test
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <select value={state.audience} onChange={(e) => onAudienceChange(e.target.value as RightPanelState["audience"])} className="rounded-md border border-white/10 bg-slate-900 px-2 py-1 text-xs text-white">
            <option value="student">Student</option>
            <option value="clinical">Clinical</option>
            <option value="expert">Expert</option>
          </select>
          <select value={state.depth} onChange={(e) => onDepthChange(e.target.value as RightPanelState["depth"])} className="rounded-md border border-white/10 bg-slate-900 px-2 py-1 text-xs text-white">
            <option value="standard">Standard</option>
            <option value="deep">Deep</option>
          </select>
          <select value={state.density} onChange={(e) => onDensityChange(e.target.value as RightPanelState["density"])} className="rounded-md border border-white/10 bg-slate-900 px-2 py-1 text-xs text-white">
            <option value="condensed">Condensed</option>
            <option value="expanded">Expanded</option>
          </select>
        </div>
      </div>

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

        <DecisionPathsSection
          decisionPaths={visiblePaths.length ? visiblePaths : pageModel.decisionPaths.slice(0, 3)}
          onEvidenceClick={onEvidenceClick}
          resolveEvidenceId={resolveEvidenceId}
          focusedEvidenceId={focusedEvidenceId}
        />
      </div>
    </aside>
  );
}

function DecisionPathsSection({
  decisionPaths,
  onEvidenceClick,
  resolveEvidenceId,
  focusedEvidenceId,
}: {
  decisionPaths: DecisionPath[];
  onEvidenceClick?: (snippet: string, evidenceId?: string) => void;
  resolveEvidenceId?: (snippet: string) => string | undefined;
  focusedEvidenceId?: string | null;
}) {
  if (!decisionPaths?.length) return null;

  return (
    <div className="rounded-2xl border border-emerald-500/20 bg-slate-950/70 p-4">
      <div className="mb-3 text-xs uppercase text-emerald-300">Operator sequence</div>
      <div className="space-y-4">
        {decisionPaths.slice(0, 3).map((path) => (
          <DecisionPathCard
            key={path.id}
            path={path}
            onEvidenceClick={onEvidenceClick}
            resolveEvidenceId={resolveEvidenceId}
            focusedEvidenceId={focusedEvidenceId}
          />
        ))}
      </div>
    </div>
  );
}

function labelsFor(template: DecisionPath["template"]) {
  if (template === "clinical") {
    return { a: "Finding", b: "Interpretation", c: "Clinical Weight", d: "Next Step", e: "Trap" };
  }
  if (template === "comparison") {
    return { a: "A looks like B", b: "Separating Signal", c: "Why Distinction Matters", d: "Decision Rule", e: "Trap" };
  }
  if (template === "science") {
    return { a: "Trigger", b: "Mechanism", c: "Result", d: "Prediction", e: "Confusion Point" };
  }
  return { a: "State", b: "Risk Signal", c: "Impact", d: "Action", e: "Failure Mode" };
}

function DecisionPathCard({
  path,
  onEvidenceClick,
  resolveEvidenceId,
  focusedEvidenceId,
}: {
  path: DecisionPath;
  onEvidenceClick?: (snippet: string, evidenceId?: string) => void;
  resolveEvidenceId?: (snippet: string) => string | undefined;
  focusedEvidenceId?: string | null;
}) {
  const labels = labelsFor(path.template);

  const anchor = (value: string) => {
    const evidenceId = resolveEvidenceId?.(value);
    const active = Boolean(focusedEvidenceId && evidenceId === focusedEvidenceId);
    return onEvidenceClick ? (
      <button className={`text-left ${active ? "rounded bg-emerald-500/20 px-1" : ""}`} onClick={() => onEvidenceClick(value, evidenceId)}>
        {value}
      </button>
    ) : (
      <>{value}</>
    );
  };

  return (
    <div className="space-y-2 rounded-xl border border-white/10 bg-slate-900/80 p-4">
      <Row label={labels.a} valueNode={anchor(path.condition)} color="text-emerald-300" />
      <Row label={labels.b} valueNode={anchor(path.interpretation)} color="text-cyan-300" />
      <Row label={labels.c} valueNode={anchor(path.implication)} color="text-violet-300" />
      <Row label={labels.d} valueNode={anchor(path.nextMove)} color="text-amber-300" />
      {path.trap ? <Row label={labels.e} valueNode={anchor(path.trap)} color="text-rose-300" /> : null}
      <div className="rounded border border-white/10 bg-black/20 p-2 text-xs text-slate-300">
        Evidence: {path.evidence.map((snippet, idx) => (
          <span key={idx} className="mr-2">{anchor(snippet.length > 90 ? `${snippet.slice(0, 87)}...` : snippet)}</span>
        ))}
      </div>
    </div>
  );
}

function Row({ label, valueNode, color }: { label: string; valueNode: React.ReactNode; color: string }) {
  return (
    <div className="text-sm leading-snug">
      <span className={`font-semibold ${color}`}>{label.toUpperCase()}</span>
      <span className="text-slate-300"> — {valueNode}</span>
    </div>
  );
}
