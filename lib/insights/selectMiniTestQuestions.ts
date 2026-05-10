// lib/insights/selectMiniTestQuestions.ts
//
// Dedicated Mini Test selection helper.
// Purpose:
// - keep question selection logic out of UI code
// - make Mini Test role-balanced
// - preserve page-step order
// - keep questions current-page only
// - avoid duplicates / near-duplicates
// - make output feel page-native, not template-like

export type MiniTestRole =
  | "coreMeaning"
  | "mechanism"
  | "distinction"
  | "application"
  | "skimTrap"
  | "whatHappensIf"
  | "nextStep"
  | "compareContrast";

export interface MiniTestQuestionCandidate {
  id: string;
  stepId: string;
  stepOrder: number;
  role: MiniTestRole;
  text: string;
  score?: number;
}

export interface SelectMiniTestQuestionsInput {
  candidates: MiniTestQuestionCandidate[];
  maxQuestions?: number;
}

export interface SelectedMiniTestQuestion {
  id: string;
  stepId: string;
  stepOrder: number;
  role: MiniTestRole;
  text: string;
  score: number;
}

export interface SelectMiniTestQuestionsResult {
  questions: SelectedMiniTestQuestion[];
  rejected: MiniTestQuestionCandidate[];
}

/**
 * Main selector:
 * 1. normalize / filter weak candidates
 * 2. group by role
 * 3. choose one strongest candidate per role
 * 4. preserve step order as the final output sequence
 * 5. backfill with distinct remaining candidates if under target count
 */
export function selectMiniTestQuestions(
  input: SelectMiniTestQuestionsInput
): SelectMiniTestQuestionsResult {
  const maxQuestions = Math.max(3, input.maxQuestions ?? 5);
  const normalized = normalizeCandidates(input.candidates);
  const selected: SelectedMiniTestQuestion[] = [];
  const rejected: MiniTestQuestionCandidate[] = [];

  const rolePriority: MiniTestRole[] = [
    "coreMeaning",
    "mechanism",
    "distinction",
    "application",
    "skimTrap",
    "whatHappensIf",
    "nextStep",
    "compareContrast",
  ];

  // Pass 1: one question per role, preferring page-step order when scores are close.
  for (const role of rolePriority) {
    const roleCandidates = normalized
      .filter((c) => c.role === role)
      .sort(compareCandidates);
    const picked = roleCandidates.find((candidate) =>
      isDistinctQuestion(candidate.text, selected.map((s) => s.text))
    );
    if (picked) {
      selected.push(picked);
    } else {
      rejected.push(...roleCandidates);
    }
  }

  // Pass 2: backfill with the best remaining distinct questions.
  const remaining = normalized
    .filter((candidate) => !selected.some((s) => s.id === candidate.id))
    .sort(compareCandidates);
  for (const candidate of remaining) {
    if (selected.length >= maxQuestions) break;
    if (isDistinctQuestion(candidate.text, selected.map((s) => s.text))) {
      selected.push(candidate);
    } else {
      rejected.push(candidate);
    }
  }

  // Final ordering: step order first, then role priority.
  const ordered = selected.sort((a, b) => {
    if (a.stepOrder !== b.stepOrder) return a.stepOrder - b.stepOrder;
    return roleRank(a.role) - roleRank(b.role);
  });

  return {
    questions: ordered.slice(0, maxQuestions),
    rejected,
  };
}

/* -------------------------------------------------------------------------- */
/*                                NORMALIZATION                               */
/* -------------------------------------------------------------------------- */

function normalizeCandidates(
  candidates: MiniTestQuestionCandidate[]
): SelectedMiniTestQuestion[] {
  const out: SelectedMiniTestQuestion[] = [];
  for (const candidate of candidates) {
    const text = sanitizeQuestion(candidate.text);
    if (!isRenderableQuestion(text)) continue;
    out.push({
      id: candidate.id,
      stepId: candidate.stepId,
      stepOrder: candidate.stepOrder,
      role: candidate.role,
      text,
      score: scoreQuestionCandidate(candidate, text),
    });
  }
  return dedupeCandidates(out);
}

function sanitizeQuestion(text: string): string {
  const cleaned = (text ?? "")
    .replace(/\s+/g, " ")
    .replace(/[.…]{2,}/g, ".")
    .trim();
  if (!cleaned) return "";
  if (/[?]$/.test(cleaned)) return cleaned;
  return `${cleaned.replace(/[.!]+$/, "")}?`;
}

function isRenderableQuestion(text: string): boolean {
  if (!text) return false;
  if (text.length < 20) return false;
  const words = text.split(/\s+/);
  if (words.length < 5) return false;
  if (/^[\d\s.,\-:;()?!]+$/.test(text)) return false;
  // Reject questions containing a run of 3+ uppercase words — book title leaked in
  if ((text.match(/\b[A-Z]{2,}\b/g) ?? []).length >= 3) return false;
  // Reject questions too long to be useful (>35 words = verbatim textbook sentence)
  if (words.length > 35) return false;
  // Reject questions that start with a subordinate clause fragment (no question verb)
  if (/^(Certain|Some|Most|Many|All|Several|Although|While|Even|Whether)\s+\w+\s+(may|can|could|might|would|will|should)\s+/i.test(text)) return false;
  return true;
}

