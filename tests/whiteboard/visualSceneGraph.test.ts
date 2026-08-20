// tests/whiteboard/visualSceneGraph.test.ts
// Tests for lib/whiteboard/visualSceneGraph.ts

import {
  buildVSG,
  computeVSGState,
  noteCardsToCanonicalEntries,
  surgeonAnnotationsToCanonicalEntries,
  pageRoleToWhiteboardGrammar,
  VSGNodeSchema,
  type NoteCardLike,
  type VisualSceneGraph,
} from "../../lib/whiteboard/visualSceneGraph";
import type { CanonicalEntryInput } from "../../lib/whiteboard/canonicalRelationshipGraph";
import type { GroundedSurgeonAnnotation } from "../../lib/highlights/groundSurgeonQuotes";
import type { CanonicalType, Importance } from "../../lib/insights/pageAnnotationPlan";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CAUSE: CanonicalEntryInput = {
  id: "c1",
  text: "Acid attack causes demineralization of enamel",
  canonicalType: "cause",
  importanceScore: 80,
};

const EFFECT: CanonicalEntryInput = {
  id: "e1",
  text: "Demineralization leads to caries formation",
  canonicalType: "effect",
  importanceScore: 75,
};

const PROCESS: CanonicalEntryInput = {
  id: "p1",
  text: "Remineralization restores lost mineral content",
  canonicalType: "process",
  importanceScore: 65,
};

const DEFINITION: CanonicalEntryInput = {
  id: "d1",
  text: "Caries is a microbial disease of dental hard tissue",
  title: "Caries",
  canonicalType: "definition",
  importanceScore: 40,
};

const WARNING: CanonicalEntryInput = {
  id: "w1",
  text: "Do not confuse remineralization speed with fluoride concentration",
  canonicalType: "warning",
  importanceScore: 60,
};

const INDICATION: CanonicalEntryInput = {
  id: "i1",
  text: "Fluoride varnish indicated for high-caries-risk patients",
  canonicalType: "indication",
  priorityTier: 4,
};

const CONTRAINDICATION: CanonicalEntryInput = {
  id: "ci1",
  text: "Avoid fluoride in patients with fluorosis",
  canonicalType: "contraindication",
  priorityTier: 4,
};

const HIGH_YIELD: CanonicalEntryInput = {
  id: "h1",
  text: "Most tested board concept: acid-base balance in caries",
  canonicalType: "high-yield",
  importanceScore: 90,
};

// ── noteCardsToCanonicalEntries ───────────────────────────────────────────────

describe("noteCardsToCanonicalEntries", () => {
  const cards: NoteCardLike[] = [
    { type: "must_know",  title: "Fluoride Mechanism", body: "Fluoride hardens enamel", priorityTier: 2 },
    { type: "mechanism",  title: "Acid Attack",        body: "Acid dissolves enamel",   priorityTier: 3 },
    { type: "dat_trap",   title: "Common Error",       body: "pH confusion trap",        priorityTier: 1 },
  ];

  it("produces one output per input card", () => {
    const result = noteCardsToCanonicalEntries(cards);
    expect(result).toHaveLength(3);
  });

  it("produces correct id formula: nc_${i}_${title.slice(0,20)} with spaces replaced", () => {
    const result = noteCardsToCanonicalEntries(cards);
    expect(result[0].id).toBe("nc_0_Fluoride_Mechanism");
    expect(result[1].id).toBe("nc_1_Acid_Attack");
    expect(result[2].id).toBe("nc_2_Common_Error");
  });

  it("uses card.body as text", () => {
    const result = noteCardsToCanonicalEntries(cards);
    expect(result[0].text).toBe("Fluoride hardens enamel");
    expect(result[1].text).toBe("Acid dissolves enamel");
    expect(result[2].text).toBe("pH confusion trap");
  });

  it("maps must_know → core-concept", () => {
    const result = noteCardsToCanonicalEntries(cards);
    expect(result[0].canonicalType).toBe("core-concept");
  });

  it("maps mechanism → mechanism", () => {
    const result = noteCardsToCanonicalEntries(cards);
    expect(result[1].canonicalType).toBe("mechanism");
  });

  it("maps dat_trap → common-error", () => {
    const result = noteCardsToCanonicalEntries(cards);
    expect(result[2].canonicalType).toBe("common-error");
  });

  it("maps unknown card type to core-concept fallback", () => {
    const unknown: NoteCardLike[] = [
      { type: "unknown_type_xyz", title: "X", body: "Some text", priorityTier: null },
    ];
    const result = noteCardsToCanonicalEntries(unknown);
    expect(result[0].canonicalType).toBe("core-concept");
  });

  it("uses custom prefix when provided", () => {
    const result = noteCardsToCanonicalEntries(cards, "page");
    expect(result[0].id).toMatch(/^page_/);
  });

  it("truncates title to 20 chars in the id", () => {
    const longTitle: NoteCardLike[] = [
      { type: "must_know", title: "A".repeat(50), body: "body", priorityTier: null },
    ];
    const result = noteCardsToCanonicalEntries(longTitle);
    // id format: nc_0_<first 20 chars of title>
    const titlePart = result[0].id.replace("nc_0_", "");
    expect(titlePart.length).toBe(20);
  });

  it("passes priorityTier through to output", () => {
    const result = noteCardsToCanonicalEntries(cards);
    expect(result[0].priorityTier).toBe(2);
  });

  it("treats null priorityTier as undefined", () => {
    const withNull: NoteCardLike[] = [
      { type: "must_know", title: "Test", body: "body", priorityTier: null },
    ];
    const result = noteCardsToCanonicalEntries(withNull);
    expect(result[0].priorityTier).toBeUndefined();
  });
});

