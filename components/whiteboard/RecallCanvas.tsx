"use client";
// components/whiteboard/RecallCanvas.tsx
// Zero-API flip-card recall session powered by the current page's NoteCard[] teaching sequence.
// Each NoteCard becomes one flip card. Completion offers "Save to Recall Lab".

import React, { useState, useCallback, useEffect, useMemo } from "react";
import type { NoteCard } from "@/lib/insights/synthesizeTeachingOutput";
import {
  buildRecallSetFromTeachingSequence,
  saveRecallSet,
} from "@/lib/recalllab/recallStore";
import type { NoteSubject } from "@/lib/notelab/ultraNoteStore";

const FRAME_COLORS: Record<string, string> = {
  must_know:          "#fcd34d",
  mechanism:          "#60a5fa",
  procedure_flow:     "#60a5fa",
  clinical_reasoning: "#34d399",
  dat_trap:           "#f87171",
  exam_strategy:      "#f87171",
  common_mistake:     "#fb923c",
  memory_hook:        "#a78bfa",
  visual_mnemonic:    "#a78bfa",
  connection_map:     "#22d3ee",
  clinical_pearl:     "#4ade80",
  why_this_matters:   "#facc15",
  recall_questions:   "#e879f9",
  quick_review:       "#e879f9",
  pattern_recognition:"#38bdf8",
  complication_risk:  "#ef4444",
  formula_breakdown:  "#93c5fd",
  worked_example:     "#6ee7b7",
};

const FRAME_LABELS: Record<string, string> = {
  must_know:          "Core Concept",
  mechanism:          "Mechanism",
  procedure_flow:     "Procedure",
  clinical_reasoning: "Clinical Reasoning",
  dat_trap:           "Watch Out",
  exam_strategy:      "Exam Strategy",
  common_mistake:     "Common Mistake",
  memory_hook:        "Memory Hook",
  visual_mnemonic:    "Mnemonic",
  connection_map:     "Connections",
  clinical_pearl:     "Clinical Pearl",
  why_this_matters:   "Why This Matters",
  recall_questions:   "Quiz",
  quick_review:       "Quick Review",
  pattern_recognition:"Pattern",
  complication_risk:  "Complication Risk",
  formula_breakdown:  "Formula",
  worked_example:     "Worked Example",
};

interface RecallCanvasProps {
  noteCards: NoteCard[];
  pageTitle?: string | null;
  bookId?: string;
  bookTitle?: string;
  pageNumber?: number;
  knowledgeNodeId?: string | null;
  subject?: NoteSubject;
}

type RatingResult = "know" | "review";

function buildFront(nc: NoteCard): string {
  const t = nc.title;
  switch (nc.type) {
    case "recall_questions":
    case "quick_review":       return `Quiz: ${t}`;
    case "dat_trap":
    case "exam_strategy":      return `Watch out — what is the trap with: ${t}?`;
    case "mechanism":
    case "procedure_flow":     return `Explain the mechanism: ${t}`;
    case "common_mistake":     return `What is the common mistake with: ${t}?`;
    case "memory_hook":
    case "visual_mnemonic":    return `How do you remember: ${t}?`;
    case "complication_risk":  return `What are the complications of: ${t}?`;
    case "formula_breakdown":  return `Break down the formula: ${t}`;
    default:                   return t;
  }
}

