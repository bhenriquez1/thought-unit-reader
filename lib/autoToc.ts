import type { TocNode } from "./readerContracts";

export interface PageTextBundle {
  page: number;
  text: string;
}

const STRUCTURED_HEADING_RE = /^(chapter|ch\.?|unit|week|module|assignment|exam|lecture|part|appendix)\s+([\w.-]+)\b[:.\- ]*(.*)$/i;
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
    .filter((line) => line.length >= 3 && line.length <= 160);
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

// Layer C: layout-ish heuristics with line isolation / page-start signals
function scoreLayoutHeuristic(line: string, index: number, lines: string[]): number {
  let score = 0;
  const prev = lines[index - 1] || "";
  const next = lines[index + 1] || "";
  const isolated = prev.length === 0 || next.length === 0;
  if (index <= 2) score += 2; // page-start heading bias
  if (isolated) score += 2;
  if (line.length >= 8 && line.length <= 65) score += 2;
  if (/^(course|lab schedule|grading|attendance|learning goals|objectives|policy)/i.test(line)) score += 3;
  if (/\.\.\.\s*\d+$/.test(line)) score += 2; // TOC-like dot leaders
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

function buildFallbackToc(pages: PageTextBundle[]): TocNode[] {
  if (!pages.length) return [];
  const maxPage = Math.max(...pages.map((p) => p.page));
  const clusterSize = 10;
  const nodes: TocNode[] = [];
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
      children: [],
    });
  }
  return nodes;
}

export function buildAutoToc(pages: PageTextBundle[]): TocNode[] {
  if (!pages.length) return [];

  const layerStructured: TocNode[] = [];
  const layerHeading: TocNode[] = [];
  const layerLayout: TocNode[] = [];

  for (const page of pages) {
    const lines = getCandidateLines(page.text);

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const structuredKind = classifyStructured(line);

      // Layer B: structured parser
      if (structuredKind && scoreStructured(line) >= 6) {
        layerStructured.push({
          id: `auto-structured-${structuredKind}-${page.page}-${line.slice(0, 30)}`,
          title: line,
          page: page.page,
          kind: structuredKind,
          source: "auto",
          children: [],
        });
        continue;
      }

      // Layer C1: heading heuristics
      if (scoreHeadingHeuristic(line) >= 5) {
        layerHeading.push({
          id: `auto-heading-${page.page}-${line.slice(0, 30)}`,
          title: line,
          page: page.page,
          kind: isUppercaseHeading(line) ? "section" : "subsection",
          source: "auto",
          children: [],
        });
        continue;
      }

      // Layer C2: layout-ish heuristics
      if (scoreLayoutHeuristic(line, i, lines) >= 6) {
        layerLayout.push({
          id: `auto-layout-${page.page}-${line.slice(0, 30)}`,
          title: line,
          page: page.page,
          kind: "section",
          source: "auto",
          children: [],
        });
      }
    }
  }

  const preferred = layerStructured.length > 0 ? layerStructured : layerHeading.length > 0 ? layerHeading : layerLayout;
  const nested = nestToc(dedupeNearby(preferred));

  // Layer D fallback clusters with smart labels.
  return nested.length > 0 ? nested : buildFallbackToc(pages);
}
