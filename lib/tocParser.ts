// lib/tocParser.ts
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export interface TOCEntry {
  title: string;
  page: number;
}

/**
 * Generates a table of contents from a PDF file URL.
 * @param fileUrl - The URL of the PDF file to parse.
 */
export async function generateTOC(fileUrl: string): Promise<TOCEntry[]> {
  const loadingTask = pdfjsLib.getDocument(fileUrl);
  const pdf = await loadingTask.promise;

  const toc: TOCEntry[] = [];
  const headingRegex = /^(Chapter\s+\d+|CHAPTER\s+\d+|\d+\.\d+\s+.+)$/;

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const text = textContent.items.map((item: any) => item.str).join(' ');

    // Look for headings that match typical chapter/section patterns
    if (headingRegex.test(text)) {
      toc.push({
        title: text.trim(),
        page: pageNum
      });
    }
  }

  return toc;
}