// components/surgeonView2/MathDisplay.tsx
// CSS-based math renderer — no KaTeX dependency required.
// Converts normalised LaTeX-like tokens to styled HTML with superscripts/fractions.

import React from 'react';
import type { MathSemanticPayload } from '@/lib/surgeonEngine/mathSemantic';

// ============================================================================
// Token conversion table: LaTeX → unicode / HTML
// ============================================================================

const LATEX_TO_UNICODE: Array<[RegExp, string | ((...args: string[]) => string)]> = [
  // Greek letters
  [/\\pi/g, 'π'],
  [/\\alpha/g, 'α'],
  [/\\beta/g, 'β'],
  [/\\gamma/g, 'γ'],
  [/\\Delta/g, 'Δ'],
  [/\\delta/g, 'δ'],
  [/\\mu/g, 'μ'],
  [/\\lambda/g, 'λ'],
  [/\\sigma/g, 'σ'],
  [/\\theta/g, 'θ'],
  [/\\omega/g, 'ω'],

  // Operators
  [/\\times/g, '×'],
  [/\\div/g, '÷'],
  [/\\leq/g, '≤'],
  [/\\geq/g, '≥'],
  [/\\neq/g, '≠'],
  [/\\sqrt\{([^}]+)\}/g, '√($1)'],
  [/\\sqrt/g, '√'],

  // Superscript exponents: ^{n} or ^n
  [/\^\{([^}]+)\}/g, (_, e) => toSuperscript(e)],
  [/\^(\d+)/g, (_, e) => toSuperscript(e)],

  // Subscripts: _{n}
  [/\_\{([^}]+)\}/g, (_, s) => toSubscript(s)],

  // Fractions: \frac{a}{b} → a⁄b
  [/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1⁄$2'],

  // Clean up remaining backslashes
  [/\\/g, ''],
  // Clean up braces
  [/[{}]/g, ''],
];

const SUPERSCRIPT_MAP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
  'n': 'ⁿ', 'i': 'ⁱ',
};

const SUBSCRIPT_MAP: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
  '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
};

function toSuperscript(s: string): string {
  return s.split('').map(c => SUPERSCRIPT_MAP[c] ?? c).join('');
}

function toSubscript(s: string): string {
  return s.split('').map(c => SUBSCRIPT_MAP[c] ?? c).join('');
}

export function renderMath(expr: string): string {
  let result = expr;
  for (const [pattern, replacement] of LATEX_TO_UNICODE) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result = result.replace(pattern, replacement as any);
  }
  return result.trim();
}

// ============================================================================
// Inline math span — renders a short expression inline with prose
// ============================================================================

export const InlineMath: React.FC<{ expr: string; className?: string }> = ({
  expr,
  className = '',
}) => (
  <span className={`font-mono text-teal-300 ${className}`}>
    {renderMath(expr)}
  </span>
);

// ============================================================================
// Block math display — display-mode equation with visual boxing
// ============================================================================

export const BlockMath: React.FC<{
  expr: string;
  className?: string;
}> = ({ expr, className = '' }) => (
  <div
    className={`
      my-1.5 px-3 py-2 rounded-lg
      bg-gray-900/70 border border-teal-700/40
      font-mono text-base text-teal-200
      text-center tracking-wide
      ${className}
    `}
  >
    {renderMath(expr)}
  </div>
);

// ============================================================================
// Full Math Semantic Card — expression + variables + clinical + exam trap
// ============================================================================

export const MathSemanticCard: React.FC<{
  payload: MathSemanticPayload;
  onHighlight?: (text: string) => void;
}> = ({ payload, onHighlight }) => {
  const rendered = renderMath(payload.expression);

  return (
    <div
      className="rounded-xl border border-teal-700/40 bg-gray-900/60 overflow-hidden cursor-pointer hover:border-teal-600/60 transition-colors"
      onClick={() => onHighlight?.(payload.raw)}
    >
      {/* Expression block */}
      <div className="px-3 py-2.5 bg-gray-900/80 border-b border-teal-800/30">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px] uppercase tracking-widest text-teal-600 font-semibold">
            Formula
          </span>
          <span className="text-[9px] text-gray-600 font-mono">
            {payload.renderMode}
          </span>
        </div>
        <div className="font-mono text-sm text-teal-200 text-center py-1 tracking-wide">
          {rendered}
        </div>
      </div>

      {/* Meaning */}
      <div className="px-3 py-2 border-b border-gray-800/60">
        <div className="text-[9px] uppercase tracking-widest text-blue-500 font-semibold mb-0.5">
          Meaning
        </div>
        <p className="text-[11px] text-gray-300">{payload.meaning}</p>
      </div>

      {/* Variables */}
      {payload.variables.length > 0 && (
        <div className="px-3 py-2 border-b border-gray-800/60">
          <div className="text-[9px] uppercase tracking-widest text-purple-500 font-semibold mb-1">
            Variables
          </div>
          <div className="space-y-0.5">
            {payload.variables.map(v => (
              <div key={v.symbol} className="flex items-baseline gap-2 text-[11px]">
                <span className="font-mono text-purple-300 flex-shrink-0 w-4">{v.symbol}</span>
                <span className="text-gray-400">=</span>
                <span className="text-gray-300">{v.meaning}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Clinical use */}
      <div className="px-3 py-2 border-b border-gray-800/60">
        <div className="text-[9px] uppercase tracking-widest text-green-600 font-semibold mb-0.5">
          Clinical Use
        </div>
        <p className="text-[11px] text-green-300/80">{payload.clinicalUse}</p>
      </div>

      {/* Exam trap */}
      {payload.examTrap && (
        <div className="px-3 py-2 bg-amber-900/15">
          <div className="text-[9px] uppercase tracking-widest text-amber-500 font-semibold mb-0.5">
            Exam Trap
          </div>
          <p className="text-[11px] text-amber-300/90">{payload.examTrap}</p>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Importance Heat Bar — visual 0-100 importance score indicator
// ============================================================================

export const ImportanceBar: React.FC<{
  score: number;
  className?: string;
}> = ({ score, className = '' }) => {
  const clamped = Math.max(0, Math.min(100, score));
  const color =
    clamped >= 85 ? 'bg-red-400' :
    clamped >= 60 ? 'bg-amber-400' :
    clamped >= 40 ? 'bg-blue-400' :
    'bg-gray-600';

  return (
    <div
      className={`h-1 rounded-full bg-gray-700/60 overflow-hidden ${className}`}
      title={`Importance: ${clamped}/100`}
    >
      <div
        className={`h-full rounded-full ${color} transition-all`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
};