// ── computeVSGState — empty entries ──────────────────────────────────────────

describe("computeVSGState — empty entries", () => {
  it("returns status=empty for an empty entries array", () => {
    const state = computeVSGState([], "flow");
    expect(state.status).toBe("empty");
  });

  it("includes a reason string in the empty state", () => {
    const state = computeVSGState([], "flow");
    if (state.status === "empty") {
      expect(typeof state.reason).toBe("string");
      expect(state.reason.length).toBeGreaterThan(0);
    }
  });
});

// ── computeVSGState — valid entries ──────────────────────────────────────────

describe("computeVSGState — valid entries", () => {
  it("returns status=ready for valid entries", () => {
    const state = computeVSGState([CAUSE, EFFECT, PROCESS], "flow");
    expect(state.status).toBe("ready");
  });

  it("ready state contains a vsg object", () => {
    const state = computeVSGState([CAUSE, EFFECT], "flow");
    expect(state.status).toBe("ready");
    if (state.status === "ready") {
      expect(state.vsg).toBeDefined();
    }
  });

  it("vsg has nodes array", () => {
    const state = computeVSGState([CAUSE, EFFECT, PROCESS], "flow");
    if (state.status === "ready") {
      expect(Array.isArray(state.vsg.nodes)).toBe(true);
      expect(state.vsg.nodes.length).toBeGreaterThan(0);
    }
  });

  it("vsg has edges array", () => {
    const state = computeVSGState([CAUSE, EFFECT], "flow");
    if (state.status === "ready") {
      expect(Array.isArray(state.vsg.edges)).toBe(true);
    }
  });

  it("vsg has canvas with width and height", () => {
    const state = computeVSGState([CAUSE, EFFECT], "flow");
    if (state.status === "ready") {
      expect(state.vsg.canvas.width).toBeGreaterThan(0);
      expect(state.vsg.canvas.height).toBeGreaterThan(0);
    }
  });

  it("vsg has grammar field", () => {
    const state = computeVSGState([CAUSE, EFFECT], "flow");
    if (state.status === "ready") {
      expect(state.vsg.grammar).toBeTruthy();
    }
  });

  it("vsg has drawType field", () => {
    const state = computeVSGState([CAUSE, EFFECT], "flow");
    if (state.status === "ready") {
      expect(state.vsg.drawType).toBeTruthy();
    }
  });
});

// ── VSGNodeSchema — all nodes pass validation ─────────────────────────────────

