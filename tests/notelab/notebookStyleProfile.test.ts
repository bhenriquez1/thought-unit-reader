// tests/notelab/notebookStyleProfile.test.ts
// N6 — real behavioral tests for lib/notelab/notebookStyleProfile.ts's pure
// functions (computeNotebookStyleProfile/describeNotebookStyleProfile — no
// IDB dependency) and for buildNotebookPlannerSystemPrompt's (N2) new
// optional styleProfile integration. getRecentNotebookScenes (IDB plumbing)
// is not covered here — no IndexedDB polyfill in this repo's jest config,
// same documented split as tests/knowledge/whiteboardLessonSnapshotStore.test.ts.
//
// What this guards, concretely: personalization is a SOFT bias computed
// purely from the student's own past notebooks — too little history (one
// page's incidental structure) yields no bias at all, never overfits — and
// the rendered prompt paragraph is always explicitly labeled as
// overridable, never phrased as a rule that could relax grounding.

import fs from "fs";
import path from "path";
import {
  computeNotebookStyleProfile, describeNotebookStyleProfile, type NotebookStyleProfile,
} from "../../lib/notelab/notebookStyleProfile";
import { buildNotebookPlannerSystemPrompt } from "../../lib/notelab/notebookPlanner";
import type { VisualNotebookScene, FinalizedNotebookBlock, NotebookPrimitive } from "../../lib/notelab/notebookScene";

function makeBlock(primitive: NotebookPrimitive, overrides: Partial<FinalizedNotebookBlock> = {}): FinalizedNotebookBlock {
  return {
    id: `b-${Math.random()}`,
    primitive,
    content: "content",
    detail: null,
    groupId: null,
    order: 0,
    sourceUnitIndex: -1,
    relationshipKind: null,
    canonicalUnitId: null,
    sourceId: null,
    page: 1,
    confidence: 0.6,
    generatedFrom: "ai",
    ...overrides,
  };
}

function makeScene(blocks: FinalizedNotebookBlock[], overrides: Partial<VisualNotebookScene> = {}): VisualNotebookScene {
  return {
    id: `scene-${Math.random()}`,
    bookId: "book-1",
    pageNumber: 1,
    teachingStructure: null,
    blocks,
    builtAt: Date.now(),
    ...overrides,
  };
}

describe("computeNotebookStyleProfile — insufficient signal returns null", () => {
  it("a single scene never produces a profile, however many blocks it has — one page's structure is not a preference", () => {
    const scene = makeScene([makeBlock("diagram"), makeBlock("diagram"), makeBlock("diagram"), makeBlock("text"), makeBlock("text"), makeBlock("text")]);
    expect(computeNotebookStyleProfile([scene])).toBeNull();
  });

  it("two scenes with too few total blocks still returns null", () => {
    const scenes = [makeScene([makeBlock("text")]), makeScene([makeBlock("diagram")])];
    expect(computeNotebookStyleProfile(scenes)).toBeNull();
  });

  it("zero scenes returns null", () => {
    expect(computeNotebookStyleProfile([])).toBeNull();
  });
});

describe("computeNotebookStyleProfile — real signal", () => {
  function diagramHeavyScenes(): VisualNotebookScene[] {
    return [
      makeScene([makeBlock("diagram"), makeBlock("diagram"), makeBlock("label"), makeBlock("text")]),
      makeScene([makeBlock("diagram"), makeBlock("concept_map"), makeBlock("label"), makeBlock("text")]),
    ];
  }

  it("computes primitiveFrequency fractions that sum to ~1", () => {
    const profile = computeNotebookStyleProfile(diagramHeavyScenes())!;
    const sum = Object.values(profile.primitiveFrequency).reduce((a, b) => a! + b!, 0)!;
    expect(sum).toBeCloseTo(1, 5);
  });

  it("reports sampleSize and totalBlocks accurately", () => {
    const profile = computeNotebookStyleProfile(diagramHeavyScenes())!;
    expect(profile.sampleSize).toBe(2);
    expect(profile.totalBlocks).toBe(8);
  });

  it("topPrimitives never includes arrow/connector — a structural detail, not a content preference", () => {
    const scenes = [
      makeScene([makeBlock("connector"), makeBlock("connector"), makeBlock("connector"), makeBlock("text")]),
      makeScene([makeBlock("connector"), makeBlock("text"), makeBlock("text")]),
    ];
    const profile = computeNotebookStyleProfile(scenes)!;
    expect(profile.topPrimitives).not.toContain("connector");
    expect(profile.topPrimitives).not.toContain("arrow");
  });

  it("diagramDensity reflects the genuinely spatial/structural primitive share", () => {
    const profile = computeNotebookStyleProfile(diagramHeavyScenes())!;
    // 4 of 8 blocks are diagram/concept_map (2 per scene)
    expect(profile.diagramDensity).toBeCloseTo(4 / 8, 5);
  });

  it("workedExampleFrequency counts only example/equation_work", () => {
    const scenes = [
      makeScene([makeBlock("example"), makeBlock("equation_work"), makeBlock("text"), makeBlock("text")]),
      makeScene([makeBlock("text"), makeBlock("text")]),
    ];
    const profile = computeNotebookStyleProfile(scenes)!;
    expect(profile.workedExampleFrequency).toBeCloseTo(2 / 6, 5);
  });

  it("arrowDensity counts only arrow/connector", () => {
    const scenes = [
      makeScene([makeBlock("arrow"), makeBlock("connector"), makeBlock("text"), makeBlock("text")]),
      makeScene([makeBlock("text"), makeBlock("text")]),
    ];
    const profile = computeNotebookStyleProfile(scenes)!;
    expect(profile.arrowDensity).toBeCloseTo(2 / 6, 5);
  });

  it("is pure — the same scenes always produce the same profile", () => {
    const scenes = diagramHeavyScenes();
    expect(computeNotebookStyleProfile(scenes)).toEqual(computeNotebookStyleProfile(scenes));
  });
});

