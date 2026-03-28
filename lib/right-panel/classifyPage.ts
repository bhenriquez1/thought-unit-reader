import type { PageClassification, PageSignals, PageType } from "@/lib/readerContracts";

type BaseType = Exclude<PageType, "mixed" | "unknown">;
type Scored = Record<BaseType, number>;

function applyBookContextBoosts(scores: Scored, signals: PageSignals) {
  const context = `${signals.documentTitle || ""} ${signals.activeTopicTitle || ""} ${signals.nearbyHeading || ""}`.toLowerCase();

  if (/(calculus|algebra|equation|identity|derivative|integral|biocalculus)/.test(context)) {
    scores.formula += 2;
    scores.diagnostic += 1;
  }
  if (/(endo|endodont|denture|prosth|occlusion|diagnostic test|oral|clinical)/.test(context)) {
    scores.clinical += 2;
    scores.case += 1;
  }
  if (/(intro|introduction|overview)/.test(context)) {
    scores.overview += 2;
  }
}

export function classifyPage(signals: PageSignals): PageClassification {
  const scores: Scored = {
    diagnostic: 0,
    definition: 0,
    mechanism: 0,
    application: 0,
    overview: 0,
    comparison: 0,
    clinical: 0,
    formula: 0,
    case: 0,
    reference: 0,
  };
  const reasons: string[] = [];

  const paragraphKinds = signals.paragraphSignals || [];
  const paragraphCountByKind = paragraphKinds.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.kind] = (acc[entry.kind] || 0) + 1;
    return acc;
  }, {});

  if (signals.questionCount >= 3) scores.diagnostic += 3;
  if (signals.numberedItemCount >= 4) scores.diagnostic += 3;
  if (signals.hasDiagnosticWords) scores.diagnostic += 4;
  if (signals.hasFormulaWords && signals.questionCount >= 2) scores.diagnostic += 2;

  if (signals.hasDefinitionWords) scores.definition += 4;
  if (signals.shortLineDensity > 0.45) scores.definition += 2;
  if (/\b(definition|terms|concepts)\b/i.test(signals.nearbyHeading || "")) scores.definition += 3;

  if (signals.hasMechanismWords) scores.mechanism += 4;
  if (/(step|process|pathway|mechanism)/i.test(signals.nearbyHeading || "")) scores.mechanism += 3;
  if (/\b(first|then|next|finally)\b/gi.test(signals.pageText) && (signals.pageText.match(/\b(first|then|next|finally)\b/gi) || []).length >= 3) scores.mechanism += 2;

  if (signals.hasApplicationWords) scores.application += 4;
  if (/(worked example|in practice|example)/i.test(signals.pageText)) scores.application += 3;
  if (signals.questionCount >= 1 && /answer|solution/i.test(signals.pageText)) scores.application += 2;

  if (signals.hasOverviewWords) scores.overview += 4;
  if (/(introduction|overview|summary)/i.test(signals.nearbyHeading || "")) scores.overview += 4;
  if (signals.questionCount <= 1 && signals.headingCount >= 1) scores.overview += 2;

  if (signals.hasComparisonWords) scores.comparison += 4;
  if (signals.tableLikeRowCount >= 2) scores.comparison += 3;

  if (signals.hasClinicalWords) scores.clinical += 4;
  if (/(diagnosis|treatment|patient|management)/i.test(signals.nearbyHeading || "")) scores.clinical += 3;
  if (/sign\s*\W+\s*interpret|symptom|finding/i.test(signals.pageText)) scores.clinical += 2;

  if (signals.formulaCount >= 2) scores.formula += 4;
  if (signals.equationLineCount >= 2) scores.formula += 3;
  if (signals.symbolDensity > 0.03) scores.formula += 2;
  if (/(formula|equation|identity)/i.test(signals.nearbyHeading || "")) scores.formula += 3;

  if (signals.hasCaseWords) scores.case += 4;
  if (/(presents with|history|chief complaint)/i.test(signals.pageText)) scores.case += 3;

  if (signals.citationCount >= 3) scores.reference += 4;
  if (signals.hasReferenceWords) scores.reference += 4;


  scores.definition += (paragraphCountByKind.definition || 0) * 1.1;
  scores.mechanism += (paragraphCountByKind.mechanism || 0) * 1.2;
  scores.clinical += (paragraphCountByKind.clinical || 0) * 1.3;
  scores.comparison += (paragraphCountByKind.comparison || 0) * 1.1;
  scores.formula += (paragraphCountByKind.formula || 0) * 1.3;
  scores.application += (paragraphCountByKind.application || 0) * 1.1;

  // Leakage control: demote formula if clinical evidence dominates and formula evidence is weak.
  if (scores.clinical >= 7 && scores.formula <= 3) {
    scores.formula = Math.max(0, scores.formula - 2);
  }
  // Demote clinical if formula evidence dominates and clinical words are weak.
  if (scores.formula >= 7 && !signals.hasClinicalWords && scores.clinical <= 3) {
    scores.clinical = Math.max(0, scores.clinical - 2);
  }

  applyBookContextBoosts(scores, signals);

  if (signals.pageRole === "history_background") {
    scores.overview += 3;
    scores.definition += 1;
    scores.clinical = Math.max(0, scores.clinical - 4);
    scores.case = Math.max(0, scores.case - 3);
  }
  if (signals.pageRole && ["cover", "contents", "chapter_opener", "section_opener", "copyright_frontmatter", "image_scan_heavy"].includes(signals.pageRole)) {
    scores.clinical = Math.max(0, scores.clinical - 4);
    scores.diagnostic = Math.max(0, scores.diagnostic - 3);
  }

  const sorted = (Object.entries(scores) as Array<[BaseType, number]>).sort((a, b) => b[1] - a[1]);
  const [topType, topScore] = sorted[0];
  const [, secondScore] = sorted[1];

  if (topScore >= 8 && topScore - secondScore >= 2) {
    reasons.push(`Strong ${topType} signals`);
    return {
      pageType: topType,
      confidence: Math.min(1, topScore / 12),
      secondaryTypes: sorted.slice(1, 3).filter(([, score]) => score >= 5).map(([type, score]) => ({ type, confidence: Math.min(1, score / 12) })),
      reasons,
    };
  }

  if (topScore >= 5 && topScore - secondScore <= 1) {
    reasons.push("Mixed signal profile");
    return {
      pageType: "mixed",
      confidence: 0.55,
      secondaryTypes: sorted.slice(0, 2).map(([type, score]) => ({ type, confidence: Math.min(1, score / 12) })),
      reasons,
    };
  }

  if (topScore < 3) {
    reasons.push("No reliable type signal");
    return { pageType: "unknown", confidence: 0.25, secondaryTypes: [], reasons };
  }

  reasons.push(`Medium ${topType} signal profile`);
  return {
    pageType: topType,
    confidence: Math.min(1, topScore / 10),
    secondaryTypes: sorted.slice(1, 3).filter(([, score]) => score >= 3).map(([type, score]) => ({ type, confidence: Math.min(1, score / 10) })),
    reasons,
  };
}
