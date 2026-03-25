import React, { useMemo } from "react";
import type {
  ActivePageContext,
  RightPanelState,
  PanelTab,
} from "@/lib/readerContracts";
import { resolvePanelPayload } from "@/lib/panelEngine";

interface RightPanelProps {
  ctx: ActivePageContext;
  state: RightPanelState;
  onTabChange: (tab: PanelTab) => void;
  onAudienceChange: (value: RightPanelState["audience"]) => void;
  onDepthChange: (value: RightPanelState["depth"]) => void;
  onDensityChange: (value: RightPanelState["density"]) => void;
}

const tabBtn =
  "rounded-md px-3 py-1.5 text-xs border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10";
const activeTabBtn =
  "rounded-md px-3 py-1.5 text-xs border border-emerald-400/40 bg-emerald-500/20 text-white";

export function RightPanel({
  ctx,
  state,
  onTabChange,
  onAudienceChange,
  onDepthChange,
  onDensityChange,
}: RightPanelProps) {
  const payload = useMemo(
    () => resolvePanelPayload(ctx, state.audience, state.depth),
    [ctx, state.audience, state.depth],
  );

  const bodyClass =
    state.density === "expanded" ? "space-y-4 text-sm" : "space-y-3 text-[13px]";

  return (
    <aside className="flex h-full min-h-0 w-full flex-col overflow-hidden border-l border-white/10 bg-[rgb(11,18,34)]">
      <div className="border-b border-white/10 p-3">
        <div className="rounded-lg border border-white/10 bg-slate-800/60 px-3 py-2">
          <p className="text-sm font-semibold text-white">
            {ctx.sectionTitle || ctx.chapterTitle || "Current Page"}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            Page {ctx.pageNumber} of {ctx.totalPages}
          </p>
        </div>
      </div>

      <div className="border-b border-white/10 px-3 py-2">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(["priority", "explain", "relations", "compare", "insights"] as PanelTab[]).map((tab) => (
            <button
              key={tab}
              className={state.activeTab === tab ? activeTabBtn : tabBtn}
              onClick={() => onTabChange(tab)}
            >
              {tab[0].toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <select
            value={state.audience}
            onChange={(e) => onAudienceChange(e.target.value as RightPanelState["audience"])}
            className="rounded-md border border-white/10 bg-slate-900 px-2 py-1 text-xs text-white"
          >
            <option value="student">Student</option>
            <option value="clinical">Clinical</option>
            <option value="expert">Expert</option>
          </select>

          <select
            value={state.depth}
            onChange={(e) => onDepthChange(e.target.value as RightPanelState["depth"])}
            className="rounded-md border border-white/10 bg-slate-900 px-2 py-1 text-xs text-white"
          >
            <option value="standard">Standard</option>
            <option value="deep">Deep</option>
          </select>

          <select
            value={state.density}
            onChange={(e) => onDensityChange(e.target.value as RightPanelState["density"])}
            className="rounded-md border border-white/10 bg-slate-900 px-2 py-1 text-xs text-white"
          >
            <option value="condensed">Condensed</option>
            <option value="expanded">Expanded</option>
          </select>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {state.activeTab === "priority" && (
          <div className={bodyClass}>
            <Section title="Priority">
              <p>{payload.priority.meaning}</p>
            </Section>

            <Section title="Main Ideas">
              <ul className="list-disc space-y-1 pl-5">
                {payload.priority.mainIdeas.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </Section>

            <Section title="Why It Matters">
              <p>{payload.priority.whyItMatters}</p>
            </Section>

            <Section title="What To Remember">
              <ul className="list-disc space-y-1 pl-5">
                {payload.priority.whatToRemember.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </Section>
          </div>
        )}

        {state.activeTab === "explain" && (
          <div className={bodyClass}>
            <Section title="Meaning">
              <p>{payload.explain.whatThisMeans}</p>
            </Section>

            <Section title="Mechanism">
              <p>{payload.explain.mechanism}</p>
            </Section>

            <Section title="Stepwise Breakdown">
              <ol className="list-decimal space-y-1 pl-5">
                {payload.explain.stepwise.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ol>
            </Section>

            <Section title="Application">
              <ul className="list-disc space-y-1 pl-5">
                {payload.explain.application.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </Section>
          </div>
        )}

        {state.activeTab === "relations" && (
          <div className={bodyClass}>
            <Section title="Prerequisites">
              <BulletList items={payload.relations.prerequisites} />
            </Section>
            <Section title="Current Links">
              <BulletList items={payload.relations.currentLinks} />
            </Section>
            <Section title="Downstream Links">
              <BulletList items={payload.relations.downstreamLinks} />
            </Section>
          </div>
        )}

        {state.activeTab === "compare" && (
          <div className={bodyClass}>
            {payload.compare.comparePairs.length ? (
              payload.compare.comparePairs.map((pair, i) => (
                <Section key={i} title={`${pair.left} vs ${pair.right}`}>
                  <p>{pair.distinction}</p>
                </Section>
              ))
            ) : (
              <Section title="Compare">
                <p>{payload.compare.emptyReason}</p>
              </Section>
            )}
          </div>
        )}

        {state.activeTab === "insights" && (
          <div className={bodyClass}>
            <Section title="High Yield">
              <BulletList items={payload.insights.highYield} />
            </Section>
            <Section title="Traps">
              <BulletList items={payload.insights.traps} />
            </Section>
            <Section title="Hidden Connections">
              <BulletList items={payload.insights.hiddenConnections} />
            </Section>
          </div>
        )}
      </div>
    </aside>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-slate-100">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-300">
        {title}
      </h3>
      {children}
    </section>
  );
}

function BulletList({ items }: { items: string[] }) {
  if (!items.length) return <p className="text-slate-400">No grounded items yet.</p>;
  return (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}
