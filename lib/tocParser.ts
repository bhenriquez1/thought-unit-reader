// lib/tocParser.ts
// Parses a PDF (by URL/blob) or raw text into a simple TOC.

export interface TOCEntry {
  title: string;
  pageNumber: number;
  subChapters?: TOCEntry[];
}

/** ------------ Public API (overloads) ------------ **/
export function generateTOC(url: string): Promise<TOCEntry[]>;
export function generateTOC(text: string, numPages: number): Promise<TOCEntry[]>;
export async function generateTOC(arg1: string, arg2?: number): Promise<TOCEntry[]> {
  // Back-compat: old signature (text, numPages)
  if (typeof arg2 === "number") {
    return buildTOCFromText(arg1, arg2);
  }

  // New signature: (url/blob)
  const url = arg1;

  // Only run in the browser (we call this from client code)
  if (typeof window === "undefined") return [];

  // Lazy-load pdf.js to avoid SSR issues
  let pdfjsLib: any;
  try {
    pdfjsLib = await import("pdfjs-dist/build/pdf");
    // Use CDN worker — avoids bundling worker file with Next
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
  } catch (err) {
    console.warn("pdfjs-dist not available; returning empty TOC.", err);
    return [];
  }

  const loadingTask = pdfjsLib.getDocument(url);
  const pdf = await loadingTask.promise;
  const numPages: number = pdf.numPages;

  // Extract text from all pages (lightweight concat heuristic is fine for TOC)
  let allText = "";
  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = (content.items || []).map((it: any) => (it.str ?? "").trim());
    allText += strings.join(" ") + "\n";
  }

  return buildTOCFromText(allText, numPages);
}

/** ------------ Core TOC builder (text + page count) ------------ **/
function buildTOCFromText(text: string, numPages: number): TOCEntry[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // Heuristics:
  //  - "Chapter 1", "CHAPTER 2"
  //  - "1. Intro", "2.3 Vectors", "10.2.1 Subsection"
  //  - ALL CAPS headline lines
  const chapterRegex = /^(Chapter\s+\d+|CHAPTER\s+\d+|\d+\.\d+\s+.+|[A-Z][A-Z0-9\s\-:,'()]+)$/;
  const subChapterRegex = /^(\d+\.\d+(\.\d+)*)\s+.+$/;

  const approxLinesPerPage = Math.max(1, Math.floor(lines.length / Math.max(1, numPages)));

  const toc: TOCEntry[] = [];
  let currentChapter: TOCEntry | null = null;

  lines.forEach((line, index) => {
    if (chapterRegex.test(line)) {
      const pageNumber = Math.floor(index / approxLinesPerPage) + 1;
      currentChapter = {
        title: line,
        pageNumber,
        subChapters: [],
      };
      toc.push(currentChapter);
    } else if (currentChapter && subChapterRegex.test(line)) {
      const pageNumber = Math.floor(index / approxLinesPerPage) + 1;
      currentChapter.subChapters!.push({
        title: line,
        pageNumber,
      });
    }
  });

  return toc;
}