// lib/tocParser.ts
// Build a simple Table of Contents either from:
// 1) raw text (heuristics) — legacy fallback, or
// 2) a PDF outline emitted by SmartPDFViewer (preferred)

/** Sidebar-friendly TOC shape */
export interface TOCEntry {
  title: string;
  pageNumber: number;       // 1-based
  subChapters?: TOCEntry[]; // children
}

/** ---------- Outline → TOC (preferred) ----------
 * Use this when SmartPDFViewer gives you an outline
 * whose nodes already include 1-based page numbers.
 */
export type PdfOutlineNode = {
  title: string;
  pageNumber?: number;      // 1-based if available
  items?: PdfOutlineNode[];
};

export function outlineToTOC(nodes?: PdfOutlineNode[] | null, level = 0): TOCEntry[] {
  if (!nodes?.length) return [];
  return nodes.map((n) => ({
    title: (n?.title ?? "Untitled").toString(),
    pageNumber:
      Number.isFinite(n?.pageNumber) && (n!.pageNumber as number) > 0
        ? (n!.pageNumber as number)
        : 1,
    subChapters: outlineToTOC(n?.items ?? [], level + 1),
  }));
}

/** ---------- Public API (back-compat) ----------
 * Overloads: (url)  OR  (text, numPages)
 * These use the original text-heuristic approach.
 */
export function generateTOC(url: string): Promise<TOCEntry[]>;
export function generateTOC(text: string, numPages: number): Promise<TOCEntry[]>;
export async function generateTOC(arg1: string, arg2?: number): Promise<TOCEntry[]> {
  // Old signature (text, numPages)
  if (typeof arg2 === "number") {
    return buildTOCFromText(arg1, arg2);
  }

  // New signature: (url/blob) – client-only
  if (typeof window === "undefined") return [];

  // Lazily load pdfjs to avoid SSR issues
  let pdfjsLib: any;
  try {
    pdfjsLib = await import("pdfjs-dist/build/pdf");
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
  } catch (err) {
    console.warn("pdfjs-dist not available; returning empty TOC.", err);
    return [];
  }

  const loadingTask = pdfjsLib.getDocument(arg1);
  const pdf = await loadingTask.promise;
  const numPages: number = pdf.numPages;

  // Fallback heuristic: extract page text and guess headings
  let allText = "";
  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = (content.items || []).map((it: any) => (it.str ?? "").trim());
    allText += strings.join(" ") + "\n";
  }

  return buildTOCFromText(allText, numPages);
}

/** ---------- Text → TOC (heuristics) ---------- */
function buildTOCFromText(text: string, numPages: number): TOCEntry[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // Heuristics:
  //  - "Chapter 1", "CHAPTER 2"
  //  - "1. Intro", "2.3 Vectors", "10.2.1 Subsection"
  //  - ALL CAPS headline-ish lines
  const chapterRegex = /^(Chapter\s+\d+|CHAPTER\s+\d+|\d+\.\d+\s+.+|[A-Z][A-Z0-9\s\-:,'()]+)$/;
  const subChapterRegex = /^(\d+\.\d+(\.\d+)*)\s+.+$/;

  const approxLinesPerPage = Math.max(1, Math.floor(lines.length / Math.max(1, numPages)));

  const toc: TOCEntry[] = [];
  let currentChapter: TOCEntry | null = null;

  lines.forEach((line, index) => {
    if (chapterRegex.test(line)) {
      const pageNumber = Math.floor(index / approxLinesPerPage) + 1;
      currentChapter = { title: line, pageNumber, subChapters: [] };
      toc.push(currentChapter);
    } else if (currentChapter && subChapterRegex.test(line)) {
      const pageNumber = Math.floor(index / approxLinesPerPage) + 1;
      currentChapter.subChapters!.push({ title: line, pageNumber });
    }
  });

  return toc;
}