// components/notelab/DATStudySheetCard.tsx
// Visual renderer for DATStudySheet — one-concept, one-page study sheet
// in the style of Gen Chem Mike's handwritten notes.
// Dark-mode, high-density, fully interactive.

import React, { useState, useCallback, useRef } from "react";
import type { DATStudySheet, DATDiagram, DATQuestion } from "@/lib/notelab/datStudySheet";
import type { UltraNote } from "@/lib/notelab/ultraNoteStore";

// ── Color palette ─────────────────────────────────────────────────────────

const C = {
  title:      "#fbbf24", // amber
  coreBg:     "rgba(251,191,36,0.07)",
  coreBorder: "rgba(251,191,36,0.35)",
  factsBg:    "rgba(52,211,153,0.06)",
  factsBorder:"rgba(52,211,153,0.3)",
  factsText:  "#34d399",
  pearlBg:    "rgba(250,204,21,0.07)",
  pearlBorder:"rgba(250,204,21,0.4)",
  pearlText:  "#fcd34d",
  trapBg:     "rgba(248,113,113,0.07)",
  trapBorder: "rgba(248,113,113,0.35)",
  trapText:   "#f87171",
  mechBg:     "rgba(96,165,250,0.06)",
  mechBorder: "rgba(96,165,250,0.3)",
  mechText:   "#60a5fa",
  procBg:     "rgba(167,139,250,0.06)",
  procBorder: "rgba(167,139,250,0.3)",
  procText:   "#a78bfa",
  diagBg:     "rgba(34,211,238,0.05)",
  diagBorder: "rgba(34,211,238,0.3)",
  diagText:   "#22d3ee",
  formulaBg:  "rgba(251,191,36,0.1)",
  formulaBorder:"rgba(251,191,36,0.5)",
  memBg:      "rgba(192,132,252,0.06)",
  memBorder:  "rgba(192,132,252,0.35)",
  memText:    "#c084fc",
  exBg:       "rgba(52,211,153,0.06)",
  exBorder:   "rgba(52,211,153,0.3)",
  mistakeBg:  "rgba(239,68,68,0.05)",
  mistakeBorder:"rgba(239,68,68,0.25)",
  connBg:     "rgba(99,102,241,0.06)",
  connBorder: "rgba(99,102,241,0.3)",
  relatedBg:  "rgba(15,23,42,0.6)",
  sectionLabel: { fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", marginBottom: 8 },
  body: { fontSize: 13, color: "rgba(255,255,255,0.88)", lineHeight: 1.7 },
  baseCard: {
    borderRadius: 12,
    padding: "14px 16px",
    marginBottom: 10,
  },
};

// ── Section wrapper ────────────────────────────────────────────────────────

function Section({
  icon, label, color, bg, border, children, collapsible, defaultOpen, onClick, headerRight,
}: {
  icon: string; label: string; color: string; bg: string; border: string;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  onClick?: () => void;
  headerRight?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen !== false);
  const toggle = collapsible ? () => setOpen(o => !o) : onClick;
  return (
    <div style={{ ...C.baseCard, background: bg, border: `1px solid ${border}` }}>
      <div
        onClick={toggle}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          cursor: toggle ? "pointer" : "default",
          userSelect: "none",
          marginBottom: open ? 10 : 0,
        }}
      >
        <span style={{ fontSize: 15 }}>{icon}</span>
        <span style={{ ...C.sectionLabel, color, flex: 1 }}>{label}</span>
        {headerRight}
        {collapsible && (
          <span style={{ fontSize: 10, color: "rgba(148,163,184,0.4)" }}>{open ? "▲" : "▼"}</span>
        )}
      </div>
      {open && children}
    </div>
  );
}

// ── Diagram renderer ──────────────────────────────────────────────────────

