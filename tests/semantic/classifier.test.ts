// tests/semantic/classifier.test.ts
// Regression tests for the versioned domain classifier.
// Validates that mixed-domain books classify correctly and that
// confidence + evidence output is stable.

import { classifyDomain, classifyChapter, shouldSwitchDomain } from "../../lib/semantic/classifier";
import { CLASSIFIER_VERSION } from "../../lib/semantic/types";

// ── classifyDomain ────────────────────────────────────────────────────────────

describe("classifyDomain — dentistry", () => {
  const DENT_TEXT = `
    The preparation for an inlay restoration requires the removal of carious tooth structure.
    The cavity must be free of undercuts to allow for proper seating of the indirect restoration.
    Porcelain inlays offer excellent aesthetics and require minimal tooth reduction compared to
    full-coverage crowns. Contraindications include teeth with insufficient enamel support and
    situations where the patient exhibits bruxism. The gingival margin must be accessible for
    impression taking. Periodontal health must be established before any fixed prosthodontic
    treatment proceeds.
  `;

  it("detects dentistry domain", () => {
    const result = classifyDomain(DENT_TEXT, "Fixed Prosthodontics");
    expect(result.domain).toBe("dentistry");
  });

  it("returns confidence above tentative threshold", () => {
    const result = classifyDomain(DENT_TEXT, "Fixed Prosthodontics");
    expect(result.confidence).toBeGreaterThanOrEqual(0.55);
  });

  it("includes evidence terms", () => {
    const result = classifyDomain(DENT_TEXT, "Fixed Prosthodontics");
    expect(result.evidence.length).toBeGreaterThan(0);
    expect(result.evidence.some(e => e.startsWith("term:"))).toBe(true);
  });

  it("includes title evidence when title matches", () => {
    const result = classifyDomain(DENT_TEXT, "Fixed Prosthodontics");
    expect(result.evidence.some(e => e.startsWith("title:"))).toBe(true);
  });

  it("stamps classifierVersion", () => {
    const result = classifyDomain(DENT_TEXT);
    expect(result.classifierVersion).toBe(CLASSIFIER_VERSION);
  });
});

describe("classifyDomain — general chemistry", () => {
  const GCHEM_TEXT = `
    The ideal gas law states PV = nRT, where P is pressure in atm, V is volume in liters,
    n is moles of gas, R is the universal gas constant, and T is temperature in Kelvin.
    Real gases deviate from ideal behavior at high pressure and low temperature because
    intermolecular forces become significant and the volume of gas molecules cannot be neglected.
    The van der Waals equation corrects for these deviations using constants a and b.
    Enthalpy of reaction is related to bond energies: ΔH = bonds broken − bonds formed.
    A catalyst lowers the activation energy of a reaction without changing the equilibrium
    constant or thermodynamic stability of products.
  `;

  it("detects general-chemistry domain", () => {
    const result = classifyDomain(GCHEM_TEXT, "General Chemistry");
    expect(result.domain).toBe("general-chemistry");
  });

  it("returns confidence above tentative threshold", () => {
    const result = classifyDomain(GCHEM_TEXT, "General Chemistry");
    expect(result.confidence).toBeGreaterThanOrEqual(0.55);
  });
});

describe("classifyDomain — cross-domain disambiguation", () => {
  const OCHEM_TEXT = `
    The SN2 reaction proceeds via a backside attack by the nucleophile on the electrophilic
    carbon bearing the leaving group. The transition state is a pentacoordinate species with
    inversion of configuration (Walden inversion). Strong, unhindered nucleophiles and primary
    alkyl halides favor SN2. Stereochemistry is inverted in the product — an R substrate
    gives an S product. Elimination (E2) competes when the nucleophile is also a strong base.
    Carbocation stability: tertiary > secondary > primary explains SN1 selectivity.
    Chirality and enantiomers determine the optical activity of the product.
  `;

  it("prefers organic-chemistry over general-chemistry for OChem text", () => {
    const result = classifyDomain(OCHEM_TEXT, "Organic Chemistry Mechanisms");
    expect(result.domain).toBe("organic-chemistry");
  });

  it("returns general for unrecognized short text", () => {
    const result = classifyDomain("Hello world. This is a short passage.", "");
    expect(result.domain).toBe("general");
    expect(result.confidence).toBe(0);
  });
});

