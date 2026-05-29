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

// Right-panel-only kinds: never paint on the PDF.
// Note: target.kind is cast to OverlayRect["semanticKind"] but at runtime can be any
// ParagraphKind value ("clinical", "memoryAnchor", "formula", etc.). We use string
// comparison to correctly handle all runtime values.
const RIGHT_PANEL_ONLY = new Set(["definition", "application"]);

function shouldRender(rect: OverlayRect): boolean {
  const kind = rect.semanticKind as string | undefined;
  if (kind && RIGHT_PANEL_ONLY.has(kind)) return false;
  // thesis and mechanism always show
  if (kind === "thesis" || kind === "mechanism") return true;
  // Other kinds (clinical, memoryAnchor, formula, comparison, unknown, …):
  // show only if level is meaningful enough to put on the PDF
  return rect.level === "important" || rect.level === "support";
}

function isThesisKind(rect: OverlayRect): boolean {
  const kind = rect.semanticKind as string | undefined;
  if (kind === "thesis") return true;
  if (kind === "mechanism") return false;
  // Unknown/other kinds: use level — important → pink thesis, support → green mechanism
  return rect.level === "important";
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
        const thesis = isThesisKind(rect);
        return (
          <button
            key={rect.id}
            type="button"
            onClick={() => onFocus?.(rect.id)}
            className={`pointer-events-auto absolute transition-colors ${focused ? focusedRingClass(thesis) : ""}`}
            style={{
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
              borderRadius: "3px",
              backgroundColor: markerColor(thesis, focused),
            }}
            aria-label="Evidence highlight"
          />
        );
      })}
    </div>
  );
}

// Two-color scheme:
//   Thesis / high-yield → light pink
//   Mechanism / cause-effect → light green
function markerColor(thesis: boolean, focused?: boolean): string {
  if (thesis) return focused ? "rgba(249,168,212,0.70)" : "rgba(249,168,212,0.45)";
  return focused ? "rgba(134,239,172,0.68)" : "rgba(134,239,172,0.42)";
}

function focusedRingClass(thesis: boolean): string {
  if (thesis) return "ring-2 ring-pink-300/80 shadow-[0_0_8px_rgba(249,168,212,0.55)]";
  return "ring-2 ring-green-300/80 shadow-[0_0_8px_rgba(134,239,172,0.55)]";
}
