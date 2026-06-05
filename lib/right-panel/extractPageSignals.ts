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

  // Empty / near-empty — only fire image_scan_heavy when the ORIGINAL (pre-strip)
  // page text is also short. Pages with >500 chars of raw text always have enough
  // instructional content to run synthesis; figures/tables/formulas coexist with text.
  const originalLength = pageText.trim().length;
  if ((!text.trim() || text.trim().length < 120) && originalLength < 500) return "image_scan_heavy";

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

  // Chapter opener — "Chapter N" / "Part N" large heading + sparse body.
  const hasInstructionalVocab = /\b(define|definition|element|compound|molecule|cell|organism|function|mechanism|example|figure|table|section|key|concept|essential|trace|synthesis|process|structure|property)\b/i.test(pageText);
  if (/^chapter\s+\d+|^part\s+[ivx\d]+/im.test(pageText) && lineGroups < 12 && !hasInstructionalVocab) return "chapter_opener";

  // Universal instructional body check — book-agnostic; works for any subject/discipline.
  // A page has an instructional body if it has real paragraphs (not just titles/headings).
  // "bodyLines" = lines long enough to be prose, not one-word section numbers.
  const bodyLines = lines.filter(l => l.length > 45);
  const bodyCharCount = bodyLines.join(" ").length;
  // Figure/table captions are also instructional proof
  const figureCaptionCount = lines.filter(l => /^(figure|fig\.?|table|plate|diagram)\s*[\d.]/i.test(l)).length;
  // Instructional sentences end with punctuation and have actual words
  const instructionalSentenceCount = lines.filter(l =>
    l.length > 60 && /[.!?]$/.test(l)
  ).length;
  // Any of these signals = real instructional content, regardless of heading
  const hasInstructionalBody =
    bodyLines.length >= 3 ||
    bodyCharCount > 500 ||
    figureCaptionCount > 0 ||
    instructionalSentenceCount >= 2;

  // Learning objectives / Key concepts overview — non-instructional structural pages.
  // Fires when the page is dominated by an objectives/concepts list (3+ bullet items)
  // and does NOT contain active instructional prose (mechanisms, formulas, worked examples).
  const bulletCount = lines.filter(l => /^[-•*]\s/.test(l) || /^\d+[.)]\s/.test(l)).length;
  if (
    /^\s*(learning\s+objectives?|chapter\s+objectives?|section\s+objectives?|key\s+concepts?|core\s+concepts?|big\s+ideas?|overview\s+&?\s+objectives?|by\s+the\s+end\s+of\s+this|after\s+(reading|studying|completing)\s+this|you\s+will\s+(be\s+able|understand|learn|know))\s*[:\n]/im.test(pageText) &&
    bulletCount >= 3 &&
    formulaCount === 0 &&
    !hasAny(text, MECHANISM_WORDS) &&
    !hasInstructionalBody
  ) return "learning_objectives";

  // Unit opener — only truly sparse pages (no instructional body content)
  if (
    /^unit\s+[\divx]+/im.test(pageText) &&
    lineGroups < 12 &&
    !hasInstructionalBody
  ) return "unit_opener";

  // Section / module opener — only when the page has no instructional body content.
  // A page can have a section heading AND real instructional text — that is a content page.
  // Block only: section heading alone, few lines, no body paragraphs, no figure captions.
  if (
    /^section\s+\d|^module\s+\d/im.test(pageText) &&
    lineGroups < 13 &&
    !hasInstructionalBody
  ) return "section_opener";

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

  const tableLikeRowCount = lines.filter((line) => /\s{2,}|\|/.test(line)).length;
  const pageRole = detectPageRole(pageText, ctx.sectionTitle || "", formulaLines.length, tableLikeRowCount);

  // Log classification result with universal body metrics — no book-specific logic
  const _bodyLines = lines.filter(l => l.length > 45);
  const _figureCaptionCount = lines.filter(l => /^(figure|fig\.?|table|plate|diagram)\s*[\d.]/i.test(l)).length;
  const _instructionalSentenceCount = lines.filter(l => l.length > 60 && /[.!?]$/.test(l)).length;
  const BLOCKED_ROLES_SET = new Set(["chapter_opener", "section_opener", "unit_opener", "learning_objectives", "cover", "title_page", "contents", "glossary", "index", "bibliography", "appendix", "copyright_frontmatter", "image_scan_heavy"]);
  console.log("[PAGE_CLASSIFY]", {
    page:                     ctx.pageNumber,
    pageRole,
    reason:                   BLOCKED_ROLES_SET.has(pageRole ?? "") ? "blocked-structural" : "instructional",
    bodyTextChars:            _bodyLines.join(" ").length,
    instructionalSentenceCount: _instructionalSentenceCount,
    figureCaptionCount:       _figureCaptionCount,
    lineGroups:               lines.length,
    blocked:                  BLOCKED_ROLES_SET.has(pageRole ?? ""),
  });

  return {
    questionCount: (pageText.match(/\?/g) || []).length,
    numberedItemCount: (pageText.match(/(^|\n)\s*(\d+[.)]|[a-z][.)])/gim) || []).length,
    headingCount: lines.filter((line) => line.length < 90 && /^(chapter|unit|module|week|section|introduction|overview|summary)/i.test(line)).length,
    formulaCount: formulaLines.length,
    equationLineCount: formulaLines.filter((line) => line.includes("=")).length,
    tableLikeRowCount,
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
