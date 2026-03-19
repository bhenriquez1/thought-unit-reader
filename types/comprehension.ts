export type DisciplineType =
  | 'medical_clinical'
  | 'dental_clinical'
  | 'biology'
  | 'chemistry'
  | 'physics'
  | 'mathematics'
  | 'history'
  | 'law'
  | 'philosophy'
  | 'general_academic'
  | 'technical_procedural'
  | 'unknown';

export type PageType =
  | 'definition_page'
  | 'concept_overview'
  | 'comparison_page'
  | 'mechanism_page'
  | 'process_page'
  | 'procedure_page'
  | 'formula_page'
  | 'evidence_results_page'
  | 'case_application_page'
  | 'timeline_causation_page'
  | 'anatomy_structure_page'
  | 'mixed_page'
  | 'unknown';

export type GroundedConceptRole = 'core' | 'supporting' | 'contrast' | 'formula' | 'step' | 'example';

export type EvidenceAnchor = {
  pageNumber: number;
  paragraphId?: string | null;
  text: string;
};

export type GroundedConcept = {
  id: string;
  label: string;
  aliases?: string[];
  description?: string;
  pageEvidence: EvidenceAnchor[];
  role?: GroundedConceptRole;
  confidence: number;
};
