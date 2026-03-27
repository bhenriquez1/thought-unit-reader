import type { FormulaCard } from "@/lib/readerContracts";

const FORMULA_LINE_RE = /(=|\+|−|-|×|÷|\/|\^|²|³|₀|₁|₂|₃|₄|₅|₆|₇|₈|₉|√|\(|\)|\\frac|\\sqrt|\b[a-zA-Z]_[a-zA-Z0-9]+\b)/;

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
    .replace(/\^2/g, "²")
    .replace(/\^3/g, "³")
    .trim();
}

export function toSpeakableFormula(raw: string): string {
  return raw
    .replace(/\(/g, " open parenthesis ")
    .replace(/\)/g, " close parenthesis ")
    .replace(/\^2|²/g, " squared ")
    .replace(/\^3|³/g, " cubed ")
    .replace(/√|\\sqrt/g, " square root of ")
    .replace(/₀/g, " subscript zero ")
    .replace(/₁/g, " subscript one ")
    .replace(/₂/g, " subscript two ")
    .replace(/₃/g, " subscript three ")
    .replace(/=/g, " equals ")
    .replace(/\+/g, " plus ")
    .replace(/−|-/g, " minus ")
    .replace(/×|\*/g, " times ")
    .replace(/÷|\//g, " divided by ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferUsageHint(formula: string): string {
  if (/a²\s*-\s*b²/.test(formula)) return "Use for difference-of-squares factoring patterns.";
  if (/a²\s*\+\s*2ab\s*\+\s*b²/.test(formula)) return "Use when recognizing perfect-square trinomial expansion.";
  return "Use when this symbolic structure appears in the stem/options.";
}

export function extractFormulaCards(text: string): FormulaCard[] {
  return detectFormulaLines(text)
    .slice(0, 6)
    .map((raw) => {
      const normalized = normalizeFormula(raw);
      return {
        raw,
        normalized,
        speakable: toSpeakableFormula(normalized),
        usage: inferUsageHint(normalized),
        trap: "Watch sign order and substitution consistency.",
      };
    });
}
