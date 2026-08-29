// components/notelab/NotebookCanvas.tsx
// N3 — the tldraw notebook renderer. Composes a VisualNotebookScene (N2)
// onto a REAL, PERSISTENT, student-editable tldraw canvas.
//
// Deliberately NOT components/whiteboard/TldrawCanvas.tsx's pattern: that
// canvas is ephemeral by design — it calls clearTeachingLayer() on every
// mount and locks every shape it draws (isLocked: true), because Professor
// "owns" that canvas during a lesson and a student's edits there are
// explicitly temporary ("Edit a copy" opt-in only). NoteLab's notebook is
// the opposite: the student's persistent, editable notebook. This is the
// first real use of tldraw's persistenceKey-backed cross-session store in
// this codebase for that purpose — composition is idempotent (checks
// editor.getShape(id) before creating, keyed by the SAME deterministic
// shape ids notebookShapeSpec.ts derives from each block's own id) so
// reopening a note never duplicates content or clobbers a student's own
// edits.
//
// N4 — provenance-driven object actions. tldraw's onMount only fires once
// per Editor instance (@tldraw/editor's useOnMount wraps the callback in its
// own stable useEvent, so the mount effect's deps never see a changed
// `scene` prop) — so recomposing on a later scene change is now a separate
// effect below, and the selection listener reads scene via sceneRef rather
// than closing over the (possibly stale) `scene` argument handleMount was
// first called with. Selecting exactly one shape whose `meta.blockId`
// resolves against scene.blocks (see notebookShapeSpec.ts's
// buildNotebookShapeMeta) surfaces a floating action panel — View Source /
// Jump to Reader / Ask Professor / Practice in Recall — reading the shape's
// own provenance (canonicalUnitId/sourceId/page) instead of a separate
// Evidence workspace's disconnected text panels. An arrow/connector shape's
// meta has no blockId (see connectionToArrowSpec), so selecting one
// resolves no block and shows no panel — connectors are never themselves
// "the" evidence for anything.
//
// No jsdom/tldraw-editor render harness exists in this repo (same
// limitation components/whiteboard/TldrawCanvas.tsx's own test suite
// documents) — this component's wiring is covered by source-inspection
// tests; the pure functions it calls (lib/notelab/notebookLayout.ts,
// lib/notelab/notebookShapeSpec.ts) have real behavioral test coverage.

"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Tldraw, type Editor } from "@tldraw/tldraw";
import "@tldraw/tldraw/tldraw.css";
import { getAssetUrls } from "@tldraw/assets/selfHosted.js";
import type { VisualNotebookScene, FinalizedNotebookBlock } from "@/lib/notelab/notebookScene";
import { layoutNotebookScene } from "@/lib/notelab/notebookLayout";
import { notebookBlockToShapeSpecs, connectionToArrowSpec } from "@/lib/notelab/notebookShapeSpec";

const TLDRAW_ASSET_URLS = getAssetUrls({ baseUrl: "/tldraw-assets" });

export interface NotebookCanvasProps {
  scene: VisualNotebookScene;
  /** tldraw's own persistenceKey — real per-note, per-student IndexedDB
   *  persistence, distinct from Professor Whiteboard's storageKey which is
   *  never trusted as ground truth on mount (see clearTeachingLayer). */
  storageKey: string;
  /** Precise: navigate AND focus the exact source thought unit. Only shown
   *  when the selected block actually resolved to a real source unit
   *  (block.canonicalUnitId is set) — never guessed for a page-level or
   *  purely AI-composed block. */
  onViewSource?: (block: FinalizedNotebookBlock) => void;
  /** Coarser: navigate to the block's page without claiming a precise
   *  in-page anchor. Shown whenever the block has a page at all. */
  onJumpToReader?: (block: FinalizedNotebookBlock) => void;
  onAskProfessor?: (block: FinalizedNotebookBlock) => void;
  onPracticeRecall?: (block: FinalizedNotebookBlock) => void;
}

/** Composes any block of `scene` not already present in the editor's store
 *  into real, unlocked, student-editable shapes — idempotent by design (see
 *  file header). Never called on a timer/interval; only on mount and when
 *  the caller's `scene` prop itself changes (a new AI plan was saved). */
function composeScene(editor: Editor, scene: VisualNotebookScene) {
  const { blocks, connections } = layoutNotebookScene(scene);
  const positionedById = new Map(blocks.map((b) => [b.id, b]));

  for (const block of blocks) {
    const specs = notebookBlockToShapeSpecs(block);
    for (const spec of specs) {
      if (editor.getShape(spec.id as any)) continue; // already composed — a student may have moved/edited it
      editor.createShape({ id: spec.id as any, type: spec.type, x: spec.x, y: spec.y, props: spec.props, meta: spec.meta } as any);
    }
  }

  for (const connection of connections) {
    const from = positionedById.get(connection.fromBlockId);
    const to = positionedById.get(connection.toBlockId);
    if (!from || !to) continue; // never draw an arrow whose endpoint didn't survive layout
    const spec = connectionToArrowSpec(connection, from, to);
    if (editor.getShape(spec.id as any)) continue;
    editor.createShape({ id: spec.id as any, type: spec.type, x: spec.x, y: spec.y, props: spec.props, meta: spec.meta } as any);
  }
}

