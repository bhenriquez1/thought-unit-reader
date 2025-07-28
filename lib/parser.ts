export type BookStructure = {
  chapters: string[];
  parsedUnits: string[];
};

// Thought-unit + chapter parser
export function parseBookWithChapters(text: string): BookStructure {
  const lines = text.split("\n");

  const chapters: string[] = [];
  const parsedUnits: string[] = [];

  for (const line of lines) {
    const clean = line.trim();
    if (!clean) continue;

    // Detect chapter headers
    if (/^(chapter\s+\d+|chapter\s+[ivxlc]+)\b/i.test(clean)) {
      chapters.push(clean);
    }

    // Basic sentence-level splitting
    const sentences = clean.match(/[^.!?]+[.!?]+/g);
    if (sentences) {
      parsedUnits.push(...sentences.map((s) => s.trim()));
    } else {
      parsedUnits.push(clean);
    }
  }

  return { chapters, parsedUnits };
}

// 🧠 Right Brain View Renderer (alternating colors, sticky/explain icons)
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

// 🌀 Hybrid Mode Renderer (collapsible chapters + Right Brain inside)
export function generateHybridHTML(chapters: string[], units: string[]): string {
  // Estimate units per chapter (even split)
  const chunkSize = Math.ceil(units.length / chapters.length || 1);
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
}