describe("classifyDomain — fallback to general", () => {
  it("returns general domain for empty text", () => {
    const result = classifyDomain("", "");
    expect(result.domain).toBe("general");
    expect(result.confidence).toBe(0);
    expect(result.evidence).toHaveLength(0);
  });

  it("confidence is 0 when domain is general", () => {
    const result = classifyDomain("The cat sat on the mat.");
    expect(result.confidence).toBe(0);
  });
});

// ── classifyChapter ───────────────────────────────────────────────────────────

describe("classifyChapter", () => {
  const dentalPages = [
    {
      text: `Inlay and onlay restorations are indicated when caries removal leaves insufficient
             tooth structure for a direct restoration but at least one cusp remains intact.
             The preparation must have divergent walls for draw and a flat pulpal floor.`,
      title: "Inlays, Onlays, and Veneers",
    },
    {
      text: `Impression materials for indirect restorations include polyvinyl siloxane (PVS)
             and polyether. Both are hydrophilic and capture fine margin detail.
             The gingival margin must be supragingival or at the gingival crest for best results.`,
    },
    {
      text: `Cementation of an inlay may use resin cement, glass ionomer, or zinc phosphate.
             Occlusal adjustment is completed before final cementation to avoid fracture.
             Porcelain restorations require adhesive bonding for adequate retention.`,
    },
  ];

  it("classifies multi-page dental chapter correctly", () => {
    const result = classifyChapter(dentalPages, "Prosthodontics Review");
    expect(result.domain).toBe("dentistry");
  });

  it("returns general for empty pages array", () => {
    const result = classifyChapter([]);
    expect(result.domain).toBe("general");
    expect(result.confidence).toBe(0);
  });

  it("uses documentTitle as fallback when first page has no title", () => {
    const pages = [{ text: dentalPages[0].text }];
    const result = classifyChapter(pages, "Dental Materials");
    expect(result.evidence.some(e => e.startsWith("title:"))).toBe(true);
  });
});

// ── shouldSwitchDomain ────────────────────────────────────────────────────────

describe("shouldSwitchDomain", () => {
  it("returns false when new domain matches current domain", () => {
    const result = shouldSwitchDomain("dentistry", 0.7, {
      domain: "dentistry",
      confidence: 0.95,
      evidence: [],
      classifierVersion: CLASSIFIER_VERSION,
    });
    expect(result).toBe(false);
  });

  it("returns false when new confidence is below SWITCH_MIN (0.75)", () => {
    const result = shouldSwitchDomain("dentistry", 0.5, {
      domain: "general-chemistry",
      confidence: 0.74,
      evidence: [],
      classifierVersion: CLASSIFIER_VERSION,
    });
    expect(result).toBe(false);
  });

  it("returns false when margin is below SWITCH_MARGIN (0.15)", () => {
    const result = shouldSwitchDomain("dentistry", 0.70, {
      domain: "general-chemistry",
      confidence: 0.82,
      evidence: [],
      classifierVersion: CLASSIFIER_VERSION,
    });
    // margin = 0.82 - 0.70 = 0.12 < 0.15
    expect(result).toBe(false);
  });

  it("returns true when new confidence ≥ 0.75 and margin ≥ 0.15", () => {
    const result = shouldSwitchDomain("dentistry", 0.60, {
      domain: "general-chemistry",
      confidence: 0.82,
      evidence: [],
      classifierVersion: CLASSIFIER_VERSION,
    });
    // margin = 0.82 - 0.60 = 0.22 ≥ 0.15
    expect(result).toBe(true);
  });

  it("returns true at exact boundary values", () => {
    const result = shouldSwitchDomain("biology", 0.60, {
      domain: "physics",
      confidence: 0.75,
      evidence: [],
      classifierVersion: CLASSIFIER_VERSION,
    });
    // margin = 0.75 - 0.60 = 0.15 — exactly at boundary
    expect(result).toBe(true);
  });
});
