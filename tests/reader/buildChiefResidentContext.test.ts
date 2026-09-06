// tests/reader/buildChiefResidentContext.test.ts
// Unit tests for lib/reader/buildChiefResidentContext.ts — the single shared
// context-builder and response-identity validator used by BOTH
// components/reader/ChiefResidentModal.tsx (Reader) and
// components/notelab/ChiefResidentPanel.tsx (NoteLab).

import {
  buildChiefResidentContext,
  matchesFrozenSnapshot,
  type ChiefResidentFrozenSnapshot,
  type BuildChiefResidentContextArgs,
} from "../../lib/reader/buildChiefResidentContext";
import type { CanonicalUnitInput } from "../../pages/api/chief-resident-teaching";

function makeArgs(overrides: Partial<BuildChiefResidentContextArgs> = {}): BuildChiefResidentContextArgs {
  return {
    documentId:   "general-chemistry",
    pageNumber:   42,
    pageTruthKey: "general-chemistry::42::t",
    pageText:     "Dalton based his conclusions about atoms on chemical observations made in the laboratory.",
    mode:         "explain-page",
    ...overrides,
  };
}

describe("buildChiefResidentContext — request body shape", () => {
  it("maps pageText to sourceText", () => {
    const body = buildChiefResidentContext(makeArgs());
    expect(body.sourceText).toBe("Dalton based his conclusions about atoms on chemical observations made in the laboratory.");
  });

  it("carries documentId, pageNumber, pageTruthKey through verbatim", () => {
    const body = buildChiefResidentContext(makeArgs());
    expect(body.documentId).toBe("general-chemistry");
    expect(body.pageNumber).toBe(42);
    expect(body.pageTruthKey).toBe("general-chemistry::42::t");
  });

  it("defaults messages to [] when omitted", () => {
    const body = buildChiefResidentContext(makeArgs());
    expect(body.messages).toEqual([]);
  });

  it("passes messages through when provided", () => {
    const messages = [{ role: "user" as const, content: "Quiz me" }];
    const body = buildChiefResidentContext(makeArgs({ messages }));
    expect(body.messages).toBe(messages);
  });

  it("leaves canonicalUnits undefined when none are provided", () => {
    const body = buildChiefResidentContext(makeArgs());
    expect(body.canonicalUnits).toBeUndefined();
  });

  it("leaves canonicalUnits undefined for an empty array (not an empty array itself)", () => {
    const body = buildChiefResidentContext(makeArgs({ canonicalUnits: [] }));
    expect(body.canonicalUnits).toBeUndefined();
  });

  it("carries title/audience/selectedText through when provided", () => {
    const body = buildChiefResidentContext(makeArgs({
      title: "General Chemistry", audience: "student", selectedText: "atomic theory",
    }));
    expect(body.title).toBe("General Chemistry");
    expect(body.audience).toBe("student");
    expect(body.selectedText).toBe("atomic theory");
  });
});

describe("buildChiefResidentContext — canonicalUnits sorted highest-importance-first", () => {
  // HA1 — canonicalUnits are now grounded against pageText before sorting
  // (see lib/highlights/highlightAgent.ts), so every unit's text below must
  // actually appear in the page text these tests supply, or it would be
  // correctly dropped rather than sorted.
  const GROUNDED_PAGE_TEXT =
    "This page covers a low priority note, a mid priority note, and a high priority note.";

  it("sorts by priorityTier descending when present", () => {
    const units: CanonicalUnitInput[] = [
      { text: "low priority note",  priorityTier: 1 },
      { text: "high priority note", priorityTier: 5 },
      { text: "mid priority note",  priorityTier: 3 },
    ];
    const body = buildChiefResidentContext(makeArgs({ pageText: GROUNDED_PAGE_TEXT, canonicalUnits: units }));
    expect(body.canonicalUnits?.map(u => u.text)).toEqual(["high priority note", "mid priority note", "low priority note"]);
  });

  it("falls back to importanceScore descending when priorityTier is absent", () => {
    const units: CanonicalUnitInput[] = [
      { text: "low priority note",  importanceScore: 10 },
      { text: "high priority note", importanceScore: 90 },
    ];
    const body = buildChiefResidentContext(makeArgs({ pageText: GROUNDED_PAGE_TEXT, canonicalUnits: units }));
    expect(body.canonicalUnits?.map(u => u.text)).toEqual(["high priority note", "low priority note"]);
  });

  it("does not mutate the caller's original array", () => {
    const units: CanonicalUnitInput[] = [
      { text: "low priority note",  priorityTier: 1 },
      { text: "high priority note", priorityTier: 5 },
    ];
    buildChiefResidentContext(makeArgs({ pageText: GROUNDED_PAGE_TEXT, canonicalUnits: units }));
    expect(units.map(u => u.text)).toEqual(["low priority note", "high priority note"]);
  });
});

