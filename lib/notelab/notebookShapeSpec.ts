// lib/notelab/notebookShapeSpec.ts
// N3 — pure functions: a positioned NotebookBlock -> real tldraw shape
// specs, plus the provenance `meta` every created shape carries.
//
// Shape-prop shapes (geo/text/arrow/draw) and their exact valid values
// (dash/fill/size/color/font, b64Vecs point encoding) are the SAME proven
// vocabulary components/whiteboard/TldrawCanvas.tsx's own toTldrawShapeSpec
// already uses in production — reused here, not reinvented, even though the
// primitive-to-shape mapping itself is necessarily new (NoteLab's primitive
// vocabulary — table/timeline/concept_map/image/etc. — is broader than
// Professor's ShapeVisualState.kind union).

import { b64Vecs, createShapeId, toRichText } from "@tldraw/tldraw";
import type { PositionedNotebookBlock, NotebookConnection } from "./notebookLayout";
import type { NotebookPrimitive, FinalizedNotebookBlock } from "./notebookScene";

export interface TldrawShapeSpec {
  id: string;
  type: string;
  x: number;
  y: number;
  props: Record<string, unknown>;
  meta: Record<string, unknown>;
}

/** Every shape a block produces carries the SAME provenance back to its
 *  source — the correction's own contract: canonicalUnitId/sourceId/page/
 *  confidence/generatedFrom, plus which block/primitive produced it so a
 *  selected shape's "View Source / Jump to Reader / Ask Professor / Practice
 *  in Recall" actions (N4) can look the block back up. */
export function buildNotebookShapeMeta(block: FinalizedNotebookBlock): Record<string, unknown> {
  return {
    blockId: block.id,
    primitive: block.primitive,
    canonicalUnitId: block.canonicalUnitId,
    sourceId: block.sourceId,
    page: block.page,
    confidence: block.confidence,
    generatedFrom: block.generatedFrom,
  };
}

const TEXT_PRIMITIVES: ReadonlySet<NotebookPrimitive> = new Set([
  "heading", "label", "text", "example", "source_anchor", "formula", "freehand",
]);
const BOXED_PRIMITIVES: ReadonlySet<NotebookPrimitive> = new Set([
  "callout", "diagram", "concept_map", "image", "table", "timeline", "flow", "comparison", "equation_work",
]);

function fontSizeFor(primitive: NotebookPrimitive): "s" | "m" | "l" {
  if (primitive === "heading") return "l";
  if (primitive === "label") return "s";
  return "m";
}

/** Straight 2-point strokes reusing the exact draw-shape segment encoding
 *  TldrawCanvas.tsx's freehand branch already proves works (path via
 *  b64Vecs.encodePoints) — used for the highlight/underline decoration
 *  under a text block, rather than the less-common native `highlight`
 *  shape type, since this codebase has no live browser available to verify
 *  a new shape type's exact prop contract against. */
function straightDrawSegmentProps(w: number, color: string, size: "s" | "m", solid: boolean) {
  const points = [{ x: 0, y: 0, z: 0.5 }, { x: w, y: 0, z: 0.5 }];
  return {
    color, fill: "none", dash: solid ? "solid" : "draw", size,
    segments: [{ type: "straight", path: b64Vecs.encodePoints(points) }],
    isComplete: true, isClosed: false, isPen: false,
    scale: 1, scaleX: 1, scaleY: 1,
  };
}

/**
 * Converts one positioned block into 1+ real tldraw shape specs. Never
 * throws on an unrecognized primitive — every value in NotebookPrimitive is
 * handled explicitly below, so this is defensive against a future
 * vocabulary addition landing here before its renderer branch does.
 */
export function notebookBlockToShapeSpecs(block: PositionedNotebookBlock, color = "black"): TldrawShapeSpec[] {
  const meta = buildNotebookShapeMeta(block);
  const idBase = `nb-${block.id}`;

  if (block.primitive === "highlight" || block.primitive === "underline") {
    const text: TldrawShapeSpec = {
      id: createShapeId(idBase), type: "text", x: block.x, y: block.y,
      props: { richText: toRichText(block.content), font: "sans", size: fontSizeFor(block.primitive), color, autoSize: false, w: block.w },
      meta,
    };
    const isHighlight = block.primitive === "highlight";
    const bar: TldrawShapeSpec = {
      id: createShapeId(`${idBase}-mark`), type: "draw", x: block.x, y: block.y + block.h - (isHighlight ? 18 : 6),
      props: straightDrawSegmentProps(block.w, isHighlight ? "yellow" : color, isHighlight ? "m" : "s", !isHighlight),
      meta,
    };
    return [text, bar];
  }

  if (TEXT_PRIMITIVES.has(block.primitive)) {
    const specs: TldrawShapeSpec[] = [{
      id: createShapeId(idBase), type: "text", x: block.x, y: block.y,
      props: {
        richText: toRichText(block.primitive === "freehand" ? `✏️ ${block.content}` : block.content),
        font: block.primitive === "heading" ? "draw" : "sans",
        size: fontSizeFor(block.primitive), color, autoSize: false, w: block.w,
      },
      meta,
    }];
    return specs;
  }

  if (BOXED_PRIMITIVES.has(block.primitive)) {
    const bodyText = block.primitive === "equation_work"
      ? [block.content, block.detail].filter(Boolean).join("\n\n")
      : block.detail ?? block.content;
    const isFrame = block.primitive === "diagram" || block.primitive === "concept_map" || block.primitive === "image";
    return [{
      id: createShapeId(idBase), type: "geo", x: block.x, y: block.y,
      props: {
        geo: "rectangle", w: block.w, h: block.h,
        richText: toRichText(bodyText),
        fill: isFrame ? "none" : "semi",
        dash: isFrame ? "dashed" : "solid",
        size: "m", color, font: "sans",
      },
      meta,
    }];
  }

  // arrow/connector never reach here — resolved separately via
  // connectionToArrowSpec, since they need two blocks' positions, not one.
  return [];
}

/** An arrow/connector's endpoints are the edges of its FROM/TO blocks'
 *  boxes — computed here from the layout's already-resolved connection,
 *  never a position the AI proposed (see notebookLayout.ts's
 *  resolveConnections). Mirrors buildProfessorTeachingActions.ts's own
 *  "connect the deterministic layout's real boxes" approach. */
export function connectionToArrowSpec(
  connection: NotebookConnection,
  fromBlock: PositionedNotebookBlock,
  toBlock: PositionedNotebookBlock,
  color = "grey",
): TldrawShapeSpec {
  const from = { x: fromBlock.x + fromBlock.w / 2, y: fromBlock.y + fromBlock.h };
  const to = { x: toBlock.x + toBlock.w / 2, y: toBlock.y };
  return {
    id: createShapeId(`nb-conn-${connection.blockId}`), type: "arrow", x: from.x, y: from.y,
    props: {
      kind: "arc", start: { x: 0, y: 0 }, end: { x: to.x - from.x, y: to.y - from.y },
      bend: 0, richText: toRichText(""), size: "s",
      color: connection.primitive === "arrow" ? color : "grey",
      dash: connection.primitive === "arrow" ? "solid" : "dashed",
    },
    meta: { connectionId: connection.blockId, fromBlockId: connection.fromBlockId, toBlockId: connection.toBlockId },
  };
}
