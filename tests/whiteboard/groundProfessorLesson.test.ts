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
    learningObjective: "Explain the key idea in your own words.",
    nodeScripts: [
      { targetId: "n1", shortLabel: "Rapid assessment", narration: "Start here.", tone: "introduce", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", relationships: [], explain: [] },
    ],
    groups: [],
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
        { targetId: "n1", shortLabel: "Real", narration: "x", tone: "explain", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", relationships: [], explain: [] },
        { targetId: "made-up-id", shortLabel: "Fake", narration: "x", tone: "explain", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", relationships: [], explain: [] },
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
        { targetId: "n1", shortLabel: "First", narration: "x", tone: "introduce", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", relationships: [], explain: [] },
        { targetId: "e1", shortLabel: "Leads to", narration: "x", tone: "connect", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", relationships: [], explain: [] },
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
        { targetId: "n1", shortLabel: "First", narration: "x", tone: "introduce", pace: "normal", emphasize: true, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "circle", relationships: [], explain: [] },
        { targetId: "n2", shortLabel: "Second", narration: "x", tone: "explain", pace: "normal", emphasize: true, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "circle", relationships: [], explain: [] },
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
      nodeScripts: ids.map(id => ({ targetId: id, shortLabel: "Label", narration: "x", tone: "explain" as const, pace: "normal" as const, emphasize: false, teachingRole: "context" as const, spatialIntent: "central-mechanism" as const, drawingIntent: "plain" as const, emphasisTreatment: "none" as const, relationships: [], explain: [] })),
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
        { targetId: "n1", shortLabel: "First version", narration: "x", tone: "introduce", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", relationships: [], explain: [] },
        { targetId: "n1", shortLabel: "Second version", narration: "y", tone: "explain", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", relationships: [], explain: [] },
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
        narration: "x", tone: "explain", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", relationships: [], explain: [],
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
        narration: "x", tone: "explain", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", relationships: [], explain: [],
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
    const script = makeScript({ nodeScripts: [{ targetId: "bogus", shortLabel: "x", narration: "x", tone: "explain", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", relationships: [], explain: [] }] });
    expect(() => groundProfessorLesson(script, vsg)).not.toThrow();
    expect(groundProfessorLesson(script, vsg).nodeScripts).toEqual([]);
  });
});

describe("groundProfessorLesson — groups", () => {
  function twoNodeScripts() {
    return [
      { targetId: "n1", shortLabel: "First", narration: "x", tone: "introduce" as const, pace: "normal" as const, emphasize: false, teachingRole: "context" as const, spatialIntent: "central-mechanism" as const, drawingIntent: "plain" as const, emphasisTreatment: "none" as const, relationships: [], explain: [] },
      { targetId: "n2", shortLabel: "Second", narration: "y", tone: "explain" as const, pace: "normal" as const, emphasize: false, teachingRole: "context" as const, spatialIntent: "central-mechanism" as const, drawingIntent: "plain" as const, emphasisTreatment: "none" as const, relationships: [], explain: [] },
    ];
  }

  it("keeps a declared group whose nodeIds all reference surviving nodeScripts", () => {
    const vsg = makeVsg(["n1", "n2"]);
    const script = makeScript({
      nodeScripts: twoNodeScripts(),
      groups: [{ id: "g1", type: "core", order: 1, nodeIds: ["n1", "n2"] }],
    });
    const result = groundProfessorLesson(script, vsg);
    expect(result.groups).toEqual([{ id: "g1", type: "core", order: 1, nodeIds: ["n1", "n2"] }]);
  });

  it("drops a group id that isn't a real VSG node id — never rendered, never a reason to crash", () => {
    const vsg = makeVsg(["n1", "n2"]);
    const script = makeScript({
      nodeScripts: twoNodeScripts(),
      groups: [{ id: "g1", type: "core", order: 1, nodeIds: ["n1", "made-up"] }],
    });
    const result = groundProfessorLesson(script, vsg);
    // n2 was narrated but never validly grouped (its only mention was the
    // bogus "made-up" id, which isn't n2) — it still surfaces via the
    // canonicalType-derived fallback rather than vanishing from every group.
    expect(result.groups).toEqual([
      { id: "g1", type: "core", order: 1, nodeIds: ["n1"] },
      { id: "fallback-group-0", type: "core", order: 2, nodeIds: ["n2"] },
    ]);
  });

  it("drops a group id whose node didn't survive grounding (e.g. density-capped)", () => {
    const vsg = makeVsg(["n1", "n2"]);
    const script = makeScript({
      nodeScripts: [twoNodeScripts()[0]], // only n1 narrated
      groups: [{ id: "g1", type: "core", order: 1, nodeIds: ["n1", "n2"] }],
    });
    const result = groundProfessorLesson(script, vsg);
    expect(result.groups).toEqual([{ id: "g1", type: "core", order: 1, nodeIds: ["n1"] }]);
  });

  it("a node double-assigned to two groups keeps only its first assignment", () => {
    const vsg = makeVsg(["n1", "n2"]);
    const script = makeScript({
      nodeScripts: twoNodeScripts(),
      groups: [
        { id: "g1", type: "core", order: 1, nodeIds: ["n1", "n2"] },
        { id: "g2", type: "warning", order: 2, nodeIds: ["n2"] },
      ],
    });
    const result = groundProfessorLesson(script, vsg);
    expect(result.groups).toEqual([{ id: "g1", type: "core", order: 1, nodeIds: ["n1", "n2"] }]);
  });

  it("drops a declared group that ends up with zero surviving nodeIds, falling back to a canonicalType-derived group for the orphaned node", () => {
    const vsg = makeVsg(["n1"]);
    const script = makeScript({
      nodeScripts: [twoNodeScripts()[0]],
      groups: [{ id: "g1", type: "core", order: 1, nodeIds: ["made-up-only"] }],
    });
    const result = groundProfessorLesson(script, vsg);
    expect(result.groups).toEqual([{ id: "fallback-group-0", type: "core", order: 1, nodeIds: ["n1"] }]);
  });

  it("an empty groups array (model declared none) synthesizes a canonicalType-derived fallback covering every surviving node", () => {
    const vsg = makeVsg(["n1", "n2"]); // both default to canonicalType "core-concept" -> "core"
    const script = makeScript({ nodeScripts: twoNodeScripts(), groups: [] });
    const result = groundProfessorLesson(script, vsg);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].type).toBe("core");
    expect(result.groups[0].nodeIds).toEqual(["n1", "n2"]);
    expect(result.groups[0].order).toBe(1);
  });

  it("a node the AI left ungrouped falls into a fallback group appended after the highest declared order", () => {
    const vsg = makeVsg(["n1", "n2"]);
    const script = makeScript({
      nodeScripts: twoNodeScripts(),
      groups: [{ id: "g1", type: "core", order: 3, nodeIds: ["n1"] }],
    });
    const result = groundProfessorLesson(script, vsg);
    expect(result.groups).toHaveLength(2);
    expect(result.groups[0]).toEqual({ id: "g1", type: "core", order: 3, nodeIds: ["n1"] });
    expect(result.groups[1].order).toBe(4);
    expect(result.groups[1].nodeIds).toEqual(["n2"]);
  });

  it("group nodeIds never include an edge id — groups are node-only", () => {
    const vsg = makeVsg(["n1", "n2"], [["e1", "n1", "n2"]]);
    const script = makeScript({
      nodeScripts: [
        { targetId: "n1", shortLabel: "First", narration: "x", tone: "introduce", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", relationships: [], explain: [] },
        { targetId: "e1", shortLabel: "Leads to", narration: "x", tone: "connect", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", relationships: [], explain: [] },
      ],
      groups: [],
    });
    const result = groundProfessorLesson(script, vsg);
    const allGroupedIds = result.groups.flatMap(g => g.nodeIds);
    expect(allGroupedIds).not.toContain("e1");
    expect(allGroupedIds).toEqual(["n1"]);
  });
});

describe("groundProfessorLesson — sanitizes explain[] mini-diagrams", () => {
  function explainAction(overrides: Partial<{
    type: "write" | "icon" | "arrow" | "emphasize";
    id: string | null; text: string | null; icon: any; label: string | null;
    from: string | null; to: string | null; target: string | null; style: any;
  }>) {
    return {
      type: "write" as const, id: null, text: null, icon: null, label: null,
      from: null, to: null, target: null, style: null,
      ...overrides,
    };
  }

  it("keeps a well-formed write -> arrow -> emphasize chain, in order", () => {
    const vsg = makeVsg(["n1"]);
    const script = makeScript({
      nodeScripts: [{
        targetId: "n1", shortLabel: "Hypothermia", narration: "x", tone: "explain", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", relationships: [],
        explain: [
          explainAction({ type: "write", id: "metabolism", text: "less metabolic demand" }),
          explainAction({ type: "arrow", from: "self", to: "metabolism" }),
          explainAction({ type: "emphasize", target: "metabolism", style: "circle" }),
        ],
      }],
    });
    const result = groundProfessorLesson(script, vsg);
    expect(result.nodeScripts[0].explain.map(a => a.type)).toEqual(["write", "arrow", "emphasize"]);
  });

  it("drops an arrow that references an id not yet declared (forward reference)", () => {
    const vsg = makeVsg(["n1"]);
    const script = makeScript({
      nodeScripts: [{
        targetId: "n1", shortLabel: "X", narration: "x", tone: "explain", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", relationships: [],
        explain: [
          explainAction({ type: "arrow", from: "self", to: "notYetDeclared" }),
          explainAction({ type: "write", id: "notYetDeclared", text: "later" }),
        ],
      }],
    });
    const result = groundProfessorLesson(script, vsg);
    expect(result.nodeScripts[0].explain.map(a => a.type)).toEqual(["write"]);
  });

  it("drops an emphasize whose target was never declared and never 'self'", () => {
    const vsg = makeVsg(["n1"]);
    const script = makeScript({
      nodeScripts: [{
        targetId: "n1", shortLabel: "X", narration: "x", tone: "explain", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", relationships: [],
        explain: [explainAction({ type: "emphasize", target: "ghost", style: "circle" })],
      }],
    });
    const result = groundProfessorLesson(script, vsg);
    expect(result.nodeScripts[0].explain).toEqual([]);
  });

  it("'self' is always a valid arrow/emphasize reference, with no write/icon declaring it", () => {
    const vsg = makeVsg(["n1"]);
    const script = makeScript({
      nodeScripts: [{
        targetId: "n1", shortLabel: "X", narration: "x", tone: "explain", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", relationships: [],
        explain: [explainAction({ type: "emphasize", target: "self", style: "highlight" })],
      }],
    });
    const result = groundProfessorLesson(script, vsg);
    expect(result.nodeScripts[0].explain).toHaveLength(1);
  });

  it("drops a duplicate local id — the second write with the same id is dropped, not overwritten", () => {
    const vsg = makeVsg(["n1"]);
    const script = makeScript({
      nodeScripts: [{
        targetId: "n1", shortLabel: "X", narration: "x", tone: "explain", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", relationships: [],
        explain: [
          explainAction({ type: "write", id: "a", text: "first" }),
          explainAction({ type: "write", id: "a", text: "second" }),
        ],
      }],
    });
    const result = groundProfessorLesson(script, vsg);
    expect(result.nodeScripts[0].explain).toHaveLength(1);
    expect((result.nodeScripts[0].explain[0] as any).text).toBe("first");
  });

  it("clamps an over-long write text to a short fragment", () => {
    const vsg = makeVsg(["n1"]);
    const script = makeScript({
      nodeScripts: [{
        targetId: "n1", shortLabel: "X", narration: "x", tone: "explain", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", relationships: [],
        explain: [explainAction({ type: "write", id: "a", text: "this fragment has way more words than a hand-drawn aside should ever have" })],
      }],
    });
    const result = groundProfessorLesson(script, vsg);
    expect((result.nodeScripts[0].explain[0] as any).text.split(" ").length).toBeLessThanOrEqual(5);
  });

  it("caps the total surviving explain actions at 6", () => {
    const vsg = makeVsg(["n1"]);
    const many = Array.from({ length: 10 }, (_, i) => explainAction({ type: "write", id: `w${i}`, text: `frag ${i}` }));
    const script = makeScript({
      nodeScripts: [{ targetId: "n1", shortLabel: "X", narration: "x", tone: "explain", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", relationships: [], explain: many }],
    });
    const result = groundProfessorLesson(script, vsg);
    expect(result.nodeScripts[0].explain.length).toBeLessThanOrEqual(6);
  });

  it("an edge-target nodeScript entry never gets an explain mini-diagram, even if the AI provided one", () => {
    const vsg = makeVsg(["n1", "n2"], [["e1", "n1", "n2"]]);
    const script = makeScript({
      nodeScripts: [
        { targetId: "n1", shortLabel: "First", narration: "x", tone: "introduce", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", relationships: [], explain: [] },
        {
          targetId: "e1", shortLabel: "Leads to", narration: "x", tone: "connect", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", relationships: [],
          explain: [explainAction({ type: "write", id: "a", text: "should never appear" })],
        },
      ],
    });
    const result = groundProfessorLesson(script, vsg);
    expect(result.nodeScripts.find(n => n.targetId === "e1")!.explain).toEqual([]);
  });

  it("never throws on a malformed explain array", () => {
    const vsg = makeVsg(["n1"]);
    const script = makeScript({
      nodeScripts: [{
        targetId: "n1", shortLabel: "X", narration: "x", tone: "explain", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", relationships: [],
        explain: [
          explainAction({ type: "write", id: null, text: "no id" }),
          explainAction({ type: "icon", id: "i1", icon: null }),
          explainAction({ type: "arrow", from: null, to: "self" }),
        ],
      }],
    });
    expect(() => groundProfessorLesson(script, vsg)).not.toThrow();
    expect(groundProfessorLesson(script, vsg).nodeScripts[0].explain).toEqual([]);
  });
});

describe("groundProfessorLesson — Phase B1: teachingRole/spatialIntent/drawingIntent survive unchanged", () => {
  it("REQUIRED: teachingRole, spatialIntent, and drawingIntent pass through to the grounded entry exactly as declared", () => {
    const vsg = makeVsg(["n1"]);
    const script = makeScript({
      nodeScripts: [{
        targetId: "n1", shortLabel: "X", narration: "x", tone: "explain", pace: "normal", emphasize: false,
        teachingRole: "mechanism", spatialIntent: "warning-aside", drawingIntent: "contrast",
        emphasisTreatment: "none", relationships: [], explain: [],
      }],
    });
    const result = groundProfessorLesson(script, vsg);
    expect(result.nodeScripts[0].teachingRole).toBe("mechanism");
    expect(result.nodeScripts[0].spatialIntent).toBe("warning-aside");
    expect(result.nodeScripts[0].drawingIntent).toBe("contrast");
  });
});

describe("groundProfessorLesson — Phase B1: emphasisTreatment is forced to match the single-winner rule", () => {
  it("REQUIRED: the winning emphasized entry keeps its chosen treatment", () => {
    const vsg = makeVsg(["n1"]);
    const script = makeScript({
      nodeScripts: [{
        targetId: "n1", shortLabel: "X", narration: "x", tone: "warn", pace: "slow", emphasize: true,
        teachingRole: "consequence", spatialIntent: "central-mechanism", drawingIntent: "plain",
        emphasisTreatment: "crossOut", relationships: [], explain: [],
      }],
    });
    const result = groundProfessorLesson(script, vsg);
    expect(result.nodeScripts[0].emphasisTreatment).toBe("crossOut");
  });

  it("REQUIRED: a non-winning (second) emphasize:true entry is forced to emphasisTreatment 'none', even though it asked for a real treatment", () => {
    const vsg = makeVsg(["n1", "n2"]);
    const script = makeScript({
      nodeScripts: [
        { targetId: "n1", shortLabel: "First", narration: "x", tone: "introduce", pace: "normal", emphasize: true, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "circle", relationships: [], explain: [] },
        { targetId: "n2", shortLabel: "Second", narration: "x", tone: "warn", pace: "normal", emphasize: true, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "highlight", relationships: [], explain: [] },
      ],
    });
    const result = groundProfessorLesson(script, vsg);
    expect(result.nodeScripts.find(n => n.targetId === "n1")!.emphasisTreatment).toBe("circle");
    expect(result.nodeScripts.find(n => n.targetId === "n2")!.emphasisTreatment).toBe("none");
  });

  it("a script that never sets emphasize:true never has a non-'none' emphasisTreatment", () => {
    const vsg = makeVsg(["n1"]);
    const script = makeScript({
      nodeScripts: [{
        targetId: "n1", shortLabel: "X", narration: "x", tone: "explain", pace: "normal", emphasize: false,
        teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain",
        emphasisTreatment: "highlight", // AI mistakenly set a treatment despite emphasize:false
        relationships: [], explain: [],
      }],
    });
    const result = groundProfessorLesson(script, vsg);
    expect(result.nodeScripts[0].emphasisTreatment).toBe("none");
  });
});

describe("groundProfessorLesson — Phase B1: sanitizes relationships[]", () => {
  it("REQUIRED: keeps a relationship targeting another real, surviving node", () => {
    const vsg = makeVsg(["n1", "n2"]);
    const script = makeScript({
      nodeScripts: [
        { targetId: "n1", shortLabel: "First", narration: "x", tone: "introduce", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", explain: [], relationships: [{ targetId: "n2", kind: "causes", label: null }] },
        { targetId: "n2", shortLabel: "Second", narration: "x", tone: "explain", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", explain: [], relationships: [] },
      ],
    });
    const result = groundProfessorLesson(script, vsg);
    expect(result.nodeScripts.find(n => n.targetId === "n1")!.relationships).toEqual([{ targetId: "n2", kind: "causes", label: null }]);
  });

  it("REQUIRED: drops a relationship targeting a node that never survived grounding (density-capped/never-narrated)", () => {
    const vsg = makeVsg(["n1", "n2"]);
    const script = makeScript({
      nodeScripts: [
        { targetId: "n1", shortLabel: "First", narration: "x", tone: "introduce", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", explain: [], relationships: [{ targetId: "n2", kind: "causes", label: null }] },
        // n2 deliberately NOT narrated — its only mention is the relationship above.
      ],
    });
    const result = groundProfessorLesson(script, vsg);
    expect(result.nodeScripts[0].relationships).toEqual([]);
  });

  it("REQUIRED: drops a self-referencing relationship", () => {
    const vsg = makeVsg(["n1"]);
    const script = makeScript({
      nodeScripts: [{ targetId: "n1", shortLabel: "X", narration: "x", tone: "explain", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", explain: [], relationships: [{ targetId: "n1", kind: "supports", label: null }] }],
    });
    const result = groundProfessorLesson(script, vsg);
    expect(result.nodeScripts[0].relationships).toEqual([]);
  });

  it("REQUIRED: drops a relationship targeting an edge id — relationships are node-only, like groups", () => {
    const vsg = makeVsg(["n1", "n2"], [["e1", "n1", "n2"]]);
    const script = makeScript({
      nodeScripts: [
        { targetId: "n1", shortLabel: "First", narration: "x", tone: "introduce", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", explain: [], relationships: [{ targetId: "e1", kind: "supports", label: null }] },
        { targetId: "n2", shortLabel: "Second", narration: "x", tone: "explain", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", explain: [], relationships: [] },
        { targetId: "e1", shortLabel: "Leads to", narration: "x", tone: "connect", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", explain: [], relationships: [] },
      ],
    });
    const result = groundProfessorLesson(script, vsg);
    expect(result.nodeScripts.find(n => n.targetId === "n1")!.relationships).toEqual([]);
  });

  it("REQUIRED: deduplicates repeated relationship targets, keeping the first", () => {
    const vsg = makeVsg(["n1", "n2"]);
    const script = makeScript({
      nodeScripts: [
        {
          targetId: "n1", shortLabel: "First", narration: "x", tone: "introduce", pace: "normal", emphasize: false,
          teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", explain: [],
          relationships: [{ targetId: "n2", kind: "causes", label: "first" }, { targetId: "n2", kind: "contrasts", label: "second" }],
        },
        { targetId: "n2", shortLabel: "Second", narration: "x", tone: "explain", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", explain: [], relationships: [] },
      ],
    });
    const result = groundProfessorLesson(script, vsg);
    expect(result.nodeScripts.find(n => n.targetId === "n1")!.relationships).toEqual([{ targetId: "n2", kind: "causes", label: "first" }]);
  });

  it("an edge-target nodeScript entry never gets relationships, even if the AI provided some — same rule as explain[]", () => {
    const vsg = makeVsg(["n1", "n2"], [["e1", "n1", "n2"]]);
    const script = makeScript({
      nodeScripts: [
        { targetId: "n1", shortLabel: "First", narration: "x", tone: "introduce", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", explain: [], relationships: [] },
        { targetId: "n2", shortLabel: "Second", narration: "x", tone: "explain", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", explain: [], relationships: [] },
        { targetId: "e1", shortLabel: "Leads to", narration: "x", tone: "connect", pace: "normal", emphasize: false, teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", explain: [], relationships: [{ targetId: "n1", kind: "supports", label: null }] },
      ],
    });
    const result = groundProfessorLesson(script, vsg);
    expect(result.nodeScripts.find(n => n.targetId === "e1")!.relationships).toEqual([]);
  });

  it("never throws on a malformed relationships array", () => {
    const vsg = makeVsg(["n1"]);
    const script = makeScript({
      nodeScripts: [{
        targetId: "n1", shortLabel: "X", narration: "x", tone: "explain", pace: "normal", emphasize: false,
        teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain", emphasisTreatment: "none", explain: [],
        relationships: [{ targetId: "", kind: "supports", label: null }, { targetId: "does-not-exist", kind: "causes", label: null }],
      }],
    });
    expect(() => groundProfessorLesson(script, vsg)).not.toThrow();
    expect(groundProfessorLesson(script, vsg).nodeScripts[0].relationships).toEqual([]);
  });
});
