// lib/datApex/sessionState.ts
// DAT Apex exam session state machine.
//
// Valid transitions:
//   idle → tutorial → in-section → (break →) in-section → final-review → submitted
//   in-section → paused → in-section   (practice mode only)
//
// "paused" is never reachable in simulation mode.
// "break" is only reachable when the active blueprint defines a break after the
// current section family (currently after perceptual-ability).

import type { DatSectionId, DatSectionFamily, DatExamBlueprint } from "./blueprint";
import type { DatSessionPhase } from "./types";

/* ─── Session state ────────────────────────────────────────────────────────── */

export type DatSessionMode = "practice" | "simulation";

export type DatSessionState = {
  phase:           DatSessionPhase;
  mode:            DatSessionMode;
  attemptId:       string | null;
  testFormId:      string | null;
  /** Current section being administered (null when not in-section) */
  currentSectionId: DatSectionId | null;
  /** Sections completed so far (in order) */
  completedSections: DatSectionId[];
  /** Seconds remaining for the current section's time limit */
  sectionSecondsRemaining: number;
  /** Whether the current break has been started */
  breakStartedAt:  string | null;
};

export function initialSessionState(): DatSessionState {
  return {
    phase:                   "idle",
    mode:                    "practice",
    attemptId:               null,
    testFormId:              null,
    currentSectionId:        null,
    completedSections:       [],
    sectionSecondsRemaining: 0,
    breakStartedAt:          null,
  };
}

/* ─── Transition errors ────────────────────────────────────────────────────── */

export class DatSessionTransitionError extends Error {
  constructor(
    public readonly from: DatSessionPhase,
    public readonly to:   DatSessionPhase,
    reason: string,
  ) {
    super(`DAT session: cannot transition ${from} → ${to}: ${reason}`);
    this.name = "DatSessionTransitionError";
  }
}

/* ─── Transition guards ────────────────────────────────────────────────────── */

function assertPhase(state: DatSessionState, expected: DatSessionPhase): void {
  if (state.phase !== expected) {
    throw new DatSessionTransitionError(
      state.phase,
      expected,
      `expected phase "${expected}" but got "${state.phase}"`,
    );
  }
}

function assertNotSimulation(state: DatSessionState, operation: string): void {
  if (state.mode === "simulation") {
    throw new DatSessionTransitionError(
      state.phase,
      "paused",
      `${operation} is not permitted in simulation mode`,
    );
  }
}

/* ─── Transition functions ─────────────────────────────────────────────────── */

/** Start tutorial from idle. */
export function startTutorial(
  state:      DatSessionState,
  attemptId:  string,
  testFormId: string,
  mode:       DatSessionMode,
): DatSessionState {
  assertPhase(state, "idle");
  return { ...state, phase: "tutorial", attemptId, testFormId, mode };
}

/** Advance from tutorial into the first section. */
export function beginFirstSection(
  state:     DatSessionState,
  sectionId: DatSectionId,
  timeLimitSeconds: number,
): DatSessionState {
  assertPhase(state, "tutorial");
  return {
    ...state,
    phase:                   "in-section",
    currentSectionId:        sectionId,
    sectionSecondsRemaining: timeLimitSeconds,
  };
}

/**
 * Advance from in-section to the next section, inserting a break when the
 * blueprint mandates one after the family of the completed section.
 */
export function advanceSection(
  state:            DatSessionState,
  completedSection: DatSectionId,
  nextSectionId:    DatSectionId | null,
  nextTimeLimitSeconds: number,
  blueprint:        DatExamBlueprint,
): DatSessionState {
  assertPhase(state, "in-section");

  const completed = [...state.completedSections, completedSection];

  // Determine the family of the completed section
  const completedFamily = sectionFamily(completedSection, blueprint);

  // Check if a break is scheduled after this family
  const breakDue = blueprint.breaks.some(b => b.afterSectionFamily === completedFamily);

  if (breakDue && nextSectionId !== null) {
    return {
      ...state,
      phase:             "break",
      completedSections: completed,
      currentSectionId:  null,
      breakStartedAt:    null,
      sectionSecondsRemaining: 0,
    };
  }

  if (nextSectionId === null) {
    // No more sections — go to final review
    return {
      ...state,
      phase:             "final-review",
      completedSections: completed,
      currentSectionId:  null,
      sectionSecondsRemaining: 0,
    };
  }

  return {
    ...state,
    phase:                   "in-section",
    completedSections:       completed,
    currentSectionId:        nextSectionId,
    sectionSecondsRemaining: nextTimeLimitSeconds,
    breakStartedAt:          null,
  };
}

/** Resume from a break into the next section. */
export function resumeFromBreak(
  state:           DatSessionState,
  nextSectionId:   DatSectionId,
  timeLimitSeconds: number,
): DatSessionState {
  assertPhase(state, "break");
  return {
    ...state,
    phase:                   "in-section",
    currentSectionId:        nextSectionId,
    sectionSecondsRemaining: timeLimitSeconds,
    breakStartedAt:          null,
  };
}

/** Pause the session (practice mode only). */
export function pauseSession(state: DatSessionState): DatSessionState {
  assertPhase(state, "in-section");
  assertNotSimulation(state, "pause");
  return { ...state, phase: "paused" };
}

/** Resume from paused back to in-section. */
export function resumeFromPause(state: DatSessionState): DatSessionState {
  assertPhase(state, "paused");
  return { ...state, phase: "in-section" };
}

/** Move from in-section directly to final-review (e.g. time expired). */
export function enterFinalReview(state: DatSessionState): DatSessionState {
  if (state.phase !== "in-section" && state.phase !== "break") {
    throw new DatSessionTransitionError(
      state.phase,
      "final-review",
      "can only enter final-review from in-section or break",
    );
  }
  return {
    ...state,
    phase:            "final-review",
    currentSectionId: null,
    sectionSecondsRemaining: 0,
  };
}

/** Submit the exam (terminal state). */
export function submitExam(state: DatSessionState): DatSessionState {
  if (state.phase !== "final-review" && state.phase !== "in-section") {
    throw new DatSessionTransitionError(
      state.phase,
      "submitted",
      "can only submit from final-review or in-section (time expired)",
    );
  }
  return { ...state, phase: "submitted", currentSectionId: null };
}

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

/** Derive the section family for a given sectionId from the blueprint. */
export function sectionFamily(
  sectionId: DatSectionId,
  blueprint: DatExamBlueprint,
): DatSectionFamily {
  for (const section of blueprint.sections) {
    if (section.subSections.some(ss => ss.id === sectionId)) {
      return section.family;
    }
  }
  throw new Error(`sectionFamily: sectionId "${sectionId}" not found in blueprint`);
}

/** All section IDs in administration order, derived from blueprint. */
export function orderedSectionIds(blueprint: DatExamBlueprint): DatSectionId[] {
  const ids: DatSectionId[] = [];
  for (const familyId of blueprint.sectionFamilyOrder) {
    const section = blueprint.sections.find(s => s.family === familyId);
    if (section) {
      for (const ss of section.subSections) {
        ids.push(ss.id);
      }
    }
  }
  return ids;
}

/** The section ID that follows the given one in administration order, or null. */
export function nextSectionId(
  current:   DatSectionId,
  blueprint: DatExamBlueprint,
): DatSectionId | null {
  const ordered = orderedSectionIds(blueprint);
  const idx = ordered.indexOf(current);
  if (idx === -1 || idx === ordered.length - 1) return null;
  return ordered[idx + 1];
}
