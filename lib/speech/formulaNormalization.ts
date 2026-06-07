// lib/speech/formulaNormalization.ts
// Pre-TTS formula normalization — runs BEFORE formulaToSpeech() and naturalizeSpeech().
// Converts math/science/engineering/dental notation into professor-style spoken phrases
// so OpenAI TTS sounds like a lecture, not a text reader.

export interface FormulaResult {
  text: string;
  hasMath: boolean;
  hasScience: boolean;
  transformations: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function ordinalPower(n: string): string {
  const num = parseInt(n, 10);
  if (isNaN(num)) return `${n}th power`;
  const abs = Math.abs(num);
  const suffix =
    abs % 100 >= 11 && abs % 100 <= 13 ? "th"
    : abs % 10 === 1 ? "st"
    : abs % 10 === 2 ? "nd"
    : abs % 10 === 3 ? "rd"
    : "th";
  return `${n}${suffix} power`;
}

// Unicode superscript digit → ASCII digit
const SUP: Record<string, string> = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
  "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-",
};

// ── Named physics / chemistry formulas ──────────────────────────────────────

const PHYSICS_FORMULAS: [RegExp, string][] = [
  [/\bF\s*=\s*m\s*[×x·*]?\s*a\b/gi, "force equals mass times acceleration, Newton's second law"],
  [/\bE\s*=\s*m\s*c\s*[²2²]\b/gi, "energy equals mass times the speed of light squared, Einstein's mass-energy equivalence"],
  [/\bPV\s*=\s*nRT\b/gi, "pressure times volume equals moles times the gas constant times temperature, the ideal gas law"],
  [/\bV\s*=\s*I\s*[×x·*]?\s*R\b/gi, "voltage equals current times resistance, Ohm's law"],
  [/\bP\s*=\s*I\s*[×x·*]?\s*V\b/gi, "power equals current times voltage"],
  [/\bW\s*=\s*F\s*[×x·*]?\s*d\b/gi, "work equals force times displacement"],
  [/\bKE\s*=\s*½\s*m\s*v[²2]\b/gi, "kinetic energy equals one half mass times velocity squared"],
  [/\bPE\s*=\s*mgh\b/gi, "potential energy equals mass times gravitational acceleration times height"],
  [/\bv\s*=\s*[λl]\s*[×x·*]?\s*f\b/gi, "wave speed equals wavelength times frequency"],
  [/\bF\s*=\s*k\s*q[₁1]\s*q[₂2]\s*\/\s*r[²2]\b/gi, "Coulomb's law: force equals the constant times the product of charges divided by distance squared"],
  [/\bp\s*=\s*m\s*[×x·*]?\s*v\b/gi, "momentum equals mass times velocity"],
];

const EXTRA_CHEM: [RegExp, string][] = [
  [/\bH₂SO₄\b/gi, "sulfuric acid"],
  [/\bHCl\b/g, "hydrochloric acid"],
  [/\bNaOH\b/g, "sodium hydroxide"],
  [/\bNaCl\b/g, "sodium chloride"],
  [/\bNH₃\b/gi, "ammonia"],
  [/\bCO₂\b/gi, "carbon dioxide"],
  [/\bH₂O₂\b/gi, "hydrogen peroxide"],
  [/\bCaCO₃\b/gi, "calcium carbonate"],
  [/\bC₆H₁₂O₆\b/gi, "glucose"],
  [/\bC₁₂H₂₂O₁₁\b/gi, "sucrose"],
  [/\bATP\b/g, "A-T-P"],
  [/\bADP\b/g, "A-D-P"],
  [/\bNADH\b/g, "N-A-D-H"],
  [/\bFADH₂\b/gi, "F-A-D-H-2"],
  [/\bDNA\b/g, "D-N-A"],
  [/\bRNA\b/g, "R-N-A"],
  [/\bmRNA\b/g, "messenger RNA"],
  [/\btRNA\b/g, "transfer RNA"],
  [/\brRNA\b/g, "ribosomal RNA"],
];

// ── Units ────────────────────────────────────────────────────────────────────

