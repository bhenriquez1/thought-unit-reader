import type { ActivePageContext, PageSignals } from "@/lib/readerContracts";
import {
  APPLICATION_WORDS,
  CASE_WORDS,
  CLINICAL_WORDS,
  COMPARISON_WORDS,
  DEFINITION_WORDS,
  DIAGNOSTIC_WORDS,
  FORMULA_WORDS,
  MECHANISM_WORDS,
  OVERVIEW_WORDS,
  REFERENCE_WORDS,
} from "./keywords";
import { detectFormulaLines } from "./formulaNormalizer";

const hasAny = (text: string, words: string[]) => words.some((w) => text.includes(w));

export function extractPageSignals(ctx: ActivePageContext): PageSignals {
  const pageText = ctx.pageText || "";
  const nearbyText = ctx.nearbyText || "";
  const topicText = `${ctx.activeTopicTitle || ""} ${ctx.sectionTitle || ""} ${ctx.chapterTitle || ""}`;
  const documentTitle = ctx.documentTitle || "";
  const text = `${pageText}\n${nearbyText}\n${topicText}\n${documentTitle}`.toLowerCase();
  const text = `${pageText}\n${nearbyText}`.toLowerCase();
  const lines = pageText.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const formulaLines = detectFormulaLines(pageText);

  return {
    questionCount: (pageText.match(/\?/g) || []).length,
    numberedItemCount: (pageText.match(/(^|\n)\s*(\d+[.)]|[a-z][.)])/gim) || []).length,
    headingCount: lines.filter((line) => line.length < 90 && /^(chapter|unit|module|week|section|introduction|overview|summary)/i.test(line)).length,
    formulaCount: formulaLines.length,
    equationLineCount: formulaLines.filter((line) => line.includes("=")).length,
    tableLikeRowCount: lines.filter((line) => /\s{2,}|\|/.test(line)).length,
    citationCount: (pageText.match(/(et al\.|doi|\(\d{4}\)|\[[0-9,\- ]+\])/gi) || []).length,
    bulletCount: (pageText.match(/(^|\n)\s*[-•*]/g) || []).length,
    hasDiagnosticWords: hasAny(text, DIAGNOSTIC_WORDS),
    hasDefinitionWords: hasAny(text, DEFINITION_WORDS),
    hasMechanismWords: hasAny(text, MECHANISM_WORDS),
    hasComparisonWords: hasAny(text, COMPARISON_WORDS),
    hasClinicalWords: hasAny(text, CLINICAL_WORDS),
    hasCaseWords: hasAny(text, CASE_WORDS),
    hasReferenceWords: hasAny(text, REFERENCE_WORDS),
    hasFormulaWords: hasAny(text, FORMULA_WORDS),
    hasOverviewWords: hasAny(text, OVERVIEW_WORDS),
    hasApplicationWords: hasAny(text, APPLICATION_WORDS),
    uppercaseHeadingDensity: lines.length ? lines.filter((line) => /^[A-Z0-9\s\-:]+$/.test(line) && line.length < 80).length / lines.length : 0,
    shortLineDensity: lines.length ? lines.filter((line) => line.length <= 60).length / lines.length : 0,
    symbolDensity: pageText.length ? ((pageText.match(/[=+\-×÷\/()^²³]/g) || []).length / pageText.length) : 0,
    numericDensity: pageText.length ? ((pageText.match(/[0-9]/g) || []).length / pageText.length) : 0,
    nearbyHeading: ctx.sectionTitle || undefined,
    activeTopicTitle: ctx.activeTopicTitle,
    activeTopicKind: ctx.activeTopicKind || undefined,
    documentTitle: ctx.documentTitle,
    pageText,
    nearbyText,
  };
}
