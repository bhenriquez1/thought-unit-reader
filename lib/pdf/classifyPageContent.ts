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
  const words = text.split(/\s+/).filter(Boolean);
  const sentenceCount = (text.match(/[.!?](\s|$)/g) || []).length;

  const blankLike = lines.filter((line) => /_{2,}|\[\s*\]|\(\s*\)|\b(yes|no)\b\s*[:\-]/i.test(line)).length;
  const labelValue = lines.filter((line) => /^[A-Za-z][A-Za-z\s]{2,25}:\s*\S/.test(line)).length;
  const tableLike = lines.filter((line) => /\s{2,}|\|/.test(line)).length;
  const headingLike = lines.filter((line) => /^[A-Z][A-Z\s\-]{5,}$/.test(line)).length;

  if (words.length < 25) return "sparse_text";
  if (sentenceCount === 0 && words.length < 80) return "failed_sparse";
  if (blankLike >= 3 || labelValue >= 5) return "form_page";
  if (tableLike >= Math.max(4, Math.floor(lines.length * 0.4))) return "table_heavy";
  if (sentenceCount < 2 && words.length < 120) return "sparse_text";
  if (headingLike >= 1 && sentenceCount >= 2) return "prose_with_headings";

  return "prose";
}
