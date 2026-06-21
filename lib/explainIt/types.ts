// lib/explainIt/types.ts
// Shared types for "Explain It" — the page/topic-level conversational tutor,
// distinct from "Explain This Step" (lib/explainStep/types.ts) which is a
// micro-tutor for a single selected sentence/equation. Explain It discusses
// the whole current page/topic and can hand off to/from Podcast Lab, so its
// context bundle is wider (RightPanel concepts, NoteLab, RecallLab, Study
// Guide sections, and an optional Podcast Lab outline).

export interface ExplainItMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ExplainItStudyNotes {
  whyThisMatters?: string | null;
  keyMechanism?: string | null;
  commonConfusion?: string | null;
  quickMemory?: string | null;
  reasoningFlow?: string | null;
  examSignal?: string | null;
}

export interface ExplainItNoteRef {
  topic: string;
  coreIdea: string;
}

export interface ExplainItRecallRef {
  front: string;
  back: string;
}

/** A few mustKnow-style lines pulled from the book's Study Guide Lab record, for grounding. */
export interface ExplainItStudyGuideRef {
  chapterTitle: string;
  mustKnow: string[];
}

export interface ExplainItContext {
  /** The active thought-unit text, if one is focused — not a hard "selection" like Explain This Step. */
  activeThoughtUnitText?: string;
  pageText: string;
  pageThesis: string | null;
  studyNotes: ExplainItStudyNotes | null;
  conceptTitles: string[];
  relatedNotes?: ExplainItNoteRef[];
  relatedRecallCards?: ExplainItRecallRef[];
  studyGuideSections?: ExplainItStudyGuideRef[];
  /** Spoken outline of a Podcast Lab script already generated for this page, if any. */
  podcastOutline?: string[];
  /** Set when Explain It was opened from a Podcast Lab segment ("Discuss") rather than the page generally. */
  seedSegmentText?: string;
  documentTitle?: string;
  pageNumber: number;
}
