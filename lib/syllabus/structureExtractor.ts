// lib/syllabus/structureExtractor.ts
// Deterministic extraction of structure candidates from TocNode[].
// No AI involved — converts the existing reader TOC into stable, server-owned candidates.
// The AI route may reference only the IDs produced here.
//
// Pipeline:
//   1. Extract structural TocNodes (chapter, section, subsection, week, topic)
//   2. Apply deterministic quality filter — reject body sentences, repeated headers,
//      and near-duplicate chapter pages BEFORE the AI sees any candidates.
//   3. Sort by startPage → guaranteed monotonic page order.
//   4. Compute endPage from the filtered, sorted list so page ranges remain correct
//      even when bad nodes are removed.
//   5. Assign stable IDs c0…cN (sequential after filtering).

import type { TocNode } from "@/lib/readerContracts";
import type { StructureCandidate, StructureSource } from "./syllabusSchema";

// ── Structural kind whitelist ─────────────────────────────────────────────

const STRUCTURAL_KINDS = new Set<TocNode["kind"]>([
  "chapter", "section", "subsection", "week", "topic",
]);

// ── Source / level mappers ────────────────────────────────────────────────

function mapSource(src: TocNode["source"]): StructureSource {
  switch (src) {
    case "outline":     return "bookmark";
    case "structured":  return "bookmark";
    case "contents":    return "toc";
    case "layout":      return "heading";
    case "syllabus":    return "uploaded";
    case "fallback":    return "ai-inferred";
    default:            return "heading";
  }
}

function mapLevel(kind: TocNode["kind"]): 1 | 2 | 3 {
  if (kind === "chapter" || kind === "week") return 1;
  if (kind === "section" || kind === "topic") return 2;
  return 3;
}

// ── Tree flattening ───────────────────────────────────────────────────────

function flattenNodes(nodes: TocNode[]): TocNode[] {
  const out: TocNode[] = [];
  function visit(node: TocNode) {
    out.push(node);
    if (node.children) node.children.forEach(visit);
  }
  nodes.forEach(visit);
  return out;
}

// ── Candidate quality filter ──────────────────────────────────────────────
// Deterministic rejection runs BEFORE the AI prompt.
// The AI must not be asked to "repair" bad structure candidates —
// bad candidates are excluded so only plausible chapter/section headings enter.
//
// Rejection criteria:
//   title-too-long           — likely a body paragraph promoted as a heading
//   body-sentence            — ends with sentence punctuation AND high lowercase ratio
//   body-sentence-lowercase  — predominantly lowercase multi-word title
//   repeated-header          — same text ≥3 times → running page header / footer
//   near-duplicate-page      — two level-1 chapters start within 1 page of each other

const MAX_TITLE_CHARS          = 120;
const SENTENCE_TAIL            = /[.?!;]$/;
const LOWERCASE_WITH_PUNCT     = 0.30;  // lowercase ratio threshold when title ends with punct
const LOWERCASE_STANDALONE     = 0.45;  // lowercase ratio threshold without punctuation

type RejectReason =
  | "title-too-long"
  | "body-sentence"
  | "body-sentence-lowercase"
  | "repeated-header";

