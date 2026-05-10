// lib/insights/signalClassifier.ts
//
// Operator signal hierarchy — classifies any sentence into a signal type and
// scores it for operational value. Clinical pages work because their writing
// naturally concentrates DECISION_RULE and FAILURE_MODE signals. This module
// makes the same hierarchy available for math/science/any domain.
//
// Signal types ordered by operational priority:
//   DECISION_RULE  > FAILURE_MODE  > THRESHOLD  > MECHANISM     > CAUSAL_CHAIN
//   > SYMBOLIC_LOGIC > DEFINITION  > COMPARISON  > EXCEPTION    > WORKFLOW
//   > HIGH_YIELD_FACT > TRAP       > EVIDENCE    > DEFINITION   > FILLER

export type SignalType =
  | "DECISION_RULE"    // if X → do Y; should/must clauses
  | "FAILURE_MODE"     // what goes wrong; consequences
  | "THRESHOLD"        // critical number/value/limit
  | "MECHANISM"        // how/why it works; causal sentence
  | "CAUSAL_CHAIN"     // A → B → C explicit chain
  | "SYMBOLIC_LOGIC"   // equation/formula behavior
  | "DEFINITION"       // what something is
  | "COMPARISON"       // distinguish A vs B
  | "EXCEPTION"        // contradiction/special case
  | "WORKFLOW"         // sequence/process
  | "HIGH_YIELD_FACT"  // exam-critical compression
  | "TRAP"             // common misunderstanding
  | "EVIDENCE"         // proof/supporting data
  | "FILLER";          // low informational density — suppress

export interface SignalScore {
  type: SignalType;
  /** 0.0 – 1.0 — higher = more operationally valuable */
  operationalScore: number;
}

// ---------------------------------------------------------------------------
// Signal detection patterns
// ---------------------------------------------------------------------------

const DECISION_RULE_RE =
  /\b(if\b.{4,60}\b(?:then\b|→|do\b|use\b|order\b|give\b|start\b)|should\b|must\b|is required\b|requires?\b|the next step\b|rule of thumb\b|when to\b|always\b(?! a| an| the))\b/i;

const FAILURE_MODE_RE =
  /\b(fails?|failure|goes wrong|risk of|danger|complication|adverse|contraindicated|do not|avoid\b|never\b(?! mind)|mortality|morbidity|missing|overlooked|without treatment|if untreated|can lead to death|fatal)\b/i;

const THRESHOLD_RE =
  /\b(\d{1,4}\s*(?:mg|ml|mmol|mmhg|mmol\/l|%|g\/dl|kg|units?|iu|meq|cm|mm|°c|°f)\b|>\s*\d|<\s*\d|≥\s*\d|≤\s*\d|normal range|reference range|upper limit|lower limit|cutoff|threshold)\b/i;

const MECHANISM_RE =
  /\b(because\b|mechanism\b|caused by\b|results? in\b|leads? to\b|pathway\b|activates?\b|inhibits?\b|releases?\b|binds?\b|stimulates?\b|blocks?\b|therefore\b|thus\b|hence\b|due to\b|in response to\b|triggers?\b|enables?\b|prevents?\b)\b/i;

const CAUSAL_CHAIN_RE =
  /(?:[A-Za-z]{3,}\s*→\s*[A-Za-z]{3,})|(?:\b(?:leads? to|causes?|results? in)\b.{4,40}\b(?:which\b|causing\b|leading to\b|resulting in\b))/i;

