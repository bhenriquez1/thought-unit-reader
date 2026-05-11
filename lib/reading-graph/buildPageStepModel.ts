// lib/reading-graph/buildPageStepModel.ts
//
// Shared current-page step model builder.
// This is the unification layer that both the left badge path and the right concept blocks
// should eventually consume from the same current-page structure.
//
// Intent:
// - Left = visual guided path
// - Right = cognitive explanation path
// - Mini Test = page-native questioning path
// - STR Compression = distilled rule path
//
// All should originate from this same current-page step model.

export type PageStepRole =
  | "main_signal"
  | "explanation"
  | "support"
  | "deepening"
  | "trap";

export interface ConceptBlockInput {
  id: string;
  title?: string | null;
  pattern?: string | null;
  surgicalReason?: string | null;
  trap?: string | null;
  rule?: string | null;
  importance?: string | null;
}

export interface HighlightNeighborhoodMemberInput {
  id: string;
  text: string;
}

export interface HighlightNeighborhoodInput {
  id: string;
  conceptId?: string;
  title?: string;
  anchor?: HighlightNeighborhoodMemberInput | null;
  support?: HighlightNeighborhoodMemberInput[];
  additional?: HighlightNeighborhoodMemberInput[];
  trap?: HighlightNeighborhoodMemberInput | null;
}

export interface SupportNeighborhoodInput {
  id: string;
  title?: string | null;
  anchor?: string | null;
  support?: string[];
  additional?: string[];
  trap?: string | null;
}

export type StepModelPageDomain = "math" | "science" | "clinical" | "fiction" | "general";

export interface BuildPageStepModelInput {
  pageKey: string;
  pageTitle?: string | null;
  pageSummary?: string | null;
  conceptBlocks: ConceptBlockInput[];
  highlightNeighborhoods: HighlightNeighborhoodInput[];
  supportNeighborhoods?: SupportNeighborhoodInput[];
  domain?: StepModelPageDomain;
  symbolicDensity?: "high" | "low";
}

export interface PageStepLeftView {
  neighborhoodId?: string;
  memberIds: string[];
  badgeLabel: string;
  legendLabel: string;
}

export interface PageStepRightView {
  title: string;
  pattern?: string | null;
  surgicalReason?: string | null;
  trap?: string | null;
  rule?: string | null;
  importance?: string | null;
}

export interface PageStepMiniTestHooks {
  coreMeaning?: string | null;
  mechanism?: string | null;
  distinction?: string | null;
  application?: string | null;
  skimTrap?: string | null;
  whatHappensIf?: string | null;
  nextStep?: string | null;
  compareContrast?: string | null;
}

export interface PageStepCompressionHooks {
  recognitionHook?: string | null;
  mechanismHook?: string | null;
  applicationHook?: string | null;
  boundaryHook?: string | null;
}

export interface PageStepModel {
  id: string;
  order: number;
  role: PageStepRole;
  title: string;
  anchorText: string;
  supportTexts: string[];
  additionalTexts: string[];
  trapText?: string | null;
  left: PageStepLeftView;
  right: PageStepRightView;
  miniTest: PageStepMiniTestHooks;
  compression: PageStepCompressionHooks;
}

export interface BuildPageStepModelResult {
  pageKey: string;
  pageTitle?: string | null;
  pageSummary?: string | null;
  steps: PageStepModel[];
}

/**
 * Builds a current-page step model from neighborhoods and concept blocks.
 *
 * Strategy:
 * 1. Use highlight neighborhoods as the canonical step sequence
 * 2. Enrich each step with matching concept block content
 * 3. Infer a role per step
 * 4. Emit an ordered shared steps[] that both left and right can consume
 */
