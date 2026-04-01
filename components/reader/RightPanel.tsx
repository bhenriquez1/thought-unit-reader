import React, { useEffect, useMemo, useState } from "react";
import type { ActivePageContext, PanelTab, ResolvedPanelPayload, RightPanelState } from "@/lib/readerContracts";
import { usePageInsights } from "@/hooks/usePageInsights";
import type { DecisionPath } from "@/lib/insights/types";
import { buildPanelView, type PanelDepth, type PanelMode, type PanelRole } from "@/lib/insights/buildPanelView";
import { buildGuidedReadView } from "@/lib/insights/buildGuidedReadView";

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
  const textHash = useMemo(() => {
    const src = ctx.pageText || "";
    let hash = 0;
    for (let i = 0; i < src.length; i += 1) hash = (hash * 31 + src.charCodeAt(i)) | 0;
    return String(hash);
  }, [ctx.pageText]);
  const activeMode: Exclude<PanelTab, "priority"> = (state.activeTab === "priority" ? "insights" : state.activeTab) as Exclude<PanelTab, "priority">;

  const role: PanelRole = state.audience === "expert" ? "expert" : state.audience === "clinical" ? "operator" : "general";
  const depth: PanelDepth = state.depth === "deep" ? "deep" : state.density === "condensed" ? "quick" : "standard";
  const mode: PanelMode = activeMode === "insights" ? "insight" : activeMode === "relations" ? "relation" : activeMode === "compare" ? "compare" : activeMode === "explain" ? "explain" : "apply";
  const parseKey = `${ctx.documentId}:${ctx.pageNumber}:${textHash}:${mode}:${role}:${depth}`;
  const insightState = usePageInsights(ctx.pageText || "", ctx.pageNumber, state.audience === "expert", parseKey);
  const guidedView = useMemo(() => {
    if (insightState.status !== "ready") return null;
    buildPanelView({ pageModel: insightState.model, mode, role, depth });
    return buildGuidedReadView({ pageModel: insightState.model, mode, role, depth });
  }, [insightState, mode, role, depth]);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  useEffect(() => {
    if (!guidedView?.steps?.length) {
      setSelectedStepId(null);
      return;
    }
    setSelectedStepId(guidedView.steps[0].id);
  }, [guidedView?.steps, ctx.pageNumber, mode, role, depth]);
  const showApplyTest = insightState.status === "ready" && insightState.model.decisionPaths.some((entry) => Boolean(entry.trap || entry.nextMove));

  return (
    <aside className="flex h-full min-h-0 w-full flex-col overflow-y-auto border-l border-white/10 bg-[rgb(11,18,34)] break-words">
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
            <option value="student">General</option>
            <option value="clinical">Operator</option>
            <option value="expert">Expert</option>
          </select>
          <select
            value={depth}
            onChange={(e) => {
              const value = e.target.value as PanelDepth;
              if (value === "deep") {
                onDepthChange("deep");
                onDensityChange("expanded");
              } else if (value === "quick") {
                onDepthChange("standard");
                onDensityChange("condensed");
              } else {
                onDepthChange("standard");
                onDensityChange("expanded");
              }
            }}
            className="rounded-md border border-white/10 bg-slate-900 px-2 py-1 text-xs text-white"
          >
            <option value="quick">Quick</option>
            <option value="standard">Standard</option>
            <option value="deep">Deep</option>
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-4 text-white whitespace-normal">
        {insightState.status === "loading" ? (
          <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 text-sm text-slate-300">Reading current page…</div>
        ) : null}
        {insightState.status === "error" ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-900/20 p-4 text-sm text-rose-100">{insightState.message}</div>
        ) : null}
        {guidedView ? (
          <>
        <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4">
          <div className="text-xs uppercase tracking-wide text-emerald-300">Guided Read</div>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">{guidedView.pagePurpose}</p>
        </div>

        <GuidedStepsSection
          steps={guidedView.steps}
          selectedStepId={selectedStepId}
          onSelectStep={setSelectedStepId}
          onEvidenceClick={onEvidenceClick}
          resolveEvidenceId={resolveEvidenceId}
          focusedEvidenceId={focusedEvidenceId}
        />
        {guidedView.supportTitle && guidedView.supportBullets?.length ? (
          <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4">
            <div className="mb-2 text-xs uppercase text-slate-400">{guidedView.supportTitle}</div>
            <ul className="space-y-1 text-sm text-slate-200">
              {guidedView.supportBullets.map((takeaway, index) => (
                <li key={`${takeaway}-${index}`}>• {takeaway}</li>
              ))}
            </ul>
          </div>
        ) : null}
          </>
        ) : null}
      </div>
    </aside>
  );
}

function GuidedStepsSection({
  steps,
  selectedStepId,
  onSelectStep,
  onEvidenceClick,
  resolveEvidenceId,
  focusedEvidenceId,
}: {
  steps: Array<{ id: string; stepNumber: number; label: string; primaryText: string; secondaryText?: string; evidence: Array<{ text: string }> }>;
  selectedStepId: string | null;
  onSelectStep: (id: string) => void;
  onEvidenceClick?: (snippet: string, evidenceId?: string) => void;
  resolveEvidenceId?: (snippet: string) => string | undefined;
  focusedEvidenceId?: string | null;
}) {
  if (!steps?.length) return null;

  return (
    <div className="rounded-2xl border border-emerald-500/20 bg-slate-950/70 p-5">
      <div className="mb-3 text-xs uppercase text-emerald-300">Guided Steps</div>
      <div className="space-y-4">
        {steps.map((step) => (
          <GuidedStepCard
            key={step.id}
            step={step}
            selected={selectedStepId === step.id}
            onSelect={() => onSelectStep(step.id)}
            onEvidenceClick={onEvidenceClick}
            resolveEvidenceId={resolveEvidenceId}
            focusedEvidenceId={focusedEvidenceId}
          />
        ))}
      </div>
    </div>
  );
}

function GuidedStepCard({
  step,
  selected,
  onSelect,
  onEvidenceClick,
  resolveEvidenceId,
  focusedEvidenceId,
}: {
  step: { id: string; stepNumber: number; label: string; primaryText: string; secondaryText?: string; evidence: Array<{ text: string }> };
  selected: boolean;
  onSelect: () => void;
  onEvidenceClick?: (snippet: string, evidenceId?: string) => void;
  resolveEvidenceId?: (snippet: string) => string | undefined;
  focusedEvidenceId?: string | null;
}) {
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
    <div className={`space-y-3 rounded-xl border p-5 ${selected ? "border-emerald-400/50 bg-emerald-900/10" : "border-white/10 bg-slate-900/80"}`}>
      <button onClick={onSelect} className="w-full text-left">
        <p className="text-xs uppercase tracking-wide text-emerald-300">{step.stepNumber}. {step.label}</p>
        <p className="mt-1 text-sm text-slate-100">{anchor(step.primaryText)}</p>
        {step.secondaryText ? <p className="mt-1 text-xs text-slate-300">{anchor(step.secondaryText)}</p> : null}
      </button>
      <div className="rounded border border-white/10 bg-black/20 p-3 text-xs text-slate-300 whitespace-normal break-words">
        Evidence: {step.evidence.map((snippet, idx) => (
          <span key={idx} className="mr-2">{anchor(snippet.text.length > 90 ? `${snippet.text.slice(0, 87)}...` : snippet.text)}</span>
        ))}
      </div>
    </div>
  );
}
