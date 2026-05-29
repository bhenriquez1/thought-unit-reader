import React from "react";

export interface OverlayRect {
  id: string;
  top: number;
  left: number;
  width: number;
  height: number;
  level: "important" | "support" | "additional" | "trap";
  semanticKind?: "thesis" | "definition" | "mechanism" | "trap" | "application";
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
            className={`pointer-events-auto absolute transition-colors ${focused ? focusedRingClass(rect.level, rect.semanticKind) : ""}`}
            style={{
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
              borderRadius: "3px",
              backgroundColor: markerColor(rect.semanticKind, rect.level, focused),
            }}
            aria-label="Evidence highlight"
          />
        );
      })}
    </div>
  );
}

// Inline marker background — semi-transparent fill, no border-bottom, no underline.
// Unfocused: fill only, no ring (ring on thin rects looks like underline, not marker).
// Focused: fill + ring + glow for click feedback.
function markerColor(kind?: OverlayRect["semanticKind"], level?: OverlayRect["level"], focused?: boolean): string {
  if (kind === "thesis")      return focused ? "rgba(251,191,36,0.62)"  : "rgba(251,191,36,0.40)";
  if (kind === "definition")  return focused ? "rgba(96,165,250,0.58)"  : "rgba(96,165,250,0.36)";
  if (kind === "mechanism")   return focused ? "rgba(52,211,153,0.58)"  : "rgba(52,211,153,0.36)";
  if (kind === "application") return focused ? "rgba(244,114,182,0.60)" : "rgba(244,114,182,0.38)";
  if (kind === "trap")        return focused ? "rgba(167,139,250,0.58)" : "rgba(167,139,250,0.36)";
  // level fallback
  if (level === "support")    return focused ? "rgba(96,165,250,0.55)"  : "rgba(96,165,250,0.33)";
  if (level === "additional") return focused ? "rgba(56,189,248,0.50)"  : "rgba(56,189,248,0.28)";
  if (level === "trap")       return focused ? "rgba(167,139,250,0.58)" : "rgba(167,139,250,0.36)";
  return focused ? "rgba(251,191,36,0.62)" : "rgba(251,191,36,0.40)";
}

function focusedRingClass(level: OverlayRect["level"], kind?: OverlayRect["semanticKind"]): string {
  if (kind === "thesis"      || level === "important")   return "ring-2 ring-amber-300/80 shadow-[0_0_8px_rgba(251,191,36,0.55)]";
  if (kind === "definition"  || level === "support")     return "ring-2 ring-blue-300/80 shadow-[0_0_8px_rgba(96,165,250,0.50)]";
  if (kind === "mechanism")   return "ring-2 ring-emerald-300/80 shadow-[0_0_8px_rgba(52,211,153,0.50)]";
  if (kind === "application") return "ring-2 ring-pink-300/80 shadow-[0_0_8px_rgba(244,114,182,0.50)]";
  if (kind === "trap"        || level === "trap")        return "ring-2 ring-violet-300/80 shadow-[0_0_8px_rgba(167,139,250,0.50)]";
  return "ring-2 ring-amber-300/80";
}
