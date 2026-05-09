// lib/insights/extractConceptBlocks.ts
// Concept extraction engine: structured page model → scored concept blocks.
// Both LEFT highlights and RIGHT ULTRA view derive from this single output.

import { cleanSentence } from "./sentenceCleanup";
import { isRenderableSentence } from "./isRenderableSentence";
import { TRAP_RE, REASON_RE } from "./dedupeSectionCandidates";
import { inferConceptTitle } from "./inferConceptTitle";
import type { PageDomain } from "./detectPageDomain";

export type ConceptImportance = "very_high" | "high" | "medium" | "low";

export type ConceptRole =
  | "definition"     // "X is defined as", "X is characterized by"
  | "theorem"        // "Theorem:", "Lemma:", "Corollary:", math definitional statements
  | "formula"        // bare notation/formula without attached explanation prose
  | "mechanism"      // "X causes", "X leads to", "because"
  | "application"    // "used in", "applied to", "in practice", "clinically"
  | "measurement"    // numbers with units, "unit of", "equal to"
  | "contrast"       // "unlike X", "in contrast" as primary signal — trap-adjacent
  | "worked_example" // "Example N:", "Solution:", structural section headers
  | "analogy"        // "like", "similar to", "analogous to"
  | "variation"      // catch-all exception/special-case contrast
  | "example"        // "for example", "such as"
  | "detail";        // everything else

export const ROLE_PRIORITY: Record<ConceptRole, number> = {
  theorem:        8,  // theorem statements are the highest educational target
  formula:        7,  // bare notation — core reference material
  definition:     6,
  mechanism:      5,
  application:    4,  // practical usage more valuable than plain measurement
  measurement:    3,
  contrast:       3,  // trap-adjacent — valuable for distinction
  worked_example: 2,  // clearly below definitions
  analogy:        2,
  example:        2,  // examples are support, not the core idea
  variation:      1,
  detail:         1,
};

export interface SourceSentence {
  id: string;
  text: string;
  paragraphId?: string;
  headingId?: string;
  score?: number;
}

export interface SourceParagraph {
  id: string;
  text: string;
  sentenceIds: string[];
  headingId?: string;
  score?: number;
}

export interface SourceHeading {
  id: string;
  text: string;
  level?: number;
  score?: number;
}

export interface PageModelForConcepts {
  documentId: string;
  pageNumber: number;
  pageTitle?: string | null;
  pageSummary?: string | null;
  headings?: SourceHeading[];
  paragraphs?: SourceParagraph[];
  sentences?: SourceSentence[];
  domain?: PageDomain;
}

export interface ConceptBlockInput {
  id: string;
  title: string;
  anchorSentence: string;
  anchorSentenceId?: string;
  supportSentences: string[];
  supportSentenceIds: string[];
  trapCandidates: string[];
  headingText?: string;
  paragraphIds: string[];
  importance: ConceptImportance;
  score: number;
  conceptRole: ConceptRole;
}

const MAX_BLOCKS = 3;
const MIN_BLOCKS = 1;

// Use canonical signal regexes from dedupeSectionCandidates (TRAP_RE, REASON_RE)
// Keep local lists only for score boosting
const RULE_MARKERS = [
  "defined as", "is called", "refers to", "means", "therefore",
  "thus", "in other words", "results in", "causes", "leads to", "because",
];

const LOW_VALUE_OPENERS = [
  "for example", "in addition", "also", "moreover", "furthermore",
];

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function startsWithLowValueOpener(text: string): boolean {
  const lower = normalize(text);
  return LOW_VALUE_OPENERS.some((m) => lower.startsWith(m));
}

function hasContrast(text: string): boolean {
  return TRAP_RE.test(text);
}

function hasRuleSignal(text: string): boolean {
  return REASON_RE.test(text) || RULE_MARKERS.some((m) => normalize(text).includes(m));
}


interface DomainBoosts {
  definitionBonus: number;
  mechanismBonus: number;
  clinicalBonus: number;
  mathFormulaBonus: number;
  fillerPenalty: number;
}

function computeDomainBoosts(domain?: PageDomain): DomainBoosts {
  switch (domain) {
    case "clinical":
      return { definitionBonus: 2, mechanismBonus: 4, clinicalBonus: 6, mathFormulaBonus: 0, fillerPenalty: -10 };
    case "math":
      return { definitionBonus: 3, mechanismBonus: 2, clinicalBonus: 0, mathFormulaBonus: 6, fillerPenalty: -12 };
    case "science":
      return { definitionBonus: 3, mechanismBonus: 5, clinicalBonus: 0, mathFormulaBonus: 0, fillerPenalty: -8 };
    default:
      return { definitionBonus: 2, mechanismBonus: 3, clinicalBonus: 0, mathFormulaBonus: 0, fillerPenalty: -8 };
  }
}

