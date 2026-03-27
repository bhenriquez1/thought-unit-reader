import type { TocNode } from "@/lib/readerContracts";
import type { PageTextBundle } from "@/lib/autoToc";
import { buildAutoToc } from "@/lib/autoToc";

const DATE_RE = /\b(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\b/;
const POLICY_RE = /\b(policy|attendance|grading|academic integrity|late work|absence)\b/i;
const OBJECTIVE_RE = /\b(objective|learning goal|outcome|competenc)\b/i;
const EXAM_RE = /\b(exam|midterm|final)\b/i;
const ASSIGNMENT_RE = /\b(quiz|report|assignment|homework|project)\b/i;
const DEADLINE_RE = /\b(due|withdraw|deadline|holiday|no class)\b/i;

function cleanLine(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}

function toNode(kind: TocNode["kind"], page: number, title: string, source: TocNode["source"] = "auto"): TocNode {
  return {
    id: `syllabus-${kind}-${page}-${title.slice(0, 24).replace(/\W+/g, "-")}`,
    kind,
    title,
    page,
    source,
    children: [],
  };
}

function inferSyllabusKind(line: string): TocNode["kind"] | null {
  if (EXAM_RE.test(line)) return "exam";
  if (ASSIGNMENT_RE.test(line)) return "assignment";
  if (DEADLINE_RE.test(line)) return "deadline";
  if (POLICY_RE.test(line)) return "policy";
  if (OBJECTIVE_RE.test(line)) return "objective";
  if (DATE_RE.test(line)) return "week";
  return null;
}

function parseScheduleRows(page: PageTextBundle): TocNode[] {
  const lines = page.text.split(/\n+/).map(cleanLine).filter(Boolean);
  const rowNodes: TocNode[] = [];

  for (const line of lines) {
    const hasDate = DATE_RE.test(line);
    const looksLikeSchedule = hasDate && (/(quiz|report|exam|lab|exercise|topic|chapter|cell|microscope|safety)/i.test(line));
    if (!looksLikeSchedule) continue;

    const kind = inferSyllabusKind(line) || "week";
    rowNodes.push(toNode(kind, page.page, line));
  }

  return rowNodes;
}


function groupByWeek(nodes: TocNode[]): TocNode[] {
  const grouped: TocNode[] = [];
  const seen = new Map<string, TocNode>();

  for (const node of nodes) {
    const dateMatch = node.title.match(DATE_RE);
    if (!dateMatch) {
      grouped.push(node);
      continue;
    }
    const key = `${node.page}-${dateMatch[1]}`;
    if (!seen.has(key)) {
      const weekNode = toNode("week", node.page, `Week ${dateMatch[1]}`);
      weekNode.children = [];
      seen.set(key, weekNode);
      grouped.push(weekNode);
    }
    seen.get(key)!.children!.push(node);
  }

  return grouped;
}

export function buildSyllabusToc(pages: PageTextBundle[]): TocNode[] {
  if (!pages.length) return [];

  const root: TocNode[] = [];

  // 1) High-level course metadata from first pages
  for (const page of pages.slice(0, 3)) {
    const lines = page.text.split(/\n+/).map(cleanLine).filter(Boolean);
    for (const line of lines.slice(0, 20)) {
      if (/^course\b|^bio\s*\d+/i.test(line)) root.push(toNode("topic", page.page, line));
      if (/instructor|professor|office hours/i.test(line)) root.push(toNode("topic", page.page, line));
      if (POLICY_RE.test(line)) root.push(toNode("policy", page.page, line));
      if (OBJECTIVE_RE.test(line)) root.push(toNode("objective", page.page, line));
    }
  }

  // 2) Schedule parsing for table-like pages (date/topic/exercise rows)
  for (const page of pages) {
    const lowered = page.text.toLowerCase();
    const tableLike = /date\s+topic\s+exercise|lab schedule|schedule/.test(lowered);
    if (!tableLike && page.page !== 6) continue; // explicit rescue path for known schedule page patterns
    root.push(...parseScheduleRows(page));
  }

  // 3) General syllabus-aware line classification
  for (const page of pages) {
    const lines = page.text.split(/\n+/).map(cleanLine).filter(Boolean);
    for (const line of lines.slice(0, 40)) {
      const kind = inferSyllabusKind(line);
      if (!kind) continue;
      if (line.length < 6 || line.length > 160) continue;
      root.push(toNode(kind, page.page, line));
    }
  }

  // dedupe
  const deduped = root.filter((node, index, arr) =>
    arr.findIndex((x) => x.kind === node.kind && x.page === node.page && x.title.toLowerCase() === node.title.toLowerCase()) === index,
  );

  if (deduped.length > 0) return groupByWeek(deduped.sort((a, b) => a.page - b.page));

  // 4) Final fallback to general TOC engine
  return buildAutoToc(pages);
}
