import { cleanSentence } from "./sentenceCleanup";
import { isRenderableSentence } from "./isRenderableSentence";

export type StoryRole = "general" | "operator" | "expert";
export type StoryDepth = "quick" | "standard" | "deep";

export type StoryLabel =
  | "Indicator"
  | "Mechanism"
  | "Effect"
  | "Consequence"
  | "Rule"
  | "Boundary"
  | "Compare"
  | "Relation"
  | "Trap"
  | "Case"
  | "Clue"
  | "Action"
  | "Interpretation"
  | "Support";

export interface PageStoryStep {
  id: number;
  label: StoryLabel;
  title: string;
  content: string;
  support: string[];
  evidence: string[];
  sourceKind:
    | "summary"
    | "takeaway"
    | "paragraph"
    | "decision_path"
    | "fallback";
  score: number;
}

export interface PageStoryTrap {
  sentence: string;
  reason:
    | "contrast"
    | "exception"
    | "overgeneralization"
    | "weak_grounding"
    | "ambiguous_reference"
    | "misleading_similarity"
    | "missing_boundary";
  confidence: number;
}

export interface ShadowRecallModel {
  questions: string[];
  reveal: {
    mainIdea: string;
    mechanism?: string;
    distinction?: string;
    application?: string;
    trap?: string;
  };
}

export interface PageStory {
  pageClass: string;
  narrative: string;
  shortNarrative: string;
  steps: PageStoryStep[];
  mainIdea: string;
  narrativeLead: string;
  support: string[];
  weakSupport: string[];
  mechanisms: string[];
  distinctions: string[];
  relations: string[];
  applications: string[];
  trapSignals: string[];
  highlightPlan: {
    main: string[];
    support: string[];
    weak: string[];
  };
  trap: PageStoryTrap | null;
  shadowRecall: ShadowRecallModel;
  sourceCount: number;
  confidence: number;
}

type MaybeParagraphInsight = {
  text?: string;
  summary?: string;
  meaning?: string;
  signal?: string;
  application?: string;
  trap?: string;
  score?: number;
  importance?: number;
  priority?: number;
  evidenceSnippet?: string;
  evidence?: string;
};

type MaybeDecisionPath = {
  condition?: string;
  interpretation?: string;
  implication?: string;
  nextMove?: string;
  trap?: string;
  evidenceSnippet?: string;
  template?: string;
};

export type BuildPageStoryInput = {
  pageClass: string;
  pageModel: {
    pageSummary?: string;
    topTakeaways?: string[];
    paragraphInsights?: MaybeParagraphInsight[];
    decisionPaths?: MaybeDecisionPath[];
  };
  role?: StoryRole;
  depth?: StoryDepth;
  mode?: "insight" | "explain" | "compare" | "relation" | "apply_test";
};

type CandidateSourceKind = "summary" | "takeaway" | "paragraph" | "decision_path";

interface NarrativeCandidate {
  sentence: string;
  normalized: string;
  sourceKind: CandidateSourceKind;
  score: number;
  evidence: string[];
  labelHint?: StoryLabel;
  trapHint?: string;
  relationHint?: "contrast" | "cause" | "process" | "definition" | "comparison" | "state";
}

