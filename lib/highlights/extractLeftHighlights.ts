import type { PageContentClass } from "@/lib/pdf/classifyPageContent";

export type LeftHighlightKind =
  | "core_claim"
  | "mechanism"
  | "definition"
  | "contrast"
  | "process_step"
  | "clinical_rule"
  | "evidence_sentence"
  | "heading_anchor";

export type LeftHighlightSpan = {
  id: string;
  pageNumber: number;
  documentId: string;
  text: string;
  kind: LeftHighlightKind;
  confidence: number;
};

export function extractLeftHighlights(args: {
  documentId: string;
  pageNumber: number;
  pageText: string;
  contentClass: PageContentClass;
}): LeftHighlightSpan[] {
  if (args.contentClass === "image_only" || args.contentClass === "failed_sparse") return [];
  const sentences = (args.pageText || "")
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 30 && !/\.\.\.$/.test(line));

  const max = args.contentClass === "prose_with_headings" ? 6 : args.contentClass === "prose" ? 5 : args.contentClass === "mixed_visual" ? 3 : 2;
  return sentences.slice(0, max).map((text, index) => ({
    id: `${args.documentId}-${args.pageNumber}-lh-${index}`,
    pageNumber: args.pageNumber,
    documentId: args.documentId,
    text,
    kind: pickKind(text),
    confidence: Math.max(0.4, 0.9 - index * 0.08),
  }));
}

function pickKind(text: string): LeftHighlightKind {
  if (/\b(is|refers to|defined as)\b/i.test(text)) return "definition";
  if (/\b(whereas|however|in contrast|unlike)\b/i.test(text)) return "contrast";
  if (/\b(because|therefore|leads to|causes|results in)\b/i.test(text)) return "mechanism";
  if (/\b(should|must|need to|recommend)\b/i.test(text)) return "clinical_rule";
  return "core_claim";
}
