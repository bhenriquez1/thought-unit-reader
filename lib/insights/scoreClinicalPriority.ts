// lib/insights/scoreClinicalPriority.ts
// Scores valid-paragraph candidates by clinical/scientific importance.
// Multi-dimensional scoring separates centrality, reasoning, actionability,
// trap risk, and exam relevance — drives role classification for all domains.

export type ClinicalPriorityRole =
  | "main_signal"
  | "mechanism"
  | "decision_rule"
  | "application"
  | "trap"
  | "support";

export interface ClinicalPriorityCandidate {
  id: string;
  text: string;
  paragraphIndex?: number;
  sentenceIndex?: number;
  semanticScore?: number;
  explanatoryScore?: number;
  centralityScore?: number;
  reasoningScore?: number;
  examSignalScore?: number;
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
  const words = text.split(/\s+/).filter(Boolean).length;
  const reasons: string[] = [];

  // Dimension 1: centrality — is this the key definition/main signal?
  let centralityScore = candidate.centralityScore ?? 0;
  if (matchesMainSignal(lower)) {
    centralityScore += 0.7;
    reasons.push("main signal");
  }
  if (matchesDefinition(lower)) {
    centralityScore += 0.6;
    reasons.push("definition");
  }

  // Dimension 2: reasoning — does this explain a mechanism or causal chain?
  let reasoningScore = candidate.reasoningScore ?? 0;
  if (matchesMechanism(lower)) {
    reasoningScore += 0.7;
    reasons.push("mechanism");
  }
  if (matchesInterpretation(lower)) {
    reasoningScore += 0.4;
    reasons.push("interpretation");
  }

  // Dimension 3: actionability — decision rules, clinical rules, application
  let actionabilityScore = 0;
  if (matchesDecisionRule(lower)) {
    actionabilityScore += 0.7;
    reasons.push("decision rule");
  }
  if (matchesApplication(lower)) {
    actionabilityScore += 0.5;
    reasons.push("application");
  }

  // Dimension 4: trap risk — contrast, exception, common mistake
  let trapRiskScore = 0;
  if (matchesTrap(lower)) {
    trapRiskScore += 0.8;
    reasons.push("trap/caution");
  }

  // Dimension 5: exam signal — high-yield exam-relevant patterns
  let examSignalScore = candidate.examSignalScore ?? 0;
  if (matchesExamSignal(lower)) {
    examSignalScore += 0.6;
    reasons.push("exam signal");
  }

  // Length: 10–35 words is the sweet spot for instructional sentences
  const lengthFactor = words >= 10 && words <= 35 ? 0.1 : words < 7 ? -0.15 : 0;

  // Caller-provided boosts (semantic similarity, explanatory tag from type model)
  const callerBoost =
    (candidate.semanticScore ?? 0) * 0.08 +
    (candidate.explanatoryScore ?? 0) * 0.06;

  const score =
    centralityScore    * 0.30 +
    reasoningScore     * 0.20 +
    actionabilityScore * 0.20 +
    trapRiskScore      * 0.15 +
    examSignalScore    * 0.15 +
    lengthFactor +
    callerBoost;

  const role = inferRole(centralityScore, reasoningScore, actionabilityScore, trapRiskScore, lower);

  return {
    id: candidate.id,
    text,
    role,
    score: Math.max(0, Math.min(score, 1)),
    reasons,
  };
}

function inferRole(
  centrality: number,
  reasoning: number,
  actionability: number,
  trapRisk: number,
  lower: string
): ClinicalPriorityRole {
  if (trapRisk >= 0.8) return "trap";
  if (centrality >= 0.5 && centrality >= reasoning && centrality >= actionability) return "main_signal";
  if (reasoning >= 0.5 && reasoning >= actionability) return "mechanism";
  if (actionability >= 0.5 && matchesDecisionRule(lower)) return "decision_rule";
  if (actionability >= 0.5) return "application";
  return "support";
}

function matchesMainSignal(text: string): boolean {
  return /\b(core concept|chief complaint|main finding|central idea|key principle|primary cause|defining feature|hallmark|pathognomonic)\b/.test(text);
}

function matchesDefinition(text: string): boolean {
  return /\b(is defined as|is characterized by|refers to|is called|is known as|is a type of|consists of|means that|is described as|is the process of|is the ability)\b/.test(text);
}

function matchesMechanism(text: string): boolean {
  return /\b(causes?|leads? to|results? in|because|therefore|thus|hence|consequently|produces?|generates?|triggers?|stimulates?|inhibits?|activates?|promotes?|depends on|mediated by|regulated by)\b/.test(text);
}

function matchesInterpretation(text: string): boolean {
  return /\bindicates?\b|\bsuggests?\b|\bimplies?\b|\breflects?\b|\bconsistent with\b/.test(text);
}

function matchesDecisionRule(text: string): boolean {
  return /\b(must|should|requires?\b|do not|never|always|differentiate|determine|establish)\b/.test(text);
}

function matchesApplication(text: string): boolean {
  return /\b(treatment|manage|management|intervention|used (for|in|to)|applied to|in practice|clinically|in patients?)\b/.test(text);
}

function matchesTrap(text: string): boolean {
  return /\b(rather than|may not|do not confuse|should not be confused|unlike|in contrast|not the same|different from|commonly mistaken|however|exception|not to be confused|misdiagnosis|mistake|pitfall)\b/.test(text);
}

function matchesExamSignal(text: string): boolean {
  return /\b(key (point|concept|fact)|high.yield|remember|recall|note that|importantly|classic(ally)?|commonly tested|board exam|usmle|mcat|nclex)\b/.test(text);
}
