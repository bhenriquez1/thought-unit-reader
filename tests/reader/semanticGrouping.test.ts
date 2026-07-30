// tests/reader/semanticGrouping.test.ts
// Tests for lib/reader/semanticGrouping.ts

import {
  groupByCanonicalType,
  isGroupVisibleInMode,
  type SemanticGroup,
} from "../../lib/reader/semanticGrouping";
import { UNIVERSAL_PACK } from "../../lib/semantic/packs/universal";
import { DENTISTRY_PACK } from "../../lib/semantic/packs/dentistry";

// ── Helpers ────────────────────────────────────────────────────────────────

function makeEntry(
  id: string,
  canonicalType?: string,
  opts: { kind?: string; importanceScore?: number; priorityTier?: number; lineRange?: string } = {},
) {
  return { id, text: `text for ${id}`, canonicalType, ...opts };
}

// ── groupByCanonicalType — basic canonical path ────────────────────────────

describe("groupByCanonicalType — canonical path", () => {
  const entries = [
    makeEntry("d1", "definition"),
    makeEntry("d2", "definition"),
    makeEntry("h1", "high-yield"),
    makeEntry("p1", "process"),
  ];

  it("activates semantic grouping when entries have canonicalType", () => {
    const { semanticActive } = groupByCanonicalType(entries, UNIVERSAL_PACK, "study");
    expect(semanticActive).toBe(true);
  });

  it("produces one group per distinct canonicalType", () => {
    const { groups } = groupByCanonicalType(entries, UNIVERSAL_PACK, "study");
    const types = groups.map((g) => g.canonicalType);
    expect(types).toContain("definition");
    expect(types).toContain("high-yield");
    expect(types).toContain("process");
    expect(groups.length).toBe(3);
  });

  it("byGroup maps each group.id to its entries", () => {
    const { groups, byGroup } = groupByCanonicalType(entries, UNIVERSAL_PACK, "study");
    const defGroup = groups.find((g) => g.canonicalType === "definition")!;
    expect(byGroup.get(defGroup.id)?.map((e) => e.id)).toEqual(["d1", "d2"]);
  });

  it("group.id is stable and prefixed with ct-", () => {
    const { groups } = groupByCanonicalType(entries, UNIVERSAL_PACK, "study");
    for (const g of groups) {
      expect(g.id).toMatch(/^ct-/);
    }
  });
});

// ── Pack label mapping ─────────────────────────────────────────────────────

describe("groupByCanonicalType — pack label mapping", () => {
  it("uses SemanticPack labels for group display metadata", () => {
    const entries = [makeEntry("f1", "formula")];
    const { groups } = groupByCanonicalType(entries, UNIVERSAL_PACK, "study");
    const g = groups[0];
    // UNIVERSAL_PACK should have a formula label with a non-empty icon
    expect(g.label).toBeTruthy();
    expect(g.icon).toBeTruthy();
    expect(g.shortLabel).toBeTruthy();
  });

  it("uses DENTISTRY_PACK labels when that pack is active", () => {
    const entries = [makeEntry("m1", "material")];
    const { groups } = groupByCanonicalType(entries, DENTISTRY_PACK, "study");
    const g = groups[0];
    // DENTISTRY_PACK has a "material" definition with a distinct label
    expect(g.label).toBeTruthy();
    expect(g.canonicalType).toBe("material");
  });

  it("falls back gracefully for a canonicalType not in the pack", () => {
    const entries = [makeEntry("x1", "complication")];
    const { groups } = groupByCanonicalType(entries, UNIVERSAL_PACK, "study");
    // complication is not in UNIVERSAL_PACK but should still produce a group
    expect(groups.length).toBe(1);
    expect(groups[0].label).toBeTruthy();
  });
});

// ── Priority ordering (study mode) ─────────────────────────────────────────

describe("groupByCanonicalType — priority ordering in study mode", () => {
  it("sorts groups by pack priority ascending", () => {
    const entries = [
      makeEntry("w1", "warning"),
      makeEntry("d1", "definition"),
      makeEntry("h1", "high-yield"),
    ];
    const { groups } = groupByCanonicalType(entries, UNIVERSAL_PACK, "study");
    // Groups should be ordered by priority — just verify priorities are non-decreasing
    const priorities = groups.map((g) => g.priority);
    const sorted = [...priorities].sort((a, b) => a - b);
    expect(priorities).toEqual(sorted);
  });
});

