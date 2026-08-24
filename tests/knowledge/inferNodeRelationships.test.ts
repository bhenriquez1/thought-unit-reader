// tests/knowledge/inferNodeRelationships.test.ts
// P1 fix — KnowledgeNode.parentNodeIds/childNodeIds/relatedNodeIds have
// always existed in the schema but were hard-coded to [] at creation, with
// zero writers anywhere in the codebase (confirmed by the "Avrrio Master
// Audit," item 5). Two real UI consumers (Visual Knowledge Roadmap,
// NoteLab's related-concept preview) already read these fields — both
// rendered zero edges forever as a result. lib/knowledge/
// inferNodeRelationships.ts is the writer; these are real behavioral tests
// against its pure functions (no I/O, no mocking needed), plus a source
// check proving knowledgeGraphStore.ts's Tier-3 path actually calls it.

import fs from "fs";
import path from "path";
import { classifyRoleRelation, linkRelatedNodes } from "../../lib/knowledge/inferNodeRelationships";
import type { KnowledgeNode } from "../../lib/knowledge/knowledgeGraphSchema";

function makeNode(overrides: Partial<KnowledgeNode> & { id: string; role: string }): KnowledgeNode {
  return {
    documentId: "doc-1",
    bookId: "book-1.pdf",
    chapterCandidateId: null,
    canonicalAnchorId: `anchor-${overrides.id}`,
    title: overrides.id,
    summary: "",
    exactSourceText: "",
    sourcePages: [3],
    citations: [],
    profileId: "default",
    importance: 60,
    difficulty: 50,
    parentNodeIds: [],
    childNodeIds: [],
    relatedNodeIds: [],
    learningObjectives: [],
    misconceptions: [],
    examples: [],
    applications: [],
    ...overrides,
  };
}

describe("classifyRoleRelation — conservative, direction-aware role pairing", () => {
  it("REQUIRED: coreIdea is the parent of a co-occurring definition, regardless of which role is passed first", () => {
    expect(classifyRoleRelation("coreIdea", "definition")).toEqual({ relation: "parent", parentIsA: true });
    expect(classifyRoleRelation("definition", "coreIdea")).toEqual({ relation: "parent", parentIsA: false });
  });

  it("REQUIRED: mechanism and confusionTrap are related (symmetric), not parent/child — parentIsA is meaningless for related and callers must not branch on it", () => {
    expect(classifyRoleRelation("mechanism", "confusionTrap")?.relation).toBe("related");
    expect(classifyRoleRelation("confusionTrap", "mechanism")?.relation).toBe("related");
  });

  it("REQUIRED: most role pairs have no defined relationship — never fabricate one", () => {
    expect(classifyRoleRelation("keyDetail", "memoryHook")).toBeNull();
    expect(classifyRoleRelation("clinicalPearl", "keyAnatomy")).toBeNull();
    expect(classifyRoleRelation("exampleEvidence", "datFact")).toBeNull();
  });
});

describe("linkRelatedNodes — computes real edges from page siblings, never fabricates for unrelated roles", () => {
  it("REQUIRED: a new definition co-occurring with an existing coreIdea gets linked as its child, and the sibling gets the reverse edge", () => {
    const coreIdea = makeNode({ id: "core-1", role: "coreIdea" });
    const newDefinition = makeNode({ id: "def-1", role: "definition" });

    const updates = linkRelatedNodes(newDefinition, [coreIdea]);

    const updatedDef = updates.find(n => n.id === "def-1");
    const updatedCore = updates.find(n => n.id === "core-1");
    expect(updatedDef?.parentNodeIds).toEqual(["core-1"]);
    expect(updatedCore?.childNodeIds).toEqual(["def-1"]);
  });

  it("REQUIRED: a new confusionTrap co-occurring with an existing mechanism gets a symmetric relatedNodeIds edge on both sides", () => {
    const mechanism = makeNode({ id: "mech-1", role: "mechanism" });
    const newTrap = makeNode({ id: "trap-1", role: "confusionTrap" });

    const updates = linkRelatedNodes(newTrap, [mechanism]);

    const updatedTrap = updates.find(n => n.id === "trap-1");
    const updatedMech = updates.find(n => n.id === "mech-1");
    expect(updatedTrap?.relatedNodeIds).toEqual(["mech-1"]);
    expect(updatedMech?.relatedNodeIds).toEqual(["trap-1"]);
  });

  it("REQUIRED: two co-occurring nodes with no defined role relationship produce no updates at all", () => {
    const detail = makeNode({ id: "detail-1", role: "keyDetail" });
    const memory = makeNode({ id: "mem-1", role: "memoryHook" });

    const updates = linkRelatedNodes(memory, [detail]);

    expect(updates).toEqual([]);
  });

  it("multiple siblings on the same page can each independently link to the new node", () => {
    const coreIdea = makeNode({ id: "core-1", role: "coreIdea" });
    const anatomy = makeNode({ id: "anat-1", role: "keyAnatomy" });
    const newMechanism = makeNode({ id: "mech-1", role: "mechanism" });

    const updates = linkRelatedNodes(newMechanism, [coreIdea, anatomy]);

    const updatedMech = updates.find(n => n.id === "mech-1");
    expect(updatedMech?.parentNodeIds?.sort()).toEqual(["anat-1", "core-1"]);
    expect(updates.find(n => n.id === "core-1")?.childNodeIds).toEqual(["mech-1"]);
    expect(updates.find(n => n.id === "anat-1")?.childNodeIds).toEqual(["mech-1"]);
  });

  it("never duplicates an id already present in the target array", () => {
    const coreIdea = makeNode({ id: "core-1", role: "coreIdea", childNodeIds: ["def-1"] });
    const existingDefinition = makeNode({ id: "def-1", role: "definition", parentNodeIds: ["core-1"] });

    const updates = linkRelatedNodes(existingDefinition, [coreIdea]);

    // Both sides already carry the edge — nothing should change.
    expect(updates).toEqual([]);
  });

  it("a node with no siblings on the page produces no updates", () => {
    const lonely = makeNode({ id: "solo-1", role: "coreIdea" });
    expect(linkRelatedNodes(lonely, [])).toEqual([]);
  });
});

describe("knowledgeGraphStore.ts — Tier-3 node creation actually calls the relationship inferrer", () => {
  const STORE_SRC = fs.readFileSync(path.resolve(__dirname, "../../lib/knowledge/knowledgeGraphStore.ts"), "utf8");

  it("REQUIRED: imports linkRelatedNodes from inferNodeRelationships.ts", () => {
    expect(STORE_SRC).toMatch(/import \{ linkRelatedNodes \} from "\.\/inferNodeRelationships";/);
  });

  it("REQUIRED: Tier 3 computes relationship updates against pageNodes (the same-document-and-page sibling set) and persists every one of them", () => {
    const idx = STORE_SRC.indexOf("// Tier 3 — new concept.");
    expect(idx).toBeGreaterThan(-1);
    const block = STORE_SRC.slice(idx, idx + 900);
    expect(block).toMatch(/const relationshipUpdates = linkRelatedNodes\(node, pageNodes\);/);
    expect(block).toMatch(/const finalNode = relationshipUpdates\.find\(n => n\.id === node\.id\) \?\? node;/);
    expect(block).toMatch(/await idbPutNode\(finalNode\);/);
    expect(block).toMatch(/for \(const updated of relationshipUpdates\) \{/);
  });
});
