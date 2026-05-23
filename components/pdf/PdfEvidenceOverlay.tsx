import React from "react";

export interface OverlayRect {
  id: string;
  top: number;
  left: number;
  width: number;
  height: number;
  level: "important" | "support" | "additional" | "trap";
  semanticKind?: "thesis" | "mechanism" | "application" | "trap" | "memoryAnchor";
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

// 5-color semantic highlight palette:
//   thesis       🟡 amber/yellow — governing concept
//   mechanism    🔵 blue         — causal chain / how it works
//   application  🟢 emerald      — real-world example / clinical relevance
//   trap         🩷 rose/pink    — common mistake / confusion / contrast
//   memoryAnchor 🟣 violet       — high-yield testable fact
function priorityClassName(
  level: OverlayRect["level"],
  focused: boolean,
  kind?: OverlayRect["semanticKind"],
): string {
  if (kind === "thesis") {
    return focused
      ? "bg-amber-400/75 ring-2 ring-amber-200/95 shadow-[0_0_0_2px_rgba(251,191,36,0.60)]"
      : "bg-amber-400/56 ring-1 ring-amber-300/88";
  }
  if (kind === "mechanism") {
    return focused
      ? "bg-blue-400/68 ring-2 ring-blue-200/90 shadow-[0_0_0_2px_rgba(96,165,250,0.55)]"
      : "bg-blue-400/48 ring-1 ring-blue-300/75";
  }
  if (kind === "application") {
    return focused
      ? "bg-emerald-400/68 ring-2 ring-emerald-200/90 shadow-[0_0_0_2px_rgba(52,211,153,0.55)]"
      : "bg-emerald-400/48 ring-1 ring-emerald-300/75";
  }
  if (kind === "trap") {
    return focused
      ? "bg-pink-400/72 ring-2 ring-pink-200/95 shadow-[0_0_0_2px_rgba(244,114,182,0.60)]"
      : "bg-pink-400/52 ring-1 ring-pink-300/82";
  }
  if (kind === "memoryAnchor") {
    return focused
      ? "bg-violet-400/68 ring-2 ring-violet-200/90 shadow-[0_0_0_2px_rgba(167,139,250,0.55)]"
      : "bg-violet-400/48 ring-1 ring-violet-300/75";
  }
  // level-based fallback for heuristic highlights (no semanticKind)
  switch (level) {
    case "important":
      return focused
        ? "bg-amber-400/75 ring-2 ring-amber-200/95 shadow-[0_0_0_2px_rgba(251,191,36,0.60)]"
        : "bg-amber-400/56 ring-1 ring-amber-300/88";
    case "trap":
      return focused
        ? "bg-pink-400/72 ring-2 ring-pink-200/95 shadow-[0_0_0_2px_rgba(244,114,182,0.60)]"
        : "bg-pink-400/52 ring-1 ring-pink-300/82";
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
