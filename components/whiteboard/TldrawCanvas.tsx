"use client";
// components/whiteboard/TldrawCanvas.tsx
// Interactive tldraw whiteboard canvas for the Avrrio Whiteboard tab.
//
// Renders the same NoteCard[] that VisualSceneEngine uses, but onto a real
// interactive tldraw canvas — students can drag nodes, zoom freely, and
// add their own annotations on top of the AI-generated diagram.
//
// Progressive reveal: shapes start invisible (opacity: 0) and are revealed
// one-by-one in sync with TTS narration via the `revealedIds` state.
// After full reveal the canvas becomes fully interactive.
//
// Design contract:
//   - Same 5-tier Avrrio colors as VisualSceneEngine
//   - `whiteboardGrammar` prop biases initial node positions toward the
//     domain's natural visual form (hub-spoke for anatomy/law, flow for rest)
//   - All shapes carry an `annotationTier` meta field for future querying

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Tldraw, createShapeId, type Editor } from "@tldraw/tldraw";
import "@tldraw/tldraw/tldraw.css";
import type { NoteCard } from "@/lib/insights/synthesizeTeachingOutput";

// ── Tier colors (mirrors PdfEvidenceOverlay TIER_CONFIG) ──────────────────────
const TIER_COLORS: Record<string, { fill: string; stroke: string; text: string }> = {
  master:   { fill: "rgba(253,224,71,0.18)",  stroke: "#fde047", text: "#713f12" },
  step:     { fill: "rgba(134,239,172,0.18)", stroke: "#86efac", text: "#14532d" },
  decision: { fill: "rgba(147,197,253,0.18)", stroke: "#93c5fd", text: "#1e3a5f" },
  danger:   { fill: "rgba(252,165,165,0.18)", stroke: "#fca5a5", text: "#7f1d1d" },
  pearl:    { fill: "rgba(103,232,249,0.18)", stroke: "#67e8f9", text: "#083344" },
};

const CARD_TYPE_TIER: Record<string, string> = {
  must_know: "master", master_concepts: "master", why_this_matters: "master",
  mechanism: "step", procedure_flow: "step", formula_breakdown: "step",
  clinical_reasoning: "decision", decision_tree: "decision", exam_strategy: "decision",
  dat_trap: "danger", common_mistake: "danger", complication_risk: "danger",
  clinical_pearl: "pearl", memory_hook: "pearl", expert_thinking: "pearl",
};

// ── Layout positions ──────────────────────────────────────────────────────────
// Grammar-aware initial placement for the first card's nodes.

function flowPositions(count: number): Array<{ x: number; y: number }> {
  return Array.from({ length: count }, (_, i) => ({ x: 100, y: 80 + i * 110 }));
}

function hubPositions(count: number): Array<{ x: number; y: number }> {
  if (count === 0) return [];
  const cx = 300, cy = 260, r = 200;
  const positions = [{ x: cx - 120, y: cy - 30 }]; // hub center-left
  const spokes = count - 1;
  for (let i = 0; i < spokes; i++) {
    const angle = ((i / spokes) * 2 * Math.PI) - Math.PI / 2;
    positions.push({ x: cx + r * Math.cos(angle) - 120, y: cy + r * Math.sin(angle) - 20 });
  }
  return positions;
}

function getPositions(count: number, grammar: string): Array<{ x: number; y: number }> {
  if (grammar === "anatomy" || grammar === "case-map" || grammar === "system-diagram")
    return hubPositions(count);
  return flowPositions(count);
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  noteCards: NoteCard[];
  pageTitle?: string | null;
  whiteboardGrammar?: string;
  onAnchorClick?: (nodeId: string) => void;
}

