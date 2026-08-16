// lib/examEngine/datClassification.ts
// DAT's classification taxonomy — moved out of lib/canonical/types.ts so the
// shared canonical schema (consumed by Reader, NoteLab, Recall, Elena Mode,
// and every future ExamProfile) does not hard-code one exam's vocabulary.
//
// This is step one of decoupling DAT from the canonical layer: the TYPES now
// originate here, in the exam-engine layer that owns ExamProfile. The
// CanonicalThoughtUnit fields that carry these values (datSection, datTopic,
// datUnitType, ...) still live on the shared type for backward compatibility
// — lib/canonical/types.ts re-exports everything below unchanged. Fully
// detaching those fields (e.g. behind a per-profile classification map) is a
// larger migration for a later PR, once a second ExamProfile exists to prove
// the shape.

/** ADA DAT test section a unit maps to. */
export type DatSection =
  | 'biology'
  | 'general_chemistry'
  | 'organic_chemistry'
  | 'perceptual_ability'
  | 'reading_comprehension'
  | 'quantitative_reasoning'
  | 'none';

/** How a unit was classified into a DatSection. */
export type ClassificationSource =
  | 'title_keyword'      // classifyBook() on book title/id
  | 'content_lexicon'    // page-text lexicon scan
  | 'user_override'      // explicit user choice
  | 'unclassified';

/** DAT Blueprint topic string (maps to ExamProfile.topicBlueprint entries). */
export type DatTopic = string;

/** Broad role of a unit in DAT prep. */
export type DatUnitType =
  | 'definition'
  | 'mechanism'
  | 'clinical_application'
  | 'formula'
  | 'example'
  | 'contrast'
  | 'fact'
  | 'unknown';

/** Classify a DAT section from book-level classification result. */
export function datSectionFromSubject(
  subject: 'Biology' | 'General Chemistry' | 'Organic Chemistry' | 'Other',
): DatSection {
  switch (subject) {
    case 'Biology':           return 'biology';
    case 'General Chemistry': return 'general_chemistry';
    case 'Organic Chemistry': return 'organic_chemistry';
    default:                  return 'none';
  }
}
