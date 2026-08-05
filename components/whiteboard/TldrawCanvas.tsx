"use client";
// components/whiteboard/TldrawCanvas.tsx
// Interactive tldraw whiteboard canvas — the Avrrio Visual Reasoning Engine.
//
// One Whiteboard experience: a locked, replayable "recorded professor" that
// draws the lesson while narrating it, plus an always-available, unlocked
// student-annotation layer for personal pen strokes/circles/notes/arrows
// (tldraw's own native toolbar, already visible — no separate mode/tab).
//
//   TEACHING LAYER — locked (isLocked: true on every AI/deterministic shape)
//     canonicalUnitId, source grounding, and reveal order are preserved on
//     each shape's def; students cannot move/delete/edit these shapes.
//   STUDENT LAYER — unlocked, ordinary tldraw shapes the student draws with
//     the native toolbar. Untouched by playback.
//
// Playback is driven by a TeachingTimeline (lib/whiteboard/teachingTimeline.ts)
// built ONCE from the current VisualSceneGraph and never touched again during
// play/pause/next/previous/restart — every one of those operations calls the
// SAME pure computeVisualStates(defs, stepIndex) to reconstruct exactly what
// the canvas should look like, so Previous/Next are exact-state jumps, not
// incremental mutations, and there is no AI call anywhere in this file.
//
// Architecture: three integrated phases
//   Phase 1  Shape → Reader sync     clicking a shape sets readingFocusStore
//   Phase 2  VSG-first rendering     uses VisualSceneGraph node positions + edge kinds
//   Phase 3  Teaching timeline       deterministic play/pause/next/prev/restart

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Tldraw, createShapeId, toRichText, type Editor } from "@tldraw/tldraw";
import "@tldraw/tldraw/tldraw.css";
import type { NoteCard } from "@/lib/insights/synthesizeTeachingOutput";
import type { VisualSceneGraph } from "@/lib/whiteboard/visualSceneGraph";
import { vsgToShapeDefs, type ShapeDef } from "@/lib/whiteboard/sceneGraphAdapter";
import {
  buildTeachingTimeline, computeVisualStates, stepDurationMs, FAINT_OPACITY,
  type TeachingTimeline,
} from "@/lib/whiteboard/teachingTimeline";
import { useReadingFocusStore } from "@/lib/readingFocus/readingFocusStore";
import {
  claimSpeech, registerActiveUtterance, notifySpeechStart, notifySpeechEnd,
  notifySpeechError, stopAllSpeech,
} from "@/lib/speech/speechController";