// ── Exam mode ──────────────────────────────────────────────────────────────

describe("groupByCanonicalType — exam mode", () => {
  const entries = [
    makeEntry("d1", "definition"),
    makeEntry("h1", "high-yield"),
    makeEntry("c1", "clinical-pearl"),
    makeEntry("e1", "evidence"),
  ];

  it("surfaces EXAM_EXPANDED_TYPES (high-yield, clinical-pearl) before collapsed types", () => {
    const { groups } = groupByCanonicalType(entries, UNIVERSAL_PACK, "exam");
    const types = groups.map((g) => g.canonicalType);
    const highYieldIdx    = types.indexOf("high-yield");
    const clinicalPearlIdx = types.indexOf("clinical-pearl");
    const definitionIdx   = types.indexOf("definition");
    // Both expanded types should appear before definition
    expect(highYieldIdx).toBeLessThan(definitionIdx);
    expect(clinicalPearlIdx).toBeLessThan(definitionIdx);
  });

  it("marks definition as defaultCollapsed in exam mode", () => {
    const { groups } = groupByCanonicalType(entries, UNIVERSAL_PACK, "exam");
    const defGroup = groups.find((g) => g.canonicalType === "definition")!;
    expect(defGroup.defaultCollapsed).toBe(true);
  });

  it("marks high-yield as NOT defaultCollapsed in exam mode", () => {
    const { groups } = groupByCanonicalType(entries, UNIVERSAL_PACK, "exam");
    const hyGroup = groups.find((g) => g.canonicalType === "high-yield")!;
    expect(hyGroup.defaultCollapsed).toBe(false);
  });

  it("marks evidence as defaultCollapsed in exam mode", () => {
    const { groups } = groupByCanonicalType(entries, UNIVERSAL_PACK, "exam");
    const evGroup = groups.find((g) => g.canonicalType === "evidence")!;
    expect(evGroup.defaultCollapsed).toBe(true);
  });

  it("sorts entries by importanceScore descending within exam groups", () => {
    const examEntries = [
      makeEntry("a", "high-yield", { importanceScore: 40 }),
      makeEntry("b", "high-yield", { importanceScore: 90 }),
      makeEntry("c", "high-yield", { importanceScore: 70 }),
    ];
    const { groups, byGroup } = groupByCanonicalType(examEntries, UNIVERSAL_PACK, "exam");
    const hyGroup = groups.find((g) => g.canonicalType === "high-yield")!;
    const ordered = byGroup.get(hyGroup.id)!.map((e) => e.id);
    expect(ordered).toEqual(["b", "c", "a"]);
  });
});

// ── Review mode ─────────────────────────────────────────────────────────────

describe("groupByCanonicalType — review mode", () => {
  it("surfaces recentlyFocusedIds at the top of each group", () => {
    const entries = [
      makeEntry("a", "definition"),
      makeEntry("b", "definition"),
      makeEntry("c", "definition"),
    ];
    const { groups, byGroup } = groupByCanonicalType(
      entries,
      UNIVERSAL_PACK,
      "review",
      ["c", "a"],
    );
    const defGroup = groups.find((g) => g.canonicalType === "definition")!;
    const ids = byGroup.get(defGroup.id)!.map((e) => e.id);
    // c and a should appear before b
    expect(ids.indexOf("b")).toBeGreaterThan(ids.indexOf("c"));
    expect(ids.indexOf("b")).toBeGreaterThan(ids.indexOf("a"));
  });

  it("shows all groups in review mode (defaultCollapsed=false)", () => {
    const entries = [
      makeEntry("d1", "definition"),
      makeEntry("e1", "evidence"),
    ];
    const { groups } = groupByCanonicalType(entries, UNIVERSAL_PACK, "review");
    for (const g of groups) {
      expect(g.defaultCollapsed).toBe(false);
    }
  });
});

// ── Legacy fallback path ───────────────────────────────────────────────────

