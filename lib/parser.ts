// lib/parser.ts

export function parseBookWithChapters(text: string): {
  chapters: { title: string; page: number }[];
  parsedUnits: string[];
} {
  const lines = text.split("\n");
  const chapters = lines
    .map((line, index) => ({
      title: line.match(/^Chapter\s+\d+/i)?.[0] || "",
      page: index + 1,
    }))
    .filter((ch) => ch.title);

  const parsedUnits = text
    .split(/\n{2,}/)
    .map((unit) => unit.trim())
    .filter((unit) => unit.length > 0);

  return { chapters, parsedUnits };
}

export function generateProgressiveReadingHTML(units: string[]): string {
  return units
    .map((unit, i) => {
      const color = i % 2 === 0 ? "black" : "gray";
      return `<p style="color:${color}">${unit}</p>`;
    })
    .join("\n");
}

export function generateHybridHTML(
  chapters: { title: string; page: number }[],
  units: string[],
  currentPage: number
): string {
  const toc = chapters
    .map((ch) => `<li><strong>${ch.title}</strong> — Page ${ch.page}</li>`)
    .join("");

  const body = generateProgressiveReadingHTML(units);

  return `<h2>Table of Contents</h2><ul>${toc}</ul><hr/>${body}`;
}