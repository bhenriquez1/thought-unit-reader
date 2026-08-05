// tests/whiteboard/canonicalRelationshipGraph.test.ts
// Tests for lib/whiteboard/canonicalRelationshipGraph.ts and
//          lib/whiteboard/semanticDiagramLayout.ts

import {
  buildRelationshipGraph,
  type CanonicalEntryInput,
} from "../../lib/whiteboard/canonicalRelationshipGraph";
import {
  buildDiagramPlanFromGraph,
} from "../../lib/whiteboard/semanticDiagramLayout";
import {
  buildVisualPlanFromCanonical,
} from "../../lib/whiteboard/visualPlan";

// ── Fixtures ───────────────────────────────────────────────────────────────

const CAUSE: CanonicalEntryInput    = { id: "c1", text: "Acid attack causes demineralization of enamel", canonicalType: "cause",   importanceScore: 80 };
const EFFECT: CanonicalEntryInput   = { id: "e1", text: "Demineralization leads to caries formation",    canonicalType: "effect",  importanceScore: 75 };
const PROCESS: CanonicalEntryInput  = { id: "p1", text: "Remineralization restores lost mineral content", canonicalType: "process", importanceScore: 65 };
const MECHANISM: CanonicalEntryInput = { id: "m1", text: "Fluoride incorporates into hydroxyapatite crystals", canonicalType: "mechanism", importanceScore: 70 };
const DEFINITION: CanonicalEntryInput = { id: "d1", text: "Caries is a microbial disease of dental hard tissue", title: "Caries", canonicalType: "definition", importanceScore: 40 };
const WARNING: CanonicalEntryInput  = { id: "w1", text: "Do not confuse remineralization speed with fluoride concentration", canonicalType: "warning", importanceScore: 60 };
const HIGH_YIELD: CanonicalEntryInput = { id: "h1", text: "Most tested board concept: acid-base balance in caries", canonicalType: "high-yield", importanceScore: 90 };
const INDICATION: CanonicalEntryInput = { id: "i1", text: "Fluoride varnish indicated for high-caries-risk patients", canonicalType: "indication", priorityTier: 4 };
const CONTRAINDICATION: CanonicalEntryInput = { id: "ci1", text: "Avoid fluoride in patients with fluorosis", canonicalType: "contraindication", priorityTier: 4 };
const COMPARISON: CanonicalEntryInput = { id: "cp1", text: "Composite resin differs from amalgam in bond strength and esthetics", canonicalType: "comparison", priorityTier: 4 };

// ── buildRelationshipGraph — basic output ──────────────────────────────────

describe("buildRelationshipGraph — basic output", () => {
  it("returns empty graph for empty input", () => {
    const g = buildRelationshipGraph([]);
    expect(g.nodes).toHaveLength(0);
    expect(g.edges).toHaveLength(0);
    expect(g.dominantType).toBeNull();
  });

  it("maps each entry to a node", () => {
    const g = buildRelationshipGraph([CAUSE, EFFECT, PROCESS]);
    expect(g.nodes).toHaveLength(3);
    const ids = g.nodes.map((n) => n.id);
    expect(ids).toContain("c1");
    expect(ids).toContain("e1");
    expect(ids).toContain("p1");
  });

  it("each node has id, label, canonicalType, importanceLevel, text", () => {
    const g = buildRelationshipGraph([CAUSE]);
    const n = g.nodes[0];
    expect(n.id).toBe("c1");
    expect(n.label).toBeTruthy();
    expect(n.canonicalType).toBe("cause");
    expect(["critical","high","medium","reference"]).toContain(n.importanceLevel);
    expect(n.text).toBeTruthy();
  });

  it("uses title as node label when present", () => {
    const g = buildRelationshipGraph([DEFINITION]);
    expect(g.nodes[0].label).toBe("Caries");
  });

  it("truncates long text to at most 91 chars (90 + ellipsis) for node label when no title", () => {
    const longEntry: CanonicalEntryInput = {
      id: "l1",
      text: "x".repeat(200),
      canonicalType: "definition",
      importanceScore: 50,
    };
    const g = buildRelationshipGraph([longEntry]);
    expect(g.nodes[0].label.length).toBeLessThanOrEqual(91);
  });

  it("REGRESSION GUARD: never truncates mid-word — cuts at the last word boundary, not a hard character count", () => {
    const longEntry: CanonicalEntryInput = {
      id: "l1",
      text: "The law of conservation of mass, based on careful experimentation, states that matter is neither created nor destroyed in an ordinary chemical reaction.",
      canonicalType: "definition",
      importanceScore: 50,
    };
    const g = buildRelationshipGraph([longEntry]);
    const label = g.nodes[0].label;
    expect(label.endsWith("…")).toBe(true);
    const withoutEllipsis = label.slice(0, -1).trim();
    // The truncated label must be a real word-boundary prefix of the source text.
    expect(longEntry.text.startsWith(withoutEllipsis)).toBe(true);
    expect(longEntry.text[withoutEllipsis.length]).toBe(" ");
  });
});

