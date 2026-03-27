import React, { useMemo } from "react";
import type {
  ActivePageContext,
  RightPanelState,
  PanelTab,
  ResolvedPanelPayload,
} from "@/lib/readerContracts";
import { resolvePanelPayload } from "@/lib/panelEngine";

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

const tabBtn =
  "rounded-md px-3 py-1.5 text-xs border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 whitespace-nowrap";
const activeTabBtn =
  "rounded-md px-3 py-1.5 text-xs border border-emerald-400/40 bg-emerald-500/20 text-white whitespace-nowrap";

export function RightPanel({
  ctx,
  state,
  onTabChange,
  onAudienceChange,
  onDepthChange,
  onDensityChange,
  payload: payloadOverride,
  onEvidenceClick,
  resolveEvidenceId,
  focusedEvidenceId,
}: RightPanelProps) {
  const payload = useMemo(
    () => payloadOverride ?? resolvePanelPayload(ctx, state.audience, state.depth),
    [ctx, payloadOverride, state.audience, state.depth],
  );

  const bodyClass = state.density === "expanded" ? "space-y-4 text-sm" : "space-y-3 text-[13px]";
  const showFormulaSection = Boolean(ctx.formulas?.length) && (payload.classification.pageType === "formula" || payload.classification.secondaryTypes.some((entry) => entry.type === "formula" && entry.confidence >= 0.5));

  return (
    <aside className="flex h-full min-h-0 w-full flex-col overflow-hidden border-l border-white/10 bg-[rgb(11,18,34)]">
      <div className="shrink-0 sticky top-0 z-10 bg-[rgb(11,18,34)] border-b border-white/10">
      <div className="p-3">
        <div className="rounded-lg border border-white/10 bg-slate-800/60 px-3 py-2">
          <p className="text-sm font-semibold text-white">{ctx.sectionTitle || ctx.chapterTitle || "Current Page"}</p>
          <p className="mt-1 text-[11px] text-slate-400">Page {ctx.pageNumber} of {ctx.totalPages}</p>
          <p className="mt-1 text-[11px] text-emerald-300">Page type: {payload.classification.pageType}</p>
          {payload.classification.confidence < 0.35 || (ctx.pageText || "").trim().length < 120 ? (
            <p className="mt-2 rounded bg-amber-500/15 px-2 py-1 text-[11px] text-amber-100">
              Limited evidence on this page. Extraction is conservative to avoid fabricated output.
            </p>
          ) : null}
        </div>
      </div>

      <div className="border-t border-white/5 px-3 py-2">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(["priority", "explain", "relations", "compare", "insights"] as PanelTab[]).map((tab) => (
            <button key={tab} className={state.activeTab === tab ? activeTabBtn : tabBtn} onClick={() => onTabChange(tab)}>
              {tab[0].toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <select value={state.audience} onChange={(e) => onAudienceChange(e.target.value as RightPanelState["audience"])} className="rounded-md border border-white/10 bg-slate-900 px-2 py-1 text-xs text-white">
            <option value="student">Student</option><option value="clinical">Clinical</option><option value="expert">Expert</option>
          </select>
          <select value={state.depth} onChange={(e) => onDepthChange(e.target.value as RightPanelState["depth"])} className="rounded-md border border-white/10 bg-slate-900 px-2 py-1 text-xs text-white">
            <option value="standard">Standard</option><option value="deep">Deep</option>
          </select>
          <select value={state.density} onChange={(e) => onDensityChange(e.target.value as RightPanelState["density"])} className="rounded-md border border-white/10 bg-slate-900 px-2 py-1 text-xs text-white">
            <option value="condensed">Condensed</option><option value="expanded">Expanded</option>
          </select>
        </div>
      </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 pr-2">
        {state.activeTab === "priority" && (
          <div className={bodyClass}>
            <Section title="What this page is doing"><p>{payload.priority.pageRole}</p></Section>
            <Section title="Primary Goal"><p>{payload.priority.primaryGoal}</p></Section>
            <Section title="Main ideas"><BulletList items={payload.priority.mainIdeas} onItemClick={onEvidenceClick} resolveEvidenceId={resolveEvidenceId} focusedEvidenceId={focusedEvidenceId} /></Section>
            <Section title="Why it matters"><BulletList items={payload.priority.whyItMatters} onItemClick={onEvidenceClick} resolveEvidenceId={resolveEvidenceId} focusedEvidenceId={focusedEvidenceId} /></Section>
            <Section title="What to remember"><BulletList items={payload.priority.whatToRemember} onItemClick={onEvidenceClick} resolveEvidenceId={resolveEvidenceId} focusedEvidenceId={focusedEvidenceId} /></Section>
            <Section title="What to ignore"><BulletList items={payload.priority.whatToIgnore || []} onItemClick={onEvidenceClick} resolveEvidenceId={resolveEvidenceId} focusedEvidenceId={focusedEvidenceId} /></Section>
          </div>
        )}

        {state.activeTab === "explain" && (
          <div className={bodyClass}>
            <Section title="Meaning"><p>{payload.explain.meaning}</p></Section>
            <Section title="Mechanism / Why"><p>{payload.explain.mechanism}</p></Section>
            <Section title="Stepwise Breakdown"><ol className="list-decimal space-y-1 pl-5">{payload.explain.stepwiseBreakdown.map((item, i) => <li key={i}>{item}</li>)}</ol></Section>
            <Section title="Application"><BulletList items={payload.explain.application} onItemClick={onEvidenceClick} resolveEvidenceId={resolveEvidenceId} focusedEvidenceId={focusedEvidenceId} /></Section>
            {showFormulaSection && (
              <Section title="Formula">
                <div className="space-y-2">
                  {(ctx.formulas ?? []).map((formula, idx) => (
                    <FormulaBlock key={idx} formula={formula.normalized} speakable={formula.speakable} usage={formula.usage} trap={formula.trap} />
                  ))}
                </div>
              </Section>
            )}
          </div>
        )}

        {state.activeTab === "relations" && (
          <div className={bodyClass}>
            <Section title="Prerequisites"><BulletList items={payload.relations.prerequisites} onItemClick={onEvidenceClick} resolveEvidenceId={resolveEvidenceId} focusedEvidenceId={focusedEvidenceId} /></Section>
            <Section title="Current Links"><BulletList items={payload.relations.currentLinks} onItemClick={onEvidenceClick} resolveEvidenceId={resolveEvidenceId} focusedEvidenceId={focusedEvidenceId} /></Section>
            <Section title="Downstream Links"><BulletList items={payload.relations.downstreamLinks} onItemClick={onEvidenceClick} resolveEvidenceId={resolveEvidenceId} focusedEvidenceId={focusedEvidenceId} /></Section>
          </div>
        )}

        {state.activeTab === "compare" && (
          <div className={bodyClass}>
            {payload.compare.hasMeaningfulCompare ? (
              <Section title={payload.compare.compareTitle || "Compare"}>
                <p className="font-medium">{payload.compare.leftLabel} vs {payload.compare.rightLabel}</p>
                <p className="mt-2 text-xs uppercase text-emerald-300">Similarities</p>
                <BulletList items={payload.compare.similarities || []} onItemClick={onEvidenceClick} resolveEvidenceId={resolveEvidenceId} focusedEvidenceId={focusedEvidenceId} />
                <p className="mt-2 text-xs uppercase text-amber-300">Differences</p>
                <BulletList items={payload.compare.differences || []} onItemClick={onEvidenceClick} resolveEvidenceId={resolveEvidenceId} focusedEvidenceId={focusedEvidenceId} />
                {payload.compare.examTrap && <p className="mt-2 text-rose-200">Trap: {payload.compare.examTrap}</p>}
              </Section>
            ) : (
              <Section title="Compare"><p>{payload.compare.emptyState || "No meaningful contrast on this page yet."}</p></Section>
            )}
          </div>
        )}

        {state.activeTab === "insights" && (
          <div className={bodyClass}>
            <Section title="High Yield"><BulletList items={payload.insights.highYield} onItemClick={onEvidenceClick} resolveEvidenceId={resolveEvidenceId} focusedEvidenceId={focusedEvidenceId} /></Section>
            <Section title="Traps"><BulletList items={payload.insights.traps} onItemClick={onEvidenceClick} resolveEvidenceId={resolveEvidenceId} focusedEvidenceId={focusedEvidenceId} /></Section>
            <Section title="Hidden Connections"><BulletList items={payload.insights.hiddenConnections} onItemClick={onEvidenceClick} resolveEvidenceId={resolveEvidenceId} focusedEvidenceId={focusedEvidenceId} /></Section>
            <Section title="What you may miss"><BulletList items={payload.insights.whatYouMayMiss} onItemClick={onEvidenceClick} resolveEvidenceId={resolveEvidenceId} focusedEvidenceId={focusedEvidenceId} /></Section>
            {payload.insights.dat && (
              <>
                <Section title="DAT Tested Concepts"><BulletList items={payload.insights.dat.testedConcepts} onItemClick={onEvidenceClick} resolveEvidenceId={resolveEvidenceId} focusedEvidenceId={focusedEvidenceId} /></Section>
                <Section title="Likely Question Angles"><BulletList items={payload.insights.dat.likelyQuestionAngles} onItemClick={onEvidenceClick} resolveEvidenceId={resolveEvidenceId} focusedEvidenceId={focusedEvidenceId} /></Section>
                <Section title="Must-Know Terms"><BulletList items={payload.insights.dat.mustKnowTerms} onItemClick={onEvidenceClick} resolveEvidenceId={resolveEvidenceId} focusedEvidenceId={focusedEvidenceId} /></Section>
                <Section title="Distinction Pairs"><BulletList items={payload.insights.dat.distinctionPairs} onItemClick={onEvidenceClick} resolveEvidenceId={resolveEvidenceId} focusedEvidenceId={focusedEvidenceId} /></Section>
                <Section title="Fast Recall"><BulletList items={payload.insights.dat.fastRecall} onItemClick={onEvidenceClick} resolveEvidenceId={resolveEvidenceId} focusedEvidenceId={focusedEvidenceId} /></Section>
                <Section title="Mechanism Anchor"><BulletList items={payload.insights.dat.mechanismAnchor || []} onItemClick={onEvidenceClick} resolveEvidenceId={resolveEvidenceId} focusedEvidenceId={focusedEvidenceId} /></Section>
              </>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}


function renderSuperscripts(formula: string): React.ReactNode {
  const parts = formula.split(/(\d*[A-Za-z]?[²³])/g).filter(Boolean);
  return parts.map((part, index) => {
    const match = part.match(/^(\d*[A-Za-z]?)([²³])$/);
    if (!match) return <span key={index}>{part}</span>;
    const base = match[1] || "";
    const power = match[2] === "²" ? "2" : "3";
    return <span key={index}>{base}<sup>{power}</sup></span>;
  });
}

function FormulaBlock({ formula, speakable, usage, trap }: { formula: string; speakable: string; usage?: string; trap?: string }) {
  return (
    <div className="rounded-lg border border-violet-300/30 bg-black/40 p-2 font-mono text-xs shadow-inner">
      <p className="text-violet-100 tracking-wide">{renderSuperscripts(formula)}</p>
      <p className="mt-1 text-slate-300">Speak: {speakable}</p>
      {usage && <p className="mt-1 text-emerald-200">Use: {usage}</p>}
      {trap && <p className="mt-1 text-rose-200">Trap: {trap}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-slate-100 break-words"><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-300">{title}</h3>{children}</section>;
}

function BulletList({ items, onItemClick, resolveEvidenceId, focusedEvidenceId }: { items: string[]; onItemClick?: (snippet: string, evidenceId?: string) => void; resolveEvidenceId?: (snippet: string) => string | undefined; focusedEvidenceId?: string | null }) {
  if (!items.length) return <p className="text-slate-400">No grounded items yet.</p>;
  return <ul className="list-disc space-y-1 pl-5">{items.map((item, i) => {
    const evidenceId = resolveEvidenceId?.(item);
    const active = focusedEvidenceId && evidenceId === focusedEvidenceId;
    return <li key={i}>{onItemClick ? <button className={`text-left hover:text-emerald-200 transition-colors ${active ? "rounded bg-emerald-500/20 px-1" : ""}`} onClick={() => onItemClick(item, evidenceId)}>{item}</button> : item}</li>;
  })}</ul>;
}
