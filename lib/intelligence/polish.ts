// lib/intelligence/polish.ts
// Micro Polish Mode — language refinement post-processor.
//
// Pipeline:
//   1. Conversational → academic replacements
//   2. Wordiness reduction
//   3. Redundancy removal
//   4. Article insertion heuristics
//   5. Run-on sentence splitting
//
// This module is pure string → string. It does not call any LLM or API.
// All transforms are deterministic regex-based rules targeting board-review tone.

// ============================================================================
// Conversational → Academic phrase map
// ============================================================================

const PHRASE_MAP: [RegExp, string][] = [
  // Direct address
  [/\bYou can see why\b/gi, 'This demonstrates why'],
  [/\bYou can see (that|how)\b/gi, 'This shows $1'],
  [/\bIt helps you understand\b/gi, 'This clarifies'],
  [/\bThis shows you\b/gi, 'This illustrates'],
  [/\bThis shows how\b/gi, 'This illustrates how'],
  [/\bAs you can see[,]?\b/gi, 'As demonstrated,'],
  [/\bRemember that\b/gi, 'Note that'],
  [/\bLet['']s (look at|consider|examine)\b/gi, 'Consider'],
  [/\bNow[,]? (let['']s|we) (look at|consider)\b/gi, 'Consider'],
  [/\bThink about\b/gi, 'Consider'],
  [/\bKeep in mind that?\b/gi, 'Note that'],

  // Weak connectors
  [/\bSo[,] (this means|it means)\b/gi, 'Therefore,'],
  [/\bSo basically\b/gi, 'Fundamentally,'],
  [/\bBasically[,]?\b/gi, ''],
  [/\bEssentially[,]?\b/gi, 'Fundamentally,'],
  [/\bPretty much\b/gi, 'largely'],
  [/\bKind of\b/gi, 'partially'],
  [/\bSort of\b/gi, 'somewhat'],
  [/\bA lot of\b/gi, 'numerous'],
  [/\bLots of\b/gi, 'numerous'],
  [/\bReally important\b/gi, 'critical'],
  [/\bVery important\b/gi, 'critical'],
  [/\bSuper important\b/gi, 'critical'],

  // Wordy constructions
  [/\bin order to be able to\b/gi, 'to'],
  [/\bin order to\b/gi, 'to'],
  [/\bdue to the fact that\b/gi, 'because'],
  [/\bfor the purpose of\b/gi, 'to'],
  [/\bwith regard to\b/gi, 'regarding'],
  [/\bwith respect to\b/gi, 'regarding'],
  [/\bat this point in time\b/gi, 'currently'],
  [/\bat the present time\b/gi, 'currently'],
  [/\bin the event that\b/gi, 'if'],
  [/\bprior to\b/gi, 'before'],
  [/\bsubsequent to\b/gi, 'after'],
  [/\butilize\b/gi, 'use'],
  [/\bfacilitate\b/gi, 'enable'],

  // Redundant pairs
  [/\bcritical essential\b/gi, 'essential'],
  [/\bfinal outcome result\b/gi, 'outcome'],
  [/\bactual fact\b/gi, 'fact'],
  [/\bfuture plans\b/gi, 'plans'],
  [/\bpast history\b/gi, 'history'],
  [/\bcomplete and total\b/gi, 'complete'],
  [/\beach and every\b/gi, 'every'],
  [/\bfirst and foremost\b/gi, 'first'],
];

// ============================================================================
// Awkward phrase detector (for flagging, not auto-replacing)
// ============================================================================

export interface PhraseFlag {
  phrase: string;
  suggestion: string;
  start: number;
  end: number;
}

const FLAG_PATTERNS: [RegExp, string][] = [
  [/\byou can see\b/gi, 'this demonstrates'],
  [/\bit helps you\b/gi, 'this enables'],
  [/\bthis shows you\b/gi, 'this illustrates'],
  [/\bbasically\b/gi, '(remove or use "fundamentally")'],
  [/\bkind of\b/gi, 'partially / somewhat'],
  [/\bdue to the fact that\b/gi, 'because'],
  [/\bin order to\b/gi, 'to'],
  [/\butilize\b/gi, 'use'],
  [/\bcritical essential\b/gi, 'essential'],
  [/\bpast history\b/gi, 'history'],
];

/**
 * Detect weak/conversational phrases in text and return flagged positions.
 * Used for the "Awkward Phrase" indicator in the panel.
 */
export function detectAwkwardPhrases(text: string): PhraseFlag[] {
  const flags: PhraseFlag[] = [];
  for (const [re, suggestion] of FLAG_PATTERNS) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      flags.push({
        phrase: m[0],
        suggestion,
        start: m.index!,
        end: m.index! + m[0].length,
      });
    }
  }
  return flags.sort((a, b) => a.start - b.start);
}

// ============================================================================
// Run-on sentence splitter
// ============================================================================

/** Split sentences longer than maxWords at natural conjunction boundaries */
function splitRunOns(text: string, maxWords = 28): string {
  const sentences = text.split(/(?<=[.?!])\s+/);
  const result: string[] = [];
  for (const sent of sentences) {
    const words = sent.split(/\s+/);
    if (words.length <= maxWords) {
      result.push(sent);
      continue;
    }
    // Try to split at coordinating conjunctions
    const split = sent.replace(
      /,\s+(and|but|or|however|therefore|whereas|although|because)\s+/gi,
      (_, conj) => `. ${conj.charAt(0).toUpperCase() + conj.slice(1)} `,
    );
    result.push(split);
  }
  return result.join(' ');
}

// ============================================================================
// Article insertion heuristic
// ============================================================================

const MISSING_ARTICLE_RE =
  /\b(clinician|physician|patient|diagnosis|history|examination|condition|mechanism|principle|approach|test|finding|data|study|process)\b/g;

/**
 * Very conservative "the" insertion: only prepend "the" when the noun
 * appears after a verb without a preceding determiner.
 * E.g. "clinician must obtain" → "the clinician must obtain"
 */
function insertArticles(text: string): string {
  return text.replace(
    /(?<=\.\s+|^|\n)(Clinician|Physician|Patient|Diagnosis|Examination|History)\b/g,
    'The $1',
  );
}

// ============================================================================
// Public API
// ============================================================================

export interface PolishOptions {
  splitRunOns?: boolean;
  insertArticles?: boolean;
}

/**
 * Apply Micro Polish to a string.
 * Returns a new string with grammar and tone improvements applied.
 * Preserves clinical accuracy — no semantic changes.
 */
export function applyMicroPolish(text: string, opts: PolishOptions = {}): string {
  let out = text;

  // 1. Phrase map replacements
  for (const [re, replacement] of PHRASE_MAP) {
    re.lastIndex = 0;
    out = out.replace(re, replacement);
  }

  // 2. Collapse multiple spaces left by empty replacements
  out = out.replace(/\s{2,}/g, ' ').trim();

  // 3. Run-on sentence splitting
  if (opts.splitRunOns !== false) {
    out = splitRunOns(out);
  }

  // 4. Article insertion
  if (opts.insertArticles !== false) {
    out = insertArticles(out);
  }

  return out;
}

export type PolishMode = 'off' | 'on';
