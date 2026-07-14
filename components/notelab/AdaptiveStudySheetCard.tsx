"use client";
// components/notelab/AdaptiveStudySheetCard.tsx
// Adaptive Study Sheet renderer — profile-driven, domain-agnostic.
// Renders sections based on the active profile; each section carries optional citation metadata.

import React, { useState, useCallback } from "react";
import type { UltraNote } from "@/lib/notelab/ultraNoteStore";
import type { AdaptiveStudySheet, StudySheetSection, StudySheetDiagram, StudySheetQuestion } from "@/lib/notelab/adaptiveStudySheet";
import { STUDY_SHEET_PROFILES, profileFromSubject, PROFILE_ACCENT, type ProfileId } from "@/lib/notelab/studySheetProfiles";

// ── Color palette ─────────────────────────────────────────────────────────

// Cycle of section background themes — assigned by section index
const SECTION_PALETTE = [
  { accent: "#fbbf24", bg: "rgba(251,191,36,0.06)",  border: "rgba(251,191,36,0.22)" },
  { accent: "#38bdf8", bg: "rgba(56,189,248,0.06)",  border: "rgba(56,189,248,0.22)" },
  { accent: "#c4b5fd", bg: "rgba(196,181,253,0.07)", border: "rgba(196,181,253,0.25)" },
  { accent: "#34d399", bg: "rgba(52,211,153,0.06)",  border: "rgba(52,211,153,0.22)" },
  { accent: "#f87171", bg: "rgba(248,113,113,0.07)", border: "rgba(248,113,113,0.25)" },
  { accent: "#22d3ee", bg: "rgba(34,211,238,0.07)",  border: "rgba(34,211,238,0.25)" },
  { accent: "#fb923c", bg: "rgba(251,146,60,0.07)",  border: "rgba(251,146,60,0.25)" },
  { accent: "#a3e635", bg: "rgba(163,230,53,0.06)",  border: "rgba(163,230,53,0.22)" },
] as const;

const FORMULA_STYLE = {
  accent: "#fbbf24",
  bg:     "rgba(10,16,36,0.95)",
  border: "rgba(251,191,36,0.5)",
};

// ── Shared style helpers ──────────────────────────────────────────────────

const card: React.CSSProperties = {
  borderRadius: 11,
  padding: "12px 15px",
  marginBottom: 2,
};

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.12em",
  marginBottom: 8,
  display: "flex",
  alignItems: "center",
  gap: 6,
};

const bodyText: React.CSSProperties = {
  fontSize: 13.5,
  color: "rgba(255,255,255,0.9)",
  lineHeight: 1.75,
};

// ── Citation chip ─────────────────────────────────────────────────────────

function CitationChip({
  sourcePage,
  sourceText,
  onNavigate,
}: {
  sourcePage?: number | null;
  sourceText?: string | null;
  onNavigate?: (page: number) => void;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  if (!sourcePage && !sourceText) return null;
  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => sourcePage && onNavigate?.(sourcePage)}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "2px 7px",
          borderRadius: 4,
          border: "1px solid rgba(148,163,184,0.25)",
          background: "rgba(148,163,184,0.08)",
          color: "rgba(148,163,184,0.75)",
          fontSize: 10,
          fontWeight: 600,
          cursor: sourcePage && onNavigate ? "pointer" : "default",
          marginTop: 6,
        }}
      >
        {sourcePage ? `📄 p${sourcePage}` : "📄 source"}
      </button>
      {showTooltip && sourceText && (
        <div style={{
          position: "absolute",
          bottom: "calc(100% + 6px)",
          left: 0,
          zIndex: 20,
          background: "#0d1628",
          border: "1px solid rgba(148,163,184,0.2)",
          borderRadius: 7,
          padding: "8px 10px",
          width: 260,
          fontSize: 11.5,
          color: "rgba(226,232,240,0.85)",
          lineHeight: 1.6,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          pointerEvents: "none",
        }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: "rgba(148,163,184,0.5)", marginBottom: 4 }}>
            SOURCE PASSAGE
          </div>
          "{sourceText.slice(0, 200)}{sourceText.length > 200 ? "…" : ""}"
        </div>
      )}
    </span>
  );
}

