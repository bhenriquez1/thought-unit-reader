"use client";

// components/reader/ImportanceBadge.tsx
// Visual badge that displays the importance level of a canonical unit.
// Derived from importanceScore (Phase 1C) or priorityTier (legacy).
// This is display-only — never mutates the underlying data.

import React from "react";
import {
  resolveImportanceLevel,
  getImportanceLevelDescriptor,
  type ImportanceLevel,
} from "@/lib/reader/importanceBadge";

export interface ImportanceBadgeProps {
  importanceScore?: number;
  priorityTier?: number;
  /** Override the resolved level directly (e.g. when caller already computed it). */
  level?: ImportanceLevel;
  /** "full" renders label + icon; "compact" renders shortLabel only; "icon" renders icon only. */
  size?: "full" | "compact" | "icon";
  className?: string;
}

export default function ImportanceBadge({
  importanceScore,
  priorityTier,
  level: levelOverride,
  size = "compact",
  className = "",
}: ImportanceBadgeProps) {
  const level = levelOverride ?? resolveImportanceLevel(importanceScore, priorityTier);
  const desc = getImportanceLevelDescriptor(level);

  if (size === "icon") {
    return (
      <span
        title={desc.label}
        style={{ color: desc.color }}
        className={`text-[10px] font-bold select-none ${className}`}
      >
        {level === "critical" ? "★" : level === "high" ? "◆" : level === "medium" ? "·" : "○"}
      </span>
    );
  }

  const text = size === "full" ? desc.label : desc.shortLabel;

  return (
    <span
      title={desc.label}
      style={{
        color: desc.color,
        background: desc.bgColor,
        borderColor: desc.borderColor,
        borderWidth: 1,
        borderStyle: "solid",
      }}
      className={`inline-flex items-center px-1 py-0 rounded text-[8.5px] font-bold tracking-wide select-none leading-4 ${className}`}
    >
      {text}
    </span>
  );
}