export default function RecallCanvas({
  noteCards,
  pageTitle,
  bookId = "default-book",
  bookTitle,
  pageNumber = 0,
  knowledgeNodeId,
  subject,
}: RecallCanvasProps) {
  const [idx, setIdx]         = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [ratings, setRatings] = useState<RatingResult[]>([]);
  const [saved, setSaved]     = useState(false);
  const [saving, setSaving]   = useState(false);

  // Reset session whenever the teaching sequence changes (same-page study-model refresh
  // or programmatic noteCards update). Page/book changes unmount the whole panel via key.
  useEffect(() => {
    setIdx(0);
    setFlipped(false);
    setRatings([]);
    setSaved(false);
  }, [noteCards]);

  const cards = useMemo(
    () => noteCards.map(nc => ({ front: buildFront(nc), back: nc.body, type: nc.type })),
    [noteCards]
  );

  const total       = cards.length;
  const done        = idx >= total;
  const knownCount  = ratings.filter(r => r === "know").length;
  const reviewCount = ratings.filter(r => r === "review").length;

  const flip = useCallback(() => setFlipped(f => !f), []);

  const rate = useCallback((result: RatingResult) => {
    setRatings(prev => [...prev, result]);
    setFlipped(false);
    setTimeout(() => setIdx(i => i + 1), 120);
  }, []);

  const restart = useCallback(() => {
    setIdx(0);
    setFlipped(false);
    setRatings([]);
    setSaved(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (saving || saved || noteCards.length === 0) return;
    setSaving(true);
    try {
      const set = buildRecallSetFromTeachingSequence(noteCards, {
        bookId,
        bookTitle,
        pageNumber,
        pageTitle,
        knowledgeNodeId,
        subject,
      });
      await saveRecallSet(set);
      window.dispatchEvent(new CustomEvent("recall-lab-updated"));
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }, [saving, saved, noteCards, bookId, bookTitle, pageNumber, pageTitle, knowledgeNodeId, subject]);

  if (noteCards.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 320, color: "rgba(148,163,184,0.6)", gap: 14, padding: "40px 24px" }}>
        <div style={{ fontSize: 38 }}>🎯</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>Recall session not ready</div>
        <div style={{ fontSize: 12, maxWidth: 260, textAlign: "center", lineHeight: 1.7 }}>
          Open an instructional page and let the Study Sheet load — the recall session generates instantly.
        </div>
      </div>
    );
  }

  // ── Completion screen ──────────────────────────────────────────────────────
  if (done) {
    const pct = total > 0 ? Math.round((knownCount / total) * 100) : 0;
    const emoji = pct >= 80 ? "🏆" : pct >= 50 ? "📈" : "📚";

    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "32px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 40 }}>{emoji}</div>
        <div style={{ fontSize: 17, fontWeight: 800, color: "rgba(255,255,255,0.95)" }}>Session Complete</div>

        {/* Score ring */}
        <div style={{
          width: 72, height: 72, borderRadius: "50%",
          background: `conic-gradient(${pct >= 80 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#3b82f6"} ${pct * 3.6}deg, rgba(255,255,255,0.08) 0deg)`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(8,16,32,0.95)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: "rgba(255,255,255,0.9)" }}>{pct}%</span>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#10b981" }}>{knownCount}</div>
            <div style={{ fontSize: 10, color: "rgba(148,163,184,0.6)", fontWeight: 600 }}>GOT IT</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#f59e0b" }}>{reviewCount}</div>
            <div style={{ fontSize: 10, color: "rgba(148,163,184,0.6)", fontWeight: 600 }}>REVIEW</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: "rgba(255,255,255,0.6)" }}>{total}</div>
            <div style={{ fontSize: 10, color: "rgba(148,163,184,0.6)", fontWeight: 600 }}>TOTAL</div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%", maxWidth: 280 }}>
          {/* Save CTA */}
          <button
            type="button"
            onClick={handleSave}
            disabled={saved || saving}
            style={{
              padding: "10px 0", borderRadius: 9, fontSize: 12, fontWeight: 700,
              cursor: saved || saving ? "default" : "pointer",
              border: saved ? "1px solid rgba(16,185,129,0.4)" : "1px solid rgba(139,92,246,0.4)",
              background: saved ? "rgba(16,185,129,0.08)" : "rgba(139,92,246,0.12)",
              color: saved ? "#34d399" : "#c4b5fd",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saved ? "✓ Saved to Recall Lab" : saving ? "Saving…" : "💾 Save to Recall Lab"}
          </button>

          {/* Restart */}
          <button
            type="button"
            onClick={restart}
            style={{ padding: "10px 0", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.7)" }}
          >
            ↺ Try Again
          </button>
        </div>
      </div>
    );
  }

  // ── Active card ────────────────────────────────────────────────────────────
  const card  = cards[idx];
  const color = FRAME_COLORS[card.type] ?? "#94a3b8";
  const label = FRAME_LABELS[card.type] ?? card.type;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 380, padding: "0 0 8px" }}>

      {/* Page title */}
      {pageTitle && (
        <div style={{ padding: "10px 20px 0", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "rgba(148,163,184,0.5)", textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {pageTitle}
        </div>
      )}

      {/* Progress bar */}
      <div style={{ padding: "12px 20px 8px", display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 10, color: "rgba(148,163,184,0.45)" }}>{idx + 1} / {total}</span>
          <span style={{ fontSize: 10, color: "rgba(16,185,129,0.7)", fontWeight: 600 }}>{knownCount} ✓</span>
        </div>
        <div style={{ height: 3, background: "rgba(255,255,255,0.07)", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${(idx / total) * 100}%`, background: "#3b82f6", borderRadius: 2, transition: "width 0.25s" }} />
        </div>
      </div>

      {/* Type chip */}
      <div style={{ padding: "0 20px 12px" }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color, background: `${color}18`, border: `1px solid ${color}40`, borderRadius: 6, padding: "3px 9px" }}>
          {label}
        </span>
      </div>

      {/* Flip card */}
      <div
        onClick={flip}
        style={{
          flex: 1,
          margin: "0 16px",
          borderRadius: 14,
          border: `1px solid ${flipped ? color + "50" : "rgba(255,255,255,0.1)"}`,
          background: flipped ? `${color}0d` : "rgba(11,20,40,0.7)",
          cursor: "pointer",
          padding: "20px 22px",
          transition: "background 0.2s, border-color 0.2s",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          minHeight: 140,
        }}
      >
        {!flipped ? (
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.92)", lineHeight: 1.4, marginBottom: 12 }}>
              {card.front}
            </div>
            <div style={{ fontSize: 10, color: "rgba(148,163,184,0.35)", textAlign: "center", paddingTop: 8 }}>
              Tap to reveal answer
            </div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color, marginBottom: 8 }}>
              ANSWER
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.75, color: "rgba(203,213,225,0.9)", whiteSpace: "pre-wrap" }}>
              {card.back}
            </div>
          </div>
        )}
      </div>

      {/* Rating buttons */}
      <div style={{ display: "flex", gap: 8, padding: "12px 16px 4px" }}>
        {flipped ? (
          <>
            <button
              type="button"
              onClick={() => rate("review")}
              style={{ flex: 1, padding: "10px 0", borderRadius: 9, border: "1px solid rgba(245,158,11,0.3)", background: "rgba(245,158,11,0.08)", color: "#fbbf24", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
            >
              ↺ Review Again
            </button>
            <button
              type="button"
              onClick={() => rate("know")}
              style={{ flex: 1, padding: "10px 0", borderRadius: 9, border: "1px solid rgba(16,185,129,0.3)", background: "rgba(16,185,129,0.1)", color: "#34d399", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
            >
              ✓ Got It
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={flip}
            style={{ flex: 1, padding: "10px 0", borderRadius: 9, border: `1px solid ${color}40`, background: `${color}12`, color, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
          >
            Flip Card →
          </button>
        )}
      </div>
    </div>
  );
}