// ── Section card ──────────────────────────────────────────────────────────

function SectionCard({
  section,
  palette,
  onNavigate,
}: {
  section: StudySheetSection;
  palette: typeof SECTION_PALETTE[number];
  onNavigate?: (page: number) => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div style={{ ...card, background: palette.bg, border: `1px solid ${palette.border}` }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{ ...labelStyle, color: palette.accent, cursor: "pointer", userSelect: "none" }}
      >
        <span>{section.icon}</span>
        <span style={{ flex: 1 }}>{section.label.toUpperCase()}</span>
        {(section.anchorId || section.sourcePage) && (
          <CitationChip
            sourcePage={section.sourcePage}
            sourceText={section.sourceText}
            onNavigate={onNavigate}
          />
        )}
        <span style={{ fontSize: 10, color: "rgba(148,163,184,0.35)", marginLeft: 4 }}>
          {open ? "▲" : "▼"}
        </span>
      </div>

      {open && (
        <>
          {section.content && (
            <p style={{ ...bodyText, margin: "0 0 6px" }}>{section.content}</p>
          )}
          {section.subItems && section.subItems.length > 0 && (
            <ul style={{ margin: "6px 0 0 0", padding: "0 0 0 18px" }}>
              {section.subItems.map((item, i) => (
                <li key={i} style={{ ...bodyText, marginBottom: 4 }}>{item}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

// ── Diagram renderer ──────────────────────────────────────────────────────

function DiagramView({ diagram }: { diagram: StudySheetDiagram }) {
  const { type, nodes, arrows, rows } = diagram;

  if (type === "table" && rows?.length) {
    const [header, ...body] = rows;
    return (
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              {header.map((h, i) => (
                <th key={i} style={{ padding: "6px 10px", background: "rgba(56,189,248,0.12)", color: "#38bdf8", fontWeight: 700, fontSize: 10, letterSpacing: "0.08em", textAlign: "left", borderBottom: "1px solid rgba(56,189,248,0.25)" }}>
                  {h.toUpperCase()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} style={{ padding: "6px 10px", color: "rgba(226,232,240,0.88)", fontSize: 12.5, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
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

  if (type === "comparison" && rows?.length) {
    const [header, ...body] = rows;
    const [leftH = "A", rightH = "B"] = header;
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
        {[leftH, rightH].map((h, i) => (
          <div key={i} style={{ padding: "7px 10px", background: "rgba(56,189,248,0.1)", color: "#38bdf8", fontWeight: 700, fontSize: 11, textAlign: "center" }}>
            {h}
          </div>
        ))}
        {body.map((row, ri) =>
          row.map((cell, ci) => (
            <div key={`${ri}-${ci}`} style={{ padding: "7px 10px", background: ci === 0 ? "rgba(251,191,36,0.05)" : "rgba(52,211,153,0.05)", color: "rgba(226,232,240,0.88)", fontSize: 12.5, borderTop: "1px solid rgba(255,255,255,0.04)" }}>
              {cell}
            </div>
          ))
        )}
      </div>
    );
  }

  if ((type === "flow" || type === "reaction" || type === "cycle" || type === "timeline") && nodes?.length) {
    const nodeMap: Record<string, string> = {};
    nodes.forEach(n => { nodeMap[n.id] = n.label; });

    // Build ordered chain from arrows if available, else just show nodes in sequence
    let chain: string[] = [];
    if (arrows?.length) {
      const fromSet = new Set(arrows.map(a => a.from));
      const toSet   = new Set(arrows.map(a => a.to));
      const start   = nodes.find(n => !toSet.has(n.id)) ?? nodes[0];
      const visited = new Set<string>();
      let cur = start.id;
      while (cur && !visited.has(cur)) {
        chain.push(cur);
        visited.add(cur);
        const next = arrows.find(a => a.from === cur && !visited.has(a.to));
        cur = next?.to ?? "";
      }
      // add any remaining nodes not reached
      nodes.forEach(n => { if (!visited.has(n.id)) chain.push(n.id); });
    } else {
      chain = nodes.map(n => n.id);
    }

    const getArrowLabel = (fromId: string): string | null =>
      arrows?.find(a => a.from === fromId)?.label ?? null;

    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
        {chain.map((nodeId, i) => {
          const label = nodeMap[nodeId] ?? nodeId;
          const arrowLabel = i < chain.length - 1 ? getArrowLabel(nodeId) : null;
          return (
            <React.Fragment key={nodeId}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ padding: "6px 14px", borderRadius: 6, background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.3)", color: "#bae6fd", fontSize: 12.5, fontWeight: 600 }}>
                  {label}
                </div>
              </div>
              {i < chain.length - 1 && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", paddingLeft: 14 }}>
                  {arrowLabel && (
                    <span style={{ fontSize: 10, color: "rgba(148,163,184,0.6)", fontStyle: "italic", marginBottom: 1 }}>
                      {arrowLabel}
                    </span>
                  )}
                  <span style={{ color: "rgba(56,189,248,0.6)", fontSize: 16, lineHeight: 1 }}>↓</span>
                </div>
              )}
            </React.Fragment>
          );
        })}
        {type === "cycle" && (
          <div style={{ fontSize: 11, color: "rgba(148,163,184,0.45)", paddingLeft: 14, marginTop: 2 }}>
            ↺ repeats
          </div>
        )}
      </div>
    );
  }

  // Anatomy / unknown — render description
  return (
    <p style={{ ...bodyText, fontSize: 12.5, color: "rgba(148,163,184,0.8)", fontStyle: "italic", margin: 0 }}>
      {diagram.description}
    </p>
  );
}

// ── Practice Questions quiz panel ─────────────────────────────────────────

function PracticeQuizPanel({ questions }: { questions: StudySheetQuestion[] }) {
  const [revealed, setRevealed] = useState<number[]>([]);
  const [selected, setSelected] = useState<Record<number, number>>({});

  function toggleReveal(qi: number) {
    setRevealed(prev => prev.includes(qi) ? prev.filter(x => x !== qi) : [...prev, qi]);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {questions.map((q, qi) => {
        const isRevealed = revealed.includes(qi);
        const userChoice = selected[qi];
        return (
          <div key={qi} style={{ borderRadius: 9, border: "1px solid rgba(196,181,253,0.2)", background: "rgba(196,181,253,0.04)", padding: "12px 14px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(226,232,240,0.95)", marginBottom: 10, lineHeight: 1.5 }}>
              {qi + 1}. {q.question}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {q.options.map((opt, oi) => {
                const isCorrect = oi === q.correctIndex;
                const isPicked  = userChoice === oi;
                let bg = "rgba(255,255,255,0.03)";
                let border = "1px solid rgba(255,255,255,0.08)";
                let color: string = "rgba(226,232,240,0.8)";
                if (isRevealed && isCorrect) { bg = "rgba(52,211,153,0.12)"; border = "1px solid rgba(52,211,153,0.4)"; color = "#6ee7b7"; }
                else if (isRevealed && isPicked && !isCorrect) { bg = "rgba(248,113,113,0.1)"; border = "1px solid rgba(248,113,113,0.3)"; color = "#fca5a5"; }
                return (
                  <button
                    key={oi}
                    type="button"
                    onClick={() => { setSelected(prev => ({ ...prev, [qi]: oi })); }}
                    style={{
                      textAlign: "left",
                      padding: "8px 12px",
                      borderRadius: 7,
                      border,
                      background: bg,
                      color,
                      fontSize: 12.5,
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    <span style={{ fontWeight: 700, marginRight: 6 }}>{["A", "B", "C", "D"][oi]}.</span>
                    {opt}
                    {isRevealed && isCorrect && <span style={{ float: "right" }}>✓</span>}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => toggleReveal(qi)}
              style={{ marginTop: 10, padding: "5px 12px", borderRadius: 6, border: "1px solid rgba(196,181,253,0.3)", background: "rgba(196,181,253,0.07)", color: "#c4b5fd", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
            >
              {isRevealed ? "Hide Answer" : "Reveal Answer"}
            </button>
            {isRevealed && (
              <div style={{ marginTop: 10, padding: "9px 12px", borderRadius: 7, background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.2)", fontSize: 12.5, color: "rgba(226,232,240,0.88)", lineHeight: 1.65 }}>
                <span style={{ fontWeight: 700, color: "#6ee7b7" }}>Explanation: </span>
                {q.explanation}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Generate button ───────────────────────────────────────────────────────

function GenerateButton({
  note,
  onSheet,
}: {
  note: UltraNote;
  onSheet: (sheet: AdaptiveStudySheet) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const profileId: ProfileId = profileFromSubject(note.subject ?? "General Notes") as ProfileId;
  const profile = STUDY_SHEET_PROFILES[profileId];
  const accentColor = PROFILE_ACCENT[profileId];
  const anchorCount = note.highlightAnchors?.length ?? 0;

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const body = {
        concept:          note.topic,
        subjectArea:      note.subject ?? "General Notes",
        profileId,
        canonicalAnchors: note.highlightAnchors?.slice(0, 10),
        pageThesis:       note.pageThesis,
        sourcePage:       note.pageNumber,
        noteId:           note.id,
      };
      const res = await fetch("/api/adaptive-study-sheet", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const { sheet } = await res.json();
      onSheet(sheet);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [note, profileId, onSheet]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "32px 16px", textAlign: "center" }}>
      {/* Profile badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 999, border: `1px solid ${accentColor}40`, background: `${accentColor}10` }}>
        <span style={{ fontSize: 16 }}>{profile.icon}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: accentColor }}>{profile.label} Profile</span>
      </div>

      <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>
        Generate Study Sheet for
      </div>
      <div style={{ fontSize: 16, fontWeight: 800, color: accentColor }}>
        {note.topic}
      </div>

      {/* Source quality indicator */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
        {anchorCount > 0 && (
          <span style={{ fontSize: 11, color: "rgba(52,211,153,0.8)", padding: "3px 9px", borderRadius: 999, border: "1px solid rgba(52,211,153,0.2)", background: "rgba(52,211,153,0.06)" }}>
            ✓ {anchorCount} source anchor{anchorCount !== 1 ? "s" : ""}
          </span>
        )}
        {note.pageThesis && (
          <span style={{ fontSize: 11, color: "rgba(56,189,248,0.8)", padding: "3px 9px", borderRadius: 999, border: "1px solid rgba(56,189,248,0.2)", background: "rgba(56,189,248,0.06)" }}>
            ✓ page thesis
          </span>
        )}
        <span style={{ fontSize: 11, color: "rgba(148,163,184,0.6)", padding: "3px 9px", borderRadius: 999, border: "1px solid rgba(148,163,184,0.15)", background: "rgba(148,163,184,0.05)" }}>
          p{note.pageNumber}
        </span>
      </div>

      <div style={{ fontSize: 12, color: "rgba(148,163,184,0.55)", maxWidth: 280, lineHeight: 1.6 }}>
        AI will generate {profile.sections.filter(s => s.required).length} required sections
        {profile.hasFormula ? ", formula" : ""}
        {profile.hasDiagram ? ", diagram" : ""}
        {profile.hasPracticeQuestions ? ", and practice questions" : ""}
        {" "}from the source anchors and page intelligence.
      </div>

      {error && (
        <div style={{ fontSize: 12, color: "#f87171", maxWidth: 300, textAlign: "center" }}>
          ⚠️ {error}
        </div>
      )}

      <button
        type="button"
        onClick={generate}
        disabled={loading}
        style={{
          padding: "11px 28px",
          borderRadius: 10,
          border: `1px solid ${accentColor}50`,
          background: `${accentColor}15`,
          color: accentColor,
          fontSize: 14,
          fontWeight: 700,
          cursor: loading ? "wait" : "pointer",
          opacity: loading ? 0.6 : 1,
          transition: "all 0.18s",
        }}
      >
        {loading ? "Generating…" : `${profile.icon} Generate Study Sheet`}
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

interface AdaptiveStudySheetCardProps {
  note: UltraNote;
  sheet?: AdaptiveStudySheet | null;
  onSheet: (sheet: AdaptiveStudySheet) => void;
  onNavigateToPage?: (page: number) => void;
}

export default function AdaptiveStudySheetCard({
  note,
  sheet,
  onSheet,
  onNavigateToPage,
}: AdaptiveStudySheetCardProps) {
  const [regenerating, setRegenerating] = useState(false);

  const profileId = (sheet?.profileId as ProfileId | undefined) ?? (profileFromSubject(note.subject ?? "General Notes") as ProfileId);
  const profile = STUDY_SHEET_PROFILES[profileId];
  const accentColor = PROFILE_ACCENT[profileId];

  const handleRegenerate = useCallback(async () => {
    if (regenerating) return;
    setRegenerating(true);
    try {
      const body = {
        concept:          note.topic,
        subjectArea:      note.subject ?? "General Notes",
        profileId,
        canonicalAnchors: note.highlightAnchors?.slice(0, 10),
        pageThesis:       note.pageThesis,
        sourcePage:       note.pageNumber,
        noteId:           note.id,
      };
      const res = await fetch("/api/adaptive-study-sheet", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { sheet: newSheet } = await res.json();
      onSheet(newSheet);
    } catch (e) {
      console.error("[ADAPTIVE_SHEET:regen-fail]", e);
    } finally {
      setRegenerating(false);
    }
  }, [note, profileId, onSheet, regenerating]);

  if (!sheet) {
    return <GenerateButton note={note} onSheet={onSheet} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

      {/* Header strip */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontSize: 14 }}>{profile.icon}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: accentColor }}>{profile.label}</span>
          <span style={{ fontSize: 10, color: "rgba(148,163,184,0.4)" }}>·</span>
          <span style={{ fontSize: 10, color: "rgba(148,163,184,0.5)" }}>{sheet.documentType}</span>
        </div>
        <button
          type="button"
          onClick={handleRegenerate}
          disabled={regenerating}
          title="Regenerate study sheet"
          style={{
            padding: "4px 10px",
            borderRadius: 6,
            border: "1px solid rgba(148,163,184,0.2)",
            background: "transparent",
            color: "rgba(148,163,184,0.55)",
            fontSize: 11,
            fontWeight: 600,
            cursor: regenerating ? "wait" : "pointer",
            opacity: regenerating ? 0.5 : 1,
          }}
        >
          {regenerating ? "…" : "↺ Regenerate"}
        </button>
      </div>

      {/* Core Idea — always prominent */}
      <div style={{
        borderRadius: 11,
        padding: "14px 16px",
        background: `${accentColor}0d`,
        border: `2px solid ${accentColor}40`,
      }}>
        <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.13em", color: `${accentColor}99`, marginBottom: 8 }}>
          CORE IDEA
        </div>
        <p style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.96)", lineHeight: 1.65, margin: 0 }}>
          {sheet.coreIdea}
        </p>
        {sheet.canonicalSourcePage && (
          <CitationChip
            sourcePage={sheet.canonicalSourcePage}
            onNavigate={onNavigateToPage}
          />
        )}
      </div>

      {/* Profile sections */}
      {sheet.sections.map((section, i) => (
        <SectionCard
          key={`${section.label}-${i}`}
          section={section}
          palette={SECTION_PALETTE[i % SECTION_PALETTE.length]}
          onNavigate={onNavigateToPage}
        />
      ))}

      {/* Formula */}
      {sheet.formula && (
        <div style={{ ...card, background: FORMULA_STYLE.bg, border: `2px solid ${FORMULA_STYLE.border}` }}>
          <div style={{ ...labelStyle, color: FORMULA_STYLE.accent }}>
            <span>📐</span>
            <span>FORMULA</span>
            {sheet.formula.sourcePage && (
              <CitationChip sourcePage={sheet.formula.sourcePage} onNavigate={onNavigateToPage} />
            )}
          </div>
          <div style={{ textAlign: "center", padding: "10px 0" }}>
            <code style={{ fontSize: 20, fontWeight: 700, color: FORMULA_STYLE.accent, letterSpacing: "0.04em" }}>
              {sheet.formula.expression}
            </code>
          </div>
          <p style={{ fontSize: 12.5, color: "rgba(226,232,240,0.7)", margin: "8px 0 10px", textAlign: "center", fontStyle: "italic" }}>
            {sheet.formula.description}
          </p>
          {sheet.formula.variables?.length ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {sheet.formula.variables.map((v, i) => (
                <div key={i} style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)", fontSize: 12 }}>
                  <code style={{ color: FORMULA_STYLE.accent, fontWeight: 700 }}>{v.symbol}</code>
                  <span style={{ color: "rgba(226,232,240,0.7)", marginLeft: 5 }}>= {v.meaning}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}

      {/* Diagram */}
      {sheet.diagram && sheet.diagram.type !== "none" && (
        <div style={{ ...card, background: "rgba(56,189,248,0.05)", border: "1px solid rgba(56,189,248,0.2)" }}>
          <div style={{ ...labelStyle, color: "#38bdf8" }}>
            <span>📊</span>
            <span>{`DIAGRAM: ${sheet.diagram.title.toUpperCase()}`}</span>
            {sheet.diagram.anchorId && sheet.canonicalSourcePage && (
              <CitationChip sourcePage={sheet.canonicalSourcePage} onNavigate={onNavigateToPage} />
            )}
          </div>
          <DiagramView diagram={sheet.diagram} />
          {sheet.diagram.description && (
            <p style={{ fontSize: 11.5, color: "rgba(148,163,184,0.65)", margin: "10px 0 0", fontStyle: "italic" }}>
              {sheet.diagram.description}
            </p>
          )}
        </div>
      )}

      {/* Practice Questions */}
      {sheet.practiceQuestions?.length ? (
        <div style={{ ...card, background: "rgba(196,181,253,0.05)", border: "1px solid rgba(196,181,253,0.2)" }}>
          <div style={{ ...labelStyle, color: "#c4b5fd" }}>
            <span>📝</span>
            <span>PRACTICE QUESTIONS</span>
          </div>
          <PracticeQuizPanel questions={sheet.practiceQuestions} />
        </div>
      ) : null}

      {/* Connections */}
      {sheet.connections?.length ? (
        <div style={{ ...card, background: "rgba(52,211,153,0.05)", border: "1px solid rgba(52,211,153,0.18)" }}>
          <div style={{ ...labelStyle, color: "#34d399" }}>
            <span>🔗</span>
            <span>EXPERT CONNECTIONS</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sheet.connections.map((c, i) => (
              <div key={i} style={{ fontSize: 13, color: "rgba(226,232,240,0.88)", lineHeight: 1.55 }}>
                <span style={{ color: "#34d399", fontWeight: 700 }}>{c.from}</span>
                <span style={{ color: "rgba(148,163,184,0.5)", margin: "0 6px" }}>→</span>
                <span style={{ color: "#34d399", fontWeight: 700 }}>{c.to}</span>
                <span style={{ color: "rgba(148,163,184,0.7)", display: "block", fontSize: 12, marginTop: 2, paddingLeft: 2 }}>
                  {c.connection}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Related Topics */}
      {sheet.relatedTopics?.length ? (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "rgba(148,163,184,0.5)", marginBottom: 7 }}>
            RELATED TOPICS
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {sheet.relatedTopics.map((t, i) => (
              <span
                key={i}
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  border: "1px solid rgba(148,163,184,0.2)",
                  background: "rgba(148,163,184,0.06)",
                  color: "rgba(226,232,240,0.75)",
                  fontSize: 11.5,
                  fontWeight: 600,
                }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
