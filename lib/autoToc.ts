import type { TocNode } from "./readerContracts";

export interface PageTextBundle {
  page: number;
  text: string;
}

const STRUCTURED_HEADING_RE = /^(chapter|ch\.?|unit|week|module|assignment|exam|lecture)\s+([\w.-]+)\b[:.\- ]*(.*)$/i;
const SECTION_NUMBER_RE = /^((\d+(\.\d+){0,3})|([A-Z]\.)|([IVXLC]+\.))\s+(.{2,})$/;
const FRONTMATTER_RE = /^(preface|foreword|introduction|contents|table of contents|syllabus)$/i;
const ASSIGNMENT_WORD_RE = /\b(quiz|exam|midterm|final|assignment|project|discussion|deadline|due)\b/i;

function cleanLine(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}

function getCandidateLines(text: string): string[] {
  return text
    .split("\n")
    .map(cleanLine)
    .filter((line) => line.length >= 3 && line.length <= 140);
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
    if (/assignment|exam/i.test(line)) return "assignment";
    if (/week|module|unit/i.test(line)) return "week";
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

function scoreHeuristic(line: string): number {
  let score = 0;
  if (isUppercaseHeading(line)) score += 4;
  if (isTitleCaseHeading(line)) score += 3;
  if (line.length <= 70) score += 1;
  if (ASSIGNMENT_WORD_RE.test(line)) score += 2;
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
    if (item.kind === "chapter" || item.kind === "week" || item.kind === "frontmatter") {
      root.push({ ...item, children: [] });
      currentChapter = root[root.length - 1];
      currentSection = null;
      continue;
    }

    if (item.kind === "section") {
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

    if (item.kind === "subsection") {
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

    if (currentSection) {
      currentSection.children ||= [];
      currentSection.children.push({ ...item, children: [] });
    } else if (currentChapter) {
      currentChapter.children ||= [];
      currentChapter.children.push({ ...item, children: [] });
    } else {
      root.push({ ...item, children: [] });
    }
  }

  return root;
}

function buildFallbackToc(pages: PageTextBundle[]): TocNode[] {
  if (!pages.length) return [];
  const maxPage = Math.max(...pages.map((p) => p.page));
  const clusterSize = 10;
  const nodes: TocNode[] = [];
  for (let start = 1; start <= maxPage; start += clusterSize) {
    const end = Math.min(start + clusterSize - 1, maxPage);
    const idx = nodes.length + 1;
    nodes.push({
      id: `fallback-topic-${idx}`,
      title: `Topic ${idx} (pp. ${start}–${end})`,
      page: start,
      kind: "section",
      source: "fallback",
      children: [],
    });
  }
  return nodes;
}

export function buildAutoToc(pages: PageTextBundle[]): TocNode[] {
  if (!pages.length) return [];

  const structured: TocNode[] = [];
  const heuristic: TocNode[] = [];

  for (const page of pages) {
    const lines = getCandidateLines(page.text);

    for (const line of lines) {
      const structuredKind = classifyStructured(line);
      if (structuredKind && scoreStructured(line) >= 6) {
        structured.push({
          id: `auto-structured-${structuredKind}-${page.page}-${line.slice(0, 30)}`,
          title: line,
          page: page.page,
          kind: structuredKind,
          source: "auto",
          children: [],
        });
        continue;
      }

      if (scoreHeuristic(line) >= 5) {
        heuristic.push({
          id: `auto-heuristic-${page.page}-${line.slice(0, 30)}`,
          title: line,
          page: page.page,
          kind: isUppercaseHeading(line) ? "section" : "subsection",
          source: "auto",
          children: [],
        });
      }
    }
  }

  const flattened = structured.length > 0 ? structured : heuristic;
  const nested = nestToc(dedupeNearby(flattened));
  return nested.length > 0 ? nested : buildFallbackToc(pages);
}
