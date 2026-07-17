"use client";
// components/whiteboard/TeachingCanvas.tsx
// Sequential teaching frame viewer. Renders noteCards[] as an instructor-style
// lesson: one concept per frame, forward/back navigation, CSS transitions.
// Zero API calls — all data comes from the existing CurrentPageStudyModel.

import React, { useState, useEffect } from "react";
import type { NoteCard } from "@/lib/insights/synthesizeTeachingOutput";

const FRAME_LABELS: Record<string, string> = {
  must_know:          "Core Concept",
  mechanism:          "Mechanism",
  clinical_reasoning: "Clinical Reasoning",
  dat_trap:           "Watch Out",
  common_mistake:     "Common Mistake",
  memory_hook:        "Memory Hook",
  connection_map:     "Connections",
  clinical_pearl:     "Clinical Pearl",
  why_this_matters:   "Why This Matters",
  recall_questions:   "Quiz Yourself",
  pattern_recognition:"Pattern",
  complication_risk:  "Complication Risk",
};

const FRAME_COLORS: Record<string, string> = {
  must_know:          "#fcd34d",
  mechanism:          "#60a5fa",
  clinical_reasoning: "#34d399",
  dat_trap:           "#f87171",
  common_mistake:     "#fb923c",
  memory_hook:        "#a78bfa",
  connection_map:     "#22d3ee",
  clinical_pearl:     "#4ade80",
  why_this_matters:   "#facc15",
  recall_questions:   "#e879f9",
  pattern_recognition:"#38bdf8",
  complication_risk:  "#ef4444",
};

const FRAME_ICONS: Record<string, string> = {
  must_know:          "⚡",
  mechanism:          "⚙️",
  clinical_reasoning: "🩺",
  dat_trap:           "⚠️",
  common_mistake:     "❌",
  memory_hook:        "🧠",
  connection_map:     "🔗",
  clinical_pearl:     "💎",
  why_this_matters:   "🎯",
  recall_questions:   "❓",
  pattern_recognition:"🔍",
  complication_risk:  "🚨",
};

interface TeachingCanvasProps {
  pageTitle?: string | null;
  noteCards: NoteCard[];
}

export default function TeachingCanvas({ pageTitle, noteCards }: TeachingCanvasProps) {
  const [frameIndex, setFrameIndex] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [direction, setDirection] = useState<"forward" | "back">("forward");

  useEffect(() => { setFrameIndex(0); }, [noteCards]);

  if (noteCards.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 300, color: "rgba(148,163,184,0.6)", gap: 14, padding: "40px 24px" }}>
        <div style={{ fontSize: 38 }}>📚</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>Study Sheet not yet ready</div>
        <div style={{ fontSize: 12, maxWidth: 260, textAlign: "center", lineHeight: 1.7 }}>
          Open an instructional page — the teaching sequence appears instantly once the Study Sheet loads.
        </div>
      </div>
    );
  }

  const frame = noteCards[frameIndex];
  const color = FRAME_COLORS[frame.type] ?? "#94a3b8";
  const label = FRAME_LABELS[frame.type] ?? frame.type;
  const icon  = FRAME_ICONS[frame.type]  ?? "📌";

  const goTo = (idx: number, dir: "forward" | "back") => {
    if (animating || idx === frameIndex) return;
    setDirection(dir);
    setAnimating(true);
    setTimeout(() => { setFrameIndex(idx); setAnimating(false); }, 150);
  };

  const prev = () => goTo(Math.max(0, frameIndex - 1), "back");
  const next = () => goTo(Math.min(noteCards.length - 1, frameIndex + 1), "forward");

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 380 }}>

      {/* Page title strip */}
      {pageTitle && (
        <div style={{ padding: "10px 20px 0", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "rgba(148,163,184,0.5)", textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {pageTitle}
        </div>
      )}

      {/* Progress dots */}
      <div style={{ display: "flex", justifyContent: "center", gap: 5, padding: "14px 16px 10px", flexWrap: "wrap" }}>
        {noteCards.map((_, i) => (
          <div
            key={i}
            onClick={() => goTo(i, i > frameIndex ? "forward" : "back")}
            title={`Frame ${i + 1}: ${FRAME_LABELS[noteCards[i].type] ?? noteCards[i].type}`}
            style={{
              width: i === frameIndex ? 22 : 7,
              height: 7,
              borderRadius: 4,
              background: i === frameIndex ? color : "rgba(255,255,255,0.14)",
              cursor: "pointer",
              transition: "all 0.22s",
              flexShrink: 0,
            }}
          />
        ))}
      </div>

      {/* Frame body */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: "18px 24px 14px",
          opacity: animating ? 0 : 1,
          transform: animating
            ? `translateX(${direction === "forward" ? 18 : -18}px)`
            : "none",
          transition: "opacity 0.13s, transform 0.13s",
        }}
      >
        {/* Type chip + position */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <span style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color,
            background: `${color}18`,
            border: `1px solid ${color}40`,
            borderRadius: 6,
            padding: "3px 9px",
          }}>
            {icon} {label}
          </span>
          <span style={{ fontSize: 10, color: "rgba(148,163,184,0.38)" }}>
            {frameIndex + 1} / {noteCards.length}
          </span>
        </div>

        {/* Title */}
        <div style={{ fontSize: 19, fontWeight: 800, color: "rgba(255,255,255,0.95)", marginBottom: 14, lineHeight: 1.3 }}>
          {frame.title}
        </div>

        {/* Body */}
        <div style={{ fontSize: 13, lineHeight: 1.8, color: "rgba(203,213,225,0.88)", flex: 1, whiteSpace: "pre-wrap" }}>
          {frame.body}
        </div>
      </div>

      {/* Navigation */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px 18px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <button
          onClick={prev}
          disabled={frameIndex === 0}
          style={{
            flex: 1, padding: "9px 0", borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.09)",
            background: "rgba(255,255,255,0.03)",
            color: frameIndex === 0 ? "rgba(148,163,184,0.25)" : "rgba(255,255,255,0.65)",
            fontSize: 12, fontWeight: 600,
            cursor: frameIndex === 0 ? "default" : "pointer",
          }}
        >
          ← Previous
        </button>
        {frameIndex < noteCards.length - 1 ? (
          <button
            onClick={next}
            style={{
              flex: 2, padding: "9px 0", borderRadius: 8,
              border: `1px solid ${color}40`,
              background: `${color}18`,
              color,
              fontSize: 12, fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Next →
          </button>
        ) : (
          <div style={{ flex: 2, padding: "9px 0", borderRadius: 8, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", color: "#34d399", fontSize: 12, fontWeight: 700, textAlign: "center" }}>
            ✓ Complete
          </div>
        )}
      </div>
    </div>
  );
}
