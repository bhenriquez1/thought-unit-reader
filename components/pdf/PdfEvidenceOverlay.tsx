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
      {rects.map((rect) => {
        const focused = focusedId === rect.id;
        return (
          <button
            key={rect.id}
            type="button"
            onClick={() => onFocus?.(rect.id)}
            className={`pointer-events-auto absolute rounded-sm transition-colors ${priorityClassName(rect.level, focused)}`}
            style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
            aria-label="Evidence highlight"
          />
        );
      })}
    </div>
  );
}

function priorityClassName(
  level: OverlayRect["level"],
  focused: boolean
): string {
  switch (level) {
    case "high_yield":
      return focused
        ? "bg-emerald-400/45 ring-2 ring-emerald-200/90 shadow-[0_0_0_1px_rgba(52,211,153,0.35)]"
        : "bg-emerald-400/28 ring-1 ring-emerald-300/70";
    case "supporting":
      return focused
        ? "bg-sky-400/35 ring-2 ring-sky-200/80 shadow-[0_0_0_1px_rgba(56,189,248,0.28)]"
        : "bg-sky-400/20 ring-1 ring-sky-300/40";
    case "weak":
      return focused
        ? "bg-slate-300/28 ring-2 ring-slate-100/60"
        : "bg-slate-300/14 ring-1 ring-slate-200/18";
    default:
      return "bg-yellow-300/20";
  }
}
