"use client";
// components/recalllab/RecallLab.tsx
// Recall Lab — active recall engine. Subject → Book → Topic → flip cards.

import React, { useEffect, useState } from "react";
import {
  getAllRecallSets,
  deleteRecallSet,
  updateCardDifficulty,
  type RecallSet,
  type RecallCard,
  type CardDifficulty,
  type CardType,
} from "@/lib/recalllab/recallStore";
import { type NoteSubject } from "@/lib/notelab/ultraNoteStore";

interface RecallLabProps {
  onNavigateToPage?: (pageNumber: number) => void;
  /** Increment to trigger a data reload from localStorage */
  refreshKey?: number;
  /** If set, auto-open this set in a recall session immediately */
  lastSetId?: string;
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
  definition: "📖",
  reason: "⚡",
  rule: "🔥",
  trap: "⚠️",
  contrast: "↔️",
  formula: "📐",
  memory: "💡",
};

const SOURCE_LABEL: Record<string, { label: string; color: string }> = {
  "right-panel": { label: "Right Panel", color: "#fbbf24" },
  notelab: { label: "NoteLab", color: "#93c5fd" },
};

type View = { kind: "dashboard" } | { kind: "session"; set: RecallSet };

function loadSets(): RecallSet[] {
  return getAllRecallSets();
}

