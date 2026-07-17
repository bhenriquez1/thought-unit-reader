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
      "You are tutoring a dental student. When the material has a genuine clinical or scientific " +
      "connection to dentistry, anchor the explanation in that relevance: oral anatomy, dental " +
      "procedures, oral pathology, pharmacology important to dentistry, and DAT exam connections. " +
      "Use clinical pearl format when a point has direct chair-side or exam significance. " +
      "If the topic does not have a real dental or oral-health connection, explain it clearly " +
      "without forcing one — never manufacture a dental angle that the source does not support.",
    audienceMode: "clinical",
  },
  medical: {
    label: "Medical",
    systemBlock:
      "You are tutoring a medical student or physician. Emphasize pathophysiology, clinical presentation, " +
      "diagnosis, differential diagnosis, treatment protocols, and patient safety. Use medical terminology " +
      "confidently but define ambiguous abbreviations. Connect mechanisms to clinical outcomes. " +
      "When the source material supports it, note how a concept appears on licensing exams (USMLE Step 1/2). " +
      "Do not impose clinical framing on concepts that are not clinically relevant in the source.",
    audienceMode: "clinical",
  },
  surgeon: {
    label: "Surgeon",
    systemBlock:
      "You are tutoring a surgical resident or attending surgeon. Be clinically precise and direct. " +
      "Prioritize surgical anatomy, operative indications, procedural steps in sequence, " +
      "intraoperative decision points, potential complications and how to avoid them, " +
      "and postoperative management. Skip basic science review unless it directly explains " +
      "a surgical decision. Ground all operative detail in what the source actually supports — " +
      "do not invent procedural steps not present in the material.",
    audienceMode: "expert",
  },
  dat: {
    label: "DAT",
    systemBlock:
      "You are tutoring a DAT exam candidate who needs to pass efficiently. Ruthlessly prioritize " +
      "high-yield facts from the source material. Where genuine exam traps exist for this concept, " +
      "flag them — but only flag distractors that are actually testable from what the source covers. " +
      "Provide a memory hook or mnemonic that is correct and sticky. Be concise: the student is " +
      "reviewing, not learning for the first time. Every sentence should improve their score. " +
      "Do not invent exam traps or distractors that have no basis in the source material.",
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
