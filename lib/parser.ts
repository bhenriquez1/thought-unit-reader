// lib/parser.ts

export async function parseBookWithChapters(file: File | string): Promise<{
  chapters: { title: string; page: number }[];
  parsedUnits: string[];
}> {
  let text = "";

  if (typeof file === "string") {
    text = file;
  } else {
    text = await file.text();
  }

  const lines = text.split("\n");

  const chapters = lines
    .map((line, index) => {
      const match =
        line.match(/^Chapter\s+\d+[:.\s]/i) ||
        line.match(/^CHAPTER\s+\d+[:.\s]/i) ||
        line.match(/^\d+\.\s+[A-Z]/) || // e.g. 1. Introduction
        line.match(/^\d+\s+[A-Z]/);     // e.g. 1 Introduction

      return match
        ? {
            title: match[0].trim(),
            page: index + 1,
          }
        : null;
    })
    .filter(Boolean) as { title: string; page: number }[];

  const parsedUnits = text
    .split(/\n{2,}/) // split on two or more newlines
    .map((unit) => unit.trim())
    .filter((unit) => unit.length > 0);

  return { chapters, parsedUnits };
}

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

export function generateProgressiveReadingHTML(units: string[]): string {
  return units
    .map((unit, i) => {
      const colorClass = i % 2 === 0 ? "text-black" : "text-gray-500";
      return `<p class="${colorClass} mb-4">${unit}</p>`;
    })
    .join("\n");
}

export function generateHybridHTML(
  chapters: { title: string; page: number }[],
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

  const body = units
    .map((unit, i) => {
      const colorClass = i % 2 === 0 ? "text-black" : "text-gray-500";
      return `<p id="chapter-${i}" class="${colorClass} mt-6 text-base leading-relaxed">
        ${unit}
      </p>`;
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