export default function RecallLab({ onNavigateToPage, refreshKey, lastSetId }: RecallLabProps) {
  // Lazy init from localStorage — avoids empty-flash on first mount after card generation
  const [sets, setSets] = useState<RecallSet[]>(() => {
    const all = loadSets();
    console.log("[RECALLLAB_MOUNT]", {
      setsInStorage: all.length,
      lastSetId: lastSetId ?? null,
      setIds: all.slice(0, 5).map(s => s.id),
    });
    return all;
  });
  const [view, setView] = useState<View>(() => {
    if (lastSetId) {
      const all = loadSets();
      const found = all.find((s) => s.id === lastSetId);
      console.log("[RECALLLAB_INIT_VIEW]", { lastSetId, found: !!found, totalSets: all.length });
      if (found) return { kind: "session", set: found };
    }
    return { kind: "dashboard" };
  });

  // Reload when refreshKey changes (set was added while mounted)
  useEffect(() => {
    const current = loadSets();
    console.log("[RECALLLAB_REFRESHKEY]", { refreshKey, setsInStorage: current.length });
    setSets(current);
  }, [refreshKey]);

  // Storage event listener — fires when saveRecallSet dispatches "recall-lab-updated"
  useEffect(() => {
    const handler = () => {
      const current = loadSets();
      setSets(current);
      console.log("[RECALLLAB_STATE_COUNT]", { count: current.length });
    };
    window.addEventListener("recall-lab-updated", handler);
    return () => window.removeEventListener("recall-lab-updated", handler);
  }, []);

  // When lastSetId changes (new set generated), auto-open it
  useEffect(() => {
    if (!lastSetId) return;
    const current = loadSets();
    setSets(current);
    const found = current.find((s) => s.id === lastSetId);
    console.log("[RECALLLAB_SELECTED_SET]", { lastSetId, found: !!found, totalSets: current.length });
    if (found) setView({ kind: "session", set: found });
  }, [lastSetId]);

  function handleDelete(id: string) {
    deleteRecallSet(id);
    setSets(loadSets());
    if (view.kind === "session" && view.set.id === id) {
      setView({ kind: "dashboard" });
    }
  }

  // --- Session mode ---
  if (view.kind === "session") {
    return (
      <RecallSession
        set={view.set}
        onClose={() => { setView({ kind: "dashboard" }); setSets(loadSets()); }}
        onNavigateToPage={onNavigateToPage}
      />
    );
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
        <div style={{ fontSize: 12, lineHeight: 1.8, maxWidth: 320, margin: "0 auto" }}>
          <div style={{ marginBottom: 8, color: "rgba(148,163,184,0.7)" }}>Generate your first recall set:</div>
          <div style={{ background: "rgba(245,200,66,0.08)", border: "1px solid rgba(245,200,66,0.2)", borderRadius: 8, padding: "10px 14px", marginBottom: 10, fontSize: 11 }}>
            <span style={{ color: "#fcd34d", fontWeight: 700 }}>⚡ Right Panel</span>
            <span style={{ color: "rgba(255,255,255,0.5)" }}> → </span>
            <span style={{ color: "#fcd34d", fontWeight: 700 }}>Generate Study Set</span>
          </div>
          <div style={{ background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 8, padding: "10px 14px", fontSize: 11 }}>
            <span style={{ color: "#93c5fd", fontWeight: 700 }}>📝 NoteLab</span>
            <span style={{ color: "rgba(255,255,255,0.5)" }}> → </span>
            <span style={{ color: "#93c5fd", fontWeight: 700 }}>Generate Cards from Note</span>
          </div>
        </div>
      </div>
    );
  }

  // --- Dashboard ---
  // Group: subject → bookId → sets
  const bySubject = new Map<NoteSubject, Map<string, RecallSet[]>>();
  for (const s of sets) {
    const subj: NoteSubject = s.subject ?? "General Notes";
    if (!bySubject.has(subj)) bySubject.set(subj, new Map());
    const byBook = bySubject.get(subj)!;
    const bookKey = s.bookId;
    if (!byBook.has(bookKey)) byBook.set(bookKey, []);
    byBook.get(bookKey)!.push(s);
  }
  const usedSubjects = SUBJECT_ORDER.filter((s) => bySubject.has(s));

  const totalCards = sets.reduce((n, s) => n + s.cards.length, 0);
  const missedTotal = sets.reduce((n, s) => n + s.cards.filter((c) => c.isMissed).length, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.95)" }}>🎯 Recall Lab</div>
            <div style={{ fontSize: 10, color: "rgba(148,163,184,0.55)", marginTop: 2 }}>
              {sets.length} set{sets.length !== 1 ? "s" : ""} · {totalCards} cards
              {missedTotal > 0 && <span style={{ color: "#f87171", marginLeft: 6 }}>· {missedTotal} to review</span>}
            </div>
          </div>
          {missedTotal > 0 && (
            <button
              type="button"
              onClick={() => {
                const first = sets.find((s) => s.cards.some((c) => c.isMissed));
                if (first) setView({ kind: "session", set: first });
              }}
              style={{ fontSize: 10, fontWeight: 700, color: "#f87171", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 6, padding: "4px 8px", cursor: "pointer" }}
            >
              Review Missed
            </button>
          )}
        </div>
      </div>

      {/* Subject groups */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 8px" }}>
        {usedSubjects.map((subject) => {
          const byBook = bySubject.get(subject)!;
          return (
            <SubjectGroup
              key={subject}
              subject={subject}
              byBook={byBook}
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
// Subject group — collapsible, contains book sub-groups
// ---------------------------------------------------------------------------

function SubjectGroup({
  subject,
  byBook,
  onStart,
  onDelete,
  onNavigate,
}: {
  subject: NoteSubject;
  byBook: Map<string, RecallSet[]>;
  onStart: (s: RecallSet) => void;
  onDelete: (id: string) => void;
  onNavigate?: (page: number) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const allSets = [...byBook.values()].flat();
  const totalCards = allSets.reduce((n, s) => n + s.cards.length, 0);
  const missedCount = allSets.reduce((n, s) => n + s.cards.filter((c) => c.isMissed).length, 0);

  return (
    <div style={{ marginBottom: 8, borderRadius: 10, border: "1px solid rgba(255,255,255,0.07)", overflow: "hidden", background: "rgba(8,16,32,0.6)" }}>
      {/* Subject header */}
      <div
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", cursor: "pointer", userSelect: "none", background: "rgba(255,255,255,0.03)" }}
        onClick={() => setCollapsed((c) => !c)}
      >
        <span style={{ fontSize: 14 }}>{SUBJECT_ICON[subject]}</span>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>{subject}</span>
        <span style={{ fontSize: 10, color: "rgba(148,163,184,0.5)" }}>{allSets.length} set{allSets.length !== 1 ? "s" : ""} · {totalCards} cards</span>
        {missedCount > 0 && <span style={{ fontSize: 10, color: "#f87171", marginLeft: 4 }}>· {missedCount} missed</span>}
        <span style={{ fontSize: 10, color: "rgba(148,163,184,0.35)", marginLeft: 4 }}>{collapsed ? "▶" : "▼"}</span>
      </div>

      {!collapsed && (
        <div>
          {[...byBook.entries()].map(([bookId, bookSets]) => (
            <BookGroup
              key={bookId}
              bookId={bookId}
              bookTitle={bookSets[0]?.bookTitle}
              sets={bookSets}
              onStart={onStart}
              onDelete={onDelete}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Book group — collapsible within subject
// ---------------------------------------------------------------------------

function BookGroup({
  bookId,
  bookTitle,
  sets,
  onStart,
  onDelete,
  onNavigate,
}: {
  bookId: string;
  bookTitle?: string;
  sets: RecallSet[];
  onStart: (s: RecallSet) => void;
  onDelete: (id: string) => void;
  onNavigate?: (page: number) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const label = bookTitle || (bookId.length > 30 ? bookId.slice(0, 30) + "…" : bookId);

  return (
    <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
      <div
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 14px", cursor: "pointer", userSelect: "none" }}
        onClick={() => setCollapsed((c) => !c)}
      >
        <span style={{ fontSize: 11 }}>📖</span>
        <span style={{ flex: 1, fontSize: 11, color: "rgba(148,163,184,0.75)", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
        <span style={{ fontSize: 10, color: "rgba(148,163,184,0.35)" }}>{collapsed ? "▶" : "▼"}</span>
      </div>

      {!collapsed && (
        <div style={{ display: "flex", flexDirection: "column", gap: 5, padding: "0 8px 8px" }}>
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
// Recall Set row
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
  const src = set.sourceLabel ? SOURCE_LABEL[set.sourceLabel] : null;

  return (
    <div style={{ borderRadius: 9, border: "1px solid rgba(255,255,255,0.07)", background: "rgba(11,20,40,0.7)", padding: "10px 12px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Topic + source badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#fcd34d", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
              🎯 {set.topic}
            </div>
            {src && (
              <span style={{ fontSize: 9, fontWeight: 700, color: src.color, background: `${src.color}18`, border: `1px solid ${src.color}30`, borderRadius: 4, padding: "1px 5px", whiteSpace: "nowrap", flexShrink: 0 }}>
                {src.label}
              </span>
            )}
          </div>

          {/* Meta */}
          <div style={{ fontSize: 10, color: "rgba(148,163,184,0.55)", marginBottom: 6 }}>
            Page {set.pageNumber} · {set.cards.length} cards · {new Date(set.createdAt).toLocaleDateString()}
            {missedCount > 0 && <span style={{ color: "#f87171", marginLeft: 6 }}>{missedCount} missed</span>}
          </div>

          {/* Progress bar */}
          {reviewedCount > 0 && (
            <div style={{ height: 3, background: "rgba(255,255,255,0.07)", borderRadius: 2, marginBottom: 7, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${progress}%`, background: progress === 100 ? "#10b981" : "#3b82f6", borderRadius: 2 }} />
            </div>
          )}

          {/* Card type breakdown */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {Object.entries(
              set.cards.reduce((acc, c) => { acc[c.type] = (acc[c.type] ?? 0) + 1; return acc; }, {} as Record<string, number>)
            ).map(([type, count]) => (
              <span key={type} style={{ fontSize: 9, color: "rgba(148,163,184,0.55)", background: "rgba(255,255,255,0.05)", borderRadius: 4, padding: "2px 5px" }}>
                {CARD_TYPE_ICON[type] ?? "•"} {count}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 6, marginTop: 9 }}>
        <button
          type="button"
          onClick={onStart}
          style={{ flex: 2, padding: "7px 0", borderRadius: 7, border: "1px solid rgba(96,165,250,0.3)", background: "rgba(59,130,246,0.1)", color: "#93c5fd", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
        >
          ▶ Start Recall
        </button>
        {onNavigate && (
          <button
            type="button"
            onClick={() => onNavigate(set.pageNumber)}
            style={{ flex: 1, padding: "7px 0", borderRadius: 7, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "rgba(148,163,184,0.7)", fontSize: 11, cursor: "pointer" }}
          >
            p.{set.pageNumber}
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          style={{ padding: "7px 10px", borderRadius: 7, border: "1px solid rgba(239,68,68,0.2)", background: "rgba(239,68,68,0.07)", color: "#f87171", fontSize: 11, cursor: "pointer" }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Flip card session
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
  const [localSet, setLocalSet] = useState<RecallSet>(() => ({ ...set, cards: [...set.cards] }));

  const card = localSet.cards[idx];
  const total = localSet.cards.length;
  const reviewedCount = localSet.cards.filter((c) => c.difficulty !== undefined).length;
  const missedInSession = localSet.cards.filter((c) => c.isMissed).length;

  function rate(difficulty: CardDifficulty) {
    updateCardDifficulty(localSet.id, card.id, difficulty);
    setLocalSet((prev) => ({
      ...prev,
      cards: prev.cards.map((c) =>
        c.id === card.id ? { ...c, difficulty, reviewCount: c.reviewCount + 1, isMissed: difficulty === "hard" } : c
      ),
    }));
    setFlipped(false);
    setTimeout(() => setIdx((i) => Math.min(i + 1, total)), 120);
  }

  if (!card || idx >= total) {
    return (
      <div style={{ padding: "40px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>{missedInSession === 0 ? "✅" : "📋"}</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.9)", marginBottom: 6 }}>Session complete</div>
        <div style={{ fontSize: 12, color: "rgba(148,163,184,0.7)", marginBottom: 20 }}>
          {missedInSession === 0 ? "Perfect recall!" : `${missedInSession} card${missedInSession !== 1 ? "s" : ""} to review again`}
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
        <div style={{ flex: 1, fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.65)", textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {set.topic}
        </div>
        <div style={{ fontSize: 10, color: "rgba(148,163,184,0.45)", flexShrink: 0 }}>{idx + 1}/{total}</div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 3, background: "rgba(255,255,255,0.07)", borderRadius: 2, flexShrink: 0, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${(idx / total) * 100}%`, background: "#3b82f6", borderRadius: 2, transition: "width 0.25s" }} />
      </div>

      {/* Flip card */}
      <div
        style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", cursor: "pointer" }}
        onClick={() => !flipped && setFlipped(true)}
      >
        <div style={{
          borderRadius: 14,
          border: `1px solid ${flipped ? "rgba(96,165,250,0.3)" : "rgba(255,255,255,0.08)"}`,
          background: flipped ? "rgba(15,25,50,0.9)" : "rgba(11,20,40,0.8)",
          padding: "22px 18px",
          minHeight: 160,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          transition: "background 0.2s, border-color 0.2s",
        }}>
          {/* Type badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13 }}>{CARD_TYPE_ICON[card.type] ?? "•"}</span>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: cardTypeColor(card.type), textTransform: "uppercase" }}>{card.type}</span>
            {card.isMissed && <span style={{ fontSize: 9, color: "#f87171", marginLeft: "auto" }}>MISSED</span>}
          </div>

          {/* Question */}
          <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.9)", lineHeight: 1.6 }}>
            {card.front}
          </div>

          {/* Answer (after flip) */}
          {flipped && (
            <>
              <div style={{ height: 1, background: "rgba(255,255,255,0.08)" }} />
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", lineHeight: 1.7 }}>
                {card.back}
              </div>
              {card.hint && (
                <div style={{ fontSize: 11, color: "rgba(148,163,184,0.55)", fontStyle: "italic" }}>
                  💡 {card.hint}
                </div>
              )}
            </>
          )}

          {!flipped && (
            <div style={{ fontSize: 11, color: "rgba(148,163,184,0.35)", marginTop: "auto", textAlign: "center" }}>
              tap to reveal answer
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      {flipped ? (
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button type="button" onClick={() => rate("easy")} style={rateBtn("#10b981", "rgba(16,185,129,0.1)")}>✓ Easy</button>
          <button type="button" onClick={() => rate("medium")} style={rateBtn("#f59e0b", "rgba(245,158,11,0.1)")}>～ Medium</button>
          <button type="button" onClick={() => rate("hard")} style={rateBtn("#ef4444", "rgba(239,68,68,0.1)")}>✕ Hard</button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
            disabled={idx === 0}
            style={{ ...rateBtn("rgba(148,163,184,0.4)", "rgba(255,255,255,0.04)"), opacity: idx === 0 ? 0.3 : 1 }}
          >
            ← Prev
          </button>
          <button type="button" onClick={() => setFlipped(true)} style={rateBtn("#93c5fd", "rgba(59,130,246,0.1)")}>
            Show Answer
          </button>
          <button
            type="button"
            onClick={() => setIdx((i) => Math.min(total, i + 1))}
            disabled={idx >= total - 1}
            style={{ ...rateBtn("rgba(148,163,184,0.4)", "rgba(255,255,255,0.04)"), opacity: idx >= total - 1 ? 0.3 : 1 }}
          >
            Skip →
          </button>
        </div>
      )}

      {onNavigateToPage && (
        <button
          type="button"
          onClick={() => onNavigateToPage(set.pageNumber)}
          style={{ fontSize: 10, color: "rgba(148,163,184,0.4)", background: "none", border: "none", cursor: "pointer", textAlign: "center", flexShrink: 0 }}
        >
          View source · Page {set.pageNumber}
        </button>
      )}
    </div>
  );
}

function cardTypeColor(type: CardType | string): string {
  const colors: Record<string, string> = {
    core: "#fbbf24",
    definition: "#8fd3ff",
    reason: "#ffd580",
    rule: "#ffb86b",
    trap: "#ff9da1",
    contrast: "#c4b5fd",
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
    border: `1px solid ${color}55`,
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
