export type BookStructure = {
  chapters: string[];
  parsed: string;
};

// Dummy parser – replace later with your real AI logic
export function parseBookWithChapters(text: string): BookStructure {
  const lines = text.split("\n");

  const chapters = lines
    .filter((line) => line.toLowerCase().includes("chapter"))
    .map((line) => line.trim());

  const parsed = lines
    .map((line, i) => {
      const style = i % 2 === 0 ? "color: black;" : "color: gray;";
      return `<span style="${style}">${line}</span>`;
    })
    .join("<br>");

  return { chapters, parsed };
}

// Optional: For Right Brain View or Hybrid
export function generateProgressiveReadingHTML(parsed: string): string {
  // You can enhance this later with icons, AI explanations, etc.
  return `<div style="font-size: 1.1rem; line-height: 1.8;">${parsed}</div>`;
}