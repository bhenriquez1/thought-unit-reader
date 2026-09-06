// tests/notelab/notebookDesignerAgent.test.ts
// ND1 — real function-call tests for the NoteLab Designer Agent: the
// quality diagnostic (computeNotebookSceneQualityDiagnostic), the feedback
// builder, and the bounded one-retry orchestration (runNotebookDesignerStep).
// No React/DOM/network dependency — matches tests/notelab/notebookPlanner.test.ts's
// own "real behavioral tests against the actual exported functions" pattern.

import {
  computeNotebookSceneQualityDiagnostic,
  buildNotebookDesignerCorrectionFeedback,
  runNotebookDesignerStep,
  MIN_FINALIZED_BLOCKS,
  GROUNDING_DROP_COUNT_FLOOR,
  GROUNDING_DROP_RATIO_CEILING,
  RICHNESS_RATIO_FLOOR,
  RICH_PRIMITIVE_COUNT_FLOOR,
  type NotebookDesignerGenerateResult,
} from "../../lib/notelab/notebookDesignerAgent";
import type { NotebookPlan, NotebookPlanBlock } from "../../lib/notelab/notebookPlanner";
import type { VisualNotebookScene, FinalizedNotebookBlock, NotebookPrimitive } from "../../lib/notelab/notebookScene";

function planBlock(primitive: NotebookPrimitive, overrides: Partial<NotebookPlanBlock> = {}): NotebookPlanBlock {
  return { primitive, content: `${primitive} content`, detail: null, groupId: null, order: 0, sourceUnitIndex: 0, relationshipKind: null, ...overrides };
}
function finalizedBlock(primitive: NotebookPrimitive, overrides: Partial<FinalizedNotebookBlock> = {}): FinalizedNotebookBlock {
  return {
    id: `nb-${primitive}-${Math.random()}`, primitive, content: `${primitive} content`, detail: null,
    groupId: null, order: 0, sourceUnitIndex: 0, relationshipKind: null,
    canonicalUnitId: "unit-1", sourceId: "doc-1", page: 1, confidence: 0.6, generatedFrom: "ai",
    ...overrides,
  };
}
function plan(blocks: NotebookPlanBlock[]): NotebookPlan {
  return { teachingStructure: null, blocks };
}
function scene(blocks: FinalizedNotebookBlock[]): VisualNotebookScene {
  return { id: "nbscene-1", bookId: "book-1", pageNumber: 1, teachingStructure: null, blocks, builtAt: Date.now() };
}