function sentenceScore(sentence: SourceSentence, domain?: PageDomain): number {
  const cleaned = cleanSentence(sentence.text);
  if (!isRenderableSentence(cleaned)) return -100;

  const boosts = computeDomainBoosts(domain);
  let score = sentence.score ?? 0;
  const len = cleaned.length;
  if (len >= 45 && len <= 220) score += 3;
  if (hasRuleSignal(cleaned)) score += 3;
  if (hasContrast(cleaned)) score += 1;
  if (!startsWithLowValueOpener(cleaned)) score += 1;
  if (/[:;]/.test(cleaned)) score += 1;
  if (/\b(is|are|means|defined|consists|causes|results|leads)\b/i.test(cleaned)) score += 2;
  // Decision-path bonus: sentences that carry condition → interpretation → action structure
  // are the highest-value anchors for clinical and instructional pages because they tell the
  // reader what to do, not just what exists. Prefer these over purely descriptive sentences.
  if (/\b(when |if |in (the )?case of |once |after |before )/i.test(cleaned)) score += 2;
  if (/\b(indicates?|suggests?|confirms?|rules? out|points? to|is consistent with)\b/i.test(cleaned)) score += 2;
  if (/\b(should|must|requires?|is recommended|is essential|clinician|dentist|therapist|practitioner)\b/i.test(cleaned)) score += 1;
  // Heavy penalties so example-opening and figure-reference sentences never become anchors.
  if (/^(for example,?|for instance,?|such as |e\.g\.,|i\.e\.,|to illustrate|consider |one example|another example)/i.test(cleaned.trimStart())) score -= 6;
  if (/^(figure|fig\.|table|diagram|image|chart|exhibit)\s*[\dA-Za-z]/i.test(cleaned.trimStart())) score -= 8;
  // Named-substance deficiency/toxicity: "Iodine deficiency causes goiter" is an illustrative
  // example, not the page's main mechanism. Should score below the general rule it illustrates.
  if (/^[A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]+)?\s+(deficiency|toxicity|poisoning|overdose|exposure)\b/.test(cleaned)) score -= 3;
  // Biographical / interview sentence: personal anecdote or career story, not a teaching rule.
  if (/^(as a |when i |i (was|have|had|remember|learned|think|believe)|in my (experience|opinion|career|practice))/i.test(cleaned.trimStart())) score -= 5;
  // Specific named-disease-instance sentence: "goiter", "rickets", "scurvy" etc. used
  // as named illustrations of a deficiency rule → example, not core mechanism.
  if (/\b(goiter|rickets|scurvy|pellagra|beriberi|kwashiorkor|marasmus|cretinism)\b/i.test(cleaned)) score -= 3;
  // Case-study / interview / profile framing — never a core concept anchor.
  if (/\b(case study|case report|clinical case|interview|profile of|spotlight:|patient story)\b/i.test(cleaned)) score -= 5;
  // Named molecule with observational/abundance fact: "Water (H2O) is the most abundant..."
  // These are illustrative examples of a concept, not the concept itself.
  if (/^[A-Z][a-z]{1,15}(?:\s*\([A-Za-z0-9₀-₉²³+\-]+\))?\s+is (the |a |an )?(most|least|only|found|abundant|present|common|approximately|often|mainly|primarily|widely|highly|extremely)\b/i.test(cleaned.trimStart())) score -= 4;
  // Named molecule + composition: "Water (H₂O) consists of hydrogen and oxygen" — instance fact.
  if (/^[A-Z][a-z]{1,15}(?:\s*\([A-Za-z0-9₀-₉²³+\-]+\))?\s+(consists?\s+of|is\s+(composed|made)\s+(of|from)|is\s+made\s+up\s+of)\b/i.test(cleaned.trimStart())) score -= 4;
  // General category principle: "A compound forms when...", "An element is defined as..."
  // These are page-level teaching statements — more valuable than named-instance sentences.
  if (/^(a|an) [a-z]{3,20}(?:\s+[a-z]{3,20})? (is|are|forms?|occurs?|results?|arises?|develops?|requires?|exhibits?|consists?|refers?)\b/i.test(cleaned.trimStart())) score += 3;
  // Math example question opener — "What happens to...", "Find the limit of..." — never an anchor.
  if (domain === "math" && /^(what (happens|is|are|would|does)\b|determine (whether|if|the)\b|find (the|a|all)\b|show (that|this)\b|prove (that|this)\b|compute\b|calculate\b|consider the (sequence|series)\b|let [a-z]_?\{?n\}?\s*=)/i.test(cleaned.trimStart())) score -= 8;
  // Fiction/narrative: plot-decisive and consequence-bearing sentences score higher than description.
  // Decision verbs, consequence chains, and pivotal action carry cognitive weight.
  if (/\b(decided?|chose|realized|discovered|revealed|escaped|attacked|betrayed|confessed|refused|demanded|admitted|surrendered|understood|knew\s+that|saw\s+that|found\s+out)\b/i.test(cleaned)) score += 2;
  if (/\b(which\s+(meant|led|caused|forced|allowed|changed)|that\s+(changed|would|could|made)|forcing\s+\w+\s+to|leaving\s+\w+\s+to|this\s+(meant|changed|forced|revealed))\b/i.test(cleaned)) score += 2;
  // Static description without narrative consequence — deprioritize
  if (/^(the|a|an) \w+ (was|were|had|looked|seemed|appeared|felt|stood|sat) /i.test(cleaned.trimStart()) && !/\b(suddenly|turned|changed|realized|decided|revealed|forced|meant)\b/i.test(cleaned)) score -= 2;
  // Named substance category instance: "Iodine is the trace element that..."
  // Defines the substance (an example), not the page's teaching concept.
  if (/^[A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]+)?\s+is (a|an|the) (trace|essential|major|minor|macro|micro|most abundant|only)?\s*(element|mineral|compound|ion|vitamin|electrolyte|metalloid|halogen|nutrient)\b/i.test(cleaned.trimStart())) score -= 4;
  // Math/prose filler openers — high word count but zero informational density.
  // "We indicate this by saying", "In other words", "Notice that", "Here we investigate"
  // score high on generic heuristics but carry no mathematical content.
  if (/^(we (indicate|say|note|see|observe|call|denote|write|have seen|recall that|use the fact|now turn|now consider)\b|in other words,?|notice that\b|observe that\b|here we (investigate|study|consider|explore|look at|turn|examine)\b|the first few terms\b|we now\b|we have (seen|shown|established)\b|it (is|can be) (shown|seen|noted|verified)\b|this (gives|shows|yields|follows)\b|recall (that\b|from\b))/i.test(cleaned.trimStart())) score -= 8;
  // Worked-example / solution header lines — structural labels, never anchor sentences.
  if (/^(example\s*[\d.:)]*\s*$|solution[.:]?\s*$|problem\s*[\d.:)]*\s*$|exercise\s*[\d.:)]*\s*$)/i.test(cleaned.trim())) score -= 10;
  // Math definitional/convergence signals — highest educational value sentences on a math page.
  if (/\b(is (called|defined as|said to be)|converges? (to|toward)|has (a |no )?limit|limit (exists?|does not exist)|does not converge|diverges?\b|approaches? (a |the )?(value|limit|number|zero)|sequence (converges?|has a|does not))\b/i.test(cleaned)) score += 4;
  // Explicit section labels that always carry the page's teaching content.
  if (/^(definition\b|theorem\b|lemma\b|corollary\b|proposition\b)/i.test(cleaned.trimStart())) score += 5;
  // lim notation with explicit target — definitional formula worth high score.
  if (/\blim\b.*[=→].*[0-9L∞]|[=→]\s*[0-9L∞]\s*$|n\s*→\s*[∞0-9]/i.test(cleaned)) score += 3;

  // Domain-specific signal boosts — applied after generic scoring so domain signal always
  // has a chance to lift the right sentences above domain-agnostic competitors.
  if (boosts.clinicalBonus && /\b(indicates?|suggests?|next step|must|should|diagnos|treat|manage|refer|order|prescribe|admit)\b/i.test(cleaned)) {
    score += boosts.clinicalBonus;
  }
  if (boosts.mathFormulaBonus && /\b(theorem|lemma|corollary|converge|diverge|limit|sequence|series|formula|proof|defined as|if and only if)\b/i.test(cleaned)) {
    score += boosts.mathFormulaBonus;
  }
  if (boosts.mechanismBonus > boosts.definitionBonus) {
    // Science: elevate process-flow verbs beyond the generic mechanism score
    if (/\b(produces?|activates?|inhibits?|triggers?|releases?|stimulates?|regulates?|converts?|synthesizes?|degrades?)\b/i.test(cleaned)) {
      score += boosts.mechanismBonus - 3;
    }
  }
  if (boosts.fillerPenalty < -8) {
    // Math domain: extra filler penalty for narrative explanatory prose
    if (/^(we can|this means|note that|recall that|it follows|observe that|in other words|therefore|thus|hence)/i.test(cleaned.trimStart())) {
      score += boosts.fillerPenalty + 8;
    }
  }

  return score;
}

