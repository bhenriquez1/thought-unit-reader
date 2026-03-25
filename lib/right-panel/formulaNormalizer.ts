import type { FormulaCard } from "@/lib/readerContracts";

const FORMULA_LINE_RE = /(=|\+|−|-|×|÷|\/|\^|²|³|\(|\)|\\frac|\\sqrt)/;

export function detectFormulaLines(text: string): string[] {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 2 && FORMULA_LINE_RE.test(line));
}

export function normalizeFormula(raw: string): string {
  return raw
    .replace(/\s*([=+\-×÷\/()])\s*/g, " $1 ")
    .replace(/\s+/g, " ")
    .trim();
}

export function toSpeakableFormula(raw: string): string {
  return raw
    .replace(/\(/g, " open parenthesis ")
    .replace(/\)/g, " close parenthesis ")
    .replace(/²/g, " squared ")
    .replace(/³/g, " cubed ")
    .replace(/=/g, " equals ")
    .replace(/\+/g, " plus ")
    .replace(/−|-/g, " minus ")
    .replace(/×|\*/g, " times ")
    .replace(/÷|\//g, " divided by ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractFormulaCards(text: string): FormulaCard[] {
  return detectFormulaLines(text).slice(0, 6).map((raw) => ({
    raw,
    normalized: normalizeFormula(raw),
    speakable: toSpeakableFormula(raw),
  }));
}