const ACTION_BTN: React.CSSProperties = {
  padding: "4px 9px",
  borderRadius: 6,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.06)",
  color: "rgba(226,232,240,0.9)",
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap" as const,
};

/** The N4 selection panel — reads exactly one selected shape's provenance
 *  (already resolved back to its FinalizedNotebookBlock by the caller) and
 *  offers only the actions that actually apply to it. A block is never
 *  offered "View Source" without a real canonicalUnitId, and never offered
 *  an action whose callback prop the caller didn't pass. */
function BlockActionPanel({
  block, onViewSource, onJumpToReader, onAskProfessor, onPracticeRecall, onDismiss,
}: {
  block: FinalizedNotebookBlock;
  onViewSource?: (block: FinalizedNotebookBlock) => void;
  onJumpToReader?: (block: FinalizedNotebookBlock) => void;
  onAskProfessor?: (block: FinalizedNotebookBlock) => void;
  onPracticeRecall?: (block: FinalizedNotebookBlock) => void;
  onDismiss: () => void;
}) {
  const showViewSource = !!onViewSource && !!block.canonicalUnitId;
  const showJumpToReader = !!onJumpToReader && block.page != null;
  const showAskProfessor = !!onAskProfessor;
  const showPracticeRecall = !!onPracticeRecall;
  if (!showViewSource && !showJumpToReader && !showAskProfessor && !showPracticeRecall) return null;

  return (
    <div
      data-testid="notebook-block-action-panel"
      style={{
        position: "absolute", left: 12, bottom: 12, zIndex: 400, maxWidth: 280,
        display: "flex", flexDirection: "column", gap: 6,
        background: "rgba(10,18,38,0.94)", border: "1px solid rgba(255,255,255,0.14)",
        borderRadius: 10, padding: "9px 11px", boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", color: "#67e8f9", textTransform: "uppercase" }}>
          {block.primitive.replace(/_/g, " ")}
        </span>
        <button type="button" onClick={onDismiss} aria-label="Dismiss" style={{ background: "none", border: "none", color: "rgba(148,163,184,0.6)", cursor: "pointer", fontSize: 12, padding: 0 }}>
          ✕
        </button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {showViewSource && (
          <button type="button" onClick={() => onViewSource!(block)} style={ACTION_BTN}>👁️ View Source</button>
        )}
        {showJumpToReader && (
          <button type="button" onClick={() => onJumpToReader!(block)} style={ACTION_BTN}>📍 Jump to Reader</button>
        )}
        {showAskProfessor && (
          <button type="button" onClick={() => onAskProfessor!(block)} style={ACTION_BTN}>🎓 Ask Professor</button>
        )}
        {showPracticeRecall && (
          <button type="button" onClick={() => onPracticeRecall!(block)} style={ACTION_BTN}>🎯 Practice in Recall</button>
        )}
      </div>
    </div>
  );
}

export default function NotebookCanvas({ scene, storageKey, onViewSource, onJumpToReader, onAskProfessor, onPracticeRecall }: NotebookCanvasProps) {
  const licenseKey = process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY;
  const licenseMissingInProduction = process.env.NODE_ENV === "production" && !licenseKey;

  const editorRef = useRef<Editor | null>(null);
  const storeUnsubRef = useRef<(() => void) | null>(null);
  const sceneRef = useRef(scene);
  useEffect(() => { sceneRef.current = scene; }, [scene]);

  const [selectedBlock, setSelectedBlock] = useState<FinalizedNotebookBlock | null>(null);

  const handleMount = useCallback((editor: Editor) => {
    editorRef.current = editor;
    composeScene(editor, sceneRef.current);

    storeUnsubRef.current?.();
    storeUnsubRef.current = editor.store.listen(
      () => {
        const selected = editor.getSelectedShapes();
        if (selected.length !== 1) { setSelectedBlock(null); return; }
        const blockId = (selected[0].meta as Record<string, unknown> | undefined)?.blockId;
        const block = typeof blockId === "string" ? sceneRef.current.blocks.find((b) => b.id === blockId) ?? null : null;
        setSelectedBlock(block);
      },
      { scope: "session", source: "user" },
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Recompose whenever `scene` itself changes AFTER the initial mount —
  // onMount alone can't do this (see file header): it's a one-time hook.
  useEffect(() => {
    if (editorRef.current) composeScene(editorRef.current, scene);
  }, [scene]);

  useEffect(() => () => { storeUnsubRef.current?.(); }, []);

  if (licenseMissingInProduction) {
    return (
      <div role="alert" style={{ position: "relative", minHeight: 320, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, background: "#0f172a", color: "#94a3b8", fontFamily: "ui-monospace, monospace", fontSize: 13, textAlign: "center", padding: 24 }}>
        <span style={{ fontSize: 20 }}>⚠</span>
        <span>Notebook configuration is unavailable. Missing: tldraw license key.</span>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", minHeight: 480, borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)" }}>
      <Tldraw licenseKey={licenseKey} persistenceKey={storageKey} onMount={handleMount} assetUrls={TLDRAW_ASSET_URLS} />
      {selectedBlock && (
        <BlockActionPanel
          block={selectedBlock}
          onViewSource={onViewSource}
          onJumpToReader={onJumpToReader}
          onAskProfessor={onAskProfessor}
          onPracticeRecall={onPracticeRecall}
          onDismiss={() => setSelectedBlock(null)}
        />
      )}
    </div>
  );
}