function chooseAnchorSentence(sentences: SourceSentence[], domain?: PageDomain): SourceSentence | null {
  if (!sentences.length) return null;
  const total = sentences.length;
  return (
    [...sentences].sort((a, b) => {
      const diff = sentenceScore(b, domain) - sentenceScore(a, domain);
      if (Math.abs(diff) > 0.5) return diff;
      // Tie-break 1: prefer sentences in the 12–28 word range (highest specificity)
      const aWords = a.text.split(/\s+/).length;
      const bWords = b.text.split(/\s+/).length;
      const aOpt = Math.abs(aWords - 20);
      const bOpt = Math.abs(bWords - 20);
      if (aOpt !== bOpt) return aOpt - bOpt;
      // Tie-break 2: prefer sentences near the middle of the paragraph
      const aPos = Math.abs(sentences.indexOf(a) / Math.max(total - 1, 1) - 0.5);
      const bPos = Math.abs(sentences.indexOf(b) / Math.max(total - 1, 1) - 0.5);
      return aPos - bPos;
    })[0] ?? null
  );
}

function inferImportance(score: number): ConceptImportance {
  if (score >= 10) return "very_high";
  if (score >= 7)  return "high";
  if (score >= 4)  return "medium";
  return "low";
}

function dedupeSentences(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const cleaned = cleanSentence(line);
    if (!isRenderableSentence(cleaned)) continue;
    const key = normalize(cleaned);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

function inferTitle(
  paragraph: SourceParagraph,
  anchor: SourceSentence,
  headingMap: Map<string, SourceHeading>
): string {
  const headingText = paragraph.headingId ? headingMap.get(paragraph.headingId)?.text : undefined;
  return inferConceptTitle(cleanSentence(anchor.text), headingText);
}

function classifyConceptRole(anchorText: string, supportTexts: string[], paragraphText?: string, domain?: PageDomain): ConceptRole {
  const lower = anchorText.toLowerCase();
  const anchorTrimmed = anchorText.trim();
  const isMathPage = domain === "math";

  // Fiction/narrative domain: classify by narrative function before generic checks.
  // Plot turns and character decisions map to "mechanism" (they cause change).
  // Conflict and motivation map to "contrast" and "definition" respectively.
  // Pure description maps to "detail".
  if (domain === "fiction") {
    if (/\b(decided?|chose|refused|demanded|admitted|surrendered|betrayed|confessed|escaped|attacked|revealed)\b/i.test(lower)) return "mechanism";
    if (/\b(realized|understood|knew\s+that|discovered|found\s+out|saw\s+that)\b/i.test(lower)) return "definition";
    if (/\b(unlike|in contrast|however|but\s+\w+|whereas|although|despite)\b/i.test(lower)) return "contrast";
    if (/\b(because|therefore|which\s+(meant|led|caused|forced)|forcing|leaving\s+\w+\s+to)\b/i.test(lower)) return "mechanism";
    return "detail";
  }

  // Example: check FIRST — a sentence starting with an illustrative opener must never be
  // classified as "definition" even if "X is a Y" appears later in the same sentence.
  // Also promote to "example" when the enclosing paragraph opens with an example marker,
  // regardless of how the individual anchor sentence is phrased.
  const exampleSentenceStart = /^(for example,?|for instance,?|such as |e\.g\.,|i\.e\.,|to illustrate,?|consider |one example|another example)/i.test(lower.trimStart());
  const exampleParagraphStart = paragraphText
    ? /^(for example,?|for instance,?|such as |e\.g\.,|i\.e\.,|to illustrate,?|one example|another example)/i.test(paragraphText.trimStart().toLowerCase())
    : false;
  if (exampleSentenceStart || exampleParagraphStart) return "example";

  // Biographical / interview sentence → always treated as example (not a teaching rule)
  if (/^(as a |when i |i (was|have|had|remember|learned)|in my (experience|career|practice))/i.test(lower.trimStart())) return "detail";
  // Named disease instance used as illustration of a deficiency rule
  if (/\b(goiter|rickets|scurvy|pellagra|beriberi|kwashiorkor|marasmus|cretinism)\b/i.test(lower)) return "example";

  // Named-substance instance: sentence describes a SPECIFIC named substance/organism/element
  // as an instance of a category rule. These illustrate a general rule and must not
  // outrank the rule itself. Checked before mechanism so "Iodine deficiency causes goiter"
  // and "Arsenic is a trace element required in rodents" become "example" not "mechanism".
  //   Pattern 1: "[Substance] deficiency/toxicity/overdose/exposure ..."
  //   Pattern 2: "[Substance] is a trace element / mineral / vitamin / toxin ..."
  const NAMED_DEFICIENCY_RE = /^[A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]+)?\s+(deficiency|toxicity|poisoning|overdose|exposure)\b/;
  // "is (a|an|the)" — extended from original "is (a|an)" to catch "Iodine is the trace element that..."
  const NAMED_SUBSTANCE_CATEGORY_RE = /^[A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]+)?\s+is (a|an|the) (trace|essential|major|minor|macro|micro|most abundant|only|primarily)?\s*(element|mineral|compound|ion|vitamin|electrolyte|metalloid|halogen|nutrient|toxin|noble gas|micro[nN]utrient)\b/i;
  if (NAMED_DEFICIENCY_RE.test(anchorTrimmed) || NAMED_SUBSTANCE_CATEGORY_RE.test(anchorTrimmed)) return "example";

  // Named molecule/element + composition fact (even with "consists of"):
  // "Water (H₂O) consists of hydrogen and oxygen" defines a SPECIFIC MOLECULE, not the
  // general concept rule. Must fire BEFORE hasFormalDefinition check below.
  const NAMED_MOLECULE_COMPOSITION_RE = /^[A-Z][a-z]{1,15}(?:\s*\([A-Za-z0-9₀-₉²³+\-]+\))?\s+(consists?\s+of|is\s+(composed|made)\s+(of|from)|is\s+made\s+up\s+of)\b/i;
  if (NAMED_MOLECULE_COMPOSITION_RE.test(anchorTrimmed)) return "example";

  // Named molecule/element with an observational/abundance fact is NOT a structural definition.
  // "Water (H₂O) is the most abundant compound found in cells" — this is a measurable fact
  // about water's prevalence, not a definition of what water IS. Similarly "Arsenic is found
  // in trace amounts" or "Sodium is primarily an extracellular ion".
  // Only fires when the sentence lacks formal definitional language (defined as, refers to…).
  const hasFormalDefinition = /\b(defined as|characterized by|refers to|is called|is known as|consists of|is the process of|is the ability to)\b/.test(lower);
  const NAMED_MOLECULE_FACT_RE = /^[A-Z][a-z]{1,15}(?:\s*\([A-Za-z0-9₀-₉²³+\-]+\))?\s+is (the |a |an )?(most|least|only|found|abundant|present|common|approximately|often|mainly|primarily|widely|highly|extremely)\b/i;
  if (NAMED_MOLECULE_FACT_RE.test(anchorTrimmed) && !hasFormalDefinition) return "example";

  // Math filler openers — must be checked BEFORE all other role detection because a sentence
  // like "We indicate this by saying lim n→∞ aₙ = L" contains "lim" which would otherwise
  // fire formula/theorem detection below. Filler carries no teaching content.
  const MATH_FILLER_OPENER_RE = /^(we (indicate|say|note|observe|denote|call|define this as|write|have seen|recall that)|in other words,?|notice that\b|observe that\b|it (is|can be) (shown|seen|noted|verified)\b|here we\b|this (gives|shows|yields|follows)\b|recall (that|from)\b)/i;
  if (MATH_FILLER_OPENER_RE.test(lower.trimStart())) return "detail";

  // Math example question prompt — "What happens to...", "Find the limit of...", "Let aₙ = ..."
  // These are problem/exercise prompts inside worked examples, not page-level teaching rules.
  if (isMathPage && /^(what (happens|is|are|would|does)\b|determine (whether|if|the)\b|find (the|a|all)\b|show (that|this)\b|prove (that|this)\b|compute (the|a)\b|calculate (the|a)\b|consider the (sequence|series|function)\b|let [a-z]_?\{?n\}?\s*=)/i.test(lower.trimStart())) return "worked_example";

  // Worked-example / solution section header — always overrides all other signals.
  // Short label lines like "Example 3.1" or "Solution." are structural markers, not anchors.
  if (/^(example\s*[\d.:)]+|solution[.:]?\s*$|problem\s*[\d.:)]+|exercise\s*[\d.:)]+)/i.test(anchorTrimmed)) return "worked_example";
  // Also catch bare label lines with no trailing content
  if (/^(example|solution|problem|exercise)\s*[\d.:)]*\s*$/i.test(anchorTrimmed)) return "worked_example";

  // Theorem/lemma/corollary/proposition label — highest educational priority on math pages.
  // "Theorem 3.2: A sequence {aₙ} converges..." → theorem
  if (/^(theorem|lemma|corollary|proposition|axiom)\b/i.test(anchorTrimmed)) return "theorem";
  // On math pages, a "Definition:" label heading is equivalent to a theorem (definitional statement)
  if (/^(definition\b)/i.test(anchorTrimmed) && isMathPage) return "theorem";

  // Formula: bare mathematical notation — short anchor with symbolic content and no explanation prose.
  // Longer formula sentences with full prose are "definition". Pure notation ≤8 words → "formula".
  const hasSymbolicMath = /[=∫∂∑]|lim\b|d\/d[xt]|\\frac/i.test(anchorText);
  const isShortFormula = hasSymbolicMath && anchorText.split(/\s+/).length <= 8;
  if (isShortFormula) return "formula";

  // Application: practical/clinical usage framing.
  if (/\b(used (in|for|to)\b|applied (to|in)\b|in (practice|clinical use|clinical context)\b|clinically\b|in patients?\b)\b/i.test(lower)) return "application";

  // Contrast: "unlike", "in contrast", "however" as THE primary signal (not buried mid-sentence).
  // Checked before "variation" so the more specific role wins.
  if (/^(unlike\b|in contrast\b|however\b|although\b|whereas\b|on the other hand\b)/i.test(lower.trimStart())) return "contrast";

  // Analogy: "similar to", "analogous to", "just as", "functions like"
  if (/\b(similar to\b|analogous to\b|just as\b|like (a|an|the)\b|functions (like|as)\b)\b/i.test(lower)) return "analogy";

  // Definition: explicit definitional copula or structural "is a/the X that/which"
  if (/\b(is defined as|is characterized by|refers to|is called|is known as|is a type of|is described as|is the process of|is the ability to|consists of)\b/.test(lower)) return "definition";
  if (/\b(defined as|means that|means \w|is (a|an|the) \w+ (that|which|of))\b/.test(lower)) return "definition";
  if (/\b(is (a|an|the) \w[\w\s]+ (that|which|used|found|located|formed|produced|made))\b/.test(lower)) return "definition";
  // Math convergence/limit definitional language → definition (not formula — contains prose)
  if (isMathPage && /\b(is (called|said to be)|converges? (to|toward)|has (a |no )?limit\b|does not converge\b|diverges?\b|approaches? (a |the )?(value|limit|number|zero|fixed)\b)\b/i.test(lower)) return "definition";
  // Longer formula sentence with explanation → definition (≤8-word bare formula already caught above)
  if (hasSymbolicMath && /[a-zA-Z]{3,}/.test(anchorText)) return "definition";

  // Mechanism: causal / process language including science relational verbs
  if (/\b(causes?|leads? to|results? in|because|therefore|thus|hence|consequently|triggers?|stimulates?|inhibits?|activates?|promotes?|mediates?|drives?|prevents?|allows?)\b/.test(lower)) return "mechanism";
  if (/\b(depends? on|regulated by|controlled by|initiated by|releases?|absorbs?|determines?|identifies?|governs?|regulates?|establishes?|reveals?)\b/.test(lower)) return "mechanism";

  // Variation / contrast / exception (mid-sentence contrast — start-of-sentence already caught above)
  if (/\b(unlike|however|in contrast|whereas|although|despite|rather than|on the other hand|except)\b/.test(lower)) return "variation";
  if (/\b(not all|not every|does not|cannot|different from|differs from|distinguished from)\b/.test(lower)) return "variation";

  // Measurement: numeric values with domain units, or quantitative framing
  if (/\b\d+(\.\d+)?\s*(daltons?|da\b|amu|mol\b|kg\b|g\b|cm\b|mm\b|nm\b|km\b|l\b|ml\b|pa\b|kpa\b|hz\b|ev\b|kev\b|mev\b|degrees?|°|%)/i.test(anchorText)) return "measurement";
  if (/\b(unit of|measured in|is approximately|is equal to|equals approximately|range(s)? from|between \d+ and \d+)\b/i.test(lower)) return "measurement";
  if (/\b(atomic (mass|weight|number)|molecular (weight|mass)|mass number|proton number|neutron number)\b/.test(lower) && /\d/.test(anchorText)) return "measurement";

  // Example: mid-sentence illustrative markers (not at sentence start — caught above already)
  if (/\b(for example|for instance|e\.g\.|i\.e\.|just as)\b/.test(lower)) return "example";

  return "detail";
}

