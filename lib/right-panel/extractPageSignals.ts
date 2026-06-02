import type { ActivePageContext, PageSignals } from "@/lib/readerContracts";
import { stripClassificationFooter } from "@/lib/pdf/stripClassificationFooter";
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
  const text = stripClassificationFooter(pageText).toLowerCase();
  const lines = pageText.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const lineGroups = lines.length;

  // Empty / near-empty
  if (!text.trim() || text.trim().length < 120) return "image_scan_heavy";

  // Copyright / legal frontmatter — only when no substantive instructional content is present.
  // OpenStax and similar OER books embed copyright/contributor lines in page footers, so we
  // guard against false positives: if the page has math symbols, section headings, or
  // instructional vocabulary it is a content page regardless of footer boilerplate.
  const copyrightHit = /all rights reserved|copyright.*\d{4}|isbn[- ]?\d|published by|printed in/.test(text);
  if (copyrightHit) {
    const hasMathOrInstructional =
      /[∫∑∂∇√π±≤≥≠→←⇒⟹]|dy\/dx|\blim\b|\bsin\b|\bcos\b|\btan\b/i.test(pageText) ||
      /\b(derivative|integral|theorem|formula|equation|solution|function|calculus|proof|differentiate|integrate|slope|tangent|gradient|polynomial|exponent|logarithm|vector|matrix|determinant)\b/i.test(text) ||
      /^\d+\.\d+(\.\d+)?\s+\S/m.test(pageText) ||
      /\b(example|figure|graph|diagram|exercise|problem|step)\s*\d/i.test(text) ||
      formulaCount >= 1 ||
      lines.length >= 20;
    if (!hasMathOrInstructional) return "copyright_frontmatter";
  }

  // Table of contents — "contents" heading + numbers at line ends
  if (/^\s*(table of contents|contents)\s*$/im.test(pageText) || (/\btable of contents\b/.test(text) && /\d{1,4}\s*$/.test(text))) return "contents";

  // Glossary — explicit header or dense term: definition pairs
  if (/^\s*glossary\s*$/im.test(pageText) || (text.includes("glossary") && lines.filter((l) => /^[a-z][a-z\s,'-]{1,40}[:.—]/.test(l.toLowerCase())).length > 4)) return "glossary";

  // Index — explicit header or dense term + page-number column
  if (/^\s*index\s*$/im.test(pageText) || (text.includes("index") && lines.filter((l) => /\d{1,4}(,\s*\d{1,4})*\s*$/.test(l)).length > lineGroups * 0.4)) return "index";

  // Bibliography / References — explicit header or high citation density
  if (/^\s*(bibliography|references|works cited)\s*$/im.test(pageText) || lines.filter((l) => /(et al\.|doi:|https?:\/\/|\(\d{4}\))/.test(l)).length > lineGroups * 0.3) return "bibliography";

  // Appendix
  if (/^\s*appendix\s*[a-z]?\s*[:—]?\s*$/im.test(pageText) && lineGroups < 20) return "appendix";

  // Dedication — very short page with personal dedication phrasing
  if (lineGroups < 15 && /\bdedicated to\b|\bin loving memory\b|\bto my\b|\bfor my\b/.test(text)) return "dedication";

  // Acknowledgements
  if (/\backnowledg(e?ment|ement)s?\b/.test(text) && lineGroups < 40) return "acknowledgements";

  // About the author(s)
  if (/\babout the authors?\b/.test(text) && lineGroups < 35) return "about_authors";

  // Preface / Foreword
  if (/^\s*(preface|foreword)\s*$/im.test(pageText) && lineGroups < 40) return "preface";

  // Chapter opener — "Chapter N" large heading + sparse body
  if (/^chapter\s+\d+|^part\s+[ivx\d]+/im.test(pageText) && lineGroups < 12) return "chapter_opener";

  // Unit opener
  if (/^unit\s+[\divx]+/im.test(pageText) && lineGroups < 15) return "unit_opener";

  // Section / module opener
  if (/^section\s+\d|^module\s+\d/im.test(pageText) && lineGroups < 18) return "section_opener";

  // Cover — single large all-caps title, very sparse
  if (/^\s*[A-Z][A-Z\s]{6,}$/m.test(pageText) && lineGroups < 10) return "cover";

  // History / background (non-instructional) — only when no teaching markers present
  if (/\bhistory of|historical|origin of|milestone|evolution of|timeline\b/.test(text) &&
      !/definition|mechanism|formula|theorem|therefore|pathophysiology|diagnosis|treatment/.test(text)) return "history_background";

  // Formula / table-heavy page
  if (formulaCount >= 2 || tableLikeRows >= 3 || /equation|formula|identity/.test(heading.toLowerCase())) return "table_formula";

  return "regular_teaching";
}

export function extractPageSignals(ctx: ActivePageContext, options?: { minYield?: number; minSignals?: number; maxSignals?: number }): PageSignals {
  const pageText = ctx.pageText || "";
  const nearbyText = ctx.nearbyText || "";
  const topicText = `${ctx.activeTopicTitle || ""} ${ctx.sectionTitle || ""} ${ctx.chapterTitle || ""}`;
  const documentTitle = ctx.documentTitle || "";
  const text = `${pageText}\n${nearbyText}\n${topicText}\n${documentTitle}`.toLowerCase();
  const lines = pageText.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const formulaLines = detectFormulaLines(pageText);

  const blocks = segmentParagraphs(pageText);
  const scored = scoreParagraphs(blocks, ctx.pageNumber);
  const suppressed = suppressFiller(scored);
  const paragraphSignals = selectTopSignals(
    suppressed,
    options?.minSignals ?? 3,
    options?.maxSignals ?? 7,
    options?.minYield ?? 0,
  );

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
    rawParagraphSignals: suppressed,
    pageText,
    nearbyText,
  };
}
