import type { TocNode } from "./readerContracts";

export interface PageTextBundle {
  page: number;
  text: string;
}

const STRUCTURED_HEADING_RE = /^(chapter|ch\.?|unit|week|module|assignment|exam|lecture|part|appendix)\s+([\w.-]+)\b[:.\- ]*(.*)$/i;
const SECTION_NUMBER_RE = /^((\d+(\.\d+){0,3})|([A-Z]\.)|([IVXLC]+\.))\s+(.{2,})$/;
const FRONTMATTER_RE = /^(preface|foreword|introduction|contents|table of contents|syllabus)$/i;
const ASSIGNMENT_WORD_RE = /\b(quiz|exam|midterm|final|assignment|project|discussion|deadline|due)\b/i;
const CONTENTS_ROW_RE = /^(.{3,}?)\s*\.{2,}\s*(\d{1,4})$/;

function cleanLine(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}

function getCandidateLines(text: string): string[] {
  return text
    .split("\n")
    .map(cleanLine)
    .filter((line) => line.length >= 3 && line.length <= 180);
}

function isUppercaseHeading(line: string): boolean {
  return /^[A-Z0-9\s\-:&/,.'()]+$/.test(line) && line.length <= 90;
}

function isTitleCaseHeading(line: string): boolean {
  const words = line.trim().split(/\s+/);
  if (words.length < 2 || words.length > 14) return false;
  const startsUpper = words.filter((word) => /^[A-Z][a-z]/.test(word)).length;
  return startsUpper / words.length >= 0.65;
}

function classifyStructured(line: string): TocNode["kind"] | null {
  if (STRUCTURED_HEADING_RE.test(line)) {
    if (/assignment|quiz/i.test(line)) return "assignment";
    if (/exam|midterm|final/i.test(line)) return "exam";
    if (/week|module|unit|part/i.test(line)) return "week";
    if (/appendix/i.test(line)) return "topic";
    return "chapter";
  }
  if (FRONTMATTER_RE.test(line)) return "frontmatter";
  if (SECTION_NUMBER_RE.test(line)) {
    return /^\d+\.\d+\.\d+/.test(line) ? "subsection" : "section";
  }
  return null;
}

function scoreStructured(line: string): number {
  let score = 0;
  if (STRUCTURED_HEADING_RE.test(line)) score += 9;
  if (FRONTMATTER_RE.test(line)) score += 7;
  if (SECTION_NUMBER_RE.test(line)) score += 7;
  if (ASSIGNMENT_WORD_RE.test(line)) score += 4;
  if (line.length < 90) score += 1;
  return score;
}

function scoreHeadingHeuristic(line: string): number {
  let score = 0;
  if (isUppercaseHeading(line)) score += 4;
  if (isTitleCaseHeading(line)) score += 3;
  if (line.length <= 70) score += 1;
  if (ASSIGNMENT_WORD_RE.test(line)) score += 2;
  return score;
}

function scoreLayoutHeuristic(line: string, index: number, lines: string[]): number {
  let score = 0;
  const prev = lines[index - 1] || "";
  const next = lines[index + 1] || "";
  const isolated = prev.length === 0 || next.length === 0;
  if (index <= 2) score += 2;
  if (isolated) score += 2;
  if (line.length >= 8 && line.length <= 65) score += 2;
  if (/^(course|lab schedule|grading|attendance|learning goals|objectives|policy|diagnosis|general pharmacology)/i.test(line)) score += 3;
  if (/\.{2,}\s*\d+$/.test(line)) score += 2;
  return score;
}

function dedupeNearby(nodes: TocNode[]): TocNode[] {
  const out: TocNode[] = [];
  for (const node of nodes) {
    const dupe = out.find((x) => x.title.toLowerCase() === node.title.toLowerCase() && Math.abs(x.page - node.page) <= 2);
    if (!dupe) out.push(node);
  }
  return out.sort((a, b) => a.page - b.page);
}

function nestToc(flat: TocNode[]): TocNode[] {
  const root: TocNode[] = [];
  let currentChapter: TocNode | null = null;
  let currentSection: TocNode | null = null;

  for (const item of flat) {
    if (item.kind === "chapter" || item.kind === "week" || item.kind === "frontmatter" || item.kind === "topic") {
      root.push({ ...item, children: [] });
      currentChapter = root[root.length - 1];
      currentSection = null;
      continue;
    }

    if (item.kind === "section" || item.kind === "objective" || item.kind === "policy") {
      if (currentChapter) {
        currentChapter.children ||= [];
        currentChapter.children.push({ ...item, children: [] });
        currentSection = currentChapter.children[currentChapter.children.length - 1];
      } else {
        root.push({ ...item, children: [] });
        currentSection = root[root.length - 1];
      }
      continue;
    }

    if (item.kind === "subsection" || item.kind === "assignment" || item.kind === "exam" || item.kind === "deadline") {
      if (currentSection) {
        currentSection.children ||= [];
        currentSection.children.push({ ...item, children: [] });
      } else if (currentChapter) {
        currentChapter.children ||= [];
        currentChapter.children.push({ ...item, children: [] });
      } else {
        root.push({ ...item, children: [] });
      }
      continue;
    }

    root.push({ ...item, children: [] });
  }

  return root;
}

function strongestLineForCluster(page: PageTextBundle | undefined): string | null {
  if (!page) return null;
  const lines = getCandidateLines(page.text);
  let best: { line: string; score: number } | null = null;
  for (let i = 0; i < Math.min(lines.length, 18); i += 1) {
    const line = lines[i];
    const score = scoreHeadingHeuristic(line) + scoreLayoutHeuristic(line, i, lines);
    if (!best || score > best.score) best = { line, score };
  }
  return best && best.score >= 5 ? best.line : null;
}

function buildFallbackToc(pages: PageTextBundle[], lowTextLayer: boolean): TocNode[] {
  if (!pages.length) return [];
  const maxPage = Math.max(...pages.map((p) => p.page));
  const clusterSize = 10;
  const nodes: TocNode[] = [];

  if (lowTextLayer) {
    nodes.push({
      id: "low-text-layer",
      title: "Limited text layer detected",
      page: 1,
      kind: "frontmatter",
      source: "fallback",
      confidence: 0.15,
      children: [],
    });
  }

  for (let start = 1; start <= maxPage; start += clusterSize) {
    const end = Math.min(start + clusterSize - 1, maxPage);
    const idx = nodes.length + 1;
    const anchorPage = pages.find((p) => p.page === start) || pages.find((p) => p.page >= start && p.page <= end);
    const strongTitle = strongestLineForCluster(anchorPage);
    nodes.push({
      id: `fallback-topic-${idx}`,
      title: strongTitle || `Topic ${idx} (pp. ${start}–${end})`,
      page: start,
      kind: "topic",
      source: "fallback",
      confidence: strongTitle ? 0.42 : 0.28,
      children: [],
    });
  }
  return nodes;
}

function mineContentsPages(pages: PageTextBundle[]): TocNode[] {
  const mined: TocNode[] = [];
  for (const page of pages.slice(0, Math.min(15, pages.length))) {
    const lines = getCandidateLines(page.text);
    const isContentsPage = lines.some((line) => /table of contents|contents/i.test(line));
    if (!isContentsPage) continue;

    for (const line of lines) {
      const match = line.match(CONTENTS_ROW_RE);
      if (!match) continue;
      const title = cleanLine(match[1]);
      const targetPage = Number(match[2]);
      if (!title || Number.isNaN(targetPage)) continue;
      mined.push({
        id: `contents-${page.page}-${title.slice(0, 28)}`,
        title,
        page: targetPage,
        kind: /chapter|unit|part|appendix/i.test(title) ? "chapter" : "section",
        source: "contents",
        confidence: 0.78,
        children: [],
      });
    }
  }
  return mined;
}

export function buildAutoToc(pages: PageTextBundle[]): TocNode[] {
  if (!pages.length) return [];
  const avgChars = pages.reduce((sum, p) => sum + p.text.trim().length, 0) / pages.length;
  const lowTextLayer = avgChars < 180;

  const layerStructured: TocNode[] = [];
  const layerHeading: TocNode[] = [];
  const layerLayout: TocNode[] = [];
  const layerContents: TocNode[] = mineContentsPages(pages);

  for (const page of pages) {
    const lines = getCandidateLines(page.text);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const structuredKind = classifyStructured(line);

      if (structuredKind && scoreStructured(line) >= 6) {
        const score = scoreStructured(line);
        layerStructured.push({
          id: `structured-${structuredKind}-${page.page}-${line.slice(0, 30)}`,
          title: line,
          page: page.page,
          kind: structuredKind,
          source: "structured",
          confidence: Math.min(1, score / 12),
          children: [],
        });
        continue;
      }

      const headingScore = scoreHeadingHeuristic(line);
      if (headingScore >= 5) {
        layerHeading.push({
          id: `heading-${page.page}-${line.slice(0, 30)}`,
          title: line,
          page: page.page,
          kind: isUppercaseHeading(line) ? "section" : "subsection",
          source: "structured",
          confidence: Math.min(0.88, headingScore / 10),
          children: [],
        });
        continue;
      }

      const layoutScore = scoreLayoutHeuristic(line, i, lines);
      if (layoutScore >= 6) {
        layerLayout.push({
          id: `layout-${page.page}-${line.slice(0, 30)}`,
          title: line,
          page: page.page,
          kind: "section",
          source: "layout",
          confidence: Math.min(0.8, layoutScore / 10),
          children: [],
        });
      }
    }
  }

  const preferred =
    layerContents.length > 0 ? layerContents :
    layerStructured.length > 0 ? layerStructured :
    layerHeading.length > 0 ? layerHeading :
    layerLayout;

  const nested = nestToc(dedupeNearby(preferred));
  return nested.length > 0 ? nested : buildFallbackToc(pages, lowTextLayer);
}
