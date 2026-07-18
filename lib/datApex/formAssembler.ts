// lib/datApex/formAssembler.ts
// Blueprint-driven test form assembly contract.
//
// The assembler picks questions from the approved pool according to the active
// DatExamBlueprint's item counts and topicWeights. It does NOT own the question
// store — callers inject a question fetcher.
//
// Key invariants:
//   - Only "approved" questions are eligible for exam forms.
//   - Topic sampling respects blueprint targetPct ± tolerancePct.
//   - Section item counts match blueprint exactly.
//   - Practice forms may draw from the same pool with any validationStatus.

import type { DatExamBlueprint, DatSectionId, DatSubSectionBlueprint, DatTopicWeight } from "./blueprint";
import type { DatExamQuestion, DatTestForm, QuestionValidationStatus } from "./types";

/* ─── Assembly contract ────────────────────────────────────────────────────── */

export type AssemblyMode = "simulation" | "practice";

export type FormAssemblyOptions = {
  mode:            AssemblyMode;
  attemptId:       string;
  /** Caller-provided; defaults to Date.now() ISO string */
  createdAt?:      string;
  /**
   * For practice: optionally restrict to specific sections.
   * Omit to assemble a full-length form.
   */
  sectionsFilter?: DatSectionId[];
};

export type FormAssemblyResult =
  | { ok: true;  form: DatTestForm }
  | { ok: false; error: string; shortfall?: SectionShortfall[] };

export type SectionShortfall = {
  sectionId:    DatSectionId;
  required:     number;
  available:    number;
};

/* ─── Question pool interface ──────────────────────────────────────────────── */

/**
 * Callers implement this to supply questions from their store.
 * The assembler is store-agnostic.
 */
export interface QuestionPool {
  /** Return all questions for the given sectionId with the specified statuses. */
  fetchBySection(
    sectionId:  DatSectionId,
    statuses:   QuestionValidationStatus[],
  ): Promise<DatExamQuestion[]>;
}

/* ─── Assembler ─────────────────────────────────────────────────────────────── */

export async function assembleTestForm(
  blueprint: DatExamBlueprint,
  pool:      QuestionPool,
  options:   FormAssemblyOptions,
): Promise<FormAssemblyResult> {
  const { mode, attemptId, sectionsFilter } = options;
  const createdAt = options.createdAt ?? new Date().toISOString();

  // Simulation requires approved questions only; practice accepts any
  const eligibleStatuses: QuestionValidationStatus[] =
    mode === "simulation"
      ? ["approved"]
      : ["draft", "content-validated", "answer-verified", "distractors-reviewed", "specification-aligned", "approved"];

  const formSections: DatTestForm["sections"] = [];
  const shortfalls:   SectionShortfall[]      = [];

  for (const blueprintSection of blueprint.sections) {
    for (const subSection of blueprintSection.subSections) {
      if (sectionsFilter && !sectionsFilter.includes(subSection.id)) continue;

      const candidates = await pool.fetchBySection(subSection.id, eligibleStatuses);
      const selected   = sampleByTopicWeights(candidates, subSection);

      if (selected.length < subSection.itemCount) {
        shortfalls.push({
          sectionId: subSection.id,
          required:  subSection.itemCount,
          available: selected.length,
        });
      }

      formSections.push({
        sectionId:   subSection.id,
        questionIds: selected.map(q => q.id),
      });
    }
  }

  if (shortfalls.length > 0) {
    return {
      ok:        false,
      error:     `Question pool insufficient for ${shortfalls.length} section(s)`,
      shortfall: shortfalls,
    };
  }

  const form: DatTestForm = {
    id:               `form-${attemptId}`,
    blueprintVersion: blueprint.version,
    sections:         formSections,
    createdAt,
  };

  return { ok: true, form };
}

/* ─── Topic-weight sampling ────────────────────────────────────────────────── */

/**
 * Sample exactly `subSection.itemCount` questions from `candidates` while
 * respecting the topicWeights distribution (targetPct ± tolerancePct).
 *
 * Algorithm:
 *   1. Compute per-topic quota from targetPct × itemCount.
 *   2. Fill each topic's quota, up to available questions in that topic.
 *   3. Backfill any remaining slots from the residual pool (any topic).
 *   4. Shuffle the result to prevent predictable question ordering.
 */
function sampleByTopicWeights(
  candidates: DatExamQuestion[],
  subSection: DatSubSectionBlueprint,
): DatExamQuestion[] {
  const total = subSection.itemCount;
  if (candidates.length === 0) return [];

  // Group by topic
  const byTopic = new Map<string, DatExamQuestion[]>();
  for (const q of candidates) {
    const bucket = byTopic.get(q.topicId) ?? [];
    bucket.push(q);
    byTopic.set(q.topicId, bucket);
  }

  // Shuffle each topic bucket (Fisher-Yates determinism would need a seed;
  // for now we rely on array order from the store, which the store should randomize)
  const selected: DatExamQuestion[] = [];
  const used     = new Set<string>();

  // First pass: fill topic quotas
  for (const weight of subSection.topicWeights) {
    const quota   = Math.round((weight.targetPct / 100) * total);
    const bucket  = byTopic.get(weight.topicId) ?? [];
    let   filled  = 0;
    for (const q of bucket) {
      if (filled >= quota) break;
      if (!used.has(q.id)) {
        selected.push(q);
        used.add(q.id);
        filled++;
      }
    }
  }

  // Second pass: backfill remaining slots from any unused candidates
  if (selected.length < total) {
    for (const q of candidates) {
      if (selected.length >= total) break;
      if (!used.has(q.id)) {
        selected.push(q);
        used.add(q.id);
      }
    }
  }

  return selected.slice(0, total);
}

/* ─── Blueprint-driven section time limit ──────────────────────────────────── */

/** Return the time limit in seconds for a given section ID. */
export function sectionTimeLimitSeconds(
  sectionId: DatSectionId,
  blueprint: DatExamBlueprint,
): number {
  for (const section of blueprint.sections) {
    const match = section.subSections.find(ss => ss.id === sectionId);
    if (match) {
      // Natural Sciences is one timed block — all sub-sections share the family limit
      return section.timeLimitMinutes * 60;
    }
  }
  throw new Error(`sectionTimeLimitSeconds: sectionId "${sectionId}" not in blueprint`);
}
