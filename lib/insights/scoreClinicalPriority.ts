// lib/insights/scoreClinicalPriority.ts
// Scores valid-paragraph candidates by clinical/scientific importance.
// Used after isValidCoreParagraph filtering to rank what matters first,
// not just what is most similar.

export type ClinicalPriorityRole =
  | "chief_signal"
  | "interpretation"
  | "diagnostic_rule"
  | "treatment_implication"
  | "next_step"
  | "trap"
  | "support";

export interface ClinicalPriorityCandidate {
  id: string;
  text: string;
  paragraphIndex?: number;
  sentenceIndex?: number;
  semanticScore?: number;
  explanatoryScore?: number;
}

export interface ClinicalPriorityScore {
  id: string;
  text: string;
  role: ClinicalPriorityRole;
  score: number;
  reasons: string[];
}

export function scoreClinicalPriority(
  candidates: ClinicalPriorityCandidate[]
): ClinicalPriorityScore[] {
  return candidates
    .map((candidate) => scoreOneCandidate(candidate))
    .sort((a, b) => b.score - a.score);
}

function scoreOneCandidate(
  candidate: ClinicalPriorityCandidate
): ClinicalPriorityScore {
  const text = candidate.text ?? "";
  const lower = text.toLowerCase();
  let score = 0.2;
  const reasons: string[] = [];
  let role: ClinicalPriorityRole = "support";

  if (matchesChiefSignal(lower)) {
    score += 0.32;
    role = "chief_signal";
    reasons.push("chief signal");
  }
  if (matchesInterpretation(lower)) {
    score += 0.24;
    if (role === "support") role = "interpretation";
    reasons.push("interpretation cue");
  }
  if (matchesDiagnosticRule(lower)) {
    score += 0.28;
    if (role === "support" || role === "interpretation") role = "diagnostic_rule";
    reasons.push("diagnostic rule");
  }
  if (matchesTreatmentImplication(lower)) {
    score += 0.18;
    if (role === "support") role = "treatment_implication";
    reasons.push("treatment implication");
  }
  if (matchesNextStep(lower)) {
    score += 0.14;
    if (role === "support") role = "next_step";
    reasons.push("next-step action");
  }
  if (matchesTrap(lower)) {
    score += 0.22;
    role = "trap";
    reasons.push("trap / caution");
  }
  if (candidate.semanticScore != null) {
    score += candidate.semanticScore * 0.18;
    reasons.push("semantic support");
  }
  if (candidate.explanatoryScore != null) {
    score += candidate.explanatoryScore * 0.14;
    reasons.push("explanatory support");
  }
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words >= 10 && words <= 28) {
    score += 0.08;
    reasons.push("good explanatory length");
  }
  if (words < 7) {
    score -= 0.18;
    reasons.push("too short");
  }

  return {
    id: candidate.id,
    text,
    role,
    score: Math.max(0, Math.min(score, 1)),
    reasons,
  };
}

function matchesChiefSignal(text: string): boolean {
  return /\bchief complaint\b|\bpatient reports\b|\bpain\b|\bsymptom\b|\bfinding\b|\bdiagnosis\b|\bcore concept\b|\bdefined as\b|\bis characterized by\b/.test(text);
}

function matchesInterpretation(text: string): boolean {
  return /\bindicates?\b|\bsuggests?\b|\bimplies?\b|\breflects?\b|\bmeans?\b|\bconsistent with\b|\bresults? in\b|\bleads? to\b|\bcauses?\b/.test(text);
}

function matchesDiagnosticRule(text: string): boolean {
  return /\bmust\b|\bshould\b|\brequires?\b|\bdifferentiate\b|\bdetermine\b|\bestablish\b|\bdo not\b|\bdo not confuse\b/.test(text);
}

function matchesTreatmentImplication(text: string): boolean {
  return /\btreatment\b|\bmanage\b|\bmanagement\b|\bintervention\b|\bnecessary\b|\bdecision\b/.test(text);
}

function matchesNextStep(text: string): boolean {
  return /\bnext\b|\bask\b|\bevaluate\b|\bconfirm\b|\btest\b|\bassess\b|\bobtain\b/.test(text);
}

function matchesTrap(text: string): boolean {
  return /\brather than\b|\bmay not\b|\bconfuse\b|\bmistake\b|\bmisdiagnosis\b|\bunlike\b|\bin contrast\b|\bnot the same\b/.test(text);
}
