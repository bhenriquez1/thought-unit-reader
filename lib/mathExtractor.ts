// lib/mathExtractor.ts
// Math signal detection, normalization, and segmentation for any textbook page.
// Works with native PDF text, OCR output, and plain text.
// No hardcoded textbook logic — signal-based approach only.

// ============================================================================
// Math character signals used for density scoring
// ============================================================================

const MATH_CHAR_PATTERNS: Array<{ pattern: RegExp; weight: number }> = [
  // Operators and comparison
  { pattern: /[=<>≤≥≠≈±]/g, weight: 2 },
  // Greek / math letters
  { pattern: /[αβγδεζηθλμνπρστφψωΣΔΩ∞∂∇]/g, weight: 3 },
  // Summation, integral, radical
  { pattern: /[∑∫√]/g, weight: 4 },
  // Fractions and division
  { pattern: /[÷⁄\/]/g, weight: 1.5 },
  // Superscripts, subscripts, powers (^, ², ³, ⁰-⁹)
  { pattern: /[\^²³⁰¹⁴⁵⁶⁷⁸⁹]/g, weight: 2 },
  // Subscript digits (₀-₉) and letters (ₐ-ₑ)
  { pattern: /[₀₁₂₃₄₅₆₇₈₉ₐₑₒₓ]/g, weight: 3 },
  // Parentheses in math context
  { pattern: /\(\s*[\d\w]+\s*\)/g, weight: 0.5 },
  // Numeric literals adjacent to variables
  { pattern: /\d+[a-zA-Z]/g, weight: 1 },
];

// Patterns that strongly suggest a display-math (equation) line
const DISPLAY_MATH_PATTERNS: RegExp[] = [
  /^\s*[A-Za-zΑ-Ωα-ω_\d]+\s*=\s*[^.!?,]{4,}/, // starts with variable = expression
  /\b(Eq\.|Equation|Formula|Lemma|Theorem|Proof)\s*\d*/i,
  /[∑∫√]{1}.*=/,                        // integral/sum = something
  /=\s*[\d\w\s\+\-\*\/\(\)\^\.]+\s*$/,  // ends with = expression
  /\$\$.+\$\$|\\begin\{equation\}/,      // LaTeX delimiters
];

// Inline math markers
const INLINE_MATH_PATTERNS: RegExp[] = [
  /\$[^$\n]{2,50}\$/, // $...$
  /\\\\[(\[][^)[\]]{2,80}\\\\[)\]]/,    // \( ... \) or \[ ... \]
];

// ============================================================================
// Types
// ============================================================================

export interface MathSegment {
  /** Stable id: `${docId}:${pageNumber}:math:${index}` */
  id: string;
  pageNumber: number;
  /** Normalised (unicode-fixed + OCR-fixed) text */
  text: string;
  /** Raw text before normalisation (useful for debugging/fallback) */
  mathRaw: string;
  /** Whether this is a display (block) equation vs inline math */
  isDisplay: boolean;
  /** 0–1 math density score */
  density: number;
  /** Index within the page's math segments */
  index: number;
}

// ============================================================================
// Math density scoring
// ============================================================================

/**
 * Returns a 0–1 score representing how "math-heavy" a text block is.
 * 0 = pure prose, 1 = all math characters.
 */
export function computeMathDensity(text: string): number {
  if (!text || text.trim().length === 0) return 0;

  let weightedHits = 0;
  for (const { pattern, weight } of MATH_CHAR_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) weightedHits += matches.length * weight;
  }

  // Normalise against text length to get a density
  const charLen = text.length;
  const rawScore = weightedHits / charLen;

  // Sigmoid-ish clamp so very dense blocks don't exceed 1
  return Math.min(1, rawScore * 2);
}

/**
 * Classify a text block's math density:
 * - 'high'   (>= 0.4): treat as equation / formula block
 * - 'medium' (>= 0.15): mixed prose+math
 * - 'low'    (< 0.15): plain prose
 */
export function mathDensityLevel(text: string): 'high' | 'medium' | 'low' {
  const d = computeMathDensity(text);
  if (d >= 0.4) return 'high';
  if (d >= 0.15) return 'medium';
  return 'low';
}

/**
 * Returns true when the text block looks like a standalone display equation.
 */
export function isDisplayMathBlock(text: string): boolean {
  const line = text.trim();
  if (!line || line.length > 500) return false;
  return DISPLAY_MATH_PATTERNS.some(p => p.test(line));
}

// ============================================================================
// Normalisation
// ============================================================================

/**
 * Unicode and OCR normalisation for math text.
 *
 * Applied transformations (in order):
 * 1. Unicode math operators → ASCII equivalents
 * 2. Common OCR glyph confusions (O/0, l/1, rn/m in math context)
 * 3. Collapse excessive whitespace
 *
 * The goal is a stable, readable string — NOT semantic LaTeX conversion.
 */
