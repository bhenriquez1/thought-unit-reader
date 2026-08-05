// tests/whiteboard/groundProfessorLesson.test.ts
import { groundProfessorLesson, MAX_GROUNDED_TARGETS } from "../../lib/whiteboard/groundProfessorLesson";
import type { VisualSceneGraph } from "../../lib/whiteboard/visualSceneGraph";
import type { ProfessorLessonScript } from "../../lib/whiteboard/professorLessonPlan";

function makeVsg(nodeIds: string[], edgeIds: Array<[string, string, string]> = []): VisualSceneGraph {
  return {
    id: "vsg_test",
    grammar: "flow",
    drawType: "flow",
    nodes: nodeIds.map((id, i) => ({
      id, label: `Label ${id}`, body: `Body text for ${id}`, canonicalType: "core-concept",
      importanceLevel: "high", tier: "step", role: "step",
      position: { x: 0, y: i * 80 }, size: { w: 290, h: 52 }, sourceId: id,
    })),
    edges: edgeIds.map(([id, fromId, toId]) => ({ id, fromId, toId, kind: "sequence" as const })),
    canvas: { width: 460, height: 400 },
    builtAt: 0,
  };
}

function makeScript(overrides: Partial<ProfessorLessonScript> = {}): ProfessorLessonScript {
  return {
    pageTruthKey: "doc::1::t",
    visualGrammar: "concept-map",
    title: "Test Title",
    nodeScripts: [
      { targetId: "n1", shortLabel: "Rapid assessment", narration: "Start here.", tone: "introduce", pace: "normal", emphasize: false },
    ],
    synthesisQuestion: "What comes next?",
    ...overrides,
  };
}

describe("groundProfessorLesson — drops hallucinated ids", () => {
  it("keeps a nodeScript whose targetId matches a real VSG node", () => {
    const vsg = makeVsg(["n1"]);
    const result = groundProfessorLesson(makeScript(), vsg);
    expect(result.nodeScripts).toHaveLength(1);
    expect(result.nodeScripts[0].targetId).toBe("n1");
  });

  it("drops a nodeScript whose targetId is not a real node or edge id — OpenAI never invents nodes", () => {
    const vsg = makeVsg(["n1"]);
    const script = makeScript({
      nodeScripts: [
        { targetId: "n1", shortLabel: "Real", narration: "x", tone: "explain", pace: "normal", emphasize: false },
        { targetId: "made-up-id", shortLabel: "Fake", narration: "x", tone: "explain", pace: "normal", emphasize: false },
      ],
    });
    const result = groundProfessorLesson(script, vsg);
    expect(result.nodeScripts).toHaveLength(1);
    expect(result.nodeScripts[0].targetId).toBe("n1");
  });

  it("keeps edge-referencing entries too", () => {
    const vsg = makeVsg(["n1", "n2"], [["e1", "n1", "n2"]]);
    const script = makeScript({
      nodeScripts: [
        { targetId: "n1", shortLabel: "First", narration: "x", tone: "introduce", pace: "normal", emphasize: false },
        { targetId: "e1", shortLabel: "Leads to", narration: "x", tone: "connect", pace: "normal", emphasize: false },
      ],
    });
    const result = groundProfessorLesson(script, vsg);
    expect(result.nodeScripts.map(n => n.targetId)).toEqual(["n1", "e1"]);
  });
});

describe("groundProfessorLesson — at most one emphasized point", () => {
  it("demotes a second emphasize:true to false, keeping only the first", () => {
    const vsg = makeVsg(["n1", "n2"]);
    const script = makeScript({
      nodeScripts: [
        { targetId: "n1", shortLabel: "First", narration: "x", tone: "introduce", pace: "normal", emphasize: true },
        { targetId: "n2", shortLabel: "Second", narration: "x", tone: "explain", pace: "normal", emphasize: true },
      ],
    });
    const result = groundProfessorLesson(script, vsg);
    expect(result.nodeScripts.filter(n => n.emphasize)).toHaveLength(1);
    expect(result.nodeScripts.find(n => n.targetId === "n1")!.emphasize).toBe(true);
    expect(result.nodeScripts.find(n => n.targetId === "n2")!.emphasize).toBe(false);
  });
});