describe("VSGNodeSchema — all nodes pass validation", () => {
  it("every node in the vsg passes VSGNodeSchema", () => {
    const state = computeVSGState([CAUSE, EFFECT, PROCESS, WARNING, DEFINITION], "flow");
    expect(state.status).toBe("ready");
    if (state.status === "ready") {
      for (const node of state.vsg.nodes) {
        expect(() => VSGNodeSchema.parse(node)).not.toThrow();
      }
    }
  });

  it("every node has a non-empty tier field", () => {
    const state = computeVSGState([CAUSE, EFFECT, PROCESS], "flow");
    if (state.status === "ready") {
      for (const node of state.vsg.nodes) {
        expect(["master", "step", "decision", "danger", "pearl"]).toContain(node.tier);
      }
    }
  });

  it("every node has a role field", () => {
    const state = computeVSGState([CAUSE, EFFECT, PROCESS], "flow");
    if (state.status === "ready") {
      for (const node of state.vsg.nodes) {
        expect(node.role).toBeTruthy();
      }
    }
  });

  it("every node has a position with x and y numbers", () => {
    const state = computeVSGState([CAUSE, EFFECT, PROCESS], "flow");
    if (state.status === "ready") {
      for (const node of state.vsg.nodes) {
        expect(typeof node.position.x).toBe("number");
        expect(typeof node.position.y).toBe("number");
      }
    }
  });

  it("every node has a size with w and h numbers", () => {
    const state = computeVSGState([CAUSE, EFFECT, PROCESS], "flow");
    if (state.status === "ready") {
      for (const node of state.vsg.nodes) {
        expect(typeof node.size.w).toBe("number");
        expect(typeof node.size.h).toBe("number");
        expect(node.size.w).toBeGreaterThan(0);
        expect(node.size.h).toBeGreaterThan(0);
      }
    }
  });
});

// ── buildVSG — deterministic ID ───────────────────────────────────────────────

describe("buildVSG — deterministic ID", () => {
  it("produces the same vsg.id for the same inputs", () => {
    const entries = [CAUSE, EFFECT, PROCESS];
    const a = buildVSG(entries, "flow");
    const b = buildVSG(entries, "flow");
    expect(a.id).toBe(b.id);
  });

  it("produces a different vsg.id when the grammar changes", () => {
    const entries = [CAUSE, EFFECT, PROCESS];
    const a = buildVSG(entries, "flow");
    const b = buildVSG(entries, "anatomy");
    expect(a.id).not.toBe(b.id);
  });

  it("produces a different vsg.id when the entry set changes", () => {
    const a = buildVSG([CAUSE, EFFECT], "flow");
    const b = buildVSG([CAUSE, PROCESS], "flow");
    expect(a.id).not.toBe(b.id);
  });

  it("produces a different vsg.id when evidence changes under the same stable entry id", () => {
    const a = buildVSG([CAUSE], "flow");
    const b = buildVSG([{ ...CAUSE, text: `${CAUSE.text} Updated evidence.` }], "flow");
    expect(a.id).not.toBe(b.id);
  });

  it("vsg.id starts with the 'vsg_' prefix", () => {
    const vsg = buildVSG([CAUSE, EFFECT], "flow");
    expect(vsg.id).toMatch(/^vsg_/);
  });
});

// ── buildVSG — grammar coercion ───────────────────────────────────────────────

describe("buildVSG — grammar coercion", () => {
  it("'anatomy' grammar produces drawType 'anatomy'", () => {
    const vsg = buildVSG([DEFINITION, CAUSE, EFFECT], "anatomy");
    expect(vsg.drawType).toBe("anatomy");
  });

  it("'flow' grammar produces drawType 'flow' (or comparison/equation override)", () => {
    const vsg = buildVSG([CAUSE, EFFECT], "flow");
    // flow grammar → flow drawType (cause/effect → flow layout; no override)
    expect(vsg.drawType).toBe("flow");
  });

  it("'timeline' grammar produces drawType 'timeline'", () => {
    const vsg = buildVSG([CAUSE, EFFECT, PROCESS], "timeline");
    expect(vsg.drawType).toBe("timeline");
  });

  it("'worked-solution' grammar produces drawType 'equation'", () => {
    const vsg = buildVSG([CAUSE, EFFECT, PROCESS], "worked-solution");
    expect(vsg.drawType).toBe("equation");
  });

  it("unknown grammar string falls back to 'flow' grammar and 'flow' drawType", () => {
    const vsg = buildVSG([CAUSE, EFFECT], "not-a-real-grammar");
    expect(vsg.grammar).toBe("flow");
    expect(vsg.drawType).toBe("flow");
  });

  it("grammar field on the vsg matches the coerced grammar", () => {
    const vsg = buildVSG([CAUSE, EFFECT], "anatomy");
    expect(vsg.grammar).toBe("anatomy");
  });
});

