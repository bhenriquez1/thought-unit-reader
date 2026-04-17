import React from "react";

export interface OverlayRect {
  id: string;
  top: number;
  left: number;
  width: number;
  height: number;
  level: "important" | "support" | "additional" | "trap";
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
    case "important":
      return focused
        ? "bg-amber-400/45 ring-2 ring-amber-200/90 shadow-[0_0_0_1px_rgba(251,191,36,0.35)]"
        : "bg-amber-400/28 ring-1 ring-amber-300/70";
    case "trap":
      return focused
        ? "bg-rose-400/40 ring-2 ring-rose-200/80 shadow-[0_0_0_1px_rgba(251,113,133,0.30)]"
        : "bg-rose-400/22 ring-1 ring-rose-300/55";
    case "support":
      return focused
        ? "bg-blue-400/35 ring-2 ring-blue-200/80 shadow-[0_0_0_1px_rgba(96,165,250,0.28)]"
        : "bg-blue-400/20 ring-1 ring-blue-300/40";
    case "additional":
      return focused
        ? "bg-sky-400/28 ring-2 ring-sky-100/60"
        : "bg-sky-400/14 ring-1 ring-sky-200/30";
    default:
      return "bg-yellow-300/20";
  }
}
