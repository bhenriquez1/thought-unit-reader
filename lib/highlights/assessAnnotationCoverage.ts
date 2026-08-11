import type { CanonicalType, InstructionalPageRole, SurgeonAnnotation } from "@/lib/insights/pageAnnotationPlan";

export interface AnnotationCoverageAssessment {
  complete: boolean;
  missing: string[];
  duplicateCount: number;
}

const REQUIRED_TYPES: Partial<Record<InstructionalPageRole, CanonicalType[]>> = {
  "definition-heavy": ["definition"],
  "mechanism-causal": ["mechanism"],
  "procedure-sequence": ["procedure"],
  comparison: ["comparison"],
  "worked-example": ["supportingEvidence"],
  "equation-calculation": ["procedure"],
  "clinical-diagnostic": ["decision"],
  "argument-evidence": ["supportingEvidence"],
};

function normalizedQuote(annotation: SurgeonAnnotation): string {
  return annotation.exactQuote.toLowerCase().replace(/\s+/g, " ").trim();
}

export function assessAnnotationCoverage(
  annotations: SurgeonAnnotation[],
  roles: InstructionalPageRole[],
): AnnotationCoverageAssessment {
  const types = new Set(annotations.map(annotation => annotation.canonicalType));
  const quotes = annotations.map(normalizedQuote);
  const duplicateCount = quotes.length - new Set(quotes).size;
  const missing = new Set<string>();
  if (!annotations.some(annotation => annotation.importance === "critical" || annotation.annotationType === "core-concept")) {
    missing.add("central-concept");
  }
  for (const role of roles) {
    for (const type of REQUIRED_TYPES[role] ?? []) {
      if (!types.has(type)) missing.add(`${role}:${type}`);
    }
  }
  if (types.has("procedure")) {
    const procedure = annotations.filter(annotation => annotation.canonicalType === "procedure");
    const sequenced = procedure.filter(annotation => annotation.sequenceIndex != null);
    if (procedure.length > 1 && sequenced.length !== procedure.length) missing.add("procedure-sequence-indexes");
  }
  return { complete: missing.size === 0 && duplicateCount === 0, missing: Array.from(missing), duplicateCount };
}
