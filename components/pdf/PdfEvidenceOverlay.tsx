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
        ? "bg-amber-400/65 ring-2 ring-amber-200/90 shadow-[0_0_0_1px_rgba(251,191,36,0.50)]"
        : "bg-amber-400/45 ring-1 ring-amber-300/80";
    case "trap":
      return focused
        ? "bg-rose-400/60 ring-2 ring-rose-200/90 shadow-[0_0_0_1px_rgba(251,113,133,0.50)]"
        : "bg-rose-400/42 ring-1 ring-rose-300/70";
    case "support":
      return focused
        ? "bg-blue-400/52 ring-2 ring-blue-200/85 shadow-[0_0_0_1px_rgba(96,165,250,0.42)]"
        : "bg-blue-400/34 ring-1 ring-blue-300/60";
    case "additional":
      return focused
        ? "bg-sky-400/42 ring-2 ring-sky-100/75"
        : "bg-sky-400/26 ring-1 ring-sky-200/50";
    default:
      return "bg-yellow-300/30";
  }
}
