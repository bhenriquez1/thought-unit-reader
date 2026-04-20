// lib/insights/detectPageDomain.ts
// Lightweight rule-based domain classifier.
// Runs once per page on the full raw text before any scoring.

export type PageDomain = "clinical" | "science" | "math" | "general" | "fiction";

export function detectPageDomain(text: string): PageDomain {
  const t = text.toLowerCase();
  // Clinical — check first (high-specificity medical vocabulary)
  if (/\b(patient|diagnosis|treatment|symptom|clinical|endodontic|dental|medical|prognosis|therapeutic|pathology|pulp|caries|periodontal)\b/.test(t)) return "clinical";
  // Math — symbols take priority over keyword text
  if (/[∫∑∂∇]|\b(derivative|theorem|integral|polynomial|calculus|algebra|trigonometry|equation|formula|matrix|eigenvalue)\b/.test(t)) return "math";
  // Science — biology, chemistry, physics, genetics
  if (/\b(cell|atom|protein|reaction|organism|biology|chemistry|physics|genetics|molecule|nucleus|element|compound|evolution|isotope|enzyme|mitosis)\b/.test(t)) return "science";
  // Fiction / literary analysis
  if (/\b(character|dialogue|plot|narrative|protagonist|antagonist|metaphor|theme|novel|poem|stanza|literary|foreshadow)\b/.test(t)) return "fiction";
  return "general";
}