export function buildPageStory({
  pageClass,
  pageModel,
  role = "general",
  depth = "standard",
  mode = "insight",
}: BuildPageStoryInput): PageStory | null {
  const candidates = collectCandidates(pageModel);

  if (candidates.length === 0) {
    return null;
  }

  const ranked = rankCandidates(candidates, pageClass, mode);

  if (ranked.length === 0) {
    return null;
  }

  const narrative = buildNarrative(ranked, role, depth);
  if (!isRenderableSentence(narrative)) {
    return null;
  }

  const steps = buildStorySteps(ranked, role, depth, mode, narrative);
  if (steps.length === 0) {
    return null;
  }

  const mainIdea = cleanSentence(steps[0]?.content || narrative);
  const support = steps.slice(1, 3).map((s) => s.content).filter(isRenderableSentence);
  const weakSupport = buildWeakSupport(ranked, steps);
  const mechanisms = extractStepBucket(steps, ["Mechanism", "Effect", "Consequence"]);
  const distinctions = extractStepBucket(steps, ["Compare", "Boundary", "Trap"]);
  const relations = extractStepBucket(steps, ["Relation", "Consequence", "Effect"]);
  const applications = extractStepBucket(steps, ["Action", "Case", "Rule", "Clue"]);

  const trap = detectTrap(ranked, steps, narrative);
  const trapSignals = uniqueSentences([trap?.sentence, ...extractStepBucket(steps, ["Trap", "Boundary"])]);
  const shadowRecall = buildShadowRecall({ narrative, steps, trap, pageClass, mode });

  const confidence = computeStoryConfidence(ranked, steps, narrative, trap);

  return {
    pageClass,
    narrative,
    shortNarrative: shortenSentence(narrative, 180),
    steps,
    mainIdea,
    narrativeLead: steps[0]?.content || narrative,
    support,
    weakSupport,
    mechanisms,
    distinctions,
    relations,
    applications,
    trapSignals,
    highlightPlan: {
      main: uniqueSentences([mainIdea, support[0]]).slice(0, 2),
      support: uniqueSentences([...support, ...mechanisms, ...distinctions]).slice(0, 4),
      weak: uniqueSentences([...weakSupport, ...relations, ...applications]).slice(0, 4),
    },
    trap,
    shadowRecall,
    sourceCount: ranked.length,
    confidence,
  };
}

function extractStepBucket(steps: PageStoryStep[], labels: StoryLabel[]): string[] {
  return steps
    .filter((step) => labels.includes(step.label))
    .flatMap((step) => [step.content, ...step.support])
    .filter(isRenderableSentence);
}

function collectCandidates(pageModel: BuildPageStoryInput["pageModel"]): NarrativeCandidate[] {
  const out: NarrativeCandidate[] = [];

  const summary = normalizeSentence(pageModel.pageSummary);
  if (summary) {
    out.push({
      sentence: summary,
      normalized: normalizeForCompare(summary),
      sourceKind: "summary",
      score: 0.96,
      evidence: [summary],
      labelHint: inferLabel(summary),
      relationHint: inferRelationHint(summary),
    });
  }

  for (const takeaway of pageModel.topTakeaways || []) {
    const normalized = normalizeSentence(takeaway);
    if (!normalized) continue;
    out.push({
      sentence: normalized,
      normalized: normalizeForCompare(normalized),
      sourceKind: "takeaway",
      score: 0.9,
      evidence: [normalized],
      labelHint: inferLabel(normalized),
      relationHint: inferRelationHint(normalized),
    });
  }

  for (const p of pageModel.paragraphInsights || []) {
    const best =
      normalizeSentence(
        p.meaning ||
          p.summary ||
          p.signal ||
          p.application ||
          p.text ||
          p.evidenceSnippet ||
          p.evidence,
      );

    if (!best) continue;

    const paragraphScore = clamp01(
      Math.max(safeNumber(p.score, 0.62), safeNumber(p.importance, 0), safeNumber(p.priority, 0)) || 0.62,
    );

    const evidence = uniqueSentences([
      normalizeSentence(p.evidenceSnippet),
      normalizeSentence(p.evidence),
      normalizeSentence(p.text),
      normalizeSentence(p.signal),
      normalizeSentence(p.application),
    ]);

    out.push({
      sentence: best,
      normalized: normalizeForCompare(best),
      sourceKind: "paragraph",
      score: 0.55 + paragraphScore * 0.4,
      evidence,
      labelHint: inferLabel(best),
      trapHint: normalizeSentence(p.trap) || undefined,
      relationHint: inferRelationHint(best),
    });
  }

  for (const d of pageModel.decisionPaths || []) {
    const composed = normalizeSentence(d.interpretation || d.implication || d.condition || d.nextMove || d.evidenceSnippet);

    if (!composed) continue;

    const evidence = uniqueSentences([
      normalizeSentence(d.evidenceSnippet),
      normalizeSentence(d.condition),
      normalizeSentence(d.interpretation),
      normalizeSentence(d.implication),
      normalizeSentence(d.nextMove),
    ]);

    out.push({
      sentence: composed,
      normalized: normalizeForCompare(composed),
      sourceKind: "decision_path",
      score: 0.82,
      evidence,
      labelHint: inferDecisionPathLabel(d),
      trapHint: normalizeSentence(d.trap) || undefined,
      relationHint: inferRelationHint(composed),
    });
  }

  return dedupeCandidates(out);
}

