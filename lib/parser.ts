// Parse book into chapters and thought-units
export function parseBookWithChapters(text: string): {
  chapters: { title: string; page: number }[];
  parsedUnits: string[];
} {
  const lines = text.split("\n");

  const chapters = lines
    .map((line, index) => {
      // Match various chapter formats
      const match =
        line.match(/^Chapter\s+\d+/i) ||           // e.g., "Chapter 1"
        line.match(/^CHAPTER\s+\d+/) ||            // e.g., "CHAPTER 2"
        line.match(/^\d+\.\s+\w+/) ||              // e.g., "1. Introduction"
        line.match(/^\d+\s+\w+/);                  // e.g., "2 Background"

      return {
        title: match ? match[0].trim() : "",
        page: index + 1,
      };
    })
    .filter((ch) => ch.title);

  const parsedUnits = text
    .split(/\n{2,}/)
    .map((unit) => unit.trim())
    .filter((unit) => unit.length > 0);

  return { chapters, parsedUnits };
}

// ➕ Utility to get closest chapter title by current page
export function getChapterByPage(
  chapters: { title: string; page: number }[],
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

// ✅ Formats units in alternating colors for progressive view
export function generateProgressiveReadingHTML(units: string[]): string {
  return units
    .map((unit, i) => {
      const color = i % 2 === 0 ? "black" : "gray";
      return `<p style="color:${color}">${unit}</p>`;
    })
    .join("\n");
}

// ✅ Generates hybrid HTML: clickable ToC + anchored paragraphs
export function generateHybridHTML(
  chapters: { title: string; page: number }[],
  units: string[],
  currentPage: number
): string {
  const toc = chapters
    .map(
      (ch, i) =>
        `<li><a href="#chapter-${i}" style="color:blue;text-decoration:underline">${ch.title}</a> — Page ${ch.page}</li>`
    )
    .join("");

  const body = units
    .map((unit, i) => {
      const color = i % 2 === 0 ? "black" : "gray";
      return `<p id="chapter-${i}" style="color:${color};margin-top:1.5rem">${unit}</p>`;
    })
    .join("\n");

  return `<h2>Table of Contents</h2><ul>${toc}</ul><hr/>${body}`;
}