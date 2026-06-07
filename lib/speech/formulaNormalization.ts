// lib/speech/formulaNormalization.ts
// Formula-aware speech normalization — converts math, science, and engineering
// notation into natural spoken language before TTS.
//
// Pipeline position:  raw text → THIS MODULE → formulaToSpeech() → naturalizeSpeech() → TTS
//
// This module handles high-level patterns (units, named formulas, calculus,
// scientific notation, fractions, statistics, dental) that formulaToSpeech()
// in studySpeechEngine.ts does not cover.

export interface FormulaResult {
  text: string;
  hasMath: boolean;
  hasScience: boolean;
  transformations: number;
}

// ── Superscript / subscript digit maps ───────────────────────────────────────

const SUP: Record<string, string> = {
  '⁰':'0','¹':'1','²':'2','³':'3','⁴':'4',
  '⁵':'5','⁶':'6','⁷':'7','⁸':'8','⁹':'9',
  '⁻':'-','⁺':'+',
};

// ── Known physics / chemistry formulas ───────────────────────────────────────

const PHYSICS_FORMULAS: Array<[RegExp, string]> = [
  [/\bF\s*=\s*ma\b/g,       'Force equals mass times acceleration'],
  [/\bE\s*=\s*mc²\b/g,      'Energy equals mass times the speed of light squared'],
  [/\bE\s*=\s*mc2\b/g,      'Energy equals mass times the speed of light squared'],
  [/\bPV\s*=\s*nRT\b/g,     'P V equals n R T'],
  [/\bV\s*=\s*IR\b/g,       'Voltage equals current times resistance'],
  [/\bP\s*=\s*IV\b/g,       'Power equals current times voltage'],
  [/\bW\s*=\s*Fd\b/g,       'Work equals force times distance'],
  [/\bKE\s*=\s*½mv²\b/g,    'kinetic energy equals one half m v squared'],
  [/\bPE\s*=\s*mgh\b/g,     'potential energy equals m g h'],
  [/\bv\s*=\s*fλ\b/g,       'velocity equals frequency times wavelength'],
  [/\bv\s*=\s*d\/t\b/g,     'velocity equals distance over time'],
  [/\ba\s*=\s*Δv\/Δt\b/g,   'acceleration equals change in velocity over change in time'],
];

// Additional chemical names beyond what formulaToSpeech handles
const EXTRA_CHEM: Array<[RegExp, string]> = [
  [/\bH₂SO₄\b/g,   'sulfuric acid'],
  [/\bHNO₃\b/g,    'nitric acid'],
  [/\bH₃PO₄\b/g,   'phosphoric acid'],
  [/\bNaOH\b/g,    'sodium hydroxide'],
  [/\bKOH\b/g,     'potassium hydroxide'],
  [/\bNaHCO₃\b/g,  'sodium bicarbonate'],
  [/\bNa₂CO₃\b/g,  'sodium carbonate'],
  [/\bCaCO₃\b/g,   'calcium carbonate'],
  [/\bNH₃\b/g,     'ammonia'],
  [/\bCH₄\b/g,     'methane'],
  [/\bC₂H₅OH\b/g,  'ethanol'],
  [/\bC₆H₁₂O₆\b/g, 'glucose'],
  [/\bCO\b/g,      'carbon monoxide'],
  [/\bSO₂\b/g,     'sulfur dioxide'],
  [/\bNO₂\b/g,     'nitrogen dioxide'],
  [/\bN₂O\b/g,     'nitrous oxide'],
  [/\bNAD\+/g,     'N A D plus'],
  [/\bFADH₂\b/g,   'F A D H 2'],
  [/\bNADPH\b/g,   'N A D P H'],
  [/\bmRNA\b/g,    'messenger R N A'],
  [/\btRNA\b/g,    'transfer R N A'],
  [/\brRNA\b/g,    'ribosomal R N A'],
  [/\bDNA\b/g,     'D N A'],
  [/\bRNA\b/g,     'R N A'],
];

// ── Medical / science units ───────────────────────────────────────────────────

