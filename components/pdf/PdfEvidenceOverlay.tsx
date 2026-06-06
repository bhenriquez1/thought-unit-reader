import React, { useEffect, useRef } from "react";

export interface OverlayRect {
  id: string;
  top: number;
  left: number;
  width: number;
  height: number;
  level: "important" | "support" | "additional" | "trap";
  semanticKind?: "thesis" | "definition" | "mechanism" | "trap" | "application";
}

// All study-model anchor kinds render on the PDF — left panel is driven by right panel only.
function shouldRender(rect: OverlayRect): boolean {
  const kind = rect.semanticKind as string | undefined;
  if (kind && kind in KIND_CONFIG) return true;
  return rect.level === "important" || rect.level === "support";
}

// ── 5-category color config ────────────────────────────────────────────────
//   🟨 thesis      (yellow)  — core idea / page thesis / key concept
//   🟦 definition  (blue)    — foundational term / formula / rule
//   🟩 mechanism   (green)   — mechanism / process / cause-effect chain
//   🟪 application (purple)  — example / evidence / worked step / application
//   🟥 trap        (red)     — exam trap / confusion / misconception

type SemanticKind = "thesis" | "definition" | "mechanism" | "application" | "trap";

interface KindConfig {
  label:       string;
  bgNormal:    string;
  bgFocused:   string;
  ringClass:   string;
  badgeBg:     string;
  badgeColor:  string;
}

const KIND_CONFIG: Record<SemanticKind, KindConfig> = {
  thesis: {
    label:      "CORE",
    bgNormal:   "rgba(253,224,71,0.28)",
    bgFocused:  "rgba(253,224,71,0.55)",
    ringClass:  "ring-2 ring-yellow-300/80 shadow-[0_0_8px_rgba(253,224,71,0.55)]",
    badgeBg:    "rgba(113,63,18,0.88)",
    badgeColor: "#fde047",
  },
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
  application: {
    label:      "EX",
    bgNormal:   "rgba(192,132,252,0.30)",
    bgFocused:  "rgba(192,132,252,0.58)",
    ringClass:  "ring-2 ring-purple-300/80 shadow-[0_0_8px_rgba(192,132,252,0.55)]",
    badgeBg:    "rgba(88,28,135,0.88)",
    badgeColor: "#e9d5ff",
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
  bgNormal:   "rgba(253,224,71,0.28)",
  bgFocused:  "rgba(253,224,71,0.55)",
  ringClass:  "ring-2 ring-yellow-300/80 shadow-[0_0_8px_rgba(253,224,71,0.55)]",
  badgeBg:    "rgba(113,63,18,0.88)",
  badgeColor: "#fde047",
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
  const rectRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Scroll focused highlight into view when focusedId changes
  useEffect(() => {
    if (!focusedId) return;
    const el = rectRefs.current.get(focusedId);
    if (el) {
      console.log("[PDF_FOCUS_RECEIVED]", { focusedId, scrolled: true });
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      console.log("[PDF_FOCUS_RECEIVED]", { focusedId, scrolled: false, note: "rect not in current page DOM" });
    }
  }, [focusedId]);

  // Log when highlight rects are rendered
  useEffect(() => {
    const visible = rects.filter(shouldRender);
    if (visible.length > 0) {
      console.log("[HIGHLIGHT_RENDERED]", { count: visible.length, ids: visible.map(r => r.id), focusedId: focusedId ?? null });
    }
  }, [rects, focusedId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="pointer-events-none absolute inset-0 z-20" style={{ overflow: "visible" }}>
      {rects.filter(shouldRender).map((rect) => {
        const focused = focusedId === rect.id;
        const cfg = getConfig(rect);
        return (
          <button
            key={rect.id}
            type="button"
            ref={(el) => { if (el) rectRefs.current.set(rect.id, el); else rectRefs.current.delete(rect.id); }}
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
