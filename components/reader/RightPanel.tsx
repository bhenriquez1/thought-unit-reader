import React, { useEffect, useMemo } from "react";
import type { ActivePageContext, ResolvedPanelPayload, RightPanelState } from "@/lib/readerContracts";
import { useGuidedHighlightSync } from "@/hooks/useGuidedHighlightSync";
import { buildGuidedReadView, type GuidedDepth, type GuidedMode, type GuidedRole } from "@/lib/insights/buildGuidedReadView";
import { compressToNote } from "@/lib/insights/sentenceCleanup";
import type { EvidenceAnchor } from "@/lib/insights/types";
import type { ActivePageIntelligenceSnapshot } from "@/lib/useActivePageIntelligence";
import type { SemanticHighlightKind } from "@/lib/highlights/extractPriorityHighlights";

interface RightPanelProps {
  ctx: ActivePageContext;
  state: RightPanelState;
  payload?: ResolvedPanelPayload;
  intelligence: ActivePageIntelligenceSnapshot;
  onEvidenceClick?: (snippet: string, evidenceId?: string) => void;
  resolveEvidenceId?: (snippet: string) => string | undefined;
  focusedEvidenceId?: string | null;
}

// Operator View — one mode, no tabs, no audience/depth controls.
const ROLE: GuidedRole = "operator";
const DEPTH: GuidedDepth = "standard";
const MODE: GuidedMode = "insight";

// Map semantic kind → human-readable role label + accent color
const KIND_ROLE: Record<SemanticHighlightKind | string, { label: string; color: string }> = {
  main_pattern:        { label: "Signal",      color: "text-amber-300" },
  main_mechanism:      { label: "Mechanism",   color: "text-violet-300" },
  support_decision:    { label: "Rule",        color: "text-blue-300" },
  support_explanation: { label: "Key Point",   color: "text-emerald-300" },
  trap_warning:        { label: "Trap",        color: "text-rose-300" },
  trap_boundary:       { label: "Boundary",    color: "text-orange-300" },
  support_distinction: { label: "Distinction", color: "text-cyan-300" },
  support_relation:    { label: "Connection",  color: "text-sky-300" },
  support_application: { label: "Action",      color: "text-indigo-300" },
  weak_caveat:         { label: "Caveat",      color: "text-slate-400" },
};

function kindMeta(kind: string, shortLabel?: string): { label: string; color: string } {
  // shortLabel from extractPriorityHighlights takes priority ("Bottom Line", etc.)
  if (shortLabel && shortLabel !== kind.replace(/_/g, " ")) {
    const color = shortLabel === "Trap" ? "text-rose-300"
      : shortLabel === "Mechanism" ? "text-violet-300"
      : shortLabel === "Signal" ? "text-amber-300"
      : shortLabel === "Rule" ? "text-blue-300"
      : shortLabel === "Action" ? "text-indigo-300"
      : shortLabel === "Bottom Line" ? "text-emerald-300"
      : "text-slate-300";
    return { label: shortLabel, color };
  }
  return KIND_ROLE[kind] ?? { label: kind.replace(/_/g, " "), color: "text-slate-300" };
}