function dedupeCandidates(candidates: NarrativeCandidate[]): NarrativeCandidate[] {
  const seen = new Map<string, NarrativeCandidate>();

  for (const candidate of candidates) {
    if (!candidate.normalized) continue;

    const existing = seen.get(candidate.normalized);
    if (!existing) {
      seen.set(candidate.normalized, candidate);
      continue;
    }

    if (candidate.score > existing.score) {
      seen.set(candidate.normalized, {
        ...candidate,
        evidence: uniqueSentences([...existing.evidence, ...candidate.evidence]),
      });
    } else {
      existing.evidence = uniqueSentences([...existing.evidence, ...candidate.evidence]);
    }
  }

  return Array.from(seen.values());
}

function rankCandidates(candidates: NarrativeCandidate[], pageClass: string, mode: BuildPageStoryInput["mode"]): NarrativeCandidate[] {
  return candidates
    .map((c) => ({
      ...c,
      score: c.score + structuralBoost(c, mode) + pageClassBoost(pageClass, c),
    }))
    .filter((c) => c.score >= 0.46)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
}

function structuralBoost(c: NarrativeCandidate, mode: BuildPageStoryInput["mode"]): number {
  let boost = 0;

  if (c.sourceKind === "summary") boost += 0.16;
  if (c.sourceKind === "takeaway") boost += 0.12;
  if (c.sourceKind === "decision_path") boost += 0.11;

  if (containsContrast(c.sentence)) boost += 0.06;
  if (containsCause(c.sentence)) boost += 0.07;
  if (containsProcess(c.sentence)) boost += 0.05;
  if (containsBoundary(c.sentence)) boost += 0.05;
  if (containsActionableRule(c.sentence)) boost += 0.05;

  if (mode === "compare" && c.relationHint === "comparison") boost += 0.14;
  if (mode === "relation" && c.relationHint === "process") boost += 0.14;
  if (mode === "explain" && c.relationHint === "cause") boost += 0.14;
  if (mode === "apply_test" && containsActionableRule(c.sentence)) boost += 0.14;

  return boost;
}

function pageClassBoost(pageClass: string, c: NarrativeCandidate): number {
  switch (pageClass) {
    case "prose":
      return 0;
    case "mixed_visual":
      return c.sourceKind === "paragraph" ? 0.03 : 0;
    case "table_heavy":
      return containsDefinition(c.sentence) || containsRuleLikeMath(c.sentence) ? 0.04 : -0.02;
    case "form_page":
      return containsQuestionLikePattern(c.sentence) ? 0.02 : -0.04;
    case "sparse_text":
      return -0.03;
    default:
      return 0;
  }
}

function buildNarrative(ranked: NarrativeCandidate[], role: StoryRole, depth: StoryDepth): string {
  const top = ranked.slice(0, depth === "quick" ? 2 : 3).map((c) => c.sentence);
  const merged = stitchNarrative(top);

  return shapeForRole(merged, role);
}

function stitchNarrative(sentences: string[]): string {
  const cleaned = uniqueSentences(sentences.map(normalizeSentence)).filter(Boolean) as string[];
  if (cleaned.length === 0) return "";
  if (cleaned.length === 1) return cleaned[0];

  const first = cleaned[0];
  const second = cleaned[1];
  const third = cleaned[2];

  const parts = [first];

  if (second && !isNearDuplicate(first, second)) {
    parts.push(connectSentences(first, second));
  }

  if (third && !isNearDuplicate(parts.join(" "), third)) {
    parts.push(connectNarrativeExtension(third));
  }

  return cleanSentence(parts.join(" "));
}

