// parser.ts

// Detect chapters and split paragraphs
export function parseBookWithChapters(text: string): {
  chapters: { title: string; page: number }[];
  parsedUnits: string[];
} {
  const lines = text.split("\n");

  const chapters = lines
    .map((line, index) => {
      const match =
        line.match(/^Chapter\s+\d+/i) ||
        line.match(/^CHAPTER\s+\d+/i) ||
        line.match(/^\d+\.\s+[A-Z]/) ||      // 1. Introduction
        line.match(/^\d+\s+[A-Z]/);          // 1 Introduction

      return {
        title: match ? match[0].trim() : "",
        page: index + 1,
      };
    })
    .filter((ch) => ch.title);

  const parsedUnits = text
    .split(/\n{2,}/) // two or more newlines
    .map((unit) => unit.trim())
    .filter((unit) => unit.length > 0);

  return { chapters, parsedUnits };
}

// Get the closest chapter title for current page
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

// Progressive Reading — Alternating Black/Gray Units
export function generateProgressiveReadingHTML(units: string[]): string {
  return units
    .map((unit, i) => {
      const color = i % 2 === 0 ? "black" : "gray";
      return `<p style="color:${color}">${unit}</p>`;
    })
    .join("\n");
}

// Hybrid View — TOC + Alternating Paragraphs
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