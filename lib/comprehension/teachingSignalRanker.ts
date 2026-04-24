import type { DisciplineType } from '@/types/comprehension';

export type EvidenceScore = {
  teachingSignal: number;
  boilerplatePenalty: number;
  headingBoost: number;
  definitionBoost: number;
  mechanismBoost: number;
  comparisonBoost: number;
  formulaBoost: number;
  exampleBoost: number;
  decisionPointBoost: number;
  repeatedConceptBoost: number;
  finalScore: number;
};

export type TeachingBlock = {
  paragraphId: string;
  pageNumber: number;
  text: string;
  score: EvidenceScore;
  anchorIds: string[];
};

const NOISE_PATTERNS: RegExp[] = [
  /\belectronic rights\b/i,
  /\ball rights reserved\b/i,
  /\bcopyright\b/i,
  /\bjournal\b/i,
  /\beditorial\b/i,
  /\baffiliation\b/i,
  /\bdoi:\b/i,
  /^\s*\d+\s*$/,
];

function countMatches(text: string, patterns: RegExp[]): number {
  return patterns.reduce((count, pattern) => (pattern.test(text) ? count + 1 : count), 0);
}

function isLikelyCitationCluster(text: string): boolean {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (!compact) return false;
  if (/^(?:\(?\d{1,3}\)?[,\s;]*){3,}$/.test(compact)) return true;
  return (compact.match(/\(\d{4}\)/g)?.length ?? 0) >= 2;
}

const DEFINITION_PATTERNS = [/\bis defined as\b/i, /\brefers to\b/i, /\bmeans\b/i, /\bcalled\b/i];
const MECHANISM_PATTERNS = [/\bleads to\b/i, /\bcauses\b/i, /\bresults in\b/i, /\btherefore\b/i, /\bbecause\b/i];
const COMPARISON_PATTERNS = [/\bwhereas\b/i, /\bhowever\b/i, /\bin contrast\b/i, /\bversus\b/i, /\bunlike\b/i];
const EXAMPLE_PATTERNS = [/\bfor example\b/i, /\be\.g\.\b/i, /\bsuch as\b/i];
const DECISION_PATTERNS = [/\bif\b.+\bthen\b/i, /\bmust\b/i, /\bshould\b/i, /\bindicated\b/i, /\bcontraindicated\b/i];
const FORMULA_PATTERNS = [/[=+\-*/^π∑∫]/, /\bf\([a-z]\)\b/i, /\b[A-Za-z]\s*=\s*[\dA-Za-z]/];

function getDisciplineBoost(text: string, discipline?: DisciplineType): number {
  if (!discipline) return 0;
  const lower = text.toLowerCase();
  switch (discipline) {
    case 'mathematics':
      return /\b(function|variable|equation|derivative|integral|limit)\b/.test(lower) ? 6 : 0;
    case 'law':
      return /\b(issue|rule|test|holding|exception|application)\b/.test(lower) ? 6 : 0;
    case 'history':
      return /\b(cause|consequence|turning point|timeline|period|revolution)\b/.test(lower) ? 6 : 0;
    case 'medical_clinical':
    case 'dental_clinical':
      return /\b(finding|diagnosis|mechanism|indication|contraindication|decision)\b/.test(lower) ? 6 : 0;
    default:
      return 0;
  }
}

export function isGarbageTeachingText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length < 30 || trimmed.split(/\s+/).length < 5) return true;
  if (NOISE_PATTERNS.some((pattern) => pattern.test(trimmed))) return true;
  return isLikelyCitationCluster(trimmed);
}

export function scoreTeachingBlock(args: {
  text: string;
  headingTerms?: Set<string>;
  repeatedConceptTerms?: Set<string>;
  discipline?: DisciplineType;
}): EvidenceScore {
  const text = args.text;
  const lower = text.toLowerCase();
  const headingBoost = Array.from(args.headingTerms ?? []).filter((term) => lower.includes(term)).length * 3;
  const repeatedConceptBoost = Array.from(args.repeatedConceptTerms ?? []).filter((term) => lower.includes(term)).length * 2;

  const definitionBoost = countMatches(text, DEFINITION_PATTERNS) * 8;
  const mechanismBoost = countMatches(text, MECHANISM_PATTERNS) * 7;
  const comparisonBoost = countMatches(text, COMPARISON_PATTERNS) * 6;
  const formulaBoost = countMatches(text, FORMULA_PATTERNS) * 8;
  const exampleBoost = countMatches(text, EXAMPLE_PATTERNS) * 4;
  const decisionPointBoost = countMatches(text, DECISION_PATTERNS) * 5;
  const disciplineBoost = getDisciplineBoost(text, args.discipline);
  const teachingSignal =
    definitionBoost + mechanismBoost + comparisonBoost + formulaBoost + exampleBoost + decisionPointBoost + repeatedConceptBoost + disciplineBoost;

  const boilerplatePenalty =
    countMatches(text, NOISE_PATTERNS) * 25 +
    (isLikelyCitationCluster(text) ? 20 : 0) +
    (/^\s*(figure|table|copyright|page)\b/i.test(text) ? 12 : 0);

  const finalScore = Math.max(0, teachingSignal + headingBoost - boilerplatePenalty);

  return {
    teachingSignal,
    boilerplatePenalty,
    headingBoost,
    definitionBoost,
    mechanismBoost,
    comparisonBoost,
    formulaBoost,
    exampleBoost,
    decisionPointBoost,
    repeatedConceptBoost,
    finalScore,
  };
}

export function rankTeachingBlocks(args: {
  pageNumber: number;
  paragraphs: Array<{ id: string; text: string }>;
  headings?: string[];
  discipline?: DisciplineType;
  maxBlocks?: number;
}): TeachingBlock[] {
  const headingTerms = new Set((args.headings ?? []).join(' ').toLowerCase().match(/[a-z]{4,}/g) ?? []);
  const allTokens = (args.paragraphs ?? []).flatMap((p) => p.text.toLowerCase().match(/[a-z]{5,}/g) ?? []);
  const tokenFreq = new Map<string, number>();
  allTokens.forEach((token) => tokenFreq.set(token, (tokenFreq.get(token) ?? 0) + 1));
  const repeatedConceptTerms = new Set(Array.from(tokenFreq.entries()).filter(([, count]) => count >= 2).slice(0, 18).map(([token]) => token));

  const ranked = args.paragraphs
    .filter((p) => !isGarbageTeachingText(p.text))
    .map((p) => {
      const score = scoreTeachingBlock({
        text: p.text,
        headingTerms,
        repeatedConceptTerms,
        discipline: args.discipline,
      });
      return {
        paragraphId: p.id,
        pageNumber: args.pageNumber,
        text: p.text,
        score,
        anchorIds: [`p${args.pageNumber}:${p.id}`],
      };
    })
    .filter((block) => block.score.finalScore > 0)
    .sort((a, b) => b.score.finalScore - a.score.finalScore);

  return ranked.slice(0, args.maxBlocks ?? 8);
}
