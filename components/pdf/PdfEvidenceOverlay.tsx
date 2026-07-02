import React, { useEffect, useMemo, useRef } from "react";
import { tierGlowStyle } from "@/lib/insights/tierStyle";

export interface OverlayRect {
  id: string;
  top: number;
  left: number;
  width: number;
  height: number;
  level: "important" | "support" | "additional" | "trap";
  semanticKind?:
    | "thesis" | "definition" | "mechanism" | "trap" | "application" | "dat_fact" | "clinical"
    | "keyDetail" | "memoryAnchor" | "keyAnatomy" | "formula" | "comparison" | "reference" | "filler" | "unknown";
  /** AI-assigned 1-5 importance (5 = "Master This") — scales glow/border strength on
   *  top of (not replacing) the semanticKind fill color below. Undefined = medium (3). */
  priorityTier?: number;
}

// All study-model anchor kinds render on the PDF — left panel is driven by right panel only.
function shouldRender(rect: OverlayRect): boolean {
  const kind = rect.semanticKind as string | undefined;
  if (kind && kind in KIND_TIER) return true;
  return rect.level === "important" || rect.level === "support";
}

// ── 5 named layered-importance colors (spec) ───────────────────────────────
// The page must still read like a textbook, not a "yellow marker explosion" —
// every semantic kind maps onto exactly one of these 5 tiers, never its own
// distinct color, so the PDF never carries more than 5 highlight colors.
//   ★★★★★ Master Gold      — thesis / definition ("Master This")
//   ★★★★  Important Green  — mechanism / application / key detail / key anatomy /
//                             memory hook / formula / comparison
//   ★★★   Supporting Blue  — dat_fact / reference / filler / unknown
//   ⚠     Danger Red       — trap
//   💎     Pearl Cyan       — clinical pearl

type SemanticKind =
  | "thesis" | "definition" | "mechanism" | "application" | "trap" | "dat_fact" | "clinical"
  | "keyDetail" | "memoryAnchor" | "keyAnatomy" | "formula" | "comparison" | "reference" | "filler" | "unknown";

type HighlightTier = "master" | "procedure" | "decision" | "danger" | "pearl";

const KIND_TIER: Record<SemanticKind, HighlightTier> = {
  thesis:       "master",
  definition:   "master",
  mechanism:    "procedure",
  formula:      "procedure",
  application:  "decision",
  comparison:   "decision",
  keyDetail:    "decision",
  keyAnatomy:   "decision",
  trap:         "danger",
  clinical:     "pearl",
  memoryAnchor: "pearl",
  dat_fact:     "pearl",
  reference:    "pearl",
  filler:       "pearl",
  unknown:      "pearl",
};

interface KindConfig {
  label:       string;
  bgNormal:    string;
  bgFocused:   string;
  // Faint always-on glow — the "Apple Pencil marker" feel at rest, distinct from
  // and weaker than ringClass's focused-state glow.
  restGlow:    string;
  ringClass:   string;
  badgeBg:     string;
  badgeColor:  string;
  /** Bare "r,g,b" triplet (no alpha) — reused to build a tier-scaled glow in tierGlowStyle(). */
  glowColor:   string;
}

const TIER_CONFIG: Record<HighlightTier, KindConfig> = {
  master: {
    label:      "MASTER THIS",
    bgNormal:   "rgba(253,224,71,0.22)",
    bgFocused:  "rgba(253,224,71,0.50)",
    restGlow:   "0 0 3px rgba(253,224,71,0.32)",
    ringClass:  "ring-1 ring-yellow-300/70 shadow-[0_0_8px_rgba(253,224,71,0.55)]",
    badgeBg:    "rgba(113,63,18,0.92)",
    badgeColor: "#fde047",
    glowColor:  "253,224,71",
  },
  procedure: {
    label:      "PROCEDURE",
    bgNormal:   "rgba(147,197,253,0.22)",
    bgFocused:  "rgba(147,197,253,0.50)",
    restGlow:   "0 0 3px rgba(147,197,253,0.30)",
    ringClass:  "ring-2 ring-sky-300/70",
    badgeBg:    "rgba(29,78,216,0.92)",
    badgeColor: "#93c5fd",
    glowColor:  "147,197,253",
  },
  decision: {
    label:      "DECISION",
    bgNormal:   "rgba(251,146,60,0.22)",
    bgFocused:  "rgba(251,146,60,0.50)",
    restGlow:   "0 0 3px rgba(251,146,60,0.30)",
    ringClass:  "ring-2 ring-orange-400/70",
    badgeBg:    "rgba(154,52,18,0.92)",
    badgeColor: "#fb923c",
    glowColor:  "251,146,60",
  },
  danger: {
    label:      "DANGER ZONE",
    bgNormal:   "rgba(252,165,165,0.26)",
    bgFocused:  "rgba(252,165,165,0.56)",
    restGlow:   "0 0 3px rgba(252,165,165,0.32)",
    ringClass:  "ring-1 ring-red-300/70 shadow-[0_0_8px_rgba(252,165,165,0.55)]",
    badgeBg:    "rgba(127,29,29,0.92)",
    badgeColor: "#fca5a5",
    glowColor:  "252,165,165",
  },
  pearl: {
    label:      "PEARL",
    bgNormal:   "rgba(134,239,172,0.22)",
    bgFocused:  "rgba(134,239,172,0.50)",
    restGlow:   "0 0 3px rgba(134,239,172,0.30)",
    ringClass:  "ring-2 ring-emerald-400/70",
    badgeBg:    "rgba(20,83,45,0.92)",
    badgeColor: "#86efac",
    glowColor:  "134,239,172",
  },
};

