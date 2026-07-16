// lib/syllabus/structureExtractor.ts
// Deterministic extraction of structure candidates from TocNode[].
// No AI involved — converts the existing reader TOC into stable, server-owned candidates.
// The AI route may reference only the IDs produced here.

import type { TocNode } from "@/lib/readerContracts";
import type { StructureCandidate, StructureSource } from "./syllabusSchema";

// TocNode.kind values that represent real structural content
const STRUCTURAL_KINDS = new Set<TocNode["kind"]>([
  "chapter", "section", "subsection", "week", "topic",
]);

// TocNode.source → StructureSource
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

// TocNode.kind → candidate level (1=chapter, 2=section, 3=subsection)
function mapLevel(kind: TocNode["kind"]): 1 | 2 | 3 {
  if (kind === "chapter" || kind === "week") return 1;
  if (kind === "section" || kind === "topic") return 2;
  return 3;
}

// Flatten a tree of TocNodes, preserving document order
function flattenNodes(nodes: TocNode[]): TocNode[] {
  const out: TocNode[] = [];
  function visit(node: TocNode) {
    out.push(node);
    if (node.children) node.children.forEach(visit);
  }
  nodes.forEach(visit);
  return out;
}

/**
 * Build stable StructureCandidate[] from a TocNode tree.
 * Page ranges are computed deterministically from document order.
 * The AI route will receive only these IDs and must reference only them.
 */
export function extractStructureCandidates(
  tocNodes: TocNode[],
  totalPages: number,
): StructureCandidate[] {
  const flat = flattenNodes(tocNodes)
    .filter(n => STRUCTURAL_KINDS.has(n.kind) && n.page >= 1 && n.title.trim().length > 0);

  if (flat.length === 0) return [];

  const candidates: StructureCandidate[] = flat.map((node, i) => {
    // endPage: start of the next node at the same or higher level, minus 1
    let endPage: number | undefined;
    for (let j = i + 1; j < flat.length; j++) {
      if (mapLevel(flat[j].kind) <= mapLevel(node.kind)) {
        endPage = Math.max(flat[j].page - 1, node.page);
        break;
      }
    }
    if (!endPage) {
      endPage = i === flat.length - 1 ? totalPages : undefined;
    }

    return {
      id:         `c${i}`,
      title:      node.title.trim(),
      level:      mapLevel(node.kind),
      startPage:  node.page,
      endPage,
      source:     mapSource(node.source),
      confidence: node.confidence ?? (node.source === "outline" ? 0.95 : 0.75),
    };
  });

  return candidates;
}

/**
 * Build a compact structural summary string for the AI prompt.
 * Sent instead of raw page content to keep token count bounded.
 */
export function buildSampleContent(
  candidates: StructureCandidate[],
  getPageText: (page: number) => string,
): string {
  const lines: string[] = [
    `BOOK STRUCTURE (${candidates.length} detected sections):`,
  ];

  // Level-1 chapters with a brief text sample from their first page
  candidates
    .filter(c => c.level === 1)
    .forEach(c => {
      const sample = getPageText(c.startPage).slice(0, 200).replace(/\s+/g, " ").trim();
      const pageRange = c.endPage ? `p.${c.startPage}–${c.endPage}` : `p.${c.startPage}+`;
      lines.push(`  [${c.id}] ${c.title} (${pageRange}) [${c.source}]`);
      if (sample) lines.push(`         Preview: "${sample}"`);
    });

  // List level-2+ as sub-bullets (titles only, no page text)
  candidates
    .filter(c => c.level >= 2)
    .forEach(c => {
      const indent = c.level === 2 ? "    ↳" : "       ·";
      lines.push(`${indent} [${c.id}] ${c.title} (p.${c.startPage})`);
    });

  return lines.join("\n");
}
