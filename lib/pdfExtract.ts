import type { PageTextBundle } from "@/lib/autoToc";

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export async function extractPdfPages(fileUrl: string): Promise<PageTextBundle[]> {
  if (!fileUrl) return [];

  const pdfjs = await import("pdfjs-dist");
  const workerSrc = "/pdf.worker.min.mjs";

  if ((pdfjs as any).GlobalWorkerOptions?.workerSrc !== workerSrc) {
    (pdfjs as any).GlobalWorkerOptions.workerSrc = workerSrc;
  }

  const loadingTask = (pdfjs as any).getDocument(fileUrl);
  const pdf = await loadingTask.promise;
  const pages: PageTextBundle[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const joined = textContent.items
      .map((item: any) => (typeof item.str === "string" ? item.str : ""))
      .join(" ");

    pages.push({
      page: pageNumber,
      text: normalizeText(joined),
    });
  }

  return pages;
}