// B4: per-anchor priority tier (1-5, 5 = "Master This") scales glow blur/alpha — see tierGlowStyle().
function getConfig(rect: OverlayRect): KindConfig {
  const kind = rect.semanticKind as SemanticKind | undefined;
  if (kind && kind in KIND_TIER) return TIER_CONFIG[KIND_TIER[kind]];
  if (rect.level === "trap") return TIER_CONFIG.danger;
  if (rect.level === "support") return TIER_CONFIG.procedure;
  return TIER_CONFIG.decision;
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

  // ── SVG connectors: dashed arrows linking consecutive mechanism highlights ──
  // Collect first-line mechanism rects (no -L suffix), sorted top-to-bottom.
  const mechanismChain = useMemo(() => {
    return rects
      .filter(r => r.semanticKind === "mechanism" && !r.id.match(/-L\d+$/) && shouldRender(r))
      .sort((a, b) => a.top - b.top);
  }, [rects]);

  return (
    <div className="pointer-events-none absolute inset-0 z-20" style={{ overflow: "visible" }}>
      {/* SVG connector layer — arrows between consecutive mechanism steps */}
      {mechanismChain.length >= 2 && (
        <svg
          aria-hidden
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", pointerEvents: "none" }}
        >
          <defs>
            <marker id="mech-arrow" markerWidth="7" markerHeight="6" refX="6" refY="3" orient="auto">
              <polygon points="0 0, 7 3, 0 6" fill="#86efac" opacity="0.75" />
            </marker>
          </defs>
          {mechanismChain.slice(0, -1).map((rect, i) => {
            const next = mechanismChain[i + 1];
            const x1 = rect.left + rect.width / 2;
            const y1 = rect.top + rect.height + 2;
            const x2 = next.left + next.width / 2;
            const y2 = next.top - 4;
            // Cubic bezier: control points bend the arrow slightly for visual clarity
            const cy = (y1 + y2) / 2;
            const d = `M ${x1} ${y1} C ${x1} ${cy}, ${x2} ${cy}, ${x2} ${y2}`;
            return (
              <path
                key={`mech-conn-${i}`}
                d={d}
                fill="none"
                stroke="#86efac"
                strokeWidth="1.5"
                strokeDasharray="4 3"
                opacity="0.65"
                markerEnd="url(#mech-arrow)"
              />
            );
          })}
        </svg>
      )}
      {rects.filter(shouldRender).map((rect) => {
        const focused = focusedId === rect.id;
        const cfg = getConfig(rect);
        // Only render a label on the first line of each highlight target.
        // Continuation lines have IDs like "va-0-L1", "va-0-L2"; first lines are plain IDs.
        const isFirstLine = !rect.id.match(/-L\d+$/);
        // Left-margin placement: when text starts far enough from the left edge, place the
        // label in the margin to the left of the highlight. Falls back to above-highlight
        // when there's no left margin (e.g. narrow pages or flush-left text).
        const hasLeftMargin = rect.left >= 50;
        const tierStyle = tierGlowStyle(rect.priorityTier, cfg.glowColor);
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
              borderRadius: "6px",
              backgroundColor: focused ? cfg.bgFocused : cfg.bgNormal,
              boxShadow: focused ? undefined : tierStyle.boxShadow,
              border: focused ? undefined : tierStyle.border,
              overflow: "visible",
            }}
            aria-label={`${cfg.label || "Evidence"} highlight`}
          >
            {/* Margin label — first line only, positioned in the left margin beside the highlight */}
            {cfg.label && rect.height >= 6 && isFirstLine && (
              <span
                style={{
                  position: "absolute",
                  ...(hasLeftMargin ? {
                    top: 1,
                    left: -(rect.left - 4),
                  } : {
                    top: -13,
                    left: 0,
                  }),
                  fontSize: 8,
                  lineHeight: "11px",
                  fontFamily: "ui-monospace, SFMono-Regular, monospace",
                  letterSpacing: "0.05em",
                  fontWeight: 700,
                  padding: "2px 5px",
                  borderRadius: "3px",
                  pointerEvents: "none",
                  whiteSpace: "nowrap",
                  background: cfg.badgeBg,
                  color: cfg.badgeColor,
                  opacity: focused ? 1 : 0.82,
                  userSelect: "none",
                  maxWidth: hasLeftMargin ? Math.max(52, rect.left - 8) : 96,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
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
