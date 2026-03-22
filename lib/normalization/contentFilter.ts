const BOILERPLATE_PATTERNS: RegExp[] = [
  /all rights reserved/gi,
  /electronic rights/gi,
  /copyright\s*(\(c\)|©)?\s*\d{4}/gi,
  /published by/gi,
  /printed in/gi,
  /isbn[:\s]/gi,
  /doi[:\s]/gi,
  /author[:\s]/gi,
  /^\s*page\s+\d+\s*$/gim,
  /^\s*chapter\s+\d+\s*$/gim,
  /\bwww\.[\w.-]+\.[a-z]{2,}\b/gi,
  /\bhttp[s]?:\/\/\S+/gi,
];

const OCR_JUNK_PATTERNS: RegExp[] = [
  /[|]{3,}/g,
  /[_]{3,}/g,
  /[•·]{4,}/g,
  /\b[a-zA-Z]{1}\s+[a-zA-Z]{1}\s+[a-zA-Z]{1}\b/g,
  /\s{3,}/g,
];

export function filterLearningNoise(text: string): string {
  if (!text) return '';

  let cleaned = text;
  for (const pattern of BOILERPLATE_PATTERNS) {
    cleaned = cleaned.replace(pattern, ' ');
  }

  for (const pattern of OCR_JUNK_PATTERNS) {
    cleaned = cleaned.replace(pattern, ' ');
  }

  return cleaned
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