function extractTrapCandidates(sentences: SourceSentence[]): string[] {
  // Sort by trap signal strength: TRAP_RE match first, then by length (longer = more specific)
  const trapSentences = sentences
    .map((s) => cleanSentence(s.text))
    .filter((text) => hasContrast(text) && isRenderableSentence(text))
    .sort((a, b) => {
      const aStrong = /\b(however|unlike|in contrast|rather than|should not be confused|do not confuse|not the same|different from)\b/i.test(a);
      const bStrong = /\b(however|unlike|in contrast|rather than|should not be confused|do not confuse|not the same|different from)\b/i.test(b);
      if (aStrong && !bStrong) return -1;
      if (!aStrong && bStrong) return 1;
      return b.length - a.length;
    });
  return dedupeSentences(trapSentences).slice(0, 2);
}

function buildConceptFromParagraph(
  paragraph: SourceParagraph,
  sentenceMap: Map<string, SourceSentence>,
  headingMap: Map<string, SourceHeading>,
  domain?: PageDomain
): ConceptBlockInput | null {
  const sentences = paragraph.sentenceIds
    .map((id) => sentenceMap.get(id))
    .filter((s): s is SourceSentence => Boolean(s));
  if (!sentences.length) return null;

  const rawAnchor = chooseAnchorSentence(sentences, domain);
  if (!rawAnchor) return null;

  // If the best-scoring sentence is classified as an example, try to find a non-example
  // anchor from the remaining sentences. This prevents "Water (H2O) is the most abundant..."
  // or "Iodine is the trace element that..." from claiming the concept anchor slot when a
  // conceptual rule or definition sentence also exists in the same paragraph.
  let anchor = rawAnchor;
  const rawAnchorText = cleanSentence(rawAnchor.text);
  const rawAnchorRole = classifyConceptRole(rawAnchorText, [], paragraph.text, domain);
  if (rawAnchorRole === "example" && sentences.length > 1) {
    const betterAnchor = [...sentences]
      .filter((s) => s.id !== rawAnchor.id)
      .sort((a, b) => sentenceScore(b, domain) - sentenceScore(a, domain))
      .find((s) => {
        const t = cleanSentence(s.text);
        if (!isRenderableSentence(t)) return false;
        const r = classifyConceptRole(t, [], paragraph.text, domain);
        return r !== "example" && r !== "detail";
      });
    if (betterAnchor) anchor = betterAnchor;
  }

  const anchorText = cleanSentence(anchor.text);
  if (!isRenderableSentence(anchorText)) return null;

  const support = dedupeSentences(
    sentences.filter((s) => s.id !== anchor.id).map((s) => s.text)
  ).slice(0, 3);

  const score = (paragraph.score ?? 0) + sentenceScore(anchor, domain) + Math.min(support.length, 3);

  return {
    id: `concept-${paragraph.id}`,
    title: inferTitle(paragraph, anchor, headingMap),
    anchorSentence: anchorText,
    anchorSentenceId: anchor.id,
    supportSentences: support,
    supportSentenceIds: sentences.filter((s) => s.id !== anchor.id).map((s) => s.id),
    trapCandidates: extractTrapCandidates(sentences),
    headingText: paragraph.headingId ? headingMap.get(paragraph.headingId)?.text : undefined,
    paragraphIds: [paragraph.id],
    importance: inferImportance(score),
    score,
    conceptRole: classifyConceptRole(anchorText, support, paragraph.text, domain),
  };
}