interface RawCandidate {
  title:      string;
  level:      1 | 2 | 3;
  startPage:  number;
  source:     StructureSource;
  confidence: number;
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function lowercaseWordRatio(text: string): number {
  const words = text.split(/\s+/).filter(w => /^[a-zA-Z]/.test(w));
  if (words.length === 0) return 0;
  return words.filter(w => /^[a-z]/.test(w)).length / words.length;
}

function contentRejectReason(
  raw:         RawCandidate,
  occurrences: number,
): RejectReason | null {
  const { title } = raw;
  const words = wordCount(title);

  if (title.length > MAX_TITLE_CHARS)
    return "title-too-long";

  // "The pulp consists of connective tissue."   → rejected (punct + lowercase)
  // "Analysis of Pulp and Dentin Biology."      → NOT rejected (low lowercase ratio ~0.33)
  if (words >= 5 && SENTENCE_TAIL.test(title) && lowercaseWordRatio(title) > LOWERCASE_WITH_PUNCT)
    return "body-sentence";

  // Predominantly lowercase multi-word title (no punctuation needed)
  if (words >= 6 && lowercaseWordRatio(title) > LOWERCASE_STANDALONE)
    return "body-sentence-lowercase";

  // Same exact text ≥3 times → running header or footer
  if (occurrences >= 3)
    return "repeated-header";

  return null;
}

function qualityFilter(raws: RawCandidate[]): RawCandidate[] {
  // Count title occurrences (case-insensitive) for header/footer detection
  const titleCounts = new Map<string, number>();
  for (const r of raws) {
    const key = r.title.toLowerCase();
    titleCounts.set(key, (titleCounts.get(key) ?? 0) + 1);
  }

  // Pass 1: content quality — reject body sentences and repeated headers
  const passed: RawCandidate[] = [];
  for (const r of raws) {
    const reason = contentRejectReason(r, titleCounts.get(r.title.toLowerCase()) ?? 1);
    if (reason) {
      console.log("[STRUCTURE_EXTRACTOR:rejected]", { title: r.title.slice(0, 70), reason });
    } else {
      passed.push(r);
    }
  }

  // Pass 2: near-duplicate page deduplication for level-1 chapters.
  // Two top-level chapters starting within 1 page of each other → keep higher-confidence.
  const keepSet = new Set(passed.map((_, i) => i));

  for (let i = 0; i < passed.length; i++) {
    if (!keepSet.has(i) || passed[i].level !== 1) continue;
    for (let j = i + 1; j < passed.length; j++) {
      if (!keepSet.has(j) || passed[j].level !== 1) continue;
      if (Math.abs(passed[i].startPage - passed[j].startPage) <= 1) {
        const loser  = passed[i].confidence >= passed[j].confidence ? j : i;
        const winner = loser === i ? j : i;
        console.log("[STRUCTURE_EXTRACTOR:near-duplicate-page]", {
          kept:    passed[winner].title.slice(0, 70),
          dropped: passed[loser].title.slice(0, 70),
          pages:   [passed[i].startPage, passed[j].startPage],
        });
        keepSet.delete(loser);
        if (loser === i) break;  // i itself dropped; advance outer loop
      }
    }
  }

  return passed.filter((_, i) => keepSet.has(i));
}

// ── endPage computation ───────────────────────────────────────────────────
// Runs on the filtered, sorted candidate list so that page ranges correctly
// span any gaps left by rejected candidates.

function computeEndPages(
  raws:       RawCandidate[],
  totalPages: number,
): Array<RawCandidate & { endPage?: number }> {
  return raws.map((raw, i) => {
    let endPage: number | undefined;
    for (let j = i + 1; j < raws.length; j++) {
      if (raws[j].level <= raw.level) {
        endPage = Math.max(raws[j].startPage - 1, raw.startPage);
        break;
      }
    }
    if (endPage === undefined && i === raws.length - 1) {
      endPage = totalPages;
    }
    return { ...raw, endPage };
  });
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Build stable StructureCandidate[] from a TocNode tree.
 * Page ranges, level, and provenance are computed deterministically.
 * Quality filter removes bad candidates before they can reach the AI prompt.
 * The AI generation route may reference only the IDs produced here.
 */
export function extractStructureCandidates(
  tocNodes:   TocNode[],
  totalPages: number,
): StructureCandidate[] {
  const flat = flattenNodes(tocNodes)
    .filter(n => STRUCTURAL_KINDS.has(n.kind) && n.page >= 1 && n.title.trim().length > 0);

  if (flat.length === 0) return [];

  const raw: RawCandidate[] = flat.map(node => ({
    title:      node.title.trim(),
    level:      mapLevel(node.kind),
    startPage:  node.page,
    source:     mapSource(node.source),
    confidence: node.confidence ?? (node.source === "outline" ? 0.95 : 0.75),
  }));

  const filtered = qualityFilter(raw);
  if (filtered.length === 0) return [];

  // Sort by startPage → monotonic page order
  // Tiebreaker: higher level (more specific) nodes come after their parent
  filtered.sort((a, b) =>
    a.startPage !== b.startPage ? a.startPage - b.startPage : a.level - b.level,
  );

  const withEndPages = computeEndPages(filtered, totalPages);

  // Assign clean sequential IDs after filtering and sorting
  return withEndPages.map((c, i) => ({
    id:         `c${i}`,
    title:      c.title,
    level:      c.level,
    startPage:  c.startPage,
    endPage:    c.endPage,
    source:     c.source,
    confidence: c.confidence,
  }));
}

/**
 * Build a compact structural summary string for the AI prompt.
 * Sent instead of raw page content to keep token count bounded.
 */
export function buildSampleContent(
  candidates:  StructureCandidate[],
  getPageText: (page: number) => string,
): string {
  const lines: string[] = [
    `BOOK STRUCTURE (${candidates.length} detected sections):`,
  ];

  candidates
    .filter(c => c.level === 1)
    .forEach(c => {
      const sample    = getPageText(c.startPage).slice(0, 200).replace(/\s+/g, " ").trim();
      const pageRange = c.endPage ? `p.${c.startPage}–${c.endPage}` : `p.${c.startPage}+`;
      lines.push(`  [${c.id}] ${c.title} (${pageRange}) [${c.source}]`);
      if (sample) lines.push(`         Preview: "${sample}"`);
    });

  candidates
    .filter(c => c.level >= 2)
    .forEach(c => {
      const indent = c.level === 2 ? "    ↳" : "       ·";
      lines.push(`${indent} [${c.id}] ${c.title} (p.${c.startPage})`);
    });

  return lines.join("\n");
}