export function buildPageStepModel(
  input: BuildPageStepModelInput
): BuildPageStepModelResult {
  const normalizedNeighborhoods = normalizeHighlightNeighborhoods(
    input.highlightNeighborhoods
  );
  const normalizedBlocks = normalizeConceptBlocks(input.conceptBlocks);
  const steps: PageStepModel[] = normalizedNeighborhoods.map((neighborhood, index) => {
    const conceptBlock = findBestConceptBlockMatch(neighborhood, normalizedBlocks);
    const supportNeighborhood = findBestSupportNeighborhoodMatch(
      neighborhood,
      input.supportNeighborhoods ?? []
    );

    const title =
      cleanLocal(
        neighborhood.title ||
          conceptBlock?.title ||
          inferTitleFromAnchor(neighborhood.anchorText) ||
          `Step ${index + 1}`
      ) || `Step ${index + 1}`;

    const role = inferStepRole({ index, neighborhood, conceptBlock, supportNeighborhood });

    const anchorText =
      neighborhood.anchorText ||
      conceptBlock?.pattern ||
      supportNeighborhood?.anchor ||
      input.pageSummary ||
      "";

    const supportTexts = uniqueNonEmpty([
      ...neighborhood.supportTexts,
      ...(supportNeighborhood?.support ?? []),
      conceptBlock?.surgicalReason ?? "",
    ]);

    const additionalTexts = uniqueNonEmpty([
      ...neighborhood.additionalTexts,
      ...(supportNeighborhood?.additional ?? []),
    ]);

    const trapText =
      neighborhood.trapText ||
      supportNeighborhood?.trap ||
      conceptBlock?.trap ||
      null;

    return {
      id: `${input.pageKey}:step:${index + 1}`,
      order: index + 1,
      role,
      title,
      anchorText: cleanLocal(anchorText),
      supportTexts: supportTexts.map(cleanLocal).filter(Boolean),
      additionalTexts: additionalTexts.map(cleanLocal).filter(Boolean),
      trapText: trapText ? cleanLocal(trapText) : null,
      left: {
        neighborhoodId: neighborhood.id,
        memberIds: neighborhood.memberIds,
        badgeLabel: badgeLabelForStep(index + 1, role),
        legendLabel: legendLabelForRole(role),
      },
      right: {
        title,
        pattern: cleanNullable(
          conceptBlock?.pattern || neighborhood.anchorText || supportNeighborhood?.anchor
        ),
        surgicalReason: cleanNullable(
          conceptBlock?.surgicalReason || supportTexts[0] || null
        ),
        trap: cleanNullable(trapText),
        rule: cleanNullable(conceptBlock?.rule || synthesizeRuleFromStepText(anchorText, supportTexts)),
        importance: cleanNullable(conceptBlock?.importance || importanceForRole(role)),
      },
      miniTest: {
        coreMeaning: buildCoreMeaningHook(title, anchorText, input.domain, input.symbolicDensity),
        mechanism: buildMechanismHook(title, conceptBlock?.surgicalReason || supportTexts[0], input.domain, input.symbolicDensity),
        distinction: buildDistinctionHook(title, trapText, anchorText, input.domain, input.symbolicDensity),
        application: buildApplicationHook(title, conceptBlock?.rule || supportTexts[0], input.domain, input.symbolicDensity),
        skimTrap: buildSkimTrapHook(title, trapText, anchorText, input.domain, input.symbolicDensity),
        whatHappensIf: buildPageNativeQuestion("whatHappensIf", anchorText, input.domain, input.symbolicDensity) || null,
        nextStep: buildPageNativeQuestion("nextStep", anchorText, input.domain, input.symbolicDensity) || null,
        compareContrast: buildPageNativeQuestion("compareContrast", trapText || anchorText, input.domain, input.symbolicDensity) || null,
      },
      compression: {
        recognitionHook: cleanNullable(anchorText),
        mechanismHook: cleanNullable(conceptBlock?.surgicalReason || supportTexts[0]),
        applicationHook: cleanNullable(conceptBlock?.rule || supportTexts[0]),
        boundaryHook: cleanNullable(trapText),
      },
    };
  });

  return {
    pageKey: input.pageKey,
    pageTitle: input.pageTitle ?? null,
    pageSummary: input.pageSummary ?? null,
    steps,
  };
}

/* -------------------------------------------------------------------------- */
/*                             NORMALIZATION                                  */
/* -------------------------------------------------------------------------- */

interface NormalizedHighlightNeighborhood {
  id: string;
  title?: string;
  conceptId?: string;
  anchorText: string;
  supportTexts: string[];
  additionalTexts: string[];
  trapText?: string | null;
  memberIds: string[];
}

interface NormalizedConceptBlock {
  id: string;
  title?: string | null;
  pattern?: string | null;
  surgicalReason?: string | null;
  trap?: string | null;
  rule?: string | null;
  importance?: string | null;
}