export function normalizeMathText(raw: string): string {
  let s = raw;

  // 1. Unicode math → ASCII
  s = s
    .replace(/−/g, '-')      // minus sign → hyphen-minus
    .replace(/×/g, '*')      // multiplication sign → asterisk
    .replace(/·/g, '*')      // middle dot → asterisk
    .replace(/÷/g, '/')      // division sign → slash
    .replace(/≈/g, '~')      // almost-equal → tilde
    .replace(/≠/g, '!=')     // not-equal
    .replace(/≤/g, '<=')     // less-or-equal
    .replace(/≥/g, '>=')     // greater-or-equal
    .replace(/±/g, '+/-')    // plus-minus
    .replace(/∞/g, 'inf')    // infinity
    .replace(/→/g, '->')     // arrow
    .replace(/←/g, '<-')
    .replace(/↔/g, '<->')
    .replace(/∑/g, 'sum')    // summation
    .replace(/∏/g, 'prod')   // product
    .replace(/∫/g, 'int')    // integral
    .replace(/√/g, 'sqrt')   // square root
    .replace(/∂/g, 'd')      // partial derivative
    .replace(/∇/g, 'del')    // nabla
    // Superscript digits
    .replace(/⁰/g, '^0').replace(/¹/g, '^1').replace(/²/g, '^2')
    .replace(/³/g, '^3').replace(/⁴/g, '^4').replace(/⁵/g, '^5')
    .replace(/⁶/g, '^6').replace(/⁷/g, '^7').replace(/⁸/g, '^8')
    .replace(/⁹/g, '^9')
    // Subscript digits
    .replace(/₀/g, '_0').replace(/₁/g, '_1').replace(/₂/g, '_2')
    .replace(/₃/g, '_3').replace(/₄/g, '_4').replace(/₅/g, '_5')
    .replace(/₆/g, '_6').replace(/₇/g, '_7').replace(/₈/g, '_8')
    .replace(/₉/g, '_9');

  // 2. OCR confusion fixes (applied only in likely-math contexts)
  //    These patterns are conservative to avoid corrupting prose.
  if (computeMathDensity(s) >= 0.15) {
    // rn → m only when surrounded by digits or operators
    s = s.replace(/(?<=[\d=+\-*/])\s*rn\s*(?=[\d=+\-*/])/g, 'm');
    // O (letter O) → 0 only when between operators
    s = s.replace(/(?<=[=+\-*/\(])\s*O\s*(?=[=+\-*/\)])/g, '0');
    // l (lowercase L) → 1 only when between operators
    s = s.replace(/(?<=[=+\-*/\(])\s*l\s*(?=[=+\-*/\)])/g, '1');
  }

  // 3. Normalise whitespace
  s = s.replace(/\s+/g, ' ').trim();

  return s;
}

// ============================================================================
// Segment extraction
// ============================================================================

/**
 * Extract math-heavy segments from page text.
 * Splits text into lines/paragraphs, scores each, and returns only blocks
 * with mathDensity >= `minDensity` (default 0.15).
 *
 * The returned segments are ordered by their position in the original text.
 */
export function extractMathSegments(
  text: string,
  pageNumber: number,
  docId: string,
  minDensity = 0.15,
): MathSegment[] {
  if (!text || !text.trim()) return [];

  // Split into candidate lines/paragraphs
  const lines = text
    .split(/\n+/)
    .map(l => l.trim())
    .filter(l => l.length > 1);

  const segments: MathSegment[] = [];
  let mathIndex = 0;

  for (const line of lines) {
    const density = computeMathDensity(line);
    if (density < minDensity) continue;

    const mathRaw = line;
    const normalised = normalizeMathText(line);
    const isDisplay = isDisplayMathBlock(line) || density >= 0.4;

    segments.push({
      id: `${docId}:${pageNumber}:math:${mathIndex}`,
      pageNumber,
      text: normalised,
      mathRaw,
      isDisplay,
      density,
      index: mathIndex,
    });
    mathIndex++;
  }

  return segments;
}

// ============================================================================
// Formula rendering helper
// ============================================================================

/**
 * Determine how to render a math string for display.
 * Returns 'katex' if the string looks like valid KaTeX input,
 * 'mono' (monospace) otherwise.
 *
 * This check is conservative: prefer 'mono' if in doubt, since
 * a bad KaTeX parse is worse than plain monospace.
 */
export function mathRenderMode(text: string): 'katex' | 'mono' {
  // KaTeX-safe: only contains ASCII math operators + common symbols
  const safePattern = /^[\w\s\+\-\*\/\=\<\>\(\)\[\]\{\}\^\._~!,;:]+$/;
  return safePattern.test(text) ? 'katex' : 'mono';
}
