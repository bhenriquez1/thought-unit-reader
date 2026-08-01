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
// Phase 3 — One Brain sync:
//   canvas→world: clicking a grounded shape fires onAnchorClick with its sourceId
//   world→canvas: activeAnchorId prop selects and centers on the matching shape
//
// Phase 4 — Persistence + export:
//   Canvas snapshots saved to localStorage under SNAP_PREFIX+storageKey,
//   restored on next mount to preserve student annotations across navigation.
//   SVG export button exports the current canvas as a downloadable file.
//
// Design contract:
//   - Same 5-tier Avrrio colors as VisualSceneEngine
//   - `whiteboardGrammar` prop biases initial node positions toward the
//     domain's natural visual form (hub-spoke for anatomy/law, flow for rest)
//   - All shapes carry deterministic IDs for snapshot reconciliation

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
void TIER_COLORS; // referenced indirectly via CARD_TYPE_TIER

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

// ── Constants ─────────────────────────────────────────────────────────────────

// localStorage key prefix for persisted canvas snapshots (Phase 4)
const SNAP_PREFIX = "wb_canvas_";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  noteCards: NoteCard[];
  pageTitle?: string | null;
  whiteboardGrammar?: string;
  onAnchorClick?: (nodeId: string) => void;
  /** Phase 1: typed scene graph — used in Phase 3 to resolve sourceIds for One Brain sync. */
  vsg?: VisualSceneGraph;
  /** Phase 3: when set, selects and centers on the shape whose sourceId matches. */
  activeAnchorId?: string | null;
  /** Phase 4: when provided, the canvas snapshot is saved to localStorage under this key
   *  and restored on the next mount — preserving student annotations across navigation. */
  storageKey?: string;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TldrawCanvas({
  noteCards, pageTitle, whiteboardGrammar = "flow",
  onAnchorClick, vsg, activeAnchorId, storageKey,
}: Props) {
  const editorRef = useRef<Editor | null>(null);
  const builtRef  = useRef(false);

  // ── Phase 2 reveal controller state ──────────────────────────────────────
  const [revealIndex, setRevealIndexState] = useState(-1);
  const [isPlaying,   setIsPlaying]        = useState(false);
  const [speed,       setSpeed]            = useState<RevealSpeed>("normal");
  const [narrationText, setNarrationText]  = useState<string | null>(null);
  const [totalShapes,   setTotalShapes]    = useState(0);

  // Refs for stable callbacks (avoid stale closures in timeouts)
  const revealIndexRef     = useRef(-1);
  const orderedShapeIdsRef = useRef<ReturnType<typeof createShapeId>[]>([]);
  const narrationMapRef    = useRef<Map<string, string>>(new Map());

  // ── Phase 3 One Brain sync refs ───────────────────────────────────────────
  const sourceIdToShapeIdRef = useRef<Map<string, string>>(new Map());
  const shapeIdToSourceIdRef = useRef<Map<string, string>>(new Map());
  const onAnchorClickRef     = useRef(onAnchorClick);
  useEffect(() => { onAnchorClickRef.current = onAnchorClick; }, [onAnchorClick]);
  const storeUnsubRef = useRef<(() => void) | null>(null);
  const vsgRef        = useRef(vsg);
  useEffect(() => { vsgRef.current = vsg; }, [vsg]);

  // ── Phase 4 persistence refs ──────────────────────────────────────────────
  const noteCardsRef    = useRef(noteCards);
  const storageKeyRef   = useRef(storageKey);
  useEffect(() => { noteCardsRef.current = noteCards; }, [noteCards]);
  useEffect(() => { storageKeyRef.current = storageKey; }, [storageKey]);
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveUnsubRef    = useRef<(() => void) | null>(null);

  // ── Keep revealIndex ref in sync with state ───────────────────────────────
  const setRevealIndex = useCallback((n: number) => {
    revealIndexRef.current = n;
    setRevealIndexState(n);
  }, []);

  // ── Shared anchor helpers (used by buildShapes and rebuildRefsFromCards) ──

  const makeVsgLabelMap = useCallback((): Map<string, string> => {
    const m = new Map<string, string>();
    if (vsgRef.current) {
      for (const node of vsgRef.current.nodes) {
        m.set(node.label.trim().toLowerCase(), node.sourceId);
      }
    }
    return m;
  }, []); // only reads the vsgRef

  const makeAnchorSourceId = useCallback(
    (labelMap: Map<string, string>, cardIdx: number, cardTitle: string): string => {
      const key = cardTitle.trim().toLowerCase();
      return labelMap.get(key)
        ?? `nc_${cardIdx}_${cardTitle.slice(0, 20).replace(/\s+/g, "_")}`;
    },
    [],
  );

  // ── Build shapes from noteCards (fresh canvas) ───────────────────────────
  const buildShapes = useCallback((editor: Editor) => {
    if (!noteCards.length) return;
    editor.selectAll().deleteShapes(editor.getSelectedShapeIds());

    orderedShapeIdsRef.current   = [];
    narrationMapRef.current      = new Map();
    sourceIdToShapeIdRef.current = new Map();
    shapeIdToSourceIdRef.current = new Map();

    const vsgLabelMap = makeVsgLabelMap();

    const registerAnchor = (sid: ReturnType<typeof createShapeId>, sourceId: string) => {
      sourceIdToShapeIdRef.current.set(sourceId, String(sid));
      shapeIdToSourceIdRef.current.set(String(sid), sourceId);
    };

    let y = 60;
    noteCards.forEach((card, cardIdx) => {
      const tier   = CARD_TYPE_TIER[card.type] ?? "pearl";
      const nodes  = card.visual?.nodes ?? [];
      const arrows = card.visual?.arrows ?? [];
      const anchorId = makeAnchorSourceId(vsgLabelMap, cardIdx, card.title);

      if (nodes.length === 0) {
        const sid = createShapeId(`card-${cardIdx}`);
        editor.createShape({
          id: sid, type: "geo", x: 80, y,
          props: {
            geo: "rectangle", w: 300, h: 68,
            text: card.title ? `${card.title}\n${card.body.slice(0, 100)}` : card.body.slice(0, 100),
            fill: "solid", size: "s",
            color: tier === "master" ? "yellow" : tier === "step" ? "green"
                 : tier === "danger" ? "red"    : tier === "pearl" ? "light-blue" : "blue",
          },
        } as any);
        editor.updateShape({ id: sid, type: "geo", opacity: 0 });
        orderedShapeIdsRef.current.push(sid);
        narrationMapRef.current.set(sid, card.body);
        registerAnchor(sid, anchorId);
        y += 90;
        return;
      }

      const positions = getPositions(nodes.length, whiteboardGrammar);

      nodes.forEach((node, nIdx) => {
        const sid = createShapeId(`n-${cardIdx}-${nIdx}`);
        const pos = positions[nIdx] ?? { x: 100, y: y + nIdx * 110 };
        editor.createShape({
          id: sid, type: "geo", x: pos.x, y: pos.y + y,
          props: {
            geo: "rectangle", w: 230, h: 56, text: node.label, fill: "solid", size: "s",
            color: tier === "master" ? "yellow" : tier === "step"   ? "green"
                 : tier === "danger" ? "red"    : tier === "pearl"  ? "light-blue" : "blue",
          },
        } as any);
        editor.updateShape({ id: sid, type: "geo", opacity: 0 });
        orderedShapeIdsRef.current.push(sid);
        narrationMapRef.current.set(sid, nIdx === 0
          ? (card.title ? `${card.title}\n\n${card.body}` : card.body)
          : node.label,
        );
        if (nIdx === 0) registerAnchor(sid, anchorId);
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
          x: fromPos.x + 115 + 100, y: fromPos.y + y + 28,
          props: {
            start: { type: "point", x: 0, y: 0 },
            end:   { type: "point", x: toPos.x - fromPos.x, y: toPos.y - fromPos.y + 28 },
            text: arrow.label ?? "", size: "s",
            color: tier === "step" ? "green" : tier === "danger" ? "red" : "blue",
          },
        } as any);
        editor.updateShape({ id: sid, type: "arrow", opacity: 0 });
        orderedShapeIdsRef.current.push(sid);
        if (arrow.label) narrationMapRef.current.set(sid, arrow.label);
      });

      y += Math.max(nodes.length, 1) * 110 + 60;
    });

    setTotalShapes(orderedShapeIdsRef.current.length);
    editor.zoomToFit();
  }, [noteCards, whiteboardGrammar, makeVsgLabelMap, makeAnchorSourceId]);

  // ── Rebuild index refs from noteCards without touching the canvas ─────────
  // Used after restoring a saved snapshot so the reveal controller still works.
  const rebuildRefsFromCards = useCallback((cards: NoteCard[]) => {
    orderedShapeIdsRef.current   = [];
    narrationMapRef.current      = new Map();
    sourceIdToShapeIdRef.current = new Map();
    shapeIdToSourceIdRef.current = new Map();

    const vsgLabelMap = makeVsgLabelMap();

    const registerAnchor = (sid: ReturnType<typeof createShapeId>, sourceId: string) => {
      sourceIdToShapeIdRef.current.set(sourceId, String(sid));
      shapeIdToSourceIdRef.current.set(String(sid), sourceId);
    };

    cards.forEach((card, cardIdx) => {
      const nodes  = card.visual?.nodes ?? [];
      const arrows = card.visual?.arrows ?? [];
      const anchorId = makeAnchorSourceId(vsgLabelMap, cardIdx, card.title);

      if (nodes.length === 0) {
        const sid = createShapeId(`card-${cardIdx}`);
        orderedShapeIdsRef.current.push(sid);
        narrationMapRef.current.set(sid, card.body);
        registerAnchor(sid, anchorId);
        return;
      }

      nodes.forEach((node, nIdx) => {
        const sid = createShapeId(`n-${cardIdx}-${nIdx}`);
        orderedShapeIdsRef.current.push(sid);
        narrationMapRef.current.set(sid, nIdx === 0
          ? (card.title ? `${card.title}\n\n${card.body}` : card.body)
          : node.label);
        if (nIdx === 0) registerAnchor(sid, anchorId);
      });

      arrows.forEach((arrow, aIdx) => {
        const sid = createShapeId(`a-${cardIdx}-${aIdx}`);
        orderedShapeIdsRef.current.push(sid);
        if (arrow.label) narrationMapRef.current.set(sid, arrow.label);
      });
    });

    setTotalShapes(orderedShapeIdsRef.current.length);
  }, [makeVsgLabelMap, makeAnchorSourceId]);

  // ── Mount handler ─────────────────────────────────────────────────────────
  const handleMount = useCallback((editor: Editor) => {
    editorRef.current = editor;

    // Phase 4: try to restore a saved snapshot before building from scratch
    const key = storageKeyRef.current;
    let restored = false;
    if (key) {
      try {
        const saved = localStorage.getItem(SNAP_PREFIX + key);
        if (saved) {
          const snapshot = JSON.parse(saved);
          editor.loadSnapshot(snapshot);
          // Rebuild ordered refs from current noteCards so reveal controller works
          rebuildRefsFromCards(noteCardsRef.current);
          builtRef.current = true;
          restored = true;
        }
      } catch {
        // malformed or incompatible snapshot — fall through to fresh build
      }
    }

    if (!restored && !builtRef.current) {
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

    // Phase 4: auto-save on user-initiated document changes (debounced 1.5 s)
    saveUnsubRef.current?.();
    if (key) {
      saveUnsubRef.current = editor.store.listen(
        () => {
          if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
          saveDebounceRef.current = setTimeout(() => {
            try {
              const snap = editor.getSnapshot();
              localStorage.setItem(SNAP_PREFIX + key, JSON.stringify(snap));
            } catch {
              // quota exceeded or private browsing — silently ignore
            }
          }, 1500);
        },
        { scope: "document", source: "user" },
      );
    }
  }, [buildShapes, rebuildRefsFromCards]);

  // Cleanup all store listeners and pending debounce on unmount
  useEffect(() => () => {
    storeUnsubRef.current?.();
    saveUnsubRef.current?.();
    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
  }, []);

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
    const editor  = editorRef.current;
    if (!editor) return;
    const ordered = orderedShapeIdsRef.current;
    const currIdx = revealIndexRef.current;
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
      editor.centerOnPoint({ x: bounds.midX, y: bounds.midY });
    }
  }, [activeAnchorId]);

  // Phase 4: SVG export
  const handleExport = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) return;
    try {
      const shapeIds = [...editor.getCurrentPageShapeIds()];
      if (!shapeIds.length) return;
      // getSvgString is the stable tldraw v2 export API (returns { svg: string })
      const result = await (editor as any).getSvgString(shapeIds, { background: false });
      const svgStr: string | undefined = typeof result === "string" ? result : result?.svg;
      if (!svgStr) return;
      const blob = new Blob([svgStr], { type: "image/svg+xml" });
      const url  = URL.createObjectURL(blob);
      const a    = Object.assign(document.createElement("a"), {
        href: url,
        download: `${storageKeyRef.current ?? "whiteboard"}.svg`,
      });
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // export not supported in this environment — silently ignore
    }
  }, []);

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

          {/* Export SVG (Phase 4) */}
          <button onClick={handleExport} title="Export canvas as SVG" style={BTN_MUTED}>
            ↓ SVG
          </button>
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
        {/* Loading skeleton — shown while VSG/noteCards haven't arrived yet */}
        {noteCards.length === 0 && (
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            background: "rgba(15,23,42,0.88)", zIndex: 10, gap: 16,
          }}>
            <span style={{ fontSize: 13, color: "#94a3b8", fontFamily: "ui-monospace, monospace", letterSpacing: "0.04em" }}>
              Preparing visual lesson…
            </span>
            {/* Ghost skeleton shapes */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center", opacity: 0.35 }}>
              {[280, 220, 250].map((w, i) => (
                <div key={i} style={{
                  width: w, height: 52, borderRadius: 8,
                  background: "linear-gradient(90deg, #1e293b 25%, #334155 50%, #1e293b 75%)",
                  backgroundSize: "200% 100%",
                  animation: "wb-shimmer 1.4s ease-in-out infinite",
                  animationDelay: `${i * 0.2}s`,
                }} />
              ))}
            </div>
            <style>{`@keyframes wb-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
          </div>
        )}
      </div>
    </div>
  );
}