const SPEECH_OWNER = "whiteboard" as const;

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
const SPEED_FACTOR = { slow: 0.6, normal: 1, fast: 2.2 } as const;
type PlaybackSpeed = keyof typeof SPEED_FACTOR;
// Floor so a step is never so short narration can't be heard, even on "fast".
const MIN_STEP_MS = 500;

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

  // ── Phase 3: teaching timeline + playback state ───────────────────────────
  const defsRef     = useRef<ShapeDef[]>([]);
  const timelineRef = useRef<TeachingTimeline>({ steps: [] });
  const [totalSteps,    setTotalSteps]    = useState(0);
  const [stepIndex,      setStepIndexState] = useState(-1);
  const stepIndexRef = useRef(-1);
  const [isPlaying,      setIsPlaying]      = useState(false);
  const [speed,          setSpeed]          = useState<PlaybackSpeed>("normal");
  const [narrationEnabled, setNarrationEnabled] = useState(false);
  const [isSpeaking,       setIsSpeaking]       = useState(false);
  const [narrationText,    setNarrationText]    = useState<string | null>(null);

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

  // Deterministic canvas-state application — the ONLY place that decides what
  // a shape should look like at a given timeline position. Called identically
  // by the autoplay timer, Next, Previous, Restart, and "Show complete
  // diagram" — every entry point is guaranteed to agree with every other.
  const applyVisualStates = useCallback((editor: Editor, index: number, emphasize: boolean) => {
    const defs = defsRef.current;
    const states = computeVisualStates(defs, index, { emphasizeCurrent: emphasize });
    const updates: any[] = [];
    for (const def of defs) {
      const state = states.get(String(def.id));
      const shape = editor.getShape(def.id);
      if (!state || !shape) continue;
      updates.push({ id: def.id, type: shape.type, opacity: state.opacity });
    }
    if (updates.length === 0) return;
    // Confirmed via direct testing: editor.updateShapes(...) on a LOCKED
    // shape accepts an opacity change into the store (getShape immediately
    // after reflects the new value) but tldraw does not visually repaint it
    // — the shape stays rendered at its previous opacity on screen. Locking
    // still needs to block the STUDENT from moving/deleting/editing these
    // shapes, so the fix is this narrow unlock -> apply the real update ->
    // relock sequence, not "leave shapes unlocked" (would sacrifice the
    // whole point of a locked teaching layer) and not "skip locking during
    // animation" (a locked shape must never be draggable, even mid-reveal).
    editor.updateShapes(updates.map(u => ({ id: u.id, type: u.type, isLocked: false })));
    editor.updateShapes(updates);
    editor.updateShapes(updates.map(u => ({ id: u.id, type: u.type, isLocked: true })));
  }, []);

  const setStepIndex = useCallback((n: number, opts: { emphasize?: boolean } = {}) => {
    stepIndexRef.current = n;
    setStepIndexState(n);
    const editor = editorRef.current;
    if (editor) applyVisualStates(editor, n, opts.emphasize ?? false);
  }, [applyVisualStates]);

  // ── Narration ──────────────────────────────────────────────────────────────
  const speakStep = useCallback((text: string) => {
    setNarrationText(text || null);
    if (!narrationEnabled || !text) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const token = claimSpeech(SPEECH_OWNER);
    setIsSpeaking(true);
    const utter = new SpeechSynthesisUtterance(text);
    registerActiveUtterance(token, utter, () => setIsSpeaking(false));
    utter.onstart = () => notifySpeechStart(token, SPEECH_OWNER);
    utter.onend   = () => { notifySpeechEnd(token, SPEECH_OWNER); setIsSpeaking(false); };
    utter.onerror = (e) => { notifySpeechError(token, SPEECH_OWNER, e.error); setIsSpeaking(false); };
    window.speechSynthesis.speak(utter);
  }, [narrationEnabled]);

  const stopNarration = useCallback(() => {
    stopAllSpeech("whiteboard-step-change");
    setIsSpeaking(false);
  }, []);

  // ── Phase 2: VSG-first shape building ─────────────────────────────────────
  // Every shape created here is TEACHING LAYER: locked (isLocked: true) so
  // students cannot move/delete/edit it, and created at FAINT_OPACITY — the
  // "clean board with faint planning marks" state before playback begins.
  // The student-annotation layer is simply whatever the student draws with
  // tldraw's own (unlocked, always-visible) native toolbar — untouched here.

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
      editor.createShape({
        id: def.id, type: def.type, x: def.x, y: def.y, props: def.props,
        opacity: FAINT_OPACITY, isLocked: true,
      } as any);
    }
    registerAnchors(defs);
    defsRef.current     = defs;
    timelineRef.current = buildTeachingTimeline(defs);
    setTotalSteps(defs.length);
    editor.zoomToFit();
  }, [registerAnchors]);

  const rebuildRefsFromVSGDefs = useCallback((defs: ShapeDef[]) => {
    sourceIdToShapeIdRef.current  = new Map();
    shapeIdToSourceIdRef.current  = new Map();
    registerAnchors(defs);
    defsRef.current     = defs;
    timelineRef.current = buildTeachingTimeline(defs);
    setTotalSteps(defs.length);
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
  // Same teaching-layer treatment (locked, faint-then-revealed) as the VSG
  // path — this is still AI/deterministic-derived content, not the student's.

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
    const defs: ShapeDef[] = [];
    let order = 0;

    let y = 60;
    noteCards.forEach((card, cardIdx) => {
      const tier     = CARD_TYPE_TIER[card.type] ?? "pearl";
      const nodes    = card.visual?.nodes ?? [];
      const arrows   = card.visual?.arrows ?? [];
      const anchorId = makeAnchorSourceId(vsgLabelMap, cardIdx, card.title);

      if (nodes.length === 0) {
        const sid = createShapeId(`card-${cardIdx}`);
        const props = {
          geo:      "rectangle", w: 300, h: 68,
          richText: toRichText(card.title ? `${card.title}\n${card.body.slice(0, 100)}` : card.body.slice(0, 100)),
          fill:     "solid", size: "s",
          color: tier === "master" ? "yellow" : tier === "step" ? "green"
               : tier === "danger" ? "red"    : tier === "pearl" ? "light-blue" : "blue",
        };
        editor.createShape({ id: sid, type: "geo", x: 80, y, props, opacity: FAINT_OPACITY, isLocked: true } as any);
        registerAnchor(sid, anchorId);
        defs.push({ id: sid, type: "geo", x: 80, y, props, sourceId: anchorId, narration: card.body, revealOrder: order++ });
        y += 90;
        return;
      }

      const positions = getPositions(nodes.length, whiteboardGrammar);
      const nodeShapeIds: ReturnType<typeof createShapeId>[] = [];
      nodes.forEach((node, nIdx) => {
        const sid = createShapeId(`n-${cardIdx}-${nIdx}`);
        const pos = positions[nIdx] ?? { x: 100, y: y + nIdx * 110 };
        const px = pos.x, py = pos.y + y;
        const props = {
          geo: "rectangle", w: 230, h: 56, richText: toRichText(node.label), fill: "solid", size: "s",
          color: tier === "master" ? "yellow" : tier === "step"  ? "green"
               : tier === "danger" ? "red"    : tier === "pearl" ? "light-blue" : "blue",
        };
        editor.createShape({ id: sid, type: "geo", x: px, y: py, props, opacity: FAINT_OPACITY, isLocked: true } as any);
        nodeShapeIds.push(sid);
        if (nIdx === 0) registerAnchor(sid, anchorId);
        defs.push({
          id: sid, type: "geo", x: px, y: py, props,
          sourceId: nIdx === 0 ? anchorId : undefined,
          narration: nIdx === 0 ? (card.title ? `${card.title}. ${card.body}` : card.body) : node.label,
          revealOrder: order++,
        });
      });

      arrows.forEach((arrow, aIdx) => {
        const fromIdx = nodes.findIndex(n => n.id === arrow.from);
        const toIdx   = nodes.findIndex(n => n.id === arrow.to);
        if (fromIdx < 0 || toIdx < 0) return;
        const fromPos = positions[fromIdx] ?? { x: 100, y: 0 };
        const toPos   = positions[toIdx]   ?? { x: 100, y: 110 };
        const sid = createShapeId(`a-${cardIdx}-${aIdx}`);
        const ax = fromPos.x + 115 + 100, ay = fromPos.y + y + 28;
        const props = {
          kind:     "arc",
          start:    { x: 0, y: 0 },
          end:      { x: toPos.x - fromPos.x, y: toPos.y - fromPos.y + 28 },
          richText: toRichText(arrow.label ?? ""),
          size:     "s",
          color: tier === "step" ? "green" : tier === "danger" ? "red" : "blue",
        };
        editor.createShape({ id: sid, type: "arrow", x: ax, y: ay, props, opacity: FAINT_OPACITY, isLocked: true } as any);
        defs.push({ id: sid, type: "arrow", x: ax, y: ay, props, narration: arrow.label ?? undefined, revealOrder: order++ });
      });

      y += Math.max(nodes.length, 1) * 110 + 60;
    });

    defsRef.current     = defs;
    timelineRef.current = buildTeachingTimeline(defs);
    setTotalSteps(defs.length);
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
    // Shapes already exist on the canvas (restored from persistence) — we
    // can't recover their exact prior ShapeDef[] from the store, so treat a
    // restored board as a completed performance (fully revealed) rather than
    // leaving locked shapes stuck at faint opacity with no way to un-faint
    // them short of pressing Restart.
    defsRef.current     = [];
    timelineRef.current = { steps: [] };
    setTotalSteps(0);
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
    stopAllSpeech("whiteboard-unmount");
  }, []);

  // Single rebuild effect — VSG-first, noteCards fallback. One effect prevents
  // the double-build race where both noteCards and vsg change simultaneously
  // (e.g. on page navigation), which would previously cause two sequential
  // deleteShapes + createShapes cycles. A rebuild is the ONLY thing that
  // regenerates the timeline — never a play/pause/next/previous/restart call,
  // and never an AI call (buildTeachingTimeline is pure, non-network).
  useEffect(() => {
    vsgRef.current = vsg;
    builtRef.current = false;
    const editor = editorRef.current;
    if (editor) {
      builtRef.current = true;
      setIsPlaying(false);
      stopAllSpeech("whiteboard-rebuild");
      setIsSpeaking(false);
      setNarrationText(null);
      buildShapes(editor);
      stepIndexRef.current = -1;
      setStepIndexState(-1);
    }
  }, [noteCards, vsg, buildShapes]);

  // ── Playback: the ONLY code that advances the timeline during Play ───────
  const advanceForPlayback = useCallback(() => {
    const timeline = timelineRef.current;
    const next = stepIndexRef.current + 1;
    if (next >= timeline.steps.length) { setIsPlaying(false); return; }
    setStepIndex(next, { emphasize: true });
    speakStep(timeline.steps[next].narration);
  }, [setStepIndex, speakStep]);

  useEffect(() => {
    if (!isPlaying) return;
    const timeline = timelineRef.current;
    const next = stepIndexRef.current + 1;
    if (next >= timeline.steps.length) { setIsPlaying(false); return; }
    const duration = Math.max(stepDurationMs(timeline.steps[next]), MIN_STEP_MS) / SPEED_FACTOR[speed];
    const t = window.setTimeout(advanceForPlayback, duration);
    return () => clearTimeout(t);
  }, [isPlaying, stepIndex, speed, advanceForPlayback]);

  // ── Manual controls ────────────────────────────────────────────────────────

  const handleNext = useCallback(() => {
    setIsPlaying(false);
    stopNarration();
    const timeline = timelineRef.current;
    const next = Math.min(stepIndexRef.current + 1, timeline.steps.length - 1);
    setStepIndex(next);
  }, [setStepIndex, stopNarration]);

  const handlePrev = useCallback(() => {
    setIsPlaying(false);
    stopNarration();
    const prev = Math.max(stepIndexRef.current - 1, -1);
    setStepIndex(prev);
  }, [setStepIndex, stopNarration]);

  const handleRestart = useCallback(() => {
    stopNarration();
    setNarrationText(null);
    setStepIndex(-1);
    setIsPlaying(true);
  }, [setStepIndex, stopNarration]);

  const handleShowComplete = useCallback(() => {
    setIsPlaying(false);
    stopNarration();
    setNarrationText(null);
    const timeline = timelineRef.current;
    setStepIndex(timeline.steps.length - 1);
  }, [setStepIndex, stopNarration]);

  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      setIsPlaying(false);
      stopNarration();
      return;
    }
    const timeline = timelineRef.current;
    const atEnd = timeline.steps.length > 0 && stepIndexRef.current >= timeline.steps.length - 1;
    if (atEnd) {
      // "Play after completion must replay the entire teaching performance."
      stopNarration();
      setNarrationText(null);
      setStepIndex(-1);
    }
    setIsPlaying(true);
  }, [isPlaying, setStepIndex, stopNarration]);

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

  const atStart = stepIndex < 0;
  const atEnd   = totalSteps > 0 && stepIndex >= totalSteps - 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 480, background: "#0f172a" }}>

      {/* ── Controls bar ──────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)", flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "#94a3b8", fontFamily: "monospace", flexShrink: 0 }}>
          {pageTitle ?? "Whiteboard"}
        </span>

        <span style={{ marginLeft: "auto", display: "flex", gap: 5, alignItems: "center" }}>
          {totalSteps > 0 && (
            <span style={{ fontSize: 10, color: "#475569", fontVariantNumeric: "tabular-nums", marginRight: 2 }}>
              {Math.max(stepIndex + 1, 0)} / {totalSteps}
            </span>
          )}

          <button onClick={handleRestart} title="Restart" style={BTN_MUTED}>&#x23EE;</button>
          <button onClick={handlePrev} disabled={atStart} title="Previous"
            style={atStart ? BTN_DISABLED : BTN_MUTED}>&#x25C4;</button>
          <button onClick={handlePlayPause} style={BTN_PRIMARY}>
            {isPlaying ? "⏸ Pause" : "▶ Play"}
          </button>
          <button onClick={handleNext} disabled={atEnd} title="Next"
            style={atEnd ? BTN_DISABLED : BTN_MUTED}>&#x25BA;</button>
          <button onClick={handleShowComplete} title="Show complete diagram" style={BTN_MUTED}>All</button>

          <select value={speed} onChange={e => setSpeed(e.target.value as PlaybackSpeed)}
            style={SELECT_STYLE} title="Speed">
            <option value="slow">Slow</option>
            <option value="normal">Normal</option>
            <option value="fast">Fast</option>
          </select>

          <button
            onClick={() => {
              const next = !narrationEnabled;
              setNarrationEnabled(next);
              if (!next) stopNarration();
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
