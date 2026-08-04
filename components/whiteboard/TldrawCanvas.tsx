"use client";
// components/whiteboard/TldrawCanvas.tsx
// Interactive tldraw whiteboard canvas — the Avrrio Visual Reasoning Engine.
//
// Architecture: four integrated phases
//   Phase 1  Shape → Reader sync   clicking a shape sets readingFocusStore
//   Phase 2  VSG-first rendering   uses VisualSceneGraph node positions + edge kinds
//   Phase 3  Student toolbar       minimal 10-tool overlay when studentMode=true
//   Phase 4  Progressive reveal    play/pause/step with Web Speech narration

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Tldraw, createShapeId, toRichText, GeoShapeGeoStyle, type Editor } from "@tldraw/tldraw";
import "@tldraw/tldraw/tldraw.css";
import type { NoteCard } from "@/lib/insights/synthesizeTeachingOutput";
import type { VisualSceneGraph } from "@/lib/whiteboard/visualSceneGraph";
import { vsgToShapeDefs, type ShapeDef } from "@/lib/whiteboard/sceneGraphAdapter";
import { NarrationController } from "./NarrationController";
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

// ── Speed config ──────────────────────────────────────────────────────────────
const SPEED_DELAY = { slow: 2000, normal: 900, fast: 350 } as const;
type RevealSpeed = keyof typeof SPEED_DELAY;

// ── Shared styles ─────────────────────────────────────────────────────────────
const BTN_BASE: React.CSSProperties = {
  fontSize: 11, padding: "3px 9px", borderRadius: 4, cursor: "pointer",
  lineHeight: "16px", userSelect: "none",
};
const BTN_PRIMARY: React.CSSProperties = {
  ...BTN_BASE, background: "rgba(134,239,172,0.18)", color: "#86efac",
  border: "1px solid rgba(134,239,172,0.35)",
};
const BTN_MUTED: React.CSSProperties = {
  ...BTN_BASE, background: "rgba(148,163,184,0.08)", color: "#94a3b8",
  border: "1px solid rgba(148,163,184,0.2)",
};
const BTN_DISABLED: React.CSSProperties = { ...BTN_MUTED, opacity: 0.35, cursor: "default" };
const BTN_ACTIVE: React.CSSProperties = {
  ...BTN_BASE, background: "rgba(96,165,250,0.22)", color: "#93c5fd",
  border: "1px solid rgba(96,165,250,0.45)",
};
const SELECT_STYLE: React.CSSProperties = {
  fontSize: 10, padding: "2px 4px", borderRadius: 4, cursor: "pointer",
  background: "rgba(15,23,42,0.95)", color: "#64748b",
  border: "1px solid rgba(148,163,184,0.2)",
};

// ── Student toolbar ───────────────────────────────────────────────────────────

interface StudentToolDef {
  id:    string;
  icon:  string;
  title: string;
  action: (editor: Editor) => void;
  geoType?: "rectangle" | "ellipse";
}

const STUDENT_TOOLS: StudentToolDef[] = [
  { id: "select",    icon: "↖",  title: "Select (V)",     action: e => e.setCurrentTool("select") },
  { id: "hand",      icon: "✋",  title: "Pan (H)",        action: e => e.setCurrentTool("hand") },
  { id: "draw",      icon: "✏️",  title: "Pen (D)",        action: e => e.setCurrentTool("draw") },
  { id: "highlight", icon: "🖊",  title: "Highlight",      action: e => e.setCurrentTool("highlight") },
  { id: "arrow",     icon: "↗",  title: "Arrow (A)",      action: e => e.setCurrentTool("arrow") },
  { id: "rectangle", icon: "▭",  title: "Rectangle (R)",  geoType: "rectangle",
    action: e => e.run(() => { e.setStyleForNextShapes(GeoShapeGeoStyle, "rectangle"); e.setCurrentTool("geo"); }) },
  { id: "ellipse",   icon: "◯",  title: "Circle (O)",     geoType: "ellipse",
    action: e => e.run(() => { e.setStyleForNextShapes(GeoShapeGeoStyle, "ellipse"); e.setCurrentTool("geo"); }) },
  { id: "text",      icon: "T",  title: "Text (T)",       action: e => e.setCurrentTool("text") },
  { id: "eraser",    icon: "⌫",  title: "Eraser (E)",     action: e => e.setCurrentTool("eraser") },
];

