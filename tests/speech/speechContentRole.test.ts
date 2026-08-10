// tests/speech/speechContentRole.test.ts
// SOURCE_VERBATIM vs PROFESSOR_EXPLANATION stays explicit even in legacy
// low-level speech builders, which remain during the removal-safety audit.

import { contentRoleForSegmentRole, buildSpeechTimeline } from "../../lib/speech/studySpeechEngine";
import type { ExpertAnchor } from "../../lib/insights/canonicalLeftPanel";

describe("contentRoleForSegmentRole", () => {
  it("REQUIRED: 'checkpoint' (the only AI-authored role — Study's 'Why It Matters', Guided's 'Quick check') maps to PROFESSOR_EXPLANATION", () => {
    expect(contentRoleForSegmentRole("checkpoint")).toBe("PROFESSOR_EXPLANATION");
  });

  it("REQUIRED: every other role (thesis/conceptBlock/visualAnchor — all exact anchor text) maps to SOURCE_VERBATIM", () => {
    expect(contentRoleForSegmentRole("thesis")).toBe("SOURCE_VERBATIM");
    expect(contentRoleForSegmentRole("conceptBlock")).toBe("SOURCE_VERBATIM");
    expect(contentRoleForSegmentRole("visualAnchor")).toBe("SOURCE_VERBATIM");
  });
});

function unit(id: string, overrides: Partial<ExpertAnchor> = {}): ExpertAnchor {
  return {
    id, exactText: `Exact text for ${id} long enough to survive the length filter`,
    title: id, category: "definition", priorityTier: 3, importanceLabel: "Notable",
    evidenceRefId: id, grounded: true, page: 1,
    ...overrides,
  } as ExpertAnchor;
}

describe("buildSpeechTimeline — every segment carries an explicit contentRole", () => {
  it("REQUIRED: 'highlights' mode (strictly verbatim) never produces a PROFESSOR_EXPLANATION segment", () => {
    const segs = buildSpeechTimeline({ thoughtUnits: [unit("u1"), unit("u2")], mode: "highlights" });
    expect(segs.length).toBeGreaterThan(0);
    expect(segs.every(s => s.contentRole === "SOURCE_VERBATIM")).toBe(true);
  });

  it("REQUIRED: 'focus' mode (strictly verbatim) never produces a PROFESSOR_EXPLANATION segment", () => {
    const segs = buildSpeechTimeline({ thoughtUnits: [unit("u1", { priorityTier: 5 })], mode: "focus" });
    expect(segs.length).toBeGreaterThan(0);
    expect(segs.every(s => s.contentRole === "SOURCE_VERBATIM")).toBe(true);
  });

  it("REQUIRED: 'full' mode (strictly verbatim) never produces a PROFESSOR_EXPLANATION segment", () => {
    const segs = buildSpeechTimeline({ thoughtUnits: [unit("u1")], mode: "full" });
    expect(segs.length).toBeGreaterThan(0);
    expect(segs.every(s => s.contentRole === "SOURCE_VERBATIM")).toBe(true);
  });

  it("REQUIRED: 'study' mode's anchor segment is SOURCE_VERBATIM but its 'Why It Matters' companion segment is PROFESSOR_EXPLANATION", () => {
    const segs = buildSpeechTimeline({ thoughtUnits: [unit("u1", { priorityTier: 5, reason: "because it explains the mechanism" })], mode: "study" });
    const anchorSeg = segs.find(s => s.role === "visualAnchor");
    const whyItMattersSeg = segs.find(s => s.role === "checkpoint");
    expect(anchorSeg?.contentRole).toBe("SOURCE_VERBATIM");
    expect(whyItMattersSeg?.contentRole).toBe("PROFESSOR_EXPLANATION");
  });

  it("REQUIRED: 'guided' mode's closing 'Check Your Understanding' segment is PROFESSOR_EXPLANATION", () => {
    const segs = buildSpeechTimeline({ thoughtUnits: [unit("u1", { category: "definition" })], mode: "guided" });
    const checkpoint = segs.find(s => s.id.startsWith("guided-question-"));
    expect(checkpoint?.contentRole).toBe("PROFESSOR_EXPLANATION");
  });
});
