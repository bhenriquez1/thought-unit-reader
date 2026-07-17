// lib/learningProfile/profileContext.ts
// Single source of truth for how each Learning Profile frames AI-generated content.
// Injected into every AI route that produces explanations, teaching sequences, or
// practice material — so the same KnowledgeNode produces contextually appropriate
// output without any per-route profile logic.

import type { LearningProfile } from "@/types/workspace";

interface ProfileFraming {
  /** Short label shown in UI */
  label: string;
  /**
   * One-paragraph framing block prepended to every AI system prompt.
   * Written in second-person ("You are tutoring…") so it reads naturally
   * alongside each route's own system instructions.
   */
  systemBlock: string;
  /**
   * Maps to the legacy audienceMode field used in some older routes.
   * Keeps backward compatibility without a breaking rename.
   */
  audienceMode: "student" | "clinical" | "expert";
}

const PROFILE_FRAMINGS: Record<LearningProfile, ProfileFraming> = {
  standard: {
    label: "Standard",
    systemBlock:
      "You are tutoring a college or early graduate student who needs clear, foundational explanations. " +
      "Use plain language and accessible analogies. Prefer everyday examples over field-specific jargon. " +
      "Build from first principles so the student understands the why, not just the what.",
    audienceMode: "student",
  },
  dental: {
    label: "Dental",
    systemBlock:
      "You are tutoring a dental student. Anchor every explanation in clinical dental relevance: " +
      "oral anatomy, dental procedures, oral pathology, pharmacology important to dentistry, " +
      "and DAT exam connections where applicable. Use clinical pearl format when a point has direct " +
      "chair-side or exam significance. Frame mechanisms through the lens of what a dentist actually sees, " +
      "treats, or tests.",
    audienceMode: "clinical",
  },
  medical: {
    label: "Medical",
    systemBlock:
      "You are tutoring a medical student or physician. Emphasize pathophysiology, clinical presentation, " +
      "diagnosis, differential diagnosis, treatment protocols, and patient safety. Use medical terminology " +
      "confidently but define ambiguous abbreviations. Connect mechanisms to clinical outcomes. " +
      "When relevant, note how a concept appears on licensing exams (USMLE Step 1/2).",
    audienceMode: "clinical",
  },
  surgeon: {
    label: "Surgeon",
    systemBlock:
      "You are tutoring a surgical resident or attending surgeon. Be clinically precise and direct. " +
      "Prioritize surgical anatomy, operative indications, procedural steps in sequence, " +
      "intraoperative decision points, potential complications and how to avoid them, " +
      "and postoperative management. Skip basic science review unless it directly explains " +
      "a surgical decision. Think and write the way a scrubbed surgeon thinks.",
    audienceMode: "expert",
  },
  dat: {
    label: "DAT",
    systemBlock:
      "You are tutoring a DAT exam candidate who needs to pass efficiently. Ruthlessly prioritize " +
      "high-yield facts. Identify the most common exam distractors for this concept. Provide " +
      "a memory hook or mnemonic that is correct and sticky. Flag exam traps — the specific wrong " +
      "answers students choose and why they seem plausible. Be concise: the student is reviewing, " +
      "not learning for the first time. Every sentence should improve their score.",
    audienceMode: "student",
  },
};

/**
 * Returns the framing system block for a given Learning Profile.
 * Safe to call with undefined — falls back to "standard".
 */
export function getProfileSystemBlock(profile: LearningProfile | undefined | null): string {
  return PROFILE_FRAMINGS[profile ?? "standard"].systemBlock;
}

/** Full framing object for a profile (label, systemBlock, audienceMode). */
export function getProfileFraming(profile: LearningProfile | undefined | null): ProfileFraming {
  return PROFILE_FRAMINGS[profile ?? "standard"];
}

export type { ProfileFraming };
