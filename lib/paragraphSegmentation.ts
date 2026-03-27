import type { ParagraphSignal } from "@/lib/readerContracts";

export interface RawBlock {
  text: string;
  index: number;
  blockType: ParagraphSignal["blockType"];
}

function detectBlockType(text: string): ParagraphSignal["blockType"] {
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