export function RightPanel({
  state,
  intelligence,
  onEvidenceClick,
  resolveEvidenceId,
  focusedEvidenceId,
}: RightPanelProps) {
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
      mode: MODE,
      role: ROLE,
      depth: DEPTH,
      pageClass: intelligence.pageClass || undefined,
    });
  }, [pageTruth?.canRenderRightPanel, isCurrentPageModel, pageModel, intelligence.story, intelligence.pageClass]);

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

  const readingItems = intelligence.priorityHighlights.all.slice(0, 5);

  return (
    <aside className="flex h-full min-h-0 w-full flex-col overflow-y-auto border-l border-white/10 bg-[rgb(11,18,34)] break-words whitespace-normal">
      {/* Header */}
      <div className="border-b border-white/10 px-4 py-3">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-emerald-400">Operator View</div>
        <div className="mt-0.5 text-[11px] text-slate-500">Current page · {intelligence.status === "loading" ? "reading…" : "ready"}</div>
      </div>

      <div className="flex flex-col gap-4 p-4 text-white">
        {renderTruthFallback(pageTruth?.reason || "loading", intelligence.status, !isCurrentPageModel)}
        {intelligence.status === "error" ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-900/20 p-4 text-sm text-rose-100">
            Could not build reading path for this page.
          </div>
        ) : null}

        {/* Read in this order — role-labeled complete sentences */}
        {readingItems.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Read in this order</p>
            {readingItems.map((block, i) => {
              const meta = kindMeta(block.kind, block.shortLabel);
              return (
                <button
                  key={block.id}
                  onClick={() => onEvidenceClick?.("", `priority-${block.id}`)}
                  className="flex w-full items-start gap-2.5 rounded-lg bg-white/5 px-3 py-2 text-left transition-colors hover:bg-white/10 active:bg-white/15"
                >
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-700 text-[10px] font-bold text-white">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className={`text-[9px] font-semibold uppercase tracking-wider ${meta.color}`}>{meta.label}</span>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-200">{compressToNote(block.text, (block.shortLabel || block.kind).toLowerCase())}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {guidedView ? (
          <>
            {/* Page purpose */}
            <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-emerald-300">What matters on this page</div>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{compressToNote(guidedView.pagePurpose, "signal")}</p>
            </div>

            {/* Operator step cards */}
            <div className="rounded-2xl border border-emerald-500/20 bg-slate-950/70 p-5">
              <div className="mb-3 text-[10px] uppercase tracking-wider text-emerald-400">Operator View</div>
              {guidedView.cards?.length ? (
                <div className="space-y-3">
                  {guidedView.cards.map((card) => <OperatorCardView key={card.id} card={card} />)}
                </div>
              ) : (
                <div className="space-y-3">
                  {guidedView.steps.map((step) => {
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
                            ? trapLike
                              ? "border-rose-400/50 bg-rose-500/10"
                              : "border-emerald-400/40 bg-emerald-500/10"
                            : trapLike
                              ? "border-rose-500/30 bg-rose-950/30"
                              : "border-white/10 bg-slate-900/80"
                        }`}
                      >
                        <div className="mb-2 flex items-center gap-2">
                          <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${trapLike ? "bg-rose-500/20 text-rose-200" : "bg-emerald-500/20 text-emerald-200"}`}>
                            {step.stepNumber}
                          </span>
                          <span className={`text-xs uppercase tracking-wide ${trapLike ? "text-rose-300" : "text-emerald-300"}`}>
                            {step.label}
                          </span>
                        </div>
                        <p className="text-sm leading-relaxed text-slate-200">{step.primaryText}</p>
                        {step.secondaryText ? (
                          <p className="mt-2 text-xs text-slate-300">{step.secondaryText}</p>
                        ) : null}
                        {step.evidence.length ? (
                          <div className="mt-2 space-y-1">
                            {step.evidence.slice(0, 2).map((anchor) => (
                              <p key={anchor.id} className="text-[11px] leading-relaxed text-slate-400">↳ {anchor.text}</p>
                            ))}
                          </div>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Grounded support */}
            {guidedView.supportTitle && guidedView.supportBullets?.length ? (
              <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
                <div className="mb-2 text-[10px] uppercase tracking-wider text-slate-400">{guidedView.supportTitle}</div>
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

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function cardBorderClass(kind: string, severity?: string) {
  if (kind === "trap") return severity === "high" ? "border-red-400/60 bg-red-500/15" : "border-rose-400/50 bg-rose-500/10";
  if (kind === "decision") return "border-blue-400/40 bg-blue-500/10";
  if (kind === "mechanism") return "border-violet-300/40 bg-violet-500/10";
  return "border-emerald-400/30 bg-emerald-500/10";
}

function cardTitleClass(kind: string) {
  if (kind === "trap") return "text-rose-300";
  if (kind === "decision") return "text-blue-200";
  if (kind === "mechanism") return "text-violet-200";
  return "text-emerald-200";
}

import type { OperatorCard } from "@/lib/insights/types";

function OperatorCardView({ card }: { card: OperatorCard }) {
  return (
    <section className={`rounded-2xl border p-4 ${cardBorderClass(card.kind, card.severity)}`}>
      <div className={`text-xs font-semibold uppercase tracking-wide ${cardTitleClass(card.kind)}`}>{card.title}</div>
      <div className="mt-2 text-sm font-medium leading-6 text-slate-100">{card.primary}</div>
      {card.bullets?.length ? (
        <ul className="mt-3 space-y-1">
          {card.bullets.map((bullet, idx) => (
            <li key={`${card.id}-${idx}`} className="text-xs leading-5 text-slate-300">• {bullet}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function renderTruthFallback(reason: string, status: string, keyMismatch: boolean) {
  if (status === "loading" || keyMismatch || reason === "loading") {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 text-sm text-slate-300">
        OPERATOR VIEW · Reading current page…
      </div>
    );
  }
  if (reason === "image_only") {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 text-sm text-slate-300">
        This page is primarily image-based. No grounded text was extracted.
      </div>
    );
  }
  if (reason === "form_page") {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 text-sm text-slate-300">
        This page is a form or structured intake page. Guided extraction is not shown here.
      </div>
    );
  }
  if (reason === "table_heavy") {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 text-sm text-slate-300">
        This page is table-heavy. Guided prose mode is limited until table summarization is enabled.
      </div>
    );
  }
  if (reason === "front_matter") {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 text-sm text-slate-300">
        This page appears to be front matter, so guided reasoning is withheld.
      </div>
    );
  }
  if (reason !== "ok") {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 text-sm text-slate-300">
        Not enough grounded text was extracted from this page to build a reading path.
      </div>
    );
  }
  return null;
}
