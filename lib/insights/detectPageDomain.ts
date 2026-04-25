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
  // Math — only unambiguous calculus/algebra symbols and terms. "formula", "equation", "algebra",
  // and "matrix" are excluded because they appear routinely in science and clinical text.
  if (/[∫∑∂∇]|dy\/dx|d[xyz]\/d[xyz]|\b(derivative|theorem|integral|polynomial|calculus|trigonometry|eigenvalue|antiderivative)\b/.test(t)) return "math";
  // Fiction / literary analysis
  if (/\b(character|dialogue|plot|narrative|protagonist|antagonist|metaphor|theme|novel|poem|stanza|literary|foreshadow)\b/.test(t)) return "fiction";
  return "general";
}
