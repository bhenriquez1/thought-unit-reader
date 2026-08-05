// tests/whiteboard/deterministicLessonScript.test.ts
import { buildDeterministicLessonScript } from "../../lib/whiteboard/deterministicLessonScript";
import type { VisualSceneGraph } from "../../lib/whiteboard/visualSceneGraph";

function makeVsg(): VisualSceneGraph {
  return {
    id: "vsg_test", grammar: "flow", drawType: "flow",
    nodes: [
      { id: "n1", label: "Aspirin overdose causes rapid deterioration if untreated", body: "Long body text about aspirin overdose.", canonicalType: "definition", importanceLevel: "critical", tier: "master", role: "step", position: { x: 0, y: 0 }, size: { w: 290, h: 52 }, sourceId: "n1" },
      { id: "n2", label: "Airway breathing circulation", body: "ABC assessment body text.", canonicalType: "procedure", importanceLevel: "high", tier: "step", role: "step", position: { x: 0, y: 80 }, size: { w: 290, h: 52 }, sourceId: "n2" },
    ],
    edges: [{ id: "e1", fromId: "n1", toId: "n2", kind: "sequence", label: "leads to" }],
    canvas: { width: 460, height: 300 }, builtAt: 0,
  };
}

describe("buildDeterministicLessonScript — AI-free, never-empty fallback", () => {
  it("produces at least one nodeScript per real VSG node/edge", () => {
    const script = buildDeterministicLessonScript(makeVsg());
    expect(script.nodeScripts.length).toBeGreaterThan(0);
  });

  it("every targetId is a real node or edge id from the vsg — cannot hallucinate", () => {
    const vsg = makeVsg();
    const validIds = new Set([...vsg.nodes.map(n => n.id), ...vsg.edges.map(e => e.id)]);
    const script = buildDeterministicLessonScript(vsg);
    for (const entry of script.nodeScripts) {
      expect(validIds.has(entry.targetId)).toBe(true);
    }
  });

  it("shortLabels are clamped to <=8 words even though VSG node.label can be long", () => {
    const script = buildDeterministicLessonScript(makeVsg());
    for (const entry of script.nodeScripts) {
      expect(entry.shortLabel.split(" ").length).toBeLessThanOrEqual(8);
    }
  });

  it("exactly one node is emphasized — the highest-importance one", () => {
    const script = buildDeterministicLessonScript(makeVsg());
    const emphasized = script.nodeScripts.filter(n => n.emphasize);
    expect(emphasized).toHaveLength(1);
    expect(emphasized[0].targetId).toBe("n1"); // critical importance
  });

  it("is deterministic — same vsg always produces an equal script", () => {
    const vsg = makeVsg();
    expect(buildDeterministicLessonScript(vsg)).toEqual(buildDeterministicLessonScript(vsg));
  });

  it("never throws on an empty vsg", () => {
    const empty: VisualSceneGraph = { id: "vsg_empty", grammar: "flow", drawType: "flow", nodes: [], edges: [], canvas: { width: 460, height: 300 }, builtAt: 0 };
    expect(() => buildDeterministicLessonScript(empty)).not.toThrow();
    expect(buildDeterministicLessonScript(empty).nodeScripts).toEqual([]);
  });
});
