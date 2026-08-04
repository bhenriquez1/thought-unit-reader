"use client";
// components/whiteboard/TldrawCanvas.tsx
// Interactive tldraw whiteboard canvas — the Avrrio Visual Reasoning Engine.
//
// One always-fully-populated, editable canvas. No slideshow/reveal mode, no
// Student/Instructor toggle — those were removed because they added UI
// surface without adding teaching value: a diagram the student has to click
// "Next" through isn't more understandable than the same diagram shown whole.
// The canvas opens already constructed — nodes, connectors, and labels all
// visible immediately — because the VisualSceneGraph it renders already
// encodes structure (see lib/whiteboard/visualSceneGraph.ts and
// lib/whiteboard/canonicalRelationshipGraph.ts): every node is a complete,
// non-truncated teaching statement, and every edge is a real inferred
// relationship (never a floating, disconnected box).
//
// Architecture: two integrated phases
//   Phase 1  Shape → Reader sync   clicking a shape sets readingFocusStore
//   Phase 2  VSG-first rendering   uses VisualSceneGraph node positions + edge kinds

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Tldraw, createShapeId, toRichText, type Editor } from "@tldraw/tldraw";
import "@tldraw/tldraw/tldraw.css";
import type { NoteCard } from "@/lib/insights/synthesizeTeachingOutput";
import type { VisualSceneGraph } from "@/lib/whiteboard/visualSceneGraph";
import { vsgToShapeDefs, type ShapeDef } from "@/lib/whiteboard/sceneGraphAdapter";
import { useReadingFocusStore } from "@/lib/readingFocus/readingFocusStore";

// ── Tier colors ───────────────────────────────────────────────────────────────
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

