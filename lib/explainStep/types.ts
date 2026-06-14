// lib/explainStep/types.ts
// Shared types for the "Explain This Step" feature, used by both the API
// route (pages/api/explainStep.ts) and client components. Kept in a neutral
// module so client bundles never import from pages/api/* directly.

export interface ExplainStepMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ExplainStepStudyNotes {
  whyThisMatters?: string | null;
  keyMechanism?: string | null;
  commonConfusion?: string | null;
  quickMemory?: string | null;
  reasoningFlow?: string | null;
  examSignal?: string | null;
}

/** Minimal reference to an existing NoteLab note for this page, for tutor context. */
export interface ExplainStepNoteRef {
  topic: string;
  coreIdea: string;
}

/** Minimal reference to an existing RecallLab card for this page, for tutor context. */
export interface ExplainStepRecallRef {
  front: string;
  back: string;
}
