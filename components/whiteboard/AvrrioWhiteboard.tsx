"use client";
// components/whiteboard/AvrrioWhiteboard.tsx
// Public wrapper around TldrawCanvas that manages Student / Instructor mode.
// Keeping mode state here preserves the separation: TldrawCanvas = SDK wrapper,
// AvrrioWhiteboard = educational product layer.

import React, { useState } from "react";
import TldrawCanvas from "./TldrawCanvas";
import type { NoteCard } from "@/lib/insights/synthesizeTeachingOutput";
import type { VisualSceneGraph } from "@/lib/whiteboard/visualSceneGraph";

interface Props {
  noteCards:           NoteCard[];
  pageTitle?:          string | null;
  whiteboardGrammar?:  string;
  onAnchorClick?:      (nodeId: string) => void;
  vsg?:                VisualSceneGraph;
  activeAnchorId?:     string | null;
  storageKey?:         string;
}

const MODE_BTN: React.CSSProperties = {
  fontSize: 10, padding: "2px 9px", borderRadius: 4, cursor: "pointer",
  userSelect: "none", lineHeight: "16px",
};

export default function AvrrioWhiteboard(props: Props) {
  const [studentMode, setStudentMode] = useState(true);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Mode toggle bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 4,
        padding: "4px 10px", background: "rgba(15,23,42,0.97)",
        borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0,
      }}>
        <span style={{ fontSize: 9, color: "rgba(148,163,184,0.45)", fontWeight: 700,
          letterSpacing: "0.1em", marginRight: 4 }}>MODE</span>

        <button
          onClick={() => setStudentMode(true)}
          style={{
            ...MODE_BTN,
            background: studentMode ? "rgba(134,239,172,0.18)" : "rgba(51,65,85,0.5)",
            color: studentMode ? "#86efac" : "#64748b",
            border: studentMode ? "1px solid rgba(134,239,172,0.4)" : "1px solid rgba(255,255,255,0.07)",
          }}
        >
          Student
        </button>
        <button
          onClick={() => setStudentMode(false)}
          style={{
            ...MODE_BTN,
            background: !studentMode ? "rgba(134,239,172,0.18)" : "rgba(51,65,85,0.5)",
            color: !studentMode ? "#86efac" : "#64748b",
            border: !studentMode ? "1px solid rgba(134,239,172,0.4)" : "1px solid rgba(255,255,255,0.07)",
          }}
        >
          Instructor
        </button>

        <span style={{ fontSize: 9, color: "rgba(148,163,184,0.3)", marginLeft: 6 }}>
          {studentMode ? "Essential tools only" : "Full tldraw toolbar + panels"}
        </span>
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        <TldrawCanvas {...props} studentMode={studentMode} />
      </div>
    </div>
  );
}
