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

// Only thesis and mechanism appear in the persistent PDF overlay.
// definition, application, trap → right panel only, never painted on the PDF.
function shouldRender(rect: OverlayRect): boolean {
  if (rect.semanticKind === "thesis" || rect.semanticKind === "mechanism") return true;
  // Level-only fallback: important with no kind → treat as thesis
  if (!rect.semanticKind && rect.level === "important") return true;
  return false;
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
      {rects.filter(shouldRender).map((rect) => {
        const focused = focusedId === rect.id;
        const isThesis = rect.semanticKind === "thesis" || (!rect.semanticKind && rect.level === "important");
        return (
          <button
            key={rect.id}
            type="button"
            onClick={() => onFocus?.(rect.id)}
            className={`pointer-events-auto absolute transition-colors ${focused ? focusedRingClass(isThesis) : ""}`}
            style={{
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
              borderRadius: "3px",
              backgroundColor: markerColor(isThesis, focused),
            }}
            aria-label="Evidence highlight"
          />
        );
      })}
    </div>
  );
}

// Two-color scheme only:
//   Thesis / high-yield statement → light pink
//   Mechanism / cause-effect      → light green
// All other semantic kinds are filtered out above and never reach here.
function markerColor(isThesis: boolean, focused?: boolean): string {
  if (isThesis) return focused ? "rgba(249,168,212,0.70)" : "rgba(249,168,212,0.45)";
  return focused ? "rgba(134,239,172,0.68)" : "rgba(134,239,172,0.42)";
}

function focusedRingClass(isThesis: boolean): string {
  if (isThesis) return "ring-2 ring-pink-300/80 shadow-[0_0_8px_rgba(249,168,212,0.55)]";
  return "ring-2 ring-green-300/80 shadow-[0_0_8px_rgba(134,239,172,0.55)]";
}
