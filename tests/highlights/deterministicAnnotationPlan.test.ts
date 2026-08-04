// tests/highlights/deterministicAnnotationPlan.test.ts
// Unit tests for lib/highlights/deterministicAnnotationPlan.ts — the AI-free
// baseline tier of the SurgeonAnnotationPlan pipeline. Every extracted
// exactQuote must be a verbatim substring of the input pageText (grounding is
// definitional here, not verified downstream via groundSurgeonQuotes.ts in
// these tests — that's covered separately in the integration wiring test).

import {
  buildDeterministicAnnotationPlan,
  splitIntoSentencesWithSpans,
} from "../../lib/highlights/deterministicAnnotationPlan";

function expectVerbatim(pageText: string, quote: string) {
  expect(pageText.includes(quote)).toBe(true);
}

describe("splitIntoSentencesWithSpans", () => {
  it("splits on terminal punctuation followed by a capitalized word", () => {
    const text = "Dalton proposed atomic theory. Rutherford discovered the nucleus.";
    const sentences = splitIntoSentencesWithSpans(text);
    expect(sentences.map(s => s.text)).toEqual([
      "Dalton proposed atomic theory.",
      "Rutherford discovered the nucleus.",
    ]);
  });

  it("does not split on a decimal point", () => {
    const text = "The atomic mass of carbon is 12.011 and it forms four bonds with other atoms.";
    const sentences = splitIntoSentencesWithSpans(text);
    expect(sentences).toHaveLength(1);
  });

  it("does not split on a common abbreviation like e.g.", () => {
    const text = "Some elements, e.g. carbon and oxygen, are essential for organic chemistry to occur.";
    const sentences = splitIntoSentencesWithSpans(text);
    expect(sentences).toHaveLength(1);
  });

  it("spans are exact verbatim substrings of the original text", () => {
    const text = "This is the first sentence of the page. This is the second sentence of the page.";
    const sentences = splitIntoSentencesWithSpans(text);
    for (const s of sentences) {
      expect(text.slice(s.start, s.end)).toBe(s.text);
    }
  });

  it("skips very short fragments (under 20 chars)", () => {
    const text = "Ok. This is a real sentence with enough content to count.";
    const sentences = splitIntoSentencesWithSpans(text);
    expect(sentences.every(s => s.text.length >= 20)).toBe(true);
  });
});

describe("buildDeterministicAnnotationPlan — definitions", () => {
  it("detects a sentence matching 'X is Y'", () => {
    const pageText = "Atomic theory is the scientific theory that matter is composed of discrete units called atoms.";
    const plan = buildDeterministicAnnotationPlan(pageText, "chem::1::t");
    const def = plan.annotations.find(a => a.canonicalType === "definition");
    expect(def).toBeDefined();
    expectVerbatim(pageText, def!.exactQuote);
  });

  it("REGRESSION GUARD: extracts real chemistry content, never fabricated wording", () => {
    const pageText = "Dalton based his conclusions about atoms on chemical observations made in the laboratory. He proposed that atoms of a given element are identical in mass and properties.";
    const plan = buildDeterministicAnnotationPlan(pageText, "chem::1::t");
    for (const a of plan.annotations) {
      expectVerbatim(pageText, a.exactQuote);
    }
  });

  it("caps definitions at 3", () => {
    const pageText = Array.from({ length: 6 }, (_, i) =>
      `Concept${i} is a well-established idea in this field of study that students must learn.`,
    ).join(" ");
    const plan = buildDeterministicAnnotationPlan(pageText, "p::1::t");
    const defs = plan.annotations.filter(a => a.canonicalType === "definition");
    expect(defs.length).toBeLessThanOrEqual(3);
  });

  it("the first definition is marked critical, subsequent ones high", () => {
    const pageText = "Osmosis is the movement of water across a semipermeable membrane. Diffusion is the movement of particles from high to low concentration.";
    const plan = buildDeterministicAnnotationPlan(pageText, "p::1::t");
    const defs = plan.annotations.filter(a => a.canonicalType === "definition");
    expect(defs[0]?.importance).toBe("critical");
    if (defs[1]) expect(defs[1].importance).toBe("high");
  });
});

describe("buildDeterministicAnnotationPlan — traps and contrasts", () => {
  it("detects a 'be careful' / 'common mistake' warning sentence as a trap", () => {
    const pageText = "Be careful not to confuse mass and weight, a common mistake students make on this exact topic every single year.";
    const plan = buildDeterministicAnnotationPlan(pageText, "p::1::t");
    const trap = plan.annotations.find(a => a.canonicalType === "trap");
    expect(trap).toBeDefined();
    expectVerbatim(pageText, trap!.exactQuote);
  });

  it("detects a 'however'/'in contrast' sentence as a comparison", () => {
    const pageText = "Protons carry a positive charge. However, electrons carry a negative charge and orbit the nucleus at high speed.";
    const plan = buildDeterministicAnnotationPlan(pageText, "p::1::t");
    const cmp = plan.annotations.find(a => a.canonicalType === "comparison");
    expect(cmp).toBeDefined();
    expectVerbatim(pageText, cmp!.exactQuote);
  });
});

