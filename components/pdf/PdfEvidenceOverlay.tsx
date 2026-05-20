import React from "react";

export interface OverlayRect {
  id: string;
  top: number;
  left: number;
  width: number;
  height: number;
  level: "important" | "support" | "additional" | "trap";
  semanticKind?: "clinical" | "mechanism" | "comparison" | "application" | "formula" | "definition";
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
            className={`pointer-events-auto absolute rounded-sm transition-colors ${priorityClassName(rect.level, focused, rect.semanticKind)}`}
            style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
            aria-label="Evidence highlight"
          />
        );
      })}
    </div>
  );
}

// Colors keyed by semanticKind when present (AI anchor types), else by level (heuristic).
// AI anchor type palette:
//   thesis / definition  → amber  (governing principle — most important)
//   mechanism            → blue   (causal chain)
//   formula              → violet (mathematical/biochemical rule)
//   clinicalTrap         → rose   (danger / common error)
//   examSignal / application → teal (exam pivot / applied context)
function priorityClassName(
  level: OverlayRect["level"],
  focused: boolean,
  kind?: OverlayRect["semanticKind"],
): string {
  // AI anchor type colors (semanticKind present)
  if (kind === "clinical") {
    return focused
      ? "bg-rose-400/70 ring-2 ring-rose-200/95 shadow-[0_0_0_2px_rgba(251,113,133,0.60)]"
      : "bg-rose-400/50 ring-1 ring-rose-300/80";
  }
  if (kind === "mechanism") {
    return focused
      ? "bg-blue-400/65 ring-2 ring-blue-200/90 shadow-[0_0_0_2px_rgba(96,165,250,0.55)]"
      : "bg-blue-400/45 ring-1 ring-blue-300/72";
  }
  if (kind === "formula") {
    return focused
      ? "bg-violet-400/65 ring-2 ring-violet-200/90 shadow-[0_0_0_2px_rgba(167,139,250,0.55)]"
      : "bg-violet-400/45 ring-1 ring-violet-300/72";
  }
  if (kind === "application") {
    return focused
      ? "bg-teal-400/65 ring-2 ring-teal-200/90 shadow-[0_0_0_2px_rgba(45,212,191,0.55)]"
      : "bg-teal-400/45 ring-1 ring-teal-300/72";
  }
  // level-based fallback (heuristic highlights + thesis/definition AI anchors)
  switch (level) {
    case "important":
      return focused
        ? "bg-amber-400/75 ring-2 ring-amber-200/95 shadow-[0_0_0_2px_rgba(251,191,36,0.60)]"
        : "bg-amber-400/56 ring-1 ring-amber-300/88";
    case "trap":
      return focused
        ? "bg-rose-400/70 ring-2 ring-rose-200/95 shadow-[0_0_0_2px_rgba(251,113,133,0.60)]"
        : "bg-rose-400/50 ring-1 ring-rose-300/80";
    case "support":
      return focused
        ? "bg-blue-400/62 ring-2 ring-blue-200/90 shadow-[0_0_0_1px_rgba(96,165,250,0.52)]"
        : "bg-blue-400/42 ring-1 ring-blue-300/72";
    case "additional":
      return focused
        ? "bg-sky-400/50 ring-2 ring-sky-100/80"
        : "bg-sky-400/32 ring-1 ring-sky-200/62";
    default:
      return "bg-yellow-300/40";
  }
}