function normalizeHighlightNeighborhoods(
  neighborhoods: HighlightNeighborhoodInput[]
): NormalizedHighlightNeighborhood[] {
  return neighborhoods.map((n) => ({
    id: n.id,
    title: n.title,
    conceptId: n.conceptId,
    anchorText: cleanLocal(n.anchor?.text || ""),
    supportTexts: uniqueNonEmpty((n.support ?? []).map((m) => cleanLocal(m.text))),
    additionalTexts: uniqueNonEmpty((n.additional ?? []).map((m) => cleanLocal(m.text))),
    trapText: n.trap?.text ? cleanLocal(n.trap.text) : null,
    memberIds: uniqueNonEmpty([
      n.anchor?.id ?? "",
      ...(n.support ?? []).map((m) => m.id),
      ...(n.additional ?? []).map((m) => m.id),
      n.trap?.id ?? "",
    ]),
  }));
}

function normalizeConceptBlocks(blocks: ConceptBlockInput[]): NormalizedConceptBlock[] {
  return blocks.map((b) => ({
    id: b.id,
    title: cleanNullable(b.title),
    pattern: cleanNullable(b.pattern),
    surgicalReason: cleanNullable(b.surgicalReason),
    trap: cleanNullable(b.trap),
    rule: cleanNullable(b.rule),
    importance: cleanNullable(b.importance),
  }));
}

/* -------------------------------------------------------------------------- */
/*                                  MATCHING                                  */
/* -------------------------------------------------------------------------- */

function findBestConceptBlockMatch(
  neighborhood: NormalizedHighlightNeighborhood,
  blocks: NormalizedConceptBlock[]
): NormalizedConceptBlock | null {
  if (!blocks.length) return null;
  let best: NormalizedConceptBlock | null = null;
  let bestScore = -1;
  const needle = [neighborhood.title, neighborhood.anchorText, neighborhood.trapText]
    .filter(Boolean)
    .join(" ");
  for (const block of blocks) {
    const hay = [block.title, block.pattern, block.rule, block.trap].filter(Boolean).join(" ");
    const score = semanticOverlapScore(needle, hay);
    if (score > bestScore + 0.02) {
      best = block; bestScore = score;
    } else if (Math.abs(score - bestScore) <= 0.02 && score > 0) {
      // Tie-break: prefer the block with more specific content (longer pattern)
      const existingLen = (best?.pattern ?? best?.title ?? "").split(/\s+/).length;
      const candidateLen = (block.pattern ?? block.title ?? "").split(/\s+/).length;
      if (candidateLen > existingLen) { best = block; bestScore = score; }
    }
  }
  return best;
}

function findBestSupportNeighborhoodMatch(
  neighborhood: NormalizedHighlightNeighborhood,
  supportNeighborhoods: SupportNeighborhoodInput[]
): SupportNeighborhoodInput | null {
  if (!supportNeighborhoods.length) return null;
  let best: SupportNeighborhoodInput | null = null;
  let bestScore = -1;
  const needle = [neighborhood.title, neighborhood.anchorText, neighborhood.trapText]
    .filter(Boolean)
    .join(" ");
  for (const candidate of supportNeighborhoods) {
    const hay = [
      candidate.title, candidate.anchor,
      ...(candidate.support ?? []), ...(candidate.additional ?? []), candidate.trap,
    ].filter(Boolean).join(" ");
    const score = semanticOverlapScore(needle, hay);
    if (score > bestScore) { best = candidate; bestScore = score; }
  }
  return best;
}

/* -------------------------------------------------------------------------- */
/*                                 ROLE LOGIC                                 */
/* -------------------------------------------------------------------------- */