function connectSentences(_a: string, b: string): string {
  if (containsCause(b)) return `This matters because ${lowerStart(removeTrailingPeriod(b))}.`;
  if (containsContrast(b)) return `At the same time, ${lowerStart(removeTrailingPeriod(b))}.`;
  if (containsProcess(b)) return `In practice, ${lowerStart(removeTrailingPeriod(b))}.`;
  return b;
}

function connectNarrativeExtension(s: string): string {
  if (containsBoundary(s)) return `A key boundary is that ${lowerStart(removeTrailingPeriod(s))}.`;
  if (containsActionableRule(s)) return `A useful rule is to ${lowerStart(removeLeadingRuleVerb(s))}.`;
  return s;
}

function buildStorySteps(
  ranked: NarrativeCandidate[],
  role: StoryRole,
  depth: StoryDepth,
  mode: BuildPageStoryInput["mode"],
  narrative: string,
): PageStoryStep[] {
  const budget = depth === "quick" ? 2 : depth === "standard" ? 3 : 4;

  const chosen = chooseStepCandidates(ranked, mode, budget);
  const steps: PageStoryStep[] = [];

  for (let i = 0; i < chosen.length; i += 1) {
    const candidate = chosen[i];
    const label = inferModeAwareLabel(candidate, mode, i);
    const title = buildStepTitle(label, role, i + 1);

    const content = shapeForRole(candidate.sentence, role);
    const evidence = uniqueSentences(candidate.evidence)
      .filter(isRenderableSentence)
      .slice(0, depth === "quick" ? 1 : depth === "standard" ? 2 : 3);

    const support = buildStepSupport(candidate, ranked, narrative, depth, mode)
      .map((s) => shapeForRole(s, role))
      .filter(isRenderableSentence)
      .slice(0, depth === "quick" ? 1 : depth === "standard" ? 2 : 3);

    steps.push({
      id: i + 1,
      label,
      title,
      content,
      support,
      evidence,
      sourceKind: candidate.sourceKind,
      score: candidate.score,
    });
  }

  return ensureStepContinuity(steps, narrative, role, mode);
}

function chooseStepCandidates(
  ranked: NarrativeCandidate[],
  mode: BuildPageStoryInput["mode"],
  budget: number,
): NarrativeCandidate[] {
  if (ranked.length <= budget) return ranked;

  const chosen: NarrativeCandidate[] = [];
  const used = new Set<string>();

  const tryAdd = (match: (c: NarrativeCandidate) => boolean) => {
    const found = ranked.find((c) => !used.has(c.normalized) && match(c));
    if (!found) return;
    used.add(found.normalized);
    chosen.push(found);
  };

  switch (mode) {
    case "explain":
      tryAdd((c) => containsCause(c.sentence) || c.labelHint === "Mechanism");
      tryAdd((c) => containsEffectWord(c.sentence) || c.labelHint === "Effect");
      tryAdd((c) => containsBoundary(c.sentence) || c.labelHint === "Boundary");
      break;
    case "compare":
      tryAdd((c) => containsComparison(c.sentence) || c.labelHint === "Compare");
      tryAdd((c) => containsSeparator(c.sentence) || c.labelHint === "Rule");
      tryAdd((c) => containsTrapWord(c.sentence) || c.labelHint === "Trap");
      break;
    case "relation":
      tryAdd((c) => containsProcess(c.sentence));
      tryAdd((c) => containsCause(c.sentence));
      tryAdd((c) => containsBoundary(c.sentence));
      break;
    case "apply_test":
      tryAdd((c) => containsCaseWord(c.sentence) || c.labelHint === "Case");
      tryAdd((c) => containsActionableRule(c.sentence) || c.labelHint === "Action");
      tryAdd((c) => containsTrapWord(c.sentence) || c.labelHint === "Trap");
      break;
    case "insight":
    default:
      tryAdd((c) => c.labelHint === "Indicator" || c.sourceKind === "summary");
      tryAdd((c) => c.labelHint === "Interpretation" || c.sourceKind === "paragraph");
      tryAdd((c) => c.labelHint === "Rule" || containsActionableRule(c.sentence));
      tryAdd((c) => c.labelHint === "Trap" || containsTrapWord(c.sentence));
      break;
  }

  for (const c of ranked) {
    if (chosen.length >= budget) break;
    if (used.has(c.normalized)) continue;
    used.add(c.normalized);
    chosen.push(c);
  }

  return chosen.slice(0, budget);
}

