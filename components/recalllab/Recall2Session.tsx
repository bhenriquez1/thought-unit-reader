"use client";
// components/recalllab/Recall2Session.tsx
// Recall 2.0 session component.
//
// Features vs. legacy RecallSession:
//   • 4-level confidence buttons (😊 Easy / 😐 Unsure / 😬 Guessed / ❌ Blank)
//   • Wrong cards re-queued 3 positions ahead — not just marked missed
//   • AI coach after 5 consecutive wrong answers
//   • Card provenance footer (page, category, source)
//   • Phase progress bar
//   • Keyboard shortcuts (Space = flip, 1-4 = rate)
//   • Batch SRS flush on session end

import React, { useCallback, useEffect, useRef, useState } from "react";
import { applyConfidence } from "@/lib/recalllab/recall2Srs";
import { flushSessionResults } from "@/lib/recalllab/recall2Store";
import type { ConfidenceLevel, RecallBlueprint, SessionPhase } from "@/lib/recalllab/recall2Types";
import type { RecallCoachRequest, RecallCoachResponse } from "@/pages/api/recall-coach";

// ── Category display ──────────────────────────────────────────────────────

const CATEGORY_LABEL: Record<string, string> = {
  recognition:   "★ Recognition",
  understanding: "★★ Understanding",
  procedure:     "★★★ Procedure",
  clinical:      "★★★★ Clinical",
  mistake:       "★★★★ Common Mistake",
  transfer:      "★★★★★ Transfer",
};

const CATEGORY_COLOR: Record<string, string> = {
  recognition:   "#94a3b8",
  understanding: "#60a5fa",
  procedure:     "#34d399",
  clinical:      "#f59e0b",
  mistake:       "#f87171",
  transfer:      "#c084fc",
};

// ── Phase labels ──────────────────────────────────────────────────────────

const PHASE_LABEL: Record<SessionPhase, string> = {
  warmup:  "Warm-up",
  weak:    "Weak Concepts",
  clinical: "Clinical Cases",
  mixed:   "Mixed Review",
  mastery: "Mastery Challenge",
};

// ── Confidence button config ──────────────────────────────────────────────

interface ConfidenceBtn {
  level: ConfidenceLevel;
  emoji: string;
  label: string;
  color: string;
  key:   string;
}

const CONFIDENCE_BTNS: ConfidenceBtn[] = [
  { level: "easy",    emoji: "😊", label: "Easy",         color: "#10b981", key: "1" },
  { level: "unsure",  emoji: "😐", label: "Unsure",       color: "#f59e0b", key: "2" },
  { level: "guessed", emoji: "😬", label: "Guessed",      color: "#f97316", key: "3" },
  { level: "blank",   emoji: "❌", label: "Didn't know",  color: "#ef4444", key: "4" },
];

// ── Props ─────────────────────────────────────────────────────────────────

interface Recall2SessionProps {
  initialQueue:    RecallBlueprint[];
  phases:          SessionPhase[];
  topic?:          string;
  bookTitle?:      string;
  onClose:         () => void;
  onNavigateToPage?: (page: number) => void;
}

// ── Component ─────────────────────────────────────────────────────────────

