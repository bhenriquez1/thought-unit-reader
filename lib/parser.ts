// lib/parser.ts

export interface Chapter {
  title: string;
  page: number;
}

export interface ParsedUnit {
  text: string;
  page: number;
}

// Simple example: Split content by lines and mock chapter detection
export async function parseBookWithChapters(content: string): Promise<{
  chapters: Chapter[];
  parsedUnits: ParsedUnit[];
}> {
  const lines = content.split("\n");

  const chapters: Chapter[] = [];
  const parsedUnits: ParsedUnit[] = [];

  let page = 1;

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    // Example chapter detection
    if (/^chapter\s+\d+/i.test(trimmed)) {
      chapters.push({ title: trimmed, page });
    }

    // Simulated page change every 40 lines
    if (index > 0 && index % 40 === 0) {
      page++;
    }

    if (trimmed.length > 0) {
      parsedUnits.push({ text: trimmed, page });
    }
  });

  return { chapters, parsedUnits };
}

// 🧠 Right Brain View — alternating black/gray text blocks
export function generateProgressiveReadingHTML(units: ParsedUnit[]): string {
  return units
    .map((unit, index) => {
      const colorClass = index % 2 === 0 ? "text-black" : "text-gray-500";
      return `<p class="${colorClass}">${unit.text}</p>`;
    })
    .join("");
}

// 🤝 Hybrid View — include chapters as headings, rest as blocks
export function generateHybridHTML(
  chapters: Chapter[],
  units: ParsedUnit[],
  currentPage: number
): string {
  const unitBlocks = units
    .filter((unit) => unit.page === currentPage)
    .map((unit, i) => {
      const colorClass = i % 2 === 0 ? "text-black" : "text-gray-500";
      return `<p class="${colorClass}">${unit.text}</p>`;
    })
    .join("");

  const chapterHeading = chapters.find((c) => c.page === currentPage)?.title || "";

  return `
    <div>
      ${chapterHeading ? `<h2 class="text-xl font-bold mb-4">${chapterHeading}</h2>` : ""}
      ${unitBlocks}
    </div>
  `;
}