function DiagramView({ diagram }: { diagram: DATDiagram }) {
  if (diagram.type === "none") return null;

  if (diagram.type === "table" && diagram.rows && diagram.rows.length > 0) {
    const [header, ...body] = diagram.rows;
    return (
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              {header.map((cell, i) => (
                <th key={i} style={{ padding: "6px 10px", background: "rgba(34,211,238,0.12)", color: C.diagText, fontWeight: 700, textAlign: "left", border: "1px solid rgba(34,211,238,0.15)" }}>
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} style={{ padding: "5px 10px", color: "rgba(255,255,255,0.82)", border: "1px solid rgba(255,255,255,0.07)", background: ri % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent" }}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (diagram.type === "comparison" && diagram.nodes && diagram.nodes.length >= 2) {
    const mid  = Math.ceil(diagram.nodes.length / 2);
    const left  = diagram.nodes.slice(0, mid);
    const right = diagram.nodes.slice(mid);
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {left.map(n => (
            <div key={n.id} style={{ padding: "7px 10px", borderRadius: 7, background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.25)", fontSize: 12, color: "#93c5fd", fontWeight: 600 }}>
              {n.label}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", fontSize: 20, color: "rgba(148,163,184,0.4)", paddingTop: 4 }}>⇔</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {right.map(n => (
            <div key={n.id} style={{ padding: "7px 10px", borderRadius: 7, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.22)", fontSize: 12, color: "#fca5a5", fontWeight: 600 }}>
              {n.label}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // flow / reaction / cycle / anatomy — render as node chain
  if (diagram.nodes && diagram.nodes.length > 0) {
    const arrows = diagram.arrows ?? [];
    // Build an ordered list: try to walk arrow chain, else just use node order
    const nodeMap = new Map(diagram.nodes.map(n => [n.id, n.label]));
    let ordered = diagram.nodes;
    if (arrows.length > 0) {
      const fromIds = arrows.map(a => a.from);
      const toIds   = arrows.map(a => a.to);
      const starts  = fromIds.filter(id => !toIds.includes(id));
      if (starts.length === 1) {
        const seq: typeof diagram.nodes = [];
        let cur: string | undefined = starts[0];
        const visited = new Set<string>();
        while (cur && !visited.has(cur)) {
          visited.add(cur);
          const node = diagram.nodes.find(n => n.id === cur);
          if (node) seq.push(node);
          cur = arrows.find(a => a.from === cur)?.to;
        }
        if (seq.length === diagram.nodes.length) ordered = seq;
      }
    }
    const isCycle = diagram.type === "cycle";
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 0 }}>
        {ordered.map((node, i) => {
          const edgeLabel = arrows.find(a => a.from === node.id)?.label;
          const isLast = i === ordered.length - 1;
          return (
            <div key={node.id} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ alignSelf: "stretch", padding: "9px 14px", borderRadius: 9, background: "rgba(34,211,238,0.1)", border: "1px solid rgba(34,211,238,0.25)", fontSize: 12.5, color: "#e0f2fe", fontWeight: 600, textAlign: "center" }}>
                {node.label}
              </div>
              {(!isLast || isCycle) && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "3px 0" }}>
                  {edgeLabel && (
                    <span style={{ fontSize: 10, color: "rgba(148,163,184,0.6)", fontWeight: 600, marginBottom: 1 }}>{edgeLabel}</span>
                  )}
                  <span style={{ fontSize: 16, color: "rgba(34,211,238,0.5)" }}>↓</span>
                  {isCycle && isLast && (
                    <span style={{ fontSize: 9, color: "rgba(34,211,238,0.4)", fontWeight: 700, marginTop: 1 }}>↩ REPEAT</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // Fallback: description only
  return <p style={{ ...C.body, margin: 0 }}>{diagram.description}</p>;
}

// ── Pearl question panel ──────────────────────────────────────────────────

function PearlQuestions({ questions }: { questions: DATQuestion[] }) {
  const [answered, setAnswered] = useState<Record<number, number>>({});
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {questions.map((q, qi) => {
        const chosen = answered[qi];
        const correct = q.correctIndex;
        return (
          <div key={qi} style={{ padding: "12px 14px", borderRadius: 9, background: "rgba(250,204,21,0.05)", border: "1px solid rgba(250,204,21,0.2)" }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "#fcd34d", marginBottom: 9 }}>
              Q{qi + 1}: {q.question}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {q.options.map((opt, oi) => {
                const isCorrect = oi === correct;
                const isChosen  = oi === chosen;
                const revealed  = chosen !== undefined;
                return (
                  <button
                    key={oi}
                    type="button"
                    onClick={() => !revealed && setAnswered(prev => ({ ...prev, [qi]: oi }))}
                    style={{
                      padding: "7px 12px",
                      borderRadius: 7,
                      border: revealed
                        ? isCorrect ? "1px solid rgba(52,211,153,0.7)" : isChosen ? "1px solid rgba(248,113,113,0.5)" : "1px solid rgba(255,255,255,0.08)"
                        : "1px solid rgba(255,255,255,0.1)",
                      background: revealed
                        ? isCorrect ? "rgba(52,211,153,0.12)" : isChosen ? "rgba(248,113,113,0.1)" : "transparent"
                        : "rgba(255,255,255,0.04)",
                      color: revealed
                        ? isCorrect ? "#34d399" : isChosen ? "#f87171" : "rgba(255,255,255,0.45)"
                        : "rgba(255,255,255,0.82)",
                      fontSize: 12,
                      fontWeight: isCorrect && revealed ? 700 : 500,
                      textAlign: "left",
                      cursor: revealed ? "default" : "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {isCorrect && revealed ? "✓ " : isChosen && !isCorrect && revealed ? "✗ " : `${String.fromCharCode(65 + oi)}. `}
                    {opt}
                  </button>
                );
              })}
            </div>
            {chosen !== undefined && (
              <div style={{ marginTop: 9, padding: "9px 12px", borderRadius: 7, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", fontSize: 11.5, color: "rgba(255,255,255,0.75)", lineHeight: 1.6 }}>
                💡 {q.explanation}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Trap breakdown panel ──────────────────────────────────────────────────

function TrapBreakdown({ wrongThinking, correctReasoning }: { wrongThinking: string; correctReasoning: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 6 }}>
      <div style={{ padding: "11px 13px", borderRadius: 9, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.3)" }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, color: "#f87171", letterSpacing: "0.1em", marginBottom: 7 }}>❌ WRONG THINKING</div>
        <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.8)", lineHeight: 1.65 }}>{wrongThinking}</div>
      </div>
      <div style={{ padding: "11px 13px", borderRadius: 9, background: "rgba(52,211,153,0.07)", border: "1px solid rgba(52,211,153,0.3)" }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, color: "#34d399", letterSpacing: "0.1em", marginBottom: 7 }}>✓ CORRECT REASONING</div>
        <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.85)", lineHeight: 1.65 }}>{correctReasoning}</div>
      </div>
    </div>
  );
}

// ── Generate button ───────────────────────────────────────────────────────

function GenerateButton({
  note, onSheet,
}: {
  note: UltraNote;
  onSheet: (sheet: DATStudySheet) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const generate = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const anchors = note.highlightAnchors?.map(a => a.text).filter(Boolean).slice(0, 8) ?? [];
      const pageText = note.sections?.map(s => s.content).join(" ").slice(0, 1200) ?? "";
      const res = await fetch("/api/dat-study-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          noteId:      note.id,
          concept:     note.topic,
          subjectArea: note.subject ?? "General",
          coreIdea:    note.coreIdea,
          anchors,
          pageText,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const { sheet } = await res.json() as { sheet: DATStudySheet };
      onSheet(sheet);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  }, [note, onSheet]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "32px 16px" }}>
      <div style={{ fontSize: 36 }}>📋</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.88)", textAlign: "center" }}>
        Generate DAT Study Sheet
      </div>
      <div style={{ fontSize: 12, color: "rgba(148,163,184,0.7)", textAlign: "center", maxWidth: 320, lineHeight: 1.6 }}>
        One-concept visual study sheet with key facts, DAT pearls, common traps, mechanisms, memory tricks, and an exam example.
      </div>
      <button
        type="button"
        onClick={generate}
        disabled={loading}
        style={{
          padding: "11px 28px",
          borderRadius: 10,
          border: "1px solid rgba(251,191,36,0.4)",
          background: loading ? "rgba(251,191,36,0.07)" : "rgba(251,191,36,0.12)",
          color: "#fbbf24",
          fontSize: 13,
          fontWeight: 700,
          cursor: loading ? "wait" : "pointer",
          opacity: loading ? 0.7 : 1,
          transition: "all 0.2s",
        }}
      >
        {loading ? "⏳ Generating…" : "✦ Generate Study Sheet"}
      </button>
      {error && (
        <div style={{ fontSize: 11.5, color: "#f87171", textAlign: "center", maxWidth: 320 }}>
          Error: {error}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

interface DATStudySheetCardProps {
  note:    UltraNote;
  sheet?:  DATStudySheet | null;
  onSheet: (sheet: DATStudySheet) => void;
}

export default function DATStudySheetCard({ note, sheet, onSheet }: DATStudySheetCardProps) {
  const [pearlOpen,    setPearlOpen]    = useState(false);
  const [trapOpen,     setTrapOpen]     = useState(false);

  if (!sheet) {
    return <GenerateButton note={note} onSheet={onSheet} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      {/* ── Title Banner ─────────────────────────────────────────── */}
      <div style={{
        borderRadius: 14, padding: "18px 20px 16px",
        background: "linear-gradient(135deg, rgba(251,191,36,0.18) 0%, rgba(251,146,60,0.12) 100%)",
        border: "1px solid rgba(251,191,36,0.4)",
        marginBottom: 10,
        textAlign: "center",
      }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.15em", color: "rgba(251,191,36,0.6)", marginBottom: 4 }}>
          {sheet.subjectArea.toUpperCase()}
        </div>
        <div style={{ fontSize: 22, fontWeight: 900, color: "#fbbf24", letterSpacing: "-0.01em", lineHeight: 1.2 }}>
          {sheet.concept}
        </div>
      </div>

      {/* ── Core Idea ────────────────────────────────────────────── */}
      <Section icon="🎯" label="ONE CORE IDEA" color={C.title} bg={C.coreBg} border={C.coreBorder}>
        <p style={{ ...C.body, margin: 0, fontWeight: 600, fontSize: 14 }}>{sheet.coreIdea}</p>
      </Section>

      {/* ── Key Facts ────────────────────────────────────────────── */}
      <Section icon="✓" label="KEY FACTS — HIGH YIELD ONLY" color={C.factsText} bg={C.factsBg} border={C.factsBorder}>
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
          {sheet.keyFacts.map((fact, i) => (
            <li key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
              <span style={{ flexShrink: 0, color: C.factsText, fontWeight: 800, fontSize: 13, marginTop: 1 }}>✓</span>
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.88)", lineHeight: 1.65 }}>{fact}</span>
            </li>
          ))}
        </ul>
      </Section>

      {/* ── DAT Pearl ────────────────────────────────────────────── */}
      <Section
        icon="⭐" label="DAT PEARL" color={C.pearlText} bg={C.pearlBg} border={C.pearlBorder}
        collapsible={!!(sheet.datPearlQuestions?.length)}
        defaultOpen
        headerRight={sheet.datPearlQuestions?.length ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setPearlOpen(o => !o); }}
            style={{ padding: "3px 8px", borderRadius: 5, border: "1px solid rgba(250,204,21,0.35)", background: "rgba(250,204,21,0.08)", color: "#fcd34d", fontSize: 10.5, fontWeight: 700, cursor: "pointer" }}
          >
            {pearlOpen ? "Hide Questions" : "▸ 3 DAT Questions"}
          </button>
        ) : undefined}
      >
        <p style={{ ...C.body, margin: 0, fontWeight: 600, color: "#fef3c7" }}>{sheet.datPearl}</p>
        {pearlOpen && sheet.datPearlQuestions && sheet.datPearlQuestions.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <PearlQuestions questions={sheet.datPearlQuestions} />
          </div>
        )}
      </Section>

      {/* ── Common Trap ──────────────────────────────────────────── */}
      <Section
        icon="⚠️" label="COMMON TRAP" color={C.trapText} bg={C.trapBg} border={C.trapBorder}
        headerRight={sheet.trapBreakdown ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setTrapOpen(o => !o); }}
            style={{ padding: "3px 8px", borderRadius: 5, border: "1px solid rgba(248,113,113,0.35)", background: "rgba(248,113,113,0.08)", color: "#fca5a5", fontSize: 10.5, fontWeight: 700, cursor: "pointer" }}
          >
            {trapOpen ? "Hide" : "▸ Wrong vs Correct"}
          </button>
        ) : undefined}
      >
        <p style={{ ...C.body, margin: 0, color: "#fecaca" }}>{sheet.commonTrap}</p>
        {trapOpen && sheet.trapBreakdown && (
          <TrapBreakdown
            wrongThinking={sheet.trapBreakdown.wrongThinking}
            correctReasoning={sheet.trapBreakdown.correctReasoning}
          />
        )}
      </Section>

      {/* ── Mechanism ────────────────────────────────────────────── */}
      <Section icon="⚙️" label="MECHANISM — WHY IT WORKS" color={C.mechText} bg={C.mechBg} border={C.mechBorder}>
        <p style={{ ...C.body, margin: "0 0 10px", color: "rgba(255,255,255,0.82)" }}>{sheet.mechanism.summary}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {sheet.mechanism.steps.map((step, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
              <div style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: "50%", background: "rgba(96,165,250,0.18)", border: "1px solid rgba(96,165,250,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10.5, fontWeight: 800, color: "#60a5fa", marginTop: 1 }}>
                  {i + 1}
                </span>
                <span style={{ fontSize: 12.5, color: "rgba(255,255,255,0.85)", lineHeight: 1.65 }}>{step}</span>
              </div>
              {i < sheet.mechanism.steps.length - 1 && (
                <span style={{ fontSize: 14, color: "rgba(96,165,250,0.35)", marginLeft: 28, marginTop: 2 }}>↓</span>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* ── Step-by-Step Process ─────────────────────────────────── */}
      {sheet.process && (
        <Section icon="📋" label={`PROCESS: ${sheet.process.title.toUpperCase()}`} color={C.procText} bg={C.procBg} border={C.procBorder}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {sheet.process.steps.map((step, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                <div style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                  <span style={{ flexShrink: 0, padding: "2px 8px", borderRadius: 5, background: "rgba(167,139,250,0.18)", border: "1px solid rgba(167,139,250,0.35)", fontSize: 10.5, fontWeight: 800, color: "#a78bfa", whiteSpace: "nowrap" }}>
                    {i + 1}.
                  </span>
                  <span style={{ fontSize: 12.5, color: "rgba(255,255,255,0.85)", lineHeight: 1.65 }}>{step}</span>
                </div>
                {i < sheet.process!.steps.length - 1 && (
                  <span style={{ fontSize: 18, color: "rgba(167,139,250,0.3)", marginLeft: 30, marginTop: 2 }}>↓</span>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Diagram ──────────────────────────────────────────────── */}
      {sheet.diagram && sheet.diagram.type !== "none" && (
        <Section icon="📊" label={`DIAGRAM: ${sheet.diagram.title.toUpperCase()}`} color={C.diagText} bg={C.diagBg} border={C.diagBorder}>
          <DiagramView diagram={sheet.diagram} />
          {sheet.diagram.description && (
            <p style={{ ...C.body, fontSize: 11.5, color: "rgba(148,163,184,0.7)", margin: "10px 0 0", fontStyle: "italic" }}>
              {sheet.diagram.description}
            </p>
          )}
        </Section>
      )}

      {/* ── Formula Box ──────────────────────────────────────────── */}
      {sheet.formula && (
        <div style={{ ...C.baseCard, background: C.formulaBg, border: `2px solid ${C.formulaBorder}`, textAlign: "center" }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", color: "rgba(251,191,36,0.6)", marginBottom: 10 }}>
            FORMULA
          </div>
          <div style={{
            fontSize: 22, fontWeight: 900, color: "#fbbf24", fontFamily: "monospace",
            padding: "12px 20px", borderRadius: 8,
            background: "rgba(251,191,36,0.06)", border: "1px dashed rgba(251,191,36,0.3)",
            marginBottom: 10, letterSpacing: "0.02em",
          }}>
            {sheet.formula.expression}
          </div>
          <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.75)", margin: "0 0 10px", lineHeight: 1.5 }}>
            {sheet.formula.description}
          </p>
          {sheet.formula.variables && sheet.formula.variables.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
              {sheet.formula.variables.map((v, i) => (
                <span key={i} style={{ padding: "3px 10px", borderRadius: 6, background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.2)", fontSize: 11.5, color: "rgba(255,255,255,0.82)", fontFamily: "monospace" }}>
                  <span style={{ color: "#fbbf24", fontWeight: 800 }}>{v.symbol}</span> = {v.meaning}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Memory Tricks ────────────────────────────────────────── */}
      {sheet.memoryTrick && (
        <Section icon="🧠" label="MEMORY TRICK" color={C.memText} bg={C.memBg} border={C.memBorder}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#d8b4fe", marginBottom: 8, letterSpacing: "0.04em" }}>
            {sheet.memoryTrick.trick}
          </div>
          <p style={{ ...C.body, margin: 0, fontSize: 12.5, color: "rgba(255,255,255,0.78)" }}>
            {sheet.memoryTrick.expansion}
          </p>
        </Section>
      )}

      {/* ── Real DAT Example ─────────────────────────────────────── */}
      <Section icon="📝" label="REAL DAT EXAMPLE" color={C.factsText} bg={C.exBg} border={C.exBorder}>
        <div style={{ padding: "10px 13px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", marginBottom: 9 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "rgba(148,163,184,0.6)", letterSpacing: "0.1em", marginBottom: 5 }}>QUESTION</div>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.88)", margin: 0, lineHeight: 1.65 }}>{sheet.datExample.question}</p>
        </div>
        <div style={{ padding: "10px 13px", borderRadius: 8, background: "rgba(52,211,153,0.07)", border: "1px solid rgba(52,211,153,0.25)" }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "#34d399", letterSpacing: "0.1em", marginBottom: 5 }}>ANSWER</div>
          <p style={{ fontSize: 13, color: "#ecfdf5", margin: "0 0 8px", fontWeight: 700 }}>{sheet.datExample.answer}</p>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.72)", margin: 0, lineHeight: 1.6 }}>{sheet.datExample.reasoning}</p>
        </div>
      </Section>

      {/* ── Mistakes Students Make ───────────────────────────────── */}
      <Section icon="❌" label="MISTAKES STUDENTS MAKE" color={C.trapText} bg={C.mistakeBg} border={C.mistakeBorder}>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {sheet.mistakes.map((m, i) => (
            <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
              <span style={{ flexShrink: 0, fontSize: 12.5, marginTop: 1 }}>❌</span>
              <span style={{ fontSize: 12.5, color: "rgba(255,255,255,0.82)", lineHeight: 1.65 }}>{m}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Expert Brain Connections ─────────────────────────────── */}
      {sheet.connections.length > 0 && (
        <Section icon="🔗" label="EXPERT BRAIN CONNECTIONS" color="#818cf8" bg={C.connBg} border={C.connBorder}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sheet.connections.map((conn, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ padding: "3px 10px", borderRadius: 6, background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.3)", fontSize: 11.5, color: "#a5b4fc", fontWeight: 700, whiteSpace: "nowrap" }}>
                  {conn.from}
                </span>
                <span style={{ fontSize: 14, color: "rgba(99,102,241,0.5)" }}>→</span>
                <span style={{ padding: "3px 10px", borderRadius: 6, background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.3)", fontSize: 11.5, color: "#c4b5fd", fontWeight: 700, whiteSpace: "nowrap" }}>
                  {conn.to}
                </span>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", lineHeight: 1.5 }}>
                  — {conn.connection}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Related Topics ───────────────────────────────────────── */}
      {sheet.relatedTopics.length > 0 && (
        <div style={{ ...C.baseCard, background: C.relatedBg, border: "1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ ...C.sectionLabel, color: "rgba(148,163,184,0.6)", marginBottom: 10 }}>
            RELATED TOPICS
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {sheet.relatedTopics.map((topic, i) => (
              <span key={i} style={{ padding: "4px 11px", borderRadius: 999, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", fontSize: 12, color: "rgba(226,232,240,0.82)", fontWeight: 600 }}>
                • {topic}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
