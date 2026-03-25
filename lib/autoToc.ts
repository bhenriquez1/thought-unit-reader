import type { TocNode } from "./readerContracts";

export interface PageTextBundle {
  page: number;
  text: string;
}

const CHAPTER_RE =
  /^(chapter|ch\.?|lecture)\s+(\d+|[ivxlcdm]+)\b[:.\- ]*(.*)$/i;

const SECTION_RE =
  /^((\d+(\.\d+){0,3})|([A-Z]\.))\s+(.{2,})$/;

const WEEK_RE =
  /^(week\s+\d+|module\s+\d+|unit\s+\d+)\b[:.\- ]*(.*)$/i;

const ASSIGNMENT_RE =
  /\b(quiz|exam|midterm|final|assignment|discussion|project|deadline|due)\b/i;

const FRONTMATTER_RE =
  /^(preface|foreword|introduction|contents|table of contents|syllabus)$/i;

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
  if (CHAPTER_RE.test(line)) return "chapter";
  if (WEEK_RE.test(line)) return "week";
  if (FRONTMATTER_RE.test(line)) return "frontmatter";
  if (SECTION_RE.test(line)) {
    if (/^\d+\.\d+\.\d+/.test(line) || /^\d+\.\d+\.\d+\.\d+/.test(line)) return "subsection";
    return "section";
  }
  if (ASSIGNMENT_RE.test(line)) return "assignment";
  return null;
}

function scoreLine(line: string): number {
  let score = 0;
  if (CHAPTER_RE.test(line)) score += 10;
  if (WEEK_RE.test(line)) score += 9;
  if (SECTION_RE.test(line)) score += 7;
  if (ASSIGNMENT_RE.test(line)) score += 5;
  if (FRONTMATTER_RE.test(line)) score += 6;

  if (/^[A-Z0-9 .:\-]+$/.test(line)) score += 2;
  if (line.length < 90) score += 1;
  if (/\.{2,}\s*\d+$/.test(line)) score += 2;
  return score;
}

export function buildAutoToc(pages: PageTextBundle[]): TocNode[] {
  const flat: TocNode[] = [];

  for (const page of pages) {
    const lines = getCandidateLines(page.text);

    for (const line of lines) {
      const kind = classifyLine(line);
      if (!kind) continue;

      const score = scoreLine(line);
      if (score < 6) continue;

      flat.push({
        id: `${kind}-${page.page}-${line.slice(0, 30)}`,
        title: line,
        page: page.page,
        kind,
        children: [],
      });
    }
  }

  const deduped = dedupeNearby(flat);
  return nestToc(deduped);
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
