// lib/knowledge/inferNodeRelationships.ts
// Pure functions for inferring KnowledgeNode relationship edges from
// VisualAnchorRole co-occurrence — the Knowledge Graph equivalent of
// lib/whiteboard/canonicalRelationshipGraph.ts's canonicalType RULES table,
// adapted to the roles buildKnowledgeNode.ts actually stamps onto nodes.
//
// P1 fix — KnowledgeNode.parentNodeIds/childNodeIds/relatedNodeIds have
// always been schema fields, but nothing in the codebase ever populated
// them: they were hard-coded to [] at creation (buildKnowledgeNode.ts) with
// zero writers anywhere. Two real UI consumers (Visual Knowledge Roadmap,
// NoteLab's related-concept preview) already read these fields — both
// render zero edges forever as a result. This module is the writer.
//
// Deliberately conservative: only role pairs with a genuine, directionally-
// clear pedagogical relationship are linked (mirroring the Whiteboard
// RULES table's own restraint) — most role-pair combinations return "none"
// rather than fabricating a connection. Scoped to same-document, same-page
// co-occurrence only; cross-page relationship inference is a separate,
// larger feature this does not attempt.
//
// No I/O — callers (knowledgeGraphStore.ts) handle all persistence.

import type { VisualAnchorRole } from "@/lib/insights/currentPageStudyModel";
import type { KnowledgeNode } from "./knowledgeGraphSchema";

export type RoleRelation = "parent" | "related";

// [broaderRole, narrowerRole, "parent"] — broaderRole becomes the PARENT of
// narrowerRole whenever they co-occur, regardless of creation order.
// [roleA, roleB, "related"] — symmetric; order doesn't matter.
const ROLE_RELATIONSHIP_RULES: Array<[VisualAnchorRole, VisualAnchorRole, RoleRelation]> = [
  ["coreIdea",    "definition",      "parent"],   // the core idea is elaborated by a definition
  ["coreIdea",    "mechanism",       "parent"],   // the core idea's underlying mechanism
  ["coreIdea",    "datFact",         "parent"],   // a high-yield fact supporting the core idea
  ["definition",  "exampleEvidence", "parent"],   // the example illustrates the definition
  ["mechanism",   "exampleEvidence", "parent"],   // the example illustrates the mechanism
  ["keyAnatomy",  "mechanism",       "parent"],   // anatomy underlies the mechanism
  ["mechanism",   "confusionTrap",   "related"],  // a common mistake tied to this mechanism
  ["definition",  "confusionTrap",   "related"],  // a common mistake tied to this definition
  ["datFact",     "confusionTrap",   "related"],  // a common mistake tied to this fact
  ["mechanism",   "clinicalPearl",   "related"],  // an expert aside tied to this mechanism
  ["coreIdea",    "memoryHook",      "related"],  // a mnemonic anchoring the core idea
];

/** Classify the relationship between two roles, direction-aware.
 *  Returns null when no rule matches either order — most pairs, by design. */
export function classifyRoleRelation(
  roleA: VisualAnchorRole,
  roleB: VisualAnchorRole,
): { relation: RoleRelation; parentIsA: boolean } | null {
  for (const [broader, narrower, relation] of ROLE_RELATIONSHIP_RULES) {
    if (broader === roleA && narrower === roleB) return { relation, parentIsA: true };
    if (broader === roleB && narrower === roleA) return { relation, parentIsA: false };
  }
  return null;
}

/** Given a node just created/resolved and its already-persisted siblings on
 *  the same document+page, compute the updated node records for every pair
 *  with a genuine role relationship. Returns only the nodes that actually
 *  changed (empty array when no sibling matches any rule), each with its
 *  relationship id arrays updated and de-duplicated — callers persist
 *  whatever comes back. */
export function linkRelatedNodes(
  node: KnowledgeNode,
  siblings: KnowledgeNode[],
): KnowledgeNode[] {
  const updated = new Map<string, KnowledgeNode>();
  let nodeChanged = false;
  let nextNode = node;

  for (const sibling of siblings) {
    if (sibling.id === node.id) continue;
    const classification = classifyRoleRelation(
      sibling.role as VisualAnchorRole,
      node.role as VisualAnchorRole,
    );
    if (!classification) continue;

    if (classification.relation === "related") {
      if (!nextNode.relatedNodeIds.includes(sibling.id)) {
        nextNode = { ...nextNode, relatedNodeIds: [...nextNode.relatedNodeIds, sibling.id] };
        nodeChanged = true;
      }
      if (!sibling.relatedNodeIds.includes(node.id)) {
        const updatedSibling = updated.get(sibling.id) ?? sibling;
        updated.set(sibling.id, { ...updatedSibling, relatedNodeIds: [...updatedSibling.relatedNodeIds, node.id] });
      }
      continue;
    }

    // "parent" — classification.parentIsA tells us whether the SIBLING
    // (roleA in the classifyRoleRelation call) or the NEW node is the parent.
    const siblingIsParent = classification.parentIsA;
    if (siblingIsParent) {
      if (!nextNode.parentNodeIds.includes(sibling.id)) {
        nextNode = { ...nextNode, parentNodeIds: [...nextNode.parentNodeIds, sibling.id] };
        nodeChanged = true;
      }
      if (!sibling.childNodeIds.includes(node.id)) {
        const updatedSibling = updated.get(sibling.id) ?? sibling;
        updated.set(sibling.id, { ...updatedSibling, childNodeIds: [...updatedSibling.childNodeIds, node.id] });
      }
    } else {
      if (!nextNode.childNodeIds.includes(sibling.id)) {
        nextNode = { ...nextNode, childNodeIds: [...nextNode.childNodeIds, sibling.id] };
        nodeChanged = true;
      }
      if (!sibling.parentNodeIds.includes(node.id)) {
        const updatedSibling = updated.get(sibling.id) ?? sibling;
        updated.set(sibling.id, { ...updatedSibling, parentNodeIds: [...updatedSibling.parentNodeIds, node.id] });
      }
    }
  }

  const result = Array.from(updated.values());
  if (nodeChanged) result.push(nextNode);
  return result;
}