// ── buildVSG — tier mapping ───────────────────────────────────────────────────

describe("buildVSG — tier mapping", () => {
  it("critical importanceLevel → tier 'master'", () => {
    // HIGH_YIELD has importanceScore=90 → critical
    const vsg = buildVSG([HIGH_YIELD], "flow");
    const node = vsg.nodes.find((n) => n.sourceId === "h1")!;
    expect(node.importanceLevel).toBe("critical");
    expect(node.tier).toBe("master");
  });

  it("high importanceLevel → tier 'step'", () => {
    // EFFECT has importanceScore=75 → high
    const vsg = buildVSG([EFFECT], "flow");
    const node = vsg.nodes[0];
    expect(node.importanceLevel).toBe("high");
    expect(node.tier).toBe("step");
  });

  it("medium importanceLevel → tier 'decision'", () => {
    // importanceScore=40 maps to medium (30–54 band)
    const entry: CanonicalEntryInput = {
      id: "med1",
      text: "A medium-importance concept",
      canonicalType: "definition",
      importanceScore: 40,
    };
    const vsg = buildVSG([entry], "flow");
    const node = vsg.nodes[0];
    expect(node.importanceLevel).toBe("medium");
    expect(node.tier).toBe("decision");
  });

  it("reference importanceLevel → tier 'pearl'", () => {
    // importanceScore=20 maps to reference (0–29 band)
    const entry: CanonicalEntryInput = {
      id: "ref1",
      text: "A reference-only background note",
      canonicalType: "definition",
      importanceScore: 20,
    };
    const vsg = buildVSG([entry], "flow");
    const node = vsg.nodes[0];
    expect(node.importanceLevel).toBe("reference");
    expect(node.tier).toBe("pearl");
  });
});

// ── buildVSG — canonical type tier override ───────────────────────────────────

describe("buildVSG — canonical type tier override", () => {
  it("'warning' canonicalType always produces tier 'danger'", () => {
    // WARNING has importanceScore=60 → medium, but canonicalType overrides to danger
    const vsg = buildVSG([WARNING], "flow");
    const node = vsg.nodes[0];
    expect(node.tier).toBe("danger");
  });

  it("'contraindication' canonicalType always produces tier 'danger'", () => {
    const vsg = buildVSG([CONTRAINDICATION], "flow");
    const node = vsg.nodes[0];
    expect(node.tier).toBe("danger");
  });

  it("'common-error' canonicalType always produces tier 'danger'", () => {
    const entry: CanonicalEntryInput = {
      id: "ce1",
      text: "Common mistake about caries progression",
      canonicalType: "common-error",
      importanceScore: 80, // would normally be 'master' without override
    };
    const vsg = buildVSG([entry], "flow");
    const node = vsg.nodes[0];
    expect(node.tier).toBe("danger");
  });

  it("'clinical-pearl' canonicalType always produces tier 'pearl'", () => {
    const entry: CanonicalEntryInput = {
      id: "cp1",
      text: "Clinical pearl: always check for fluorosis first",
      canonicalType: "clinical-pearl",
      importanceScore: 90, // would normally be 'master' without override
    };
    const vsg = buildVSG([entry], "flow");
    const node = vsg.nodes[0];
    expect(node.tier).toBe("pearl");
  });

  it("non-overridden canonical type uses importanceLevel-based tier", () => {
    // CAUSE: canonicalType=cause (no override), importanceScore=80 → critical → master
    const vsg = buildVSG([CAUSE], "flow");
    const node = vsg.nodes[0];
    expect(node.tier).toBe("master");
  });
});

// ── buildVSG — role assignment ────────────────────────────────────────────────

