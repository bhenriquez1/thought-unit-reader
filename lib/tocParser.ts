// lib/tocParser.ts
import type { Chapter } from "@/types/chapter";

export interface TOCEntry {
  title: string;
  pageNumber: number;
  subChapters?: TOCEntry[];
}

/**
 * Generate a Table of Contents from extracted PDF text.
 * Works even if the PDF has no embedded outline.
 *
 * @param text The extracted text from the PDF (with paragraphs preserved)
 * @param numPages The number of pages in the PDF
 */
export async function generateTOC(
  text: string,
  numPages: number
): Promise<Chapter[]> {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

  const chapterRegex = /^(Chapter\s+\d+|CHAPTER\s+\d+|\d+\.\d+\s+.+|[A-Z][A-Z\s]+)$/;
  const subChapterRegex = /^(\d+\.\d+(\.\d+)*)\s+.+$/;

  let toc: Chapter[] = [];
  let currentChapter: Chapter | null = null;

  let approxLinesPerPage = Math.floor(lines.length / numPages);

  lines.forEach((line, index) => {
    if (chapterRegex.test(line)) {
      // Estimate page number
      const pageNumber = Math.floor(index / approxLinesPerPage) + 1;

      currentChapter = {
        title: line,
        pageNumber,
        content: "",
        subChapters: []
      };
      toc.push(currentChapter);
    } else if (subChapterRegex.test(line) && currentChapter) {
      const pageNumber = Math.floor(index / approxLinesPerPage) + 1;

      currentChapter.subChapters!.push({
        title: line,
        pageNumber,
        content: ""
      });
    }
  });

  return toc;
}