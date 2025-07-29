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

  const parsedUnits = text
    .split(/\n{2,}/) // Split by paragraph
    .map((unit) => unit.trim())
    .filter((unit) => unit.length > 0);

  // Inject chapter titles directly into parsedUnits as header blocks
  const chapters: { title: string; page: number }[] = [];

  chapterMarkers.forEach((marker) => {
    const approxUnitIndex = Math.floor(marker.index / 2);
    chapters.push({ title: marker.title, page: approxUnitIndex + 1 });

    parsedUnits.splice(
      approxUnitIndex,
      0,
      `###CHAPTER:${marker.title}` // Mark for easier parsing in Hybrid mode
    );
  });

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
      if (unit.startsWith("###CHAPTER:")) {
        const title = unit.replace("###CHAPTER:", "").trim();
        return `<h3 class="text-lg font-semibold mt-6 mb-2">${title}</h3>`;
      }

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

  let chapterCounter = 0;

  const body = units
    .map((unit, i) => {
      if (unit.startsWith("###CHAPTER:")) {
        const title = unit.replace("###CHAPTER:", "").trim();
        const header = `<h3 id="chapter-${chapterCounter}" class="text-lg font-semibold mt-8 mb-4">${title}</h3>`;
        chapterCounter++;
        return header;
      }

      const colorClass = i % 2 === 0 ? "text-black" : "text-gray-500";
      return `<p class="${colorClass} mt-2 text-base leading-relaxed">${unit}</p>`;
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