// ── Shared styles ─────────────────────────────────────────────────────────────
const BTN_MUTED: React.CSSProperties = {
  fontSize: 11, padding: "3px 9px", borderRadius: 4, cursor: "pointer",
  lineHeight: "16px", userSelect: "none",
  background: "rgba(148,163,184,0.08)", color: "#94a3b8",
  border: "1px solid rgba(148,163,184,0.2)",
};

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  noteCards:        NoteCard[];
  pageTitle?:       string | null;
  whiteboardGrammar?: string;
  onAnchorClick?:   (nodeId: string) => void;
  vsg?:             VisualSceneGraph;
  activeAnchorId?:  string | null;
  storageKey?:      string;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TldrawCanvas({
  noteCards, pageTitle, whiteboardGrammar = "flow",
  onAnchorClick, vsg, activeAnchorId, storageKey,
}: Props) {
  // tldraw SDK license — required for production deployments, set via Render env var.
  // Never hardcoded/committed; missing in production shows a visible configuration
  // error instead of tldraw's own (easy-to-miss) watermark warning.
  const licenseKey = process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY;
  const licenseMissingInProduction = process.env.NODE_ENV === "production" && !licenseKey;

  // Safe diagnostics — presence/shape only, never the key itself, so this is
  // safe to leave in production logs when debugging a "configuration
  // unavailable" report.
  useEffect(() => {
    console.log("[WHITEBOARD_LICENSE_DIAGNOSTIC]", {
      licenseConfigured:    Boolean(licenseKey),
      licensePrefixPresent: licenseKey?.startsWith("tldraw-") ?? false,
      nodeEnv:              process.env.NODE_ENV,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // canvasInitFailure: uncaught-exception guard for the imperative shape-build
  // path (buildShapes → vsgToShapeDefs/editor.createShape). Nothing wraps this
  // component in a React ErrorBoundary, so without this try/catch a bad VSG or
  // a tldraw API error during shape creation would propagate uncaught. VSG
  // Zod-validation failures are already caught upstream (computeVSGState in
  // visualSceneGraph.ts only ever hands this component a validated vsg or
  // undefined) — this catches failures in the CONVERSION/CREATION step, which
  // is not covered by that upstream validation.
  const [canvasInitFailure, setCanvasInitFailure] = useState<string | null>(null);

  const editorRef  = useRef<Editor | null>(null);
  const builtRef   = useRef(false);

  // Phase 1 + Phase 1 One Brain sync refs
  const sourceIdToShapeIdRef = useRef<Map<string, string>>(new Map());
  const shapeIdToSourceIdRef = useRef<Map<string, string>>(new Map());
  const onAnchorClickRef     = useRef(onAnchorClick);
  useEffect(() => { onAnchorClickRef.current = onAnchorClick; }, [onAnchorClick]);
  const storeUnsubRef = useRef<(() => void) | null>(null);
  const vsgRef        = useRef(vsg);
  useEffect(() => { vsgRef.current = vsg; }, [vsg]);

  // Stable refs for use in export filename and mount-time ref rebuilding
  const noteCardsRef  = useRef(noteCards);
  const storageKeyRef = useRef(storageKey);
  useEffect(() => { noteCardsRef.current = noteCards; }, [noteCards]);
  useEffect(() => { storageKeyRef.current = storageKey; }, [storageKey]);

  // ── Phase 2: VSG-first shape building ─────────────────────────────────────
  // Shapes are created at full (default) opacity — the canvas opens already
  // populated with the complete diagram, never a hidden-then-revealed sequence.

  const registerAnchors = useCallback((defs: ShapeDef[]) => {
    for (const def of defs) {
      if (def.sourceId) {
        sourceIdToShapeIdRef.current.set(def.sourceId, String(def.id));
        shapeIdToSourceIdRef.current.set(String(def.id), def.sourceId);
      }
    }
  }, []);

  const buildShapesFromVSGDefs = useCallback((editor: Editor, defs: ShapeDef[]) => {
    editor.selectAll().deleteShapes(editor.getSelectedShapeIds());
    sourceIdToShapeIdRef.current  = new Map();
    shapeIdToSourceIdRef.current  = new Map();

    for (const def of defs) {
      editor.createShape({ id: def.id, type: def.type, x: def.x, y: def.y, props: def.props } as any);
    }
    registerAnchors(defs);
    editor.zoomToFit();
  }, [registerAnchors]);

  const rebuildRefsFromVSGDefs = useCallback((defs: ShapeDef[]) => {
    sourceIdToShapeIdRef.current  = new Map();
    shapeIdToSourceIdRef.current  = new Map();
    registerAnchors(defs);
  }, [registerAnchors]);

  // ── Shared anchor helpers for noteCards fallback ──────────────────────────

  const makeVsgLabelMap = useCallback((): Map<string, string> => {
    const m = new Map<string, string>();
    if (vsgRef.current) {
      for (const node of vsgRef.current.nodes) {
        m.set(node.label.trim().toLowerCase(), node.sourceId);
      }
    }
    return m;
  }, []);

  const makeAnchorSourceId = useCallback(
    (labelMap: Map<string, string>, cardIdx: number, cardTitle: string): string => {
      const key = cardTitle.trim().toLowerCase();
      return labelMap.get(key) ?? `nc_${cardIdx}_${cardTitle.slice(0, 20).replace(/\s+/g, "_")}`;
    },
    [],
  );

  // ── NoteCards fallback builder ─────────────────────────────────────────────

  const buildShapesFromNoteCards = useCallback((editor: Editor) => {
    if (!noteCards.length) return;
    editor.selectAll().deleteShapes(editor.getSelectedShapeIds());
    sourceIdToShapeIdRef.current = new Map();
    shapeIdToSourceIdRef.current = new Map();

    const vsgLabelMap = makeVsgLabelMap();
    const registerAnchor = (sid: ReturnType<typeof createShapeId>, sourceId: string) => {
      sourceIdToShapeIdRef.current.set(sourceId, String(sid));
      shapeIdToSourceIdRef.current.set(String(sid), sourceId);
    };

    let y = 60;
    noteCards.forEach((card, cardIdx) => {
      const tier     = CARD_TYPE_TIER[card.type] ?? "pearl";
      const nodes    = card.visual?.nodes ?? [];
      const arrows   = card.visual?.arrows ?? [];
      const anchorId = makeAnchorSourceId(vsgLabelMap, cardIdx, card.title);

      if (nodes.length === 0) {
        const sid = createShapeId(`card-${cardIdx}`);
        editor.createShape({
          id: sid, type: "geo", x: 80, y,
          props: {
            geo:      "rectangle", w: 300, h: 68,
            richText: toRichText(card.title ? `${card.title}\n${card.body.slice(0, 100)}` : card.body.slice(0, 100)),
            fill:     "solid", size: "s",
            color: tier === "master" ? "yellow" : tier === "step" ? "green"
                 : tier === "danger" ? "red"    : tier === "pearl" ? "light-blue" : "blue",
          },
        } as any);
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
            geo: "rectangle", w: 230, h: 56, richText: toRichText(node.label), fill: "solid", size: "s",
            color: tier === "master" ? "yellow" : tier === "step"  ? "green"
                 : tier === "danger" ? "red"    : tier === "pearl" ? "light-blue" : "blue",
          },
        } as any);
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
            kind:     "arc",
            start:    { x: 0, y: 0 },
            end:      { x: toPos.x - fromPos.x, y: toPos.y - fromPos.y + 28 },
            richText: toRichText(arrow.label ?? ""),
            size:     "s",
            color: tier === "step" ? "green" : tier === "danger" ? "red" : "blue",
          },
        } as any);
      });

      y += Math.max(nodes.length, 1) * 110 + 60;
    });

    editor.zoomToFit();
  }, [noteCards, whiteboardGrammar, makeVsgLabelMap, makeAnchorSourceId]);

  const rebuildRefsFromNoteCards = useCallback((cards: NoteCard[]) => {
    sourceIdToShapeIdRef.current = new Map();
    shapeIdToSourceIdRef.current = new Map();
    const vsgLabelMap = makeVsgLabelMap();
    const registerAnchor = (sid: ReturnType<typeof createShapeId>, sourceId: string) => {
      sourceIdToShapeIdRef.current.set(sourceId, String(sid));
      shapeIdToSourceIdRef.current.set(String(sid), sourceId);
    };
    cards.forEach((card, cardIdx) => {
      const nodes  = card.visual?.nodes ?? [];
      const anchorId = makeAnchorSourceId(vsgLabelMap, cardIdx, card.title);
      if (nodes.length === 0) {
        const sid = createShapeId(`card-${cardIdx}`);
        registerAnchor(sid, anchorId);
        return;
      }
      nodes.forEach((node, nIdx) => {
        const sid = createShapeId(`n-${cardIdx}-${nIdx}`);
        if (nIdx === 0) registerAnchor(sid, anchorId);
      });
    });
  }, [makeVsgLabelMap, makeAnchorSourceId]);

  // ── Unified buildShapes: VSG first, noteCards fallback ────────────────────
  const buildShapes = useCallback((editor: Editor) => {
    try {
      const v = vsgRef.current;
      if (v && v.nodes.length > 0) {
        buildShapesFromVSGDefs(editor, vsgToShapeDefs(v));
      } else {
        buildShapesFromNoteCards(editor);
      }
      setCanvasInitFailure(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[WHITEBOARD_CANVAS_INIT_FAILURE]", message);
      setCanvasInitFailure(message);
    }
  }, [buildShapesFromVSGDefs, buildShapesFromNoteCards]);

  // ── Mount handler ─────────────────────────────────────────────────────────
  const handleMount = useCallback((editor: Editor) => {
    editorRef.current = editor;

    if (!builtRef.current) {
      builtRef.current = true;
      if (editor.getCurrentPageShapes().length > 0) {
        // tldraw restored shapes from IndexedDB via persistenceKey — rebuild ref maps only
        const v = vsgRef.current;
        if (v && v.nodes.length > 0) {
          rebuildRefsFromVSGDefs(vsgToShapeDefs(v));
        } else {
          rebuildRefsFromNoteCards(noteCardsRef.current);
        }
      } else {
        buildShapes(editor);
      }
    }

    // Phase 1 One Brain sync: canvas → world
    storeUnsubRef.current?.();
    storeUnsubRef.current = editor.store.listen(
      () => {
        const selected = editor.getSelectedShapes();
        if (selected.length !== 1) return;
        const sourceId = shapeIdToSourceIdRef.current.get(String(selected[0].id));
        if (sourceId) {
          onAnchorClickRef.current?.(sourceId);
          useReadingFocusStore.getState().setThoughtUnit(sourceId);
        }
      },
      { scope: "session", source: "user" },
    );
  }, [buildShapes, rebuildRefsFromVSGDefs, rebuildRefsFromNoteCards]);

  // Cleanup on unmount
  useEffect(() => () => {
    storeUnsubRef.current?.();
  }, []);

  // Single rebuild effect — VSG-first, noteCards fallback.
  // One effect prevents the double-build race where both noteCards and vsg
  // change simultaneously (e.g. on page navigation), which would previously
  // cause two sequential deleteShapes + createShapes cycles.
  useEffect(() => {
    vsgRef.current = vsg;
    builtRef.current = false;
    const editor = editorRef.current;
    if (editor) {
      builtRef.current = true;
      buildShapes(editor);
    }
  }, [noteCards, vsg, buildShapes]);

  // Phase 1 world→canvas: external anchor focus → select + center shape
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (!activeAnchorId) { editor.selectNone(); return; }
    const sid = sourceIdToShapeIdRef.current.get(activeAnchorId);
    if (!sid) return;
    const shape = editor.getShape(sid as ReturnType<typeof createShapeId>);
    if (!shape) return;
    editor.select(sid as ReturnType<typeof createShapeId>);
    const bounds = editor.getShapePageBounds(sid as ReturnType<typeof createShapeId>);
    if (bounds) editor.centerOnPoint({ x: bounds.midX, y: bounds.midY });
  }, [activeAnchorId]);

  // SVG export
  const handleExport = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) return;
    try {
      const shapeIds = [...editor.getCurrentPageShapeIds()];
      if (!shapeIds.length) return;
      const result = await (editor as any).getSvgString(shapeIds, { background: false });
      const svgStr: string | undefined = typeof result === "string" ? result : result?.svg;
      if (!svgStr) return;
      const blob = new Blob([svgStr], { type: "image/svg+xml" });
      const url  = URL.createObjectURL(blob);
      const a    = Object.assign(document.createElement("a"), {
        href: url, download: `${storageKeyRef.current ?? "whiteboard"}.svg`,
      });
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // export not supported — silently ignore
    }
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 480, background: "#0f172a" }}>

      {/* ── Header bar ────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)", flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "#94a3b8", fontFamily: "monospace", flexShrink: 0 }}>
          {pageTitle ?? "Whiteboard"}
        </span>
        <span style={{ marginLeft: "auto" }}>
          <button onClick={handleExport} title="Export SVG" style={BTN_MUTED}>&#x2193; SVG</button>
        </span>
      </div>

      {/* ── Canvas ────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, position: "relative" }}>
        {licenseMissingInProduction ? (
          <div
            role="alert"
            style={{
              position: "absolute", inset: 0, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 8,
              background: "#0f172a", color: "#94a3b8", fontFamily: "ui-monospace, monospace",
              fontSize: 13, textAlign: "center", padding: 24,
            }}
          >
            <span style={{ fontSize: 20 }}>⚠</span>
            <span>Whiteboard configuration is unavailable. Missing: tldraw license key.</span>
          </div>
        ) : (
          <Tldraw
            licenseKey={licenseKey}
            persistenceKey={storageKey || undefined}
            onMount={handleMount}
          />
        )}

        {/* Canvas initialization failure — the shape-build step threw (bad VSG
            shape conversion or a tldraw API error). Distinct from the license
            gate above: the canvas itself mounted fine, but couldn't populate.
            Overlaid on top of the (blank but functional) mounted canvas rather
            than replacing it, so the user still has a usable — if empty —
            whiteboard to draw on manually. */}
        {!licenseMissingInProduction && canvasInitFailure && (
          <div
            role="alert"
            style={{
              position: "absolute", inset: 0, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 8, zIndex: 20,
              background: "rgba(15,23,42,0.92)", color: "#94a3b8", fontFamily: "ui-monospace, monospace",
              fontSize: 13, textAlign: "center", padding: 24, pointerEvents: "none",
            }}
          >
            <span style={{ fontSize: 20 }}>⚠</span>
            <span>Whiteboard configuration is unavailable. Canvas initialization failed.</span>
          </div>
        )}

        {/* Loading skeleton */}
        {!licenseMissingInProduction && noteCards.length === 0 && (!vsg || vsg.nodes.length === 0) && (
          <div style={{
            position: "absolute", inset: 0, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            background: "rgba(15,23,42,0.88)", zIndex: 10, gap: 16,
          }}>
            <span style={{ fontSize: 13, color: "#94a3b8", fontFamily: "ui-monospace, monospace" }}>
              Preparing visual lesson&hellip;
            </span>
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
