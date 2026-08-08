// tests/whiteboard/professorLessonPlan.test.ts
import {
  ProfessorLessonScriptSchema, ProfessorNodeScriptSchema, ExplainIconSchema,
  buildProfessorLessonCacheKey, PLANNER_VERSION,
} from "../../lib/whiteboard/professorLessonPlan";

function validNodeScript() {
  return {
    targetId: "n1", shortLabel: "Rapid assessment", narration: "Start here.", tone: "introduce", pace: "normal",
    emphasize: false, explain: [],
    teachingRole: "context", spatialIntent: "central-mechanism", drawingIntent: "plain",
    emphasisTreatment: "none", relationships: [],
  };
}

function validScript() {
  return {
    pageTruthKey: "doc::1::t",
    visualGrammar: "procedure",
    title: "Test Title",
    learningObjective: "Explain the key idea in your own words.",
    nodeScripts: [validNodeScript()],
    groups: [],
    synthesisQuestion: "What comes next?",
  };
}

describe("ProfessorNodeScriptSchema", () => {
  it("parses a valid entry", () => {
    const parsed = ProfessorNodeScriptSchema.parse(validNodeScript());
    expect(parsed.emphasize).toBe(false);
  });

  it("REQUIRED: emphasize must be explicitly present — no optional+default, for OpenAI Structured Outputs strict-mode compatibility", () => {
    const { emphasize, ...withoutEmphasize } = validNodeScript();
    expect(() => ProfessorNodeScriptSchema.parse(withoutEmphasize)).toThrow();
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

  it("REQUIRED (Phase B1): teachingRole/spatialIntent/drawingIntent/emphasisTreatment/relationships must all be explicitly present — same Structured-Outputs strict-mode discipline as emphasize", () => {
    for (const key of ["teachingRole", "spatialIntent", "drawingIntent", "emphasisTreatment", "relationships"]) {
      const script = validNodeScript() as Record<string, unknown>;
      delete script[key];
      expect(() => ProfessorNodeScriptSchema.parse(script)).toThrow();
    }
  });

  it("rejects an unknown teachingRole/spatialIntent/drawingIntent/emphasisTreatment", () => {
    expect(() => ProfessorNodeScriptSchema.parse({ ...validNodeScript(), teachingRole: "bogus" })).toThrow();
    expect(() => ProfessorNodeScriptSchema.parse({ ...validNodeScript(), spatialIntent: "bogus" })).toThrow();
    expect(() => ProfessorNodeScriptSchema.parse({ ...validNodeScript(), drawingIntent: "bogus" })).toThrow();
    expect(() => ProfessorNodeScriptSchema.parse({ ...validNodeScript(), emphasisTreatment: "bogus" })).toThrow();
  });

  it("accepts all documented spatialIntent values, including the exact composition vocabulary from the brief", () => {
    const values = ["left-branch", "right-branch", "central-mechanism", "warning-aside", "comparison-column", "final-summary"];
    for (const v of values) {
      expect(() => ProfessorNodeScriptSchema.parse({ ...validNodeScript(), spatialIntent: v })).not.toThrow();
    }
  });

  it("accepts up to 3 relationships, each naming another node id, a bounded kind, and an optional label", () => {
    const relationships = [
      { targetId: "n2", kind: "causes", label: "leads to shock" },
      { targetId: "n3", kind: "contrasts", label: null },
      { targetId: "n4", kind: "warns-about", label: "common trap" },
    ];
    expect(() => ProfessorNodeScriptSchema.parse({ ...validNodeScript(), relationships })).not.toThrow();
  });

  it("rejects a 4th relationship entry and an unknown relationship kind", () => {
    const fourRelationships = Array.from({ length: 4 }, (_, i) => ({ targetId: `n${i}`, kind: "supports", label: null }));
    expect(() => ProfessorNodeScriptSchema.parse({ ...validNodeScript(), relationships: fourRelationships })).toThrow();
    expect(() => ProfessorNodeScriptSchema.parse({ ...validNodeScript(), relationships: [{ targetId: "n2", kind: "bogus", label: null }] })).toThrow();
  });
});

describe("ExplainIconSchema — Phase B1 additions", () => {
  it("accepts the 4 domain-general icons added alongside the original 11", () => {
    for (const v of ["lightbulb", "flag", "scale", "link"]) {
      expect(() => ExplainIconSchema.parse(v)).not.toThrow();
    }
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

  it("accepts all 8 documented visualGrammar values, including 'definition'", () => {
    const values = ["definition", "procedure", "mechanism", "anatomy", "diagnosis", "comparison", "equation", "concept-map"];
    for (const v of values) {
      expect(() => ProfessorLessonScriptSchema.parse({ ...validScript(), visualGrammar: v })).not.toThrow();
    }
  });

  it("requires a non-empty synthesisQuestion", () => {
    expect(() => ProfessorLessonScriptSchema.parse({ ...validScript(), synthesisQuestion: "" })).toThrow();
  });

  it("requires a non-empty learningObjective", () => {
    const { learningObjective, ...withoutObjective } = validScript();
    expect(() => ProfessorLessonScriptSchema.parse(withoutObjective)).toThrow();
    expect(() => ProfessorLessonScriptSchema.parse({ ...validScript(), learningObjective: "" })).toThrow();
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
