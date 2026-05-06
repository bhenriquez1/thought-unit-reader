"use client";
// components/recalllab/RecallLab.tsx
// Recall Lab — the memory-engineering layer. Organized by subject → book → topic.
// Cards are generated from the Right Panel ("Generate Study Set") or NoteLab
// ("Generate Cards from Note"). Manual selection is a secondary fallback.

import React, { useCallback, useEffect, useState } from "react";
import {
  getAllRecallSets,
  deleteRecallSet,
  updateCardDifficulty,
  type RecallSet,
  type RecallCard,
  type CardDifficulty,
} from "@/lib/recalllab/recallStore";
import { type NoteSubject } from "@/lib/notelab/ultraNoteStore";

interface RecallLabProps {
  bookId?: string;
  onNavigateToPage?: (pageNumber: number) => void;
  refreshKey?: number;
}

const SUBJECT_ORDER: NoteSubject[] = ["Biology", "Calculus", "Dental / Clinical", "General Notes"];

const SUBJECT_ICON: Record<NoteSubject, string> = {
  Biology: "🧬",
  Calculus: "📐",
  "Dental / Clinical": "🦷",
  "General Notes": "📝",
};

const CARD_TYPE_ICON: Record<string, string> = {
  core: "🧠",
  pattern: "📈",
  reason: "⚡",
  rule: "🔥",
  trap: "⚠️",
  formula: "📐",
  memory: "💡",
};

type View = { kind: "dashboard" } | { kind: "session"; set: RecallSet };