// ── buildRelationshipGraph — importance ordering ───────────────────────────

describe("buildRelationshipGraph — importance ordering", () => {
  it("places critical nodes first", () => {
    const entries = [DEFINITION, WARNING, HIGH_YIELD];
    const g = buildRelationshipGraph(entries);
    // HIGH_YIELD has importanceScore=90 → critical; should be first
    expect(g.nodes[0].id).toBe("h1");
  });

  it("resolves importanceLevel correctly from importanceScore", () => {
    const g = buildRelationshipGraph([HIGH_YIELD]);
    expect(g.nodes[0].importanceLevel).toBe("critical"); // score=90
  });

  it("falls back to priorityTier when importanceScore absent", () => {
    const g = buildRelationshipGraph([INDICATION]); // priorityTier=4 → high
    expect(g.nodes[0].importanceLevel).toBe("high");
  });

  it("caps nodes at maxNodes", () => {
    const entries = Array.from({ length: 20 }, (_, i) => ({
      id: `e${i}`,
      text: `text ${i}`,
      canonicalType: "definition",
      importanceScore: i,
    }));
    const g = buildRelationshipGraph(entries, 5);
    expect(g.nodes.length).toBe(5);
  });

  it("criticalCount and highCount are accurate", () => {
    const g = buildRelationshipGraph([HIGH_YIELD, CAUSE, EFFECT, DEFINITION]);
    // HIGH_YIELD→critical, CAUSE→critical (score=80), EFFECT→high (score=75), DEFINITION→medium
    expect(g.criticalCount).toBe(2);
    expect(g.highCount).toBe(1);
  });
});

// ── buildRelationshipGraph — edge inference ────────────────────────────────