describe("buildVSG — role assignment via resolveTier", () => {
  it("anatomy grammar assigns hub role to the first (most important) node", () => {
    // HIGH_YIELD (score=90) is most important → should be hub
    const entries = [HIGH_YIELD, CAUSE, EFFECT];
    const vsg = buildVSG(entries, "anatomy");
    const hub = vsg.nodes.find((n) => n.role === "hub");
    expect(hub).toBeDefined();
    expect(hub!.sourceId).toBe("h1");
  });

  it("anatomy grammar assigns spoke role to non-hub nodes", () => {
    const entries = [HIGH_YIELD, CAUSE, EFFECT];
    const vsg = buildVSG(entries, "anatomy");
    const spokes = vsg.nodes.filter((n) => n.role === "spoke");
    expect(spokes.length).toBeGreaterThan(0);
  });

  it("flow grammar assigns step role to all nodes", () => {
    const vsg = buildVSG([CAUSE, EFFECT, PROCESS], "flow");
    for (const node of vsg.nodes) {
      expect(node.role).toBe("step");
    }
  });

  it("comparison draw type splits nodes into left and right roles", () => {
    // indication + contraindication → comparison drawType
    const vsg = buildVSG([INDICATION, CONTRAINDICATION], "flow");
    const roles = vsg.nodes.map((n) => n.role);
    expect(roles).toContain("left");
    expect(roles).toContain("right");
  });

  it("timeline grammar assigns step role to all nodes", () => {
    const vsg = buildVSG([CAUSE, EFFECT, PROCESS], "timeline");
    for (const node of vsg.nodes) {
      expect(node.role).toBe("step");
    }
  });
});

// ── buildVSG — edge cases ────────────────────────────────────────────────────

describe("buildVSG — edge cases", () => {
  it("single node produces a vsg with one node and no edges", () => {
    const vsg = buildVSG([CAUSE], "flow");
    expect(vsg.nodes).toHaveLength(1);
    expect(vsg.edges).toHaveLength(0);
  });

  it("respects maxNodes option", () => {
    const entries = Array.from({ length: 20 }, (_, i): CanonicalEntryInput => ({
      id: `e${i}`,
      text: `Entry text number ${i}`,
      canonicalType: "definition",
      importanceScore: i * 4,
    }));
    const vsg = buildVSG(entries, "flow", { maxNodes: 5 });
    expect(vsg.nodes.length).toBeLessThanOrEqual(5);
  });

  it("canvas width is 460 (CANVAS_W constant)", () => {
    const vsg = buildVSG([CAUSE, EFFECT], "flow");
    expect(vsg.canvas.width).toBe(460);
  });

  it("canvas height is greater than zero", () => {
    const vsg = buildVSG([CAUSE, EFFECT], "flow");
    expect(vsg.canvas.height).toBeGreaterThan(0);
  });

  it("sourcePageNumber is set when pageNumber option is provided", () => {
    const vsg = buildVSG([CAUSE, EFFECT], "flow", { pageNumber: 7 });
    expect(vsg.sourcePageNumber).toBe(7);
  });

  it("sourcePageNumber is undefined when pageNumber option is not provided", () => {
    const vsg = buildVSG([CAUSE, EFFECT], "flow");
    expect(vsg.sourcePageNumber).toBeUndefined();
  });

  it("builtAt is a recent timestamp", () => {
    const before = Date.now();
    const vsg    = buildVSG([CAUSE, EFFECT], "flow");
    const after  = Date.now();
    expect(vsg.builtAt).toBeGreaterThanOrEqual(before);
    expect(vsg.builtAt).toBeLessThanOrEqual(after);
  });
});

// ── surgeonAnnotationsToCanonicalEntries ────────────────────────────────────────
// The deterministic Scene Builder's real data source: converts the grounded,
// page-verified (and already density-limited) output of the
// SurgeonAnnotationPlan pipeline into CanonicalEntryInput[], with no
// Claude/image-generation call involved.

function makeGrounded(overrides: Partial<GroundedSurgeonAnnotation> = {}): GroundedSurgeonAnnotation {
  return {
    canonicalType: "definition",
    exactQuote:    "An element is a substance that cannot be broken down into simpler substances.",
    reason:        "Defines the core term.",
    importance:    "critical",
    treatment:     "definitionBar",
    spanScope:     "fullSentence",
    groundedText:  "An element is a substance that cannot be broken down into simpler substances.",
    groundingState: "exact",
    confidence:    1.0,
    originalIndex: 0,
    ...overrides,
  };
}