describe("groupByCanonicalType — legacy fallback (no canonicalType)", () => {
  it("returns semanticActive=false for entries without canonicalType", () => {
    const entries = [
      makeEntry("l1", undefined, { kind: "definition" }),
      makeEntry("l2", undefined, { kind: "formula" }),
    ];
    const { semanticActive } = groupByCanonicalType(entries, UNIVERSAL_PACK, "study");
    expect(semanticActive).toBe(false);
  });

  it("groups legacy entries by kind", () => {
    const entries = [
      makeEntry("l1", undefined, { kind: "definition" }),
      makeEntry("l2", undefined, { kind: "definition" }),
      makeEntry("l3", undefined, { kind: "formula" }),
    ];
    const { groups } = groupByCanonicalType(entries, UNIVERSAL_PACK, "study");
    expect(groups.length).toBe(2);
    expect(groups.some((g) => g.id === "legacy-definition")).toBe(true);
    expect(groups.some((g) => g.id === "legacy-formula")).toBe(true);
  });

  it("handles entries with no kind at all (kind=undefined)", () => {
    const entries = [makeEntry("l1", undefined)];
    const { groups, semanticActive } = groupByCanonicalType(entries, UNIVERSAL_PACK, "study");
    expect(semanticActive).toBe(false);
    expect(groups.length).toBe(1);
    expect(groups[0].id).toBe("legacy-unknown");
  });
});

// ── isGroupVisibleInMode ───────────────────────────────────────────────────

describe("isGroupVisibleInMode", () => {
  function makeGroup(canonicalType: string): SemanticGroup {
    return {
      id: `ct-${canonicalType}`,
      canonicalType: canonicalType as any,
      label: canonicalType,
      shortLabel: canonicalType.slice(0, 6),
      icon: "•",
      priority: 1,
      entryIds: ["x"],
      defaultCollapsed: false,
    };
  }

  it("returns true for all groups in study mode", () => {
    expect(isGroupVisibleInMode(makeGroup("evidence"), "study")).toBe(true);
    expect(isGroupVisibleInMode(makeGroup("memory-anchor"), "study")).toBe(true);
    expect(isGroupVisibleInMode(makeGroup("material"), "study")).toBe(true);
    expect(isGroupVisibleInMode(makeGroup("definition"), "study")).toBe(true);
  });

  it("returns true for all groups in review mode", () => {
    expect(isGroupVisibleInMode(makeGroup("evidence"), "review")).toBe(true);
    expect(isGroupVisibleInMode(makeGroup("memory-anchor"), "review")).toBe(true);
    expect(isGroupVisibleInMode(makeGroup("material"), "review")).toBe(true);
  });

  it("hides evidence, memory-anchor, material in exam mode", () => {
    expect(isGroupVisibleInMode(makeGroup("evidence"), "exam")).toBe(false);
    expect(isGroupVisibleInMode(makeGroup("memory-anchor"), "exam")).toBe(false);
    expect(isGroupVisibleInMode(makeGroup("material"), "exam")).toBe(false);
  });

  it("shows definition and high-yield in exam mode", () => {
    expect(isGroupVisibleInMode(makeGroup("definition"), "exam")).toBe(true);
    expect(isGroupVisibleInMode(makeGroup("high-yield"), "exam")).toBe(true);
  });
});

// ── Performance — large document ───────────────────────────────────────────

describe("groupByCanonicalType — performance with large document", () => {
  const CANONICAL_TYPES = ["definition", "high-yield", "process", "warning", "formula", "exception"];

  it("handles 200 entries without error", () => {
    const entries = Array.from({ length: 200 }, (_, i) => ({
      id: `e${i}`,
      text: `text ${i}`,
      canonicalType: CANONICAL_TYPES[i % CANONICAL_TYPES.length],
    }));
    const { groups, semanticActive } = groupByCanonicalType(entries, UNIVERSAL_PACK, "study");
    expect(semanticActive).toBe(true);
    expect(groups.length).toBe(CANONICAL_TYPES.length);
    // Each group should have 200/6 ≈ 33 entries
    for (const g of groups) {
      expect(g.entryIds.length).toBeGreaterThan(0);
    }
  });
});
