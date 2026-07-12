// lib/insights/expertProfiles/types.ts
//
// ExpertProfile extends DomainPreset with the additional fields that drive
// synthesis persona, speech ordering, study note layout, recall templates,
// whiteboard style, and Expert Brain reasoning.
//
// DomainPreset (domainPresets.ts) owns: id, displayName, detection keywords,
//   taxonomy (kindGroups, kindLabels), and kindPriority.
// ExpertProfileExtension adds: speech, studyNotes, recall, whiteboard, expertBrain.
// ExpertProfile = DomainPreset & ExpertProfileExtension — satisfies DomainPreset
//   so all existing consumers (getKindGroups, getKindLabel, etc.) keep working.

import type { ParagraphKind } from "@/lib/readerContracts";
import type { DomainPreset, KindGroup } from "@/lib/insights/domainPresets";

export type { DomainPreset, KindGroup };

// ─── Speech layer ────────────────────────────────────────────────────────────

export type SpeechIntroStyle =
  | "clinical"     // dental / medical — finding → significance → next action
  | "socratic"     // law / philosophy — question → rule → application
  | "narrative"    // humanities / literature — context → event → meaning
  | "analytical"   // science / business — cause → mechanism → implication
  | "procedural";  // math / engineering / aviation — step → check → result

export interface ExpertProfileSpeech {
  introStyle: SpeechIntroStyle;
  /** Per-kind narration prefix for Guided mode ("The diagnosis here is: "). */
  guidedPrefixByKind: Partial<Record<string, string>>;
  /** Kinds surfaced in Focus mode (highest-value anchors). */
  focusKinds: ParagraphKind[];
  /** Kinds included in Study mode (all anchors worth hearing). */
  essentialKinds: ParagraphKind[];
}

// ─── Study Notes layer ───────────────────────────────────────────────────────

export interface ExpertProfileStudyNotes {
  /** Renames the fixed study note field labels for this domain. */
  fieldLabels: Partial<Record<string, string>>;
  /** Hints to the AI about how to fill each study note field for this domain. */
  templateHints: Partial<Record<string, string>>;
  /** Card layout preferences for the Adaptive Notebook ("flowchart", "concept_map", …). */
  preferredLayouts: string[];
}

// ─── Recall layer ────────────────────────────────────────────────────────────

export interface ExpertProfileRecall {
  /** Fill-in-the-blank sentence templates for Recall Lab question generation. */
  templates: string[];
  preferredQuestionTypes: string[];
}

// ─── Whiteboard layer ────────────────────────────────────────────────────────

export type WhiteboardStyle =
  | "flowchart"
  | "concept_map"
  | "timeline"
  | "diagram"
  | "worked_steps";

export interface ExpertProfileWhiteboard {
  preferredStyle: WhiteboardStyle;
}

// ─── Expert Brain layer ──────────────────────────────────────────────────────

export interface ExpertProfileBrain {
  /**
   * System prompt persona injected into synthesis calls.
   * Must be educational, grounded, and never invent credentials, patient facts,
   * legal conclusions, or content beyond the source page.
   */
  persona: string;
  /** Ordered list of reasoning priorities injected into the synthesis prompt. */
  reasoningPriorities: string[];
  /** Short style descriptor used in prompt formatting ("clinical-sequential", etc.). */
  explanationStyle: string;
}

// ─── Full extension ──────────────────────────────────────────────────────────

export interface ExpertProfileExtension {
  speech: ExpertProfileSpeech;
  studyNotes: ExpertProfileStudyNotes;
  recall: ExpertProfileRecall;
  whiteboard: ExpertProfileWhiteboard;
  expertBrain: ExpertProfileBrain;
}

// ─── ExpertProfile = DomainPreset + ExpertProfileExtension ───────────────────
// Satisfies DomainPreset so all existing consumers keep working.

export type ExpertProfile = DomainPreset & ExpertProfileExtension;