const UNITS: [RegExp, string][] = [
  [/\bmmHg\b/g, "millimeters of mercury"],
  [/\bmg\/dL\b/g, "milligrams per deciliter"],
  [/\bmg\/kg\b/g, "milligrams per kilogram"],
  [/\bμg\/kg\b/g, "micrograms per kilogram"],
  [/\bμg\/mL\b/g, "micrograms per milliliter"],
  [/\bmmol\/L\b/g, "millimoles per liter"],
  [/\bμmol\/L\b/g, "micromoles per liter"],
  [/\bng\/mL\b/g, "nanograms per milliliter"],
  [/\bμg\/dL\b/g, "micrograms per deciliter"],
  [/\bg\/dL\b/g, "grams per deciliter"],
  [/\bIU\/L\b/g, "international units per liter"],
  [/\bmL\/min\b/g, "milliliters per minute"],
  [/\bL\/min\b/g, "liters per minute"],
  [/\bbpm\b/g, "beats per minute"],
  [/\brpm\b/g, "revolutions per minute"],
  [/\bm\/s[²2]\b/g, "meters per second squared"],
  [/\bm\/s\b/g, "meters per second"],
  [/\bkm\/h\b/g, "kilometers per hour"],
  [/\bJ\/mol\b/g, "joules per mole"],
  [/\bkJ\/mol\b/g, "kilojoules per mole"],
  [/\bcal\/g\b/g, "calories per gram"],
  [/\bkcal\/mol\b/g, "kilocalories per mole"],
  [/\bN\/m[²2]\b/g, "newtons per square meter"],
  [/\bkPa\b/g, "kilopascals"],
  [/\bPa\b/g, "pascals"],
  [/\batm\b/g, "atmospheres"],
  [/\beV\b/g, "electron volts"],
  [/\bkeV\b/g, "kiloelectron volts"],
  [/\bMeV\b/g, "megaelectron volts"],
  [/\bHz\b/g, "hertz"],
  [/\bkHz\b/g, "kilohertz"],
  [/\bMHz\b/g, "megahertz"],
  [/\bGHz\b/g, "gigahertz"],
  [/\bμL\b/g, "microliters"],
  [/\bnL\b/g, "nanoliters"],
  [/\bcm⁻¹\b/g, "per centimeter"],
  [/\bm⁻¹\b/g, "per meter"],
  [/\bs⁻¹\b/g, "per second"],
  [/°C\b/g, "degrees Celsius"],
  [/°F\b/g, "degrees Fahrenheit"],
  [/°K\b/g, "Kelvin"],
];

// ── Main normalization function ───────────────────────────────────────────────

