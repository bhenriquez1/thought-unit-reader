// lib/tocParser.ts
// Minimal TOC utilities with NO pdf.js usage (no worker/CDN needed).
// Prefer using SmartPDFViewer.onOutline() and pass that through outlineToTOC().

export interface TOCEntry {
  title: string;
  pageNumber: number;        // 1-based
  subChapters?: TOCEntry[];  // children
}

/** Mixed outline node shape (handles both items and subChapters). */
export type PdfOutlineNode = {
  title?: string;
  pageNumber?: number;       // 1-based if available
  items?: PdfOutlineNode[];  // pdf.js-style
  subChapters?: PdfOutlineNode[]; // alt key some tools use
};

/** ---------- Outline → TOC (preferred) ---------- */
export function outlineToTOC(nodes?: PdfOutlineNode[] | null): TOCEntry[] {
  if (!nodes?.length) return [];
  return nodes.map((n) => {
    const kids = (n?.items && n.items.length ? n.items : n?.subChapters) || [];
    return {
      title: (n?.title ?? "Untitled").toString(),
      pageNumber:
        typeof n?.pageNumber === "number" && n.pageNumber > 0 ? n.pageNumber : 1,
      subChapters: outlineToTOC(kids),
    };
  });
}

/** ---------- Public API (back-compat) ----------
 * Overloads:
 *   - (url: string) -> []  (we now rely on SmartPDFViewer.onOutline for real TOC)
 *   - (text: string, numPages: number) -> heuristic TOC
 */
export function generateTOC(url: string): Promise<TOCEntry[]>;
export function generateTOC(text: string, numPages: number): Promise<TOCEntry[]>;
export async function generateTOC(arg1: string, arg2?: number): Promise<TOCEntry[]> {
  if (typeof arg2 === "number") {
    // Legacy signature: (text, numPages)
    return buildTOCFromText(arg1, arg2);
  }
  // Newer signature: (url) — do nothing here to avoid pdf.js in the browser.
  // SmartPDFViewer should emit outline via onOutline; convert with outlineToTOC().
  return [];
}

/** ---------- Text → TOC (heuristics) ---------- */
function buildTOCFromText(text: string, numPages: number): TOCEntry[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // Heuristics for headings:
  // - "Chapter 1", "CHAPTER 2"
  // - "1. Intro", "2.3 Vectors", "10.2.1 Subsection"
  // - ALL CAPS headline-ish lines
  const chapterRegex =
    /^(Chapter\s+\d+|CHAPTER\s+\d+|\d+\.\d+\s+.+|[A-Z][A-Z0-9\s\-:,'()]+)$/;
  const subChapterRegex = /^(\d+\.\d+(\.\d+)*)\s+.+$/;

  const approxLinesPerPage = Math.max(
    1,
    Math.floor(lines.length / Math.max(1, numPages))
  );

  const toc: TOCEntry[] = [];
  let current: TOCEntry | null = null;

  lines.forEach((line, index) => {
    const pageNumber = Math.floor(index / approxLinesPerPage) + 1;

    if (chapterRegex.test(line)) {
      current = { title: line, pageNumber, subChapters: [] };
      toc.push(current);
      return;
    }

    if (current && subChapterRegex.test(line)) {
      current.subChapters!.push({ title: line, pageNumber });
    }
  });

  return toc;
}