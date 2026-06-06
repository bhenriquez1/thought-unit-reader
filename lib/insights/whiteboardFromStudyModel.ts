// lib/insights/whiteboardFromStudyModel.ts
// Converts a CurrentPageStudyModel into WhiteboardStep[] with NO API call.
// One brain, many views: finalStudyModel → Whiteboard.

import type { WhiteboardStep, DiagramNode, DiagramArrow } from "@/lib/WhiteboardExplanationService";
import type { CurrentPageStudyModel, VisualAnchor } from "@/lib/insights/currentPageStudyModel";

// ── Armando diagram mode: diagram steps with drawType ─────────────────────

function anchorFor(anchors: VisualAnchor[], field: string): VisualAnchor | undefined {
  return anchors.find((a) => a.sourceField === field);
}

function trunc(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

function splitMechanism(text: string): { nodes: DiagramNode[]; arrows: DiagramArrow[] } {
  const causalRe = /(.+?)\s+(?:causes?|leads?\s+to|results?\s+in|produces?|triggers?|→)\s+(.+)/i;
  const m = causalRe.exec(text);
  if (m) {
    return {
      nodes: [
        { id: "c0", label: trunc(m[1].trim(), 32) },
        { id: "c1", label: trunc(m[2].trim(), 32) },
      ],
      arrows: [{ from: "c0", to: "c1" }],
    };
  }
  const parts = text.split(/[;,]\s+/).slice(0, 4).map((p) => trunc(p.trim(), 30));
  if (parts.length >= 2) {
    const nodes = parts.map((p, i) => ({ id: `p${i}`, label: p }));
    return {
      nodes,
      arrows: nodes.slice(0, -1).map((n, i) => ({ from: n.id, to: nodes[i + 1].id })),
    };
  }
  return { nodes: [{ id: "n0", label: trunc(text, 40) }], arrows: [] };
}

/** Armando mode: generates diagram steps (flow/comparison/table) from studyModel. */
export function generateWhiteboardStepsFromModel(
  model: CurrentPageStudyModel,
  pageNumber: number,
): WhiteboardStep[] {
  const steps: WhiteboardStep[] = [];
  const { studyNotes: sn, conceptBlocks, visualAnchors = [], pageThesis } = model;

  console.log("[WHITEBOARD_SOURCE]", {
    page: pageNumber,
    pageThesis: pageThesis?.slice(0, 60) ?? null,
    hasWhy: !!sn?.whyThisMatters,
    hasMech: !!sn?.keyMechanism,
    hasConfusion: !!sn?.commonConfusion,
    hasMemory: !!sn?.quickMemory,
    conceptBlocks: conceptBlocks?.length ?? 0,
    visualAnchors: visualAnchors.length,
  });

  if (pageThesis) {
    steps.push({
      type: "draw", payload: {},
      title: "Main Idea",
      description: trunc(pageThesis, 200),
      spokenLine: `Page ${pageNumber}: ${pageThesis}`,
      drawType: "flow",
      nodes: [{ id: "main", label: trunc(pageThesis, 38) }],
      arrows: [],
      labels: ["Core Concept"],
      evidenceRefId: anchorFor(visualAnchors, "pageThesis")?.id,
    });
  }

  if (sn?.keyMechanism) {
    const { nodes, arrows } = splitMechanism(sn.keyMechanism);
    steps.push({
      type: "draw", payload: {},
      title: "Key Mechanism",
      description: sn.keyMechanism,
      spokenLine: `Here's the mechanism: ${sn.keyMechanism}`,
      drawType: "flow",
      nodes, arrows, labels: [],
      evidenceRefId: anchorFor(visualAnchors, "keyMechanism")?.id,
    });
  }

  if (sn?.whyThisMatters) {
    steps.push({
      type: "draw", payload: {},
      title: "Why It Matters",
      description: sn.whyThisMatters,
      spokenLine: `Why does this matter? ${sn.whyThisMatters}`,
      drawType: "comparison",
      nodes: [
        { id: "col-a", label: "With this concept", nx: 0.18, ny: 0.45 },
        { id: "col-b", label: "Without it",         nx: 0.62, ny: 0.45 },
      ],
      arrows: [],
      labels: [trunc(sn.whyThisMatters, 50)],
      evidenceRefId: anchorFor(visualAnchors, "whyThisMatters")?.id,
    });
  }

  if (sn?.commonConfusion) {
    steps.push({
      type: "draw", payload: {},
      title: "Common Confusion",
      description: sn.commonConfusion,
      spokenLine: `Watch out for this: ${sn.commonConfusion}`,
      drawType: "comparison",
      nodes: [
        { id: "wrong", label: "❌  Misconception", nx: 0.18, ny: 0.42 },
        { id: "right", label: "✓  Reality",        nx: 0.62, ny: 0.42 },
      ],
      arrows: [],
      labels: [trunc(sn.commonConfusion, 50)],
      evidenceRefId: anchorFor(visualAnchors, "commonConfusion")?.id,
    });
  }

  const blocks = (conceptBlocks ?? []).slice(0, 4);
  if (blocks.length > 0) {
    const nodes: DiagramNode[] = blocks.map((b, i) => ({
      id: `cb${i}`, label: trunc(b.title ?? `Concept ${i + 1}`, 28),
    }));
    steps.push({
      type: "draw", payload: {},
      title: "Concept Map",
      description: blocks.map((b) => b.title).join(" → "),
      spokenLine: `Key concepts: ${blocks.map((b) => b.title).join(", ")}.`,
      drawType: "anatomy",
      nodes,
      arrows: nodes.slice(0, -1).map((n, i) => ({ from: n.id, to: nodes[i + 1].id })),
      labels: blocks.map((b) => b.pattern ?? "").filter(Boolean).slice(0, 3),
      evidenceRefId: anchorFor(visualAnchors, "conceptBlock")?.id,
    });
  }

  if (sn?.quickMemory) {
    steps.push({
      type: "draw", payload: {},
      title: "Memory Anchor",
      description: sn.quickMemory,
      spokenLine: `Memory trick: ${sn.quickMemory}`,
      drawType: "table",
      nodes: [
        { id: "t0", label: "Remember" },
        { id: "t1", label: trunc(sn.quickMemory, 40) },
      ],
      arrows: [], labels: [],
      evidenceRefId: anchorFor(visualAnchors, "quickMemory")?.id,
    });
  }

  console.log("[WHITEBOARD_DIAGRAM_STEPS]", {
    page: pageNumber,
    totalSteps: steps.length,
    steps: steps.map((s, i) => ({
      idx: i, title: s.title, drawType: s.drawType,
      nodes: s.nodes?.length ?? 0, arrows: s.arrows?.length ?? 0,
      evidenceRefId: s.evidenceRefId ?? null,
    })),
  });

  return steps;
}

export function buildNarrationScript(steps: WhiteboardStep[]): string {
  return steps.map((s, i) => `Step ${i + 1} — ${s.title}: ${s.spokenLine ?? s.description ?? ""}`).join("\n\n");
}

// ── Text mode: original simple text steps ─────────────────────────────────

export function buildWhiteboardStepsFromStudyModel(
  model: CurrentPageStudyModel,
): WhiteboardStep[] {
  const steps: WhiteboardStep[] = [];
  const sn = model.studyNotes;

  if (model.pageThesis) {
    steps.push({
      type: "text",
      title: "Page Thesis",
      description: model.pageThesis,
      visualPrompt: "Large bold header with underline",
      payload: { kind: "title" },
    });
  }

  if (sn?.whyThisMatters) {
    steps.push({
      type: "text",
      title: "Why This Matters",
      description: sn.whyThisMatters,
      visualPrompt: "Callout box with arrow",
      payload: { kind: "highlight", color: "#fef08a" },
    });
  }

  if (sn?.keyMechanism) {
    steps.push({
      type: "draw",
      title: "Key Mechanism",
      description: sn.keyMechanism,
      visualPrompt: "Flow diagram with labeled arrows",
      payload: { kind: "mechanism" },
    });
  }

  if (sn?.commonConfusion) {
    steps.push({
      type: "text",
      title: "Watch Out",
      description: sn.commonConfusion,
      visualPrompt: "Red warning box",
      payload: { kind: "trap", color: "#fca5a5" },
    });
  }

  for (const cb of (model.conceptBlocks ?? []).slice(0, 3)) {
    steps.push({
      type: "draw",
      title: cb.title,
      description: cb.pattern + (cb.mechanism ? `\n\n${cb.mechanism}` : ""),
      visualPrompt: "Concept map with pattern and mechanism",
      payload: { kind: "concept" },
    });
  }

  return steps;
}
