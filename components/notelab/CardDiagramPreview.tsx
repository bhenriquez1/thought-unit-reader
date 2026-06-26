// components/notelab/CardDiagramPreview.tsx
// Lightweight SVG thumbnail for a NoteCard's `visual` (connection_map / decision_tree /
// procedure_flow / diagram cards). Whiteboard.tsx is canvas-based and not cheaply
// embeddable as a static thumbnail, so this is a deliberately separate, simple renderer:
// no force-directed simulation, just nx/ny (if the AI supplied them) or a deterministic
// fallback layout sized for a ~300x140px card preview.

import React from "react";
import type { NoteCardVisual } from "@/lib/insights/synthesizeTeachingOutput";

const WIDTH = 300;
const HEIGHT = 140;
const NODE_W = 84;
const NODE_H = 28;
const PAD = 16;

function layoutNodes(visual: NoteCardVisual): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const n = visual.nodes.length;
  if (n === 0) return positions;

  const hasExplicitCoords = visual.nodes.some((node) => node.nx != null && node.ny != null);
  if (hasExplicitCoords) {
    for (const node of visual.nodes) {
      const nx = node.nx ?? 0.5;
      const ny = node.ny ?? 0.5;
      positions.set(node.id, {
        x: PAD + nx * (WIDTH - 2 * PAD - NODE_W),
        y: PAD + ny * (HEIGHT - 2 * PAD - NODE_H),
      });
    }
    return positions;
  }

  if (visual.drawType === "cycle") {
    const cx = WIDTH / 2;
    const cy = HEIGHT / 2;
    const r = Math.min(WIDTH, HEIGHT) / 2 - PAD - NODE_H / 2;
    visual.nodes.forEach((node, i) => {
      const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
      positions.set(node.id, {
        x: cx + r * Math.cos(angle) - NODE_W / 2,
        y: cy + r * Math.sin(angle) - NODE_H / 2,
      });
    });
    return positions;
  }

  // Default: single row when it fits, else wrap into a grid.
  const perRow = n <= 4 ? n : Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / perRow);
  const colGap = (WIDTH - 2 * PAD - NODE_W) / Math.max(1, perRow - 1 || 1);
  const rowGap = (HEIGHT - 2 * PAD - NODE_H) / Math.max(1, rows - 1 || 1);
  visual.nodes.forEach((node, i) => {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    positions.set(node.id, {
      x: perRow === 1 ? WIDTH / 2 - NODE_W / 2 : PAD + col * colGap,
      y: rows === 1 ? HEIGHT / 2 - NODE_H / 2 : PAD + row * rowGap,
    });
  });
  return positions;
}

export default function CardDiagramPreview({
  visual,
  onClick,
}: {
  visual: NoteCardVisual;
  onClick?: () => void;
}) {
  const positions = layoutNodes(visual);

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-md border border-white/10 bg-black/20 hover:border-white/25 transition-colors cursor-pointer"
      aria-label={`Open ${visual.drawType} diagram`}
    >
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" height={HEIGHT} className="block">
        <defs>
          <marker id="cdp-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="rgba(186,230,253,0.85)" />
          </marker>
        </defs>
        {visual.arrows.map((arrow, i) => {
          const from = positions.get(arrow.from);
          const to = positions.get(arrow.to);
          if (!from || !to) return null;
          const x1 = from.x + NODE_W / 2;
          const y1 = from.y + NODE_H / 2;
          const x2 = to.x + NODE_W / 2;
          const y2 = to.y + NODE_H / 2;
          return (
            <g key={`arrow-${i}`}>
              <line
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="rgba(186,230,253,0.6)"
                strokeWidth={1.5}
                markerEnd="url(#cdp-arrow)"
              />
              {arrow.label && (
                <text
                  x={(x1 + x2) / 2}
                  y={(y1 + y2) / 2 - 4}
                  fontSize={8}
                  fill="rgba(186,230,253,0.85)"
                  textAnchor="middle"
                >
                  {arrow.label.slice(0, 18)}
                </text>
              )}
            </g>
          );
        })}
        {visual.nodes.map((node) => {
          const pos = positions.get(node.id);
          if (!pos) return null;
          return (
            <g key={node.id}>
              <rect
                x={pos.x} y={pos.y} width={NODE_W} height={NODE_H} rx={6}
                fill="rgba(56,189,248,0.14)"
                stroke="rgba(125,211,252,0.55)"
                strokeWidth={1}
              />
              <text
                x={pos.x + NODE_W / 2}
                y={pos.y + NODE_H / 2 + 3}
                fontSize={8.5}
                fill="#e0f2fe"
                textAnchor="middle"
              >
                {node.label.length > 14 ? `${node.label.slice(0, 13)}…` : node.label}
              </text>
            </g>
          );
        })}
      </svg>
    </button>
  );
}