function inferStepRole(args: {
  index: number;
  neighborhood: NormalizedHighlightNeighborhood;
  conceptBlock: NormalizedConceptBlock | null;
  supportNeighborhood: SupportNeighborhoodInput | null;
}): PageStepRole {
  const combined = [
    args.neighborhood.anchorText,
    ...(args.neighborhood.supportTexts ?? []),
    args.neighborhood.trapText ?? "",
    args.conceptBlock?.pattern ?? "",
    args.conceptBlock?.surgicalReason ?? "",
    args.conceptBlock?.trap ?? "",
    args.conceptBlock?.rule ?? "",
    args.supportNeighborhood?.anchor ?? "",
    ...(args.supportNeighborhood?.support ?? []),
    ...(args.supportNeighborhood?.additional ?? []),
    args.supportNeighborhood?.trap ?? "",
  ].filter(Boolean).join(" ").toLowerCase();

  if (
    combined.includes("do not confuse") ||
    combined.includes("rather than") ||
    combined.includes("trap") ||
    combined.includes("mistake") ||
    combined.includes("warning")
  ) return "trap";

  if (
    combined.includes("because") ||
    combined.includes("therefore") ||
    combined.includes("due to") ||
    combined.includes("leads to") ||
    combined.includes("results in")
  ) return args.index === 0 ? "main_signal" : "explanation";

  if (
    combined.includes("for example") ||
    combined.includes("such as") ||
    combined.includes("in addition") ||
    combined.includes("also")
  ) return "deepening";

  // Clinical signals
  if (
    combined.includes("the clinician must") ||
    combined.includes("diagnosis determines") ||
    combined.includes("chief complaint") ||
    combined.includes("treatment decision")
  ) return args.index === 0 ? "main_signal" : "explanation";

  // Scientific consequence signals
  if (
    (combined.includes("when") && (combined.includes("changes") || combined.includes("transforms"))) ||
    combined.includes("this means") ||
    combined.includes("as a result")
  ) return args.index === 0 ? "main_signal" : "explanation";

  // Operational/application signals
  if (
    combined.includes("we can") ||
    combined.includes("you can") ||
    combined.includes("one can") ||
    combined.includes("can be used")
  ) return args.index <= 1 ? "explanation" : "deepening";

  if (args.index === 0) return "main_signal";
  if (args.index === 1) return "explanation";
  return "support";
}

/* -------------------------------------------------------------------------- */
/*                             LEFT/RIGHT HELPERS                             */
/* -------------------------------------------------------------------------- */

function badgeLabelForStep(stepNumber: number, role: PageStepRole): string {
  return role === "trap" ? "!" : String(stepNumber);
}

function legendLabelForRole(role: PageStepRole): string {
  switch (role) {
    case "main_signal":  return "Main Signal — Start here";
    case "explanation":  return "Explains It";
    case "support":      return "Support / Continuation";
    case "deepening":    return "Extra Context / Deepening";
    case "trap":         return "Do Not Confuse / Final Check";
    default:             return "Guided Step";
  }
}

function importanceForRole(role: PageStepRole): string {
  switch (role) {
    case "main_signal":  return "VERY HIGH";
    case "explanation":  return "HIGH";
    case "support":      return "HIGH";
    case "deepening":    return "MEDIUM";
    case "trap":         return "HIGH";
    default:             return "HIGH";
  }
}

/* -------------------------------------------------------------------------- */
/*                            MINI TEST HOOKS                                 */
/* -------------------------------------------------------------------------- */

function extractSubjectPhrase(text: string, maxWords = 8): string {
  const words = (text || "").replace(/[.!?]+$/, "").split(/\s+/).filter(Boolean);
  // Cut at the first main verb to isolate the subject noun phrase
  const verbIdx = words.findIndex(
    (w, i) =>
      i >= 2 &&
      /^(is|are|was|were|has|have|can|could|will|would|should|must|means?|determines?|causes?|leads?|refers?|contains?|includes?|represents?|defines?|consists?)\b/i.test(w)
  );
  const cutAt = verbIdx >= 2 && verbIdx <= maxWords ? verbIdx : Math.min(maxWords, words.length);
  let subject = words.slice(0, cutAt).join(" ").replace(/^(The|A|An)\s+/i, "").trim();
  // Strip trailing modal verbs that belong to the predicate, not the subject
  subject = subject.replace(/\s+(may|can|could|should|must|will|would|might)\s*$/i, "").trim();
  // Reject overly long or modal-contaminated subjects
  if (subject.split(/\s+/).length > 6) subject = subject.split(/\s+/).slice(0, 5).join(" ");
  if (/\b(may|can|could|should|must|will|would|might)\b/i.test(subject)) return "";
  return subject;
}

