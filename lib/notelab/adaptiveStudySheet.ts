// lib/notelab/adaptiveStudySheet.ts
// Domain-agnostic study sheet type system.
// Replaces the DAT-specific DATStudySheet with a profile-driven flexible model.
// Each section is a labeled block with optional citation metadata.

import { z } from "zod";

// ── Section (universal labeled block) ────────────────────────────────────

export const StudySheetSectionSchema = z.object({
  label:      z.string(),               // e.g. "Mechanism", "Clinical Pearl", "Timeline"
  icon:       z.string(),               // emoji
  content:    z.string(),               // primary paragraph content
  subItems:   z.array(z.string()).nullable(), // bullets or ordered steps
  anchorId:   z.string().nullable(),    // stable "aN" — index into canonicalAnchors
  sourcePage: z.number().int().nullable(),
  sourceText: z.string().nullable(),    // verbatim source passage (server-hydrated)
});
export type StudySheetSection = z.infer<typeof StudySheetSectionSchema>;

// ── Formula ───────────────────────────────────────────────────────────────

export const StudySheetFormulaSchema = z.object({
  expression:  z.string(),             // e.g. "ΔG = ΔH − TΔS"
  description: z.string(),             // when to use / what it calculates
  variables:   z.array(z.object({
    symbol:  z.string(),
    meaning: z.string(),
  })).nullable(),
  anchorId:   z.string().nullable(),
  sourcePage: z.number().int().nullable(),
});
export type StudySheetFormula = z.infer<typeof StudySheetFormulaSchema>;

// ── Diagram ───────────────────────────────────────────────────────────────

export const StudySheetDiagramTypeSchema = z.enum([
  "flow",        // linear A → B → C chain
  "reaction",    // reactants → products
  "table",       // rows/columns (first row = header)
  "comparison",  // two-column side-by-side
  "cycle",       // circular / closed loop
  "anatomy",     // labeled spatial diagram described in text
  "timeline",    // temporal sequence
  "none",        // no diagram — section omitted
]);

export const StudySheetDiagramSchema = z.object({
  type:        StudySheetDiagramTypeSchema,
  title:       z.string(),
  nodes:       z.array(z.object({ id: z.string(), label: z.string() })).nullable(),
  arrows:      z.array(z.object({ from: z.string(), to: z.string(), label: z.string().nullable() })).nullable(),
  rows:        z.array(z.array(z.string())).nullable(), // used by table / comparison
  description: z.string(),                              // plain-text fallback
  anchorId:    z.string().nullable(),
});
export type StudySheetDiagram = z.infer<typeof StudySheetDiagramSchema>;

// ── Practice Question ──────────────────────────────────────────────────────

export const StudySheetQuestionSchema = z.object({
  question:     z.string(),
  options:      z.array(z.string()),    // exactly 4 items
  correctIndex: z.number().int().min(0).max(3),
  explanation:  z.string(),
  anchorId:     z.string().nullable(),
});
export type StudySheetQuestion = z.infer<typeof StudySheetQuestionSchema>;

// ── Validation issue — records missing required content without fabricating it ──

export const ValidationIssueSchema = z.object({
  sectionType: z.string(),
  code:        z.string(),  // e.g. "required-section-missing"
  message:     z.string(),
});
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;

// ── Full Adaptive Study Sheet ─────────────────────────────────────────────

export const AdaptiveStudySheetSchema = z.object({
  // Identity
  profileId:    z.string(),   // ProfileId from studySheetProfiles.ts
  documentType: z.string(),   // "Chemistry", "Law", etc.
  sheetStyle:   z.string(),   // "exam-prep" | "reference" | "clinical" | "legal" | "analytical"
  concept:      z.string(),
  subjectArea:  z.string(),

  // Core idea — always first, always one sentence
  coreIdea: z.string(),

  // Labeled sections — profile-driven, ordered as specified by the profile
  sections: z.array(StudySheetSectionSchema),

  // Rich structured sections (null when profile does not call for them)
  formula:           StudySheetFormulaSchema.nullable(),
  diagram:           StudySheetDiagramSchema.nullable(),
  practiceQuestions: z.array(StudySheetQuestionSchema).nullable(),

  // Cross-subject links
  connections: z.array(z.object({
    from:       z.string(),
    to:         z.string(),
    connection: z.string(),
  })).nullable(),

  relatedTopics: z.array(z.string()).nullable(),

  // Source traceability
  canonicalSourcePage: z.number().int().nullable(),

  // Profile provenance — set by server after generation, output null from model
  detectedProfileId: z.string().nullable(),
  selectedProfileId: z.string().nullable(),

  // Sheet versioning — stamped server-side, output null from model
  generatorVersion: z.string().nullable(),
  profileVersion:   z.string().nullable(),
  schemaVersion:    z.number().int().nullable(),
  generatedAt:      z.string().nullable(),
  modelId:          z.string().nullable(),
  sourceDocumentId: z.string().nullable(),

  // Post-generation validation — set by server, output null from model
  validationIssues: z.array(ValidationIssueSchema).nullable(),
});
export type AdaptiveStudySheet = z.infer<typeof AdaptiveStudySheetSchema>;