const SYMBOLIC_LOGIC_RE =
  /(?:lim\b|[=→∞√∫∂∑±≤≥≠]|\^[0-9n]|lim_{|\\lim|\bsin\b|\bcos\b|\bln\b|\bconverges?\b|\bdiverges?\b|\bapproaches?\b|\bformula\b|\bequation\b|\btheorem\b)/i;

const DEFINITION_RE =
  /\b(is defined as\b|is called\b|refers? to\b|is a\b(?=.{4})|are\b(?=.{4})|consists? of\b|composed of\b|made of\b|is the\b(?=.{4})|are the\b|is an? type of\b|can be described as\b)\b/i;

const COMPARISON_RE =
  /\b(versus\b|vs\.?\b|compared to\b|unlike\b|whereas\b|in contrast\b|distinguishes?\b|similar to\b|differ(?:s|ence)\b|on the other hand\b|rather than\b|as opposed to\b)\b/i;

const EXCEPTION_RE =
  /\b(except(?:ion)?\b|however\b|but\b(?=.{6})|unless\b|not always\b|does not apply\b|in special cases?\b|may not\b|cannot\b|special case\b|paradox\b|despite\b)\b/i;

const WORKFLOW_RE =
  /\b(step\s*\d\b|first[,\s]\b|then[,\s]\b|next[,\s]\b|finally[,\s]\b|followed by\b|procedure\b|protocol\b|algorithm\b|workflow\b|in order to\b|sequence\b)\b/i;

const HIGH_YIELD_RE =
  /\b(key point\b|high.?yield\b|boards?\b|exam\b|mcat\b|dat\b|usmle\b|nbde\b|commonly tested\b|remember\b|classic\b|hallmark\b|pathognomonic\b|gold standard\b|first.line\b|drug of choice\b)\b/i;

const TRAP_RE =
  /\b(common mistake\b|do not confuse\b|not to be confused\b|often confused\b|trap\b|pitfall\b|beware\b|careful\b|misconception\b|misunderstood\b|incorrectly\b)\b/i;

const EVIDENCE_RE =
  /\b(studies? show\b|research shows?\b|evidence suggests?\b|has been shown\b|demonstrated\b|proven\b|clinical trial\b|data show\b|in vivo\b|in vitro\b)\b/i;

// ---------------------------------------------------------------------------
// Comprehensive filler detection
// ---------------------------------------------------------------------------

const FILLER_OPENERS_CLASSIFY = [
  /^(it is interesting to note|it is worth noting|interestingly|notably|importantly|as we (shall|will) (see|learn|discuss))\b/i,
  /^(scientists? have (long )?(believed|known|found|observed|studied)|researchers? (have|have long)|historically,|throughout history,)\b/i,
  /^(consider for example|consider the following|let us consider|let us examine|as an example)\b/i,
  /^(in this (chapter|section|book|unit|module)|this (chapter|section|book) (will|covers?|discusses?|explores?))\b/i,
  /^(one of the (most|key)|among the (most|key)|perhaps the most important)\b/i,
  /^(as (mentioned|discussed|noted|described) (above|below|previously|earlier))\b/i,
  /^(the (study|science|field) of [a-z]+ (has|is|was|have))\b/i,
  /^(textbooks? (often|typically|usually|generally))\b/i,
  /^(this (means|suggests|indicates|implies|demonstrates|shows|confirms))\b/i,
  /^(it (should|must) be (noted|remembered|emphasized))\b/i,
  /^(keep in mind|bear in mind|remember that)\b/i,
  /^(students? (should|must|will|often|sometimes|tend to))\b/i,
  /^(many (students?|people|readers?))\b/i,
];

const FILLER_CONTENT_RE =
  /\b(the following (sections?|chapters?|pages?|table|figure)|see (below|above|table|figure|chapter|section)|refer to (table|figure|chapter|section|the above)|as (shown|illustrated|depicted|described) in|the (above|following|preceding) (figure|table|diagram)|for more (information|detail|discussion)|we (will|shall) (discuss|explore|examine|cover|return to) this)\b/i;

// Phrase-heavy sentences that just fill space
const FILLER_HEDGE_RE =
  /\b(it (can|could|may|might) be (argued|said|suggested|noted|observed|considered)|in (a|some|many|most) (sense|way|respect|cases)|to (some|a certain|a large|a great) extent|under (normal|typical|most|certain) (circumstances|conditions|situations))\b/i;

/**
 * Returns true if the sentence is informational filler — should lose highlight priority.
 * Applies to: historical narration, author commentary, transition phrases, decorative language.
 */
export function isFillerSentence(text: string): boolean {
  if (!text || text.length < 12) return true;
  const t = text.trim();
  // Check filler openers
  for (const re of FILLER_OPENERS_CLASSIFY) {
    if (re.test(t)) return true;
  }
  // Filler content patterns
  if (FILLER_CONTENT_RE.test(t)) return true;
  if (FILLER_HEDGE_RE.test(t)) return true;
  // Very short sentences with no operational content
  const words = t.split(/\s+/).length;
  if (words < 5 && !DECISION_RULE_RE.test(t) && !THRESHOLD_RE.test(t)) return true;
  return false;
}

/**
 * Classifies a sentence into signal types (may match multiple) and assigns
 * an operational score (1.0 = most operationally dense, 0.1 = pure filler).
 */
export function classifySignal(text: string): SignalScore {
  if (!text) return { type: "FILLER", operationalScore: 0.1 };

  if (isFillerSentence(text)) return { type: "FILLER", operationalScore: 0.1 };

  // Order matters: more specific patterns first
  if (CAUSAL_CHAIN_RE.test(text))   return { type: "CAUSAL_CHAIN",   operationalScore: 0.92 };
  if (DECISION_RULE_RE.test(text))  return { type: "DECISION_RULE",  operationalScore: 0.95 };
  if (FAILURE_MODE_RE.test(text))   return { type: "FAILURE_MODE",   operationalScore: 0.93 };
  if (THRESHOLD_RE.test(text))      return { type: "THRESHOLD",      operationalScore: 0.91 };
  if (HIGH_YIELD_RE.test(text))     return { type: "HIGH_YIELD_FACT",operationalScore: 0.90 };
  if (TRAP_RE.test(text))           return { type: "TRAP",           operationalScore: 0.89 };
  if (SYMBOLIC_LOGIC_RE.test(text)) return { type: "SYMBOLIC_LOGIC", operationalScore: 0.88 };
  if (MECHANISM_RE.test(text))      return { type: "MECHANISM",      operationalScore: 0.86 };
  if (COMPARISON_RE.test(text))     return { type: "COMPARISON",     operationalScore: 0.82 };
  if (EXCEPTION_RE.test(text))      return { type: "EXCEPTION",      operationalScore: 0.80 };
  if (WORKFLOW_RE.test(text))       return { type: "WORKFLOW",       operationalScore: 0.78 };
  if (DEFINITION_RE.test(text))     return { type: "DEFINITION",     operationalScore: 0.75 };
  if (EVIDENCE_RE.test(text))       return { type: "EVIDENCE",       operationalScore: 0.60 };

  return { type: "EVIDENCE", operationalScore: 0.50 };
}

/**
 * Returns a numeric boost/penalty to apply to an existing highlight score.
 * Positive = signal is operationally valuable; negative = filler.
 */
export function signalScoreAdjustment(text: string): number {
  const { type, operationalScore } = classifySignal(text);
  switch (type) {
    case "DECISION_RULE":   return +14;
    case "FAILURE_MODE":    return +12;
    case "THRESHOLD":       return +11;
    case "CAUSAL_CHAIN":    return +10;
    case "HIGH_YIELD_FACT": return +10;
    case "TRAP":            return +9;
    case "SYMBOLIC_LOGIC":  return +8;
    case "MECHANISM":       return +6;
    case "COMPARISON":      return +4;
    case "EXCEPTION":       return +3;
    case "WORKFLOW":        return +2;
    case "DEFINITION":      return +2;
    case "EVIDENCE":        return 0;
    case "FILLER":          return -18;
    default:                return Math.round((operationalScore - 0.6) * 20);
  }
}

/**
 * Maps a SignalType to the nearest ParagraphRole for backward compatibility.
 */
export function signalTypeToParagraphRole(type: SignalType): string {
  switch (type) {
    case "DECISION_RULE":   return "decision_rule";
    case "FAILURE_MODE":    return "trap_warning";
    case "TRAP":            return "trap_warning";
    case "MECHANISM":
    case "CAUSAL_CHAIN":
    case "SYMBOLIC_LOGIC":  return "support_explanation";
    case "COMPARISON":      return "support_relation";
    case "DEFINITION":      return "primary_signal";
    case "FILLER":          return "low_value";
    default:                return "support_explanation";
  }
}
