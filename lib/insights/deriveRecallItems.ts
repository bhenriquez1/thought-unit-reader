// lib/insights/deriveRecallItems.ts
// Derives Shadow Recall (pre-read) questions from already-computed synthesis fields.
// Used as a fallback when Stage 1 preReadRecallItems is null, so the drawer is
// never empty after synthesis completes. Zero extra AI calls.

import type { MiniTestItem } from "./synthesizeTeachingOutput";

export interface SynthesisForRecall {
  coreIdea?: string;
  keyMechanism?: string | null;
  commonConfusion?: string | null;
  memoryAnchor?: string | null;
  examSignal?: string | null;
}

export function deriveRecallItems(s: SynthesisForRecall): MiniTestItem[] {
  const items: MiniTestItem[] = [];

  if (s.coreIdea?.trim()) {
    items.push({
      question: `Before reading: What do you already know about "${s.coreIdea.trim().slice(0, 80)}"?`,
      type: "short-answer",
      options: null,
      correctAnswer: s.coreIdea.trim(),
      explanation: "This is the governing concept of the page. See how close your prediction was.",
    });
  }

  if (s.keyMechanism?.trim() && s.keyMechanism !== s.coreIdea) {
    items.push({
      question: `Can you predict the mechanism or logic that explains this? "${s.coreIdea?.trim().slice(0, 60) ?? "the main concept"}"`,
      type: "short-answer",
      options: null,
      correctAnswer: s.keyMechanism.trim(),
      explanation: "This is the causal chain the page teaches. See how close your prediction was.",
    });
  }

  if (s.commonConfusion?.trim()) {
    items.push({
      question: "What confusion or mistake do students commonly make with this concept?",
      type: "trap",
      options: null,
      correctAnswer: s.commonConfusion.trim(),
      explanation: "Knowing the trap before reading makes it harder to fall into.",
    });
  }

  if (s.memoryAnchor?.trim()) {
    items.push({
      question: `From memory: "${buildFillBlank(s.memoryAnchor.trim())}"`,
      type: "fill-in-the-blank",
      options: null,
      correctAnswer: extractBlank(s.memoryAnchor.trim()),
      explanation: s.memoryAnchor.trim(),
    });
  }

  return items.slice(0, 4);
}

function buildFillBlank(sentence: string): string {
  const words = sentence.split(/\s+/);
  if (words.length < 4) return `${sentence} — what is the key term?`;
  // Blank the most informative word (longest, non-stop word in the second half)
  const stopWords = new Set(["the","a","an","of","in","is","are","and","or","to","that","this","with","for","it","as","by","on","at","from"]);
  const candidates = words.map((w, i) => ({ w: w.replace(/[.,;:]/g, ""), i, len: w.length }))
    .filter(c => c.i > words.length / 3 && c.len > 4 && !stopWords.has(c.w.toLowerCase()));
  if (!candidates.length) return sentence;
  const target = candidates.reduce((a, b) => b.len > a.len ? b : a);
  return words.map((w, i) => i === target.i ? "_______" : w).join(" ");
}

function extractBlank(sentence: string): string {
  const words = sentence.split(/\s+/);
  const stopWords = new Set(["the","a","an","of","in","is","are","and","or","to","that","this","with","for","it","as","by","on","at","from"]);
  const candidates = words.map((w, i) => ({ w: w.replace(/[.,;:]/g, ""), i, len: w.length }))
    .filter(c => c.i > words.length / 3 && c.len > 4 && !stopWords.has(c.w.toLowerCase()));
  if (!candidates.length) return "";
  return candidates.reduce((a, b) => b.len > a.len ? b : a).w;
}
