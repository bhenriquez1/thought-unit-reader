export async function parseBookWithChapters(text: string): Promise<{
  chapters: string[];
  parsedUnits: string[];
}> {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);

  const chapters: string[] = [];
  const parsedUnits: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect chapters
    if (/^(chapter|section)\s+\d+/i.test(line)) {
      chapters.push(line);
      continue;
    }

    // Parse thought-units
    const units = splitIntoThoughtUnits(line);
    parsedUnits.push(...units);
  }

  return { chapters, parsedUnits };
}

// ✨ Split a line into smaller "thought-units"
function splitIntoThoughtUnits(line: string): string[] {
  return line
    .split(/(?<=[.?!])\s+/) // split on punctuation end of sentence
    .map(unit => unit.trim())
    .filter(unit => unit.length > 0);
}

// 🧠 Right Brain View — alternating thought-unit colors with sticky/explain hooks
export function generateProgressiveReadingHTML(units: string[]): string {
  return units
    .map((unit, index) => {
      const color = index % 2 === 0 ? "black" : "gray";
      return `
        <div style="margin-bottom: 1em;">
          <span style="color: ${color}; font-weight: 500;">${unit}</span>
          <button onclick="window.handleExplain?.(${index})" style="margin-left: 10px;">🧠</button>
          <button onclick="window.handleSticky?.(${index})" style="margin-left: 5px;">📌</button>
        </div>
      `;
    })
    .join("");
}

// 🧪 Hybrid View — Chapters with thought-units grouped underneath
export function generateHybridHTML(chapters: string[], units: string[]): string {
  const grouped: Record<string, string[]> = {};
  let currentChapter = "Intro";

  for (const unit of units) {
    if (/^(chapter|section)\s+\d+/i.test(unit)) {
      currentChapter = unit;
      if (!grouped[currentChapter]) grouped[currentChapter] = [];
    } else {
      if (!grouped[currentChapter]) grouped[currentChapter] = [];
      grouped[currentChapter].push(unit);
    }
  }

  return Object.entries(grouped)
    .map(([chapter, chapterUnits]) => {
      const body = chapterUnits.map((u, i) => {
        const color = i % 2 === 0 ? "black" : "gray";
        return `<div style="margin-bottom: 1em;"><span style="color: ${color}; font-weight: 500;">${u}</span></div>`;
      }).join("");
      return `<h2 style="margin-top: 2em; font-size: 1.25em;">${chapter}</h2>${body}`;
    })
    .join("");
}