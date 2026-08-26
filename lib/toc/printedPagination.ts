import type { TocItem } from "@/lib/stores/tocStore";

/** Infer the electronic-to-printed offset from the first numbered chapter.
 * Example: Biocalculus Chapter 1 is PDF page 52 / printed page 1. */
export function inferPrintedPageNumber(items: TocItem[], pdfPage: number): number | null {
  const flatten = (nodes: TocItem[]): TocItem[] => nodes.flatMap((node) => [node, ...flatten(node.children ?? [])]);
  const firstChapter = flatten(items)
    .filter((item) => /^(?:chapter\s*)?1(?:\.|\s|:)/i.test(item.title.trim()))
    .sort((a, b) => a.pageNumber - b.pageNumber)[0];
  if (!firstChapter || pdfPage < firstChapter.pageNumber) return null;
  const printed = pdfPage - firstChapter.pageNumber + 1;
  return printed > 0 ? printed : null;
}

