// lib/normalization/normalizeClinicalText.ts
//
// Clinical Text Normalization Engine.
// Sits between raw page extraction and buildPageStepModel.
//
// Four jobs:
// 1. Classify the page kind (chapter title, form, image-only, clinical, scientific, etc.)
// 2. Normalize clinical/scientific/math sentences into canonical meaning units
// 3. Preserve formulas, thresholds, and numeric relations
// 4. Gate panel rendering — suppress on non-instructional pages fail-closed

export type PageKind =
  | "instructional_prose"
  | "clinical_narrative"
  | "scientific_exposition"
  | "mathematical_exposition"
  | "questionnaire_form"
  | "diagram_only"
  | "table_heavy"
  | "front_matter"
  | "chapter_title"
  | "section_title"
  | "image_only"
  | "graph_only"
  | "insufficient_prose";

export type CanonicalStatementRole =
  | "definition"
  | "mechanism"
  | "clinical_rule"
  | "consequence"
  | "distinction"
  | "warning"
  | "question_prompt"
  | "formula"
  | "threshold"
  | "supporting_fact"
  | "procedure_step"
  | "mathematical_rule"
  | "interpretation";

export interface NormalizationInput {
  pageText: string;
  pageTitle?: string | null;
  pageNumber?: number | null;
  headingLines?: string[];
  imageCoverageRatio?: number | null;
  tableCoverageRatio?: number | null;
  graphCoverageRatio?: number | null;
  diagramCoverageRatio?: number | null;
}

export interface CanonicalStatement {
  id: string;
  rawText: string;
  normalizedText: string;
  role: CanonicalStatementRole;
  confidence: number;
  sourceSentenceIndex?: number;
  sourceParagraphIndex?: number;
  carriesFormula: boolean;
  carriesNumber: boolean;
}

export interface ClinicalNormalizationResult {
  pageKind: PageKind;
  shouldRenderFullPanel: boolean;
  refusalReason?: string | null;
  canonicalStatements: CanonicalStatement[];
  dominantSignal?: string | null;
  coreIdea?: string | null;
  mechanism?: string | null;
  warning?: string | null;
  applicationRule?: string | null;
  formulas: string[];
  thresholds: string[];
}

const MIN_PROSE_WORDS = 55;
const MIN_SENTENCES = 3;
const MIN_CANONICAL_STATEMENTS = 2;

// Returns true when the page carries recognizable learning content regardless
// of prose density. Used to override the word/sentence count suppression gates.
function hasInstructionalSignals(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    // Science / chemistry / biology vocabulary
    /\b(atom|molecule|element|mass|proton|neutron|electron|isotope|reaction|cell|protein|organism|compound|bond|ion|nucleus|periodic|valence)\b/.test(lower) ||
    // Explanation connectors that mark instructional prose
    /\b(therefore|because|results? in|leads? to|defined as|is called|refers? to|consists? of|means|indicates|represents|is characterized by)\b/.test(lower) ||
    // Instructional phrases
    /\b(for example|such as|in other words|that is)\b/.test(lower) ||
    // Clinical vocabulary
    /\b(patient|clinician|diagnosis|treatment|symptom|finding|clinical|prognosis)\b/.test(lower) ||
    // Math / physics vocabulary
    /\b(theorem|integral|derivative|equation|formula|function|calculate|solve|force|velocity|acceleration|momentum)\b/.test(lower) ||
    // Math symbols
    /[=∫∑∂π√]/.test(text)
  );
}

/* -------------------------------------------------------------------------- */
/*                                   PUBLIC                                   */
/* -------------------------------------------------------------------------- */

