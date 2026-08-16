// lib/elena/childLearningState.ts
// E3 — Elena's reading activity writes into the SAME shared Learning State
// Engine (recordLearningEvent/applyLearningEvent/saveNodeProgress) the adult
// Reader, Recall, and DAT Apex already use — not a parallel progress system.
//
// The shared engine has NO per-user scoping: KnowledgeNodeProgress is keyed
// solely by nodeId (lib/knowledge/knowledgeGraphStore.ts's `progress` store,
// keyPath "nodeId"), so writing a child's progress under the same nodeId an
// adult reader used for the same canonical unit would silently overwrite one
// learner's progress with the other's. buildChildScopedNodeId composes a
// child-namespaced nodeId so the two never collide — same engine, same
// storage, same schema, just a different key. Full multi-profile support in
// the shared engine itself (e.g. a native profileId column) is a larger
// migration for a later PR, once more than one non-adult consumer exists to
// prove the shape.

import { recordLearningEvent } from "@/lib/knowledge/recordLearningEvent";
import type { CanonicalThoughtUnit } from "@/lib/canonical/types";

/** Pure — composes the child-namespaced nodeId. */
export function buildChildScopedNodeId(childProfileId: string, canonicalUnitId: string): string {
  return `elena:${childProfileId}:${canonicalUnitId}`;
}

/**
 * Records a page-read "exposure" event for each of a page's canonical units,
 * through the same recordLearningEvent pipeline the adult Reader uses.
 * Fire-and-forget from the caller's perspective — failures are swallowed by
 * the caller (see ElenaChildWorkspace.tsx's handleLogSession), matching how
 * WhiteboardPanel.tsx treats its own recordLearningEvent calls as best-effort.
 */
export async function recordChildPageExposure(
  childProfileId: string,
  documentId: string,
  units: CanonicalThoughtUnit[],
  occurredAt: string,
): Promise<void> {
  await Promise.all(
    units.map((unit) =>
      recordLearningEvent(
        buildChildScopedNodeId(childProfileId, unit.id),
        documentId,
        { kind: "exposure", sourceType: "read", occurredAt, sourceId: unit.id },
      ),
    ),
  );
}