function StudentToolbar({
  editor,
  activeTool,
  onToolSelect,
}: {
  editor: Editor | null;
  activeTool: string;
  onToolSelect: (id: string) => void;
}) {
  return (
    <div style={{
      position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)",
      display: "flex", flexDirection: "column", gap: 4, zIndex: 300,
      background: "rgba(15,23,42,0.92)", border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 10, padding: "6px 5px", boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
    }}>
      {STUDENT_TOOLS.map(tool => {
        const isActive = activeTool === tool.id;
        return (
          <button
            key={tool.id}
            title={tool.title}
            onClick={() => {
              if (!editor) return;
              tool.action(editor);
              onToolSelect(tool.id);
            }}
            style={{
              width: 32, height: 32, borderRadius: 7, cursor: "pointer",
              border: `1px solid ${isActive ? "rgba(96,165,250,0.6)" : "rgba(255,255,255,0.07)"}`,
              background: isActive ? "rgba(96,165,250,0.2)" : "rgba(255,255,255,0.04)",
              color: isActive ? "#93c5fd" : "#94a3b8",
              fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.15s",
            }}
          >
            {tool.icon}
          </button>
        );
      })}

      {/* Divider */}
      <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "2px 0" }} />

      {/* Undo */}
      <button
        title="Undo (Ctrl+Z)"
        onClick={() => editor?.undo()}
        style={{ width: 32, height: 32, borderRadius: 7, cursor: "pointer",
          border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.04)",
          color: "#94a3b8", fontSize: 12 }}
      >&#x21A9;</button>

      {/* Redo */}
      <button
        title="Redo (Ctrl+Y)"
        onClick={() => editor?.redo()}
        style={{ width: 32, height: 32, borderRadius: 7, cursor: "pointer",
          border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.04)",
          color: "#94a3b8", fontSize: 12 }}
      >&#x21AA;</button>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  noteCards:        NoteCard[];
  pageTitle?:       string | null;
  whiteboardGrammar?: string;
  onAnchorClick?:   (nodeId: string) => void;
  vsg?:             VisualSceneGraph;
  activeAnchorId?:  string | null;
  storageKey?:      string;
  studentMode?:     boolean;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TldrawCanvas({
  noteCards, pageTitle, whiteboardGrammar = "flow",
  onAnchorClick, vsg, activeAnchorId, storageKey,
  studentMode = false,
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

  // ── Phase 2 reveal controller ─────────────────────────────────────────────
  const [revealIndex,    setRevealIndexState] = useState(-1);
  const [isPlaying,      setIsPlaying]        = useState(false);
  const [speed,          setSpeed]            = useState<RevealSpeed>("normal");
  const [narrationText,  setNarrationText]    = useState<string | null>(null);
  const [totalShapes,    setTotalShapes]      = useState(0);

  // ── Phase 3 student toolbar ───────────────────────────────────────────────
  const [activeTool, setActiveTool] = useState("select");

  // ── Phase 4 narration ─────────────────────────────────────────────────────
  const [narrationEnabled, setNarrationEnabled] = useState(false);
  const [isSpeaking,       setIsSpeaking]       = useState(false);
  const narrationRef = useRef<NarrationController | null>(null);
  const getNarration = () => {
    if (!narrationRef.current) narrationRef.current = new NarrationController();
    return narrationRef.current;
  };

  // Refs for stable callbacks
  const revealIndexRef      = useRef(-1);
  const orderedShapeIdsRef  = useRef<ReturnType<typeof createShapeId>[]>([]);
  const narrationMapRef     = useRef<Map<string, string>>(new Map());

  // Phase 1 + Phase 3 One Brain sync refs
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

  const setRevealIndex = useCallback((n: number) => {
    revealIndexRef.current = n;
    setRevealIndexState(n);
  }, []);

  // ── Phase 2: VSG-first shape building ─────────────────────────────────────

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
    orderedShapeIdsRef.current    = [];
    narrationMapRef.current       = new Map();
    sourceIdToShapeIdRef.current  = new Map();
    shapeIdToSourceIdRef.current  = new Map();

    for (const def of defs) {
      editor.createShape({ id: def.id, type: def.type, x: def.x, y: def.y, props: def.props } as any);
      editor.updateShape({ id: def.id, type: def.type, opacity: 0 });
      orderedShapeIdsRef.current.push(def.id);
      if (def.narration) narrationMapRef.current.set(String(def.id), def.narration);
    }
    registerAnchors(defs);
    setTotalShapes(defs.length);
    editor.zoomToFit();
  }, [registerAnchors]);

  const rebuildRefsFromVSGDefs = useCallback((defs: ShapeDef[]) => {
    orderedShapeIdsRef.current    = [];
    narrationMapRef.current       = new Map();
    sourceIdToShapeIdRef.current  = new Map();
    shapeIdToSourceIdRef.current  = new Map();

    for (const def of defs) {
      orderedShapeIdsRef.current.push(def.id);
      if (def.narration) narrationMapRef.current.set(String(def.id), def.narration);
    }
    registerAnchors(defs);
    setTotalShapes(defs.length);
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
        editor.updateShape({ id: sid, type: "geo", opacity: 0 });
        orderedShapeIdsRef.current.push(sid);
        narrationMapRef.current.set(String(sid), card.body);
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
        editor.updateShape({ id: sid, type: "geo", opacity: 0 });
        orderedShapeIdsRef.current.push(sid);
        narrationMapRef.current.set(String(sid), nIdx === 0
          ? (card.title ? `${card.title}\n\n${card.body}` : card.body) : node.label);
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
        editor.updateShape({ id: sid, type: "arrow", opacity: 0 });
        orderedShapeIdsRef.current.push(sid);
        if (arrow.label) narrationMapRef.current.set(String(sid), arrow.label);
      });

      y += Math.max(nodes.length, 1) * 110 + 60;
    });

    setTotalShapes(orderedShapeIdsRef.current.length);
    editor.zoomToFit();
  }, [noteCards, whiteboardGrammar, makeVsgLabelMap, makeAnchorSourceId]);

  const rebuildRefsFromNoteCards = useCallback((cards: NoteCard[]) => {
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
        narrationMapRef.current.set(String(sid), card.body);
        registerAnchor(sid, anchorId);
        return;
      }
      nodes.forEach((node, nIdx) => {
        const sid = createShapeId(`n-${cardIdx}-${nIdx}`);
        orderedShapeIdsRef.current.push(sid);
        narrationMapRef.current.set(String(sid), nIdx === 0
          ? (card.title ? `${card.title}\n\n${card.body}` : card.body) : node.label);
        if (nIdx === 0) registerAnchor(sid, anchorId);
      });
      arrows.forEach((arrow, aIdx) => {
        const sid = createShapeId(`a-${cardIdx}-${aIdx}`);
        orderedShapeIdsRef.current.push(sid);
        if (arrow.label) narrationMapRef.current.set(String(sid), arrow.label);
      });
    });
    setTotalShapes(orderedShapeIdsRef.current.length);
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

    // Phase 1 + Phase 3 One Brain sync: canvas → world
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
    narrationRef.current?.stop();
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
      setRevealIndex(-1);
      setNarrationText(null);
      setIsPlaying(false);
    }
  }, [noteCards, vsg, buildShapes, setRevealIndex]);

  // ── Reveal controller ─────────────────────────────────────────────────────

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
    const text = narrationMapRef.current.get(String(sid)) ?? null;
    setNarrationText(text);

    // Phase 4 TTS
    if (text && narrationEnabled) {
      setIsSpeaking(true);
      getNarration().speak(text, () => setIsSpeaking(false));
    }
  }, [setRevealIndex, narrationEnabled]);

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
    const prevText = prevIdx >= 0 ? (narrationMapRef.current.get(String(ordered[prevIdx])) ?? null) : null;
    setNarrationText(prevText);
    setIsPlaying(false);
    getNarration().stop();
    setIsSpeaking(false);
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
    getNarration().stop();
    setIsSpeaking(false);
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
    getNarration().stop();
    setIsSpeaking(false);
  }, [setRevealIndex]);

  // Auto-play timer
  useEffect(() => {
    if (!isPlaying) return;
    const t = window.setTimeout(handleNext, SPEED_DELAY[speed]);
    return () => clearTimeout(t);
  }, [isPlaying, revealIndex, speed, handleNext]);

  // Phase 3 world→canvas: external anchor focus → select + center shape
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

  // Phase 4 SVG export
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
          {totalShapes > 0 && (
            <span style={{ fontSize: 10, color: "#475569", fontVariantNumeric: "tabular-nums", marginRight: 2 }}>
              {Math.max(revealIndex + 1, 0)} / {totalShapes}
            </span>
          )}

          <button onClick={handleRestart} title="Restart" style={BTN_MUTED}>&#x23EE;</button>
          <button onClick={handlePrev}    disabled={atStart} title="Previous"
            style={atStart ? BTN_DISABLED : BTN_MUTED}>&#x25C4;</button>
          <button onClick={() => setIsPlaying(p => !p)} style={BTN_PRIMARY}>
            {isPlaying ? "&#x23F8; Pause" : "&#x25B6; Play"}
          </button>
          <button onClick={handleNext}      disabled={atEnd} title="Next"
            style={atEnd ? BTN_DISABLED : BTN_MUTED}>&#x25BA;</button>
          <button onClick={handleRevealAll} title="Reveal all" style={BTN_MUTED}>All</button>

          <select value={speed} onChange={e => setSpeed(e.target.value as RevealSpeed)}
            style={SELECT_STYLE} title="Speed">
            <option value="slow">Slow</option>
            <option value="normal">Normal</option>
            <option value="fast">Fast</option>
          </select>

          {/* Phase 4 narration toggle */}
          <button
            onClick={() => {
              const next = !narrationEnabled;
              setNarrationEnabled(next);
              if (!next) { getNarration().stop(); setIsSpeaking(false); }
            }}
            title={narrationEnabled ? "Mute narration" : "Enable voice narration"}
            style={narrationEnabled ? BTN_ACTIVE : BTN_MUTED}
          >
            {isSpeaking ? "🔊" : narrationEnabled ? "🔉" : "🔇"}
          </button>

          <button onClick={handleExport} title="Export SVG" style={BTN_MUTED}>&#x2193; SVG</button>
        </span>
      </div>

      {/* ── Narration panel ───────────────────────────────────────────────── */}
      {narrationText && (
        <div style={{
          padding: "8px 14px",
          background: "rgba(15,23,42,0.97)",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          fontSize: 12, color: "#cbd5e1", lineHeight: 1.6,
          maxHeight: 76, overflowY: "auto",
          display: "flex", alignItems: "flex-start", gap: 8,
        }}>
          {isSpeaking && (
            <span style={{ fontSize: 10, color: "#60a5fa", flexShrink: 0, marginTop: 2 }}>🔊</span>
          )}
          <span>{narrationText}</span>
        </div>
      )}

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
            hideUi={studentMode}
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

        {/* Phase 3: Student toolbar overlay */}
        {!licenseMissingInProduction && studentMode && (
          <StudentToolbar
            editor={editorRef.current}
            activeTool={activeTool}
            onToolSelect={setActiveTool}
          />
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