describe("computeNotebookSceneQualityDiagnostic", () => {
  it("REQUIRED: passes a scene with enough finalized blocks, no grounding drop, and a healthy richness mix", () => {
    const p = plan([planBlock("diagram"), planBlock("table"), planBlock("text")]);
    const s = scene([finalizedBlock("diagram"), finalizedBlock("table"), finalizedBlock("text")]);
    const d = computeNotebookSceneQualityDiagnostic(p, s);
    expect(d.passed).toBe(true);
    expect(d.rejectReasons).toEqual([]);
    expect(d.proposedBlockCount).toBe(3);
    expect(d.finalizedBlockCount).toBe(3);
    expect(d.droppedBlockCount).toBe(0);
  });

  it(`REQUIRED (too_few_blocks): fewer than ${MIN_FINALIZED_BLOCKS} finalized blocks fails`, () => {
    const p = plan([planBlock("diagram")]);
    const s = scene([finalizedBlock("diagram")]);
    const d = computeNotebookSceneQualityDiagnostic(p, s);
    expect(d.passed).toBe(false);
    expect(d.rejectReasons).toContain("too_few_blocks");
  });

  it("REQUIRED: zero finalized blocks (everything dropped) fails on too_few_blocks", () => {
    const p = plan([planBlock("highlight"), planBlock("underline")]);
    const s = scene([]);
    const d = computeNotebookSceneQualityDiagnostic(p, s);
    expect(d.passed).toBe(false);
    expect(d.rejectReasons).toContain("too_few_blocks");
  });

  it(`REQUIRED (high_grounding_drop_rate): dropping >= ${GROUNDING_DROP_COUNT_FLOOR} blocks AND >= ${GROUNDING_DROP_RATIO_CEILING * 100}% of what was proposed fails`, () => {
    // 5 proposed, 2 survive -> 3 dropped, ratio 0.6 >= 0.5 and count 3 >= 2.
    const p = plan([planBlock("highlight"), planBlock("highlight"), planBlock("highlight"), planBlock("diagram"), planBlock("table")]);
    const s = scene([finalizedBlock("diagram"), finalizedBlock("table")]);
    const d = computeNotebookSceneQualityDiagnostic(p, s);
    expect(d.droppedBlockCount).toBe(3);
    expect(d.groundingDropRatio).toBeCloseTo(0.6, 5);
    expect(d.rejectReasons).toContain("high_grounding_drop_rate");
  });

  it("a single dropped block (below the count floor) does NOT trigger high_grounding_drop_rate, even at 100% drop ratio for that one block", () => {
    const p = plan([planBlock("highlight"), planBlock("diagram"), planBlock("table"), planBlock("example")]);
    const s = scene([finalizedBlock("diagram"), finalizedBlock("table"), finalizedBlock("example")]);
    const d = computeNotebookSceneQualityDiagnostic(p, s);
    expect(d.droppedBlockCount).toBe(1);
    expect(d.rejectReasons).not.toContain("high_grounding_drop_rate");
  });

  it(`REQUIRED (low_richness): a scene made almost entirely of text/heading blocks fails when below both the ratio floor (${RICHNESS_RATIO_FLOOR}) and the count floor (${RICH_PRIMITIVE_COUNT_FLOOR})`, () => {
    const p = plan([planBlock("text"), planBlock("text"), planBlock("heading"), planBlock("text")]);
    const s = scene([finalizedBlock("text"), finalizedBlock("text"), finalizedBlock("heading"), finalizedBlock("text")]);
    const d = computeNotebookSceneQualityDiagnostic(p, s);
    expect(d.richPrimitiveCount).toBe(0);
    expect(d.rejectReasons).toContain("low_richness");
  });

  it("REQUIRED: a low ratio still passes richness when the absolute rich-primitive count clears the count floor (ratio OR count, whichever is looser)", () => {
    // 2 rich among 10 total -> ratio 0.2 < 0.3, but richPrimitiveCount 2 >= RICH_PRIMITIVE_COUNT_FLOOR (2).
    const richBlocks = [finalizedBlock("diagram"), finalizedBlock("table")];
    const thinBlocks = Array.from({ length: 8 }, () => finalizedBlock("text"));
    const s = scene([...richBlocks, ...thinBlocks]);
    const p = plan(s.blocks.map((b) => planBlock(b.primitive)));
    const d = computeNotebookSceneQualityDiagnostic(p, s);
    expect(d.richnessRatio).toBeCloseTo(0.2, 5);
    expect(d.rejectReasons).not.toContain("low_richness");
  });

  it("handwritten_text and freehand count as rich (only text/heading are 'thin')", () => {
    const p = plan([planBlock("handwritten_text"), planBlock("freehand"), planBlock("callout")]);
    const s = scene([finalizedBlock("handwritten_text"), finalizedBlock("freehand"), finalizedBlock("callout")]);
    const d = computeNotebookSceneQualityDiagnostic(p, s);
    expect(d.richPrimitiveCount).toBe(3);
    expect(d.rejectReasons).not.toContain("low_richness");
  });
});