export default function RecallLab({ bookId, onNavigateToPage, refreshKey }: RecallLabProps) {
  const [sets, setSets] = useState<RecallSet[]>([]);
  const [view, setView] = useState<View>({ kind: "dashboard" });

  const reload = useCallback(() => {
    const all = getAllRecallSets();
    setSets(bookId ? all.filter((s) => s.bookId === bookId) : all);
  }, [bookId]);

  useEffect(() => { reload(); }, [reload, refreshKey]);

  function handleDelete(id: string) {
    deleteRecallSet(id);
    reload();
  }

  // --- Empty state ---
  if (sets.length === 0) {
    return (
      <div style={{ padding: "40px 24px", textAlign: "center", color: "rgba(148,163,184,0.7)" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🎯</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.9)", marginBottom: 8 }}>
          Recall Lab
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.6)", marginBottom: 16 }}>
          Memory-engineering layer
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.8, maxWidth: 320, margin: "0 auto", color: "rgba(148,163,184,0.7)" }}>
          <div style={{ marginBottom: 8 }}>Generate your first recall set from the right panel:</div>
          <div style={{ background: "rgba(245,200,66,0.08)", border: "1px solid rgba(245,200,66,0.2)", borderRadius: 8, padding: "10px 14px", marginBottom: 10, fontSize: 11 }}>
            <span style={{ color: "#fcd34d", fontWeight: 700 }}>⚡ Right Panel</span>
            <span style={{ color: "rgba(255,255,255,0.6)" }}> → </span>
            <span style={{ color: "#fcd34d", fontWeight: 700 }}>Generate Study Set</span>
          </div>
          <div style={{ background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 8, padding: "10px 14px", fontSize: 11 }}>
            <span style={{ color: "#93c5fd", fontWeight: 700 }}>📝 NoteLab</span>
            <span style={{ color: "rgba(255,255,255,0.6)" }}> → </span>
            <span style={{ color: "#93c5fd", fontWeight: 700 }}>Generate Cards from Note</span>
          </div>
        </div>
      </div>
    );
  }

  // --- Session mode ---
  if (view.kind === "session") {
    return (
      <RecallSession
        set={view.set}
        onClose={() => { setView({ kind: "dashboard" }); reload(); }}
        onNavigateToPage={onNavigateToPage}
      />
    );
  }

  // --- Dashboard ---
  // Group: subject → sets
  const bySubject = new Map<NoteSubject, RecallSet[]>();
  for (const s of sets) {
    const subj: NoteSubject = s.subject ?? "General Notes";
    if (!bySubject.has(subj)) bySubject.set(subj, []);
    bySubject.get(subj)!.push(s);
  }
  const usedSubjects = SUBJECT_ORDER.filter((s) => bySubject.has(s));

  const missedTotal = sets.reduce((n, s) => n + s.cards.filter((c) => c.isMissed).length, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.95)" }}>🎯 Recall Lab</div>
            <div style={{ fontSize: 10, color: "rgba(148,163,184,0.6)", marginTop: 2 }}>
              {sets.length} set{sets.length !== 1 ? "s" : ""} · {sets.reduce((n, s) => n + s.cards.length, 0)} cards
              {missedTotal > 0 && <span style={{ color: "#f87171", marginLeft: 6 }}>· {missedTotal} missed</span>}
            </div>
          </div>
          {missedTotal > 0 && (
            <button
              type="button"
              onClick={() => {
                const missedSets = sets.filter((s) => s.cards.some((c) => c.isMissed));
                if (missedSets[0]) setView({ kind: "session", set: missedSets[0] });
              }}
              style={{ fontSize: 11, fontWeight: 700, color: "#f87171", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 7, padding: "5px 10px", cursor: "pointer" }}
            >
              Review Missed
            </button>
          )}
        </div>
      </div>

      {/* Set list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 10px" }}>
        {usedSubjects.map((subject) => {
          const subjectSets = bySubject.get(subject)!;
          return (
            <SubjectGroup
              key={subject}
              subject={subject}
              sets={subjectSets}
              onStart={(s) => setView({ kind: "session", set: s })}
              onDelete={handleDelete}
              onNavigate={onNavigateToPage}
            />
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subject group (collapsible)
// ---------------------------------------------------------------------------

function SubjectGroup({
  subject,
  sets,
  onStart,
  onDelete,
  onNavigate,
}: {
  subject: NoteSubject;
  sets: RecallSet[];
  onStart: (s: RecallSet) => void;
  onDelete: (id: string) => void;
  onNavigate?: (page: number) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const totalCards = sets.reduce((n, s) => n + s.cards.length, 0);
  const missedCount = sets.reduce((n, s) => n + s.cards.filter((c) => c.isMissed).length, 0);

  return (
    <div style={{ marginBottom: 10, borderRadius: 10, border: "1px solid rgba(255,255,255,0.07)", overflow: "hidden", background: "rgba(8,16,32,0.6)" }}>
      <div
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", cursor: "pointer", userSelect: "none", background: "rgba(255,255,255,0.03)" }}
        onClick={() => setCollapsed((c) => !c)}
      >
        <span style={{ fontSize: 15 }}>{SUBJECT_ICON[subject]}</span>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>{subject}</span>
        <span style={{ fontSize: 10, color: "rgba(148,163,184,0.55)" }}>{sets.length} set{sets.length !== 1 ? "s" : ""} · {totalCards} cards</span>
        {missedCount > 0 && <span style={{ fontSize: 10, color: "#f87171" }}>· {missedCount} missed</span>}
        <span style={{ fontSize: 10, color: "rgba(148,163,184,0.4)", marginLeft: 2 }}>{collapsed ? "▶" : "▼"}</span>
      </div>

      {!collapsed && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 8px" }}>
          {sets.map((s) => (
            <RecallSetRow
              key={s.id}
              set={s}
              onStart={() => onStart(s)}
              onDelete={() => onDelete(s.id)}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recall Set row card
// ---------------------------------------------------------------------------

function RecallSetRow({
  set,
  onStart,
  onDelete,
  onNavigate,
}: {
  set: RecallSet;
  onStart: () => void;
  onDelete: () => void;
  onNavigate?: (page: number) => void;
}) {
  const missedCount = set.cards.filter((c) => c.isMissed).length;
  const reviewedCount = set.cards.filter((c) => c.reviewCount > 0).length;
  const progress = set.cards.length > 0 ? Math.round((reviewedCount / set.cards.length) * 100) : 0;

  return (
    <div style={{ borderRadius: 9, border: "1px solid rgba(255,255,255,0.07)", background: "rgba(11,20,40,0.7)", padding: "10px 12px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#fcd34d", marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            🎯 {set.topic}
          </div>
          <div style={{ fontSize: 10, color: "rgba(148,163,184,0.6)", marginBottom: 6 }}>
            Page {set.pageNumber} · {set.cards.length} cards · {new Date(set.createdAt).toLocaleDateString()}
            {missedCount > 0 && <span style={{ color: "#f87171", marginLeft: 6 }}>{missedCount} missed</span>}
          </div>

          {/* Progress bar */}
          {reviewedCount > 0 && (
            <div style={{ height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2, marginBottom: 8, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${progress}%`, background: progress === 100 ? "#10b981" : "#3b82f6", borderRadius: 2, transition: "width 0.3s" }} />
            </div>
          )}

          {/* Card type breakdown */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {Object.entries(
              set.cards.reduce((acc, c) => { acc[c.type] = (acc[c.type] ?? 0) + 1; return acc; }, {} as Record<string, number>)
            ).map(([type, count]) => (
              <span key={type} style={{ fontSize: 9, color: "rgba(148,163,184,0.6)", background: "rgba(255,255,255,0.05)", borderRadius: 4, padding: "2px 5px" }}>
                {CARD_TYPE_ICON[type] ?? "•"} {count}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
        <button
          type="button"
          onClick={onStart}
          style={{ flex: 2, padding: "7px 0", borderRadius: 7, border: "1px solid rgba(96,165,250,0.35)", background: "rgba(59,130,246,0.12)", color: "#93c5fd", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
        >
          ▶ Start Recall
        </button>
        {onNavigate && (
          <button
            type="button"
            onClick={() => onNavigate(set.pageNumber)}
            style={{ flex: 1, padding: "7px 0", borderRadius: 7, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "rgba(148,163,184,0.8)", fontSize: 11, cursor: "pointer" }}
          >
            Go to p.{set.pageNumber}
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          style={{ padding: "7px 10px", borderRadius: 7, border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.08)", color: "#f87171", fontSize: 11, cursor: "pointer" }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recall Session (flip card mode)
// ---------------------------------------------------------------------------

function RecallSession({
  set,
  onClose,
  onNavigateToPage,
}: {
  set: RecallSet;
  onClose: () => void;
  onNavigateToPage?: (page: number) => void;
}) {
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [localSet, setLocalSet] = useState<RecallSet>(() => ({
    ...set,
    cards: [...set.cards],
  }));

  const card = localSet.cards[idx];
  const total = localSet.cards.length;
  const reviewedCount = localSet.cards.filter((c) => c.difficulty !== undefined).length;

  function rate(difficulty: CardDifficulty) {
    updateCardDifficulty(localSet.id, card.id, difficulty);
    setLocalSet((prev) => ({
      ...prev,
      cards: prev.cards.map((c) =>
        c.id === card.id ? { ...c, difficulty, reviewCount: c.reviewCount + 1, isMissed: difficulty === "hard" } : c
      ),
    }));
    setFlipped(false);
    setTimeout(() => setIdx((i) => (i + 1 < total ? i + 1 : i)), 120);
  }

  const allDone = reviewedCount === total && idx === total - 1 && flipped;
  const missedInSession = localSet.cards.filter((c) => c.isMissed).length;

  if (!card) {
    return (
      <div style={{ padding: "40px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.9)", marginBottom: 6 }}>Session complete</div>
        <div style={{ fontSize: 12, color: "rgba(148,163,184,0.7)", marginBottom: 20 }}>
          {missedInSession === 0 ? "Perfect recall!" : `${missedInSession} card${missedInSession !== 1 ? "s" : ""} to review`}
        </div>
        <button type="button" onClick={onClose} style={sessionBtn("#3b82f6")}>← Back to Recall Lab</button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "12px 14px", gap: 10 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "rgba(148,163,184,0.7)", fontSize: 12, cursor: "pointer", padding: 0 }}>← Back</button>
        <div style={{ flex: 1, fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.7)", textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          🎯 {set.topic}
        </div>
        <div style={{ fontSize: 10, color: "rgba(148,163,184,0.5)", flexShrink: 0 }}>{idx + 1}/{total}</div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2, flexShrink: 0, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${((idx) / total) * 100}%`, background: "#3b82f6", borderRadius: 2, transition: "width 0.25s" }} />
      </div>

      {/* Card */}
      <div
        style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", cursor: "pointer" }}
        onClick={() => setFlipped((f) => !f)}
      >
        <div style={{
          borderRadius: 14,
          border: `1px solid ${flipped ? "rgba(96,165,250,0.25)" : "rgba(255,255,255,0.08)"}`,
          background: flipped ? "rgba(15,25,50,0.9)" : "rgba(11,20,40,0.8)",
          padding: "24px 20px",
          minHeight: 180,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          transition: "background 0.2s, border-color 0.2s",
        }}>
          {/* Card type badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 14 }}>{CARD_TYPE_ICON[card.type] ?? "•"}</span>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: cardTypeColor(card.type), textTransform: "uppercase" }}>{card.type}</span>
            {card.isMissed && <span style={{ fontSize: 9, color: "#f87171", marginLeft: "auto" }}>MISSED</span>}
          </div>

          {/* Front */}
          <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.9)", lineHeight: 1.55 }}>
            {card.front}
          </div>

          {/* Back (after flip) */}
          {flipped && (
            <>
              <div style={{ height: 1, background: "rgba(255,255,255,0.08)" }} />
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", lineHeight: 1.65 }}>
                {card.back}
              </div>
              {card.hint && (
                <div style={{ fontSize: 11, color: "rgba(148,163,184,0.6)", fontStyle: "italic", marginTop: 4 }}>
                  💡 {card.hint}
                </div>
              )}
            </>
          )}

          {!flipped && (
            <div style={{ fontSize: 11, color: "rgba(148,163,184,0.4)", marginTop: "auto", textAlign: "center" }}>
              tap to reveal
            </div>
          )}
        </div>
      </div>

      {/* Rating buttons (only after flip) */}
      {flipped ? (
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button type="button" onClick={() => rate("easy")} style={rateBtn("#10b981", "rgba(16,185,129,0.12)")}>
            ✓ Easy
          </button>
          <button type="button" onClick={() => rate("medium")} style={rateBtn("#f59e0b", "rgba(245,158,11,0.12)")}>
            ～ Medium
          </button>
          <button type="button" onClick={() => rate("hard")} style={rateBtn("#ef4444", "rgba(239,68,68,0.12)")}>
            ✕ Hard
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
            disabled={idx === 0}
            style={{ ...rateBtn("rgba(148,163,184,0.5)", "rgba(255,255,255,0.04)"), opacity: idx === 0 ? 0.3 : 1 }}
          >
            ← Prev
          </button>
          <button
            type="button"
            onClick={() => setFlipped(true)}
            style={rateBtn("#93c5fd", "rgba(59,130,246,0.12)")}
          >
            Show Answer
          </button>
          <button
            type="button"
            onClick={() => setIdx((i) => Math.min(total - 1, i + 1))}
            disabled={idx === total - 1}
            style={{ ...rateBtn("rgba(148,163,184,0.5)", "rgba(255,255,255,0.04)"), opacity: idx === total - 1 ? 0.3 : 1 }}
          >
            Skip →
          </button>
        </div>
      )}

      {/* Go to source page */}
      {onNavigateToPage && (
        <button
          type="button"
          onClick={() => onNavigateToPage(set.pageNumber)}
          style={{ fontSize: 10, color: "rgba(148,163,184,0.5)", background: "none", border: "none", cursor: "pointer", textAlign: "center", flexShrink: 0 }}
        >
          View source: Page {set.pageNumber}
        </button>
      )}
    </div>
  );
}

function cardTypeColor(type: string): string {
  const colors: Record<string, string> = {
    core: "#fbbf24",
    pattern: "#8fd3ff",
    reason: "#ffd580",
    rule: "#ffb86b",
    trap: "#ff9da1",
    formula: "#a78bfa",
    memory: "#6ee7b7",
  };
  return colors[type] ?? "rgba(148,163,184,0.6)";
}

function rateBtn(color: string, bg: string): React.CSSProperties {
  return {
    flex: 1,
    padding: "9px 0",
    borderRadius: 9,
    border: `1px solid ${color}44`,
    background: bg,
    color,
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  };
}

function sessionBtn(color: string): React.CSSProperties {
  return {
    padding: "10px 24px",
    borderRadius: 9,
    border: `1px solid ${color}55`,
    background: `${color}14`,
    color,
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  };
}
