import React from "react";

export interface OverlayRect {
  id: string;
  top: number;
  left: number;
  width: number;
  height: number;
  level: "high_yield" | "supporting" | "weak";
  semanticKind?: "clinical" | "mechanism" | "comparison" | "application";
}

export default function PdfEvidenceOverlay({
  rects,
  focusedId,
  onFocus,
}: {
  rects: OverlayRect[];
  focusedId?: string | null;
  onFocus?: (id: string) => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {rects.map((rect) => (
        <button
          key={rect.id}
          type="button"
          onClick={() => onFocus?.(rect.id)}
          className={`pointer-events-auto absolute rounded-sm transition-shadow ${
            // Border thickness is driven by level so high_yield always dominates
            // supporting regardless of semantic kind.
            rect.level === "high_yield" ? "border-2"
              : rect.level === "supporting" ? "border"
              : "border-0"
          } ${
            // Fill color + border color + shadow from semantic kind.
            // mechanism gets an outer glow (not just inset) so it lifts off the page.
            // supporting level without a semantic kind gets a visible thin border so
            // it reads as an intentional highlight rather than a faint wash.
            rect.semanticKind === "clinical"
              ? "bg-rose-400/55 border-rose-500/50"
              : rect.semanticKind === "mechanism"
              ? "bg-amber-200/60 border-amber-400/50 shadow-[0_0_6px_rgba(251,191,36,0.55),inset_0_0_0_1px_rgba(251,191,36,0.4)]"
              : rect.semanticKind === "comparison"
              ? "bg-sky-200/50 border-sky-400/40"
              : rect.semanticKind === "application"
              ? "bg-blue-200/45 border-blue-400/35"
              : rect.level === "high_yield"
              ? "bg-amber-200/60 border-amber-400/50 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.4)]"
              : rect.level === "supporting"
              ? "bg-blue-200/40 border-blue-400/25"
              : "bg-slate-200/20"
          } ${focusedId === rect.id ? "ring-2 ring-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.7)]" : ""}`}
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
          aria-label="Evidence highlight"
        />
      ))}
    </div>
  );
}
