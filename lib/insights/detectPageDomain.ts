// lib/insights/detectPageDomain.ts
// Lightweight rule-based domain classifier.
// Runs once per page on the full raw text before any scoring.

export type PageDomain = "clinical" | "science" | "math" | "general" | "fiction";

export function detectPageDomain(text: string): PageDomain {
  const t = text.toLowerCase();
  // Clinical — check first (high-specificity medical vocabulary)
  if (/\b(patient|diagnosis|treatment|symptom|clinical|endodontic|dental|medical|prognosis|therapeutic|pathology|pulp|caries|periodontal)\b/.test(t)) return "clinical";
  // Science — checked before math so "formula for photosynthesis" or "equation for respiration"
  // stays classified as science rather than being claimed by the math branch.
  if (/\b(cell|atom|protein|reaction|organism|biology|chemistry|physics|genetics|molecule|nucleus|element|compound|evolution|isotope|enzyme|mitosis)\b/.test(t)) return "science";
  // Math — unambiguous calculus/algebra symbols and terms, plus limit/sequence/convergence
  // vocabulary which appears in calc textbooks but rarely in science or clinical text.
  if (/[∫∑∂∇]|dy\/dx|d[xyz]\/d[xyz]|\b(derivative|theorem|integral|polynomial|calculus|trigonometry|eigenvalue|antiderivative|convergence?|diverges?|sequence converge|limit of a sequence|lim\s*_|n\s*→\s*∞)\b/.test(t)) return "math";
  // Secondary math signal: "limit" + "sequence/terms/approaches" together (catches limits chapters)
  if (/\b(limit|sequence|series)\b/.test(t) && /\b(approaches?|converges?|diverges?|terms?|n\s*→|tends? to|fixed value)\b/.test(t)) return "math";
  // Fiction / literary analysis
  if (/\b(character|dialogue|plot|narrative|protagonist|antagonist|metaphor|theme|novel|poem|stanza|literary|foreshadow)\b/.test(t)) return "fiction";
  return "general";
}