function ensureStepContinuity(
  steps: PageStoryStep[],
  narrative: string,
  role: StoryRole,
  mode: BuildPageStoryInput["mode"],
): PageStoryStep[] {
  if (steps.length === 0) return [];

  const out = [...steps];

  out[0] = {
    ...out[0],
    content: contentToStoryAnchor(out[0].content, narrative, role, mode),
  };

  for (let i = 1; i < out.length; i += 1) {
    out[i] = {
      ...out[i],
      content: connectStepToPrevious(out[i - 1].content, out[i].content, i, role),
    };
  }

  return out;
}

function contentToStoryAnchor(
  stepContent: string,
  narrative: string,
  role: StoryRole,
  mode: BuildPageStoryInput["mode"],
): string {
  const base = stepContent || narrative;
  if (!isRenderableSentence(base)) return shapeForRole(narrative, role);

  switch (mode) {
    case "compare":
      return shapeForRole(`The page first sets up the distinction: ${lowerStart(removeTrailingPeriod(base))}.`, role);
    case "relation":
      return shapeForRole(`The page starts by placing this in sequence: ${lowerStart(removeTrailingPeriod(base))}.`, role);
    case "explain":
      return shapeForRole(`The page first explains the core mechanism: ${lowerStart(removeTrailingPeriod(base))}.`, role);
    case "apply_test":
      return shapeForRole(`The page first sets up the case or rule: ${lowerStart(removeTrailingPeriod(base))}.`, role);
    case "insight":
    default:
      return shapeForRole(`The page first points to the main signal: ${lowerStart(removeTrailingPeriod(base))}.`, role);
  }
}

function connectStepToPrevious(previous: string, current: string, index: number, role: StoryRole): string {
  if (!isRenderableSentence(current)) return current;

  const connector = index === 1 ? "From there" : index === 2 ? "That leads to" : "Finally";

  return shapeForRole(`${connector}, ${lowerStart(removeTrailingPeriod(current))}.`, role);
}

function buildStepSupport(
  candidate: NarrativeCandidate,
  ranked: NarrativeCandidate[],
  narrative: string,
  depth: StoryDepth,
  mode: BuildPageStoryInput["mode"],
): string[] {
  const pool = [
    ...candidate.evidence,
    ...ranked
      .filter((r) => r.normalized !== candidate.normalized)
      .filter((r) => relatedEnough(candidate, r, mode))
      .map((r) => r.sentence),
  ];

  const unique = uniqueSentences(pool)
    .filter(isRenderableSentence)
    .filter((s) => !isNearDuplicate(s, candidate.sentence))
    .filter((s) => !isNearDuplicate(s, narrative));

  const limit = depth === "quick" ? 1 : depth === "standard" ? 2 : 3;
  return unique.slice(0, limit);
}

function detectTrap(ranked: NarrativeCandidate[], steps: PageStoryStep[], narrative: string): PageStoryTrap | null {
  const explicitTrap = ranked.find((c) => c.trapHint && isRenderableSentence(c.trapHint));
  if (explicitTrap && explicitTrap.trapHint) {
    return {
      sentence: cleanSentence(explicitTrap.trapHint),
      reason: "overgeneralization",
      confidence: 0.86,
    };
  }

  const contrastCandidate = ranked.find((c) => containsContrast(c.sentence) || containsBoundary(c.sentence));
  if (contrastCandidate) {
    return {
      sentence: cleanSentence(contrastCandidate.sentence),
      reason: containsComparison(contrastCandidate.sentence) ? "misleading_similarity" : "missing_boundary",
      confidence: 0.72,
    };
  }

  const weakStep = steps.find((s) => s.support.length === 0 && s.evidence.length === 0);
  if (weakStep) {
    return {
      sentence: weakStep.content,
      reason: "weak_grounding",
      confidence: 0.56,
    };
  }

  const ambiguous = ranked.find((c) => hasAmbiguousReference(c.sentence));
  if (ambiguous) {
    return {
      sentence: ambiguous.sentence,
      reason: "ambiguous_reference",
      confidence: 0.58,
    };
  }

  if (isRenderableSentence(narrative)) {
    return {
      sentence: narrative,
      reason: "missing_boundary",
      confidence: 0.42,
    };
  }

  return null;
}

