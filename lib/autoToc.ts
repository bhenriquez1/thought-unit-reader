import type { TocNode } from "./readerContracts";

export interface PageTextBundle {
  page: number;
  text: string;
}

const STRUCTURED_RE = /^(chapter|ch\.?|unit|week|module|assignment|exam)\s+([\w.-]+)\b[:.\- ]*(.*)$/i;
const SECTION_RE = /^((\d+(\.\d+){0,3})|([A-Z]\.)|([IVXLC]+\.))\s+(.{2,})$/;
const FRONTMATTER_RE = /^(preface|foreword|introduction|contents|table of contents|syllabus)$/i;

const isTitleCase = (line: string) => {
  const words = line.trim().split(/\s+/);
  if (words.length < 2 || words.length > 12) return false;
  const upperStart = words.filter((w) => /^[A-Z][a-z]/.test(w)).length;
  return upperStart / words.length > 0.6;
};

function cleanLine(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}

function getCandidateLines(text: string): string[] {
  return text
    .split("\n")
    .map(cleanLine)
    .filter((line) => line.length >= 3 && line.length <= 140);
}

function classifyLine(line: string): TocNode["kind"] | null {
  if (STRUCTURED_RE.test(line)) {
    if (/assignment|exam/i.test(line)) return "assignment";
    if (/week|module|unit/i.test(line)) return "week";
    return "chapter";
  }
  if (FRONTMATTER_RE.test(line)) return "frontmatter";
  if (SECTION_RE.test(line)) return /^\d+\.\d+\.\d+/.test(line) ? "subsection" : "section";
  return null;
}

function scoreLine(line: string): number {
  let score = 0;
  const kind = classifyLine(line);
  if (kind) score += 7;
  if (/^[A-Z0-9 .:\-]+$/.test(line)) score += 3;
  if (isTitleCase(line)) score += 2;
  if (line.length < 90) score += 1;
  if (/\.{2,}\s*\d+$/.test(line)) score += 1;
  return score;
}

function buildFallbackToc(pages: PageTextBundle[]): TocNode[] {
  const clusterSize = 10;
  const nodes: TocNode[] = [];
  for (let start = 1; start <= pages.length; start += clusterSize) {
    const end = Math.min(start + clusterSize - 1, pages.length);
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
  const flat: TocNode[] = [];

  for (const page of pages) {
    const lines = getCandidateLines(page.text);

    for (const line of lines) {
      const structuredKind = classifyLine(line);
      const uppercaseHeuristic = /^[A-Z0-9\s\-:]{4,}$/.test(line) && line.length < 90;
      const titleHeuristic = isTitleCase(line) && line.length < 90;

      const kind = structuredKind || (uppercaseHeuristic ? "section" : titleHeuristic ? "subsection" : null);
      if (!kind) continue;
      const score = scoreLine(line);
      if (score < 5) continue;

      flat.push({
        id: `auto-${kind}-${page.page}-${line.slice(0, 30)}`,
        title: line,
        page: page.page,
        kind,
        source: "auto",
        children: [],
      });
    }
  }

  const deduped = dedupeNearby(flat);
  const nested = nestToc(deduped);
  if (nested.length > 0) return nested;

  return buildFallbackToc(pages);
}

function dedupeNearby(nodes: TocNode[]): TocNode[] {
  const out: TocNode[] = [];

  for (const node of nodes) {
    const already = out.find(
      (x) =>
        x.title.toLowerCase() === node.title.toLowerCase() &&
        Math.abs(x.page - node.page) <= 2,
    );
    if (!already) out.push(node);
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

    if (item.kind === "assignment") {
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
  }

  return root;
}
