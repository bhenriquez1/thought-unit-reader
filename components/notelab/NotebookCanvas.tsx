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
// edits to what was already composed.
//
// No jsdom/tldraw-editor render harness exists in this repo (same
// limitation components/whiteboard/TldrawCanvas.tsx's own test suite
// documents) — this component's wiring is covered by source-inspection
// tests; the pure functions it calls (lib/notelab/notebookLayout.ts,
// lib/notelab/notebookShapeSpec.ts) have real behavioral test coverage.

"use client";

import React, { useCallback } from "react";
import { Tldraw, type Editor } from "@tldraw/tldraw";
import "@tldraw/tldraw/tldraw.css";
import { getAssetUrls } from "@tldraw/assets/selfHosted.js";
import type { VisualNotebookScene } from "@/lib/notelab/notebookScene";
import { layoutNotebookScene } from "@/lib/notelab/notebookLayout";
import { notebookBlockToShapeSpecs, connectionToArrowSpec } from "@/lib/notelab/notebookShapeSpec";

const TLDRAW_ASSET_URLS = getAssetUrls({ baseUrl: "/tldraw-assets" });

export interface NotebookCanvasProps {
  scene: VisualNotebookScene;
  /** tldraw's own persistenceKey — real per-note, per-student IndexedDB
   *  persistence, distinct from Professor Whiteboard's storageKey which is
   *  never trusted as ground truth on mount (see clearTeachingLayer). */
  storageKey: string;
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

export default function NotebookCanvas({ scene, storageKey }: NotebookCanvasProps) {
  const licenseKey = process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY;
  const licenseMissingInProduction = process.env.NODE_ENV === "production" && !licenseKey;

  const handleMount = useCallback((editor: Editor) => {
    composeScene(editor, scene);
  }, [scene]);

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
    </div>
  );
}
