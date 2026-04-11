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
            rect.semanticKind === "clinical"
              ? "bg-rose-400/55 border border-rose-500/50"
              : rect.semanticKind === "mechanism"
              ? "bg-amber-200/60 border border-amber-400/40 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.5)]"
              : rect.semanticKind === "comparison"
              ? "bg-sky-200/50 border border-sky-400/35"
              : rect.semanticKind === "application"
              ? "bg-blue-200/45 border border-blue-400/30"
              : rect.level === "high_yield"
              ? "bg-amber-200/60 border border-amber-400/40 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.5)]"
              : rect.level === "supporting"
              ? "bg-blue-200/40"
              : "bg-slate-200/20"
          } ${focusedId === rect.id ? "ring-2 ring-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.7)]" : ""}`}
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
          aria-label="Evidence highlight"
        />
      ))}
    </div>
  );
}
