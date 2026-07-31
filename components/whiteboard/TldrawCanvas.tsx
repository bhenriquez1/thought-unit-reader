"use client";
// components/whiteboard/TldrawCanvas.tsx
// Interactive tldraw v5 whiteboard canvas for the Avrrio Whiteboard tab.
//
// Auto-draw: when `autoReveal` is true (the default), the canvas starts
// drawing the diagram automatically after mount — no blank canvas, no button
// press. The reveal sequence mimics a professor drawing at the board: each
// node/arrow appears with a deliberate pause so the student can follow.
//
// tldraw v5 API notes:
//   - Shape text labels use `richText: toRichText(str)` not `text: str`
//   - Arrow start/end are plain VecModel `{ x, y }` not `{ type: "point", x, y }`

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Tldraw, createShapeId, type Editor } from "@tldraw/tldraw";
import "@tldraw/tldraw/tldraw.css";
import { toRichText } from "@tldraw/tlschema";
import type { NoteCard } from "@/lib/insights/synthesizeTeachingOutput";

// ── Tier → tldraw color ───────────────────────────────────────────────────────
const TIER_COLOR: Record<string, string> = {
  master:   "yellow",
  step:     "green",
  decision: "blue",
  danger:   "red",
  pearl:    "light-blue",
};

const CARD_TYPE_TIER: Record<string, string> = {
  must_know: "master", master_concepts: "master", why_this_matters: "master",
  mechanism: "step", procedure_flow: "step", formula_breakdown: "step",
  clinical_reasoning: "decision", decision_tree: "decision", exam_strategy: "decision",
  dat_trap: "danger", common_mistake: "danger", complication_risk: "danger",
  clinical_pearl: "pearl", memory_hook: "pearl", expert_thinking: "pearl",
};

// ── Layout helpers ────────────────────────────────────────────────────────────

function flowPositions(count: number): Array<{ x: number; y: number }> {
  return Array.from({ length: count }, (_, i) => ({ x: 100, y: 80 + i * 110 }));
}

function hubPositions(count: number): Array<{ x: number; y: number }> {
  if (count === 0) return [];
  const cx = 300, cy = 260, r = 200;
  const positions = [{ x: cx - 120, y: cy - 30 }];
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
  /** Start drawing automatically after build — default true (professor-at-the-board feel). */
  autoReveal?: boolean;
}

// How long to pause between each shape being drawn (ms) — deliberate pace so
// the student can follow, like a professor drawing at the board.
const REVEAL_INTERVAL_MS = 1100;
// Delay before the first shape appears after the canvas builds (ms).
const AUTO_REVEAL_DELAY_MS = 700;

