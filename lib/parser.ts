// lib/parser.ts
// Safely extract text from files without causing TypeScript errors

// Define the Chapter interface
export interface Chapter {
  title: string;
  content: string;
  page?: number;
}

// Extract text from files - safely handling PDF.js
export async function extractText(file: File): Promise<string> {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "pdf") {
    try {
      // Use a safer approach with dynamic imports
      const arrayBuffer = await file.arrayBuffer();
      
      // Use a try/catch for each dynamic import to handle errors gracefully
      try {
        // Import PDF.js dynamically to avoid TypeScript errors
        const pdfjs = await import('react-pdf/dist/esm/pdfjs');
        
        // Configure worker if needed
        if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
          pdfjs.GlobalWorkerOptions.workerSrc = 
            `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
        }
        
        // Use the react-pdf version of getDocument which is safer
        const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        const numPages = pdf.numPages;

        // Extract text from each page
        const textContent = await Promise.all(
          Array.from({ length: numPages }, async (_, i) => {
            const page = await pdf.getPage(i + 1);
            const content = await page.getTextContent();
            return content.items
              .map((item: any) => item.str || '')
              .join(" ");
          })
        );

        return textContent.join("\n\n");
      } catch (pdfError) {
        console.error("Error with PDF.js import:", pdfError);
        
        // Fallback to a different approach if the first one fails
        try {
          // Alternative: try using a simpler require approach
          const pdfjs = require('pdfjs-dist/build/pdf');
          pdfjs.GlobalWorkerOptions.workerSrc = 
            `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
            
          const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
          const pdf = await loadingTask.promise;
          const numPages = pdf.numPages;
          
          const textContent = await Promise.all(
            Array.from({ length: numPages }, async (_, i) => {
              const page = await pdf.getPage(i + 1);
              const content = await page.getTextContent();
              return content.items
                .map((item: any) => item.str || '')
                .join(" ");
            })
          );
          
          return textContent.join("\n\n");
        } catch (fallbackError) {
          console.error("Fallback PDF extraction also failed:", fallbackError);
          return "Error extracting PDF text. Try using the direct PDF viewer instead.";
        }
      }
    } catch (error) {
      console.error("Error extracting PDF text:", error);
      return "Error extracting PDF text. Try using the direct PDF viewer instead.";
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
      return "Error extracting DOCX text. Check mammoth.js installation.";
    }
  } else if (extension === "txt") {
    try {
      return await file.text();
    } catch (error) {
      console.error("Error extracting TXT text:", error);
      return "Error extracting TXT text";
    }
  }

  return "Unsupported file type.";
}

// The rest of your parser functions remain the same
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