describe("groundProfessorLesson — density cap", () => {
  it(`caps surviving targets at MAX_GROUNDED_TARGETS (${MAX_GROUNDED_TARGETS}) even when the VSG has more`, () => {
    const ids = Array.from({ length: MAX_GROUNDED_TARGETS + 5 }, (_, i) => `n${i}`);
    const vsg = makeVsg(ids);
    const script = makeScript({
      nodeScripts: ids.map(id => ({ targetId: id, shortLabel: "Label", narration: "x", tone: "explain" as const, pace: "normal" as const, emphasize: false })),
    });
    const result = groundProfessorLesson(script, vsg);
    expect(result.nodeScripts.length).toBeLessThanOrEqual(MAX_GROUNDED_TARGETS);
  });
});

describe("groundProfessorLesson — duplicate targetId collapse", () => {
  it("keeps only the first entry for a repeated targetId", () => {
    const vsg = makeVsg(["n1"]);
    const script = makeScript({
      nodeScripts: [
        { targetId: "n1", shortLabel: "First version", narration: "x", tone: "introduce", pace: "normal", emphasize: false },
        { targetId: "n1", shortLabel: "Second version", narration: "y", tone: "explain", pace: "normal", emphasize: false },
      ],
    });
    const result = groundProfessorLesson(script, vsg);
    expect(result.nodeScripts).toHaveLength(1);
    expect(result.nodeScripts[0].shortLabel).toBe("First version");
  });
});

describe("groundProfessorLesson — short labels, no paragraph-shaped nodes", () => {
  it("clamps an over-long shortLabel to a short phrase", () => {
    const vsg = makeVsg(["n1"]);
    const script = makeScript({
      nodeScripts: [{
        targetId: "n1",
        shortLabel: "The clinician should perform a rapid initial assessment of the patient before doing anything else at all",
        narration: "x", tone: "explain", pace: "normal", emphasize: false,
      }],
    });
    const result = groundProfessorLesson(script, vsg);
    expect(result.nodeScripts[0].shortLabel.split(" ").length).toBeLessThanOrEqual(8);
  });

  it("re-clamps a shortLabel that is still paragraph-shaped (multiple sentences) after the first clamp", () => {
    const vsg = makeVsg(["n1"]);
    // Long enough, and dense enough in sentence-enders, that an 8-word clamp
    // alone still leaves more than one sentence — the secondary clamp must
    // shrink it further rather than accept a multi-sentence label.
    const script = makeScript({
      nodeScripts: [{
        targetId: "n1", shortLabel: "X. Y. Z. W. Phase two is Y and Z happens too eventually.",
        narration: "x", tone: "explain", pace: "normal", emphasize: false,
      }],
    });
    const result = groundProfessorLesson(script, vsg);
    const label = result.nodeScripts[0].shortLabel;
    expect(label.split(" ").length).toBeLessThanOrEqual(8);
    const sentenceEnders = (label.match(/[.!?](?:\s|$)/g) ?? []).length;
    expect(sentenceEnders).toBeLessThanOrEqual(1);
  });

  it("clamps the title to a short hand-written phrase", () => {
    const vsg = makeVsg(["n1"]);
    const script = makeScript({ title: "This Is A Much Longer Title Than The Professor Would Actually Hand Write On The Board" });
    const result = groundProfessorLesson(script, vsg);
    expect(result.title.split(" ").length).toBeLessThanOrEqual(6);
  });
});

describe("groundProfessorLesson — never throws, even on a fully-hallucinated script", () => {
  it("returns an empty nodeScripts array rather than crashing", () => {
    const vsg = makeVsg(["n1"]);
    const script = makeScript({ nodeScripts: [{ targetId: "bogus", shortLabel: "x", narration: "x", tone: "explain", pace: "normal", emphasize: false }] });
    expect(() => groundProfessorLesson(script, vsg)).not.toThrow();
    expect(groundProfessorLesson(script, vsg).nodeScripts).toEqual([]);
  });
});