export default function TldrawCanvas({
  noteCards,
  pageTitle,
  whiteboardGrammar = "flow",
  onAnchorClick: _onAnchorClick,
  autoReveal = true,
}: Props) {
  const editorRef         = useRef<Editor | null>(null);
  const [revealStep, setRevealStep]     = useState(0);
  const [isRevealing, setIsRevealing]   = useState(false);
  const [isDrawingDone, setIsDrawingDone] = useState(false);
  const builtRef          = useRef(false);
  const autoRevealTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAutoTimer = () => {
    if (autoRevealTimer.current) { clearTimeout(autoRevealTimer.current); autoRevealTimer.current = null; }
  };

  const buildShapes = useCallback((editor: Editor) => {
    if (!noteCards.length) return;
    editor.selectAll().deleteShapes(editor.getSelectedShapeIds());

    let y = 60;
    noteCards.forEach((card, cardIdx) => {
      const tier  = CARD_TYPE_TIER[card.type] ?? "pearl";
      const color = TIER_COLOR[tier] ?? "blue";
      const nodes  = card.visual?.nodes  ?? [];
      const arrows = card.visual?.arrows ?? [];

      if (nodes.length === 0) {
        const sid = createShapeId(`card-${cardIdx}`);
        editor.createShape({
          id: sid, type: "text", x: 100, y,
          props: {
            richText: toRichText(card.title + "\n" + card.body.slice(0, 120)),
            size: "s", font: "sans", color: "black",
          },
          opacity: 0,
        });
        y += 120;
        return;
      }

      const positions = getPositions(nodes.length, whiteboardGrammar);

      nodes.forEach((node, nIdx) => {
        const sid = createShapeId(`n-${cardIdx}-${nIdx}`);
        const pos = positions[nIdx] ?? { x: 100, y: nIdx * 110 };
        editor.createShape({
          id: sid, type: "geo",
          x: pos.x, y: pos.y + y,
          props: {
            geo: "rectangle", w: 230, h: 56,
            richText: toRichText(node.label),
            fill: "solid", color: color as any, size: "s",
          },
          opacity: 0,
        });
      });

      arrows.forEach((arrow, aIdx) => {
        const fromIdx = nodes.findIndex(n => n.id === arrow.from);
        const toIdx   = nodes.findIndex(n => n.id === arrow.to);
        if (fromIdx < 0 || toIdx < 0) return;
        const fromPos = positions[fromIdx] ?? { x: 100, y: 0 };
        const toPos   = positions[toIdx]   ?? { x: 100, y: 110 };
        editor.createShape({
          id: createShapeId(`a-${cardIdx}-${aIdx}`), type: "arrow",
          x: fromPos.x + 230, y: fromPos.y + y + 28,
          props: {
            start: { x: 0, y: 0 },
            end:   { x: toPos.x - fromPos.x, y: toPos.y - fromPos.y },
            richText: toRichText(arrow.label ?? ""),
            size: "s",
            color: (tier === "step" ? "green" : tier === "danger" ? "red" : "blue") as any,
          },
          opacity: 0,
        });
      });

      y += Math.max(nodes.length, 1) * 110 + 60;
    });

    editor.zoomToFit({ duration: 200 });
  }, [noteCards, whiteboardGrammar]);

  const handleMount = useCallback((editor: Editor) => {
    editorRef.current = editor;
    if (!builtRef.current) {
      builtRef.current = true;
      buildShapes(editor);
      if (autoReveal && noteCards.length > 0) {
        clearAutoTimer();
        autoRevealTimer.current = setTimeout(() => setIsRevealing(true), AUTO_REVEAL_DELAY_MS);
      }
    }
  }, [buildShapes, autoReveal, noteCards.length]);

  useEffect(() => {
    clearAutoTimer();
    builtRef.current = false;
    setIsDrawingDone(false);
    if (editorRef.current) {
      builtRef.current = true;
      buildShapes(editorRef.current);
      if (autoReveal && noteCards.length > 0) {
        autoRevealTimer.current = setTimeout(() => setIsRevealing(true), AUTO_REVEAL_DELAY_MS);
      }
    }
    setRevealStep(0);
    setIsRevealing(false);
    return clearAutoTimer;
  }, [noteCards, buildShapes, autoReveal]);

  const revealNext = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const hidden = editor.getCurrentPageShapes().filter(s => s.opacity === 0);
    if (hidden.length === 0) {
      setIsRevealing(false);
      setIsDrawingDone(true);
      return;
    }
    editor.updateShape({ id: hidden[0].id, type: hidden[0].type, opacity: 1 });
    setRevealStep(s => s + 1);
  }, []);

  useEffect(() => {
    if (!isRevealing) return;
    const t = window.setTimeout(revealNext, REVEAL_INTERVAL_MS);
    return () => clearTimeout(t);
  }, [isRevealing, revealStep, revealNext]);

  const revealAll = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.getCurrentPageShapes().forEach(s => {
      if (s.opacity === 0) editor.updateShape({ id: s.id, type: s.type, opacity: 1 });
    });
    setIsRevealing(false);
    setIsDrawingDone(true);
  }, []);

  const replay = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.getCurrentPageShapes().forEach(s => {
      editor.updateShape({ id: s.id, type: s.type, opacity: 0 });
    });
    setRevealStep(0);
    setIsDrawingDone(false);
    setTimeout(() => setIsRevealing(true), 300);
  }, []);

  const headerLabel = isRevealing
    ? "Drawing…"
    : isDrawingDone
    ? (pageTitle ?? "Whiteboard")
    : (pageTitle ?? "Whiteboard");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 480, background: "#0f172a" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <span style={{
          fontSize: 11, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis",
          whiteSpace: "nowrap", maxWidth: 260,
          color: isRevealing ? "#86efac" : "#94a3b8",
          transition: "color 300ms ease",
        }}>
          {headerLabel}
        </span>
        {/* Pulsing dot while drawing */}
        {isRevealing && (
          <span style={{
            width: 6, height: 6, borderRadius: "50%", background: "#86efac",
            animation: "pulse 1s ease-in-out infinite",
            flexShrink: 0,
          }} />
        )}
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {isDrawingDone ? (
            <button
              onClick={replay}
              style={{ fontSize: 11, padding: "3px 10px", borderRadius: 4, background: "rgba(134,239,172,0.12)", color: "#86efac", border: "1px solid rgba(134,239,172,0.25)", cursor: "pointer" }}
            >
              ↺ Replay
            </button>
          ) : !isRevealing ? (
            <button
              onClick={() => { setRevealStep(0); setIsRevealing(true); }}
              style={{ fontSize: 11, padding: "3px 10px", borderRadius: 4, background: "rgba(134,239,172,0.15)", color: "#86efac", border: "1px solid rgba(134,239,172,0.3)", cursor: "pointer" }}
            >
              ▶ Draw
            </button>
          ) : null}
          <button
            onClick={revealAll}
            style={{ fontSize: 11, padding: "3px 10px", borderRadius: 4, background: "rgba(148,163,184,0.1)", color: "#94a3b8", border: "1px solid rgba(148,163,184,0.2)", cursor: "pointer" }}
          >
            Show all
          </button>
        </span>
      </div>
      <style>{`@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
      <div style={{ flex: 1, position: "relative" }}>
        <Tldraw onMount={handleMount} hideUi={false} />
      </div>
    </div>
  );
}
