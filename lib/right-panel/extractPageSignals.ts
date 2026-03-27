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
import { segmentParagraphs } from "@/lib/paragraphSegmentation";
import { scoreParagraphs } from "@/lib/paragraphScoring";
import { suppressFiller, selectTopSignals } from "@/lib/fillerFilter";

const hasAny = (text: string, words: string[]) => words.some((w) => text.includes(w));

function detectPageRole(pageText: string, heading: string, formulaCount: number, tableLikeRows: number): PageSignals["pageRole"] {
  const text = pageText.toLowerCase();
  const lineGroups = text.split(/\n+/).length;
  if (!text.trim() || text.trim().length < 120) return "image_scan_heavy";
  if (/table of contents|\bcontents\b/.test(text)) return "contents";
  if (/all rights reserved|copyright|isbn|published by/.test(text)) return "copyright_frontmatter";
  if ((/^chapter\s+\d+|^part\s+[ivx\d]+/im).test(pageText) && lineGroups < 12) return "chapter_opener";
  if ((/^section\s+\d|^unit\s+\d|^module\s+\d/im).test(pageText) && lineGroups < 18) return "section_opener";
  if ((/^\s*[A-Z][A-Z\s]{6,}$/m).test(pageText) && lineGroups < 10) return "cover";
  if (formulaCount >= 2 || tableLikeRows >= 3 || /equation|formula|identity/.test(heading.toLowerCase())) return "table_formula";
  return "regular_teaching";
}

export function extractPageSignals(ctx: ActivePageContext): PageSignals {
  const pageText = ctx.pageText || "";
  const nearbyText = ctx.nearbyText || "";
  const topicText = `${ctx.activeTopicTitle || ""} ${ctx.sectionTitle || ""} ${ctx.chapterTitle || ""}`;
  const documentTitle = ctx.documentTitle || "";
  const text = `${pageText}\n${nearbyText}\n${topicText}\n${documentTitle}`.toLowerCase();
  const lines = pageText.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const formulaLines = detectFormulaLines(pageText);

  const blocks = segmentParagraphs(pageText);
  const scored = scoreParagraphs(blocks, ctx.pageNumber);
  const paragraphSignals = selectTopSignals(suppressFiller(scored));

  const pageRole = detectPageRole(pageText, ctx.sectionTitle || "", formulaLines.length, lines.filter((line) => /\s{2,}|\|/.test(line)).length);

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
    pageRole,
    paragraphSignals,
    pageText,
    nearbyText,
  };
}
