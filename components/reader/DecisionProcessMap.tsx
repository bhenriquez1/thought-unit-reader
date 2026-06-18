"use client";

// components/reader/DecisionProcessMap.tsx
//
// Level 3 of the LeftPanel evolution: renders the page's process-flow
// (ordered mechanism steps) and decision-rules (if/criteria/threshold
// language) below the Level 2 Thought Unit Navigator. Reuses the same
// evidenceRefId jump mechanism as Level 2 — clicking a step or rule jumps
// the PDF and focuses the highlight exactly like clicking a thought unit.

import React from "react";
import type { ProcessStepEntry, DecisionRuleEntry } from "@/lib/insights/extractDecisionProcessMap";

export default function DecisionProcessMap({
  processSteps,
  decisionRules,
  focusedId,
  onJump,
}: {
  processSteps: ProcessStepEntry[];
  decisionRules: DecisionRuleEntry[];
  focusedId?: string | null;
  onJump: (id: string) => void;
}) {
  const hasProcess = processSteps.length >= 2;
  const hasDecisions = decisionRules.length > 0;
  if (!hasProcess && !hasDecisions) return null;

  return (
    <div className="flex flex-col gap-2.5" data-testid="decision-process-map">
      {hasProcess && (
        <div className="flex flex-col gap-1">
          <span className="text-[9px] font-bold uppercase tracking-widest text-white/30 px-1">
            Process Flow
          </span>
          <div className="flex flex-col">
            {processSteps.map((step, i) => {
              const focused = step.evidenceRefId === focusedId;
              return (
                <div key={step.id} className="flex flex-col">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onJump(step.evidenceRefId)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onJump(step.evidenceRefId); }}
                    className="flex items-start gap-2 rounded-md px-2 py-1.5 cursor-pointer transition-colors"
                    style={{
                      background: focused ? "rgba(134,239,172,0.28)" : "rgba(134,239,172,0.10)",
                      border: `1px solid rgba(134,239,172,${focused ? 0.7 : 0.25})`,
                    }}
                    data-testid="process-step-entry"
                  >
                    <span
                      className="shrink-0 mt-0.5 flex items-center justify-center rounded-full text-[9px] font-bold text-black"
                      style={{ width: 16, height: 16, background: "#86efac" }}
                    >
                      {step.stepNumber}
                    </span>
                    <span
                      className="text-[10.5px] leading-snug text-white/80"
                      style={{
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {step.text}
                    </span>
                  </div>
                  {i < processSteps.length - 1 && (
                    <div className="ml-[19px] h-2.5 w-px bg-white/15" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {hasDecisions && (
        <div className="flex flex-col gap-1">
          <span className="text-[9px] font-bold uppercase tracking-widest text-white/30 px-1">
            Decision Rules
          </span>
          <div className="flex flex-col gap-1">
            {decisionRules.map((rule) => {
              const focused = rule.evidenceRefId === focusedId;
              return (
                <div
                  key={rule.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onJump(rule.evidenceRefId)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onJump(rule.evidenceRefId); }}
                  className="flex flex-col gap-0.5 rounded-md px-2 py-1.5 cursor-pointer transition-colors"
                  style={{
                    background: focused ? "rgba(252,165,165,0.24)" : "rgba(252,165,165,0.10)",
                    border: `1px solid rgba(252,165,165,${focused ? 0.7 : 0.25})`,
                  }}
                  data-testid="decision-rule-entry"
                >
                  {rule.condition ? (
                    <>
                      <span className="text-[9px] uppercase tracking-wide text-white/40">If</span>
                      <span className="text-[10.5px] leading-snug text-white/80">{rule.condition}</span>
                      {rule.outcome && (
                        <>
                          <span className="text-[9px] uppercase tracking-wide text-white/40 mt-0.5">Then</span>
                          <span className="text-[10.5px] leading-snug text-white/80">{rule.outcome}</span>
                        </>
                      )}
                    </>
                  ) : (
                    <span
                      className="text-[10.5px] leading-snug text-white/80"
                      style={{
                        display: "-webkit-box",
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {rule.text}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