describe("buildRelationshipGraph — edge inference", () => {
  it("creates cause→effect edge when both types are present", () => {
    const g = buildRelationshipGraph([CAUSE, EFFECT]);
    const edge = g.edges.find((e) => e.from === "c1" && e.to === "e1");
    expect(edge).toBeDefined();
    expect(edge?.type).toBe("leads_to");
  });

  it("creates process→mechanism edge", () => {
    const g = buildRelationshipGraph([PROCESS, MECHANISM]);
    const edge = g.edges.find((e) => e.from === "p1" && e.to === "m1");
    expect(edge).toBeDefined();
    expect(edge?.type).toBe("triggers");
  });

  it("creates indication↔contraindication contrast edge", () => {
    const g = buildRelationshipGraph([INDICATION, CONTRAINDICATION]);
    const edge = g.edges.find((e) => e.type === "contrasts");
    expect(edge).toBeDefined();
  });

  it("does not create self-edges", () => {
    const g = buildRelationshipGraph([CAUSE]);
    expect(g.edges).toHaveLength(0);
  });

  it("does not duplicate edges", () => {
    const g = buildRelationshipGraph([CAUSE, EFFECT, CAUSE, EFFECT]);
    const causeEffectEdges = g.edges.filter((e) => e.from === "c1" && e.to === "e1");
    expect(causeEffectEdges.length).toBeLessThanOrEqual(1);
  });

  it("REGRESSION GUARD: two same-typed nodes with no matching RULES pair still get a connecting edge (sequential fallback) — this is the fix for 'disconnected floating cards'", () => {
    // two definitions — no RULES entry connects definition to definition, but
    // the sequential-fallback pass must still chain them so the diagram never
    // renders two unconnected boxes.
    const g = buildRelationshipGraph([
      { id: "d1", text: "def 1", canonicalType: "definition", importanceScore: 50 },
      { id: "d2", text: "def 2", canonicalType: "definition", importanceScore: 40 },
    ]);
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0].from).toBe("d1");
    expect(g.edges[0].to).toBe("d2");
  });

  it("sequential fallback does not duplicate an edge RULES already created for an adjacent pair", () => {
    const g = buildRelationshipGraph([CAUSE, EFFECT]);
    const causeEffectEdges = g.edges.filter((e) => e.from === "c1" && e.to === "e1");
    expect(causeEffectEdges).toHaveLength(1);
    expect(causeEffectEdges[0].type).toBe("leads_to"); // the specific RULES edge, not the generic fallback
  });

  it("a warning/trap node adjacent to an uncovered node gets a distinct has_warning fallback edge, not a generic one", () => {
    const g = buildRelationshipGraph([
      { id: "d1", text: "Osmosis moves water across a membrane.", canonicalType: "definition", importanceScore: 60 },
      { id: "w1", text: "Do not confuse osmosis with diffusion.", canonicalType: "warning", importanceScore: 55 },
    ]);
    const edge = g.edges.find((e) => e.from === "d1" && e.to === "w1");
    expect(edge).toBeDefined();
    expect(edge?.type).toBe("has_warning");
  });

  it("every node in a larger, otherwise-uncovered set ends up connected (no isolated node)", () => {
    const entries: CanonicalEntryInput[] = [
      { id: "d1", text: "Atomic structure describes how protons, neutrons, and electrons are arranged.", canonicalType: "definition", importanceScore: 90 },
      { id: "d2", text: "The arrangement of electrons determines an element's chemical properties.", canonicalType: "definition", importanceScore: 70 },
      { id: "d3", text: "Physical properties like conductivity and solubility depend on structure.", canonicalType: "definition", importanceScore: 50 },
      { id: "w1", text: "Do not confuse atomic structure with atomic mass.", canonicalType: "warning", importanceScore: 40 },
    ];
    const g = buildRelationshipGraph(entries);
    const connected = new Set<string>();
    for (const e of g.edges) { connected.add(e.from); connected.add(e.to); }
    for (const n of g.nodes) expect(connected.has(n.id)).toBe(true);
  });
});

// ── buildRelationshipGraph — explicit relatesTo edges (SurgeonAnnotation.relationship) ──

describe("buildRelationshipGraph — explicit relatesTo edges take priority over inferred ones", () => {
  it("REQUIRED: an explicit relatesTo produces a real edge with the declared type and label", () => {
    const g = buildRelationshipGraph([
      { id: "a1", text: "Step one of the process.", canonicalType: "core-concept", importanceScore: 90,
        relatesTo: { targetId: "a2", type: "leads_to", label: "leads to" } },
      { id: "a2", text: "Step two of the process.", canonicalType: "core-concept", importanceScore: 80 },
    ]);
    const edge = g.edges.find((e) => e.from === "a1" && e.to === "a2");
    expect(edge).toBeDefined();
    expect(edge?.type).toBe("leads_to");
    expect(edge?.label).toBe("leads to");
  });

  it("falls back to a RULES-table label when the hint doesn't supply its own", () => {
    const g = buildRelationshipGraph([
      { id: "a1", text: "Text one.", canonicalType: "core-concept", importanceScore: 90,
        relatesTo: { targetId: "a2", type: "contrasts" } },
      { id: "a2", text: "Text two.", canonicalType: "core-concept", importanceScore: 80 },
    ]);
    const edge = g.edges.find((e) => e.from === "a1" && e.to === "a2");
    expect(edge?.label).toBe("vs"); // RULES' own label for a "contrasts" edgeType
  });

  it("REQUIRED: an explicit relatesTo takes priority over RULES-based inference for the same pair — no duplicate/conflicting edge", () => {
    // cause -> effect would normally infer a "leads_to" RULES edge; give it an
    // explicit "contrasts" relatesTo instead and confirm the explicit one wins.
    const g = buildRelationshipGraph([
      { ...CAUSE, relatesTo: { targetId: "e1", type: "contrasts", label: "explicit override" } },
      EFFECT,
    ]);
    const edges = g.edges.filter((e) => e.from === "c1" && e.to === "e1");
    expect(edges).toHaveLength(1);
    expect(edges[0].type).toBe("contrasts");
    expect(edges[0].label).toBe("explicit override");
  });

  it("ignores a relatesTo whose targetId doesn't exist among the entries (e.g. dropped by maxNodes, or the model referenced a nonexistent id) — falls back to inference instead of a dangling edge", () => {
    const g = buildRelationshipGraph([
      { id: "a1", text: "Text one.", canonicalType: "definition", importanceScore: 90,
        relatesTo: { targetId: "does-not-exist", type: "leads_to" } },
      { id: "a2", text: "Text two.", canonicalType: "definition", importanceScore: 80 },
    ]);
    expect(g.edges.some((e) => e.to === "does-not-exist")).toBe(false);
    // The sequential fallback still connects the two real nodes.
    expect(g.edges.some((e) => e.from === "a1" && e.to === "a2")).toBe(true);
  });

  it("ignores a self-referencing relatesTo", () => {
    const g = buildRelationshipGraph([
      { id: "a1", text: "Text one.", canonicalType: "definition", importanceScore: 90,
        relatesTo: { targetId: "a1", type: "leads_to" } },
    ]);
    expect(g.edges).toHaveLength(0);
  });

  it("does not duplicate an edge when TWO entries declare relatesTo pointing at each other", () => {
    const g = buildRelationshipGraph([
      { id: "a1", text: "Text one.", canonicalType: "definition", importanceScore: 90,
        relatesTo: { targetId: "a2", type: "leads_to" } },
      { id: "a2", text: "Text two.", canonicalType: "definition", importanceScore: 80,
        relatesTo: { targetId: "a1", type: "leads_to" } },
    ]);
    // Both directions are legitimate distinct edges (a1->a2 and a2->a1), not a
    // silently-collapsed single edge — seenEdge keys on direction, not the pair.
    expect(g.edges.filter((e) => e.from === "a1" && e.to === "a2")).toHaveLength(1);
    expect(g.edges.filter((e) => e.from === "a2" && e.to === "a1")).toHaveLength(1);
  });
});