function buildPageNativeQuestion(role: string, text: string, domain?: StepModelPageDomain, symbolicDensity?: "high" | "low"): string {
  if (!text) return "";
  const stem = (text || "").replace(/[.!?]+$/, "").trim();
  if (!stem) return "";
  const rawSubject = extractSubjectPhrase(stem, 8);
  // Reject if subject extraction failed or subject is contaminated with modals
  if (!rawSubject || /\b(may|can|could|should|must|will|would|might)\b/i.test(rawSubject)) return "";
  const subject = rawSubject || stem.split(/\s+/).slice(0, 5).join(" ");

  // On high-symbolic-density math pages, reject prose-fragment subjects
  if (domain === "math" && symbolicDensity === "high") {
    if (/\bExample\b|\b[Ee]\d\b/i.test(rawSubject)) return "";
    if (rawSubject.split(/\s+/).length < 2) return "";
    if (!/[=∑∫→∞αβγ]|lim\b|aₙ|\b[a-z]_n\b/.test(stem) && rawSubject.split(/\s+/).length <= 2) return "";
  }

  // Domain-specific question templates produce more pedagogically precise questions.
  if (domain === "fiction") {
    switch (role) {
      case "coreMeaning":     return cleanLocal(`What did ${subject} do and why did it matter to the scene`);
      case "mechanism":       return cleanLocal(`What caused ${subject} to change or act`);
      case "distinction":     return cleanLocal(`How does ${subject} contrast with what came before`);
      case "application":     return cleanLocal(`What does ${subject} reveal about character or situation`);
      case "skimTrap":        return cleanLocal(`What assumption does a reader risk making about ${subject}`);
      case "whatHappensIf":   return cleanLocal(`What changes in the story if ${subject} does not occur`);
      case "nextStep":        return cleanLocal(`What immediately follows from ${subject}`);
      case "compareContrast": return cleanLocal(`How does ${subject} differ from the character's earlier state`);
      default:                return cleanLocal(stem.split(/\s+/).slice(0, 12).join(" "));
    }
  }
  if (domain === "math") {
    switch (role) {
      case "coreMeaning":     return cleanLocal(`What does ${subject} converge to or represent`);
      case "mechanism":       return cleanLocal(`What condition causes ${subject} to converge or diverge`);
      case "distinction":     return cleanLocal(`How does ${subject} differ from a divergent sequence`);
      case "application":     return cleanLocal(`How would you determine whether ${subject} converges`);
      case "skimTrap":        return cleanLocal(`What common mistake arises when applying ${subject}`);
      case "whatHappensIf":   return cleanLocal(`What happens to the sequence if ${subject} fails`);
      case "nextStep":        return cleanLocal(`What is the next step after establishing ${subject}`);
      case "compareContrast": return cleanLocal(`How does ${subject} compare to a divergent counterpart`);
      default:                return cleanLocal(stem.split(/\s+/).slice(0, 12).join(" "));
    }
  }
  if (domain === "science") {
    switch (role) {
      case "coreMeaning":     return cleanLocal(`What is the role of ${subject} in this process`);
      case "mechanism":       return cleanLocal(`What causes ${subject} to occur or change`);
      case "distinction":     return cleanLocal(`How does ${subject} differ from a related concept`);
      case "application":     return cleanLocal(`Where or how is ${subject} used in practice`);
      case "skimTrap":        return cleanLocal(`What mistake is commonly made about ${subject}`);
      case "whatHappensIf":   return cleanLocal(`What happens if ${subject} is absent or disrupted`);
      case "nextStep":        return cleanLocal(`What occurs immediately after ${subject}`);
      case "compareContrast": return cleanLocal(`How does ${subject} differ from a related process`);
      default:                return cleanLocal(stem.split(/\s+/).slice(0, 12).join(" "));
    }
  }
  if (domain === "clinical") {
    switch (role) {
      case "coreMeaning":     return cleanLocal(`What does ${subject} indicate clinically`);
      case "mechanism":       return cleanLocal(`Why does ${subject} cause or lead to its effects`);
      case "distinction":     return cleanLocal(`How does ${subject} differ from a similar condition`);
      case "application":     return cleanLocal(`What is the next step when ${subject} is present`);
      case "skimTrap":        return cleanLocal(`What mistake is commonly made about ${subject}`);
      case "whatHappensIf":   return cleanLocal(`What happens if ${subject} is missed or untreated`);
      case "nextStep":        return cleanLocal(`What is the clinical next step after ${subject} is identified`);
      case "compareContrast": return cleanLocal(`How does ${subject} differ from a similar diagnosis`);
      default:                return cleanLocal(stem.split(/\s+/).slice(0, 12).join(" "));
    }
  }

  // General / default templates
  switch (role) {
    case "coreMeaning":     return cleanLocal(`What does ${subject} mean`);
    case "mechanism":       return cleanLocal(`What does ${subject} cause or lead to`);
    case "distinction":     return cleanLocal(`What should not be confused with ${subject}`);
    case "application":     return cleanLocal(`When or how is ${subject} applied`);
    case "skimTrap":        return cleanLocal(`What mistake is associated with ${subject}`);
    case "whatHappensIf":   return cleanLocal(`What happens if ${subject} is absent or fails`);
    case "nextStep":        return cleanLocal(`What is the next step after ${subject}`);
    case "compareContrast": return cleanLocal(`What distinguishes ${subject} from a related concept`);
    default:                return cleanLocal(stem.split(/\s+/).slice(0, 12).join(" "));
  }
}

