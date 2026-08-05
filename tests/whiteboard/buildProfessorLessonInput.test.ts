// tests/whiteboard/buildProfessorLessonInput.test.ts
import { buildProfessorLessonInput } from "../../lib/whiteboard/buildProfessorLessonInput";
import type { VisualSceneGraph } from "../../lib/whiteboard/visualSceneGraph";

const VSG: VisualSceneGraph = {
  id: "vsg_abc", grammar: "flow", drawType: "flow", sourcePageNumber: 7,
  nodes: [
    { id: "n1", label: "n1", body: "Full body text for n1.", canonicalType: "definition", importanceLevel: "critical", tier: "master", role: "step", position: { x: 0, y: 0 }, size: { w: 290, h: 52 }, sourceId: "n1" },
  ],
  edges: [],
  canvas: { width: 460, height: 200 }, builtAt: 0,
};

describe("buildProfessorLessonInput — never sends raw page text or coordinates", () => {
  it("sends node ids, labels, and body text — never position/size", () => {
    const input = buildProfessorLessonInput({ vsg: VSG, documentId: "doc-1", pageTruthKey: "doc-1::7::t", activeCanonicalUnitId: null });
    expect(input.nodes[0]).toEqual({ id: "n1", label: "n1", body: "Full body text for n1.", canonicalType: "definition", importanceLevel: "critical", role: "step" });
    const serialized = JSON.stringify(input);
    expect(serialized).not.toMatch(/"position"/);
    expect(serialized).not.toMatch(/"size"/);
  });

  it("carries documentId/pageTruthKey/activeCanonicalUnitId through unchanged", () => {
    const input = buildProfessorLessonInput({ vsg: VSG, documentId: "doc-1", pageTruthKey: "doc-1::7::t", activeCanonicalUnitId: "unit-3" });
    expect(input.documentId).toBe("doc-1");
    expect(input.pageTruthKey).toBe("doc-1::7::t");
    expect(input.activeCanonicalUnitId).toBe("unit-3");
  });

  it("uses the vsg's own grammar as a hint, and its content-hash id for cache/identity checks", () => {
    const input = buildProfessorLessonInput({ vsg: VSG, documentId: "doc-1", pageTruthKey: "doc-1::7::t", activeCanonicalUnitId: null });
    expect(input.visualGrammarHint).toBe("flow");
    expect(input.vsgId).toBe("vsg_abc");
  });

  it("never includes raw page text — only per-node body strings, already page-scoped by the VSG", () => {
    const input = buildProfessorLessonInput({ vsg: VSG, documentId: "doc-1", pageTruthKey: "doc-1::7::t", activeCanonicalUnitId: null });
    expect(input).not.toHaveProperty("pageText");
  });
});
