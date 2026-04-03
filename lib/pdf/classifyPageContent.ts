export type PageContentClass =
  | "prose"
  | "prose_with_headings"
  | "form_page"
  | "table_heavy"
  | "image_only"
  | "mixed_visual"
  | "sparse_text"
  | "failed_sparse";

export function classifyPageContent(pageText: string): PageContentClass {
  const text = (pageText || "").trim();
  if (!text) return "image_only";

  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const words = text.match(/[A-Za-z]+/g) || [];
  const sentenceCount = (text.match(/[.!?]/g) || []).length;
  const formSignals = (text.match(/\b(yes|no|checkbox|check|date|name|address|phone|symptom|history|chief complaint)\b/gi) || []).length;
  const blankSignals = (text.match(/_{3,}|\[\s*\]|\(\s*\)/g) || []).length;
  const tableSignals = lines.filter((line) => /\|/.test(line) || /\t/.test(line) || /\b\d+\s+\d+\b/.test(line)).length;
  const headingSignals = lines.filter((line) => line.length < 70 && /^[A-Z0-9\s\-:()]+$/.test(line)).length;

  if (words.length < 20) return "sparse_text";
  if (sentenceCount === 0 && words.length < 40) return "failed_sparse";
  if (formSignals + blankSignals >= 6) return "form_page";
  if (tableSignals >= Math.max(3, Math.floor(lines.length * 0.35))) return "table_heavy";
  if (headingSignals >= 2 && sentenceCount >= 2) return "prose_with_headings";
  if (sentenceCount < 2) return "sparse_text";
  return "prose";
}