function buildCoreMeaningHook(title: string, anchorText: string, domain?: StepModelPageDomain, symbolicDensity?: "high" | "low"): string {
  // On non-math domains, regex-based extractors produce more specific questions.
  // On math domains, the domain-specific templates in buildPageNativeQuestion are more reliable.
  if (domain !== "math") {
    const q = extractDefinitionQuestion(anchorText);
    if (q) return q;
  }
  return buildPageNativeQuestion("coreMeaning", anchorText, domain, symbolicDensity) || cleanLocal(anchorText);
}

function buildMechanismHook(title: string, mechanismText?: string | null, domain?: StepModelPageDomain, symbolicDensity?: "high" | "low"): string | null {
  if (domain !== "math") {
    const q = extractCausalQuestion(mechanismText || "");
    if (q) return q;
  }
  if (!mechanismText) return null;
  return buildPageNativeQuestion("mechanism", mechanismText, domain, symbolicDensity) || cleanLocal(mechanismText);
}

function buildDistinctionHook(
  title: string,
  trapText?: string | null,
  anchorText?: string | null,
  domain?: StepModelPageDomain,
  symbolicDensity?: "high" | "low"
): string | null {
  if (trapText) return buildPageNativeQuestion("distinction", trapText, domain, symbolicDensity) || cleanLocal(trapText);
  return anchorText ? buildPageNativeQuestion("distinction", anchorText, domain, symbolicDensity) || null : null;
}

function buildApplicationHook(title: string, applicationText?: string | null, domain?: StepModelPageDomain, symbolicDensity?: "high" | "low"): string | null {
  if (domain !== "math") {
    const q = extractOperationalQuestion(applicationText || "");
    if (q) return q;
  }
  if (!applicationText) return null;
  return buildPageNativeQuestion("application", applicationText, domain, symbolicDensity) || cleanLocal(applicationText);
}

function buildSkimTrapHook(
  title: string,
  trapText?: string | null,
  anchorText?: string | null,
  domain?: StepModelPageDomain,
  symbolicDensity?: "high" | "low"
): string | null {
  if (trapText) return buildPageNativeQuestion("skimTrap", trapText, domain, symbolicDensity) || cleanLocal(trapText);
  return anchorText ? buildPageNativeQuestion("skimTrap", anchorText, domain, symbolicDensity) || null : null;
}

function isWeakTitle(title: string): boolean {
  const t = title.trim();
  return t.length < 5 || /^step\s+\d+$/i.test(t) || /^(concept|topic|section|page)\s*\d*$/i.test(t);
}

function extractNounPhrase(text: string): string {
  const stripped = (text ?? "").replace(/[.!?]+$/, "").trim();
  if (!stripped) return "";
  const words = stripped.split(/\s+/).filter(Boolean);
  const STOP = new Set(["the", "a", "an", "in", "on", "at", "to", "of", "and", "or", "but", "is", "are", "was", "were", "that", "this", "it", "its", "by", "for", "with"]);
  const start = words.findIndex((w) => !STOP.has(w.toLowerCase()));
  const from = start >= 0 ? start : 0;
  return words.slice(from, from + 4).join(" ");
}

function isGenericPhrase(phrase: string): boolean {
  return /^(step|concept|topic|section|page)\s*\d*\.?$/i.test(phrase.trim());
}

