// lib/notelab/conceptAccumulation.ts
// M4 — the correction's own example: "Textbook page 161 + lecture slides +
// Professor explanation + student's handwritten note can all strengthen
// the same Ionic Bonding notebook concept." NoteLab should accumulate
// knowledge across sources, not treat every page as an isolated note.
//
// Deliberately NOT a note-identity change: UltraNote's own storage key
// stays (bookId, pageNumber) exactly as it always has — changing that would
// ripple through every part of the app that assumes one note per page
// (Reader's jump-to-note, Recall's sourceNoteId references, exam scoping,
// ...), the single riskiest move available for this phase. Concept-level
// accumulation is layered ON TOP of that existing identity, reusing
// infrastructure that already exists and is already wired rather than
// inventing a parallel one:
//   - UltraNote.knowledgeNodeId already identifies "which concept is this
//     page about" — resolved via lib/knowledge/knowledgeGraphStore.ts's
//     resolveOrCreateNode (Tier 1 exact canonicalAnchorId match, Tier 2
//     fuzzy same-page title overlap, Tier 3 create new) and already
//     back-filled at every note-save call site in pages/index.tsx (and now
//     WhiteboardPanel.tsx's own handleSaveToNoteLab — see its own M4
//     comment). This file does the identity resolution NO WORK of its
//     own — it only reads the knowledgeNodeId a note already carries.
//   - KnowledgeNode's own Book -> Chapter -> Section -> Concept hierarchy
//     (lib/knowledge/knowledgeGraphSchema.ts) already models exactly the
//     structure the correction describes; nothing here duplicates it.
//
// gatherConceptNotebookContent below is the bridge into notebookPlanner.ts's
// synthesis pipeline (M2/M3): it finds every OTHER note sharing the same
// knowledgeNodeId, summarizes what each one's own notebook already
// contains, and hands that back as one combined text block for the
// relatedConceptKnowledge prompt field — so composing THIS page's notebook
// genuinely blends with what the student already knows about the same
// concept from other pages/sources, instead of starting blind every time.

import { getAllUltraNotesAsync } from "@/lib/notelab/ultraNoteStore";
import { summarizeExistingNotebookScene } from "@/lib/notelab/notebookPlanner";

// Keeps the combined prompt section bounded — an unbounded number of
// sibling notes, or unbounded per-note text, would grow the prompt without
// limit the more a concept accumulates, exactly the failure mode a
// cumulative feature needs to avoid. Most recently composed notes first:
// the freshest material is the most likely to reflect the student's
// current understanding.
const MAX_SIBLING_NOTES = 5;
const MAX_SUMMARY_CHARS_PER_NOTE = 600;

/**
 * Gathers what OTHER notes sharing the same knowledgeNodeId already know —
 * each one's own composed notebook content, source-labeled by book/page —
 * as one combined text block. Returns null when there's nothing to gather
 * (no sibling notes, or none has a composed notebookScene yet) — never a
 * placeholder standing in for content that doesn't exist.
 */
export async function gatherConceptNotebookContent(
  knowledgeNodeId: string,
  excludeNoteId?: string,
): Promise<string | null> {
  const allNotes = await getAllUltraNotesAsync();
  const siblings = allNotes
    .filter((n) => n.knowledgeNodeId === knowledgeNodeId && n.id !== excludeNoteId && n.notebookScene)
    .sort((a, b) => (b.notebookScene!.builtAt ?? 0) - (a.notebookScene!.builtAt ?? 0))
    .slice(0, MAX_SIBLING_NOTES);

  if (!siblings.length) return null;

  const sections = siblings
    .map((note) => {
      const summary = summarizeExistingNotebookScene(note.notebookScene!).slice(0, MAX_SUMMARY_CHARS_PER_NOTE);
      if (!summary.trim()) return null; // a scene with only empty-content blocks contributes nothing
      const sourceLabel = note.bookTitle ? `${note.bookTitle}, p.${note.pageNumber}` : `${note.bookId}, p.${note.pageNumber}`;
      return `${sourceLabel}:\n${summary}`;
    })
    .filter((s): s is string => s !== null);

  return sections.length ? sections.join("\n\n") : null;
}
