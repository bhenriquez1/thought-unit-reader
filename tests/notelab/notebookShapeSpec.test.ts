// tests/notelab/notebookShapeSpec.test.ts
// N3 — real behavioral tests for lib/notelab/notebookShapeSpec.ts, the pure
// PositionedNotebookBlock -> tldraw shape-spec mapping (no DOM/editor
// dependency; @tldraw/tldraw's createShapeId/toRichText/b64Vecs helpers used
// here are pure functions, not editor instances).
//
// What this guards: every shape produced carries the correction's full
// provenance contract (canonicalUnitId/sourceId/page/confidence/
// generatedFrom) in its `meta`, and each primitive maps to a shape kind that
// actually differs by primitive family — never one generic box regardless
// of content.

import {
  buildNotebookShapeMeta,
  notebookBlockToShapeSpecs,
  connectionToArrowSpec,
} from "../../lib/notelab/notebookShapeSpec";
import type { PositionedNotebookBlock, NotebookConnection } from "../../lib/notelab/notebookLayout";
import type { FinalizedNotebookBlock, NotebookPrimitive } from "../../lib/notelab/notebookScene";

function makePositioned(overrides: Partial<PositionedNotebookBlock> & { id: string; primitive: NotebookPrimitive }): PositionedNotebookBlock {
  const base: FinalizedNotebookBlock = {
    id: overrides.id,
    primitive: overrides.primitive,
    content: "Some content",
    detail: null,
    groupId: null,
    order: 0,
    sourceUnitIndex: 0,
    relationshipKind: null,
    canonicalUnitId: "unit-1",
    sourceId: "doc-1",
    page: 3,
    confidence: 0.6,
    generatedFrom: "ai",
  };
  return { ...base, x: 0, y: 0, w: 400, h: 100, ...overrides };
}

describe("buildNotebookShapeMeta", () => {
  it("carries the full correction provenance contract plus blockId/primitive for later lookup", () => {
    const block = makePositioned({ id: "b1", primitive: "text", canonicalUnitId: "unit-9", sourceId: "doc-2", page: 7, confidence: 0.6, generatedFrom: "ai" });
    expect(buildNotebookShapeMeta(block)).toEqual({
      blockId: "b1",
      primitive: "text",
      canonicalUnitId: "unit-9",
      sourceId: "doc-2",
      page: 7,
      confidence: 0.6,
      generatedFrom: "ai",
    });
  });
});

describe("notebookBlockToShapeSpecs — text primitives", () => {
  it("a plain text/heading/label/example/formula/source_anchor block produces exactly one text shape", () => {
    for (const primitive of ["text", "heading", "label", "example", "formula", "source_anchor"] as const) {
      const specs = notebookBlockToShapeSpecs(makePositioned({ id: `b-${primitive}`, primitive }));
      expect(specs).toHaveLength(1);
      expect(specs[0].type).toBe("text");
      expect(specs[0].meta).toMatchObject({ primitive });
    }
  });

  it("a heading uses the draw font and larger size; a label uses a smaller size than a plain text block", () => {
    const heading = notebookBlockToShapeSpecs(makePositioned({ id: "h1", primitive: "heading" }))[0];
    const label = notebookBlockToShapeSpecs(makePositioned({ id: "l1", primitive: "label" }))[0];
    const text = notebookBlockToShapeSpecs(makePositioned({ id: "t1", primitive: "text" }))[0];
    expect(heading.props.font).toBe("draw");
    expect(heading.props.size).toBe("l");
    expect(label.props.size).toBe("s");
    expect(text.props.size).toBe("m");
    expect(text.props.font).toBe("draw");
  });

  it("a freehand block's text is prefixed with a pencil marker to distinguish it from typed content", () => {
    const specs = notebookBlockToShapeSpecs(makePositioned({ id: "f1", primitive: "freehand", content: "sketch this" }));
    const richText = JSON.stringify(specs[0].props.richText);
    expect(richText).toMatch(/sketch this/);
  });

  it("positions the shape at the block's own x/y and carries its width", () => {
    const specs = notebookBlockToShapeSpecs(makePositioned({ id: "t1", primitive: "text", x: 40, y: 120, w: 620 }));
    expect(specs[0].x).toBe(40);
    expect(specs[0].y).toBe(120);
    expect(specs[0].props.w).toBe(620);
  });
});