describe("buildDeterministicAnnotationPlan — formulas", () => {
  it("detects a sentence containing an equals sign as a definition-typed annotation (no dedicated formula type)", () => {
    const pageText = "The ideal gas law states that PV = nRT relates pressure, volume, moles, and temperature of a gas.";
    const plan = buildDeterministicAnnotationPlan(pageText, "p::1::t");
    const found = plan.annotations.find(a => a.exactQuote.includes("PV = nRT"));
    expect(found).toBeDefined();
    expect(found!.canonicalType).toBe("definition");
  });
});

describe("buildDeterministicAnnotationPlan — numbered procedures", () => {
  it("merges consecutive numbered steps into ONE annotation spanning first-to-last step", () => {
    const pageText = [
      "Follow these steps to balance a chemical equation:",
      "1. Write the unbalanced equation with all reactants and products clearly listed.",
      "2. Count the atoms of each element present on both sides of the equation.",
      "3. Add coefficients to balance the number of atoms of each element.",
    ].join("\n");
    const plan = buildDeterministicAnnotationPlan(pageText, "p::1::t");
    const proc = plan.annotations.find(a => a.canonicalType === "procedure");
    expect(proc).toBeDefined();
    expect(proc!.exactQuote).toContain("1. Write the unbalanced equation");
    expect(proc!.exactQuote).toContain("3. Add coefficients");
    expectVerbatim(pageText, proc!.exactQuote);
    // Only ONE procedure annotation, not one per step.
    expect(plan.annotations.filter(a => a.canonicalType === "procedure")).toHaveLength(1);
  });

  it("does not treat a single numbered line (likely a citation/footnote) as a procedure", () => {
    const pageText = "This concept was first described by Dalton in his original 1808 publication. 1. Dalton, J. A New System of Chemical Philosophy.";
    const plan = buildDeterministicAnnotationPlan(pageText, "p::1::t");
    expect(plan.annotations.filter(a => a.canonicalType === "procedure")).toHaveLength(0);
  });

  it("sets pageRole to procedure when a procedure was found", () => {
    const pageText = [
      "1. First you gather the reagents needed for the reaction to proceed correctly.",
      "2. Then you mix them together under controlled temperature and pressure conditions.",
    ].join("\n");
    const plan = buildDeterministicAnnotationPlan(pageText, "p::1::t");
    expect(plan.pageRole).toBe("procedure");
  });
});

describe("buildDeterministicAnnotationPlan — headings", () => {
  it("captures a short first line as a low-importance heading annotation", () => {
    const pageText = "Atomic Structure\n\nDalton proposed that all matter is composed of indivisible atoms with distinct properties.";
    const plan = buildDeterministicAnnotationPlan(pageText, "p::1::t");
    const heading = plan.annotations.find(a => a.exactQuote === "Atomic Structure");
    expect(heading).toBeDefined();
    expect(heading!.importance).toBe("supporting");
  });

  it("skips the heading if it overlaps a span already claimed by another detector", () => {
    // A short first "line" that also happens to look like a definition sentence
    // (no newline in this text, so the "heading" IS the first sentence itself).
    const pageText = "Osmosis is the net movement of water molecules across a semipermeable membrane driven by a concentration gradient.";
    const plan = buildDeterministicAnnotationPlan(pageText, "p::1::t");
    // Only one annotation should claim the opening span, not two overlapping ones.
    const opens = plan.annotations.filter(a => pageText.startsWith(a.exactQuote.slice(0, 10)));
    expect(opens.length).toBeLessThanOrEqual(1);
  });
});

describe("buildDeterministicAnnotationPlan — no annotations never fabricates content", () => {
  it("returns an empty plan for very short/empty page text rather than guessing", () => {
    expect(buildDeterministicAnnotationPlan("", "p::1::t").annotations).toEqual([]);
    expect(buildDeterministicAnnotationPlan("Too short.", "p::1::t").annotations).toEqual([]);
  });

  it("every annotation's exactQuote is always a verbatim substring of pageText, across a realistic mixed page", () => {
    const pageText = [
      "Chemical Bonding",
      "",
      "A chemical bond is the force of attraction that holds atoms together in a molecule.",
      "Ionic bonds form when electrons transfer from one atom to another.",
      "However, covalent bonds form when atoms share electron pairs instead.",
      "Be careful not to confuse ionic and covalent bonding on the exam, a common mistake.",
      "1. Identify the elements involved in the bond formation process.",
      "2. Determine the electronegativity difference between the two atoms.",
      "3. Classify the bond as ionic, covalent, or polar covalent based on that difference.",
    ].join("\n");
    const plan = buildDeterministicAnnotationPlan(pageText, "p::1::t");
    expect(plan.annotations.length).toBeGreaterThan(0);
    for (const a of plan.annotations) {
      expectVerbatim(pageText, a.exactQuote);
    }
  });

  it("pageTruthKey is carried through verbatim", () => {
    const plan = buildDeterministicAnnotationPlan("A bond is a force that holds two atoms together in place.", "general-chemistry::7::t");
    expect(plan.pageTruthKey).toBe("general-chemistry::7::t");
  });
});