function mergeRelatedConcepts(concepts: ConceptBlockInput[]): ConceptBlockInput[] {
  const out: ConceptBlockInput[] = [];
  const used = new Set<string>();

  for (let i = 0; i < concepts.length; i++) {
    const base = concepts[i];
    if (used.has(base.id)) continue;

    const merged: ConceptBlockInput = {
      ...base,
      supportSentences: [...base.supportSentences],
      supportSentenceIds: [...base.supportSentenceIds],
      trapCandidates: [...base.trapCandidates],
      paragraphIds: [...base.paragraphIds],
    };

    for (let j = i + 1; j < concepts.length; j++) {
      const candidate = concepts[j];
      if (used.has(candidate.id)) continue;
      const sameHeading =
        Boolean(normalize(candidate.headingText ?? "")) &&
        normalize(candidate.headingText ?? "") === normalize(base.headingText ?? "");
      const similarTitle = normalize(candidate.title) === normalize(base.title);

      if (sameHeading || similarTitle) {
        used.add(candidate.id);
        merged.supportSentences = dedupeSentences([
          ...merged.supportSentences,
          candidate.anchorSentence,
          ...candidate.supportSentences,
        ]).slice(0, 4);
        merged.supportSentenceIds = Array.from(
          new Set([...merged.supportSentenceIds, ...candidate.supportSentenceIds])
        );
        merged.trapCandidates = dedupeSentences([
          ...merged.trapCandidates,
          ...candidate.trapCandidates,
        ]).slice(0, 2);
        merged.paragraphIds = Array.from(new Set([...merged.paragraphIds, ...candidate.paragraphIds]));
        merged.score += Math.max(1, Math.floor(candidate.score / 3));
        merged.importance = inferImportance(merged.score);
        // Prefer the higher-priority role when merging
        if (ROLE_PRIORITY[candidate.conceptRole] > ROLE_PRIORITY[merged.conceptRole]) {
          merged.conceptRole = candidate.conceptRole;
        }
      }
    }

    out.push(merged);
  }
  return out;
}