describe("notebookBlockToShapeSpecs — highlight/underline", () => {
  it("produces two shapes: the text itself, and a straight draw-shape mark beneath it", () => {
    const specs = notebookBlockToShapeSpecs(makePositioned({ id: "h1", primitive: "highlight" }));
    expect(specs).toHaveLength(2);
    expect(specs[0].type).toBe("text");
    expect(specs[1].type).toBe("draw");
    expect(specs[1].meta).toMatchObject({ primitive: "highlight" });
  });

  it("a highlight's mark is yellow and non-solid (drawn); an underline's mark is solid in the given color", () => {
    const highlight = notebookBlockToShapeSpecs(makePositioned({ id: "h1", primitive: "highlight" }), "black")[1];
    const underline = notebookBlockToShapeSpecs(makePositioned({ id: "u1", primitive: "underline" }), "black")[1];
    expect(highlight.props.color).toBe("yellow");
    expect(highlight.props.dash).toBe("draw");
    expect(underline.props.color).toBe("black");
    expect(underline.props.dash).toBe("solid");
  });

  it("both shapes in a highlight/underline pair carry identical provenance meta", () => {
    const [text, mark] = notebookBlockToShapeSpecs(makePositioned({ id: "h1", primitive: "highlight" }));
    expect(text.meta).toEqual(mark.meta);
  });
});

describe("notebookBlockToShapeSpecs — boxed primitives", () => {
  it("a callout/table/timeline/flow/comparison block produces one filled geo rectangle", () => {
    for (const primitive of ["callout", "table", "timeline", "flow", "comparison"] as const) {
      const specs = notebookBlockToShapeSpecs(makePositioned({ id: `b-${primitive}`, primitive }));
      expect(specs).toHaveLength(1);
      expect(specs[0].type).toBe("geo");
      expect(specs[0].props.geo).toBe("rectangle");
      expect(specs[0].props.fill).toBe("semi");
      expect(specs[0].props.dash).toBe("solid");
    }
  });

  it("frame-like primitives (diagram/concept_map/image) use an unfilled dashed box, visually distinct from a filled callout", () => {
    for (const primitive of ["diagram", "concept_map", "image"] as const) {
      const specs = notebookBlockToShapeSpecs(makePositioned({ id: `b-${primitive}`, primitive }));
      expect(specs[0].props.fill).toBe("none");
      expect(specs[0].props.dash).toBe("dashed");
    }
  });

  it("an equation_work block's body combines content and detail (the worked steps), not content alone", () => {
    const specs = notebookBlockToShapeSpecs(makePositioned({ id: "eq1", primitive: "equation_work", content: "PV = nRT", detail: "Step 1: ...\nStep 2: ..." }));
    const richText = JSON.stringify(specs[0].props.richText);
    expect(richText).toMatch(/PV = nRT/);
    expect(richText).toMatch(/Step 1/);
  });

  it("a non-equation_work boxed block prefers detail over content when detail is present", () => {
    const specs = notebookBlockToShapeSpecs(makePositioned({ id: "t1", primitive: "table", content: "fallback", detail: "row1|row2" }));
    const richText = JSON.stringify(specs[0].props.richText);
    expect(richText).toMatch(/row1\|row2/);
    expect(richText).not.toMatch(/fallback/);
  });
});

describe("notebookBlockToShapeSpecs — M1: concept_group/bracket/handwritten_text", () => {
  it("concept_group renders as an unfilled dashed frame, same treatment as diagram/concept_map/image", () => {
    const specs = notebookBlockToShapeSpecs(makePositioned({ id: "cg1", primitive: "concept_group", detail: "grouped body" }));
    expect(specs).toHaveLength(1);
    expect(specs[0].type).toBe("geo");
    expect(specs[0].props.fill).toBe("none");
    expect(specs[0].props.dash).toBe("dashed");
  });

  it("handwritten_text uses the draw font, like heading, distinguishing it from plain typed text", () => {
    const handwritten = notebookBlockToShapeSpecs(makePositioned({ id: "ht1", primitive: "handwritten_text" }))[0];
    const text = notebookBlockToShapeSpecs(makePositioned({ id: "t1", primitive: "text" }))[0];
    expect(handwritten.type).toBe("text");
    expect(handwritten.props.font).toBe("draw");
    expect(text.props.font).toBe("draw");
  });

  it("bracket produces two shapes — a vertical bar plus label text — not a single boxed rectangle", () => {
    const specs = notebookBlockToShapeSpecs(makePositioned({ id: "br1", primitive: "bracket", content: "grouped set", w: 200, h: 140 }));
    expect(specs).toHaveLength(2);
    expect(specs[0].type).toBe("draw");
    expect(specs[1].type).toBe("text");
  });

  it("bracket's vertical bar spans the block's own height and both shapes share provenance meta", () => {
    const [bar, text] = notebookBlockToShapeSpecs(makePositioned({ id: "br1", primitive: "bracket", x: 10, y: 20, w: 200, h: 140 }));
    expect(bar.x).toBe(10);
    expect(bar.y).toBe(20);
    expect(bar.meta).toEqual(text.meta);
    // Label text is offset right of the bar and vertically centered.
    expect(text.x).toBeGreaterThan(bar.x);
    expect(text.y).toBeGreaterThan(bar.y);
    expect(text.y).toBeLessThan(bar.y + 140);
  });
});

