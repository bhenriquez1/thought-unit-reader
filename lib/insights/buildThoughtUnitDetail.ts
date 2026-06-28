// lib/insights/buildThoughtUnitDetail.ts
// Expands a single VisualAnchor (the existing thought-unit primitive shared by
// LeftPanel highlighting, speech focus, and Whiteboard evidenceRefId) into the
// full Recall Lab v2 / NoteLab v2 box layout — deterministically, from fields
// already present on CurrentPageStudyModel. No new LLM call: this is the same
// "expand the page brain into a feature" pattern as buildRecallSetFromView /
// buildNoteFromStudyModel, just scoped to one anchor instead of the whole page.

import type { CurrentPageStudyModel, VisualAnchor } from "@/lib/insights/currentPageStudyModel";
import type { NoteCard } from "@/lib/insights/synthesizeTeachingOutput";
import type { UltraNote } from "@/lib/notelab/ultraNoteStore";

export interface ThoughtUnitDetail {
  evidenceRefId: string;
  bookId: string;
  pageNumber: number;
  /** Short label for the unit — concept block title when available, else a role-derived label. */
  title: string;
  /** Verbatim page text this unit is grounded in — used to seed Explain This Step / Visualize. */
  sourceText: string;
  coreIdea: string;
  mechanism: string | null;
  whyItMatters: string | null;
  commonConfusion: string | null;
  datFact: string | null;
  examTrap: string | null;
  recallCard: { front: string; back: string };
}

const ROLE_LABEL: Record<VisualAnchor["role"], string> = {
  coreIdea: "Page Thesis",
  definition: "Definition",
  mechanism: "Key Mechanism",
  exampleEvidence: "Why This Matters",
  keyDetail: "Key Detail",
  confusionTrap: "Common Confusion",
  datFact: "DAT High-Yield Fact",
  clinicalPearl: "Clinical Pearl",
  memoryHook: "Memory Hook",
  keyAnatomy: "Key Anatomy",
};

// Concept-block reasons are written as "Mechanism — Title" / "Common trap — Title" /
// "Concept — Title" by buildContractAnchorSeeds — recover the title to find the
// owning block so we can pull its other fields (pattern/trap/rule/mechanism).
function parseConceptTitle(reason: string): string | null {
  const m = reason.match(/—\s*(.+)$/);
  return m ? m[1].trim() : null;
}

function recallCardFor(
  role: VisualAnchor["role"],
  title: string,
  anchorText: string,
  fallback: { mechanism: string | null; commonConfusion: string | null; coreIdea: string },
): { front: string; back: string } {
  switch (role) {
    case "mechanism":
      return { front: `What is the mechanism behind: ${title}?`, back: fallback.mechanism ?? anchorText };
    case "confusionTrap":
      return { front: `⚠️ What is the common trap regarding: ${title}?`, back: fallback.commonConfusion ?? anchorText };
    case "definition":
      return { front: `Define: ${title}`, back: anchorText };
    case "datFact":
      return { front: `What is the DAT high-yield fact for: ${title}?`, back: anchorText };
    case "coreIdea":
      return { front: `What is the core idea of this page?`, back: fallback.coreIdea };
    default:
      return { front: `Explain: ${title}`, back: anchorText };
  }
}

export function buildThoughtUnitDetail(
  anchor: VisualAnchor,
  model: CurrentPageStudyModel,
  bookId: string,
): ThoughtUnitDetail {
  const conceptTitle = anchor.sourceField === "conceptBlock" ? parseConceptTitle(anchor.reason) : null;
  const block = conceptTitle
    ? model.conceptBlocks.find((b) => b.title === conceptTitle)
    : undefined;

  const title = conceptTitle ?? ROLE_LABEL[anchor.role] ?? "Thought Unit";
  const coreIdea = anchor.role === "coreIdea" ? anchor.exactText : model.pageThesis;
  const mechanism = block?.mechanism ?? (anchor.role === "mechanism" ? anchor.exactText : model.studyNotes.keyMechanism) ?? null;
  const commonConfusion = model.studyNotes.commonConfusion ?? null;
  const examTrap = block?.trap ?? (anchor.role === "confusionTrap" ? anchor.exactText : null);

  return {
    evidenceRefId: anchor.id,
    bookId,
    pageNumber: model.page,
    title,
    sourceText: anchor.exactText,
    coreIdea,
    mechanism,
    whyItMatters: model.studyNotes.whyThisMatters ?? null,
    commonConfusion,
    datFact: model.studyNotes.examSignal ?? null,
    examTrap,
    recallCard: recallCardFor(anchor.role, title, anchor.exactText, { mechanism, commonConfusion, coreIdea }),
  };
}

/**
 * Sibling to buildThoughtUnitDetail — expands an Adaptive Notebook NoteCard
 * into the same flat ThoughtUnitDetail DTO, so a card's "Explain" action can
 * reuse openExplainStepForThoughtUnit directly with no new entry point.
 */
export function buildThoughtUnitDetailFromNoteCard(card: NoteCard, note: UltraNote): ThoughtUnitDetail {
  return {
    evidenceRefId: `notecard-${note.id}-${card.type}`,
    bookId: note.bookId,
    pageNumber: note.pageNumber,
    title: card.title,
    sourceText: card.body,
    coreIdea: card.body,
    mechanism: card.type === "mechanism" ? card.body : null,
    whyItMatters: card.type === "must_know" || card.type === "why_this_matters" ? card.body : null,
    commonConfusion: card.type === "dat_trap" || card.type === "common_mistake" ? card.body : null,
    datFact: null,
    examTrap: card.type === "dat_trap" ? card.body : null,
    recallCard: { front: `Explain: ${card.title}`, back: card.body },
  };
}
