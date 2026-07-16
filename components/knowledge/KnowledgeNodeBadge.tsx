"use client";
// components/knowledge/KnowledgeNodeBadge.tsx
// Compact role + mastery badge. Attach to any note, recall set, or study guide card
// that carries a knowledgeNodeId. Optionally clickable to select the node.

import React from "react";
import { computeMastery, masteryLevel, MASTERY_COLORS } from "@/lib/knowledge/computeMastery";
import type { KnowledgeNodeProgress } from "@/lib/knowledge/knowledgeGraphSchema";

interface KnowledgeNodeBadgeProps {
  role:      string;
  progress?: KnowledgeNodeProgress | null;
  onClick?:  () => void;
}

export default function KnowledgeNodeBadge({ role, progress, onClick }: KnowledgeNodeBadgeProps) {
  const score = progress ? computeMastery(progress) : 0;
  const level = masteryLevel(score);
  const color = MASTERY_COLORS[level];
  const label = role || "Concept";

  return (
    <span
      onClick={onClick}
      title={`${label} · Mastery ${score}%`}
      style={{
        display:       "inline-flex",
        alignItems:    "center",
        gap:           5,
        padding:       "2px 8px 2px 5px",
        borderRadius:  20,
        background:    "rgba(255,255,255,0.05)",
        border:        `1px solid ${color}55`,
        fontSize:      10,
        fontWeight:    700,
        color,
        cursor:        onClick ? "pointer" : "default",
        letterSpacing: "0.04em",
        userSelect:    "none",
        flexShrink:    0,
      }}
    >
      <span
        style={{
          width:        6,
          height:       6,
          borderRadius: "50%",
          background:   color,
          flexShrink:   0,
        }}
      />
      {label}
      {progress && (
        <span style={{ opacity: 0.65, fontWeight: 600 }}>{score}%</span>
      )}
    </span>
  );
}
