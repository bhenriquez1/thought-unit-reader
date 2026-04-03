export type RawLine = {
  id?: string;
  text: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fontSize?: number;
  isBold?: boolean;
};

export type ReconstructedParagraph = {
  id: string;
  text: string;
  lineIds: string[];
  startLineIndex: number;
  endLineIndex: number;
  avgX: number;
  avgFontSize: number;
  confidence: number;
  kind: "prose" | "bullet" | "heading_like" | "table_like";
};

type ParagraphState = {
  lines: RawLine[];
  startLineIndex: number;
  endLineIndex: number;
};

const BULLET_RE = /^([•▪◦‣⁃*-]|\d+[.)]|[A-Z][.)])\s+/;
const HEADING_NUMBER_RE = /^(chapter\s+\d+|\d+(\.\d+)*|[ivxlcdm]+\.)\b/i;

export function reconstructParagraphs(lines: RawLine[]): ReconstructedParagraph[] {
  const cleaned = lines
    .map((line, index) => normalizeLine(line, index))
    .filter((line) => line.text.length > 0);

  if (!cleaned.length) return [];

  const paragraphs: ReconstructedParagraph[] = [];
  let current: ParagraphState | null = null;

  for (let i = 0; i < cleaned.length; i += 1) {
    const line = cleaned[i];

    if (!current) {
      current = startParagraph(line, i);
      continue;
    }

    const prev = current.lines[current.lines.length - 1];

    if (shouldBreakParagraph(prev, line, current)) {
      paragraphs.push(finalizeParagraph(current, paragraphs.length));
      current = startParagraph(line, i);
      continue;
    }

    current.lines.push(line);
    current.endLineIndex = i;
  }

  if (current) {
    paragraphs.push(finalizeParagraph(current, paragraphs.length));
  }

  return paragraphs;
}

function normalizeLine(line: RawLine, index: number): RawLine {
  let text = line.text ?? "";

  text = text
    .replace(/\u00ad/g, "") // soft hyphen
    .replace(/\s+/g, " ")
    .trim();

  return {
    ...line,
    id: line.id ?? `line-${index}`,
    text,
  };
}

function startParagraph(line: RawLine, index: number): ParagraphState {
  return {
    lines: [line],
    startLineIndex: index,
    endLineIndex: index,
  };
}

function shouldBreakParagraph(prev: RawLine, next: RawLine, _current: ParagraphState): boolean {
  if (!prev.text || !next.text) return true;

  if (isLikelyStandaloneHeading(next)) return true;
  if (isLikelyStandaloneHeading(prev)) return true;

  if (isTableLike(prev.text) || isTableLike(next.text)) return true;

  if (isBullet(next.text) && !isBullet(prev.text)) return true;
  if (!isBullet(next.text) && isBullet(prev.text)) return true;
  if (isBullet(prev.text) && isBullet(next.text)) return true;

  if (hasLargeVerticalGap(prev, next)) return true;
  if (hasStrongIndentShift(prev, next)) return true;
  if (hasFontJump(prev, next)) return true;

  if (shouldForceJoin(prev, next)) return false;

  if (endsStrong(prev.text)) return true;
  if (startsNewSentence(next.text) && sameVisualBlock(prev, next)) return true;

  return false;
}

function shouldForceJoin(prev: RawLine, next: RawLine): boolean {
  if (endsWeak(prev.text)) return true;
  if (startsLowercase(next.text)) return true;
  if (isHyphenContinuation(prev.text)) return true;
  if (sameVisualBlock(prev, next) && !endsStrong(prev.text)) return true;
  return false;
}

function finalizeParagraph(state: ParagraphState, index: number): ReconstructedParagraph {
  const text = joinParagraphLines(state.lines);
  const avgX =
    state.lines.reduce((sum, line) => sum + (line.x ?? 0), 0) / Math.max(1, state.lines.length);
  const avgFontSize =
    state.lines.reduce((sum, line) => sum + (line.fontSize ?? 0), 0) /
    Math.max(1, state.lines.length);

  return {
    id: `para-${index}`,
    text,
    lineIds: state.lines.map((line) => line.id || ""),
    startLineIndex: state.startLineIndex,
    endLineIndex: state.endLineIndex,
    avgX,
    avgFontSize,
    confidence: estimateParagraphConfidence(state.lines, text),
    kind: classifyParagraphKind(state.lines, text),
  };
}

