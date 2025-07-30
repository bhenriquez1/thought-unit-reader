"use client";

import { getDocument, GlobalWorkerOptions, version as pdfjsVersion } from "pdfjs-dist";
import mammoth from "mammoth";
import { cn } from "../lib/utils";

GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsVersion}/pdf.worker.min.js`;

type Chapter = { title: string; page: number };

export async function parseBookWithChapters(file: File | string): Promise<{
  chapters: Chapter[];
  parsedUnits: string[][];
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
  } else if (file instanceof File && file.name.endsWith(".docx")) {
    const arrayBuffer = await file.arrayBuffer();
    const { value } = await mammoth.extractRawText({ arrayBuffer });
    text = value;
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

  const paragraphs = text.split(/\n{2,}/).map((unit) => unit.trim()).filter((unit) => unit.length > 0);
  const parsedUnits: string[][] = paragraphs.map(p => (p.match(/[^.!?\n]+[.!?\n]*/g) || []).map(s => s.trim()));

  const chapters: Chapter[] = [];
  chapterMarkers.forEach((marker) => {
    const cleanTitle = marker.title.replace(/^CHAPTER\s+\d+[:.\s]?/i, "").trim();
    const approxUnitIndex = parsedUnits.findIndex((unit) => unit.join(" ").includes(cleanTitle));
    const fallbackIndex = Math.floor(marker.index / 2);
    const finalIndex = approxUnitIndex !== -1 ? approxUnitIndex : fallbackIndex;

    if (!paragraphs.includes(`###CHAPTER:${marker.title}`)) {
      paragraphs.splice(finalIndex, 0, `###CHAPTER:${marker.title}`);
    }
    chapters.push({ title: marker.title, page: finalIndex + 1 });
  });

  if (chapters.length === 0) {
    chapters.push({ title: "Start", page: 1 });
  }

  return { chapters, parsedUnits };
}

export function generateProgressiveReadingHTML(inputText: string): JSX.Element {
  const sentences = inputText.match(/[^.!?\n]+[.!?\n]*/g) || [];
  return (
    <div className="space-y-2">
      {sentences.map((sentence, i) => (
        <p key={i} className={cn("text-gray-300", i % 2 === 0 ? "text-white" : "text-gray-400")}>{sentence.trim()}</p>
      ))}
    </div>
  );
}

export function generateHybridHTML(chapters: Chapter[], units: string[][]): string {
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
    .flatMap((unit, i) => {
      const joined = unit.join(" ");
      if (joined.startsWith("###CHAPTER:")) {
        const title = joined.replace("###CHAPTER:", "").trim();
        const header = `<h3 id="chapter-${chapterCounter}" class="text-lg font-semibold mt-8 mb-4">${title}</h3>`;
        chapterCounter++;
        return [header];
      }
      const colorClass = i % 2 === 0 ? "text-black" : "text-gray-500";
      return [`<p id="unit-${i}" class="${colorClass} mt-2 text-base leading-relaxed">${joined}</p>`];
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

export function getPdfViewerHTML(file: File, scale: number): JSX.Element {
  return (
    <div className="mt-8 bg-white p-4 rounded">
      <p className="text-sm text-gray-500 mb-2">
        PDF viewer is embedded below (scale: {scale}x):
      </p>
      <object
        data={URL.createObjectURL(file)}
        type="application/pdf"
        width="100%"
        height="600px"
      >
        <p>
          Your browser does not support PDFs. Please download the file to view:
          <a href={URL.createObjectURL(file)} className="text-blue-500 underline">
            Download PDF
          </a>
        </p>
      </object>
    </div>
  );
}

export function parseTextToThoughtUnits(text: string): string[][] {
  const sentences = text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/) // Sentence splitter
    .filter((s) => s.length > 0)
    .map((s) => s.trim());
  const thoughtUnits: string[][] = [];
  for (const sentence of sentences) {
    const units = sentence.split(/([,;:\-–\(\)\[\]\{\}]|\s+)/).filter(Boolean);
    if (units.length) {
      thoughtUnits.push(units);
    }
  }
  return thoughtUnits;
}

export function generateProgressiveReadingJSX(text: string): JSX.Element {
  const thoughtUnits = parseTextToThoughtUnits(text);
  return (
    <div className="space-y-4">
      {thoughtUnits.map((unit, idx) => (
        <p
          key={idx}
          className="text-lg font-medium text-white bg-gray-800 p-2 rounded shadow"
        >
          {unit.map((word, i) => (
            <span
              key={i}
              className={i % 2 === 0 ? "text-white" : "text-gray-400"}
            >
              {word}
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}