function selectBestConcepts(concepts: ConceptBlockInput[], domain?: PageDomain): ConceptBlockInput[] {
  if (!concepts.length) return [];

  // Group by role, sorted by score within each group
  const byRole = new Map<ConceptRole, ConceptBlockInput[]>();
  for (const c of concepts) {
    const role = c.conceptRole;
    if (!byRole.has(role)) byRole.set(role, []);
    byRole.get(role)!.push(c);
  }
  for (const [, group] of byRole) {
    group.sort((a, b) => b.score - a.score);
  }

  const selected: ConceptBlockInput[] = [];
  const usedIds = new Set<string>();

  // First pass: one best from each core instructional role, ordered by educational value.
  // "example", "detail", "analogy", "worked_example" are excluded — they may only enter
  // via the second pass after definitions, theorems, mechanisms have claimed their slots.
  // This prevents an illustrative example from becoming the first concept when a definition
  // or theorem exists on the page.
  for (const role of ["theorem", "formula", "definition", "mechanism", "contrast", "application", "measurement"] as ConceptRole[]) {
    const best = byRole.get(role)?.[0];
    if (best && !usedIds.has(best.id)) {
      selected.push(best);
      usedIds.add(best.id);
    }
  }

  // Second pass: fill remaining slots — role tier first, then score within tier.
  // This prevents a high-scoring example/detail from jumping ahead of a lower-scoring
  // definition or mechanism that wasn't in the first-pass role list.
  // Math: once any core concept (definition/theorem/mechanism) was selected, exclude
  // worked_example and analogy entirely — they may only appear if nothing better exists.
  const hasCoreSelected = selected.some((c) =>
    c.conceptRole === "theorem" || c.conceptRole === "formula" ||
    c.conceptRole === "definition" || c.conceptRole === "mechanism"
  );
  const remaining = [...concepts]
    .filter((c) => {
      if (usedIds.has(c.id)) return false;
      if (domain === "math" && hasCoreSelected &&
          (c.conceptRole === "worked_example" || c.conceptRole === "analogy")) return false;
      return true;
    })
    .sort((a, b) => {
      const roleA = ROLE_PRIORITY[a.conceptRole ?? "detail"] ?? 0;
      const roleB = ROLE_PRIORITY[b.conceptRole ?? "detail"] ?? 0;
      if (roleA !== roleB) return roleB - roleA;
      const diff = b.score - a.score;
      if (Math.abs(diff) > 0.5) return diff;
      const aWords = a.anchorSentence.split(/\s+/).length;
      const bWords = b.anchorSentence.split(/\s+/).length;
      return Math.abs(aWords - 20) - Math.abs(bWords - 20);
    });

  for (const c of remaining) {
    if (selected.length >= MAX_BLOCKS) break;
    selected.push(c);
    usedIds.add(c.id);
  }

  // Ensure at least MIN_BLOCKS
  if (selected.length < MIN_BLOCKS) {
    for (const c of [...concepts].sort((a, b) => b.score - a.score)) {
      if (selected.length >= MIN_BLOCKS) break;
      if (!usedIds.has(c.id)) {
        selected.push(c);
        usedIds.add(c.id);
      }
    }
  }

  // Enforce strict hierarchy in final order:
  // definition first (if present), mechanism second (if present),
  // then remaining by role priority + score.
  return sortConceptsByStrictHierarchy(selected);
}

