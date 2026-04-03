import type { ParagraphSignal } from "@/lib/readerContracts";

export interface RawBlock {
  text: string;
  index: number;
  blockType: ParagraphSignal["blockType"];
}

function detectBlockType(text: string): ParagraphSignal["blockType"] {
  const line = text.trim();
  if (!line) return "metadata";
  if (/^\s*[-•*]\s+/.test(line)) return "bullet";
  if (/^\s*(\d+|[A-Za-z])[.)]\s+/.test(line)) return "bullet";
  if (/^\s*(fig(?:ure)?\.?\s*\d+[A-Za-z\-]*|plate\s*\d+)\b/i.test(line)) return "caption";
  if (/^\s*(table\s*\d+[A-Za-z\-]*|chart\s*\d+)\b/i.test(line)) return "tableRow";
  if (/^\s*(source|credit|adapted from)\s*:/i.test(line)) return "reference";
  if (/^\s*(©|copyright|all rights reserved|isbn|doi|https?:\/\/|www\.)/i.test(line)) return "reference";
  if (/^\s*(page\s+\d+\s*(of\s+\d+)?|printed in|published by|edition)\b/i.test(line)) return "metadata";
  if (/^\s*(image|photo|diagram|illustration)\b/i.test(line)) return "caption";
  if (/^\s*[A-Z][A-Z0-9\s\-:&]{4,}$/.test(line) && line.length < 90) return "heading";
  if (/^(chapter|section|unit|module|part|appendix)\b/i.test(line)) return "subheading";
  if (/^\s*(references?|bibliography|acknowledg(e)?ments?)\b/i.test(line)) return "reference";
  if (/^\s*[\[(]?[A-Za-z]?\d{1,3}[\])]\s*[A-Za-z]/.test(line) && line.length < 80) return "tableRow";
  if (/^\s*[-•*]/.test(text)) return "bullet";
  if (/^\s*\d+[.)]/.test(text)) return "tableRow";
  if (/^\s*(figure|fig\.|table|chart)\b/i.test(text)) return "caption";
  if (/\b(doi|et al\.|copyright|all rights reserved|isbn)\b/i.test(text)) return "reference";
  if (/^[A-Z0-9\s\-:&]{4,}$/.test(text) && text.length < 90) return "heading";
  if (/^(chapter|section|unit|module|part|appendix)\b/i.test(text)) return "subheading";
  if (/^\s*(page\s+\d+|published by|edition)\b/i.test(text)) return "metadata";
  return "paragraph";
}

export function segmentParagraphs(text: string): RawBlock[] {
  const lines = text.split(/\n+/).map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean);
  return lines.map((line, index) => ({
    text: line,
    index,
    blockType: detectBlockType(line),
  }));
}