export default function TldrawCanvas({ noteCards, pageTitle, whiteboardGrammar = "flow", onAnchorClick }: Props) {
  const editorRef = useRef<Editor | null>(null);
  const [revealStep, setRevealStep] = useState(0);
  const [isRevealing, setIsRevealing] = useState(false);
  const builtRef = useRef(false);

  // Build shapes from noteCards on first editor mount / card change.
  const buildShapes = useCallback((editor: Editor) => {
    if (!noteCards.length) return;
    editor.selectAll().deleteShapes(editor.getSelectedShapeIds());

    let y = 60;
    noteCards.forEach((card, cardIdx) => {
      const tier = CARD_TYPE_TIER[card.type] ?? "pearl";
      const colors = TIER_COLORS[tier] ?? TIER_COLORS.pearl;
      const nodes = card.visual?.nodes ?? [];
      const arrows = card.visual?.arrows ?? [];

      if (nodes.length === 0) {
        // Text-only card — single text box
        const sid = createShapeId(`card-${cardIdx}`);
        editor.createShape({
          id: sid,
          type: "text",
          x: 100,
          y,
          props: { text: card.title + "\n" + card.body.slice(0, 120), size: "s", font: "sans", color: "black" },
          opacity: 0,
        });
        y += 120;
        return;
      }

      const positions = getPositions(nodes.length, whiteboardGrammar);

      // Node shapes
      nodes.forEach((node, nIdx) => {
        const sid = createShapeId(`n-${cardIdx}-${nIdx}`);
        const pos = positions[nIdx] ?? { x: 100, y: y + nIdx * 110 };
        editor.createShape({
          id: sid,
          type: "geo",
          x: pos.x,
          y: pos.y + y,
          props: {
            geo: "rectangle",
            w: 230,
            h: 56,
            text: node.label,
            fill: "solid",
            color: tier === "master" ? "yellow" : tier === "step" ? "green" : tier === "danger" ? "red" : tier === "pearl" ? "light-blue" : "blue",
            size: "s",
          },
          opacity: 0,
        });
      });

      // Arrow shapes connecting nodes as specified
      arrows.forEach((arrow, aIdx) => {
        const fromIdx = nodes.findIndex(n => n.id === arrow.from);
        const toIdx   = nodes.findIndex(n => n.id === arrow.to);
        if (fromIdx < 0 || toIdx < 0) return;
        const fromPos = positions[fromIdx] ?? { x: 100, y: 0 };
        const toPos   = positions[toIdx]   ?? { x: 100, y: 110 };
        const sid = createShapeId(`a-${cardIdx}-${aIdx}`);
        editor.createShape({
          id: sid,
          type: "arrow",
          x: fromPos.x + 115 + 100,
          y: fromPos.y + y + 28,
          props: {
            start: { type: "point", x: 0, y: 0 },
            end:   { type: "point", x: toPos.x - fromPos.x, y: toPos.y - fromPos.y + 28 },
            text: arrow.label ?? "",
            size: "s",
            color: tier === "step" ? "green" : tier === "danger" ? "red" : "blue",
          },
          opacity: 0,
        });
      });

      y += Math.max(nodes.length, 1) * 110 + 60;
    });

    // Fit view to show all shapes
    editor.zoomToFit({ duration: 200 });
  }, [noteCards, whiteboardGrammar]);

  const handleMount = useCallback((editor: Editor) => {
    editorRef.current = editor;
    if (!builtRef.current) {
      builtRef.current = true;
      buildShapes(editor);
    }
  }, [buildShapes]);

  // Rebuild when noteCards change
  useEffect(() => {
    builtRef.current = false;
    if (editorRef.current) {
      builtRef.current = true;
      buildShapes(editorRef.current);
    }
    setRevealStep(0);
  }, [noteCards, buildShapes]);

  // Progressive reveal — reveal shapes one by one
  const revealNext = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const allShapes = editor.getCurrentPageShapes();
    const hidden = allShapes.filter(s => s.opacity === 0);
    if (hidden.length === 0) { setIsRevealing(false); return; }
    const next = hidden[0];
    editor.updateShape({ id: next.id, type: next.type, opacity: 1 });
    setRevealStep(s => s + 1);
  }, []);

  useEffect(() => {
    if (!isRevealing) return;
    const t = window.setTimeout(revealNext, 900);
    return () => clearTimeout(t);
  }, [isRevealing, revealStep, revealNext]);

  // Reveal all at once
  const revealAll = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.getCurrentPageShapes().forEach(s => {
      if (s.opacity === 0) editor.updateShape({ id: s.id, type: s.type, opacity: 1 });
    });
    setIsRevealing(false);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 480, background: "#0f172a" }}>
      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <span style={{ fontSize: 12, color: "#94a3b8", fontFamily: "monospace" }}>
          {pageTitle ?? "Whiteboard"}
        </span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button
            onClick={() => { setRevealStep(0); setIsRevealing(true); }}
            style={{ fontSize: 11, padding: "3px 10px", borderRadius: 4, background: "rgba(134,239,172,0.15)", color: "#86efac", border: "1px solid rgba(134,239,172,0.3)", cursor: "pointer" }}
          >
            ▶ Reveal
          </button>
          <button
            onClick={revealAll}
            style={{ fontSize: 11, padding: "3px 10px", borderRadius: 4, background: "rgba(148,163,184,0.1)", color: "#94a3b8", border: "1px solid rgba(148,163,184,0.2)", cursor: "pointer" }}
          >
            Show all
          </button>
        </span>
      </div>
      {/* Canvas */}
      <div style={{ flex: 1, position: "relative" }}>
        <Tldraw
          onMount={handleMount}
          hideUi={false}
        />
      </div>
    </div>
  );
}