function joinParagraphLines(lines: RawLine[]): string {
  if (!lines.length) return "";

  const pieces: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const current = lines[i].text;
    const prev = pieces.length ? pieces[pieces.length - 1] : "";

    if (!prev) {
      pieces.push(current);
      continue;
    }

    if (/-$/.test(prev)) {
      pieces[pieces.length - 1] = prev.replace(/-$/, "") + current;
      continue;
    }

    if (startsLowercase(current) || endsWeak(prev)) {
      pieces[pieces.length - 1] = `${prev} ${current}`.trim();
      continue;
    }

    pieces.push(current);
  }

  return pieces.join(" ").replace(/\s+/g, " ").trim();
}

function estimateParagraphConfidence(lines: RawLine[], text: string): number {
  let score = 0.5;

  if (text.length > 40) score += 0.1;
  if (/[.!?]$/.test(text)) score += 0.1;
  if (!isTableLike(text)) score += 0.1;
  if (lines.length > 1) score += 0.1;
  if (!isLikelyStandaloneHeading(textToLine(text))) score += 0.1;

  return Math.max(0, Math.min(1, score));
}

function classifyParagraphKind(lines: RawLine[], text: string): ReconstructedParagraph["kind"] {
  if (isTableLike(text)) return "table_like";
  if (isLikelyStandaloneHeading(lines[0])) return "heading_like";
  if (isBullet(text)) return "bullet";
  return "prose";
}

function textToLine(text: string): RawLine {
  return { text };
}

function isBullet(text: string): boolean {
  return BULLET_RE.test(text);
}

function isLikelyStandaloneHeading(line: RawLine): boolean {
  const text = line.text.trim();
  if (!text) return false;
  if (text.length > 120) return false;
  if (/[.!?]$/.test(text)) return false;
  if (isBullet(text)) return false;
  if (HEADING_NUMBER_RE.test(text)) return true;
  if ((line.isBold || false) && text.length < 90) return true;
  if (isMostlyTitleCase(text) && text.length < 80) return true;
  if (isMostlyUppercase(text) && text.length < 80) return true;
  return false;
}

function isTableLike(text: string): boolean {
  const pipeCount = (text.match(/\|/g) || []).length;
  const multiGap = /\S+\s{3,}\S+/.test(text);
  const repeatedNumbers = (text.match(/\d+/g) || []).length >= 4;
  return pipeCount >= 2 || multiGap || repeatedNumbers;
}

function hasLargeVerticalGap(prev: RawLine, next: RawLine): boolean {
  if (prev.y == null || next.y == null) return false;
  const prevHeight = prev.height ?? prev.fontSize ?? 12;
  const gap = Math.abs(next.y - prev.y);
  return gap > prevHeight * 1.8;
}

function hasStrongIndentShift(prev: RawLine, next: RawLine): boolean {
  if (prev.x == null || next.x == null) return false;
  return Math.abs(next.x - prev.x) > 20;
}

function hasFontJump(prev: RawLine, next: RawLine): boolean {
  if (prev.fontSize == null || next.fontSize == null) return false;
  return Math.abs(next.fontSize - prev.fontSize) >= 3;
}

function sameVisualBlock(prev: RawLine, next: RawLine): boolean {
  const xClose =
    prev.x == null || next.x == null ? true : Math.abs(prev.x - next.x) <= 10;
  const fontClose =
    prev.fontSize == null || next.fontSize == null
      ? true
      : Math.abs(prev.fontSize - next.fontSize) <= 1.5;
  return xClose && fontClose;
}

function endsStrong(text: string): boolean {
  return /[.!?:"")]$/.test(text);
}

function endsWeak(text: string): boolean {
  return /[,;:–—-]$/.test(text);
}

function startsLowercase(text: string): boolean {
  return /^[a-z(]/.test(text);
}

function startsNewSentence(text: string): boolean {
  return /^[A-Z0-9""(\[]/.test(text);
}

function isHyphenContinuation(text: string): boolean {
  return /-$/.test(text);
}

function isMostlyUppercase(text: string): boolean {
  const letters = text.replace(/[^A-Za-z]/g, "");
  if (!letters.length) return false;
  const upper = letters.replace(/[^A-Z]/g, "").length;
  return upper / letters.length > 0.7;
}

function isMostlyTitleCase(text: string): boolean {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 12) return false;
  let titleish = 0;
  for (const word of words) {
    if (/^[A-Z][a-z]+/.test(word) || /^\d/.test(word)) titleish += 1;
  }
  return titleish / words.length > 0.6;
}