function buildShadowRecall(args: {
  narrative: string;
  steps: PageStoryStep[];
  trap: PageStoryTrap | null;
  pageClass: string;
  mode: BuildPageStoryInput["mode"];
}): ShadowRecallModel {
  const { narrative, steps, trap, mode } = args;

  const mechanism = steps.find((s) => s.label === "Mechanism" || s.label === "Effect")?.content;
  const distinction = steps.find((s) => s.label === "Compare" || s.label === "Boundary")?.content;
  const application = steps.find((s) => s.label === "Rule" || s.label === "Action" || s.label === "Case")?.content;

  return {
    questions: buildShadowRecallQuestions(mode),
    reveal: {
      mainIdea: narrative,
      mechanism,
      distinction,
      application,
      trap: trap?.sentence,
    },
  };
}

function buildShadowRecallQuestions(mode: BuildPageStoryInput["mode"]): string[] {
  switch (mode) {
    case "explain":
      return [
        "What mechanism is the page explaining?",
        "What effect follows from that mechanism?",
        "What consequence matters most?",
        "What boundary keeps you from overreading it?",
      ];
    case "compare":
      return [
        "What two ideas look similar here?",
        "What signal separates them?",
        "What rule helps you distinguish them?",
        "What trap would confuse a learner?",
      ];
    case "relation":
      return [
        "What comes first on this page?",
        "What happens in the current step?",
        "What follows after it?",
        "What wider effect does the sequence create?",
      ];
    case "apply_test":
      return [
        "What case or scenario is implied on this page?",
        "What clue matters most?",
        "What should you do next?",
        "What wrong move should you avoid?",
      ];
    case "insight":
    default:
      return [
        "What is the key concept on this page?",
        "What mechanism or logic supports it?",
        "What distinction matters here?",
        "What trap would catch a student here?",
      ];
  }
}

function inferDecisionPathLabel(d: MaybeDecisionPath): StoryLabel {
  if (d.nextMove) return "Action";
  if (d.implication) return "Consequence";
  if (d.interpretation) return "Interpretation";
  if (d.condition) return "Indicator";
  return "Support";
}

function inferModeAwareLabel(c: NarrativeCandidate, mode: BuildPageStoryInput["mode"], index: number): StoryLabel {
  if (mode === "apply_test") {
    if (index === 0) return "Case";
    if (index === 1) return "Clue";
    if (index === 2) return "Action";
    return "Trap";
  }

  if (mode === "compare") {
    if (containsComparison(c.sentence)) return "Compare";
    if (containsSeparator(c.sentence)) return "Rule";
    if (containsTrapWord(c.sentence)) return "Trap";
    return index === 0 ? "Compare" : "Boundary";
  }

  if (mode === "relation") {
    if (index === 0) return "Relation";
    if (containsCause(c.sentence)) return "Effect";
    if (containsProcess(c.sentence)) return "Mechanism";
    return "Consequence";
  }

  if (mode === "explain") {
    if (containsCause(c.sentence)) return "Mechanism";
    if (containsEffectWord(c.sentence)) return "Effect";
    if (containsBoundary(c.sentence)) return "Boundary";
    return index === 0 ? "Mechanism" : "Consequence";
  }

  return c.labelHint || inferLabel(c.sentence);
}

function inferLabel(sentence: string): StoryLabel {
  if (containsTrapWord(sentence)) return "Trap";
  if (containsActionableRule(sentence)) return "Rule";
  if (containsComparison(sentence)) return "Compare";
  if (containsProcess(sentence)) return "Mechanism";
  if (containsCause(sentence)) return "Mechanism";
  if (containsEffectWord(sentence)) return "Effect";
  if (containsBoundary(sentence)) return "Boundary";
  if (containsCaseWord(sentence)) return "Case";
  if (containsIndicatorWord(sentence)) return "Indicator";
  return "Interpretation";
}

