"use client";
// components/whiteboard/TldrawCanvas.tsx
// Interactive tldraw whiteboard canvas for the Avrrio Whiteboard tab.
//
// Renders the same NoteCard[] that VisualSceneEngine uses, but onto a real
// interactive tldraw canvas — students can drag nodes, zoom freely, and
// add their own annotations on top of the AI-generated diagram.
//
// Phase 2 — Deterministic reveal controller:
//   Play / Pause / Previous / Next / Restart + speed selector (slow/normal/fast)
//   Narration panel outside the canvas shows the concept body as each shape reveals.
//   Shape reveal order is deterministic: nodeCard order → nodes first, arrows after.
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
import type { VisualSceneGraph } from "@/lib/whiteboard/visualSceneGraph";

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

// ── Speed config ──────────────────────────────────────────────────────────────

const SPEED_DELAY = { slow: 2000, normal: 900, fast: 350 } as const;
type RevealSpeed = keyof typeof SPEED_DELAY;

// ── Shared button / select styles ─────────────────────────────────────────────

const BTN_BASE: React.CSSProperties = {
  fontSize: 11, padding: "3px 9px", borderRadius: 4, cursor: "pointer",
  lineHeight: "16px", userSelect: "none",
};
const BTN_PRIMARY: React.CSSProperties = {
  ...BTN_BASE,
  background: "rgba(134,239,172,0.18)", color: "#86efac",
  border: "1px solid rgba(134,239,172,0.35)",
};
const BTN_MUTED: React.CSSProperties = {
  ...BTN_BASE,
  background: "rgba(148,163,184,0.08)", color: "#94a3b8",
  border: "1px solid rgba(148,163,184,0.2)",
};
const BTN_DISABLED: React.CSSProperties = {
  ...BTN_MUTED, opacity: 0.35, cursor: "default",
};
const SELECT_STYLE: React.CSSProperties = {
  fontSize: 10, padding: "2px 4px", borderRadius: 4, cursor: "pointer",
  background: "rgba(15,23,42,0.95)", color: "#64748b",
  border: "1px solid rgba(148,163,184,0.2)",
};

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  noteCards: NoteCard[];
  pageTitle?: string | null;
  whiteboardGrammar?: string;
  onAnchorClick?: (nodeId: string) => void;
  /** Phase 1: typed scene graph — used in Phase 3 to resolve sourceIds for One Brain sync. */
  vsg?: VisualSceneGraph;
  /** Phase 3: when set, selects and centers on the shape whose sourceId matches. */
  activeAnchorId?: string | null;
}

