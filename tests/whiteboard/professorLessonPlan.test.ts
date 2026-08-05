// tests/whiteboard/professorLessonPlan.test.ts
import {
  ProfessorLessonScriptSchema, ProfessorNodeScriptSchema,
  buildProfessorLessonCacheKey, PLANNER_VERSION,
} from "../../lib/whiteboard/professorLessonPlan";

function validNodeScript() {
  return { targetId: "n1", shortLabel: "Rapid assessment", narration: "Start here.", tone: "introduce", pace: "normal" };
}

function validScript() {
  return {
    pageTruthKey: "doc::1::t",
    visualGrammar: "procedure",
    title: "Test Title",
    nodeScripts: [validNodeScript()],
    synthesisQuestion: "What comes next?",
  };
}

describe("ProfessorNodeScriptSchema", () => {
  it("parses a valid entry, defaulting emphasize to false", () => {
    const parsed = ProfessorNodeScriptSchema.parse(validNodeScript());
    expect(parsed.emphasize).toBe(false);
  });

  it("rejects an unknown tone", () => {
    expect(() => ProfessorNodeScriptSchema.parse({ ...validNodeScript(), tone: "bogus" })).toThrow();
  });

  it("rejects an unknown pace", () => {
    expect(() => ProfessorNodeScriptSchema.parse({ ...validNodeScript(), pace: "medium" })).toThrow();
  });

  it("rejects an empty shortLabel", () => {
    expect(() => ProfessorNodeScriptSchema.parse({ ...validNodeScript(), shortLabel: "" })).toThrow();
  });
});

describe("ProfessorLessonScriptSchema", () => {
  it("parses a valid script", () => {
    expect(() => ProfessorLessonScriptSchema.parse(validScript())).not.toThrow();
  });

  it("requires at least one nodeScript", () => {
    expect(() => ProfessorLessonScriptSchema.parse({ ...validScript(), nodeScripts: [] })).toThrow();
  });

  it("rejects an unknown visualGrammar value", () => {
    expect(() => ProfessorLessonScriptSchema.parse({ ...validScript(), visualGrammar: "bar-chart" })).toThrow();
  });

  it("accepts all 7 documented visualGrammar values", () => {
    const values = ["procedure", "mechanism", "anatomy", "diagnosis", "comparison", "equation", "concept-map"];
    for (const v of values) {
      expect(() => ProfessorLessonScriptSchema.parse({ ...validScript(), visualGrammar: v })).not.toThrow();
    }
  });

  it("requires a non-empty synthesisQuestion", () => {
    expect(() => ProfessorLessonScriptSchema.parse({ ...validScript(), synthesisQuestion: "" })).toThrow();
  });
});

describe("buildProfessorLessonCacheKey — documentId + pageTruthKey + activeCanonicalUnitId + plannerVersion", () => {
  it("embeds all three identity components and the planner version", () => {
    const key = buildProfessorLessonCacheKey({ documentId: "doc-1", pageTruthKey: "doc-1::4::t", activeCanonicalUnitId: "unit-9" });
    expect(key).toContain("doc-1");
    expect(key).toContain("doc-1::4::t");
    expect(key).toContain("unit-9");
    expect(key).toContain(`v${PLANNER_VERSION}`);
  });

  it("a null activeCanonicalUnitId still produces a stable, distinct key", () => {
    const key = buildProfessorLessonCacheKey({ documentId: "doc-1", pageTruthKey: "doc-1::4::t", activeCanonicalUnitId: null });
    expect(key).toContain("none");
  });

  it("different pageTruthKeys produce different keys — current-page ownership", () => {
    const a = buildProfessorLessonCacheKey({ documentId: "doc-1", pageTruthKey: "doc-1::4::t", activeCanonicalUnitId: null });
    const b = buildProfessorLessonCacheKey({ documentId: "doc-1", pageTruthKey: "doc-1::5::t", activeCanonicalUnitId: null });
    expect(a).not.toBe(b);
  });

  it("is deterministic", () => {
    const params = { documentId: "doc-1", pageTruthKey: "doc-1::4::t", activeCanonicalUnitId: "u1" };
    expect(buildProfessorLessonCacheKey(params)).toBe(buildProfessorLessonCacheKey(params));
  });
});
