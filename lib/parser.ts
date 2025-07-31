// lib/parser.ts
// Separate client-side and server-side functions

import mammoth from "mammoth";

// Define the Chapter interface inline to avoid import issues
interface Chapter {
  title: string;
  content: string; // Required field
  page?: number;   // Optional field
}

// Import pdfjs inside client-side conditional
let pdfjsLib: any;
if (typeof window !== 'undefined') {
  // Only import on client side
  import("pdfjs-dist/build/pdf").then(module => {
    pdfjsLib = module;
    import("pdfjs-dist/build/pdf.worker.entry").then(worker => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = worker.default;
    });
  });
}

export async function extractText(file: File): Promise<string> {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "pdf") {
    // Ensure pdfjsLib is loaded
    if (!pdfjsLib) {
      pdfjsLib = await import("pdfjs-dist/build/pdf");
      const pdfjsWorker = await import("pdfjs-dist/build/pdf.worker.entry");
      pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker.default;
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const numPages = pdf.numPages;

    const textContent = await Promise.all(
      Array.from({ length: numPages }, async (_, i) => {
        const page = await pdf.getPage(i + 1);
        const text = await page.getTextContent();
        return text.items.map((item: any) => item.str).join(" ");
      })
    );

    return textContent.join("\n\n");
  } else if (extension === "docx") {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  } else if (extension === "txt") {
    return await file.text();
  }

  throw new Error("Unsupported file type.");
}

export function parseIntoUnits(text: string): string[] {
  return text
    .split(/(?<=[.?!])\s+(?=[A-Z0-9])/) // match sentence endings followed by capital letter/number
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// Add the missing parseTextToUnits function
export function parseTextToUnits(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/) // Split at sentence boundaries
    .map(sentence => sentence.trim())
    .filter(sentence => sentence.length > 0);
}

export function splitIntoChapters(text: string): Chapter[] {
  const lines = text.split("\n");
  const chapters: Chapter[] = [];
  let currentChapter: Chapter = { title: "", content: "" };

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^(chapter|section|unit|lesson|part)\s+\d+/i.test(trimmed)) {
      if (currentChapter.title || currentChapter.content) {
        chapters.push(currentChapter);
        currentChapter = { title: "", content: "" };
      }
      currentChapter.title = trimmed;
    } else {
      currentChapter.content += line + "\n";
    }
  }

  if (currentChapter.title || currentChapter.content) {
    chapters.push(currentChapter);
  }

  return chapters;
}

export async function parseBookWithChapters(file: File): Promise<{
  parsedUnits: string[][];
  chapters: Chapter[];
  original: string;
}> {
  const text = await extractText(file);
  const chapters = splitIntoChapters(text);
  
  // Convert each chapter's content into parsed units
  const parsedUnits: string[][] = [];
  chapters.forEach((chapter, index) => {
    const sentences = parseIntoUnits(chapter.content);
    // Add page number to each chapter for reference
    chapter.page = index + 1;
    
    // Group sentences into paragraphs (this is a simple implementation)
    const paragraphs: string[][] = [];
    let currentParagraph: string[] = [];
    
    sentences.forEach(sentence => {
      currentParagraph.push(sentence);
      // If sentence ends with paragraph break, start a new paragraph
      if (sentence.endsWith("\n\n")) {
        paragraphs.push([...currentParagraph]);
        currentParagraph = [];
      }
    });
    
    // Add any remaining sentences
    if (currentParagraph.length > 0) {
      paragraphs.push(currentParagraph);
    }
    
    parsedUnits.push(...paragraphs);
  });

  return {
    parsedUnits,
    chapters,
    original: text,
  };
}

export function parseTextToThoughtUnits(text: string): string[][] {
  const sentences = text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/) // sentence boundaries
    .filter((s) => s.length > 0)
    .map((s) => s.trim());

  return sentences.map((sentence) =>
    sentence.split(/([,;:\-–\(\)\[\]\{\}]|\s+)/).filter(Boolean)
  );
}

// Create a non-JSX version that returns HTML string
export function generateProgressiveReadingHTML(text: string): string {
  const sentences = text.match(/[^.!?\n]+[.!?\n]+/g) || [];

  return `
    <div class="space-y-2 text-base leading-relaxed">
      ${sentences.map((sentence, i) => `
        <p class="${i % 2 === 0 ? "text-black dark:text-white" : "text-gray-400 dark:text-gray-400"}">
          ${sentence.trim()}
        </p>
      `).join('')}
    </div>
  `;
}

// This JSX-generating function should be used only in client components
export function generateProgressiveReadingJSX(text: string): any {
  // This will be implemented in client components
  return {
    type: 'div',
    props: {
      className: 'space-y-4',
      children: `[JSX content would go here - implement in client component]`
    }
  };
}

export function generateHybridHTML(chapters: Chapter[], units: string[][]): string {
  const toc = chapters
    .map((ch, i) => `
      <li class="mb-2">
        <a href="#chapter-${i}" class="text-blue-600 underline font-medium">
          ${ch.title}
        </a> — Page ${ch.page ?? i + 1}
      </li>`)
    .join("");

  let chapterCounter = 0;
  const body = units.flatMap((unit, i) => {
    const joined = unit.join(" ");
    if (joined.startsWith("###CHAPTER:")) {
      const title = joined.replace("###CHAPTER:", "").trim();
      const header = `<h3 id="chapter-${chapterCounter}" class="text-lg font-semibold mt-8 mb-4">${title}</h3>`;
      chapterCounter++;
      return [header];
    }
    const colorClass = i % 2 === 0 ? "text-black dark:text-white" : "text-gray-500 dark:text-gray-400";
    return [`<p id="unit-${i}" class="${colorClass} mt-2 text-base leading-relaxed">${joined}</p>`];
  }).join("\n");

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

// Create a proper interface for the client-side component
export function getPdfViewerHTML(url: string, scale: number = 1): string {
  return `
    <div class="mt-8 bg-white p-4 rounded shadow">
      <p class="text-sm text-gray-500 mb-2">
        PDF viewer embedded below (scale: ${scale}x):
      </p>
      <object
        data="${url}"
        type="application/pdf"
        width="100%"
        height="600px"
      >
        <p>
          Your browser does not support PDFs.
          <a href="${url}" class="text-blue-500 underline ml-1">Download PDF</a>
        </p>
      </object>
    </div>
  `;
}