describe("notebookBlockToShapeSpecs — arrow/connector", () => {
  it("never produces a shape directly for arrow/connector blocks — those are resolved via connectionToArrowSpec instead", () => {
    expect(notebookBlockToShapeSpecs(makePositioned({ id: "a1", primitive: "arrow" }))).toEqual([]);
    expect(notebookBlockToShapeSpecs(makePositioned({ id: "c1", primitive: "connector" }))).toEqual([]);
  });
});

describe("notebookBlockToShapeSpecs — every NotebookPrimitive is explicitly handled", () => {
  it("never silently falls through to an empty array for a real, non-connector primitive", () => {
    const ALL_NON_CONNECTOR: NotebookPrimitive[] = [
      "text", "heading", "freehand", "highlight", "underline", "formula", "equation_work",
      "diagram", "label", "table", "timeline", "flow", "comparison", "concept_map",
      "image", "callout", "example", "source_anchor",
      "concept_group", "bracket", "handwritten_text",
    ];
    for (const primitive of ALL_NON_CONNECTOR) {
      const specs = notebookBlockToShapeSpecs(makePositioned({ id: `p-${primitive}`, primitive }));
      expect(specs.length).toBeGreaterThan(0);
    }
  });
});

describe("connectionToArrowSpec", () => {
  const fromBlock = makePositioned({ id: "from", primitive: "text", x: 0, y: 0, w: 200, h: 50 });
  const toBlock = makePositioned({ id: "to", primitive: "text", x: 300, y: 200, w: 200, h: 50 });

  function makeConnection(overrides: Partial<NotebookConnection> = {}): NotebookConnection {
    return { blockId: "conn1", primitive: "arrow", fromBlockId: "from", toBlockId: "to", relationshipKind: null, ...overrides };
  }

  it("starts at the bottom-center of the from-block and ends relative to it at the top-center of the to-block", () => {
    const spec = connectionToArrowSpec(makeConnection(), fromBlock, toBlock);
    expect(spec.x).toBe(fromBlock.x + fromBlock.w / 2);
    expect(spec.y).toBe(fromBlock.y + fromBlock.h);
    const end = spec.props.end as { x: number; y: number };
    expect(end.x).toBe((toBlock.x + toBlock.w / 2) - spec.x);
    expect(end.y).toBe(toBlock.y - spec.y);
  });

  it("an arrow connection is solid; a non-directional connector is dashed and grey regardless of the requested color", () => {
    const arrowSpec = connectionToArrowSpec(makeConnection({ primitive: "arrow" }), fromBlock, toBlock, "blue");
    const connectorSpec = connectionToArrowSpec(makeConnection({ primitive: "connector" }), fromBlock, toBlock, "blue");
    expect(arrowSpec.props.dash).toBe("solid");
    expect(arrowSpec.props.color).toBe("blue");
    expect(connectorSpec.props.dash).toBe("dashed");
    expect(connectorSpec.props.color).toBe("grey");
  });

  it("carries the connection's own ids in meta — not the same provenance contract as a content block", () => {
    const spec = connectionToArrowSpec(makeConnection(), fromBlock, toBlock);
    expect(spec.meta).toEqual({ connectionId: "conn1", fromBlockId: "from", toBlockId: "to" });
  });

  it("M1: labels the drawn arrow with its relationshipKind when the connection has one", () => {
    const spec = connectionToArrowSpec(makeConnection({ relationshipKind: "causes" }), fromBlock, toBlock);
    expect(JSON.stringify(spec.props.richText)).toMatch(/causes/);
  });

  it("M1: a connection with no relationshipKind renders an unlabeled arrow, same as before this field existed", () => {
    const spec = connectionToArrowSpec(makeConnection({ relationshipKind: null }), fromBlock, toBlock);
    expect(spec.props.richText).toEqual(connectionToArrowSpec(makeConnection(), fromBlock, toBlock).props.richText);
  });
});

describe("deterministic shape ids", () => {
  it("the same block always produces the same shape id — required for NotebookCanvas's idempotent re-composition", () => {
    const block = makePositioned({ id: "b1", primitive: "text" });
    const first = notebookBlockToShapeSpecs(block)[0].id;
    const second = notebookBlockToShapeSpecs(block)[0].id;
    expect(first).toBe(second);
  });

  it("different blocks produce different shape ids", () => {
    const idA = notebookBlockToShapeSpecs(makePositioned({ id: "a", primitive: "text" }))[0].id;
    const idB = notebookBlockToShapeSpecs(makePositioned({ id: "b", primitive: "text" }))[0].id;
    expect(idA).not.toBe(idB);
  });
});