describe("surgeonAnnotationsToCanonicalEntries", () => {
  it("returns an empty array for empty input", () => {
    expect(surgeonAnnotationsToCanonicalEntries([], "doc-1", 3)).toEqual([]);
  });

  it("uses groundedText, not exactQuote, as the entry text", () => {
    const g = makeGrounded({ exactQuote: "fragment", groundedText: "The full expanded sentence." });
    const [entry] = surgeonAnnotationsToCanonicalEntries([g], "doc-1", 3);
    expect(entry.text).toBe("The full expanded sentence.");
  });

  it("sets page to the passed pageNumber on every entry", () => {
    const entries = surgeonAnnotationsToCanonicalEntries([makeGrounded(), makeGrounded()], "doc-1", 9);
    expect(entries.every((e) => e.page === 9)).toBe(true);
  });

  it("id matches buildSurgeonEvidenceId(documentId, pageNumber, index) in original order", () => {
    const entries = surgeonAnnotationsToCanonicalEntries(
      [makeGrounded(), makeGrounded(), makeGrounded()],
      "doc-1",
      5,
    );
    expect(entries.map((e) => e.id)).toEqual(["surgeon-doc-1-5-0", "surgeon-doc-1-5-1", "surgeon-doc-1-5-2"]);
  });

  it("REQUIRED: two different documents produce non-colliding ids at the same page+index", () => {
    const a = surgeonAnnotationsToCanonicalEntries([makeGrounded()], "doc-a", 5);
    const b = surgeonAnnotationsToCanonicalEntries([makeGrounded()], "doc-b", 5);
    expect(a[0].id).not.toBe(b[0].id);
  });

  describe("canonicalType mapping — every one of the 8 SurgeonAnnotationPlan values", () => {
    const CASES: Array<[CanonicalType, string]> = [
      ["definition",         "definition"],
      ["mechanism",          "mechanism"],
      ["procedure",          "process"],
      ["decision",           "decision-point"],
      ["comparison",         "comparison"],
      ["trap",               "warning"],
      ["clinicalPearl",      "clinical-pearl"],
      ["supportingEvidence", "evidence"],
    ];

    it.each(CASES)("%s → %s", (canonicalType, expected) => {
      const [entry] = surgeonAnnotationsToCanonicalEntries([makeGrounded({ canonicalType })], "doc-1", 1);
      expect(entry.canonicalType).toBe(expected);
    });
  });

  describe("importance → priorityTier mapping", () => {
    const CASES: Array<[Importance, number]> = [
      ["critical",   5],
      ["high",       4],
      ["supporting", 2],
    ];

    it.each(CASES)("%s → priorityTier %i", (importance, expectedTier) => {
      const [entry] = surgeonAnnotationsToCanonicalEntries([makeGrounded({ importance })], "doc-1", 1);
      expect(entry.priorityTier).toBe(expectedTier);
    });
  });

  it("end-to-end: adapter output builds a ready VSG via computeVSGState", () => {
    const entries = surgeonAnnotationsToCanonicalEntries(
      [makeGrounded({ canonicalType: "definition", importance: "critical" })],
      "doc-1",
      2,
    );
    const state = computeVSGState(entries, "flow", { pageNumber: 2 });
    expect(state.status).toBe("ready");
    if (state.status === "ready") {
      expect(state.vsg.nodes.length).toBeGreaterThan(0);
    }
  });

  it("end-to-end: a trap-typed entry resolves to VSGNode.tier 'danger' — matches the PDF's red trapNotch treatment", () => {
    const entries = surgeonAnnotationsToCanonicalEntries(
      [makeGrounded({ canonicalType: "trap", importance: "supporting" })],
      "doc-1",
      2,
    );
    const state = computeVSGState(entries, "flow", { pageNumber: 2 });
    expect(state.status).toBe("ready");
    if (state.status === "ready") {
      expect(state.vsg.nodes[0].tier).toBe("danger");
    }
  });

  it("end-to-end: a clinicalPearl-typed entry resolves to VSGNode.tier 'pearl' — matches the PDF's cyan pearlMarker treatment", () => {
    const entries = surgeonAnnotationsToCanonicalEntries(
      [makeGrounded({ canonicalType: "clinicalPearl", importance: "high" })],
      "doc-1",
      2,
    );
    const state = computeVSGState(entries, "flow", { pageNumber: 2 });
    expect(state.status).toBe("ready");
    if (state.status === "ready") {
      expect(state.vsg.nodes[0].tier).toBe("pearl");
    }
  });

  describe("relationship → relatesTo resolution (SurgeonAnnotation.relationship wired into VSG edges)", () => {
    it("REQUIRED: resolves relationship.targetIndex (an index into the ORIGINAL annotations array) to the surviving target's real entry id", () => {
      const first  = makeGrounded({ canonicalType: "mechanism", originalIndex: 0 });
      const second = makeGrounded({
        canonicalType: "procedure",
        originalIndex: 1,
        relationship: { type: "cause-effect", targetIndex: 0 },
      });
      const [e0, e1] = surgeonAnnotationsToCanonicalEntries([first, second], "doc-1", 4);
      expect(e1.relatesTo).toBeDefined();
      expect(e1.relatesTo!.targetId).toBe(e0.id);
      expect(e1.relatesTo!.type).toBe("leads_to"); // RelationshipEdgeType for "cause-effect"
    });

    it("maps every relationship.type to its RelationshipEdgeType", () => {
      const target = makeGrounded({ originalIndex: 0 });
      const CASES: Array<["sequence" | "cause-effect" | "comparison" | "supports", string]> = [
        ["sequence",      "summarizes"],
        ["cause-effect",  "leads_to"],
        ["comparison",    "contrasts"],
        ["supports",      "supports"],
      ];
      for (const [relType, expectedEdgeType] of CASES) {
        const source = makeGrounded({ originalIndex: 1, relationship: { type: relType, targetIndex: 0 } });
        const entries = surgeonAnnotationsToCanonicalEntries([target, source], "doc-1", 4);
        expect(entries[1].relatesTo?.type).toBe(expectedEdgeType);
      }
    });

    it("omits relatesTo when targetIndex refers to an annotation that did not survive grounding — no dangling edge", () => {
      // Only one annotation survived (originalIndex 1); it declares a
      // relationship to originalIndex 0, which was dropped upstream (e.g.
      // failed quote verification) and never reaches this adapter at all.
      const survivor = makeGrounded({ originalIndex: 1, relationship: { type: "sequence", targetIndex: 0 } });
      const [entry] = surgeonAnnotationsToCanonicalEntries([survivor], "doc-1", 4);
      expect(entry.relatesTo).toBeUndefined();
    });

    it("omits relatesTo when an annotation without a relationship field is converted", () => {
      const [entry] = surgeonAnnotationsToCanonicalEntries([makeGrounded({ originalIndex: 0 })], "doc-1", 4);
      expect(entry.relatesTo).toBeUndefined();
    });

    it("omits relatesTo for a self-referencing relationship (targetIndex points at its own originalIndex)", () => {
      const g = makeGrounded({ originalIndex: 2, relationship: { type: "sequence", targetIndex: 2 } });
      const [entry] = surgeonAnnotationsToCanonicalEntries([g], "doc-1", 4);
      expect(entry.relatesTo).toBeUndefined();
    });

    it("end-to-end: an explicit relationship produces a real VSG edge via buildVSG, not just RULES-based inference", () => {
      const first  = makeGrounded({ canonicalType: "trap", importance: "high", originalIndex: 0 });
      const second = makeGrounded({
        canonicalType: "clinicalPearl", // maps to VSG type "clinical-pearl" — no RULES row connects it to "warning" (trap)
        importance:    "high",
        originalIndex: 1,
        relationship:  { type: "cause-effect", targetIndex: 0 },
      });
      const entries = surgeonAnnotationsToCanonicalEntries([first, second], "doc-1", 6);
      const vsg = buildVSG(entries, "flow", { pageNumber: 6 });
      const edge = vsg.edges.find((e) => e.fromId === entries[1].id && e.toId === entries[0].id);
      expect(edge).toBeDefined();
      expect(edge!.kind).toBe("causation"); // EDGE_KIND["leads_to"]
    });
  });
});