export function normalizeFormulasForSpeech(raw: string): FormulaResult {
  if (!raw || raw.length < 2) return { text: raw, hasMath: false, hasScience: false, transformations: 0 };

  let out = raw;
  let transformations = 0;
  let hasMath = false;
  let hasScience = false;

  function replace(pattern: RegExp, replacement: string | ((...args: any[]) => string)): void {
    const next = typeof replacement === "function"
      ? out.replace(pattern, replacement as any)
      : out.replace(pattern, replacement);
    if (next !== out) { transformations++; out = next; }
  }

  // 1. Named physics formulas — most specific, must come first
  for (const [re, text] of PHYSICS_FORMULAS) {
    const before = out;
    out = out.replace(re, text);
    if (out !== before) { transformations++; hasMath = true; hasScience = true; }
  }

  // 2. Named chemical formulas and biomolecules
  for (const [re, text] of EXTRA_CHEM) {
    const before = out;
    out = out.replace(re, text);
    if (out !== before) { transformations++; hasScience = true; }
  }

  // 3. Units with slashes / special chars (before generic slash handling)
  for (const [re, text] of UNITS) {
    const before = out;
    out = out.replace(re, text);
    if (out !== before) { transformations++; }
  }

  // 4. Scientific notation: 3.5×10⁸ or 3.5×10^8 or 3.5e8 or 3.5E8
  replace(
    /(\d+(?:\.\d+)?)\s*[×x]\s*10\s*\^\s*(-?\d+)/g,
    (_, mantissa, exp) => {
      hasMath = true;
      return `${mantissa} times ten to the ${ordinalPower(exp)}`;
    },
  );
  // Unicode superscript version: 3.5×10⁸
  replace(
    /(\d+(?:\.\d+)?)\s*[×x]\s*10([⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+)/g,
    (_, mantissa, supStr) => {
      hasMath = true;
      const digits = [...supStr].map(c => SUP[c] ?? c).join("");
      return `${mantissa} times ten to the ${ordinalPower(digits)}`;
    },
  );
  replace(
    /(\d+(?:\.\d+)?)\s*[eE]([+-]?\d+)/g,
    (_, mantissa, exp) => {
      hasMath = true;
      return `${mantissa} times ten to the ${ordinalPower(exp)}`;
    },
  );

  // 5. Calculus — dy/dx, d²y/dx², ∂f/∂x
  replace(/d²([a-z])\/d([a-z])²/gi, (_, y, x) => { hasMath = true; return `the second derivative of ${y} with respect to ${x}`; });
  replace(/d([a-z])\/d([a-z])\b/gi, (_, y, x) => { hasMath = true; return `the derivative of ${y} with respect to ${x}`; });
  replace(/∂([a-zA-Z])\/∂([a-zA-Z])/g, (_, f, x) => { hasMath = true; return `the partial derivative of ${f} with respect to ${x}`; });
  replace(/∫\s*([^d]+)\s*d([a-z])/gi, (_, expr, v) => { hasMath = true; return `the integral of ${expr.trim()} with respect to ${v}`; });
  replace(/lim\s*_{?([^}→]+)→([^}]+)}?\s*/gi, (_, v, val) => { hasMath = true; return `the limit as ${v.trim()} approaches ${val.trim()} of `; });
  replace(/∑/g, () => { hasMath = true; return "the sum of "; });
  replace(/∏/g, () => { hasMath = true; return "the product of "; });

  // 6. Arrow chains — A→B→C mechanism notation
  replace(
    /([A-Za-z][A-Za-z0-9]*(?:\s+[A-Za-z][A-Za-z0-9]*)?)\s*→\s*([A-Za-z][A-Za-z0-9]*(?:\s+[A-Za-z][A-Za-z0-9]*)?)\s*→\s*([A-Za-z][A-Za-z0-9]*(?:\s+[A-Za-z][A-Za-z0-9]*)?)/g,
    (_, a, b, c) => { hasScience = true; return `${a} leads to ${b}, which leads to ${c}`; },
  );
  replace(
    /([A-Za-z][A-Za-z0-9]*)\s*→\s*([A-Za-z][A-Za-z0-9]*)/g,
    (_, a, b) => { return `${a} leads to ${b}`; },
  );

  // 7. Unicode superscripts on variables: x² x³ x⁴ etc.
  replace(/([a-zA-Z0-9\)])[²]/g, (_, base) => { hasMath = true; return `${base} squared`; });
  replace(/([a-zA-Z0-9\)])[³]/g, (_, base) => { hasMath = true; return `${base} cubed`; });
  replace(/([a-zA-Z0-9\)])[⁴⁵⁶⁷⁸⁹]/g, (m, base) => {
    hasMath = true;
    const n = SUP[m.slice(-1)] ?? m.slice(-1);
    return `${base} to the ${ordinalPower(n)}`;
  });
  // caret-power notation: x^2, x^n, x^{-1}
  replace(/([a-zA-Z0-9\)])\^{?(-?\d+)}?/g, (_, base, exp) => {
    hasMath = true;
    const n = parseInt(exp, 10);
    if (n === 2) return `${base} squared`;
    if (n === 3) return `${base} cubed`;
    if (n === -1) return `one over ${base}`;
    return `${base} to the ${ordinalPower(exp)}`;
  });

  // 8. Common fractions
  replace(/\b1\/2\b/g, () => { hasMath = true; return "one half"; });
  replace(/\b1\/3\b/g, () => { hasMath = true; return "one third"; });
  replace(/\b2\/3\b/g, () => { hasMath = true; return "two thirds"; });
  replace(/\b1\/4\b/g, () => { hasMath = true; return "one quarter"; });
  replace(/\b3\/4\b/g, () => { hasMath = true; return "three quarters"; });
  replace(/\b1\/5\b/g, () => { hasMath = true; return "one fifth"; });

  // 9. Statistical notation
  replace(/\bp\s*[<>≤≥]\s*0\.\d+/g, (m) => {
    hasScience = true;
    const val = m.replace("p", "p").replace(/\s/g, "");
    const op = val.includes("<") ? "less than" : val.includes(">") ? "greater than" : val.includes("≤") ? "less than or equal to" : "greater than or equal to";
    const num = val.match(/[\d.]+$/)?.[0] ?? "";
    return `p ${op} ${num}`;
  });
  replace(/\bα\s*=\s*0\.\d+/g, (m) => { hasScience = true; return m.replace("α", "alpha"); });
  replace(/\bσ\b/g, () => { hasScience = true; return "sigma"; });
  replace(/\bμ\b/g, () => { hasScience = true; return "mu"; });
  replace(/\bχ[²2]\b/g, () => { hasScience = true; return "chi-squared"; });
  replace(/\bR[²2]\b/g, () => { hasScience = true; return "R-squared"; });

  // 10. Dental tooth numbers (#8, #14, tooth #21)
  replace(/(?:tooth\s+)?#(\d{1,2})\b/gi, (_, n) => { return `tooth number ${n}`; });

  // 11. Chemical equilibrium / reversible arrows
  replace(/⇌/g, "is in equilibrium with");
  replace(/→/g, "leads to");
  replace(/←/g, "comes from");

  // 12. Clean up any remaining lone superscript chars
  for (const [sup, digit] of Object.entries(SUP)) {
    replace(new RegExp(sup, "g"), digit === "-" ? " negative " : digit);
  }

  // 13. Common math operators that survived earlier passes
  replace(/\s*[×x·]\s*/g, " times ");
  replace(/\s*÷\s*/g, " divided by ");
  replace(/\s*≠\s*/g, " is not equal to ");
  replace(/\s*≈\s*/g, " is approximately equal to ");
  replace(/\s*≤\s*/g, " is less than or equal to ");
  replace(/\s*≥\s*/g, " is greater than or equal to ");
  replace(/\s*∝\s*/g, " is proportional to ");
  replace(/\s*∞\s*/g, " infinity ");
  replace(/\s*Δ\s*/g, " delta ");
  replace(/\s*λ\s*/g, " lambda ");
  replace(/\s*θ\s*/g, " theta ");
  replace(/\s*π\s*/g, " pi ");
  replace(/\s*±\s*/g, " plus or minus ");

  out = out.replace(/\s{2,}/g, " ").trim();

  return { text: out, hasMath, hasScience, transformations };
}