export default function TldrawCanvas({ noteCards, pageTitle, whiteboardGrammar = "flow", onAnchorClick, vsg, activeAnchorId }: Props) {
  const editorRef = useRef<Editor | null>(null);
  const builtRef  = useRef(false);

  // ── Phase 2 reveal controller state ──────────────────────────────────────
  const [revealIndex, setRevealIndexState] = useState(-1);
  const [isPlaying,   setIsPlaying]        = useState(false);
  const [speed,       setSpeed]            = useState<RevealSpeed>("normal");
  const [narrationText, setNarrationText]  = useState<string | null>(null);
  const [totalShapes,   setTotalShapes]    = useState(0);

  // Refs for stable callbacks (avoid stale closures in timeouts)
  const revealIndexRef    = useRef(-1);
  const orderedShapeIdsRef = useRef<ReturnType<typeof createShapeId>[]>([]);
  const narrationMapRef    = useRef<Map<string, string>>(new Map());

  // ── Phase 3 One Brain sync refs ───────────────────────────────────────────
  // sourceId → tldraw shapeId (for outside→canvas highlight)
  const sourceIdToShapeIdRef = useRef<Map<string, string>>(new Map());
  // tldraw shapeId → sourceId (for canvas→outside click-to-focus)
  const shapeIdToSourceIdRef = useRef<Map<string, string>>(new Map());
  // Stable ref so the store listener never captures a stale onAnchorClick
  const onAnchorClickRef = useRef(onAnchorClick);
  useEffect(() => { onAnchorClickRef.current = onAnchorClick; }, [onAnchorClick]);
  // Store listener unsubscribe handle
  const storeUnsubRef = useRef<(() => void) | null>(null);
  // Latest VSG accessible inside buildShapes without adding it to useCallback deps
  const vsgRef = useRef(vsg);
  useEffect(() => { vsgRef.current = vsg; }, [vsg]);

  // Keep ref in sync with state
  const setRevealIndex = useCallback((n: number) => {
    revealIndexRef.current = n;
    setRevealIndexState(n);
  }, []);

  // ── Build shapes from noteCards ───────────────────────────────────────────
  const buildShapes = useCallback((editor: Editor) => {
    if (!noteCards.length) return;
    editor.selectAll().deleteShapes(editor.getSelectedShapeIds());

    // Reset reveal and One Brain bookkeeping
    orderedShapeIdsRef.current   = [];
    narrationMapRef.current      = new Map();
    sourceIdToShapeIdRef.current = new Map();
    shapeIdToSourceIdRef.current = new Map();

    // Build label→sourceId lookup from VSG when available so clicks use real entry IDs.
    // Falls back to computing the ID from the noteCardsToCanonicalEntries formula.
    const vsgLabelMap = new Map<string, string>(); // normalised label → sourceId
    if (vsgRef.current) {
      for (const node of vsgRef.current.nodes) {
        vsgLabelMap.set(node.label.trim().toLowerCase(), node.sourceId);
      }
    }

    const anchorSourceId = (cardIdx: number, cardTitle: string): string => {
      const key = cardTitle.trim().toLowerCase();
      return vsgLabelMap.get(key)
        ?? `nc_${cardIdx}_${cardTitle.slice(0, 20).replace(/\s+/g, "_")}`;
    };

    const registerAnchor = (sid: ReturnType<typeof createShapeId>, sourceId: string) => {
      sourceIdToShapeIdRef.current.set(sourceId, String(sid));
      shapeIdToSourceIdRef.current.set(String(sid), sourceId);
    };

    let y = 60;
    noteCards.forEach((card, cardIdx) => {
      const tier    = CARD_TYPE_TIER[card.type] ?? "pearl";
      const nodes   = card.visual?.nodes ?? [];
      const arrows  = card.visual?.arrows ?? [];

      if (nodes.length === 0) {
        const sid = createShapeId(`card-${cardIdx}`);
        editor.createShape({
          id: sid, type: "text", x: 100, y, opacity: 0,
          props: { text: card.title + "\n" + card.body.slice(0, 120), size: "s", font: "sans", color: "black" },
        });
        orderedShapeIdsRef.current.push(sid);
        narrationMapRef.current.set(sid, card.body);
        registerAnchor(sid, anchorSourceId(cardIdx, card.title));
        y += 120;
        return;
      }

      const positions = getPositions(nodes.length, whiteboardGrammar);

      nodes.forEach((node, nIdx) => {
        const sid = createShapeId(`n-${cardIdx}-${nIdx}`);
        const pos = positions[nIdx] ?? { x: 100, y: y + nIdx * 110 };
        editor.createShape({
          id: sid, type: "geo", x: pos.x, y: pos.y + y, opacity: 0,
          props: {
            geo: "rectangle", w: 230, h: 56, text: node.label, fill: "solid", size: "s",
            color: tier === "master" ? "yellow" : tier === "step" ? "green"
                 : tier === "danger" ? "red"    : tier === "pearl" ? "light-blue" : "blue",
          },
        });
        orderedShapeIdsRef.current.push(sid);
        // First node of a card gets full card body; subsequent nodes get just their label
        narrationMapRef.current.set(sid, nIdx === 0
          ? (card.title ? `${card.title}\n\n${card.body}` : card.body)
          : node.label,
        );
        // First node is the One Brain anchor for this card
        if (nIdx === 0) registerAnchor(sid, anchorSourceId(cardIdx, card.title));
      });

      arrows.forEach((arrow, aIdx) => {
        const fromIdx = nodes.findIndex(n => n.id === arrow.from);
        const toIdx   = nodes.findIndex(n => n.id === arrow.to);
        if (fromIdx < 0 || toIdx < 0) return;
        const fromPos = positions[fromIdx] ?? { x: 100, y: 0 };
        const toPos   = positions[toIdx]   ?? { x: 100, y: 110 };
        const sid = createShapeId(`a-${cardIdx}-${aIdx}`);
        editor.createShape({
          id: sid, type: "arrow",
          x: fromPos.x + 115 + 100, y: fromPos.y + y + 28, opacity: 0,
          props: {
            start: { type: "point", x: 0, y: 0 },
            end:   { type: "point", x: toPos.x - fromPos.x, y: toPos.y - fromPos.y + 28 },
            text: arrow.label ?? "", size: "s",
            color: tier === "step" ? "green" : tier === "danger" ? "red" : "blue",
          },
        });
        // Arrows reveal after their nodes but carry no narration text
        orderedShapeIdsRef.current.push(sid);
        if (arrow.label) narrationMapRef.current.set(sid, arrow.label);
      });

      y += Math.max(nodes.length, 1) * 110 + 60;
    });

    setTotalShapes(orderedShapeIdsRef.current.length);
    editor.zoomToFit({ duration: 200 });
  }, [noteCards, whiteboardGrammar]);

  const handleMount = useCallback((editor: Editor) => {
    editorRef.current = editor;
    if (!builtRef.current) {
      builtRef.current = true;
      buildShapes(editor);
    }

    // Phase 3: canvas → world. When the user selects exactly one grounded shape,
    // fire onAnchorClick with its sourceId so PDF/left-panel/speech follow.
    storeUnsubRef.current?.();
    storeUnsubRef.current = editor.store.listen(
      () => {
        const selected = editor.getSelectedShapes();
        if (selected.length !== 1) return;
        const sourceId = shapeIdToSourceIdRef.current.get(String(selected[0].id));
        if (sourceId) onAnchorClickRef.current?.(sourceId);
      },
      { scope: "session", source: "user" },
    );
  }, [buildShapes]);

  // Unsubscribe store listener on unmount
  useEffect(() => () => { storeUnsubRef.current?.(); }, []);

  // Rebuild when noteCards change; reset controller state
  useEffect(() => {
    builtRef.current = false;
    if (editorRef.current) {
      builtRef.current = true;
      buildShapes(editorRef.current);
    }
    setRevealIndex(-1);
    setNarrationText(null);
    setIsPlaying(false);
  }, [noteCards, buildShapes, setRevealIndex]);

  // ── Reveal controller actions ─────────────────────────────────────────────

  const handleNext = useCallback(() => {
    const editor  = editorRef.current;
    if (!editor) return;
    const ordered   = orderedShapeIdsRef.current;
    const nextIndex = revealIndexRef.current + 1;
    if (nextIndex >= ordered.length) { setIsPlaying(false); return; }
    const sid   = ordered[nextIndex];
    const shape = editor.getShape(sid);
    if (shape) editor.updateShape({ id: sid, type: shape.type, opacity: 1 });
    setRevealIndex(nextIndex);
    setNarrationText(narrationMapRef.current.get(sid) ?? null);
  }, [setRevealIndex]);

  const handlePrev = useCallback(() => {
    const editor   = editorRef.current;
    if (!editor) return;
    const ordered  = orderedShapeIdsRef.current;
    const currIdx  = revealIndexRef.current;
    if (currIdx < 0) return;
    const sid   = ordered[currIdx];
    const shape = editor.getShape(sid);
    if (shape) editor.updateShape({ id: sid, type: shape.type, opacity: 0 });
    const prevIdx = currIdx - 1;
    setRevealIndex(prevIdx);
    const prevNarration = prevIdx >= 0 ? (narrationMapRef.current.get(ordered[prevIdx]) ?? null) : null;
    setNarrationText(prevNarration);
    setIsPlaying(false);
  }, [setRevealIndex]);

  const handleRestart = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.getCurrentPageShapes().forEach(s => {
      if (s.opacity > 0) editor.updateShape({ id: s.id, type: s.type, opacity: 0 });
    });
    setRevealIndex(-1);
    setNarrationText(null);
    setIsPlaying(true);
  }, [setRevealIndex]);

  const handleRevealAll = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.getCurrentPageShapes().forEach(s => {
      if (s.opacity === 0) editor.updateShape({ id: s.id, type: s.type, opacity: 1 });
    });
    setRevealIndex(orderedShapeIdsRef.current.length - 1);
    setNarrationText(null);
    setIsPlaying(false);
  }, [setRevealIndex]);

  // Auto-play timer
  useEffect(() => {
    if (!isPlaying) return;
    const t = window.setTimeout(handleNext, SPEED_DELAY[speed]);
    return () => clearTimeout(t);
  }, [isPlaying, revealIndex, speed, handleNext]);

  // Phase 3: world → canvas. When the reading focus changes externally
  // (PDF click, left-panel selection, speech), select the matching shape
  // and pan the viewport to center on it without forcing a zoom change.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (!activeAnchorId) {
      editor.selectNone();
      return;
    }
    const sid = sourceIdToShapeIdRef.current.get(activeAnchorId);
    if (!sid) return;
    const shape = editor.getShape(sid as ReturnType<typeof createShapeId>);
    if (!shape) return;
    editor.select(sid as ReturnType<typeof createShapeId>);
    const bounds = editor.getShapePageBounds(sid as ReturnType<typeof createShapeId>);
    if (bounds) {
      editor.centerOnPoint({ x: bounds.midX, y: bounds.midY }, { duration: 300 });
    }
  }, [activeAnchorId]);

  // ── Render ────────────────────────────────────────────────────────────────

  const atStart = revealIndex < 0;
  const atEnd   = totalShapes > 0 && revealIndex >= totalShapes - 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 480, background: "#0f172a" }}>

      {/* ── Controls bar ──────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)", flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "#94a3b8", fontFamily: "monospace", flexShrink: 0 }}>
          {pageTitle ?? "Whiteboard"}
        </span>

        <span style={{ marginLeft: "auto", display: "flex", gap: 5, alignItems: "center" }}>
          {/* Progress counter */}
          {totalShapes > 0 && (
            <span style={{ fontSize: 10, color: "#475569", fontVariantNumeric: "tabular-nums", marginRight: 2 }}>
              {Math.max(revealIndex + 1, 0)} / {totalShapes}
            </span>
          )}

          {/* ⏮ Restart */}
          <button onClick={handleRestart} title="Restart from beginning" style={BTN_MUTED}>
            ⏮
          </button>

          {/* ◀ Previous */}
          <button
            onClick={handlePrev}
            disabled={atStart}
            title="Previous"
            style={atStart ? BTN_DISABLED : BTN_MUTED}
          >
            ◀
          </button>

          {/* ▶ / ⏸ Play / Pause */}
          <button
            onClick={() => setIsPlaying(p => !p)}
            style={BTN_PRIMARY}
          >
            {isPlaying ? "⏸ Pause" : "▶ Play"}
          </button>

          {/* ▶ Next */}
          <button
            onClick={handleNext}
            disabled={atEnd}
            title="Next"
            style={atEnd ? BTN_DISABLED : BTN_MUTED}
          >
            ▶
          </button>

          {/* Show all */}
          <button onClick={handleRevealAll} title="Reveal all shapes" style={BTN_MUTED}>
            All
          </button>

          {/* Speed */}
          <select
            value={speed}
            onChange={e => setSpeed(e.target.value as RevealSpeed)}
            style={SELECT_STYLE}
            title="Reveal speed"
          >
            <option value="slow">Slow</option>
            <option value="normal">Normal</option>
            <option value="fast">Fast</option>
          </select>
        </span>
      </div>

      {/* ── Narration panel ───────────────────────────────────────────────── */}
      {narrationText && (
        <div style={{
          padding: "8px 14px",
          background: "rgba(15,23,42,0.97)",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          fontSize: 12,
          color: "#cbd5e1",
          lineHeight: 1.6,
          maxHeight: 76,
          overflowY: "auto",
        }}>
          {narrationText}
        </div>
      )}

      {/* ── Canvas ────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, position: "relative" }}>
        <Tldraw
          onMount={handleMount}
          hideUi={false}
        />
      </div>
    </div>
  );
}