export function normalizeClinicalText(
  input: NormalizationInput
): ClinicalNormalizationResult {
  const cleanedPageText = cleanPageText(input.pageText);
  const paragraphs = splitParagraphs(cleanedPageText);
  const sentences = splitSentences(cleanedPageText);

  const pageKind = classifyPageKind({
    text: cleanedPageText,
    pageTitle: input.pageTitle ?? null,
    headingLines: input.headingLines ?? [],
    imageCoverageRatio: input.imageCoverageRatio ?? 0,
    tableCoverageRatio: input.tableCoverageRatio ?? 0,
    graphCoverageRatio: input.graphCoverageRatio ?? 0,
    diagramCoverageRatio: input.diagramCoverageRatio ?? 0,
  });

  if (!shouldRenderPageKind(pageKind, cleanedPageText, sentences)) {
    console.log("[TRACE normalizeClinicalText]", { pageKind, shouldRenderFullPanel: false, refusalReason: refusalReasonForPageKind(pageKind), canonicalCount: 0, wordCount: wordCount(cleanedPageText) });
    return {
      pageKind,
      shouldRenderFullPanel: false,
      refusalReason: refusalReasonForPageKind(pageKind),
      canonicalStatements: [],
      dominantSignal: null,
      coreIdea: null,
      mechanism: null,
      warning: null,
      applicationRule: null,
      formulas: [],
      thresholds: [],
    };
  }

  const canonicalStatements: CanonicalStatement[] = [];
  const formulas: string[] = [];
  const thresholds: string[] = [];

  sentences.forEach((sentence, sentenceIndex) => {
    const normalized = normalizeSentence(sentence, pageKind);
    if (!normalized) return;
    const role = inferStatementRole(normalized, pageKind);
    const carriesFormula = looksLikeFormula(normalized);
    const confidence = scoreStatement(normalized, role, pageKind);
    if (!isRenderableCanonicalStatement(normalized, role)) return;
    if (carriesFormula) formulas.push(normalized);
    if (looksLikeThreshold(normalized)) thresholds.push(normalized);
    canonicalStatements.push({
      id: `stmt-${sentenceIndex + 1}`,
      rawText: sentence,
      normalizedText: normalized,
      role,
      confidence,
      sourceSentenceIndex: sentenceIndex,
      sourceParagraphIndex: findParagraphIndex(sentence, paragraphs),
      carriesFormula,
      carriesNumber: /\d/.test(normalized),
    });
  });

  const dedupedStatements = dedupeCanonicalStatements(canonicalStatements);

  // Math exposition pages with formula signals always render — formula notation
  // often survives PDF extraction poorly, leaving few canonical statements even
  // on content-rich calculus/physics pages. The concept pipeline handles extraction.
  if (pageKind === "mathematical_exposition" && (looksLikeFormula(cleanedPageText) || countMathSignals(cleanedPageText) >= 1)) {
    console.log("[TRACE normalizeClinicalText]", { pageKind, shouldRenderFullPanel: true, refusalReason: null, canonicalCount: dedupedStatements.length, wordCount: wordCount(cleanedPageText) });
    return {
      pageKind,
      shouldRenderFullPanel: true,
      refusalReason: null,
      canonicalStatements: dedupedStatements,
      dominantSignal: dedupedStatements[0]?.normalizedText ?? null,
      coreIdea: null,
      mechanism: null,
      warning: null,
      applicationRule: null,
      formulas: uniqueStrings(formulas),
      thresholds: uniqueStrings(thresholds),
    };
  }

  // Pages with instructional signals need only 1 canonical statement to render.
  // Hard-topic textbook pages often produce few but high-quality statements.
  const minStatements = hasInstructionalSignals(cleanedPageText.toLowerCase())
    ? 1
    : MIN_CANONICAL_STATEMENTS;
  if (dedupedStatements.length < minStatements) {
    console.log("[TRACE normalizeClinicalText]", { pageKind, shouldRenderFullPanel: false, refusalReason: "insufficient_normalized_signal", canonicalCount: dedupedStatements.length, wordCount: wordCount(cleanedPageText) });
    return {
      pageKind,
      shouldRenderFullPanel: false,
      refusalReason: "insufficient_normalized_signal",
      canonicalStatements: [],
      dominantSignal: null,
      coreIdea: null,
      mechanism: null,
      warning: null,
      applicationRule: null,
      formulas: uniqueStrings(formulas),
      thresholds: uniqueStrings(thresholds),
    };
  }

  const ranked = [...dedupedStatements].sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.normalizedText.length - b.normalizedText.length;
  });

  console.log("[TRACE normalizeClinicalText]", { pageKind, shouldRenderFullPanel: true, refusalReason: null, canonicalCount: ranked.length, wordCount: wordCount(cleanedPageText) });
  return {
    pageKind,
    shouldRenderFullPanel: true,
    refusalReason: null,
    canonicalStatements: ranked,
    dominantSignal: firstByRoles(ranked, [
      "definition", "clinical_rule", "mathematical_rule", "consequence", "supporting_fact",
    ]),
    coreIdea: firstByRoles(ranked, [
      "definition", "clinical_rule", "mathematical_rule", "supporting_fact",
    ]),
    mechanism: firstByRoles(ranked, [
      "mechanism", "consequence", "procedure_step", "interpretation",
    ]),
    warning: firstByRoles(ranked, ["warning", "distinction", "threshold"]),
    applicationRule: firstByRoles(ranked, [
      "clinical_rule", "mathematical_rule", "consequence", "procedure_step",
    ]),
    formulas: uniqueStrings(formulas),
    thresholds: uniqueStrings(thresholds),
  };
}

