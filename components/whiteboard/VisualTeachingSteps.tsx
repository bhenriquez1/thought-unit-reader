"use client";
// components/whiteboard/VisualTeachingSteps.tsx
// Progressive visual teaching — one NoteCard at a time with semantic-type-specific
// visual layouts. Replaces the text-accordion WorkspaceSteps.
//
// Visual grammar:
//   flow/mechanism  → vertical node chain with SVG arrows
//   comparison      → two-column vs. table
//   anatomy/table   → labeled grid
//   cycle           → numbered circular steps
//   equation        → monospace code-style display
//   timeline        → horizontal step chain
//   No visual       → semantic-type-specific card (Master/Step/Decision/Danger/Pearl)

import React, { useState, useEffect, useCallback } from "react";
import type { NoteCard, NoteCardVisual } from "@/lib/insights/synthesizeTeachingOutput";

// ── Tier config (mirrors Avrrio 5-tier language) ───────────────────────────

type Tier = "master" | "step" | "decision" | "danger" | "pearl";

const CARD_TYPE_TIER: Record<string, Tier> = {
  must_know:         "master",
  master_concepts:   "master",
  why_this_matters:  "master",
  mechanism:         "step",
  procedure_flow:    "step",
  formula_breakdown: "step",
  worked_example:    "step",
  clinical_reasoning:"decision",
  decision_tree:     "decision",
  pattern_recognition:"decision",
  exam_strategy:     "decision",
  case_challenge:    "decision",
  dat_trap:          "danger",
  common_mistake:    "danger",
  complication_risk: "danger",
  clinical_pearl:    "pearl",
  memory_hook:       "pearl",
  connection_map:    "pearl",
  visual_mnemonic:   "pearl",
  expert_thinking:   "pearl",
  recall_questions:  "pearl",
  surgeon_lens:      "pearl",
  quick_review:      "pearl",
  other:             "pearl",
};

const TIER_STYLE: Record<Tier, {
  color: string; bg: string; border: string; label: string; icon: string;
}> = {
  master:   { color: "#fde047", bg: "rgba(253,224,71,0.10)",  border: "rgba(253,224,71,0.30)",  label: "MASTER",   icon: "⚡" },
  step:     { color: "#86efac", bg: "rgba(134,239,172,0.10)", border: "rgba(134,239,172,0.28)", label: "STEP",     icon: "⚙️" },
  decision: { color: "#93c5fd", bg: "rgba(147,197,253,0.10)", border: "rgba(147,197,253,0.28)", label: "DECISION", icon: "🔍" },
  danger:   { color: "#fca5a5", bg: "rgba(252,165,165,0.12)", border: "rgba(252,165,165,0.32)", label: "DANGER",   icon: "⚠️" },
  pearl:    { color: "#67e8f9", bg: "rgba(103,232,249,0.10)", border: "rgba(103,232,249,0.26)", label: "PEARL",    icon: "💎" },
};

const TYPE_LABELS: Record<string, string> = {
  must_know:          "Must Know",
  master_concepts:    "Master This",
  mechanism:          "Mechanism",
  procedure_flow:     "Procedure",
  formula_breakdown:  "Formula",
  worked_example:     "Worked Example",
  clinical_reasoning: "Clinical Reasoning",
  decision_tree:      "Decision Points",
  pattern_recognition:"Pattern",
  exam_strategy:      "Exam Strategy",
  case_challenge:     "Case Challenge",
  dat_trap:           "Trap",
  common_mistake:     "Common Mistake",
  complication_risk:  "Complication Risk",
  clinical_pearl:     "Clinical Pearl",
  memory_hook:        "Memory Hook",
  connection_map:     "Connections",
  visual_mnemonic:    "Mnemonic",
  expert_thinking:    "Expert Thinking",
  recall_questions:   "Quiz",
  surgeon_lens:       "Surgeon's View",
  why_this_matters:   "Why It Matters",
  quick_review:       "Quick Review",
  other:              "Note",
};

// ── Visual renders by drawType ─────────────────────────────────────────────