describe("surgeonAnnotationsToCanonicalEntries — item 4C-4: sourceSentenceId threading", () => {
  it("REQUIRED: threads sourceSentenceId through when groundingState is 'sentenceId'", () => {
    const g = makeGrounded({ groundingState: "sentenceId", sentenceId: "S007" });
    const [entry] = surgeonAnnotationsToCanonicalEntries([g], "doc-1", 3);
    expect(entry.sourceSentenceId).toBe("S007");
  });

  it("REQUIRED: omits sourceSentenceId when groundingState is 'exact' or 'normalized', even if the annotation's own sentenceId field happens to be set — it was NOT what actually resolved this match, so it must not be threaded through as if it were", () => {
    const exactMatch = makeGrounded({ groundingState: "exact", sentenceId: "S003" });
    const [exactEntry] = surgeonAnnotationsToCanonicalEntries([exactMatch], "doc-1", 3);
    expect(exactEntry.sourceSentenceId).toBeUndefined();

    const normalizedMatch = makeGrounded({ groundingState: "normalized", sentenceId: "S003" });
    const [normalizedEntry] = surgeonAnnotationsToCanonicalEntries([normalizedMatch], "doc-1", 3);
    expect(normalizedEntry.sourceSentenceId).toBeUndefined();
  });

  it("REQUIRED end-to-end: sourceSentenceId survives all the way through buildVSG onto the real VSGNode", () => {
    const g = makeGrounded({ groundingState: "sentenceId", sentenceId: "S012", originalIndex: 0 });
    const entries = surgeonAnnotationsToCanonicalEntries([g], "doc-1", 5);
    const vsg = buildVSG(entries, "flow", { pageNumber: 5 });
    expect(vsg.nodes).toHaveLength(1);
    expect(vsg.nodes[0].sourceSentenceId).toBe("S012");
  });
});

