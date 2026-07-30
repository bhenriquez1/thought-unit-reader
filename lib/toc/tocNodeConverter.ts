// lib/toc/tocNodeConverter.ts
// Converts SmartPDFViewer TocItem[] (store format) to app-level TocNode[]
// (readerContracts format). Outline-sourced nodes carry source:"outline" and
// high confidence so downstream consumers can prefer them over heuristic results.

import type { TocItem } from "@/lib/stores/tocStore";
import type { TocNode } from "@/lib/readerContracts";

function levelToKind(level: number): TocNode["kind"] {
  if (level === 0) return "chapter";
  if (level === 1) return "section";
  return "subsection";
}

function convertItems(items: TocItem[], level: number): TocNode[] {
  return items
    .filter((item) => item.title?.trim() && item.pageNumber > 0)
    .map((item) => {
      const node: TocNode = {
        id: item.id,
        title: item.title.trim(),
        page: item.pageNumber,
        kind: levelToKind(level),
        source: "outline",
        confidence: 0.95,
      };
      if (item.children?.length) {
        node.children = convertItems(item.children, level + 1);
      }
      return node;
    });
}

/**
 * Converts a flat/nested TocItem array (from PDF bookmarks) to the TocNode
 * format used by syllabusToc, buildChaptersFromToc, and the Learning Hub.
 *
 * Items without a valid title or with pageNumber ≤ 0 are silently dropped.
 */
export function outlineItemsToTocNodes(items: TocItem[]): TocNode[] {
  return convertItems(items, 0);
}
