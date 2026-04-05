import React, { useEffect, useMemo, useState } from "react";
import type { ActivePageContext, PanelTab, ResolvedPanelPayload, RightPanelState } from "@/lib/readerContracts";
import { usePageInsights } from "@/hooks/usePageInsights";
import { useGuidedHighlightSync } from "@/hooks/useGuidedHighlightSync";
import { buildGuidedReadView, type GuidedDepth, type GuidedMode, type GuidedRole } from "@/lib/insights/buildGuidedReadView";
import { evaluatePageTruth } from "@/lib/insights/evaluatePageTruth";
import { classifyPageContent } from "@/lib/pdf/classifyPageContent";
import type { EvidenceAnchor } from "@/lib/insights/types";

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

const modes: Array<{ tab: Exclude<PanelTab, "priority">; label: string; mode: GuidedMode }> = [
  { tab: "insights", label: "Insight", mode: "insight" },
  { tab: "explain", label: "Explain", mode: "explain" },
  { tab: "compare", label: "Compare", mode: "compare" },
  { tab: "relations", label: "Relation", mode: "relation" },
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

  const activeTab: Exclude<PanelTab, "priority"> = (state.activeTab === "priority" ? "insights" : state.activeTab) as Exclude<PanelTab, "priority">;
  const [overrideMode, setOverrideMode] = useState<GuidedMode | null>(null);
  const role: GuidedRole = state.audience === "expert" ? "expert" : state.audience === "clinical" ? "operator" : "general";
  const depth: GuidedDepth = state.depth === "deep" ? "deep" : state.density === "condensed" ? "quick" : "standard";
  const modeFromTab: GuidedMode = activeTab === "insights" ? "insight" : activeTab === "explain" ? "explain" : activeTab === "compare" ? "compare" : "relation";
  const mode: GuidedMode = overrideMode ?? modeFromTab;

  const parseKey = `${ctx.documentId}:${ctx.pageNumber}:${textHash}:${mode}:${role}:${depth}`;
  const insightState = usePageInsights(ctx.pageText || "", ctx.pageNumber, state.audience === "expert", parseKey);
  const contentClass = useMemo(() => classifyPageContent(ctx.pageText || ""), [ctx.pageText]);
  const pageTruth = useMemo(() => evaluatePageTruth({
    visibleDocumentId: ctx.documentId,
    sourceDocumentId: ctx.documentId,
    visiblePageNumber: ctx.pageNumber,
    sourcePageNumber: insightState.pageIndex,
    parseReady: insightState.status === "ready",
    contentClass,
    pageModel: insightState.status === "ready" ? insightState.model : null,
    visiblePageText: ctx.pageText || "",
  }), [contentClass, ctx.documentId, ctx.pageNumber, ctx.pageText, insightState]);
  const guidedView = useMemo(() => {
    if (!pageTruth.canRenderRightPanel) return null;
    if (insightState.status !== "ready") return null;
    if (insightState.pageIndex !== ctx.pageNumber) return null;
    if (insightState.requestKey !== parseKey) return null;
    return buildGuidedReadView({ pageModel: insightState.model, mode, role, depth, pageClass: contentClass });
  }, [ctx.pageNumber, insightState, mode, role, depth, parseKey, pageTruth.canRenderRightPanel, contentClass]);

  useEffect(() => {
    setOverrideMode(null);
  }, [activeTab]);


  const showApply = insightState.status === "ready" && insightState.model.decisionPaths.some((entry) => Boolean(entry.nextMove || entry.trap));

  const resolveFromAnchor = (anchor: EvidenceAnchor) => resolveEvidenceId?.(anchor.text);
  const { selectedStepId, selectStep, clearSelection } = useGuidedHighlightSync({
    steps: guidedView?.steps || [],
    onEvidenceClick,
    resolveEvidenceId: resolveFromAnchor,
    autoFocusOnInit: false,
  });

  useEffect(() => {
    clearSelection();
    onEvidenceClick?.("", undefined);
  }, [ctx.documentId, ctx.pageNumber, parseKey, clearSelection, onEvidenceClick]);

  useEffect(() => {
    if (insightState.status === "loading") clearSelection();
  }, [insightState.status, clearSelection]);

  return (
    <aside className="flex h-full min-h-0 w-full flex-col overflow-y-auto border-l border-white/10 bg-[rgb(11,18,34)] break-words whitespace-normal">
      <div className="border-b border-white/10 p-3">
        <div className="mb-2 flex gap-2 overflow-x-auto">
          {modes.map((item) => (
            <button
              key={item.tab}
              onClick={() => {
                setOverrideMode(null);
                onTabChange(item.tab);
              }}
              className={`rounded-md px-3 py-1.5 text-xs border whitespace-nowrap ${mode === item.mode ? "border-emerald-400/40 bg-emerald-500/20 text-white" : "border-white/10 bg-white/5 text-slate-200"}`}
            >
              {item.label}
            </button>
          ))}
          {showApply ? (
            <button
              onClick={() => setOverrideMode("apply")}
              className={`rounded-md border px-3 py-1.5 text-xs whitespace-nowrap ${mode === "apply" ? "border-amber-400/50 bg-amber-500/20 text-amber-100" : "border-amber-400/40 bg-amber-500/10 text-amber-100"}`}
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
              const value = e.target.value as GuidedDepth;
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

      <div className="flex flex-col gap-4 p-4 text-white">
        {renderTruthFallback(pageTruth.reason, insightState.status, insightState.requestKey !== parseKey)}
        {insightState.status === "error" ? <div className="rounded-2xl border border-rose-500/30 bg-rose-900/20 p-4 text-sm text-rose-100">Could not build reading path for this page.</div> : null}

        {guidedView ? (
          <>
            <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4">
              <div className="text-xs uppercase tracking-wide text-emerald-300">Guided Read</div>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">{guidedView.pagePurpose}</p>
            </div>

            <div className="rounded-2xl border border-emerald-500/20 bg-slate-950/70 p-5">
              <div className="mb-3 text-xs uppercase text-emerald-300">Reading path</div>
              <div className="space-y-4">
                {guidedView.steps.map((step) => {
                  const selected = selectedStepId === step.id;
                  const ev = step.evidence[0]?.text || step.primaryText;
                  const evidenceId = resolveEvidenceId?.(ev);
                  const activeEvidence = Boolean(focusedEvidenceId && evidenceId === focusedEvidenceId);
                  return (
                    <button
                      key={step.id}
                      onClick={() => selectStep(step, true)}
                      className={`w-full rounded-xl border p-4 text-left whitespace-normal break-words ${selected || activeEvidence ? "border-emerald-400/40 bg-emerald-500/10" : "border-white/10 bg-slate-900/80"}`}
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-[11px] font-semibold text-emerald-200">{step.stepNumber}</span>
                        <span className="text-xs uppercase tracking-wide text-emerald-200">{step.label}</span>
                      </div>
                      <p className="text-sm leading-relaxed text-slate-200">{step.primaryText}</p>
                      {step.secondaryText ? <p className="mt-2 text-xs text-slate-300">{step.secondaryText}</p> : null}
                      {step.evidence.length ? (
                        <div className="mt-2 space-y-1">
                          {step.evidence.slice(0, depth === "quick" ? 1 : depth === "standard" ? 2 : 3).map((anchor) => (
                            <p key={anchor.id} className="text-[11px] leading-relaxed text-slate-400">↳ {anchor.text}</p>
                          ))}
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            {guidedView.supportTitle && guidedView.supportBullets?.length ? (
              <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
                <div className="mb-2 text-xs uppercase text-slate-400">{guidedView.supportTitle}</div>
                <ul className="space-y-1 text-sm text-slate-200">
                  {guidedView.supportBullets.map((bullet, index) => (
                    <li key={`${bullet}-${index}`}>• {bullet}</li>
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


function renderTruthFallback(reason: string, status: string, keyMismatch: boolean) {
  if (status === "loading" || keyMismatch || reason === "loading") {
    return <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 text-sm text-slate-300">GUIDED READ · Reading current page…</div>;
  }
  if (reason === "image_only") {
    return <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 text-sm text-slate-300">This page is primarily image-based. No grounded text was extracted from the current page.</div>;
  }
  if (reason === "form_page") {
    return <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 text-sm text-slate-300">This page is primarily a form or structured intake page. Guided prose extraction is not shown here.</div>;
  }
  if (reason === "table_heavy") {
    return <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 text-sm text-slate-300">This page is table-heavy. Guided prose mode is limited until table summarization is enabled.</div>;
  }
  if (reason === "front_matter") {
    return <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 text-sm text-slate-300">This page appears to be front matter/copyright content, so guided reasoning is withheld.</div>;
  }
  if (reason !== "ok") {
    return <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 text-sm text-slate-300">Not enough grounded text was extracted from the current page to build a reliable reading path.</div>;
  }
  return null;
}