describe("describeNotebookStyleProfile — always framed as a soft, overridable preference", () => {
  function fixtureProfile(overrides: Partial<NotebookStyleProfile> = {}): NotebookStyleProfile {
    return {
      sampleSize: 4, totalBlocks: 20,
      primitiveFrequency: { diagram: 0.4, text: 0.3 },
      topPrimitives: ["diagram", "text", "label"],
      diagramDensity: 0.4, workedExampleFrequency: 0.05, arrowDensity: 0.1,
      ...overrides,
    };
  }

  it("REQUIRED: always states it never overrides grounding or the material", () => {
    const text = describeNotebookStyleProfile(fixtureProfile());
    expect(text).toMatch(/NEVER overrides the grounding rule/);
    expect(text).toMatch(/never let this override a genuinely different structure the material itself calls for/);
  });

  it("REQUIRED: always tells the model never to force a primitive or add filler to match a preference", () => {
    const text = describeNotebookStyleProfile(fixtureProfile());
    expect(text).toMatch(/never force a primitive that doesn't fit the content/);
    expect(text).toMatch(/never add filler blocks just to match a preference/);
  });

  it("describes a high diagramDensity profile as visual/diagram-heavy", () => {
    expect(describeNotebookStyleProfile(fixtureProfile({ diagramDensity: 0.5 }))).toMatch(/visual, diagram-heavy style/);
  });

  it("describes a low diagramDensity profile as text-first", () => {
    expect(describeNotebookStyleProfile(fixtureProfile({ diagramDensity: 0.05 }))).toMatch(/mostly written, text-first style/);
  });

  it("describes a mid-range diagramDensity profile as balanced", () => {
    expect(describeNotebookStyleProfile(fixtureProfile({ diagramDensity: 0.2 }))).toMatch(/balanced mix of text and visuals/);
  });

  it("mentions worked examples only when workedExampleFrequency is meaningfully high", () => {
    expect(describeNotebookStyleProfile(fixtureProfile({ workedExampleFrequency: 0.3 }))).toMatch(/lean heavily on worked examples/);
    expect(describeNotebookStyleProfile(fixtureProfile({ workedExampleFrequency: 0.02 }))).not.toMatch(/lean heavily on worked examples/);
  });
});

describe("buildNotebookPlannerSystemPrompt — N6 personalization integration", () => {
  it("with no styleProfile argument, the prompt is byte-identical to calling it with none at all — fully backward compatible", () => {
    expect(buildNotebookPlannerSystemPrompt()).toBe(buildNotebookPlannerSystemPrompt(undefined));
    expect(buildNotebookPlannerSystemPrompt()).toBe(buildNotebookPlannerSystemPrompt({}));
  });

  it("with styleProfile: null, the prompt is unchanged from the no-argument call", () => {
    expect(buildNotebookPlannerSystemPrompt({ styleProfile: null })).toBe(buildNotebookPlannerSystemPrompt());
  });

  it("REQUIRED: with a real styleProfile, the prompt still contains the full base prompt (grounding rule, primitive vocabulary) unmodified, PLUS the personalization paragraph appended after it", () => {
    const base = buildNotebookPlannerSystemPrompt();
    const profile = computeNotebookStyleProfile([
      makeScene([makeBlock("diagram"), makeBlock("diagram"), makeBlock("text")]),
      makeScene([makeBlock("diagram"), makeBlock("label"), makeBlock("text")]),
    ])!;
    const withProfile = buildNotebookPlannerSystemPrompt({ styleProfile: profile });
    expect(withProfile.startsWith(base)).toBe(true);
    expect(withProfile).toMatch(/PERSONALIZATION \(soft preference only/);
    expect(withProfile.length).toBeGreaterThan(base.length);
  });
});

describe("getRecentNotebookScenes — IDB plumbing (source-inspection; no IDB polyfill in this repo's jest config)", () => {
  const src = fs.readFileSync(path.resolve(__dirname, "../../lib/notelab/notebookStyleProfile.ts"), "utf8");

  it("REQUIRED: reads through getAllUltraNotesAsync (the async/IDB-primary path), never the sync LS-mirror-only getAllUltraNotes", () => {
    const idx = src.indexOf("export async function getRecentNotebookScenes");
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/getAllUltraNotesAsync\(\)/);
    expect(block).not.toMatch(/[^s]getAllUltraNotes\(\)/); // not the sync variant
  });

  it("REQUIRED: filters to notes that actually have a notebookScene before sorting/mapping — never crashes on a note with none", () => {
    const idx = src.indexOf("export async function getRecentNotebookScenes");
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/\.filter\(/);
    expect(block).toMatch(/!!n\.notebookScene/);
  });

  it("sorts most-recently-built scene first", () => {
    const idx = src.indexOf("export async function getRecentNotebookScenes");
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/\.sort\(\(a, b\) => b\.notebookScene\.builtAt - a\.notebookScene\.builtAt\)/);
  });
});