function FlowDiagram({ visual }: { visual: NoteCardVisual }) {
  const { nodes, arrows } = visual;
  if (nodes.length === 0) return null;

  return (
    <div className="flex flex-col items-center gap-0 mt-4">
      {nodes.map((node, i) => {
        const hasArrowAfter = arrows.some(a => a.from === node.id);
        const arrowToThis   = arrows.find(a => a.to === node.id);
        return (
          <div key={node.id} className="flex flex-col items-center w-full max-w-xs">
            <div
              className="w-full rounded-xl border px-4 py-2.5 text-center text-[13px] font-semibold leading-snug"
              style={{ borderColor: "rgba(147,197,253,0.35)", background: "rgba(147,197,253,0.08)", color: "#bfdbfe" }}
            >
              {arrowToThis?.label && (
                <span className="block text-[10px] text-sky-400/50 font-normal mb-0.5">{arrowToThis.label}</span>
              )}
              {node.label}
            </div>
            {hasArrowAfter && (
              <div className="flex flex-col items-center py-1">
                <div className="w-px h-3 bg-sky-400/30" />
                <svg width="12" height="8" viewBox="0 0 12 8">
                  <polygon points="0,0 12,0 6,8" fill="rgba(147,197,253,0.5)" />
                </svg>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ComparisonDiagram({ visual, title }: { visual: NoteCardVisual; title: string }) {
  const { nodes } = visual;
  if (nodes.length < 2) return null;
  const left  = nodes[0];
  const right = nodes[1];
  const rest  = nodes.slice(2);

  return (
    <div className="mt-4">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-yellow-400/25 bg-yellow-400/6 px-3 py-2.5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-yellow-300/60 mb-1">{left.label.slice(0, 1).toUpperCase() === left.label.slice(0, 1) ? left.label : "Left"}</div>
          <div className="text-[12px] text-yellow-100/80 leading-relaxed">{left.label}</div>
        </div>
        <div className="rounded-xl border border-sky-400/25 bg-sky-400/6 px-3 py-2.5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-sky-300/60 mb-1">vs.</div>
          <div className="text-[12px] text-sky-100/80 leading-relaxed">{right.label}</div>
        </div>
      </div>
      {rest.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5">
          {rest.map(n => (
            <div key={n.id} className="text-[12px] text-slate-300 px-2 py-1 rounded-lg bg-white/4 border border-white/8">
              {n.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CycleDiagram({ visual }: { visual: NoteCardVisual }) {
  const { nodes } = visual;
  if (nodes.length === 0) return null;

  return (
    <div className="mt-4 flex flex-col gap-2">
      {nodes.map((node, i) => (
        <div key={node.id} className="flex items-start gap-3">
          <div
            className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold"
            style={{ background: "rgba(103,232,249,0.15)", border: "1.5px solid rgba(103,232,249,0.4)", color: "#67e8f9" }}
          >
            {i + 1}
          </div>
          <div className="flex-1 text-[12px] text-slate-200 leading-relaxed pt-0.5">{node.label}</div>
          {i < nodes.length - 1 && (
            <div className="absolute left-3.5 mt-7" />
          )}
        </div>
      ))}
      {nodes.length > 1 && (
        <div className="text-[10px] text-cyan-400/40 text-center mt-1">↺ cycle repeats</div>
      )}
    </div>
  );
}

function TimelineDiagram({ visual }: { visual: NoteCardVisual }) {
  const { nodes } = visual;
  return (
    <div className="mt-4 flex flex-col gap-0">
      {nodes.map((node, i) => (
        <div key={node.id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div
              className="w-3 h-3 rounded-full flex-shrink-0 mt-1"
              style={{ background: "rgba(134,239,172,0.6)", boxShadow: "0 0 6px rgba(134,239,172,0.4)" }}
            />
            {i < nodes.length - 1 && <div className="w-px flex-1 my-0.5 bg-emerald-400/20" />}
          </div>
          <div className="pb-3 text-[12px] text-slate-200 leading-relaxed">{node.label}</div>
        </div>
      ))}
    </div>
  );
}

function AnatomyDiagram({ visual }: { visual: NoteCardVisual }) {
  const { nodes } = visual;
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {nodes.map((node, i) => (
        <div
          key={node.id}
          className="rounded-lg border px-3 py-2 text-[12px] font-medium text-slate-200 text-center"
          style={{
            borderColor: `hsla(${(i * 47) % 360}, 60%, 60%, 0.35)`,
            background:  `hsla(${(i * 47) % 360}, 60%, 30%, 0.12)`,
            color: `hsla(${(i * 47) % 360}, 80%, 85%, 0.9)`,
          }}
        >
          {node.label}
        </div>
      ))}
    </div>
  );
}

function EquationDiagram({ visual }: { visual: NoteCardVisual }) {
  const { nodes } = visual;
  return (
    <div className="mt-4 flex flex-col gap-2">
      {nodes.map((node) => (
        <div
          key={node.id}
          className="font-mono text-[13px] text-emerald-200 bg-slate-900 border border-emerald-400/20 rounded-lg px-4 py-2.5 text-center"
        >
          {node.label}
        </div>
      ))}
    </div>
  );
}

function VisualDiagram({ visual, title }: { visual: NoteCardVisual; title: string }) {
  switch (visual.drawType) {
    case "flow":       return <FlowDiagram visual={visual} />;
    case "comparison": return <ComparisonDiagram visual={visual} title={title} />;
    case "cycle":      return <CycleDiagram visual={visual} />;
    case "timeline":   return <TimelineDiagram visual={visual} />;
    case "anatomy":    return <AnatomyDiagram visual={visual} />;
    case "equation":   return <EquationDiagram visual={visual} />;
    case "table":      return <AnatomyDiagram visual={visual} />; // wrapping table as labeled grid
    case "graph":      return <FlowDiagram visual={visual} />; // fallback
    default:           return null;
  }
}

// ── Quiz card (recall_questions) ───────────────────────────────────────────

function QuizCard({ title, body }: { title: string; body: string }) {
  const [revealed, setRevealed] = useState(false);
  const lines = body.split(/\n+/).filter(Boolean);

  return (
    <div className="mt-4 flex flex-col gap-3">
      {lines.map((q, i) => (
        <div
          key={i}
          onClick={() => setRevealed(true)}
          className="rounded-xl border border-purple-400/25 bg-purple-900/15 px-4 py-3 cursor-pointer hover:bg-purple-900/25 transition-colors"
        >
          <div className="text-[11px] font-bold text-purple-300/60 uppercase tracking-widest mb-1">Q {i + 1}</div>
          <div className="text-[13px] text-purple-100">{q}</div>
          {!revealed && (
            <div className="text-[10px] text-purple-400/40 mt-2">Click to reveal answer</div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Memory hook card ───────────────────────────────────────────────────────

function MemoryCard({ body }: { body: string }) {
  return (
    <div className="mt-4 rounded-xl border border-violet-400/30 bg-violet-900/15 px-5 py-4 italic text-[14px] text-violet-200 leading-relaxed">
      <div className="text-[10px] not-italic font-bold text-violet-400/60 uppercase tracking-widest mb-2">🧠 Remember This</div>
      {body}
    </div>
  );
}

// ── Single card renderer ───────────────────────────────────────────────────

function TeachCard({
  card,
  visible,
  entering,
  direction,
}: {
  card: NoteCard;
  visible: boolean;
  entering: boolean;
  direction: "forward" | "back";
}) {
  const tier  = CARD_TYPE_TIER[card.type] ?? "pearl";
  const style = TIER_STYLE[tier];
  const label = TYPE_LABELS[card.type] ?? card.type;

  const isQuiz   = card.type === "recall_questions";
  const isMemory = card.type === "memory_hook" || card.type === "visual_mnemonic";
  const isDanger = tier === "danger";

  return (
    <div
      className="flex flex-col"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible
          ? "translateX(0)"
          : `translateX(${entering ? (direction === "forward" ? 28 : -28) : 0}px)`,
        transition: "opacity 0.18s ease, transform 0.18s ease",
      }}
    >
      {/* Tier badge */}
      <div className="flex items-center gap-2 mb-3">
        <span
          className="text-[10px] font-black uppercase tracking-[0.14em] px-2.5 py-1 rounded-md"
          style={{ color: style.color, background: style.bg, border: `1px solid ${style.border}` }}
        >
          {style.icon} {label}
        </span>
      </div>

      {/* Title */}
      <div
        className="text-[18px] font-bold leading-tight mb-3"
        style={{ color: isDanger ? "#fca5a5" : "rgba(255,255,255,0.95)" }}
      >
        {card.title}
      </div>

      {/* Danger warning bar */}
      {isDanger && (
        <div className="mb-3 rounded-lg border border-red-400/30 bg-red-950/30 px-3 py-2 text-[11px] font-bold text-red-300 uppercase tracking-wide">
          ⚠ Common exam trap — read carefully
        </div>
      )}

      {/* Visual diagram (if present) */}
      {card.visual && <VisualDiagram visual={card.visual} title={card.title} />}

      {/* Card-type-specific body render */}
      {isQuiz ? (
        <QuizCard title={card.title} body={card.body} />
      ) : isMemory ? (
        <MemoryCard body={card.body} />
      ) : (
        <div
          className="text-[13px] leading-[1.85] mt-3 whitespace-pre-wrap"
          style={{ color: isDanger ? "rgba(252,165,165,0.85)" : "rgba(203,213,225,0.88)" }}
        >
          {card.body}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

interface VisualTeachingStepsProps {
  noteCards: NoteCard[];
  pageTitle?: string | null;
}

export default function VisualTeachingSteps({ noteCards, pageTitle }: VisualTeachingStepsProps) {
  const [index, setIndex]       = useState(0);
  const [visible, setVisible]   = useState(true);
  const [entering, setEntering] = useState(false);
  const [direction, setDir]     = useState<"forward" | "back">("forward");

  // Reset to first card when note cards change (new page)
  useEffect(() => { setIndex(0); }, [noteCards]);

  // Keyboard navigation
  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); goNext(); }
    if (e.key === "ArrowLeft"  || e.key === "ArrowUp")   { e.preventDefault(); goPrev(); }
  }, [index, noteCards.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  function navigateTo(next: number, dir: "forward" | "back") {
    if (next === index || next < 0 || next >= noteCards.length) return;
    setDir(dir);
    setVisible(false);
    setEntering(true);
    setTimeout(() => {
      setIndex(next);
      setVisible(true);
      setTimeout(() => setEntering(false), 20);
    }, 150);
  }

  function goNext() { navigateTo(index + 1, "forward"); }
  function goPrev() { navigateTo(index - 1, "back"); }

  if (noteCards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[260px] px-6 text-center gap-4">
        <div className="text-4xl">📐</div>
        <div className="text-[13px] font-semibold text-white/50">Visual lesson not ready</div>
        <div className="text-[11px] text-white/30 max-w-[240px] leading-relaxed">
          Open an instructional page — the visual teaching sequence loads from the Study Sheet.
        </div>
      </div>
    );
  }

  const card  = noteCards[index];
  const tier  = CARD_TYPE_TIER[card.type] ?? "pearl";
  const style = TIER_STYLE[tier];

  return (
    <div className="flex flex-col h-full">
      {/* Page context strip */}
      {pageTitle && (
        <div className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500 truncate">
          {pageTitle}
        </div>
      )}

      {/* Progress dots */}
      <div className="flex items-center justify-center gap-1.5 px-4 py-2 flex-wrap">
        {noteCards.map((c, i) => {
          const t = CARD_TYPE_TIER[c.type] ?? "pearl";
          const s = TIER_STYLE[t];
          return (
            <button
              key={i}
              onClick={() => navigateTo(i, i > index ? "forward" : "back")}
              title={TYPE_LABELS[c.type] ?? c.type}
              className="transition-all rounded-full"
              style={{
                width:  i === index ? 22 : 7,
                height: 7,
                background: i === index ? s.color : "rgba(255,255,255,0.12)",
                flexShrink: 0,
              }}
            />
          );
        })}
      </div>

      {/* Card body */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <TeachCard
          card={card}
          visible={visible}
          entering={entering}
          direction={direction}
        />
      </div>

      {/* Navigation footer */}
      <div
        className="flex-shrink-0 flex items-center gap-2 px-4 py-3 border-t"
        style={{ borderColor: "rgba(255,255,255,0.06)" }}
      >
        <button
          onClick={goPrev}
          disabled={index === 0}
          className="flex-1 py-2 rounded-lg text-[12px] font-semibold transition-colors"
          style={{
            border: "1px solid rgba(255,255,255,0.09)",
            background: "rgba(255,255,255,0.03)",
            color: index === 0 ? "rgba(148,163,184,0.25)" : "rgba(255,255,255,0.65)",
          }}
        >
          ← Back
        </button>

        <div className="text-[11px] text-slate-500 text-center min-w-[48px]">
          {index + 1} / {noteCards.length}
        </div>

        <button
          onClick={goNext}
          disabled={index === noteCards.length - 1}
          className="flex-1 py-2 rounded-lg text-[12px] font-bold transition-colors"
          style={{
            border:     `1px solid ${style.border}`,
            background: style.bg,
            color:      index === noteCards.length - 1 ? "rgba(148,163,184,0.25)" : style.color,
          }}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
