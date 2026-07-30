"use client";

// components/learningHub/VisualKnowledgeRoadmap.tsx
// Interactive visual knowledge roadmap — pure React + SVG, no graph library.
//
// Layout strategy:
//   Nodes are arranged in three horizontal tiers by importance:
//     High (≥70) → center row
//     Medium (40–69) → second row
//     Low  (<40)  → third row
//
//   SVG bezier edges connect related nodes (parentNodeIds, childNodeIds,
//   relatedNodeIds). Edges are drawn as light curves behind the node cards.
//
//   Each node card is an interactive <div> — click jumps to its source page.
//   The SVG overlay uses pointer-events:none so clicks reach the cards.

import React, { useMemo, useRef, useState, useLayoutEffect } from "react";
import type { KnowledgeNode } from "@/lib/knowledge/knowledgeGraphSchema";

// ── Layout constants ────────────────────────────────────────────────────────
const NODE_W     = 156;   // px, logical
const NODE_H     = 108;   // px, logical
const H_GAP      = 12;    // px, minimum horizontal gap between nodes
const TIER_GAP_Y = 160;   // px, vertical distance between tier top edges
const PADDING    = 20;    // px, outer padding

// ── Node importance tiers ───────────────────────────────────────────────────
function getTier(node: KnowledgeNode): 0 | 1 | 2 {
  const imp = node.importance ?? 0;
  if (imp >= 70) return 0;
  if (imp >= 40) return 1;
  return 2;
}

const TIER_LABEL = ["High Priority", "Supporting", "Background"] as const;
const TIER_COLOR = [
  { border: "#fde047", bg: "rgba(253,224,71,0.08)", text: "#fde047" },
  { border: "#93c5fd", bg: "rgba(147,197,253,0.08)", text: "#93c5fd" },
  { border: "#94a3b8", bg: "rgba(148,163,184,0.08)", text: "#94a3b8" },
] as const;

// ── Position computation ────────────────────────────────────────────────────
interface NodePos { x: number; y: number }

function computePositions(
  nodes: KnowledgeNode[],
  canvasW: number,
): { positions: Map<string, NodePos>; totalH: number } {
  const tiers: KnowledgeNode[][] = [[], [], []];
  for (const n of nodes) tiers[getTier(n)].push(n);

  const positions = new Map<string, NodePos>();
  let totalH = PADDING;

  tiers.forEach((tier, tierIdx) => {
    if (tier.length === 0) return;
    const rowY = PADDING + tierIdx * TIER_GAP_Y;
    const availW = canvasW - 2 * PADDING;
    // evenly distribute, but no wider than NODE_W + H_GAP
    const stride = Math.min(NODE_W + H_GAP, tier.length === 1 ? availW : availW / (tier.length - 1 || 1));
    const totalRowW = tier.length === 1 ? NODE_W : (tier.length - 1) * stride + NODE_W;
    const startX = PADDING + (availW - totalRowW) / 2;
    tier.forEach((n, i) => {
      positions.set(n.id, { x: startX + i * stride, y: rowY });
    });
    totalH = Math.max(totalH, rowY + NODE_H + PADDING);
  });

  return { positions, totalH };
}

// ── Edge helpers ─────────────────────────────────────────────────────────────
function cubicBezierD(x1: number, y1: number, x2: number, y2: number): string {
  const cy = (y1 + y2) / 2;
  return `M${x1},${y1} C${x1},${cy} ${x2},${cy} ${x2},${y2}`;
}

// ── Role color ───────────────────────────────────────────────────────────────
const ROLE_COLOR: Record<string, string> = {
  "Core Concept": "#fde047",
  "Mechanism":    "#93c5fd",
  "Algorithm":    "#86efac",
  "Case":         "#fb923c",
  "Formula":      "#c4b5fd",
  "Trap":         "#fca5a5",
};

// ── Component ────────────────────────────────────────────────────────────────
interface VisualKnowledgeRoadmapProps {
  nodes: KnowledgeNode[];
  onNodeClick: (node: KnowledgeNode) => void;
  selectedNodeId?: string | null;
}

