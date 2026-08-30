// tests/notelab/requestNotebookPlan.test.ts
// M2 — real behavioral tests for notebookPlanner.ts's live client call
// (requestNotebookPlan/generateNotebookScene), fetch-mocked the same way
// tests/insights/resolveVisualContext.test.ts already establishes for this
// repo's other fetch-based client functions — no real network/OpenAI call.

import { requestNotebookPlan, generateNotebookScene, type NotebookPlan } from "../../lib/notelab/notebookPlanner";
import type { CanonicalThoughtUnit } from "../../lib/canonical/types";

function makeUnit(overrides: Partial<CanonicalThoughtUnit> = {}): CanonicalThoughtUnit {
  return {
    id: "doc-1:3:0",
    documentId: "doc-1",
    pageIndex: 3,
    unitIndex: 0,
    text: "Ethanol reacts with oxygen to produce acetic acid.",
    anchor: { pageIndex: 3, startChar: 0, endChar: 10, quote: "Ethanol reacts" },
    datSection: "survey-natural-sciences" as any,
    datTopic: "general-chemistry" as any,
    datUnitType: "concept" as any,
    datRelevance: 0.5,
    classificationConfidence: 0.5,
    classificationSource: "heuristic" as any,
    difficulty: 0.5,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function validPlan(): NotebookPlan {
  return {
    teachingStructure: null,
    blocks: [
      { primitive: "heading", content: "Oxidation Reactions", detail: null, groupId: null, order: 0, sourceUnitIndex: -1, relationshipKind: null },
      { primitive: "text", content: "Ethanol oxidizes to acetic acid.", detail: null, groupId: null, order: 1, sourceUnitIndex: 0, relationshipKind: null },
    ],
  };
}

describe("requestNotebookPlan", () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; jest.restoreAllMocks(); });

  it("REQUIRED: POSTs to /api/notebook-plan with the units and every opts field, and returns the validated plan", async () => {
    const fetchSpy = jest.fn().mockResolvedValue({ ok: true, json: async () => validPlan() });
    global.fetch = fetchSpy as any;

    const units = [makeUnit()];
    const plan = await requestNotebookPlan(units, { bookTitle: "Gen Chem", pageNumber: 4, studentNotes: "my note" });

    expect(fetchSpy).toHaveBeenCalledWith("/api/notebook-plan", expect.objectContaining({ method: "POST" }));
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.units).toEqual(units);
    expect(body.bookTitle).toBe("Gen Chem");
    expect(body.pageNumber).toBe(4);
    expect(body.studentNotes).toBe("my note");
    expect(plan.blocks).toHaveLength(2);
  });

  it("REQUIRED: throws with the server's own error message when the response is not ok", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false, status: 500, json: async () => ({ error: "AI service is not configured for this deployment." }),
    }) as any;
    await expect(requestNotebookPlan([makeUnit()], { pageNumber: 1 })).rejects.toThrow("AI service is not configured for this deployment.");
  });

  it("falls back to a status-based error message when the error response has no body", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, json: async () => { throw new Error("no body"); } }) as any;
    await expect(requestNotebookPlan([makeUnit()], { pageNumber: 1 })).rejects.toThrow(/500/);
  });

  it("REQUIRED: validates the response against NotebookPlanSchema — a malformed response throws rather than silently returning garbage", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ not: "a valid plan" }) }) as any;
    await expect(requestNotebookPlan([makeUnit()], { pageNumber: 1 })).rejects.toThrow();
  });

  it("passes the AbortSignal through to fetch", async () => {
    const fetchSpy = jest.fn().mockResolvedValue({ ok: true, json: async () => validPlan() });
    global.fetch = fetchSpy as any;
    const controller = new AbortController();
    await requestNotebookPlan([makeUnit()], { pageNumber: 1 }, controller.signal);
    expect(fetchSpy.mock.calls[0][1].signal).toBe(controller.signal);
  });
});

describe("generateNotebookScene", () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; jest.restoreAllMocks(); });

  it("REQUIRED: requests the plan then finalizes it into a real, grounded scene using the SAME units array", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => validPlan() }) as any;
    const units = [makeUnit()];
    const scene = await generateNotebookScene(units, { bookId: "book-1", pageNumber: 4 });

    expect(scene.bookId).toBe("book-1");
    expect(scene.pageNumber).toBe(4);
    const grounded = scene.blocks.find((b) => b.sourceUnitIndex === 0)!;
    expect(grounded.canonicalUnitId).toBe(units[0].id);
    expect(grounded.sourceId).toBe(units[0].documentId);
  });

  it("a network failure surfaces as a rejected promise, never a silently empty scene", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("network down")) as any;
    await expect(generateNotebookScene([makeUnit()], { bookId: "book-1", pageNumber: 1 })).rejects.toThrow("network down");
  });
});