describe("buildNotebookDesignerCorrectionFeedback", () => {
  it("REQUIRED: names the exact block count for too_few_blocks", () => {
    const d = computeNotebookSceneQualityDiagnostic(plan([planBlock("text")]), scene([finalizedBlock("text")]));
    const feedback = buildNotebookDesignerCorrectionFeedback(d);
    expect(feedback).toMatch(/only 1 block\(s\)/);
  });

  it("REQUIRED: names the exact dropped/proposed counts and demands verbatim quoting for high_grounding_drop_rate", () => {
    const p = plan([planBlock("highlight"), planBlock("highlight"), planBlock("highlight"), planBlock("diagram")]);
    const s = scene([finalizedBlock("diagram")]);
    const d = computeNotebookSceneQualityDiagnostic(p, s);
    const feedback = buildNotebookDesignerCorrectionFeedback(d);
    expect(feedback).toMatch(/3 of your 4 proposed blocks were discarded/);
    expect(feedback).toMatch(/verbatim/i);
  });

  it("REQUIRED: names richer primitive options for low_richness", () => {
    const p = plan([planBlock("text"), planBlock("text"), planBlock("heading")]);
    const s = scene([finalizedBlock("text"), finalizedBlock("text"), finalizedBlock("heading")]);
    const d = computeNotebookSceneQualityDiagnostic(p, s);
    const feedback = buildNotebookDesignerCorrectionFeedback(d);
    expect(feedback).toMatch(/diagram, table, timeline/);
  });

  it("a passing diagnostic produces empty feedback (never called in practice, but must not throw or fabricate a complaint)", () => {
    const p = plan([planBlock("diagram"), planBlock("table")]);
    const s = scene([finalizedBlock("diagram"), finalizedBlock("table")]);
    const d = computeNotebookSceneQualityDiagnostic(p, s);
    expect(buildNotebookDesignerCorrectionFeedback(d)).toBe("");
  });
});

describe("runNotebookDesignerStep", () => {
  function makeGenerate(results: NotebookDesignerGenerateResult[]) {
    let call = 0;
    const feedbackSeen: (string | null)[] = [];
    const generate = jest.fn(async (correctionFeedback: string | null) => {
      feedbackSeen.push(correctionFeedback);
      const result = results[Math.min(call, results.length - 1)];
      call += 1;
      return result;
    });
    return { generate, feedbackSeen };
  }

  it("REQUIRED: a passing first attempt never retries", async () => {
    const good: NotebookDesignerGenerateResult = {
      plan: plan([planBlock("diagram"), planBlock("table")]),
      scene: scene([finalizedBlock("diagram"), finalizedBlock("table")]),
    };
    const { generate, feedbackSeen } = makeGenerate([good]);
    const result = await runNotebookDesignerStep({ generate });
    expect(result.retried).toBe(false);
    expect(result.diagnostic.passed).toBe(true);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(feedbackSeen).toEqual([null]);
  });

  it("REQUIRED: a failing first attempt retries exactly once with non-null corrective feedback, and never a third time", async () => {
    const thin: NotebookDesignerGenerateResult = {
      plan: plan([planBlock("text")]),
      scene: scene([finalizedBlock("text")]),
    };
    const stillThin: NotebookDesignerGenerateResult = {
      plan: plan([planBlock("text")]),
      scene: scene([finalizedBlock("text")]),
    };
    const { generate, feedbackSeen } = makeGenerate([thin, stillThin]);
    const result = await runNotebookDesignerStep({ generate });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(feedbackSeen[0]).toBeNull();
    expect(feedbackSeen[1]).not.toBeNull();
    expect(typeof feedbackSeen[1]).toBe("string");
    expect(result.retried).toBe(true);
  });

  it("REQUIRED: uses the retry's result even when the retry ALSO fails the diagnostic — never a third attempt", async () => {
    const thin: NotebookDesignerGenerateResult = { plan: plan([planBlock("text")]), scene: scene([finalizedBlock("text")]) };
    const richer: NotebookDesignerGenerateResult = {
      plan: plan([planBlock("text")]), // still only 1 block -> still fails too_few_blocks
      scene: scene([finalizedBlock("diagram")]),
    };
    const { generate } = makeGenerate([thin, richer]);
    const result = await runNotebookDesignerStep({ generate });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(result.diagnostic.passed).toBe(false); // richer's single block still fails too_few_blocks
    expect(result.scene.blocks[0].primitive).toBe("diagram"); // the retry's scene, not the first attempt's
  });

  it("REQUIRED: a retry that now passes is reflected in the final diagnostic", async () => {
    const thin: NotebookDesignerGenerateResult = { plan: plan([planBlock("text")]), scene: scene([finalizedBlock("text")]) };
    const good: NotebookDesignerGenerateResult = {
      plan: plan([planBlock("diagram"), planBlock("table")]),
      scene: scene([finalizedBlock("diagram"), finalizedBlock("table")]),
    };
    const { generate } = makeGenerate([thin, good]);
    const result = await runNotebookDesignerStep({ generate });
    expect(result.retried).toBe(true);
    expect(result.diagnostic.passed).toBe(true);
  });
});