export default function Recall2Session({
  initialQueue,
  phases,
  topic,
  bookTitle,
  onClose,
  onNavigateToPage,
}: Recall2SessionProps) {
  const [queue,   setQueue]   = useState<RecallBlueprint[]>(() => [...initialQueue]);
  const [idx,     setIdx]     = useState(0);
  const [flipped, setFlipped] = useState(false);

  // Track updated blueprints for batch flush on session end
  const updatedRef = useRef<Map<string, RecallBlueprint>>(new Map());

  // Track consecutive wrong answers for AI coach trigger
  const consecutiveWrongRef = useRef(0);
  const requeuedRef         = useRef<Set<string>>(new Set()); // prevent infinite re-queue

  // AI coach state
  const [coachMessage, setCoachMessage] = useState<string | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);

  // Session stats
  const [sessionEasy,   setSessionEasy]   = useState(0);
  const [sessionMissed, setSessionMissed] = useState(0);
  const [done,          setDone]          = useState(false);

  const total        = initialQueue.length;
  const card         = queue[idx];
  const progressPct  = total > 0 ? Math.round((idx / total) * 100) : 0;

  // ── Keyboard shortcuts ────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (coachMessage) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setCoachMessage(null); } return; }
      if (done) return;
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); if (!flipped) setFlipped(true); return; }
      if (!flipped) return;
      const btn = CONFIDENCE_BTNS.find(b => b.key === e.key);
      if (btn) { e.preventDefault(); rate(btn.level); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flipped, done, coachMessage]);

  // ── AI Coach fetch ────────────────────────────────────────────────────

  const fetchCoach = useCallback(async () => {
    const wrongCards = queue
      .slice(Math.max(0, idx - 5), idx + 1)
      .filter(bp => {
        const h = bp.confidenceHistory;
        const last = h[h.length - 1];
        return last === "guessed" || last === "blank";
      })
      .slice(0, 5);

    if (wrongCards.length === 0) return;
    setCoachLoading(true);
    try {
      const body: RecallCoachRequest = {
        strugglingCards: wrongCards.map(bp => ({ front: bp.front, back: bp.back, category: bp.category })),
        topic,
        bookTitle,
        pageNumber: card?.pageNumber,
      };
      const res  = await fetch("/api/recall-coach", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = (await res.json()) as RecallCoachResponse;
      if (data.coachMessage) setCoachMessage(data.coachMessage);
    } catch { /* coach failure is non-fatal */ }
    finally { setCoachLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, queue, topic, bookTitle, card]);

  // ── Rate a card ───────────────────────────────────────────────────────

  function rate(confidence: ConfidenceLevel) {
    if (!card) return;

    const updated = applyConfidence(card, confidence);
    updatedRef.current.set(updated.id, updated);

    // Update queue entry with new confidence history (for coach context)
    setQueue(prev => prev.map((bp, i) => i === idx ? updated : bp));

    const isWrong = confidence === "guessed" || confidence === "blank";

    if (isWrong) {
      setSessionMissed(n => n + 1);
      consecutiveWrongRef.current += 1;

      // Re-queue once — insert 3 positions ahead
      if (!requeuedRef.current.has(card.id)) {
        requeuedRef.current.add(card.id);
        const insertAt = Math.min(idx + 3, queue.length);
        setQueue(prev => {
          const next = [...prev];
          next.splice(insertAt, 0, { ...updated });
          return next;
        });
      }

      // AI coach after 5 consecutive wrong
      if (consecutiveWrongRef.current >= 5) {
        consecutiveWrongRef.current = 0;
        void fetchCoach();
      }
    } else {
      if (confidence === "easy") setSessionEasy(n => n + 1);
      consecutiveWrongRef.current = 0;
    }

    setFlipped(false);
    setTimeout(() => {
      setIdx(i => {
        const next = i + 1;
        if (next >= queue.length) {
          // Session complete — flush SRS updates
          void flushSessionResults([...updatedRef.current.values()]);
          setDone(true);
        }
        return next;
      });
    }, 110);
  }

  // ── Completion screen ─────────────────────────────────────────────────

  if (done) {
    const accuracy = total > 0 ? Math.round(((total - sessionMissed) / total) * 100) : 100;
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", padding: "32px 20px", gap: 16, textAlign: "center" }}>
        <div style={{ fontSize: 48 }}>{accuracy >= 90 ? "🏆" : accuracy >= 70 ? "✅" : "📋"}</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.92)" }}>Session complete</div>
        <div style={{ fontSize: 13, color: "rgba(148,163,184,0.8)", lineHeight: 1.6, maxWidth: 280 }}>
          {accuracy >= 90
            ? "Excellent recall! Your study model is solid."
            : accuracy >= 70
              ? `Good session — ${sessionMissed} card${sessionMissed !== 1 ? "s" : ""} to revisit.`
              : `${sessionMissed} card${sessionMissed !== 1 ? "s" : ""} re-queued for tomorrow. Steady improvement counts.`}
        </div>
        <div style={{ display: "flex", gap: 20, marginTop: 4 }}>
          <Stat label="Accuracy" value={`${accuracy}%`} color={accuracy >= 70 ? "#10b981" : "#f87171"} />
          <Stat label="Easy"     value={String(sessionEasy)} color="#10b981" />
          <Stat label="Missed"   value={String(sessionMissed)} color={sessionMissed > 0 ? "#f87171" : "#94a3b8"} />
        </div>
        <button type="button" onClick={onClose} style={btnStyle("#3b82f6")}>← Back to Recall 2.0</button>
      </div>
    );
  }

  // ── Coach modal ───────────────────────────────────────────────────────

  if (coachMessage) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "20px 18px", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 20 }}>🧑‍🏫</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>AI Coach</span>
          <span style={{ marginLeft: "auto", fontSize: 10, color: "rgba(148,163,184,0.5)" }}>after 5 misses</span>
        </div>
        <div style={{
          flex: 1, overflowY: "auto",
          background: "rgba(30,41,59,0.8)",
          border: "1px solid rgba(96,165,250,0.2)",
          borderRadius: 12, padding: "16px 14px",
          fontSize: 12, color: "rgba(203,213,225,0.92)", lineHeight: 1.75,
          whiteSpace: "pre-line",
        }}>
          {coachMessage}
        </div>
        <button type="button" onClick={() => setCoachMessage(null)} style={btnStyle("#3b82f6")}>
          Got it — continue session  (Space)
        </button>
      </div>
    );
  }

  if (!card) return null;

  // ── Main card render ──────────────────────────────────────────────────

  const catColor = CATEGORY_COLOR[card.category] ?? "#94a3b8";
  const catLabel = CATEGORY_LABEL[card.category] ?? card.category;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "10px 14px", gap: 8 }}>

      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "rgba(148,163,184,0.6)", fontSize: 12, cursor: "pointer", padding: 0, flexShrink: 0 }}>
          ← Back
        </button>
        <div style={{ flex: 1, fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.55)", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {topic ?? "Recall 2.0"}
        </div>
        <div style={{ fontSize: 10, color: "rgba(148,163,184,0.4)", flexShrink: 0 }}>
          {idx + 1} / {queue.length}
        </div>
      </div>

      {/* Phase progress bar */}
      <PhaseBar phases={phases} progress={progressPct} />

      {/* Coach loading indicator */}
      {coachLoading && (
        <div style={{ fontSize: 10, color: "#60a5fa", textAlign: "center", animation: "pulse 1s infinite" }}>
          AI coach is preparing a tip…
        </div>
      )}

      {/* Flip card */}
      <div
        role="button"
        tabIndex={0}
        aria-label={flipped ? "Card revealed — rate your confidence" : "Tap to reveal answer"}
        onClick={() => !flipped && setFlipped(true)}
        onKeyDown={e => { if ((e.key === " " || e.key === "Enter") && !flipped) { e.preventDefault(); setFlipped(true); } }}
        style={{
          flex: 1, display: "flex", flexDirection: "column", cursor: flipped ? "default" : "pointer",
          borderRadius: 14,
          border: `1px solid ${flipped ? "rgba(96,165,250,0.30)" : "rgba(255,255,255,0.08)"}`,
          background: flipped ? "rgba(15,25,50,0.92)" : "rgba(11,20,40,0.82)",
          padding: "18px 16px", gap: 12, overflowY: "auto",
          transition: "background 0.18s, border-color 0.18s",
        }}
      >
        {/* Category badge */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <span style={{
            fontSize: 8, fontWeight: 800, letterSpacing: "0.09em",
            color: catColor, fontFamily: "ui-monospace, monospace",
            padding: "2px 6px", borderRadius: 4,
            background: `${catColor}18`, border: `1px solid ${catColor}30`,
          }}>
            {catLabel}
          </span>
          {card.pageNumber != null && onNavigateToPage && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onNavigateToPage(card.pageNumber!); }}
              style={{ fontSize: 8, color: "rgba(148,163,184,0.5)", background: "none", border: "none", cursor: "pointer", marginLeft: "auto", padding: 0 }}
            >
              p.{card.pageNumber} →
            </button>
          )}
        </div>

        {/* Learning objective (if present) */}
        {card.learningObjective && (
          <div style={{ fontSize: 9, color: "rgba(148,163,184,0.5)", fontStyle: "italic", flexShrink: 0 }}>
            {card.learningObjective}
          </div>
        )}

        {/* Question */}
        <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.92)", lineHeight: 1.65, flex: 1 }}>
          {card.front}
        </div>

        {/* Answer (after flip) */}
        {flipped && (
          <>
            <div style={{ height: 1, background: "rgba(96,165,250,0.18)", flexShrink: 0 }} />
            <div style={{ fontSize: 12, color: "rgba(203,213,225,0.88)", lineHeight: 1.75, whiteSpace: "pre-wrap" }}>
              {card.back}
            </div>
            {card.hint && (
              <div style={{ fontSize: 10, color: "rgba(148,163,184,0.55)", fontStyle: "italic" }}>
                💡 {card.hint}
              </div>
            )}
          </>
        )}

        {/* Flip hint */}
        {!flipped && (
          <div style={{ fontSize: 9, color: "rgba(148,163,184,0.35)", textAlign: "center", marginTop: 4 }}>
            tap to reveal  ·  Space
          </div>
        )}
      </div>

      {/* Confidence buttons (visible after flip) */}
      {flipped && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, flexShrink: 0 }}>
          {CONFIDENCE_BTNS.map(btn => (
            <button
              key={btn.level}
              type="button"
              onClick={() => rate(btn.level)}
              title={`${btn.label} (${btn.key})`}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                padding: "8px 4px", borderRadius: 9,
                background: `${btn.color}12`,
                border: `1px solid ${btn.color}40`,
                color: btn.color, cursor: "pointer", fontSize: 10,
                transition: "background 0.12s",
              }}
            >
              <span style={{ fontSize: 18 }}>{btn.emoji}</span>
              <span style={{ fontWeight: 600, letterSpacing: "0.02em" }}>{btn.label}</span>
              <span style={{ fontSize: 8, opacity: 0.55 }}>[{btn.key}]</span>
            </button>
          ))}
        </div>
      )}

      {/* SRS state footer */}
      <SrsFooter bp={card} />
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function PhaseBar({ phases, progress }: { phases: SessionPhase[]; progress: number }) {
  return (
    <div style={{ flexShrink: 0 }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
        {phases.map(phase => (
          <span key={phase} style={{ fontSize: 8, color: "rgba(148,163,184,0.5)", fontFamily: "ui-monospace, monospace" }}>
            {PHASE_LABEL[phase]}
          </span>
        ))}
      </div>
      <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${progress}%`, background: "#3b82f6", borderRadius: 2, transition: "width 0.25s" }} />
      </div>
    </div>
  );
}

function SrsFooter({ bp }: { bp: RecallBlueprint }) {
  const recentHistory = bp.confidenceHistory.slice(-5);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, paddingTop: 2 }}>
      <span style={{ fontSize: 9, color: "rgba(148,163,184,0.35)", fontVariantNumeric: "tabular-nums" }}>
        EF {bp.easeFactor.toFixed(1)} · ×{bp.reviewCount}
      </span>
      {recentHistory.length > 0 && (
        <span style={{ fontSize: 9, color: "rgba(148,163,184,0.35)", display: "flex", gap: 2 }}>
          {recentHistory.map((c, i) => (
            <span key={i}>{c === "easy" ? "😊" : c === "unsure" ? "😐" : c === "guessed" ? "😬" : "❌"}</span>
          ))}
        </span>
      )}
      {bp.sourceLabel && (
        <span style={{ marginLeft: "auto", fontSize: 8, color: "rgba(148,163,184,0.28)", fontFamily: "ui-monospace, monospace" }}>
          {bp.sourceLabel}
        </span>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <span style={{ fontSize: 20, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>{value}</span>
      <span style={{ fontSize: 9, color: "rgba(148,163,184,0.55)", letterSpacing: "0.05em" }}>{label}</span>
    </div>
  );
}

function btnStyle(bg: string): React.CSSProperties {
  return {
    padding: "10px 20px", borderRadius: 8, background: bg,
    border: "none", color: "#fff", cursor: "pointer",
    fontSize: 12, fontWeight: 600, letterSpacing: "0.02em",
  };
}