function buildStepTitle(label: StoryLabel, role: StoryRole, stepNumber: number): string {
  if (role === "expert") return `${stepNumber}. ${label.toUpperCase()}`;
  if (role === "operator") return `${stepNumber}. ${label}`;
  return `${stepNumber}. ${friendlyTitle(label)}`;
}

function friendlyTitle(label: StoryLabel): string {
  switch (label) {
    case "Indicator":
      return "Start Here";
    case "Mechanism":
      return "How It Works";
    case "Effect":
      return "What This Changes";
    case "Consequence":
      return "What Follows";
    case "Rule":
      return "Decision Rule";
    case "Boundary":
      return "Important Boundary";
    case "Compare":
      return "Key Distinction";
    case "Relation":
      return "Where This Fits";
    case "Trap":
      return "Common Trap";
    case "Case":
      return "Case";
    case "Clue":
      return "Key Clue";
    case "Action":
      return "Next Move";
    case "Interpretation":
      return "What It Means";
    case "Support":
    default:
      return "Support";
  }
}

function buildWeakSupport(ranked: NarrativeCandidate[], steps: PageStoryStep[]): string[] {
  const stepTexts = new Set(steps.map((s) => normalizeForCompare(s.content)));

  return uniqueSentences(ranked.flatMap((r) => [r.sentence, ...r.evidence]).map(normalizeSentence).filter(Boolean) as string[])
    .filter(isRenderableSentence)
    .filter((s) => !stepTexts.has(normalizeForCompare(s)))
    .slice(0, 4);
}

function computeStoryConfidence(ranked: NarrativeCandidate[], steps: PageStoryStep[], narrative: string, trap: PageStoryTrap | null): number {
  const base = ranked.slice(0, 4).reduce((sum, c) => sum + c.score, 0) / Math.max(1, Math.min(ranked.length, 4));

  const stepBonus = Math.min(0.18, steps.length * 0.04);
  const narrativeBonus = isRenderableSentence(narrative) ? 0.08 : -0.1;
  const trapBonus = trap ? 0.04 : 0;

  return clamp01(base + stepBonus + narrativeBonus + trapBonus);
}

function shapeForRole(sentence: string, role: StoryRole): string {
  const cleaned = cleanSentence(sentence);
  if (!cleaned) return "";

  switch (role) {
    case "expert":
      return toExpertSentence(cleaned);
    case "operator":
      return toOperatorSentence(cleaned);
    case "general":
    default:
      return toGeneralSentence(cleaned);
  }
}

function toGeneralSentence(sentence: string): string {
  return sentence;
}

function toOperatorSentence(sentence: string): string {
  return cleanSentence(
    sentence
      .replace(/^This page first points to the main signal:\s*/i, "")
      .replace(/^The page first explains the core mechanism:\s*/i, "")
      .replace(/^The page first sets up the distinction:\s*/i, "")
      .replace(/^The page starts by placing this in sequence:\s*/i, "")
      .replace(/^The page first sets up the case or rule:\s*/i, ""),
  );
}

function toExpertSentence(sentence: string): string {
  let s = sentence;
  s = s.replace(/\bthis page\b/gi, "the page");
  s = s.replace(/\bit is important to note that\b/gi, "");
  s = s.replace(/\bin practice,\b/gi, "");
  s = s.replace(/\bat the same time,\b/gi, "");
  return cleanSentence(s);
}

function normalizeSentence(input?: string | null): string | null {
  if (!input) return null;
  const cleaned = cleanSentence(input);
  if (!cleaned) return null;
  if (!isRenderableSentence(cleaned)) return null;
  return cleaned;
}

function uniqueSentences(items: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const normalized = normalizeSentence(item || undefined);
    if (!normalized) continue;
    const key = normalizeForCompare(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }

  return out;
}