function scoreQuestionCandidate(
  candidate: MiniTestQuestionCandidate,
  text: string
): number {
  let score = candidate.score ?? 0.6;
  const words = text.split(/\s+/).length;
  if (words <= 9)       score += 0.14;
  else if (words <= 14) score += 0.09;
  else if (words <= 20) score += 0.04;
  else                  score -= 0.05;

  if (candidate.role === "mechanism"   && /\bhow|why|mechanism\b/i.test(text))           score += 0.08;
  if (candidate.role === "distinction" && /\bcontrast|distinction|confuse|difference\b/i.test(text)) score += 0.08;
  if (candidate.role === "application" && /\bapply|recognize|use|infer\b/i.test(text))   score += 0.08;
  if (candidate.role === "coreMeaning" && /\bmain|core|central|key\b/i.test(text))       score += 0.06;
  if (candidate.role === "skimTrap"      && /\bmiss|skim|overlook|misunderstand\b/i.test(text)) score += 0.08;
  if (candidate.role === "whatHappensIf" && /\bhappens?|occurs?|fails?|absent|missing\b/i.test(text)) score += 0.08;
  if (candidate.role === "nextStep"      && /\bnext|after|step|following|subsequent\b/i.test(text)) score += 0.08;
  if (candidate.role === "compareContrast" && /\bdiffer|compare|contrast|versus|vs\b/i.test(text)) score += 0.08;

  return score;
}

function dedupeCandidates(
  candidates: SelectedMiniTestQuestion[]
): SelectedMiniTestQuestion[] {
  const kept: SelectedMiniTestQuestion[] = [];
  for (const candidate of candidates.sort(compareCandidates)) {
    if (isDistinctQuestion(candidate.text, kept.map((k) => k.text), 0.72)) {
      kept.push(candidate);
    }
  }
  return kept;
}

/* -------------------------------------------------------------------------- */
/*                            QUESTION DISTINCTNESS                           */
/* -------------------------------------------------------------------------- */

function isDistinctQuestion(
  text: string,
  existing: string[],
  threshold = 0.66
): boolean {
  const norm = normalizeText(text);
  if (!norm) return false;
  for (const existingText of existing) {
    const existingNorm = normalizeText(existingText);
    if (!existingNorm) continue;
    if (norm === existingNorm) return false;
    if (tokenSimilarity(norm, existingNorm) >= threshold) return false;
    if (leadSimilarity(norm, existingNorm) >= 0.8) return false;
  }
  return true;
}

function normalizeText(text: string): string {
  return (text ?? "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSimilarity(a: string, b: string): number {
  const aTokens = new Set(a.split(" ").filter(Boolean));
  const bTokens = new Set(b.split(" ").filter(Boolean));
  if (!aTokens.size || !bTokens.size) return 0;
  let overlap = 0;
  for (const token of aTokens) { if (bTokens.has(token)) overlap += 1; }
  const union = new Set([...aTokens, ...bTokens]).size;
  return union ? overlap / union : 0;
}

function leadSimilarity(a: string, b: string): number {
  const aLead = a.split(" ").slice(0, 5).join(" ");
  const bLead = b.split(" ").slice(0, 5).join(" ");
  return aLead && bLead && aLead === bLead ? 1 : 0;
}

/* -------------------------------------------------------------------------- */
/*                                  ORDERING                                  */
/* -------------------------------------------------------------------------- */

function compareCandidates(
  a: Pick<SelectedMiniTestQuestion, "score" | "stepOrder" | "role" | "text">,
  b: Pick<SelectedMiniTestQuestion, "score" | "stepOrder" | "role" | "text">
): number {
  const scoreDiff = (b.score ?? 0) - (a.score ?? 0);
  if (Math.abs(scoreDiff) > 0.06) return scoreDiff;
  if (a.stepOrder !== b.stepOrder) return a.stepOrder - b.stepOrder;
  const roleDiff = roleRank(a.role) - roleRank(b.role);
  if (roleDiff !== 0) return roleDiff;
  const aWords = a.text.split(/\s+/).length;
  const bWords = b.text.split(/\s+/).length;
  if (aWords !== bWords) return aWords - bWords;
  return a.text.localeCompare(b.text);
}

function roleRank(role: MiniTestRole): number {
  switch (role) {
    case "coreMeaning":    return 1;
    case "mechanism":      return 2;
    case "distinction":    return 3;
    case "application":    return 4;
    case "skimTrap":       return 5;
    case "whatHappensIf":  return 6;
    case "nextStep":       return 7;
    case "compareContrast": return 8;
    default:               return 99;
  }
}