describe("pageRoleToWhiteboardGrammar — the shared page classifier picks the Whiteboard's teaching grammar", () => {
  it("maps anatomy to the anatomy (hub-spoke) grammar", () => {
    expect(pageRoleToWhiteboardGrammar("anatomy")).toBe("anatomy");
  });

  it("maps mathematical-derivation and organic-chemistry-reaction to worked-solution", () => {
    expect(pageRoleToWhiteboardGrammar("mathematical-derivation")).toBe("worked-solution");
    expect(pageRoleToWhiteboardGrammar("organic-chemistry-reaction")).toBe("worked-solution");
  });

  it("maps workflow and procedure to pathway", () => {
    expect(pageRoleToWhiteboardGrammar("workflow")).toBe("pathway");
    expect(pageRoleToWhiteboardGrammar("procedure")).toBe("pathway");
  });

  it("maps diagnosis, classification, and decision-tree to case-map (hub-spoke)", () => {
    expect(pageRoleToWhiteboardGrammar("diagnosis")).toBe("case-map");
    expect(pageRoleToWhiteboardGrammar("classification")).toBe("case-map");
    expect(pageRoleToWhiteboardGrammar("decision-tree")).toBe("case-map");
  });

  it("never throws and falls back to flow for null/unknown pageRole", () => {
    expect(pageRoleToWhiteboardGrammar(null)).toBe("flow");
    expect(pageRoleToWhiteboardGrammar(undefined)).toBe("flow");
    expect(pageRoleToWhiteboardGrammar("some-future-value-not-yet-mapped")).toBe("flow");
  });

  it("every mapped value is a real WhiteboardGrammarSchema value", () => {
    const VALID = new Set(["flow", "anatomy", "pathway", "worked-solution", "timeline", "system-diagram", "case-map"]);
    const ALL_PAGE_ROLES = [
      "definition", "procedure", "mechanism", "comparison", "example",
      "anatomy", "physiology", "pharmacology", "diagnosis", "histology",
      "classification", "decision-tree", "workflow",
      "mathematical-derivation", "organic-chemistry-reaction",
    ];
    for (const role of ALL_PAGE_ROLES) {
      expect(VALID.has(pageRoleToWhiteboardGrammar(role))).toBe(true);
    }
  });
});