function sortConceptsByStrictHierarchy<T extends {
  conceptRole?: ConceptRole;
  score?: number;
}>(concepts: T[]): T[] {
  const ranked = [...concepts].sort((a, b) => {
    const roleA = ROLE_PRIORITY[a.conceptRole ?? "detail"] ?? 0;
    const roleB = ROLE_PRIORITY[b.conceptRole ?? "detail"] ?? 0;
    if (roleA !== roleB) return roleB - roleA;
    return (b.score ?? 0) - (a.score ?? 0);
  });

  // Strict hierarchy: theorems/formulas first, then definitions, mechanisms,
  // application/contrast/measurement, then worked examples and analogies, then the rest.
  const buckets: ConceptRole[] = [
    "theorem", "formula", "definition", "mechanism",
    "application", "contrast", "measurement",
    "worked_example", "analogy", "variation", "example", "detail",
  ];
  const byBucket = new Map<ConceptRole, T[]>();
  for (const role of buckets) byBucket.set(role, []);
  for (const item of ranked) {
    const role = (item.conceptRole ?? "detail") as ConceptRole;
    const bucket = byBucket.get(role) ?? byBucket.get("detail")!;
    bucket.push(item);
  }

  const ordered: T[] = [];
  const used = new Set<T>();

  // First: one theorem or formula (the core statement)
  for (const topRole of ["theorem", "formula"] as ConceptRole[]) {
    const first = byBucket.get(topRole)?.find((c) => !used.has(c));
    if (first) { ordered.push(first); used.add(first); break; }
  }

  // Second: one definition or mechanism
  for (const coreRole of ["definition", "mechanism"] as ConceptRole[]) {
    const first = byBucket.get(coreRole)?.find((c) => !used.has(c));
    if (first) { ordered.push(first); used.add(first); break; }
  }

  // Then: fill remaining slots in bucket order
  for (const role of buckets) {
    for (const item of byBucket.get(role) ?? []) {
      if (used.has(item)) continue;
      ordered.push(item);
      used.add(item);
    }
  }

  return ordered;
}

export function extractConceptBlocks(page: PageModelForConcepts): ConceptBlockInput[] {
  const paragraphs = page.paragraphs ?? [];
  const sentences  = page.sentences  ?? [];
  const headings   = page.headings   ?? [];
  const domain     = page.domain;

  const sentenceMap = new Map(sentences.map((s) => [s.id, s]));
  const headingMap  = new Map(headings.map((h) => [h.id, h]));

  const rawConcepts = paragraphs
    .map((p) => buildConceptFromParagraph(p, sentenceMap, headingMap, domain))
    .filter((c): c is ConceptBlockInput => Boolean(c));

  return selectBestConcepts(mergeRelatedConcepts(rawConcepts), domain);
}