export default function VisualKnowledgeRoadmap({
  nodes,
  onNodeClick,
  selectedNodeId,
}: VisualKnowledgeRoadmapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasW, setCanvasW] = useState(700);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Measure container width on mount and resize
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setCanvasW(entry.contentRect.width || 700);
    });
    ro.observe(el);
    setCanvasW(el.clientWidth || 700);
    return () => ro.disconnect();
  }, []);

  const sorted = useMemo(
    () => [...nodes].sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0)),
    [nodes],
  );

  const { positions, totalH } = useMemo(
    () => computePositions(sorted, canvasW),
    [sorted, canvasW],
  );

  // Build edge list — deduplicate by source<target pair
  const edges = useMemo(() => {
    const seen = new Set<string>();
    const result: Array<{ from: string; to: string }> = [];
    for (const n of sorted) {
      const targets = [
        ...n.relatedNodeIds,
        ...n.childNodeIds,
        ...n.parentNodeIds,
      ];
      for (const tid of targets) {
        if (!positions.has(tid)) continue;
        const key = [n.id, tid].sort().join("~");
        if (!seen.has(key)) {
          seen.add(key);
          result.push({ from: n.id, to: tid });
        }
      }
    }
    return result;
  }, [sorted, positions]);

  if (nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <div className="text-5xl">🕸</div>
        <div className="text-sm font-medium text-slate-300">Knowledge Roadmap</div>
        <div className="text-[12px] text-slate-500 max-w-xs leading-relaxed">
          Concepts are extracted as you read pages and generate study materials.
          Read a few pages with AI analysis to populate the roadmap.
        </div>
      </div>
    );
  }

  // Tier label rows (only non-empty tiers)
  const tierRows = ([0, 1, 2] as const).filter((t) =>
    sorted.some((n) => getTier(n) === t)
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Legend */}
      <div className="flex items-center gap-3 flex-wrap px-1">
        {tierRows.map((t) => (
          <div key={t} className="flex items-center gap-1.5">
            <div
              className="w-2.5 h-2.5 rounded-sm"
              style={{ background: TIER_COLOR[t].bg, border: `1px solid ${TIER_COLOR[t].border}` }}
            />
            <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: TIER_COLOR[t].text }}>
              {TIER_LABEL[t]}
            </span>
          </div>
        ))}
        <span className="text-[9px] text-slate-600 ml-auto">{nodes.length} concept{nodes.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Canvas — relative container; SVG overlay + absolute node cards */}
      <div
        ref={containerRef}
        className="relative overflow-x-auto"
        style={{ height: totalH, minHeight: 160 }}
      >
        {/* SVG edge layer */}
        <svg
          width={canvasW}
          height={totalH}
          className="absolute inset-0 pointer-events-none"
          style={{ zIndex: 0 }}
        >
          {edges.map(({ from, to }) => {
            const src = positions.get(from);
            const dst = positions.get(to);
            if (!src || !dst) return null;
            const x1 = src.x + NODE_W / 2;
            const y1 = src.y + NODE_H;
            const x2 = dst.x + NODE_W / 2;
            const y2 = dst.y;
            const highlighted =
              hoveredId === from || hoveredId === to ||
              selectedNodeId === from || selectedNodeId === to;
            return (
              <path
                key={`${from}~${to}`}
                d={cubicBezierD(x1, y1, x2, y2)}
                fill="none"
                stroke={highlighted ? "#6366f1" : "#334155"}
                strokeWidth={highlighted ? 1.5 : 1}
                strokeDasharray={highlighted ? undefined : "4 3"}
                opacity={highlighted ? 0.8 : 0.35}
              />
            );
          })}
          {/* Tier separator lines */}
          {tierRows.slice(0, -1).map((t) => {
            const lineY = PADDING + (t + 1) * TIER_GAP_Y - TIER_GAP_Y / 2;
            return (
              <line
                key={`sep-${t}`}
                x1={PADDING}
                y1={lineY}
                x2={canvasW - PADDING}
                y2={lineY}
                stroke="#1e293b"
                strokeWidth={1}
              />
            );
          })}
        </svg>

        {/* Tier labels */}
        {tierRows.map((t) => {
          const firstOfTier = sorted.find((n) => getTier(n) === t);
          if (!firstOfTier) return null;
          const pos = positions.get(firstOfTier.id);
          if (!pos) return null;
          return (
            <div
              key={`label-${t}`}
              className="absolute text-[8px] font-bold uppercase tracking-widest pointer-events-none"
              style={{
                left: PADDING,
                top: pos.y - 14,
                color: TIER_COLOR[t].text,
                opacity: 0.5,
                zIndex: 1,
              }}
            >
              {TIER_LABEL[t]}
            </div>
          );
        })}

        {/* Node cards */}
        {sorted.map((node) => {
          const pos = positions.get(node.id);
          if (!pos) return null;
          const tier = getTier(node);
          const tc = TIER_COLOR[tier];
          const isSelected = node.id === selectedNodeId;
          const isHovered  = node.id === hoveredId;
          const roleColor  = ROLE_COLOR[node.role] ?? "#94a3b8";
          return (
            <button
              key={node.id}
              type="button"
              onClick={() => onNodeClick(node)}
              onMouseEnter={() => setHoveredId(node.id)}
              onMouseLeave={() => setHoveredId(null)}
              className="absolute text-left rounded-xl transition-all duration-150 flex flex-col gap-1 px-2.5 py-2"
              style={{
                left: pos.x,
                top: pos.y,
                width: NODE_W,
                height: NODE_H,
                background: tc.bg,
                border: `1px solid ${isSelected || isHovered ? tc.border : tc.border + "55"}`,
                boxShadow: isSelected
                  ? `0 0 0 2px ${tc.border}66, 0 4px 16px ${tc.border}22`
                  : isHovered
                  ? `0 2px 8px rgba(0,0,0,0.4)`
                  : "none",
                zIndex: isSelected || isHovered ? 10 : 2,
                transform: isHovered ? "translateY(-1px)" : undefined,
              }}
            >
              {/* Role chip */}
              <div className="flex items-center gap-1">
                <span
                  className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                  style={{ color: roleColor, background: `${roleColor}18`, border: `1px solid ${roleColor}33` }}
                >
                  {node.role || "Concept"}
                </span>
                {node.sourcePages[0] != null && (
                  <span className="text-[8px] text-slate-600 ml-auto shrink-0">p.{node.sourcePages[0]}</span>
                )}
              </div>
              {/* Title */}
              <div
                className="text-[11px] font-semibold leading-snug text-white/90"
                style={{
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {node.title}
              </div>
              {/* Summary */}
              {node.summary && (
                <div
                  className="text-[9.5px] text-slate-400 leading-snug"
                  style={{
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {node.summary}
                </div>
              )}
              {/* Importance bar */}
              <div className="mt-auto">
                <div className="h-0.5 rounded-full bg-white/8 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(node.importance ?? 0, 100)}%`,
                      background: tc.border,
                    }}
                  />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected node detail panel */}
      {selectedNodeId && (() => {
        const sel = nodes.find((n) => n.id === selectedNodeId);
        if (!sel) return null;
        const tier = getTier(sel);
        const tc = TIER_COLOR[tier];
        return (
          <div
            className="rounded-xl border p-4 space-y-2"
            style={{ borderColor: tc.border + "55", background: tc.bg }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="text-[12px] font-bold text-white/90 leading-snug">{sel.title}</div>
              <span
                className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full shrink-0"
                style={{ color: tc.text, background: tc.bg, border: `1px solid ${tc.border}55` }}
              >
                {TIER_LABEL[tier]}
              </span>
            </div>
            {sel.summary && (
              <p className="text-[10.5px] text-slate-300 leading-relaxed">{sel.summary}</p>
            )}
            {sel.learningObjectives.length > 0 && (
              <div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Learning objectives</div>
                {sel.learningObjectives.slice(0, 3).map((obj, i) => (
                  <div key={i} className="text-[10px] text-slate-400 flex items-start gap-1.5">
                    <span className="text-slate-600 shrink-0 mt-0.5">•</span>{obj}
                  </div>
                ))}
              </div>
            )}
            {sel.misconceptions.length > 0 && (
              <div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-rose-500/70 mb-1">Common misconceptions</div>
                {sel.misconceptions.slice(0, 2).map((m, i) => (
                  <div key={i} className="text-[10px] text-rose-300/80 flex items-start gap-1.5">
                    <span className="text-rose-500/60 shrink-0 mt-0.5">⚠</span>{m}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