/* -------------------------------------------------------------------------- */
/*                            PAGE CLASSIFICATION                              */
/* -------------------------------------------------------------------------- */

interface PageClassificationInput {
  text: string;
  pageTitle?: string | null;
  headingLines: string[];
  imageCoverageRatio: number;
  tableCoverageRatio: number;
  graphCoverageRatio: number;
  diagramCoverageRatio: number;
}

export function classifyPageKind(input: PageClassificationInput): PageKind {
  const text = input.text.toLowerCase();
  const words = wordCount(text);
  const sentenceCount = splitSentences(text).length;
  const headingWords = input.headingLines.join(" ").trim().split(/\s+/).filter(Boolean).length;

  if (
    /\bcopyright\b|\bisbn\b|\bpermissions\b|\bcontributor\b|\bpublisher\b|\blibrary of congress\b/.test(text)
  ) return "front_matter";

  if (
    /\bchapter outline\b|\bcontents\b|\bpart\b\s+\d+\b/.test(text) && words < 90
  ) return "chapter_title";

  // Chapter opener: page text starts with "chapter N" and has sparse prose
  if (/^chapter\s+\d+\b/.test(text.trim()) && words < 180 && sentenceCount < 5) return "chapter_title";

  // Overview / summary / learning-objectives pages — always suppress regardless of vocab.
  // These structural signposts never carry teachable prose dense enough to render.
  if (
    /\b(key concepts?|learning objectives?|chapter overview|unit overview|chapter summary|section summary|objectives?)\b/.test(text) &&
    words < 250 &&
    sentenceCount < 7
  ) return "chapter_title";

  // Numbered section header: "3.2 Photosynthesis" or "Section 4.1 ATP" with sparse prose
  const firstLine = input.text.trim().split(/\n/).map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  if (
    (/^\d+\.\d+(\.\d+)?\s+\S/.test(firstLine) || /^section\s+\d+\.\d+\b/i.test(firstLine)) &&
    words < 150 &&
    sentenceCount < 4
  ) return "section_title";

  // Heading-heavy page: majority of words are in headings, very few complete sentences
  if (
    input.headingLines.length >= 3 &&
    words > 0 &&
    headingWords / words > 0.55 &&
    sentenceCount < 5
  ) return "chapter_title";

  // Figure-caption-heavy page: many lines that start with "Figure / Fig. / Table / Diagram"
  // Uses raw text (not lowercased) for line-level detection independent of coverage ratios.
  const rawLines = input.text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const captionLineCount = rawLines.filter((l) =>
    /^(figure|fig\.|table|diagram|image|exhibit)\s*[\dA-Za-z]/i.test(l)
  ).length;
  if (rawLines.length >= 4 && captionLineCount / rawLines.length >= 0.35) return "image_only";

  if (input.imageCoverageRatio > 0.82 && words < 25) return "image_only";
  if (input.graphCoverageRatio > 0.72 && sentenceCount < 2) return "graph_only";
  if (input.diagramCoverageRatio > 0.7 && words < 35) return "diagram_only";
  if (input.tableCoverageRatio > 0.68 && sentenceCount < 2) return "table_heavy";

  if (
    /\byes\b\s+\bno\b/.test(text) &&
    /\blast name\b|\bfirst name\b|\bsymptoms\b|\bplease check\b/.test(text)
  ) return "questionnaire_form";

  // Unambiguous calculus symbols/terms → math without counting
  if (/[∫∑∂∇]|dy\/dx|d[xyz]\/d[xyz]|\b(derivative|integral|calculus|antiderivative|chain rule|related rates)\b/i.test(text)) return "mathematical_exposition";
  // Strong single-word math vocabulary that unambiguously identifies calc/precalc content.
  // "rates of change" removed — it fires on clinical phrases like "rate of bone loss" or
  // "rate of change in pocket depth". Moved to weak signals (countMathSignals).
  if (/\b(limits?|sequences?|converge[sd]?|diverge[sd]?|derivatives?|tangent\s+line|slope|instantaneous|antiderivative|differential)\b/i.test(text)) return "mathematical_exposition";
  // Weaker signals: require ≥3 independent hits to avoid false positives on clinical/science
  // text. A dental page with "function of treatment", "series of X-rays", "bounded by tissue"
  // previously hit this gate with a single token. Threshold raised from 1→3.
  if (countMathSignals(text) >= 3) return "mathematical_exposition";

  if (
    /\bpatient\b|\bclinician\b|\bdiagnosis\b|\btreatment\b|\bsymptoms\b|\bclinical\b|\bchief complaint\b/.test(text)
  ) return "clinical_narrative";

  if (
    /\batom\b|\belectron\b|\bcell\b|\benergy\b|\breaction\b|\bmechanism\b|\bphotosynthesis\b|\bdna\b/.test(text)
  ) return "scientific_exposition";

  if (words < MIN_PROSE_WORDS || sentenceCount < MIN_SENTENCES) {
    // Only suppress when there are no recognizable instructional signals.
    // Textbook pages with figures or sparse layout often have low prose density
    // but still carry real learning content.
    if (!hasInstructionalSignals(text)) {
      if (headingWords < 18 && words < 70) return "chapter_title";
      return "insufficient_prose";
    }
    // Instructional signals present — fall through to instructional_prose
  }

  return "instructional_prose";
}

