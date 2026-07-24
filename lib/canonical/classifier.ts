// lib/canonical/classifier.ts
// Single canonical DAT subject classifier used by every consumer:
//   - lib/apex/bookCatalogue.ts  (book picker, exam generation)
//   - lib/notelab/ultraNoteStore.ts (UltraNote.subject via inferSubject)
//   - lib/canonical/builder.ts  (CanonicalThoughtUnit.datSection)
//   - lib/recalllab/recallStore.ts (RecallSet.subject)
//
// Previously two incompatible classifiers existed:
//   - classifyBook() in bookCatalogue.ts → DATSubject (PascalCase)
//   - inferSubject() in ultraNoteStore.ts → NoteSubject ("Chemistry" collapses OC/GC)
//
// This file is the single source of truth.

export type DATSubject = "Biology" | "General Chemistry" | "Organic Chemistry" | "Other";
export type SubjectConfidence = "high" | "low";

export interface DATClassificationResult {
  subject: DATSubject;
  confidence: SubjectConfidence;
  /** Human-readable explanation of why this classification was chosen. */
  reason: string;
}

// ── Regex patterns — ordered by specificity, most-specific first ─────────────

const ORGANIC_HIGH = /organ(ic)?|orgo|klein|sn1|sn2|nucleophile|electrophile|carbocation|stereochem|aldehyde|ketone|ester|amide|amine|benzene|aromatic|alkane|alkene|alkyne/i;
const GENCHEM_HIGH = /gen(eral)?\s*chem|gchem|zumdahl|stoich|molarity|molality|enthalpy|entropy|gibbs|chad.*chem|dat.*gc|electrochemistry|redox|acid.base|buffer|kinetics|equilibrium|thermodynamic/i;
const BIOLOGY_HIGH = /bio(logy)?|anatomy|physiology|genetics|cell\s*bio|organism|evolution|ecology|feralis|campbell|cliff.*bio|histology|embry|taxonomy|microbio|botany|zoology|immunology|endocrin/i;
const GENCHEM_LOW  = /\bchem/i;

/**
 * Classify a book's DAT subject from its title and/or ID string.
 *
 * Confidence is "high" when multiple specific signals match or a very specific
 * keyword is present; "low" when only a generic term (e.g. bare "chem") was
 * found or nothing matched.
 */
export function classifyDATSubject(
  bookId: string,
  bookTitle?: string,
): DATClassificationResult {
  const text = `${bookId} ${bookTitle ?? ""}`.toLowerCase();

  if (ORGANIC_HIGH.test(text)) {
    return { subject: "Organic Chemistry", confidence: "high", reason: "Organic Chemistry keywords detected in title/id" };
  }
  if (GENCHEM_HIGH.test(text)) {
    return { subject: "General Chemistry", confidence: "high", reason: "General Chemistry keywords detected in title/id" };
  }
  if (BIOLOGY_HIGH.test(text)) {
    return { subject: "Biology", confidence: "high", reason: "Biology keywords detected in title/id" };
  }
  if (GENCHEM_LOW.test(text)) {
    return { subject: "General Chemistry", confidence: "low", reason: "Generic 'chem' keyword — may be General or Organic Chemistry" };
  }
  return { subject: "Other", confidence: "low", reason: "No DAT subject keywords found in title/id" };
}

// ── NoteSubject mapping ───────────────────────────────────────────────────────
// NoteSubject is broader than DATSubject (includes Calculus, Physics, CS, etc.)
// and is used by NoteLab/Recall for general categorization.
// When we need a NoteSubject we map through DATSubject to stay consistent.

export type NoteSubject =
  | "Biology"
  | "Calculus"
  | "Chemistry"           // retained for legacy UltraNotes
  | "Physics"
  | "Computer Science"
  | "Law"
  | "Nursing / Pharmacology"
  | "Dental / Clinical"
  | "General Notes";

/**
 * Infer a NoteSubject from a bookId.  Uses the canonical DAT classifier where
 * possible so Biology / OC / GC are never collapsed into a generic "Chemistry".
 */
export function inferNoteSubject(bookId: string, bookTitle?: string): NoteSubject {
  const lower = `${bookId} ${bookTitle ?? ""}`.toLowerCase();

  // Non-DAT subjects first (these aren't in DATSubject at all)
  if (/calc|math|algebra|geometry|trig|statistic|linear|differential/.test(lower)) return "Calculus";
  if (/physics|mechanics|thermodynamic|electromagnet/.test(lower)) return "Physics";
  if (/nursing|pharma|nclex/.test(lower)) return "Nursing / Pharmacology";
  if (/\blaw\b|legal|contract|tort/.test(lower)) return "Law";
  if (/computer\s*science|programming|algorithm|software|coding/.test(lower)) return "Computer Science";
  if (/dental|dent|medical|med|clinical|patho|histology/.test(lower)) return "Dental / Clinical";

  // DAT-aligned subjects via canonical classifier
  const { subject } = classifyDATSubject(bookId, bookTitle);
  switch (subject) {
    case "Biology":           return "Biology";
    case "General Chemistry": return "Chemistry";
    case "Organic Chemistry": return "Chemistry";
    default:                  return "General Notes";
  }
}
