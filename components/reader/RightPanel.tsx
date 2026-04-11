import React, { useEffect, useMemo, useState } from "react";
import type { ActivePageContext, PanelTab, ResolvedPanelPayload, RightPanelState } from "@/lib/readerContracts";
import { useGuidedHighlightSync } from "@/hooks/useGuidedHighlightSync";
import { buildGuidedReadView, type GuidedDepth, type GuidedMode, type GuidedRole } from "@/lib/insights/buildGuidedReadView";
import type { DecisionDrill, EvidenceAnchor, OperatorCard, OperatorCardKind } from "@/lib/insights/types";
import type { ActivePageIntelligenceSnapshot } from "@/lib/useActivePageIntelligence";

interface RightPanelProps {
  ctx: ActivePageContext;
  state: RightPanelState;
  onTabChange: (tab: PanelTab) => void;
  onAudienceChange: (value: RightPanelState["audience"]) => void;
  onDepthChange: (value: RightPanelState["depth"]) => void;
  onDensityChange: (value: RightPanelState["density"]) => void;
  payload?: ResolvedPanelPayload;
  intelligence: ActivePageIntelligenceSnapshot;
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
  intelligence,
  onEvidenceClick,
  resolveEvidenceId,
  focusedEvidenceId,
}: RightPanelProps) {
  const activeTab: Exclude<PanelTab, "priority"> = (state.activeTab === "priority" ? "insights" : state.activeTab) as Exclude<PanelTab, "priority">;
  const [overrideMode, setOverrideMode] = useState<GuidedMode | null>(null);
  const role: GuidedRole = state.audience === "expert" ? "expert" : state.audience === "clinical" ? "operator" : "general";
  const depth: GuidedDepth = state.depth === "deep" ? "deep" : state.density === "condensed" ? "quick" : "standard";
  const modeFromTab: GuidedMode = activeTab === "insights" ? "insight" : activeTab === "explain" ? "explain" : activeTab === "compare" ? "compare" : "relation";
  const mode: GuidedMode = overrideMode ?? modeFromTab;
  const pageTruthKey = intelligence.pageTruthKey;
  const pageModel = intelligence.pageModel;
  const pageTruth = intelligence.pageTruth;
  const isCurrentPageModel = Boolean(intelligence.isCurrentPage && pageModel && intelligence.status === "ready");

  const guidedView = useMemo(() => {
    if (!pageTruth?.canRenderRightPanel) return null;
    if (!isCurrentPageModel) return null;
    if (!pageModel) return null;
    return buildGuidedReadView({
      pageModel,
      pageStory: intelligence.story || pageModel.pageStory || null,
      mode,
      role,
      depth,
      pageClass: intelligence.pageClass || undefined,
    });
  }, [pageTruth?.canRenderRightPanel, isCurrentPageModel, pageModel, mode, role, depth, intelligence.story, intelligence.pageClass]);

  useEffect(() => {
    setOverrideMode(null);
  }, [activeTab]);

  const showApply = Boolean(pageModel?.decisionPaths.some((entry) => Boolean(entry.nextMove || entry.trap)));

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
  }, [pageTruthKey, clearSelection, onEvidenceClick]);

  useEffect(() => {
    if (intelligence.status === "loading") clearSelection();
  }, [intelligence.status, clearSelection]);

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
        {renderTruthFallback(pageTruth?.reason || "loading", intelligence.status, !isCurrentPageModel)}
        {intelligence.status === "error" ? <div className="rounded-2xl border border-rose-500/30 bg-rose-900/20 p-4 text-sm text-rose-100">Could not build reading path for this page.</div> : null}

        {intelligence.priorityHighlights.all.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Read in this order</p>
            {intelligence.priorityHighlights.all.slice(0, 5).map((block, i) => (
              <button
                key={block.id}
                onClick={() => onEvidenceClick?.("", `priority-${block.id}`)}
                className="flex w-full items-start gap-2 rounded-md bg-white/5 px-2 py-1.5 text-left transition-colors hover:bg-white/10"
              >
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-600 text-[10px] text-white">
                  {i + 1}
                </span>
                <span className="line-clamp-2 text-xs leading-relaxed text-slate-300">
                  <span className="font-medium text-slate-200">{block.kind.replace(/_/g, " ")}: </span>
                  {block.text.length > 80 ? `${block.text.slice(0, 80)}…` : block.text}
                </span>
              </button>
            ))}
          </div>
        )}

        {guidedView ? (
          <>
            <ModeIntentHeader mode={mode} pagePurpose={guidedView.pagePurpose} />

            {mode === "apply" && guidedView.drill ? (
              <DecisionDrillView drill={guidedView.drill} depth={depth} />
            ) : (
              <div className="rounded-2xl border border-emerald-500/20 bg-slate-950/70 p-5">
                <div className="mb-3 text-xs uppercase text-emerald-300">Operator view</div>
                {guidedView.cards?.length ? (
                  <div className="space-y-3">
                    {guidedView.cards.map((card) => <OperatorCardView key={card.id} card={card} />)}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(() => {
                      const ac = mode === "explain"
                        ? { active: "border-violet-400/40 bg-violet-500/10", num: "bg-violet-500/20 text-violet-200", label: "text-violet-200" }
                        : mode === "compare"
                          ? { active: "border-cyan-400/40 bg-cyan-500/10", num: "bg-cyan-500/20 text-cyan-200", label: "text-cyan-200" }
                          : mode === "relation"
                            ? { active: "border-blue-400/40 bg-blue-500/10", num: "bg-blue-500/20 text-blue-200", label: "text-blue-200" }
                            : mode === "apply"
                              ? { active: "border-amber-400/50 bg-amber-500/20", num: "bg-amber-500/20 text-amber-200", label: "text-amber-200" }
                              : { active: "border-emerald-400/40 bg-emerald-500/10", num: "bg-emerald-500/20 text-emerald-200", label: "text-emerald-200" };
                      return guidedView.steps.map((step) => {
                      const selected = selectedStepId === step.id;
                      const ev = step.evidence[0]?.text || step.primaryText;
                      const evidenceId = resolveEvidenceId?.(ev);
                      const activeEvidence = Boolean(focusedEvidenceId && evidenceId === focusedEvidenceId);
                      const trapLike = /\b(trap|wrong move|pitfall|boundary)\b/i.test(step.label);
                      return (
                        <button
                          key={step.id}
                          onClick={() => selectStep(step, true)}
                          className={`w-full rounded-xl border p-4 text-left whitespace-normal break-words ${
                            selected || activeEvidence
                              ? trapLike ? "border-rose-400/50 bg-rose-500/10" : ac.active
                              : trapLike ? "border-rose-500/30 bg-rose-950/30" : "border-white/10 bg-slate-900/80"
                          }`}
                        >
                          <div className="mb-2 flex items-center gap-2">
                            <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${trapLike ? "bg-rose-500/20 text-rose-200" : ac.num}`}>{step.stepNumber}</span>
                            <span className={`text-xs uppercase tracking-wide ${trapLike ? "text-rose-300" : ac.label}`}>{step.label}</span>
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
                    });
                    })()}
                  </div>
                )}
              </div>
            )}

            {guidedView.supportTitle && guidedView.supportBullets?.length && mode !== "apply" ? (
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

function cardClasses(kind: OperatorCardKind, severity?: "low" | "medium" | "high") {
  if (kind === "trap") return severity === "high" ? "rounded-2xl border border-red-400/60 bg-red-500/15 p-4" : severity === "medium" ? "rounded-2xl border border-amber-400/60 bg-amber-500/15 p-4" : "rounded-2xl border border-orange-300/50 bg-orange-500/10 p-4";
  if (kind === "decision") return "rounded-2xl border border-blue-400/40 bg-blue-500/10 p-4";
  if (kind === "application") return "rounded-2xl border border-indigo-300/40 bg-indigo-500/10 p-4";
  if (kind === "mechanism") return "rounded-2xl border border-violet-300/40 bg-violet-500/10 p-4";
  if (kind === "distinction") return "rounded-2xl border border-emerald-300/40 bg-emerald-500/10 p-4";
  if (kind === "relation") return "rounded-2xl border border-cyan-300/40 bg-cyan-500/10 p-4";
  return "rounded-2xl border border-slate-300/30 bg-slate-900/70 p-4";
}

function titleClasses(kind: OperatorCardKind) {
  if (kind === "trap") return "text-xs font-semibold uppercase tracking-wide text-amber-200";
  if (kind === "decision") return "text-xs font-semibold uppercase tracking-wide text-blue-200";
  if (kind === "application") return "text-xs font-semibold uppercase tracking-wide text-indigo-200";
  if (kind === "mechanism") return "text-xs font-semibold uppercase tracking-wide text-violet-200";
  if (kind === "distinction") return "text-xs font-semibold uppercase tracking-wide text-emerald-200";
  if (kind === "relation") return "text-xs font-semibold uppercase tracking-wide text-cyan-200";
  return "text-xs font-semibold uppercase tracking-wide text-slate-200";
}

function OperatorCardView({ card }: { card: OperatorCard }) {
  return (
    <section className={cardClasses(card.kind, card.severity)}>
      <div className={titleClasses(card.kind)}>{card.title}</div>
      <div className="mt-2 text-sm font-medium leading-6 text-slate-100">{card.primary}</div>
      {card.bullets?.length ? (
        <ul className="mt-3 space-y-1">
          {card.bullets.map((bullet, idx) => (
            <li key={`${card.id}-${idx}`} className="text-xs text-slate-300 leading-5">• {bullet}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

const MODE_INTENT: Record<GuidedMode, { question: string; color: string }> = {
  insight:    { question: "What matters on this page?",   color: "text-emerald-300" },
  explain:    { question: "How does this actually work?", color: "text-violet-300" },
  compare:    { question: "What gets confused with what?", color: "text-cyan-300" },
  relation:   { question: "What connects to what?",       color: "text-blue-300" },
  apply:      { question: "What would you do?",           color: "text-amber-300" },
};

function ModeIntentHeader({ mode, pagePurpose }: { mode: GuidedMode; pagePurpose: string }) {
  const intent = MODE_INTENT[mode];
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4">
      <div className={`text-[10px] font-semibold uppercase tracking-widest ${intent.color}`}>{intent.question}</div>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{pagePurpose}</p>
    </div>
  );
}

function DecisionDrillView({ drill, depth }: { drill: DecisionDrill; depth: GuidedDepth }) {
  return (
    <div className="space-y-2.5">
      {/* Case Cue */}
      <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4">
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-amber-300">Case Cue</div>
        <p className="text-sm font-medium leading-6 text-slate-100">{drill.caseCue}</p>
        {drill.caseCueContext ? <p className="mt-1 text-xs text-amber-200/70">{drill.caseCueContext}</p> : null}
      </div>

      {/* Best Next Move */}
      <div className="rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-4">
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-emerald-300">Best Next Move</div>
        <p className="text-sm font-medium leading-6 text-slate-100">{drill.bestNextMove}</p>
        {drill.bestNextMoveSteps.length > 0 ? (
          <ul className="mt-2 space-y-0.5">
            {drill.bestNextMoveSteps.slice(0, depth === "quick" ? 1 : 3).map((step, i) => (
              <li key={i} className="text-xs text-slate-300 leading-5">→ {step}</li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* Why */}
      {drill.why ? (
        <div className="rounded-2xl border border-violet-400/30 bg-violet-500/10 p-4">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-violet-300">Why</div>
          <p className="text-sm leading-6 text-slate-200">{drill.why}</p>
        </div>
      ) : null}

      {/* Wrong Move */}
      {drill.wrongMove ? (
        <div className="rounded-2xl border border-rose-400/50 bg-rose-500/10 p-4">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-rose-300">Wrong Move</div>
          <p className="text-sm font-medium leading-6 text-slate-100">{drill.wrongMove}</p>
          {drill.wrongMoveReason ? <p className="mt-1 text-xs text-rose-200/70">{drill.wrongMoveReason}</p> : null}
        </div>
      ) : null}

      {/* Exam Test */}
      {drill.examTest && depth !== "quick" ? (
        <div className="rounded-2xl border border-slate-400/20 bg-slate-800/60 p-4">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Exam Test</div>
          <p className="text-sm italic leading-6 text-slate-300">{drill.examTest}</p>
        </div>
      ) : null}
    </div>
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
