// lib/parser.ts
// Updated with the simplified PDF handling approach

import { extractTextFromPdf } from './pdfjs-handler';

// Define the Chapter interface
export interface Chapter {
  title: string;
  content: string;
  page?: number;
}

// Extract text from files with fixed PDF.js imports
export async function extractText(file: File): Promise<string> {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "pdf") {
    try {
      // Use our simplified PDF handler instead of the problematic code
      return await extractTextFromPdf(file);
    } catch (error) {
      console.error("Error extracting PDF text:", error);
      return "Error processing PDF file. The PDF viewer will still work for viewing.";
    }
  } else if (extension === "docx") {
    try {
      // For DOCX, we can use mammoth.js but wrap it in a try/catch
      const mammoth = await import('mammoth');
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      return result.value;
    } catch (error) {
      console.error("Error extracting DOCX text:", error);
      return "Error extracting DOCX text. Please try a different file format.";
    }
  } else if (extension === "txt") {
    try {
      return await file.text();
    } catch (error) {
      console.error("Error extracting TXT text:", error);
      return "Error extracting TXT text. Please check if the file is corrupted.";
    }
  }

  return "Unsupported file type. Please upload a PDF, DOCX, or TXT file.";
}

// The rest of the parser functions remain the same
export function parseIntoUnits(text: string): string[] {
  if (!text) return [];
  
  return text
    .split(/(?<=[.?!])\s+(?=[A-Z0-9])/) // match sentence endings followed by capital letter/number
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function parseTextToUnits(text: string): string[][] {
  if (!text) return [[]];
  
  const sentences = text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/) // Split at sentence boundaries
    .map(sentence => sentence.trim())
    .filter(sentence => sentence.length > 0);
  
  // Group sentences into paragraphs
  const paragraphs: string[][] = [];
  let currentParagraph: string[] = [];
  
  sentences.forEach(sentence => {
    currentParagraph.push(sentence);
    
    // If the sentence ends with a paragraph break, start a new paragraph
    if (sentence.includes("\n\n") || currentParagraph.length > 5) {
      paragraphs.push([...currentParagraph]);
      currentParagraph = [];
    }
  });
  
  // Add any remaining sentences as a paragraph
  if (currentParagraph.length > 0) {
    paragraphs.push(currentParagraph);
  }
  
  return paragraphs.length > 0 ? paragraphs : [[]];
}

export function splitIntoChapters(text: string): Chapter[] {
  if (!text) return [];
  
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
  try {
    const text = await extractText(file);
    const chapters = splitIntoChapters(text);
    
    // Convert each chapter's content into parsed units
    const parsedUnits: string[][] = [];
    chapters.forEach((chapter, index) => {
      if (!chapter.content) {
        chapter.content = "";
      }
      
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
      
      // Add paragraphs to parsedUnits
      if (paragraphs.length > 0) {
        parsedUnits.push(...paragraphs);
      } else {
        // Ensure we have at least one paragraph per chapter
        parsedUnits.push([]);
      }
    });

    // Default chapter if none found
    if (chapters.length === 0) {
      chapters.push({
        title: "Content",
        content: text,
        page: 1
      });
    }

    return {
      parsedUnits: parsedUnits.length > 0 ? parsedUnits : [[]],
      chapters: chapters,
      original: text,
    };
  } catch (error) {
    console.error("Error parsing book with chapters:", error);
    // Return safe defaults
    return {
      parsedUnits: [[]],
      chapters: [{ title: "Content", content: "Error parsing content", page: 1 }],
      original: "Error parsing book",
    };
  }
}

// Keep rest of your functions...
export function generateHybridHTML(chapters: Chapter[], units: string[][]): string {
  // Ensure chapters is an array
  if (!Array.isArray(chapters)) {
    chapters = [];
  }
  
  // Ensure units is a string[][]
  if (!Array.isArray(units)) {
    units = [[]];
  }
  
  // Generate TOC
  const toc = chapters
    .map((ch, i) => {
      const title = typeof ch.title === 'string' ? ch.title : String(ch.title || '');
      const page = typeof ch.page === 'number' ? ch.page : (i + 1);
      
      return `
        <li class="mb-2">
          <a href="#chapter-${i}" class="text-blue-600 underline font-medium">
            ${title}
          </a> — Page ${page}
        </li>`;
    })
    .join("");

  // Generate body content
  let chapterCounter = 0;
  const body = units.flatMap((unit, i) => {
    if (!unit || !Array.isArray(unit) || unit.length === 0) return [];
    
    const joined = unit.map(item => typeof item === 'string' ? item : String(item)).join(" ");
    
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

export function parseTextToThoughtUnits(text: string): string[][] {
  if (!text) return [[]];
  
  const sentences = text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/) // sentence boundaries
    .filter((s) => s.length > 0)
    .map((s) => s.trim());

  return sentences.map((sentence) =>
    sentence.split(/([,;:\-–\(\)\[\]\{\}]|\s+)/).filter(Boolean)
  );
}

export function generateProgressiveReadingHTML(text: string): string {
  if (!text) return "";
  
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