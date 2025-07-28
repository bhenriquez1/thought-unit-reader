export type BookStructure = {
  chapters: string[];
  parsedUnits: string[];
};

/**
 * 🧠 Parses a raw book text into chapters and thought-units.
 * - Detects chapters based on "Chapter" keywords.
 * - Breaks other lines into sentence-like units for Right Brain rendering.
 */
export function parseBookWithChapters(text: string): BookStructure {
  const lines = text.split("\n");
  const chapters: string[] = [];
  const parsedUnits: string[] = [];

  for (const line of lines) {
    const clean = line.trim();
    if (!clean) continue;

    // 📌 Chapter Detection (e.g., "Chapter 1", "Chapter IX", "CHAPTER ONE")
    if (/^(chapter\s+\d+|chapter\s+[ivxlc]+|chapter\s+\w+)/i.test(clean)) {
      chapters.push(clean);
    }

    // ✂️ Sentence-like splitting (handles . ! ?)
    const sentences = clean.match(/[^.!?]+[.!?]+/g);
    if (sentences) {
      parsedUnits.push(...sentences.map((s) => s.trim()));
    } else {
      parsedUnits.push(clean);
    }
  }

  return { chapters, parsedUnits };
}

/**
 * 🧠 Renders parsed units in alternating color blocks
 * - Includes buttons for 💡 Explain and 📌 Sticky per unit
 */
export function generateProgressiveReadingHTML(units: string[]): string {
  return units
    .map((unit, i) => {
      return `
        <div class="my-4 p-3 rounded-lg bg-white dark:bg-zinc-800 shadow-sm" data-unit-index="${i}">
          <p class="text-black dark:text-white">
            <span class="${i % 2 === 0 ? 'text-black dark:text-white' : 'text-gray-600 dark:text-gray-300'}">${unit}</span>
            <span class="ml-2 inline-flex gap-2">
              <button class="text-sm text-blue-500 hover:underline" onclick="window.handleExplain?.(${i})">💡</button>
              <button class="text-sm text-yellow-500 hover:underline" onclick="window.handleSticky?.(${i})">📌</button>
            </span>
          </p>
        </div>
      `;
    })
    .join("\n");
}

/**
 * 🌀 Renders Hybrid Mode
 * - Collapsible chapter sections
 * - Contains Right Brain view inside each section
 */
export function generateHybridHTML(chapters: string[], units: string[]): string {
  if (!chapters.length) {
    // fallback: show all units in one section
    return `<div>${generateProgressiveReadingHTML(units)}</div>`;
  }
  const chunkSize = Math.ceil(units.length / chapters.length);
  let html = "";

  chapters.forEach((chapter, i) => {
    const start = i * chunkSize;
    const end = start + chunkSize;
    const chapterUnits = units.slice(start, end);

    html += `
      <details class="mb-4 border rounded dark:border-zinc-700">
        <summary class="font-bold text-lg p-2 bg-zinc-100 dark:bg-zinc-800">${chapter}</summary>
        <div class="p-4 space-y-3">
          ${generateProgressiveReadingHTML(chapterUnits)}
        </div>
      </details>
    `;
  });

  return html;