describe("buildChiefResidentContext — HA1: canonicalUnits are grounded against pageText before reaching the request", () => {
  const PAGE_TEXT = "Atoms consist of a nucleus surrounded by electrons in discrete energy levels.";

  it("drops a canonicalUnit whose text does not appear anywhere in pageText", () => {
    const units: CanonicalUnitInput[] = [
      { text: "electrons in discrete energy levels" }, // real substring of PAGE_TEXT
      { text: "muscle contraction requires actin and myosin" }, // not grounded — must be dropped
    ];
    const body = buildChiefResidentContext(makeArgs({ pageText: PAGE_TEXT, canonicalUnits: units }));
    expect(body.canonicalUnits?.map(u => u.text)).toEqual(["electrons in discrete energy levels"]);
  });

  it("returns canonicalUnits: undefined when none of the supplied units ground (never an empty array)", () => {
    const units: CanonicalUnitInput[] = [
      { text: "this text is nowhere in the page" },
    ];
    const body = buildChiefResidentContext(makeArgs({ pageText: PAGE_TEXT, canonicalUnits: units }));
    expect(body.canonicalUnits).toBeUndefined();
  });

  it("accepts a normalized match (smart quotes/dashes/whitespace differences) rather than requiring byte-exact text", () => {
    const units: CanonicalUnitInput[] = [
      { text: "a nucleus surrounded  by electrons" }, // double space, still normalizes to a real substring
    ];
    const body = buildChiefResidentContext(makeArgs({ pageText: PAGE_TEXT, canonicalUnits: units }));
    expect(body.canonicalUnits?.map(u => u.text)).toEqual(["a nucleus surrounded  by electrons"]);
  });
});

describe("matchesFrozenSnapshot — response-identity validation", () => {
  function makeFrozen(overrides: Partial<ChiefResidentFrozenSnapshot> = {}): ChiefResidentFrozenSnapshot {
    return {
      documentId:   "general-chemistry",
      pageNumber:   42,
      pageTruthKey: "general-chemistry::42::t",
      pageText:     "…",
      ...overrides,
    };
  }

  it("matches when all three identity fields are identical", () => {
    const frozen = makeFrozen();
    expect(matchesFrozenSnapshot(
      { documentId: "general-chemistry", pageNumber: 42, pageTruthKey: "general-chemistry::42::t" },
      frozen,
    )).toBe(true);
  });

  it("REGRESSION GUARD: rejects a response for a different document (the reported cross-subject scenario)", () => {
    const frozen = makeFrozen({ documentId: "general-chemistry", pageTruthKey: "general-chemistry::42::t" });
    const strayEvent = { documentId: "biology-101", pageNumber: 42, pageTruthKey: "biology-101::42::t" };
    expect(matchesFrozenSnapshot(strayEvent, frozen)).toBe(false);
  });

  it("rejects when pageNumber differs (page changed after the request was sent)", () => {
    const frozen = makeFrozen({ pageNumber: 42 });
    expect(matchesFrozenSnapshot(
      { documentId: "general-chemistry", pageNumber: 53, pageTruthKey: "general-chemistry::42::t" },
      frozen,
    )).toBe(false);
  });

  it("rejects when pageTruthKey differs even if documentId/pageNumber match (same page, different content version)", () => {
    const frozen = makeFrozen({ pageTruthKey: "general-chemistry::42::t1" });
    expect(matchesFrozenSnapshot(
      { documentId: "general-chemistry", pageNumber: 42, pageTruthKey: "general-chemistry::42::t2" },
      frozen,
    )).toBe(false);
  });

  it("rejects an event with missing identity fields (undefined never coerces to a match)", () => {
    const frozen = makeFrozen();
    expect(matchesFrozenSnapshot({}, frozen)).toBe(false);
  });
});