const UNITS: Array<[RegExp, string]> = [
  // Pressure
  [/\bmmHg\b/g,       'millimeters of mercury'],
  [/\bcmH₂O\b/g,      'centimeters of water'],
  [/\bkPa\b/g,        'kilopascals'],
  [/\batm\b/g,        'atmospheres'],
  [/\btorr\b/g,       'torr'],
  // Concentration / dose
  [/\bmg\/dL\b/g,     'milligrams per deciliter'],
  [/\bg\/dL\b/g,      'grams per deciliter'],
  [/\bmg\/kg\b/g,     'milligrams per kilogram'],
  [/\bμg\/kg\b/g,     'micrograms per kilogram'],
  [/\bng\/mL\b/g,     'nanograms per milliliter'],
  [/\bμg\/mL\b/g,     'micrograms per milliliter'],
  [/\bmg\/mL\b/g,     'milligrams per milliliter'],
  [/\bmol\/L\b/g,     'moles per liter'],
  [/\bmmol\/L\b/g,    'millimoles per liter'],
  [/\bμmol\/L\b/g,    'micromoles per liter'],
  [/\bmEq\/L\b/g,     'milliequivalents per liter'],
  [/\bIU\/mL\b/g,     'international units per milliliter'],
  // Flow / rate
  [/\bL\/min\b/g,     'liters per minute'],
  [/\bmL\/min\b/g,    'milliliters per minute'],
  [/\bmL\/hr\b/g,     'milliliters per hour'],
  // Velocity / acceleration
  [/\bm\/s²\b/g,      'meters per second squared'],
  [/\bm\/s\b/g,       'meters per second'],
  [/\bkm\/h\b/g,      'kilometers per hour'],
  [/\bft\/s\b/g,      'feet per second'],
  // Energy
  [/\bkJ\/mol\b/g,    'kilojoules per mole'],
  [/\bkcal\/mol\b/g,  'kilocalories per mole'],
  [/\bkJ\b/g,         'kilojoules'],
  [/\bkcal\b/g,       'kilocalories'],
  [/\beV\b/g,         'electron volts'],
  [/\bkWh\b/g,        'kilowatt hours'],
  // Temperature
  [/\b°C\b/g,         'degrees Celsius'],
  [/\b°F\b/g,         'degrees Fahrenheit'],
  // Volume
  [/\bμL\b/g,         'microliters'],
  [/\bmL\b/g,         'milliliters'],
  [/\bdL\b/g,         'deciliters'],
  // Mass
  [/\bμg\b/g,         'micrograms'],
  [/\bng\b/g,         'nanograms'],
  [/\bpg\b/g,         'picograms'],
  [/\bmg\b/g,         'milligrams'],
  [/\bkg\b/g,         'kilograms'],
  // Frequency
  [/\bGHz\b/g,        'gigahertz'],
  [/\bMHz\b/g,        'megahertz'],
  [/\bkHz\b/g,        'kilohertz'],
  [/\bHz\b/g,         'hertz'],
  // Force / pressure
  [/\bkPa\b/g,        'kilopascals'],
  [/\bPa\b/g,         'pascals'],
  // Moles
  [/\bμmol\b/g,       'micromoles'],
  [/\bmmol\b/g,       'millimoles'],
  [/\bnmol\b/g,       'nanomoles'],
  [/\bpmol\b/g,       'picomoles'],
  [/\bmol\b/g,        'moles'],
  // Electrical
  [/\bkΩ\b/g,         'kilohms'],
  [/\bMΩ\b/g,         'megohms'],
  [/\bmA\b/g,         'milliamps'],
  [/\bμA\b/g,         'microamps'],
  [/\bmV\b/g,         'millivolts'],
  [/\bμV\b/g,         'microvolts'],
  [/\bkV\b/g,         'kilovolts'],
];

// ── Main normalization function ───────────────────────────────────────────────

