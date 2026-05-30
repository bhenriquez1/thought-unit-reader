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

// application is the only right-panel-only kind — it's a contextual usage example, not a foundational highlight.
// definition, mechanism, thesis, and trap are all surfaced on the PDF with distinct colors.
const RIGHT_PANEL_ONLY = new Set(["application"]);

function shouldRender(rect: OverlayRect): boolean {
  const kind = rect.semanticKind as string | undefined;
  if (kind && RIGHT_PANEL_ONLY.has(kind)) return false;
  if (kind === "definition" || kind === "mechanism" || kind === "thesis" || kind === "trap") return true;
  // Unknown/other kinds: show only if level is meaningful
  return rect.level === "important" || rect.level === "support";
}

// ── 4-category color config ────────────────────────────────────────────────
//   🟦 Definition  (blue)   — foundational term being introduced
//   🟩 Function    (green)  — mechanism / cause-effect chain
//   🟨 Limitation  (yellow) — clinical warning, caveat, or primary claim
//   🟥 Trap        (red)    — exam trap / high-yield distinction

type SemanticKind = "definition" | "mechanism" | "thesis" | "trap";

interface KindConfig {
  label:       string;
  bgNormal:    string;
  bgFocused:   string;
  ringClass:   string;
  badgeBg:     string;
  badgeColor:  string;
}

const KIND_CONFIG: Record<SemanticKind, KindConfig> = {
  definition: {
    label:      "DEF",
    bgNormal:   "rgba(147,197,253,0.35)",
    bgFocused:  "rgba(147,197,253,0.62)",
    ringClass:  "ring-2 ring-blue-300/80 shadow-[0_0_8px_rgba(147,197,253,0.55)]",
    badgeBg:    "rgba(29,78,216,0.88)",
    badgeColor: "#bfdbfe",
  },
  mechanism: {
    label:      "FCN",
    bgNormal:   "rgba(134,239,172,0.35)",
    bgFocused:  "rgba(134,239,172,0.62)",
    ringClass:  "ring-2 ring-green-300/80 shadow-[0_0_8px_rgba(134,239,172,0.55)]",
    badgeBg:    "rgba(20,83,45,0.88)",
    badgeColor: "#86efac",
  },
  thesis: {
    label:      "LIM",
    bgNormal:   "rgba(253,224,71,0.28)",
    bgFocused:  "rgba(253,224,71,0.55)",
    ringClass:  "ring-2 ring-yellow-300/80 shadow-[0_0_8px_rgba(253,224,71,0.55)]",
    badgeBg:    "rgba(113,63,18,0.88)",
    badgeColor: "#fde047",
  },
  trap: {
    label:      "TRAP",
    bgNormal:   "rgba(252,165,165,0.35)",
    bgFocused:  "rgba(252,165,165,0.62)",
    ringClass:  "ring-2 ring-red-300/80 shadow-[0_0_8px_rgba(252,165,165,0.55)]",
    badgeBg:    "rgba(127,29,29,0.88)",
    badgeColor: "#fca5a5",
  },
};

const FALLBACK_CONFIG: KindConfig = {
  label:      "",
  bgNormal:   "rgba(249,168,212,0.38)",
  bgFocused:  "rgba(249,168,212,0.65)",
  ringClass:  "ring-2 ring-pink-300/80 shadow-[0_0_8px_rgba(249,168,212,0.55)]",
  badgeBg:    "",
  badgeColor: "",
};

function getConfig(rect: OverlayRect): KindConfig {
  const kind = rect.semanticKind as string | undefined;
  if (kind && kind in KIND_CONFIG) return KIND_CONFIG[kind as SemanticKind];
  if (rect.level === "trap") return KIND_CONFIG.trap;
  return FALLBACK_CONFIG;
}

// ── Component ──────────────────────────────────────────────────────────────

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
    <div className="pointer-events-none absolute inset-0 z-20" style={{ overflow: "visible" }}>
      {rects.filter(shouldRender).map((rect) => {
        const focused = focusedId === rect.id;
        const cfg = getConfig(rect);
        return (
          <button
            key={rect.id}
            type="button"
            onClick={() => onFocus?.(rect.id)}
            className={`pointer-events-auto absolute transition-colors ${focused ? cfg.ringClass : ""}`}
            style={{
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
              borderRadius: "3px",
              backgroundColor: focused ? cfg.bgFocused : cfg.bgNormal,
              overflow: "visible",
            }}
            aria-label={`${cfg.label || "Evidence"} highlight`}
          >
            {/* Category label pill — appears above the first line of the highlight */}
            {cfg.label && rect.height >= 6 && (
              <span
                style={{
                  position: "absolute",
                  top: -11,
                  left: 0,
                  fontSize: 7,
                  lineHeight: "10px",
                  fontFamily: "ui-monospace, SFMono-Regular, monospace",
                  letterSpacing: "0.06em",
                  fontWeight: 700,
                  padding: "1px 4px",
                  borderRadius: "2px",
                  pointerEvents: "none",
                  whiteSpace: "nowrap",
                  background: cfg.badgeBg,
                  color: cfg.badgeColor,
                  opacity: focused ? 1 : 0.72,
                  userSelect: "none",
                }}
              >
                {cfg.label}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