// ── buildRelationshipGraph — layout selection ──────────────────────────────

describe("buildRelationshipGraph — layout selection", () => {
  it("selects 'flow' for cause/effect dominant type", () => {
    const g = buildRelationshipGraph([CAUSE, EFFECT]);
    expect(g.suggestedLayout).toBe("flow");
  });

  it("selects 'comparison' for indication/contraindication", () => {
    const g = buildRelationshipGraph([INDICATION, CONTRAINDICATION]);
    expect(g.suggestedLayout).toBe("comparison");
  });

  it("selects 'comparison' for the standalone 'comparison' canonicalType (SurgeonAnnotationPlan)", () => {
    const g = buildRelationshipGraph([COMPARISON]);
    expect(g.suggestedLayout).toBe("comparison");
  });

  it("does not regress other suggestedLayout fixtures with the new comparison entry present", () => {
    expect(buildRelationshipGraph([CAUSE, EFFECT]).suggestedLayout).toBe("flow");
    expect(buildRelationshipGraph([PROCESS, MECHANISM]).suggestedLayout).toBe("flow");
  });

  it("selects 'anatomy' for definition/core-concept", () => {
    const entries: CanonicalEntryInput[] = [
      { id: "d1", text: "def 1", canonicalType: "definition", importanceScore: 50 },
      { id: "cc1", text: "cc 1", canonicalType: "core-concept", importanceScore: 60 },
    ];
    const g = buildRelationshipGraph(entries);
    expect(g.suggestedLayout).toBe("anatomy");
  });

  it("selects 'flow' for process/mechanism dominant type", () => {
    const g = buildRelationshipGraph([PROCESS, MECHANISM]);
    expect(g.suggestedLayout).toBe("flow");
  });

  it("dominantType reflects most frequent canonicalType", () => {
    const entries = [CAUSE, EFFECT, PROCESS, MECHANISM, MECHANISM];
    const g = buildRelationshipGraph(entries);
    expect(g.dominantType).toBe("mechanism");
  });
});

// ── buildDiagramPlanFromGraph ──────────────────────────────────────────────

