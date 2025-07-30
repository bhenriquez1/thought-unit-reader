import { getDocument, GlobalWorkerOptions, version as pdfjsVersion } from "pdfjs-dist";

GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsVersion}/pdf.worker.min.js`;

type Chapter = { title: string; page: number };

export async function parseBookWithChapters(file: File | string): Promise<{
  chapters: Chapter[];
  parsedUnits: string[];
}> {
  let text = "";

  if (typeof file !== "string" && file.type === "application/pdf") {
    const buffer = await file.arrayBuffer();
    const pdf = await getDocument({ data: buffer }).promise;
    const allText: string[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ");
      allText.push(pageText.trim());
    }

    text = allText.join("\n\n");
  } else if (typeof file === "string") {
    text = file;
  } else if (file instanceof File && file.type.startsWith("text/")) {
    text = await file.text();
  } else {
    text = await file.text();
  }

  const lines = text.split("\n");
  const chapterMarkers: { index: number; title: string }[] = [];

  lines.forEach((line, index) => {
    const match =
      line.match(/^Chapter\s+\d+[:.\s]/i) ||
      line.match(/^CHAPTER\s+\d+[:.\s]/i) ||
      line.match(/^\d+\.\s+[A-Z]/) ||
      line.match(/^\d+\s+[A-Z]/);

    if (match) {
      chapterMarkers.push({ index, title: match[0].trim() });
    }
  });

  chapterMarkers.sort((a, b) => a.index - b.index);

  const parsedUnits = text
    .split(/\n{2,}/)
    .map((unit) => unit.trim())
    .filter((unit) => unit.length > 0);

  const chapters: Chapter[] = [];

  chapterMarkers.forEach((marker) => {
    const cleanTitle = marker.title.replace(/^CHAPTER\s+\d+[:.\s]?/i, "").trim();
    const approxUnitIndex = parsedUnits.findIndex((unit) => unit.includes(cleanTitle));
    const fallbackIndex = Math.floor(marker.index / 2);
    const finalIndex = approxUnitIndex !== -1 ? approxUnitIndex : fallbackIndex;

    if (!parsedUnits.includes(`###CHAPTER:${marker.title}`)) {
      parsedUnits.splice(finalIndex, 0, `###CHAPTER:${marker.title}`);
    }
    chapters.push({ title: marker.title, page: finalIndex + 1 });
  });

  if (chapters.length === 0) {
    chapters.push({ title: "Start", page: 1 });
  }

  return { chapters, parsedUnits };
}

export function getChapterByPage(
  chapters: Chapter[],
  currentPage: number
): string {
  let closest = chapters[0]?.title ?? "";
  for (const ch of chapters) {
    if (ch.page <= currentPage) {
      closest = ch.title;
    }
  }
  return closest;
}

export function generateProgressiveReadingHTML(units: string[]): string {
  return units
    .map((unit, i) => {
      if (unit.startsWith("###CHAPTER:")) {
        const title = unit.replace("###CHAPTER:", "").trim();
        return `<h3 class="text-lg font-semibold mt-6 mb-2">${title}</h3>`;
      }

      const colorClass = i % 2 === 0 ? "text-black" : "text-gray-500";
      return `<p class="${colorClass} mb-4">${unit}</p>`;
    })
    .join("\n");
}

export function generateHybridHTML(
  chapters: Chapter[],
  units: string[]
): string {
  const toc = chapters
    .map(
      (ch, i) => `
      <li class="mb-2">
        <a href="#chapter-${i}" class="text-blue-600 underline font-medium">
          ${ch.title}
        </a> — Page ${ch.page}
      </li>`
    )
    .join("");

  let chapterCounter = 0;

  const body = units
    .map((unit, i) => {
      if (unit.startsWith("###CHAPTER:")) {
        const title = unit.replace("###CHAPTER:", "").trim();
        const header = `<h3 id="chapter-${chapterCounter}" class="text-lg font-semibold mt-8 mb-4">${title}</h3>`;
        chapterCounter++;
        return header;
      }

      const colorClass = i % 2 === 0 ? "text-black" : "text-gray-500";
      return `<p id="unit-${i}" class="${colorClass} mt-2 text-base leading-relaxed">${unit}</p>`;
    })
    .join("\n");

  return `
    <div class="flex flex-col gap-6">
      <div class="sticky top-0 bg-white dark:bg-zinc-900 z-10 p-4 border-b border-gray-300 dark:border-zinc-700">
        <h2 class="text-xl font-semibold mb-2">Table of Contents</h2>
        <ul class="list-none pl-0">${toc}</ul>
      </div>
      <hr class="my-4 border-gray-300 dark:border-zinc-600"/>
      ${body}
    </div>
  `;
}

export async function extractText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: buffer }).promise;
  const allText: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    allText.push(
      content.items.map((item) => ("str" in item ? item.str : "")).join(" ")
    );
  }

  return allText.join("\n\n");
}

export async function getPdfViewerHTML(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: buffer }).promise;

  const pageContainers = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext("2d");

    if (context) {
      await page.render({ canvasContext: context, viewport }).promise;
      const imgDataUrl = canvas.toDataURL();
      pageContainers.push(`<img src="${imgDataUrl}" alt="Page ${i}" class="mb-4" />`);
    }
  }

  return `<div class="pdf-viewer">${pageContainers.join("\n")}</div>