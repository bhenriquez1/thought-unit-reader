// lib/insights/selectTeachingSource.ts
//
// Teaching source selector: zones raw PDF page text and returns only the
// subset the concept-extraction pipeline should treat as "the lesson".
//
// Problem: PDF pages mix figure captions, sidebar callouts, key-concept boxes,
// table cells, and exercise prompts with actual instructional prose. Treating
// all text equally lets captions and sidebars rank above the real lesson.
//
// Solution: classify each paragraph-block into a zone, then pick only the
// zones that are authoritative for the page's kind.

export type TextZone =
  | "mainBody"
  | "heading"
  | "figureCaption"
  | "table"
  | "sidebar"
  | "formulaBlock"
  | "exercise";

export interface ZonedBlock {
  zone: TextZone;
  text: string;
  wordCount: number;
}

export interface TeachingSourceResult {
  selectedText: string;
  selectedZone: TextZone;
  selectedWordCount: number;
  suppressedReason: string | null;
  zones: { zone: TextZone; wordCount: number }[];
  mathPath: {
    formulaCount: number;
    explanationCount: number;
    stepCount: number;
    canRender: boolean;
  } | null;
}

// ── Zone-detection patterns ────────────────────────────────────────────────

const CAPTION_RE = /^(figure|fig\.|table|diagram|image|plate|chart|exhibit|photo|photograph|micrograph|sketch|illustration)\s*[\dA-Za-z]{1,3}/i;
const SIDEBAR_RE = /^(key concept[s:]?|key term[s:]?|key definition[s:]?|key vocabular|glossary|did you know|learning objective[s:]?|note:|tip:|important:|remember:|recall:|definition:|boxed text|concept check|summary box|chapter summary|in summary|summary:|review:|chapter review|review question[s:]?|check your understanding|test yourself|test your knowledge|clinical pearl|case study:|spotlight:|fast fact|scientific note|apply:|application box|going deeper|box\s*\d)/i;
const EXERCISE_RE = /^(problem|exercise|question|practice|q\.|q\d|\d+\.\s|activity|try it|worked example|solve:|calculate:|derive:|scenario:|challenge:|lab activity|lab exercise|experiment:|check it)\s*\d*/i;
const TABLE_LINE_RE = /\t[^\t]+\t|\|[^|]+\|/;
// ≥2 distinct math signals in a block → formula-dense
const MATH_SIGNAL_RE = /[=∫∑∂π√∞±→≤≥≠∈]|dy\/dx|d[xyz]\/d[txyz]|d\/d[txyz]|f\(['"]?x['"]?\)|\blim\b|\bderivative\b|\bintegral\b|\btheorem\b|\bproof\b|\bdy\b.*=|\bd[xy]\b/i;

/* -------------------------------------------------------------------------- */
/*                               PUBLIC API                                   */
/* -------------------------------------------------------------------------- */

export function selectTeachingSource(
  rawText: string,
  pageKind: string
): TeachingSourceResult {
  if (!rawText.trim()) {
    return empty("empty_page_text");
  }

  const paragraphs = rawText.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  // Fall back to line-splitting for dense single-block pages
  const blocks: ZonedBlock[] = (paragraphs.length >= 2 ? paragraphs : rawText.split(/\n/).filter(Boolean))
    .map(classifyBlock);

  const zoneSummary = buildZoneSummary(blocks);

  if (pageKind === "mathematical_exposition") {
    return buildMathTeachingSource(blocks, zoneSummary);
  }

  return buildProseTeachingSource(blocks, zoneSummary, pageKind);
}

/* -------------------------------------------------------------------------- */
/*                           ZONE CLASSIFIER                                  */
/* -------------------------------------------------------------------------- */

function classifyBlock(paragraph: string): ZonedBlock {
  const lines = paragraph.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const firstLine = lines[0] ?? "";
  const words = wordCount(paragraph);

  if (CAPTION_RE.test(firstLine)) return { zone: "figureCaption", text: paragraph, wordCount: words };
  if (SIDEBAR_RE.test(firstLine)) return { zone: "sidebar", text: paragraph, wordCount: words };
  if (EXERCISE_RE.test(firstLine)) return { zone: "exercise", text: paragraph, wordCount: words };
  if (lines.some((l) => TABLE_LINE_RE.test(l))) return { zone: "table", text: paragraph, wordCount: words };
  // Secondary scan: a non-first line starting with a caption/sidebar signal inside a short
  // block (< 30 words) means the whole block is a captioned figure or callout, not prose.
  if (words < 30 && lines.slice(1).some((l) => CAPTION_RE.test(l.trim()) || SIDEBAR_RE.test(l.trim()))) {
    return { zone: "figureCaption", text: paragraph, wordCount: words };
  }

  // Formula-dense: ≥2 distinct math signals, OR a short block (< 20 words) with ≥1 signal.
  // The short-block exception handles single-equation lines that PDF.js often extracts
  // as isolated short paragraphs: "f'(x) = lim(h→0) [f(x+h) – f(x)] / h"
  const mathHits = countRegexMatches(paragraph, MATH_SIGNAL_RE);
  if (mathHits >= 2 || (mathHits >= 1 && words < 20)) return { zone: "formulaBlock", text: paragraph, wordCount: words };

  // Short, no terminal punctuation → structural heading
  if (words < 10 && lines.length === 1 && !/[.!?]$/.test(firstLine)) {
    return { zone: "heading", text: paragraph, wordCount: words };
  }

  return { zone: "mainBody", text: paragraph, wordCount: words };
}

/* -------------------------------------------------------------------------- */
/*                         PROSE TEACHING SOURCE                              */
/* -------------------------------------------------------------------------- */

function buildProseTeachingSource(
  blocks: ZonedBlock[],
  zones: { zone: TextZone; wordCount: number }[],
  pageKind?: string
): TeachingSourceResult {
  // Ordered by teaching authority: mainBody → heading → sidebar (last resort)
  const mainBodyBlocks = blocks.filter((b) => b.zone === "mainBody");
  const headingBlocks = blocks.filter((b) => b.zone === "heading");

  let selectedBlocks = mainBodyBlocks;
  let selectedZone: TextZone = "mainBody";

  if (mainBodyBlocks.length === 0 && headingBlocks.length > 0) {
    // Page is heading-only — use headings as a last resort so caller can still suppress
    selectedBlocks = headingBlocks;
    selectedZone = "heading";
  }

  const selectedText = selectedBlocks.map((b) => b.text).join("\n\n");
  const selectedWords = selectedBlocks.reduce((n, b) => n + b.wordCount, 0);

  // Diagram-heavy science/instructional pages often have short but real body text.
  // Lower the floor so a 25-word paragraph about a cell diagram isn't suppressed.
  const minWords =
    pageKind === "scientific_exposition" || pageKind === "instructional_prose" ? 20 : 40;

  if (selectedWords < minWords) {
    return {
      selectedText: "",
      selectedZone,
      selectedWordCount: 0,
      suppressedReason: "insufficient_main_body",
      zones,
      mathPath: null,
    };
  }

  return {
    selectedText,
    selectedZone,
    selectedWordCount: selectedWords,
    suppressedReason: null,
    zones,
    mathPath: null,
  };
}

/* -------------------------------------------------------------------------- */
/*                          MATH TEACHING SOURCE                              */
/* -------------------------------------------------------------------------- */

function buildMathTeachingSource(
  blocks: ZonedBlock[],
  zones: { zone: TextZone; wordCount: number }[]
): TeachingSourceResult {
  const formulaBlocks = blocks.filter((b) => b.zone === "formulaBlock");
  const mainBodyBlocks = blocks.filter((b) => b.zone === "mainBody");
  const headingBlocks = blocks.filter((b) => b.zone === "heading");

  // Math path: formulas + prose explanation + headings, in document order
  const selectedBlocks = blocks.filter(
    (b) => b.zone === "formulaBlock" || b.zone === "mainBody" || b.zone === "heading"
  );

  const formulaCount = formulaBlocks.length;
  const explanationCount = mainBodyBlocks.length;
  const stepCount = Math.min(formulaCount + Math.floor(explanationCount / 2), 5);
  const selectedWords = selectedBlocks.reduce((n, b) => n + b.wordCount, 0);
  // Render if at least one formula block OR enough explanatory prose
  const canRender = formulaCount >= 1 || selectedWords >= 60;

  const mathPath = { formulaCount, explanationCount, stepCount, canRender };

  if (!canRender) {
    return {
      selectedText: "",
      selectedZone: "formulaBlock",
      selectedWordCount: 0,
      suppressedReason: "insufficient_math_content",
      zones,
      mathPath,
    };
  }

  return {
    selectedText: selectedBlocks.map((b) => b.text).join("\n\n"),
    selectedZone: "formulaBlock",
    selectedWordCount: selectedWords,
    suppressedReason: null,
    zones,
    mathPath,
  };
}

/* -------------------------------------------------------------------------- */
/*                                 HELPERS                                    */
/* -------------------------------------------------------------------------- */

function empty(reason: string): TeachingSourceResult {
  return {
    selectedText: "",
    selectedZone: "mainBody",
    selectedWordCount: 0,
    suppressedReason: reason,
    zones: [],
    mathPath: null,
  };
}

function buildZoneSummary(blocks: ZonedBlock[]): { zone: TextZone; wordCount: number }[] {
  const map = new Map<TextZone, number>();
  for (const block of blocks) {
    map.set(block.zone, (map.get(block.zone) ?? 0) + block.wordCount);
  }
  return Array.from(map.entries()).map(([zone, wordCount]) => ({ zone, wordCount }));
}

function wordCount(text: string): number {
  return (text ?? "").trim().split(/\s+/).filter(Boolean).length;
}

function countRegexMatches(text: string, re: RegExp): number {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  return (text.match(g) ?? []).length;
}
