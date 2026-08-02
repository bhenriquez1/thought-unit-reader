import React, { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { tierGlowStyle } from "@/lib/insights/tierStyle";
import type { Treatment, CanonicalType } from "@/lib/insights/pageAnnotationPlan";

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
  /**
   * SurgeonAnnotationPlan visual treatment — when present, takes priority over
   * semanticKind for tier/visual selection. Optional and additive: rects from the
   * older highlightAnchors/ExpertAnchor pipeline never set this, so they fall
   * through unchanged to the existing semanticKind-driven logic below.
   */
  treatment?: Treatment;
  /** SurgeonAnnotationPlan canonical type — carried through for diagnostics/labels. */
  canonicalType?: CanonicalType;
  /** AI-assigned 1-5 importance (5 = "Master This") — scales glow/border strength on
   *  top of (not replacing) the semanticKind fill color below. Undefined = medium (3). */
  priorityTier?: number;
  /** ≤10-word rationale from the AI anchor — shown in margin label when space allows. */
  reason?: string;
}

// All study-model anchor kinds render on the PDF — left panel is driven by right panel only.
function shouldRender(rect: OverlayRect): boolean {
  if (rect.treatment) return true;
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

// Avrrio Highlight Language — 5 named tiers every subject maps to.
// MASTER = highest-value idea  STEP = process/procedure/action  DECISION = choose/diagnose/compare
// DANGER = trap/complication/mistake  PEARL = expert insight
type HighlightTier = "master" | "step" | "decision" | "danger" | "pearl";

const KIND_TIER: Record<SemanticKind, HighlightTier> = {
  thesis:       "master",
  definition:   "master",
  mechanism:    "step",
  formula:      "step",
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

// SurgeonAnnotationPlan treatment → tier. Checked before KIND_TIER (see
// getConfig/getTierForRect) so annotations from the new pipeline get their own
// deterministic tier without touching the semanticKind path at all.
const TREATMENT_TIER: Record<Treatment, HighlightTier> = {
  definitionBar:      "master",
  mechanismBrace:     "step",
  procedureRail:      "step",
  decisionConnector:  "decision",
  comparisonBracket:  "decision",
  trapNotch:          "danger",
  pearlMarker:        "pearl",
  evidenceUnderline:  "pearl",
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

// Avrrio Highlight Language colors:
//   MASTER   = gold    (highest-value idea — the governing thesis)
//   STEP     = green   (process / procedure / action / mechanism)
//   DECISION = blue    (choose / diagnose / compare / apply)
//   DANGER   = red     (trap / complication / common mistake)
//   PEARL    = cyan    (expert insight / clinical pearl / memory anchor)
// Highlight opacity targets (per user spec):
//   bgNormal  (permanent, at-rest):  0.18 – 0.26  — visible but translucent
//   bgFocused (focused/active):      0.28 – 0.36  — distinctly stronger border+fill
//   Active-word box (SmartPDFViewer): 0.85          — clear moving indicator
const TIER_CONFIG: Record<HighlightTier, KindConfig> = {
  master: {
    label:      "CORE",
    bgNormal:   "rgba(253,224,71,0.20)",
    bgFocused:  "rgba(253,224,71,0.34)",
    restGlow:   "0 0 2px rgba(253,224,71,0.18)",
    ringClass:  "ring-1 ring-yellow-300/60",
    badgeBg:    "rgba(113,63,18,0.92)",
    badgeColor: "#fde047",
    glowColor:  "253,224,71",
  },
  step: {
    label:      "STEP",
    bgNormal:   "rgba(134,239,172,0.20)",
    bgFocused:  "rgba(134,239,172,0.34)",
    restGlow:   "0 0 2px rgba(134,239,172,0.16)",
    ringClass:  "ring-1 ring-emerald-300/60",
    badgeBg:    "rgba(20,83,45,0.92)",
    badgeColor: "#86efac",
    glowColor:  "134,239,172",
  },
  decision: {
    label:      "APPLY",
    bgNormal:   "rgba(147,197,253,0.18)",
    bgFocused:  "rgba(147,197,253,0.30)",
    restGlow:   "0 0 2px rgba(147,197,253,0.16)",
    ringClass:  "ring-1 ring-sky-300/60",
    badgeBg:    "rgba(29,78,216,0.92)",
    badgeColor: "#93c5fd",
    glowColor:  "147,197,253",
  },
  danger: {
    label:      "TRAP",
    bgNormal:   "rgba(252,165,165,0.22)",
    bgFocused:  "rgba(252,165,165,0.36)",
    restGlow:   "0 0 2px rgba(252,165,165,0.20)",
    ringClass:  "ring-1 ring-red-300/60",
    badgeBg:    "rgba(127,29,29,0.92)",
    badgeColor: "#fca5a5",
    glowColor:  "252,165,165",
  },
  pearl: {
    label:      "PEARL",
    bgNormal:   "rgba(103,232,249,0.18)",
    bgFocused:  "rgba(103,232,249,0.30)",
    restGlow:   "0 0 2px rgba(103,232,249,0.14)",
    ringClass:  "ring-1 ring-cyan-300/60",
    badgeBg:    "rgba(8,51,68,0.92)",
    badgeColor: "#67e8f9",
    glowColor:  "103,232,249",
  },
};

// B4: per-anchor priority tier (1-5, 5 = "Master This") scales glow blur/alpha — see tierGlowStyle().
function getConfig(rect: OverlayRect): KindConfig {
  if (rect.treatment) return TIER_CONFIG[TREATMENT_TIER[rect.treatment]];
  const kind = rect.semanticKind as SemanticKind | undefined;
  if (kind && kind in KIND_TIER) return TIER_CONFIG[KIND_TIER[kind]];
  if (rect.level === "trap") return TIER_CONFIG.danger;
  if (rect.level === "support") return TIER_CONFIG.step;
  return TIER_CONFIG.decision;
}

// ── Tier helper (also used for packTierLabels override) ───────────────────────
function getTierForRect(rect: OverlayRect): HighlightTier {
  if (rect.treatment) return TREATMENT_TIER[rect.treatment];
  const kind = rect.semanticKind as SemanticKind | undefined;
  if (kind && kind in KIND_TIER) return KIND_TIER[kind];
  if (rect.level === "trap")    return "danger";
  if (rect.level === "support") return "step";
  return "decision";
}

// ── Component ──────────────────────────────────────────────────────────────

export default function PdfEvidenceOverlay({
  rects,
  focusedId,
  onFocus,
  packTierLabels,
}: {
  rects: OverlayRect[];
  focusedId?: string | null;
  onFocus?: (id: string) => void;
  /** Domain-specific tier label overrides from the active SemanticPack.
   *  When present, replaces CORE/STEP/APPLY/TRAP/PEARL with domain vocabulary
   *  (e.g. CONCEPT/FORMULA/APPLY/ERROR/EXAMPLE for a chemistry pack). */
  packTierLabels?: Partial<Record<HighlightTier, string>>;
}) {
  const rectRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Scroll focused highlight into view when focusedId changes.
  // useLayoutEffect fires synchronously after DOM mutations so the rect is
  // guaranteed to exist in rectRefs when the newly-authorized rect appears
  // (the `rects` prop update and the `focusedId` prop update land in the same
  // render cycle via the parent's idsToAllow → guarded derivation).
  useLayoutEffect(() => {
    if (!focusedId) return;
    const el = rectRefs.current.get(focusedId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    // Also try after a paint frame — cross-page navigation delivers rects one
    // render later and the layout effect may fire before the new page's rects mount.
    const raf = requestAnimationFrame(() => {
      const el2 = rectRefs.current.get(focusedId);
      if (el2) el2.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => cancelAnimationFrame(raf);
  }, [focusedId, rects]); // include rects so we re-run when newly-authorized rects arrive

  // Log when highlight rects are rendered
  useEffect(() => {
    const visible = rects.filter(shouldRender);
    if (visible.length > 0) {
      console.log("[HIGHLIGHT_RENDERED]", { count: visible.length, ids: visible.map(r => r.id), focusedId: focusedId ?? null });
    }
  }, [rects, focusedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── SVG connectors: dashed arrows + left brace for consecutive mechanism highlights ──
  // Collect first-line mechanism rects (no -L suffix or -N suffix), sorted top-to-bottom.
  // OR'd with treatment==="mechanismBrace" so SurgeonAnnotationPlan rects get the same
  // brace without needing semanticKind set at all.
  const mechanismChain = useMemo(() => {
    return rects
      .filter(r => (r.semanticKind === "mechanism" || r.treatment === "mechanismBrace") && !r.id.match(/-L\d+$/) && shouldRender(r))
      .sort((a, b) => a.top - b.top);
  }, [rects]);

  // Step indices for mechanism rects — used to render circled step numbers in brace.
  const mechanismStepIndex = useMemo(() => {
    const idx = new Map<string, number>();
    mechanismChain.forEach((r, i) => idx.set(r.id, i + 1));
    return idx;
  }, [mechanismChain]);

  // ── procedureRail: sequential numbered steps, visually distinct from mechanismBrace ──
  // "procedure" has no legacy semanticKind — this chain is SurgeonAnnotationPlan-only.
  const procedureChain = useMemo(() => {
    return rects
      .filter(r => r.treatment === "procedureRail" && !r.id.match(/-L\d+$/) && shouldRender(r))
      .sort((a, b) => a.top - b.top);
  }, [rects]);

  const procedureStepIndex = useMemo(() => {
    const idx = new Map<string, number>();
    procedureChain.forEach((r, i) => idx.set(r.id, i + 1));
    return idx;
  }, [procedureChain]);

  // ── Comparison connector: bidirectional ↕ arrow between consecutive comparison rects ──
  // OR'd with treatment==="comparisonBracket" for the same reason as mechanismChain above.
  const comparisonChain = useMemo(() => {
    return rects
      .filter(r => (r.semanticKind === "comparison" || r.treatment === "comparisonBracket") && !r.id.match(/-L\d+$/) && shouldRender(r))
      .sort((a, b) => a.top - b.top);
  }, [rects]);

  return (
    <div className="pointer-events-none absolute inset-0 z-20" style={{ overflow: "visible" }}>
      {/* SVG connector layer — arrows between consecutive mechanism steps + left brace */}
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
          {/* Left-margin brace spanning first→last mechanism rect */}
          {(() => {
            const first = mechanismChain[0];
            const last  = mechanismChain[mechanismChain.length - 1];
            const braceX = Math.max(4, Math.min(...mechanismChain.map(r => r.left)) - 10);
            const braceY1 = first.top + first.height / 2;
            const braceY2 = last.top  + last.height  / 2;
            const mid = (braceY1 + braceY2) / 2;
            return (
              <g key="mech-brace" opacity="0.55">
                {/* PROCEDURE header above the first mechanism rect */}
                <text
                  x={braceX + 12} y={first.top - 4}
                  fontSize="7" fontFamily="ui-monospace, SFMono-Regular, monospace"
                  fontWeight="700" letterSpacing="0.08em"
                  fill="#86efac" opacity="0.75" textAnchor="start"
                >
                  PROCEDURE
                </text>
                {/* vertical stem */}
                <line x1={braceX + 4} y1={braceY1} x2={braceX + 4} y2={braceY2} stroke="#86efac" strokeWidth="1.5" />
                {/* top tick */}
                <line x1={braceX + 4} y1={braceY1} x2={braceX + 8} y2={braceY1} stroke="#86efac" strokeWidth="1.5" />
                {/* bottom tick */}
                <line x1={braceX + 4} y1={braceY2} x2={braceX + 8} y2={braceY2} stroke="#86efac" strokeWidth="1.5" />
                {/* mid pointer */}
                <polyline points={`${braceX + 4},${mid} ${braceX},${mid}`} stroke="#86efac" strokeWidth="1.5" fill="none" />
                {/* Circled step numbers aligned with each mechanism rect */}
                {mechanismChain.map((r) => {
                  const stepNum = mechanismStepIndex.get(r.id);
                  if (!stepNum) return null;
                  const cy = r.top + r.height / 2;
                  return (
                    <g key={`step-${r.id}`}>
                      <circle cx={braceX + 4} cy={cy} r={7} fill="#14532d" stroke="#86efac" strokeWidth="1" opacity="0.85" />
                      <text
                        x={braceX + 4} y={cy + 3}
                        fontSize="7" fontFamily="ui-monospace, monospace" fontWeight="700"
                        fill="#86efac" textAnchor="middle"
                      >
                        {stepNum}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })()}
          {mechanismChain.slice(0, -1).map((rect, i) => {
            const next = mechanismChain[i + 1];
            const x1 = rect.left + rect.width / 2;
            const y1 = rect.top + rect.height + 2;
            const x2 = next.left + next.width / 2;
            const y2 = next.top - 4;
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

      {/* SVG connector layer — procedureRail: numbered steps, square chips distinguish
          it at a glance from mechanismBrace's circled steps when both appear on a page */}
      {procedureChain.length >= 2 && (
        <svg
          aria-hidden
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", pointerEvents: "none" }}
        >
          <defs>
            <marker id="proc-arrow" markerWidth="7" markerHeight="6" refX="6" refY="3" orient="auto">
              <polygon points="0 0, 7 3, 0 6" fill="#86efac" opacity="0.75" />
            </marker>
          </defs>
          {(() => {
            const first = procedureChain[0];
            const last  = procedureChain[procedureChain.length - 1];
            const railX = Math.max(4, Math.min(...procedureChain.map(r => r.left)) - 10);
            const y1 = first.top + first.height / 2;
            const y2 = last.top  + last.height  / 2;
            return (
              <g key="proc-rail" opacity="0.55">
                <text
                  x={railX + 12} y={first.top - 4}
                  fontSize="7" fontFamily="ui-monospace, SFMono-Regular, monospace"
                  fontWeight="700" letterSpacing="0.08em"
                  fill="#86efac" opacity="0.75" textAnchor="start"
                >
                  STEPS
                </text>
                <line x1={railX + 4} y1={y1} x2={railX + 4} y2={y2} stroke="#86efac" strokeWidth="1.5" strokeDasharray="1 3" />
                {procedureChain.map((r) => {
                  const stepNum = procedureStepIndex.get(r.id);
                  if (!stepNum) return null;
                  const cy = r.top + r.height / 2;
                  return (
                    <g key={`proc-step-${r.id}`}>
                      <rect x={railX - 3} y={cy - 6.5} width={14} height={13} rx={2} fill="#14532d" stroke="#86efac" strokeWidth="1" opacity="0.85" />
                      <text
                        x={railX + 4} y={cy + 3}
                        fontSize="7" fontFamily="ui-monospace, monospace" fontWeight="700"
                        fill="#86efac" textAnchor="middle"
                      >
                        {stepNum}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })()}
          {procedureChain.slice(0, -1).map((rect, i) => {
            const next = procedureChain[i + 1];
            const x1 = rect.left + rect.width / 2;
            const y1 = rect.top + rect.height + 2;
            const x2 = next.left + next.width / 2;
            const y2 = next.top - 4;
            const cy = (y1 + y2) / 2;
            const d = `M ${x1} ${y1} C ${x1} ${cy}, ${x2} ${cy}, ${x2} ${y2}`;
            return (
              <path
                key={`proc-conn-${i}`}
                d={d}
                fill="none"
                stroke="#86efac"
                strokeWidth="1.5"
                strokeDasharray="4 3"
                opacity="0.65"
                markerEnd="url(#proc-arrow)"
              />
            );
          })}
        </svg>
      )}

      {/* Comparison connector — bidirectional ↕ between consecutive comparison rects */}
      {comparisonChain.length >= 2 && (
        <svg
          aria-hidden
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", pointerEvents: "none" }}
        >
          <defs>
            <marker id="cmp-arrow-up" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
              <polygon points="3 0, 6 6, 0 6" fill="#93c5fd" opacity="0.75" />
            </marker>
            <marker id="cmp-arrow-dn" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto-start-reverse">
              <polygon points="3 0, 6 6, 0 6" fill="#93c5fd" opacity="0.75" />
            </marker>
          </defs>
          {comparisonChain.slice(0, -1).map((rect, i) => {
            const next = comparisonChain[i + 1];
            const x = Math.max(4, Math.min(rect.left, next.left) - 14);
            const y1 = rect.top + rect.height - 2;
            const y2 = next.top + 2;
            if (y2 - y1 < 4) return null;
            return (
              <g key={`cmp-${i}`} opacity="0.60">
                <line
                  x1={x} y1={y1} x2={x} y2={y2}
                  stroke="#93c5fd" strokeWidth="1.5"
                  markerStart="url(#cmp-arrow-up)"
                  markerEnd="url(#cmp-arrow-dn)"
                />
                <text
                  x={x - 2} y={(y1 + y2) / 2 + 4}
                  fontSize="8" fontFamily="ui-monospace, monospace" fontWeight="700"
                  fill="#93c5fd" opacity="0.80" textAnchor="middle"
                >
                  ↕
                </text>
              </g>
            );
          })}
        </svg>
      )}
      {rects.filter(shouldRender).map((rect) => {
        const focused = focusedId === rect.id;
        // When any highlight is active, dim all others — "surgeon's spotlight" effect.
        // Continuation lines share a base ID (e.g. "va-0-L1" belongs to "va-0") so check prefix too.
        const baseId = rect.id.replace(/-L\d+$/, "");
        const activeFocused = focused || (!!focusedId && baseId === focusedId);
        const dimmed = !!focusedId && !activeFocused;
        const cfg = getConfig(rect);
        // Only render a label on the first line of each highlight target.
        // Continuation lines have IDs like "va-0-L1", "va-0-L2"; first lines are plain IDs.
        const isFirstLine = !rect.id.match(/-L\d+$/);
        const hasLeftMargin = rect.left >= 50;
        const tierStyle = tierGlowStyle(rect.priorityTier, cfg.glowColor);
        // Domain-adaptive label: use packTierLabels override when the active pack provides one.
        // Semantic overrides take priority: definition → "DEFINE", pearl tier → ◆ prefix.
        const tier = getTierForRect(rect);
        const baseLabel = packTierLabels?.[tier] ?? cfg.label;
        const displayLabel = rect.semanticKind === "definition"
          ? "DEFINE"
          : tier === "pearl"
            ? `◆ ${baseLabel}`
            : baseLabel;
        return (
          <button
            key={rect.id}
            type="button"
            ref={(el) => { if (el) rectRefs.current.set(rect.id, el); else rectRefs.current.delete(rect.id); }}
            onClick={() => onFocus?.(baseId)}
            className={`pointer-events-auto absolute ${activeFocused ? cfg.ringClass : ""}`}
            style={{
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
              borderRadius: "6px",
              // evidenceUnderline reads as "supporting" (the lowest importance tier) —
              // a restrained bottom-border instead of a filled box, never both.
              backgroundColor: rect.treatment === "evidenceUnderline"
                ? "transparent"
                : (activeFocused ? cfg.bgFocused : cfg.bgNormal),
              border: rect.treatment === "evidenceUnderline" ? undefined : (activeFocused ? undefined : tierStyle.border),
              borderBottom: rect.treatment === "evidenceUnderline"
                ? `2px solid rgba(103,232,249,${activeFocused ? 0.85 : 0.55})`
                : undefined,
              // Definition anchors get a gold left-edge accent — "boxed definition" feel.
              borderLeft: (rect.semanticKind === "definition" || rect.treatment === "definitionBar")
                ? `3px solid rgba(253,224,71,${activeFocused ? 0.85 : 0.55})`
                : undefined,
              overflow: "visible",
              opacity: dimmed ? 0.45 : 1,
              transition: "opacity 180ms ease, background-color 150ms ease",
            }}
            aria-label={`${displayLabel || "Evidence"} highlight`}
          >
            {/* Margin label — first line only. Shows domain-adaptive tier name (e.g. CONCEPT for
                chemistry, RULE for law); adds a secondary reason line when margin space allows. */}
            {displayLabel && rect.height >= 6 && isFirstLine && (
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
                  opacity: activeFocused ? 1 : 0.82,
                  userSelect: "none",
                  maxWidth: hasLeftMargin ? Math.max(52, rect.left - 8) : 96,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {displayLabel}
                {rect.reason && hasLeftMargin && (
                  <span style={{ display: "block", fontSize: 7, fontWeight: 400, opacity: 0.78, marginTop: 1, letterSpacing: "0.02em", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>
                    {rect.reason.length > 24 ? rect.reason.slice(0, 23) + "…" : rect.reason}
                  </span>
                )}
              </span>
            )}
            {/* Trap notch — top-left corner triangle for danger rects (first line only) */}
            {tier === "danger" && isFirstLine && (
              <span style={{
                position: "absolute", top: 0, left: 0, width: 0, height: 0,
                borderTop: "9px solid rgba(252,165,165,0.85)",
                borderRight: "9px solid transparent",
                borderRadius: "3px 0 0 0",
                pointerEvents: "none",
              }} />
            )}
            {/* decisionConnector — small diamond marker, top-left corner (first line only).
                Same corner-marker technique as the trap notch above, but diamond-shaped and
                blue, so it reads distinctly from both the trap notch and the comparisonBracket
                arrow connector. */}
            {rect.treatment === "decisionConnector" && isFirstLine && (
              <span style={{
                position: "absolute", top: 2, left: 2, width: 7, height: 7,
                background: "rgba(147,197,253,0.85)",
                transform: "rotate(45deg)",
                borderRadius: "1px",
                pointerEvents: "none",
              }} />
            )}
            {/* pearlMarker — small filled dot, top-left corner (first line only). Round
                (vs. the trap notch's triangle / decisionConnector's diamond) to read as a
                distinct "expert insight" marker at a glance. */}
            {rect.treatment === "pearlMarker" && isFirstLine && (
              <span style={{
                position: "absolute", top: 3, left: 3, width: 6, height: 6,
                background: "rgba(103,232,249,0.9)",
                borderRadius: "50%",
                pointerEvents: "none",
              }} />
            )}
          </button>
        );
      })}
    </div>
  );
}