function normalizeForCompare(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function shortenSentence(s: string, max: number): string {
  if (s.length <= max) return s;
  const clipped = s.slice(0, max).replace(/\s+\S*$/, "");
  return `${removeTrailingPeriod(clipped)}.`;
}

function safeNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function removeTrailingPeriod(s: string): string {
  return s.replace(/[.?!]\s*$/, "").trim();
}

function lowerStart(s: string): string {
  if (!s) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function isNearDuplicate(a: string, b: string): boolean {
  const na = normalizeForCompare(a);
  const nb = normalizeForCompare(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.includes(nb) || nb.includes(na);
}

function relatedEnough(a: NarrativeCandidate, b: NarrativeCandidate, mode: BuildPageStoryInput["mode"]): boolean {
  if (a.relationHint && b.relationHint && a.relationHint === b.relationHint) return true;
  if (mode === "compare" && (containsComparison(a.sentence) || containsComparison(b.sentence))) return true;
  if (mode === "explain" && (containsCause(a.sentence) || containsCause(b.sentence))) return true;
  return sharedTokenCount(a.sentence, b.sentence) >= 2;
}

function sharedTokenCount(a: string, b: string): number {
  const sa = new Set(normalizeForCompare(a).split(" "));
  const sb = new Set(normalizeForCompare(b).split(" "));
  let count = 0;
  for (const token of sa) {
    if (token.length < 4) continue;
    if (sb.has(token)) count += 1;
  }
  return count;
}

function hasAmbiguousReference(sentence: string): boolean {
  return /\b(this|that|these|those|it|they)\b/i.test(sentence) && sentence.split(" ").length < 7;
}

function removeLeadingRuleVerb(sentence: string): string {
  return sentence.replace(/^(apply|use|check|avoid|compare|distinguish)\s+/i, "").trim();
}

function inferRelationHint(sentence: string): NarrativeCandidate["relationHint"] {
  if (containsComparison(sentence)) return "comparison";
  if (containsCause(sentence)) return "cause";
  if (containsProcess(sentence)) return "process";
  if (containsDefinition(sentence)) return "definition";
  if (containsContrast(sentence)) return "contrast";
  return "state";
}

function containsCause(sentence: string): boolean {
  return /\b(because|therefore|thus|so that|leads to|results in|causes?|produces?|drives?)\b/i.test(sentence);
}

function containsEffectWord(sentence: string): boolean {
  return /\b(effect|changes?|alters?|increases?|decreases?|improves?|reduces?|shifts?)\b/i.test(sentence);
}

function containsProcess(sentence: string): boolean {
  return /\b(first|next|then|finally|during|before|after|followed by|process|sequence|step)\b/i.test(sentence);
}

function containsDefinition(sentence: string): boolean {
  return /\b(is defined as|refers to|means|is called|is a)\b/i.test(sentence);
}

function containsComparison(sentence: string): boolean {
  return /\b(unlike|whereas|in contrast|compared with|compared to|differs from|versus|vs\.?)\b/i.test(sentence);
}

function containsContrast(sentence: string): boolean {
  return /\b(however|whereas|but|although|yet|instead)\b/i.test(sentence);
}

function containsBoundary(sentence: string): boolean {
  return /\b(only if|unless|except|not always|may not|should not|limited to|boundary|constraint)\b/i.test(sentence);
}

function containsActionableRule(sentence: string): boolean {
  return /\b(apply|use|check|avoid|do not|should|must|next move|rule)\b/i.test(sentence);
}

function containsTrapWord(sentence: string): boolean {
  return /\b(trap|confuse|mistake|misleading|wrong move|pitfall|overread|overgeneralize)\b/i.test(sentence);
}

function containsCaseWord(sentence: string): boolean {
  return /\b(case|scenario|patient|example|if\b|suppose|consider)\b/i.test(sentence);
}

function containsIndicatorWord(sentence: string): boolean {
  return /\b(indicates?|suggests?|signals?|points to|shows that|reveals?)\b/i.test(sentence);
}

function containsSeparator(sentence: string): boolean {
  return /\b(distinguish|separate|tell apart|key difference|decision rule)\b/i.test(sentence);
}

function containsQuestionLikePattern(sentence: string): boolean {
  return /\?$|\b(yes|no|when did|please check|are you|if yes)\b/i.test(sentence);
}

function containsRuleLikeMath(sentence: string): boolean {
  return /[=<>^]|function|sequence|graph|equation|limit|derivative|integral/i.test(sentence);
}
