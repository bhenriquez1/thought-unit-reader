// lib/parser.ts
// Updated with Whiteboard detection + simplified PDF handler

import { extractTextFromPdf } from "./pdfjs-handler";

// Define the Chapter interface
export interface Chapter {
  title: string;
  content: string;
  page?: number;
}

export async function extractText(file: File): Promise<string> {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "pdf") {
    try {
      return await extractTextFromPdf(file);
    } catch (error) {
      console.error("Error extracting PDF text:", error);
      return "Error processing PDF file. The PDF viewer will still work for viewing.";
    }
  } else if (extension === "docx") {
    // DOCX parsing disabled - mammoth dependency removed during cleanup
    console.warn("DOCX parsing not available - mammoth dependency was removed");
    return "DOCX parsing is currently disabled. Please convert to PDF or TXT format.";
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

export function parseIntoUnits(text: string): string[] {
  if (!text) return [];
  return text
    .split(/(?<=[.?!])\s+(?=[A-Z0-9])/) // sentence endings followed by capital/number
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function parseTextToUnits(text: string): string[][] {
  if (!text) return [[]];

  const sentences = text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/) // sentence boundaries
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const paragraphs: string[][] = [];
  let currentParagraph: string[] = [];

  sentences.forEach((sentence) => {
    currentParagraph.push(sentence);
    if (sentence.includes("\n\n") || currentParagraph.length > 5) {
      paragraphs.push([...currentParagraph]);
      currentParagraph = [];
    }
  });

  if (currentParagraph.length > 0) paragraphs.push(currentParagraph);
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

  if (currentChapter.title || currentChapter.content) chapters.push(currentChapter);
  return chapters;
}

export async function parseBookWithChapters(
  file: File, 
  progressCallback?: (progress: string) => void
): Promise<{
  parsedUnits: string[][];
  chapters: Chapter[];
  original: string;
}> {
  console.log("📚 Starting PDF parsing for:", file.name, "Size:", file.size, "bytes");
  
  if (progressCallback) {
    progressCallback(`Analyzing ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)}MB)...`);
  }
  
  try {
    // ✅ Enhanced text extraction with better error handling
    if (progressCallback) {
      progressCallback("Extracting text content from PDF...");
    }
    
    const text = await extractText(file);
    console.log("📚 Text extraction result - Length:", text.length, "Preview:", text.slice(0, 100));
    
    if (progressCallback) {
      progressCallback(`Extracted ${Math.round(text.length / 1000)}k characters, processing content...`);
    }
    
    // ✅ Validate extracted text
    if (!text || text.trim().length === 0) {
      throw new Error("No text content extracted from PDF - file may be empty or contain only images");
    }
    
    if (text.includes("Error processing PDF") || text.includes("Error extracting")) {
      throw new Error(`PDF processing failed: ${text}`);
    }
    
    // ✅ Enhanced chapter splitting with validation
    const chapters = splitIntoChapters(text);
    console.log("📚 Chapter splitting result - Chapters found:", chapters.length);
    
    const parsedUnits: string[][] = [];
    let totalValidUnits = 0;
    
    chapters.forEach((chapter, index) => {
      if (!chapter.content) chapter.content = "";

      const sentences = parseIntoUnits(chapter.content);
      chapter.page = index + 1;
      
      console.log(`📚 Chapter ${index + 1} - Sentences: ${sentences.length}, Content length: ${chapter.content.length}`);

      // ✅ IMPROVED: Balanced chunking within chapters
      const chapterChunks: string[][] = [];
      const minChunkSize = 3;
      const targetChunkSize = 6;
      const maxChunkSize = 9;
      
      let i = 0;
      while (i < sentences.length) {
        const remaining = sentences.length - i;
        
        // If very few sentences remain, merge with previous chunk
        if (remaining <= minChunkSize && chapterChunks.length > 0) {
          const lastChunk = chapterChunks[chapterChunks.length - 1];
          const remainingSentences = sentences.slice(i).filter(s => s.trim().length > 5);
          lastChunk.push(...remainingSentences);
          break;
        }
        
        // Determine chunk size adaptively
        let chunkSize = targetChunkSize;
        if (remaining < targetChunkSize + minChunkSize) {
          chunkSize = remaining;
        } else if (remaining <= maxChunkSize) {
          chunkSize = Math.ceil(remaining / 2);
        }
        
        const chunk = sentences.slice(i, i + chunkSize).filter(s => s.trim().length > 5);
        if (chunk.length > 0) {
          chapterChunks.push(chunk);
        }
        
        i += chunkSize;
      }
      
      // Add valid chunks to parsedUnits
      const validChunks = chapterChunks.filter(p => 
        p.length > 0 && p.some(sentence => sentence.trim().length > 5)
      );
      
      if (validChunks.length > 0) {
        parsedUnits.push(...validChunks);
        totalValidUnits += validChunks.length;
        console.log(`📚 Chapter ${index + 1} created ${validChunks.length} balanced chunks`);
      }
    });

    // ✅ Fallback for documents without clear chapter structure
    if (chapters.length === 0 || totalValidUnits === 0) {
      console.log("📚 No chapters found or no valid units, creating fallback structure");
      
      // Create a single chapter with all content
      const fallbackChapter = { title: "Content", content: text, page: 1 };
      chapters.length = 0; // Clear existing chapters
      chapters.push(fallbackChapter);
      
      // Parse the entire text into units
      const allSentences = parseIntoUnits(text);
      console.log("📚 Fallback parsing - Total sentences:", allSentences.length);
      
      if (allSentences.length > 0) {
        parsedUnits.length = 0; // Clear existing units
        
        // ✅ IMPROVED: Balanced chunking algorithm to prevent tiny fragments
        // Target: 5-8 sentences per chunk, with minimum 3 sentences
        const minChunkSize = 3;
        const targetChunkSize = 6;
        const maxChunkSize = 9;
        
        let i = 0;
        while (i < allSentences.length) {
          const remaining = allSentences.length - i;
          
          // If very few sentences remain, merge with previous chunk or create final chunk
          if (remaining <= minChunkSize && parsedUnits.length > 0) {
            // Merge with previous chunk instead of creating tiny fragment
            const lastChunk = parsedUnits[parsedUnits.length - 1];
            const remainingSentences = allSentences.slice(i).filter(s => s.trim().length > 5);
            lastChunk.push(...remainingSentences);
            console.log(`📚 Merged ${remainingSentences.length} remaining sentences with last chunk`);
            break;
          }
          
          // Determine chunk size adaptively
          let chunkSize = targetChunkSize;
          if (remaining < targetChunkSize + minChunkSize) {
            // If near the end, take all remaining to avoid small fragment
            chunkSize = remaining;
          } else if (remaining <= maxChunkSize) {
            // Split remaining evenly if possible
            chunkSize = Math.ceil(remaining / 2);
          }
          
          const chunk = allSentences.slice(i, i + chunkSize).filter(s => s.trim().length > 5);
          if (chunk.length > 0) {
            parsedUnits.push(chunk);
            console.log(`📚 Created chunk ${parsedUnits.length} with ${chunk.length} sentences`);
          }
          
          i += chunkSize;
        }
        
        totalValidUnits = parsedUnits.length;
        console.log(`📚 Fallback chunking complete: ${totalValidUnits} balanced chunks created`);
      }
    }
    
    // ✅ Final validation
    if (parsedUnits.length === 0 || totalValidUnits === 0) {
      console.warn("📚 No valid content units created, using emergency fallback");
      
      // Emergency fallback - create basic units from raw text
      const words = text.split(/\s+/).filter(w => w.trim().length > 0);
      if (words.length > 0) {
        // Create units of ~50 words each
        const wordsPerUnit = 50;
        parsedUnits.length = 0;
        
        for (let i = 0; i < words.length; i += wordsPerUnit) {
          const wordChunk = words.slice(i, i + wordsPerUnit);
          if (wordChunk.length > 0) {
            parsedUnits.push([wordChunk.join(" ")]);
          }
        }
        
        console.log("📚 Emergency fallback created", parsedUnits.length, "units from", words.length, "words");
      } else {
        throw new Error("No readable text content found in the PDF");
      }
    }

    console.log("📚 Final parsing result:", {
      chapters: chapters.length,
      parsedUnits: parsedUnits.length,
      totalValidUnits,
      originalTextLength: text.length
    });

    return {
      parsedUnits: parsedUnits.length > 0 ? parsedUnits : [["No content available"]],
      chapters: chapters.length > 0 ? chapters : [{ title: "Content", content: text || "No content", page: 1 }],
      original: text,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("📚 Critical parsing error:", errorMessage, "File:", file.name);
    
    // ✅ Enhanced error response - use neutral title to avoid "Parsing Error" propagation
    return {
      parsedUnits: [["Unable to extract text from this document."]],
      chapters: [{
        title: file.name.replace(/\.pdf$/i, '') || "Document",
        content: `Text extraction incomplete. This may be a scanned PDF or protected document.`,
        page: 1
      }],
      original: `Document loaded. Some features may be limited.`,
    };
  }
}

export function generateHybridHTML(chapters: Chapter[], units: string[][]): string {
  if (!Array.isArray(chapters)) chapters = [];
  if (!Array.isArray(units)) units = [[]];

  const toc = chapters
    .map((ch, i) => {
      const title = typeof ch.title === "string" ? ch.title : String(ch.title || "");
      const page = typeof ch.page === "number" ? ch.page : i + 1;

      return `
        <li class="mb-2">
          <a href="#chapter-${i}" class="text-blue-600 underline font-medium">
            ${title}
          </a> — Page ${page}
        </li>`;
    })
    .join("");

  let chapterCounter = 0;
  const body = units
    .flatMap((unit, i) => {
      if (!unit || !Array.isArray(unit) || unit.length === 0) return [];

      const joined = unit.map((item) => (typeof item === "string" ? item : String(item))).join(" ");

      if (joined.startsWith("###CHAPTER:")) {
        const title = joined.replace("###CHAPTER:", "").trim();
        const header = `<h3 id="chapter-${chapterCounter}" class="text-lg font-semibold mt-8 mb-4">${title}</h3>`;
        chapterCounter++;
        return [header];
      }

      const colorClass = i % 2 === 0 ? "text-black dark:text-white" : "text-gray-500 dark:text-gray-400";
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

export function parseTextToThoughtUnits(text: string): string[][] {
  if (!text) return [[]];

  const sentences = text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/) // sentence boundaries
    .filter((s) => s.length > 0)
    .map((s) => s.trim());

  return sentences.map((sentence) => sentence.split(/([,;:\-–()\[\]{}]|\s+)/).filter(Boolean));
}

export function generateProgressiveReadingHTML(text: string): string {
  if (!text) return "";

  const sentences = text.match(/[^.!?\n]+[.!?\n]+/g) || [];

  return `
    <div class="space-y-2 text-base leading-relaxed">
      ${sentences
        .map(
          (sentence, i) => `
        <p class="${i % 2 === 0 ? "text-black dark:text-white" : "text-gray-400 dark:text-gray-400"}">
          ${sentence.trim()}
        </p>`
        )
        .join("")}
    </div>
  `;
}

// 🔹 NEW: Detect formulas/diagrams for whiteboard mode
export function containsDiagramOrFormula(text: string): boolean {
  const lower = text.toLowerCase();
  const diagramKeywords = ["diagram", "figure", "fig.", "chart", "image", "graph", "table"];
  const formulaRegex = /[\^=><×÷±√∑πθ∞≈≠≤≥]|[a-zA-Z]{1,10}\s*[=+\-*/^]?\s*[\d\.]+/;
  return diagramKeywords.some((k) => lower.includes(k)) || formulaRegex.test(text);
}

export function detectWhiteboardSections(units: string[][]): number[] {
  const matches: number[] = [];
  units.forEach((unit, i) => {
    const text = unit.join(" ");
    if (containsDiagramOrFormula(text)) matches.push(i);
  });
  return matches;
}
