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
              ? "bg-rose-400/30"
              : rect.level === "high_yield"
                ? "bg-yellow-300/35"
                : rect.level === "supporting"
                  ? "bg-blue-300/25"
                  : "bg-slate-200/15"
          } ${focusedId === rect.id ? "ring-2 ring-emerald-300 shadow-[0_0_16px_rgba(16,185,129,0.5)]" : ""}`}
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
          aria-label="Evidence highlight"
        />
      ))}
    </div>
  );
}
