// tests/elena/childLearningState.test.ts
// E3 — Elena's reading activity writes into the SAME shared
// recordLearningEvent/applyLearningEvent/saveNodeProgress engine the adult
// Reader uses, scoped under a child-namespaced nodeId (the shared engine has
// no native per-user scoping — see lib/elena/childLearningState.ts's header
// comment). buildChildScopedNodeId is pure and gets full behavioral
// coverage; recordChildPageExposure (which calls recordLearningEvent, an
// IDB-touching function) gets static-analysis coverage.

import fs from "fs";
import path from "path";
import { buildChildScopedNodeId } from "@/lib/elena/childLearningState";

describe("buildChildScopedNodeId", () => {
  it("REQUIRED: composes a namespaced id distinct from the bare canonical unit id", () => {
    const scoped = buildChildScopedNodeId("child-1", "doc-1:0:0");
    expect(scoped).toBe("elena:child-1:doc-1:0:0");
    expect(scoped).not.toBe("doc-1:0:0");
  });

  it("REQUIRED: two different children never produce the same scoped id for the same unit — no cross-child collision", () => {
    const a = buildChildScopedNodeId("child-1", "doc-1:0:0");
    const b = buildChildScopedNodeId("child-2", "doc-1:0:0");
    expect(a).not.toBe(b);
  });

  it("the SAME child/unit pair is deterministic", () => {
    expect(buildChildScopedNodeId("child-1", "doc-1:0:0")).toBe(buildChildScopedNodeId("child-1", "doc-1:0:0"));
  });
});

describe("lib/elena/childLearningState.ts — recordChildPageExposure (static analysis)", () => {
  const SRC = fs.readFileSync(path.resolve(__dirname, "../../lib/elena/childLearningState.ts"), "utf8");

  it("REQUIRED: delegates to the shared recordLearningEvent — no parallel progress-writing logic", () => {
    expect(SRC).toMatch(/import \{ recordLearningEvent \} from "@\/lib\/knowledge\/recordLearningEvent";/);
  });

  it("REQUIRED: every event is keyed by buildChildScopedNodeId, not the bare canonical unit id", () => {
    const idx = SRC.indexOf("export async function recordChildPageExposure");
    const block = SRC.slice(idx, idx + 600);
    expect(block).toMatch(/buildChildScopedNodeId\(childProfileId, unit\.id\)/);
  });

  it("fires a 'read' exposure event per unit, matching LearningEvidenceSourceType's existing vocabulary — no new sourceType added", () => {
    const idx = SRC.indexOf("export async function recordChildPageExposure");
    const block = SRC.slice(idx, idx + 600);
    expect(block).toMatch(/kind: "exposure", sourceType: "read", occurredAt, sourceId: unit\.id/);
  });
});