function titleToNounPhrase(title: string): string {
  const cleaned = title.replace(/[.!?]+$/, "").replace(/^(The|A|An)\s+/i, "").trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  const verbIdx = words.findIndex((w) =>
    /^(indicates?|describes?|defines?|measures?|represents?|shows?|means?|refers?|is|are|was|were|has|have)$/i.test(w)
  );
  const cutAt = verbIdx > 0 ? Math.min(verbIdx, 4) : Math.min(4, words.length);
  return words.slice(0, cutAt).join(" ");
}

function extractDefinitionQuestion(text: string): string | null {
  if (!text) return null;
  // Match mid-sentence definitions (not just ^ start)
  const m = text.match(/(.{4,45}?)\s+(indicates?|means?|represents?|refers? to|is defined as)\s+(.{4,60})/i);
  if (m) return cleanLocal(`What does ${m[1].trim()} ${m[2].toLowerCase()}?`);
  // "X is the [noun/count] of Y" → "What is X?"  (e.g. "Atomic number is the number of protons")
  const m3 = text.match(/(.{4,35}?)\s+is the\s+[\w\s]{2,20}\s+of\b/i);
  if (m3) return cleanLocal(`What is ${m3[1].trim()}?`);
  // "X is a/an Y" → "What is X?"
  const m4 = text.match(/(.{4,35}?)\s+is an?\s+(.{4,50})/i);
  if (m4) return cleanLocal(`What is ${m4[1].trim()}?`);
  const m2 = text.match(/(?:you can|one can|we can)\s+(determine|find|calculate|derive)\s+(.{4,40})/i);
  if (m2) return cleanLocal(`How do you ${m2[1].toLowerCase()} ${m2[2].trim().replace(/[.!?]+$/, "")}?`);
  return null;
}

function extractCausalQuestion(text: string): string | null {
  if (!text) return null;
  // Match mid-sentence causal chains (not just ^ start)
  const m = text.match(/(.{4,45}?)\s+(leads? to|causes?|results? in)\s+(.{4,50})/i);
  if (m) return cleanLocal(`Why does ${m[1].trim()} ${m[2].toLowerCase()} ${m[3].trim().replace(/[.!?]+$/, "")}?`);
  const m2 = text.match(/^because\s+(.{4,40}?)[,;]\s+(.{4,40})/i);
  if (m2) return cleanLocal(`Why does ${m2[2].trim().replace(/[.!?]+$/, "")}?`);
  return null;
}

function extractOperationalQuestion(text: string): string | null {
  if (!text) return null;
  const m = text.match(/^(.{4,40}?)\s+(?:can be|is|are)\s+(?:ignored?|negligible|disregarded?)/i);
  if (m) return cleanLocal(`When can ${m[1].trim()} be ignored?`);
  return null;
}

/* -------------------------------------------------------------------------- */
/*                           COMPRESSION HELPERS                              */
/* -------------------------------------------------------------------------- */

function synthesizeRuleFromStepText(anchorText: string, supportTexts: string[]): string | null {
  const source = anchorText || supportTexts[0] || "";
  return source ? cleanLocal(source) : null;
}

/* -------------------------------------------------------------------------- */
/*                                   UTILS                                    */
/* -------------------------------------------------------------------------- */

function semanticOverlapScore(a: string, b: string): number {
  const aTokens = tokenize(a);
  const bTokens = tokenize(b);
  if (!aTokens.length || !bTokens.length) return 0;
  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);
  let overlap = 0;
  for (const token of aSet) { if (bSet.has(token)) overlap += 1; }
  const union = new Set([...aSet, ...bSet]).size;
  return union === 0 ? 0 : overlap / union;
}

function tokenize(text: string): string[] {
  return (text || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function inferTitleFromAnchor(anchorText?: string | null): string | null {
  if (!anchorText) return null;
  const cleaned = cleanLocal(anchorText);
  if (!cleaned) return null;
  return cleaned
    .split(/\s+/)
    .slice(0, 6)
    .map(capitalizeFirst)
    .join(" ")
    .replace(/[.?!]+$/, "");
}

function cleanLocal(value?: string | null): string {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function cleanNullable(value?: string | null): string | null {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text ? cleanLocal(text) : null;
}

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = (value ?? "").trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

function lowercaseFirst(value: string): string {
  if (!value) return value;
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function capitalizeFirst(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}