export function normalizeFormulasForSpeech(raw: string): FormulaResult {
  if (!raw?.trim()) return { text: raw ?? '', hasMath: false, hasScience: false, transformations: 0 };

  let t = raw;
  let count = 0;

  function rep(re: RegExp, sub: string): void {
    const next = t.replace(re, sub);
    if (next !== t) { count++; t = next; }
  }
  function repFn(re: RegExp, fn: (m: string, ...a: string[]) => string): void {
    const next = t.replace(re, fn as any);
    if (next !== t) { count++; t = next; }
  }
  function applyList(pairs: Array<[RegExp, string]>): void {
    for (const [re, sub] of pairs) rep(re, sub);
  }

  // ── Detection (before any transforms) ──────────────────────────────────────

  const hasMath = (
    /[∑∏∫√≈≠≤≥±∞∂²³⁴⁵⁶⁷⁸⁹]/.test(raw) ||
    /\b(sin|cos|tan|cot|log|ln|lim|dy\/dx|d\/dx)\b/.test(raw) ||
    /\b\d+\/\d+\b/.test(raw) ||
    /\d+\s*[×x]\s*10/.test(raw)
  );
  const hasScience = (
    /[→⇌↔↑↓αβγδεθλμπσωφ]/.test(raw) ||
    /[₀-₉]/.test(raw) ||
    /\b(mmHg|mol\/|mg\/|ATP|ADP|DNA|RNA|mmol|μmol|kPa|eV)\b/i.test(raw) ||
    /\b[A-Z][a-z]?[₀-₉]/.test(raw)
  );

  // ── 1. Known physics formulas ─────────────────────────────────────────────
  applyList(PHYSICS_FORMULAS);

  // ── 2. Extra chemical names (beyond formulaToSpeech) ─────────────────────
  applyList(EXTRA_CHEM);

  // ── 3. Scientific notation ────────────────────────────────────────────────
  // "3.5 × 10⁸"  or  "3.5×10^8"  or  "3.5e8"
  repFn(/(\d+\.?\d*)\s*[×x]\s*10([⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+)/g, (_, coeff, expStr) => {
    const exp = expStr.split('').map((c: string) => SUP[c] ?? c).join('');
    const neg = exp.startsWith('-');
    const absExp = neg ? exp.slice(1) : exp;
    return `${coeff} times ten to the ${neg ? 'negative ' : ''}${ordinalPower(absExp)} power`;
  });
  repFn(/(\d+\.?\d*)\s*[×x]\s*10\^(-?\d+)/g, (_, coeff, exp) => {
    const neg = exp.startsWith('-');
    const absExp = neg ? exp.slice(1) : exp;
    return `${coeff} times ten to the ${neg ? 'negative ' : ''}${ordinalPower(absExp)} power`;
  });
  repFn(/(\d+\.?\d*)e(-?\d+)/gi, (_, coeff, exp) => {
    const neg = exp.startsWith('-');
    const absExp = neg ? exp.slice(1) : exp;
    return `${coeff} times ten to the ${neg ? 'negative ' : ''}${ordinalPower(absExp)} power`;
  });

  // ── 4. Superscript digits → power words ──────────────────────────────────
  // Variable/number raised to a power: x², m³, 10⁸, r²
  repFn(/([a-zA-Z0-9])(²)/g, (_, b) => `${b} squared`);
  repFn(/([a-zA-Z0-9])(³)/g, (_, b) => `${b} cubed`);
  repFn(/([a-zA-Z0-9])([⁴⁵⁶⁷⁸⁹])/g, (_, b, s) => `${b} to the ${ordinalPower(SUP[s] ?? s)} power`);
  // Negative superscripts: cm⁻¹ → "per centimeter" (wavenumber)
  repFn(/([a-zA-Z]+)⁻([¹²³⁴⁵⁶⁷⁸⁹])/g, (_, unit, s) => {
    const n = SUP[s] ?? s;
    return n === '1' ? `per ${unit}` : `${unit} to the negative ${ordinalPower(n)} power`;
  });

  // ── 5. Calculus notation ──────────────────────────────────────────────────
  repFn(/d²([a-zA-Z])\/d([a-zA-Z])²/g,
    (_, y, x) => `the second derivative of ${y} with respect to ${x}`);
  repFn(/dy\/dx\b/g, () => 'the derivative of y with respect to x');
  repFn(/d([a-zA-Z])\/d([a-zA-Z])\b/g,
    (_, y, x) => `the derivative of ${y} with respect to ${x}`);
  repFn(/∂([a-zA-Z])\/∂([a-zA-Z])\b/g,
    (_, y, x) => `the partial derivative of ${y} with respect to ${x}`);
  repFn(/∂\/∂([a-zA-Z])\b/g,
    (_, x) => `the partial derivative with respect to ${x}`);
  rep(/√\(([^)]+)\)/g, 'the square root of ($1)');
  repFn(/√([a-zA-Z0-9]+)/g, (_, e) => `the square root of ${e}`);

  // ── 6. Arrow sequences (A → B → C) ───────────────────────────────────────
  // Triple: A → B → C  →  "A leads to B, which leads to C"
  repFn(/([\w₀-₉+\-]+)\s*→\s*([\w₀-₉+\-]+)\s*→\s*([\w₀-₉+\-]+)/g,
    (_, a, b, c) => `${a} leads to ${b}, which leads to ${c}`);

  // ── 7. Medical / science units ────────────────────────────────────────────
  applyList(UNITS);

  // ── 8. Common fractions ───────────────────────────────────────────────────
  rep(/\b1\/2\b/g, 'one half');
  rep(/\b1\/3\b/g, 'one third');
  rep(/\b2\/3\b/g, 'two thirds');
  rep(/\b1\/4\b/g, 'one quarter');
  rep(/\b3\/4\b/g, 'three quarters');
  rep(/\b1\/5\b/g, 'one fifth');
  rep(/\b1\/6\b/g, 'one sixth');
  rep(/\b1\/8\b/g, 'one eighth');
  rep(/\b½\b/g, 'one half');
  rep(/\b¼\b/g, 'one quarter');
  rep(/\b¾\b/g, 'three quarters');
  repFn(/\b(\d+)\/(\d+)\b/g, (_, n, d) => `${n} over ${d}`);

  // ── 9. Dental tooth notation ──────────────────────────────────────────────
  repFn(/#(\d{1,2})\b/g, (_, n) => `tooth number ${n}`);

  // ── 10. Statistical p-values ──────────────────────────────────────────────
  // "p < 0.05" → "p less than zero point zero five"
  repFn(/\bp\s*(<|>|≤|≥|=)\s*(\d+\.\d+)/g, (_, op, val) => {
    const opWord = op === '<' ? 'less than'
      : op === '>' ? 'greater than'
      : op === '≤' ? 'less than or equal to'
      : op === '≥' ? 'greater than or equal to'
      : 'equals';
    const spoken = val.replace(/^0\./, 'zero point ').replace(/\./g, ' point ');
    return `p ${opWord} ${spoken}`;
  });
  // r² → "r squared" (Pearson's r in statistics)
  rep(/\br²\b/g, 'r squared');

  // ── 11. Degree symbol for angles (not temperature — already handled above) ──
  repFn(/(\d+)°(?![CF])/g, (_, n) => `${n} degrees`);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  t = t.replace(/[ \t]{2,}/g, ' ').trim();

  return { text: t, hasMath, hasScience, transformations: count };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ORDINAL_WORDS: Record<number, string> = {
  1: 'first', 2: 'second', 3: 'third', 4: 'fourth', 5: 'fifth',
  6: 'sixth', 7: 'seventh', 8: 'eighth', 9: 'ninth', 10: 'tenth',
  11: 'eleventh', 12: 'twelfth', 13: 'thirteenth', 14: 'fourteenth',
  15: 'fifteenth', 16: 'sixteenth', 17: 'seventeenth', 18: 'eighteenth',
  19: 'nineteenth', 20: 'twentieth',
};

function ordinalPower(n: string): string {
  const num = parseInt(n, 10);
  if (!isNaN(num) && ORDINAL_WORDS[num]) return ORDINAL_WORDS[num];
  if (!isNaN(num)) {
    const s = num % 10;
    const t = num % 100;
    if (t >= 11 && t <= 13) return `${num}th`;
    if (s === 1) return `${num}st`;
    if (s === 2) return `${num}nd`;
    if (s === 3) return `${num}rd`;
    return `${num}th`;
  }
  return `${n}th`;
}