describe("buildDiagramPlanFromGraph", () => {
  it("returns a DiagramPlan with steps", () => {
    const g = buildRelationshipGraph([CAUSE, EFFECT, PROCESS, WARNING]);
    const plan = buildDiagramPlanFromGraph(g);
    expect(plan.steps.length).toBeGreaterThan(0);
  });

  it("plan.nodes includes all nodes from the graph", () => {
    const g = buildRelationshipGraph([CAUSE, EFFECT, PROCESS]);
    const plan = buildDiagramPlanFromGraph(g);
    const planNodeIds = plan.nodes.map((n) => n.id);
    expect(planNodeIds).toContain("c1");
    expect(planNodeIds).toContain("e1");
    expect(planNodeIds).toContain("p1");
  });

  it("all plan nodes have nx/ny positions in 0–1 range", () => {
    const g = buildRelationshipGraph([CAUSE, EFFECT, PROCESS, MECHANISM]);
    const plan = buildDiagramPlanFromGraph(g);
    for (const node of plan.nodes) {
      expect(node.nx).toBeGreaterThanOrEqual(0);
      expect(node.nx).toBeLessThanOrEqual(1);
      expect(node.ny).toBeGreaterThanOrEqual(0);
      expect(node.ny).toBeLessThanOrEqual(1);
    }
  });

  it("plan.arrows reflects edges from the graph", () => {
    const g = buildRelationshipGraph([CAUSE, EFFECT]);
    const plan = buildDiagramPlanFromGraph(g);
    // cause→effect edge should be in the final step
    const allArrows = plan.steps.flatMap((s) => s.arrows ?? []);
    const causeEffectArrow = allArrows.find((a) => a.from === "c1" && a.to === "e1");
    expect(causeEffectArrow).toBeDefined();
  });

  it("warning nodes appear in the plan's warnings field", () => {
    const g = buildRelationshipGraph([CAUSE, WARNING]);
    const plan = buildDiagramPlanFromGraph(g);
    expect(plan.warnings.length).toBeGreaterThan(0);
  });

  it("uses custom title and learningGoal when provided", () => {
    const g = buildRelationshipGraph([CAUSE, EFFECT]);
    const plan = buildDiagramPlanFromGraph(g, { title: "My Title", learningGoal: "My Goal" });
    expect(plan.title).toBe("My Title");
    expect(plan.learningGoal).toBe("My Goal");
  });

  it("handles empty graph gracefully", () => {
    const g = buildRelationshipGraph([]);
    const plan = buildDiagramPlanFromGraph(g);
    expect(plan.steps).toHaveLength(0);
    expect(plan.nodes).toHaveLength(0);
  });
});

// ── buildVisualPlanFromCanonical ───────────────────────────────────────────

describe("buildVisualPlanFromCanonical", () => {
  it("returns a valid visual plan for empty input", () => {
    const vp = buildVisualPlanFromCanonical([]);
    expect(vp.sourceCanonicalUnitIds).toHaveLength(0);
    expect(vp.visualType).toBeTruthy();
  });

  it("populates sourceCanonicalUnitIds with entry ids", () => {
    const entries = [CAUSE, EFFECT, PROCESS];
    const vp = buildVisualPlanFromCanonical(entries);
    expect(vp.sourceCanonicalUnitIds).toEqual(["c1", "e1", "p1"]);
  });

  it("selects 'flowchart' visualType for cause/effect dominant", () => {
    const vp = buildVisualPlanFromCanonical([CAUSE, EFFECT]);
    expect(vp.visualType).toBe("flowchart");
  });

  it("selects 'decision-tree' for indication/contraindication dominant", () => {
    const vp = buildVisualPlanFromCanonical([INDICATION, CONTRAINDICATION]);
    expect(vp.visualType).toBe("decision-tree");
  });

  it("detects 'clinical' subject from indication/treatment types", () => {
    const vp = buildVisualPlanFromCanonical([INDICATION, CONTRAINDICATION]);
    expect(vp.subject).toBe("clinical");
  });

  it("includes warnings from warning/contraindication entries", () => {
    const vp = buildVisualPlanFromCanonical([WARNING, CONTRAINDICATION]);
    expect(vp.warnings.length).toBeGreaterThan(0);
  });

  it("uses pageTitle as topic when provided", () => {
    const vp = buildVisualPlanFromCanonical([CAUSE], "Caries Formation");
    expect(vp.topic).toBe("Caries Formation");
  });

  it("includes sequence from entry titles/text", () => {
    const vp = buildVisualPlanFromCanonical([CAUSE, EFFECT, PROCESS]);
    expect(vp.sequence.length).toBe(3);
  });
});