function shouldRenderPageKind(pageKind: PageKind, pageText: string, sentences: string[]): boolean {
  if (
    pageKind === "front_matter" ||
    pageKind === "chapter_title" ||
    pageKind === "section_title" ||
    pageKind === "diagram_only" ||
    pageKind === "image_only" ||
    pageKind === "graph_only" ||
    pageKind === "questionnaire_form" ||
    pageKind === "insufficient_prose"
  ) return false;
  // Instructional signal override: render even when prose is sparse.
  // Textbook pages with figures, headers, or split-column layout often have
  // fewer words/sentences than the threshold but still contain real learning content.
  if (hasInstructionalSignals(pageText.toLowerCase())) return true;
  if (wordCount(pageText) < MIN_PROSE_WORDS) return false;
  if (sentences.length < MIN_SENTENCES) return false;
  return true;
}

function refusalReasonForPageKind(pageKind: PageKind): string {
  const reasons: Partial<Record<PageKind, string>> = {
    front_matter: "front_matter",
    chapter_title: "chapter_title",
    section_title: "section_title",
    diagram_only: "diagram_only",
    image_only: "image_only",
    graph_only: "graph_only",
    questionnaire_form: "questionnaire_form",
    insufficient_prose: "insufficient_prose",
  };
  return reasons[pageKind] ?? "non_renderable_page";
}

