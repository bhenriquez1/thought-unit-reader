"use client";

// components/reader/EvidencePanel.tsx
// Slide-in panel that shows source evidence for a selected canonical unit.
//
// Displays: exact source quote, canonical type, grounding state, page number,
// and the semantic pack label for the current domain.
//
// Never generates explanations — this panel is evidence only.
// Displayed inside the reader's left panel when a unit is selected.

import React from "react";
import type { CanonicalSemanticType } from "@/lib/semantic/types";
import type { SemanticPack } from "@/lib/semantic/types";
import { resolveTypeLabel } from "@/lib/reader/semanticPackResolver";

export type GroundingState = "exact" | "normalized" | "fuzzy" | "ocr" | "synthetic" | undefined;

export interface EvidencePanelProps {
  /** The verbatim source text for this unit. */
  sourceQuote: string;
  /** Canonical semantic type (Phase 1B/1C). */
  canonicalType?: CanonicalSemanticType | string;
  /** How the anchor was grounded against the PDF. */
  groundingState?: GroundingState;
  /** 1-based display page number. */
  pageNumber?: number;
  /** Active semantic pack for domain label resolution. */
  pack: SemanticPack;
  onClose: () => void;
}

const GROUNDING_LABELS: Record<string, { label: string; color: string }> = {
  exact:      { label: "Exact match",      color: "#86efac" },
  normalized: { label: "Normalized match", color: "#93c5fd" },
  fuzzy:      { label: "Fuzzy match",      color: "#fbbf24" },
  ocr:        { label: "OCR-assisted",     color: "#fb923c" },
  synthetic:  { label: "Synthesized",      color: "#94a3b8" },
};

export default function EvidencePanel({
  sourceQuote,
  canonicalType,
  groundingState,
  pageNumber,
  pack,
  onClose,
}: EvidencePanelProps) {
  const typeInfo = canonicalType
    ? resolveTypeLabel(canonicalType, pack)
    : null;

  const groundingInfo = groundingState ? GROUNDING_LABELS[groundingState] : null;

  return (
    <div
      className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/4 p-3 text-white/80"
      data-testid="evidence-panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-bold uppercase tracking-widest text-white/30">
          Evidence
        </span>
        <button
          onClick={onClose}
          className="text-[10px] text-white/30 hover:text-white/60 transition-colors leading-none"
          aria-label="Close evidence panel"
        >
          ✕
        </button>
      </div>

      {/* Source quote */}
      <blockquote
        className="border-l-2 border-white/20 pl-2 text-[11px] leading-relaxed text-white/70 italic"
        data-testid="evidence-source-quote"
      >
        {sourceQuote || "(no source text)"}
      </blockquote>

      {/* Metadata row */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[9.5px] text-white/40">
        {typeInfo && (
          <span data-testid="evidence-canonical-type">
            <span className="mr-0.5">{typeInfo.icon}</span>
            <span className="text-white/60">{typeInfo.label}</span>
          </span>
        )}

        {groundingInfo && (
          <span data-testid="evidence-grounding-state">
            Grounded:&nbsp;
            <span style={{ color: groundingInfo.color }}>{groundingInfo.label}</span>
          </span>
        )}

        {typeof pageNumber === "number" && (
          <span data-testid="evidence-page-number">
            Page&nbsp;
            <span className="text-white/60 tabular-nums">{pageNumber}</span>
          </span>
        )}

        {pack && (
          <span data-testid="evidence-pack-label">
            Pack:&nbsp;
            <span className="text-white/60">{pack.label}</span>
          </span>
        )}
      </div>
    </div>
  );
}