/* -------------------------------------------------------------------------- */
/*                          SENTENCE NORMALIZATION                             */
/* -------------------------------------------------------------------------- */

function normalizeSentence(sentence: string, pageKind: PageKind): string {
  let s = cleanLocal(sentence);
  if (!s) return "";

  s = normalizeFormulaText(s);
  s = s
    .replace(/\bultimately\b/gi, "")
    .replace(/\bin essence\b/gi, "")
    .replace(/\btherefore\b,?\s*/gi, "")
    .replace(/\bmoreover\b,?\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (pageKind === "clinical_narrative") s = normalizeClinicalDirective(s);
  if (pageKind === "scientific_exposition" || pageKind === "instructional_prose") s = normalizeScientificRule(s);
  if (pageKind === "mathematical_exposition") s = normalizeMathematicalRule(s);

  return cleanLocal(s);
}

function normalizeClinicalDirective(text: string): string {
  return text
    .replace(/\bthe clinician should\b/gi, "The clinician must")
    .replace(/\bthe patient should\b/gi, "The patient must")
    .replace(
      /\bthis will directly relate to what treatment, if any, will be necessary\b/gi,
      "Diagnosis determines treatment decisions"
    )
    .replace(
      /\bwithout these direct and unbiased comments\b/gi,
      "Without unbiased patient input"
    )
    .replace(
      /\bit may not contribute to the pathologic condition that mediates the patient's chief complaint\b/gi,
      "A finding may be present without causing the chief complaint"
    );
}

function normalizeScientificRule(text: string): string {
  return text
    .replace(
      /\bthe atomic number indicates how many protons there are\b/gi,
      "Atomic number defines proton count"
    )
    .replace(
      /\bwe can determine the number of neutrons by subtracting the atomic number from the mass number\b/gi,
      "Neutrons equal mass number minus atomic number"
    )
    .replace(
      /\bwhen radioactive decay leads to a change in the number of protons.*?different element\b/gi,
      "Changing proton count changes elemental identity"
    )
    .replace(
      /\belectrons.{0,60}can ignore electrons when computing the total mass of an atom\b/gi,
      "Electrons can be ignored when calculating atomic mass"
    );
}

function normalizeMathematicalRule(text: string): string {
  return normalizeFormulaText(text)
    .replace(/\bif and only if\b/gi, "exactly when")
    .replace(/\bhence\b/gi, "Therefore");
}

/* -------------------------------------------------------------------------- */
/*                             ROLE INFERENCE                                  */
/* -------------------------------------------------------------------------- */

function inferStatementRole(text: string, pageKind: PageKind): CanonicalStatementRole {
  const lower = text.toLowerCase();

  if (looksLikeFormula(text)) return "formula";
  if (looksLikeThreshold(text)) return "threshold";

  if (/\bmust\b|\bshould\b|\brequires\b|\bdiagnosis determines\b|\buse\b|\bapply\b/.test(lower))
    return pageKind === "mathematical_exposition" ? "mathematical_rule" : "clinical_rule";

  if (/\bbecause\b|\bdue to\b|\bleads to\b|\bresults in\b|\bcauses\b|\bchanges\b/.test(lower))
    return "mechanism";

  if (/\bdo not confuse\b|\bwarning\b|\bmistake\b|\bmisunderstand\b|\bmay be present without\b/.test(lower))
    return "warning";

  if (/\bcontrast\b|\bdistinction\b|\brather than\b|\bdifferent from\b/.test(lower))
    return "distinction";

  if (/\bdefine\b|\bmeans\b|\bis defined as\b|\brefers to\b|\bindicates\b|\brepresents\b/.test(lower))
    return pageKind === "mathematical_exposition" ? "mathematical_rule" : "definition";

  if (/\bfirst\b|\bnext\b|\bthen\b|\bfinally\b|\bstep\b/.test(lower))
    return "procedure_step";

  if (/\bwhat\b|\bhow\b|\bwhen\b|\bwhy\b/.test(lower) && /\?$/.test(text))
    return "question_prompt";

  if (/\bultimately\b|\bso\b|\bthus\b|\bconsequently\b/.test(lower))
    return "consequence";

  if (pageKind === "mathematical_exposition") return "mathematical_rule";
  if (pageKind === "clinical_narrative") return "interpretation";
  return "supporting_fact";
}

/* -------------------------------------------------------------------------- */
/*                              SCORING / FILTERS                              */
/* -------------------------------------------------------------------------- */

function scoreStatement(text: string, role: CanonicalStatementRole, pageKind: PageKind): number {
  let score = 0.5;

  switch (role) {
    case "definition":
    case "clinical_rule":
    case "mathematical_rule": score += 0.24; break;
    case "mechanism":         score += 0.22; break;
    case "warning":
    case "distinction":       score += 0.18; break;
    case "threshold":
    case "formula":           score += 0.16; break;
    case "procedure_step":    score += 0.12; break;
    default:                  score += 0.06;
  }

  const words = text.split(/\s+/).length;
  if (words >= 6 && words <= 24) score += 0.08;
  if (/\d/.test(text)) score += 0.04;
  if (looksLikeFormula(text)) score += 0.08;

  if (
    pageKind === "clinical_narrative" &&
    /\bpatient\b|\bclinician\b|\bdiagnosis\b|\btreatment\b/.test(text.toLowerCase())
  ) score += 0.06;

  if (pageKind === "mathematical_exposition" && countMathSignals(text) >= 2) score += 0.08;

  return Math.min(score, 0.98);
}

function isRenderableCanonicalStatement(text: string, role: CanonicalStatementRole): boolean {
  if (!text) return false;
  if (role === "formula" || role === "threshold") return text.length >= 4;
  if (text.length < 24) return false;
  if (text.split(/\s+/).length < 5) return false;
  // Reject chapter-outline-like fragments
  if (
    /\bchapter\s+\d+\b/i.test(text) &&
    countCapitalizedTokens(text) > 5 &&
    !/[.!?]$/.test(text)
  ) return false;
  return true;
}

function dedupeCanonicalStatements(statements: CanonicalStatement[]): CanonicalStatement[] {
  const kept: CanonicalStatement[] = [];
  for (const stmt of statements.sort((a, b) => b.confidence - a.confidence)) {
    if (isDistinctEnough(stmt.normalizedText, kept.map((k) => k.normalizedText), 0.74)) {
      kept.push(stmt);
    }
  }
  return kept.sort((a, b) => (a.sourceSentenceIndex ?? 0) - (b.sourceSentenceIndex ?? 0));
}

/* -------------------------------------------------------------------------- */
/*                        FORMULA / MATH PRESERVATION                          */
/* -------------------------------------------------------------------------- */

export function looksLikeFormula(text: string): boolean {
  return (
    /[=<>±∫∑√π∞]/.test(text) ||
    /\b[a-zA-Z]\([a-zA-Z]\)\s*=/.test(text) ||
    /\bdy\/dx\b|\bdx\b|\bdf\/dx\b/.test(text) ||
    /\blim\s*[_({]/i.test(text) ||
    /\b\d+(\.\d+)?\s*(mg|g|kg|mm|cm|m|km|ml|mL|L|%|°c|°f)\b/i.test(text) ||
    /\b[a-zA-Z]\s*=\s*[-+/*()[\].\w^]+/.test(text)
  );
}

export function looksLikeThreshold(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    /\bgreater than\b|\bless than\b|\bmore than\b|\bat least\b|\bat most\b/.test(lower) ||
    /[<>]=?\s*\d/.test(text) ||
    /\bbetween\s+\d+\s+and\s+\d+\b/.test(lower) ||
    /\b\d+(\.\d+)?\s*(mg|g|kg|mm|cm|ml|mL|L|%)\b/i.test(text)
  );
}

export function normalizeFormulaText(text: string): string {
  return (text ?? "")
    .replace(/\s*=\s*/g, " = ")
    .replace(/\s*<\s*/g, " < ")
    .replace(/\s*>\s*/g, " > ")
    .replace(/\s*≤\s*/g, " ≤ ")
    .replace(/\s*≥\s*/g, " ≥ ")
    .replace(/\s*±\s*/g, " ± ")
    .replace(/\s+/g, " ")
    .trim();
}

/* -------------------------------------------------------------------------- */
/*                                 EXTRACTION                                  */
/* -------------------------------------------------------------------------- */

function firstByRoles(statements: CanonicalStatement[], roles: CanonicalStatementRole[]): string | null {
  for (const role of roles) {
    const found = statements.find((s) => s.role === role);
    if (found) return found.normalizedText;
  }
  return statements[0]?.normalizedText ?? null;
}

function findParagraphIndex(sentence: string, paragraphs: string[]): number {
  const normSentence = normalizeTokens(sentence).slice(0, 36);
  for (let i = 0; i < paragraphs.length; i++) {
    if (normalizeTokens(paragraphs[i]).includes(normSentence)) return i;
  }
  return 0;
}

/* -------------------------------------------------------------------------- */
/*                                    UTILS                                    */
/* -------------------------------------------------------------------------- */

function cleanPageText(text: string): string {
  return (text ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanLocal(text: string): string {
  const cleaned = (text ?? "")
    .replace(/\s+/g, " ")
    .replace(/\s*-\s*/g, " ")
    .replace(/\s*–\s*/g, " ")
    .replace(/\s*—\s*/g, " — ")
    .trim();
  if (!cleaned) return "";
  return /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`;
}

function splitParagraphs(text: string): string[] {
  return (text ?? "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
}

function splitSentences(text: string): string[] {
  if (!text.trim()) return [];
  return text
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9(])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function wordCount(text: string): number {
  return (text ?? "").trim().split(/\s+/).filter(Boolean).length;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value.trim());
  }
  return out;
}

function normalizeTokens(text: string): string {
  return (text ?? "").toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

function tokenSimilarity(a: string, b: string): number {
  const aTokens = new Set(normalizeTokens(a).split(" ").filter(Boolean));
  const bTokens = new Set(normalizeTokens(b).split(" ").filter(Boolean));
  if (!aTokens.size || !bTokens.size) return 0;
  let overlap = 0;
  for (const token of aTokens) { if (bTokens.has(token)) overlap++; }
  const union = new Set([...aTokens, ...bTokens]).size;
  return union ? overlap / union : 0;
}

function isDistinctEnough(text: string, existing: string[], threshold: number): boolean {
  for (const prior of existing) {
    if (tokenSimilarity(text, prior) >= threshold) return false;
  }
  return true;
}

function countMathSignals(text: string): number {
  const patterns = [
    /[=<>±∫∑√π∞→≤≥≠∈]/,
    /\bderivative\b/i, /\bintegral\b/i, /\blimits?\b/i,
    /\bfunction\b/i,  /\btheorem\b/i,  /\bproof\b/i,
    /\bdy\/dx\b/i,    /\bf\(x\)\b/i,   /\blim\b/i,
    /\bchain rule\b/i, /\brelated rates\b/i,
    /\bproduct rule\b/i, /\bquotient rule\b/i,
    /\bextrem[au]\b/i, /\bconcavity\b/i, /\bantiderivative\b/i,
    /\bd\/d[txyz]\b/i,
    // Sequence / series / convergence vocabulary (plural forms included)
    /\bsequences?\b/i, /\bconverge[sd]?\b/i, /\bdiverge[sd]?\b/i,
    /\bmonoton\w+\b/i, /\bseries\b/i, /\bbounded\b/i,
  ];
  return patterns.reduce((n, p) => n + (p.test(text) ? 1 : 0), 0);
}

function countCapitalizedTokens(text: string): number {
  return (text.match(/\b[A-Z][a-zA-Z]+\b/g) ?? []).length;
}
