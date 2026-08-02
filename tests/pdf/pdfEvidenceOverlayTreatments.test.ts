// tests/pdf/pdfEvidenceOverlayTreatments.test.ts
// Regression guards for the SurgeonAnnotationPlan treatment extension to
// components/pdf/PdfEvidenceOverlay.tsx:
//   - OverlayRect gains treatment?/canonicalType? additively.
//   - All 8 treatments have render code somewhere in the file.
//   - The existing semanticKind-driven path (KIND_TIER, mechanismChain's original
//     "mechanism" filter, etc.) is still present verbatim — the live
//     highlightAnchors/ExpertAnchor call site through SmartPDFViewer must not
//     be broken by this additive change.

import fs from "fs";
import path from "path";

const FILE = path.resolve(__dirname, "../../components/pdf/PdfEvidenceOverlay.tsx");

describe("PdfEvidenceOverlay.tsx — OverlayRect additive treatment field", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(FILE, "utf8"); });

  it("adds treatment?: and canonicalType?: to OverlayRect without removing semanticKind", () => {
    expect(src).toMatch(/treatment\?:\s*Treatment/);
    expect(src).toMatch(/canonicalType\?:\s*CanonicalType/);
    expect(src).toMatch(/semanticKind\?:/);
  });

  it("imports Treatment/CanonicalType from the Phase 1 schema file", () => {
    expect(src).toMatch(/import type \{ Treatment, CanonicalType \} from "@\/lib\/insights\/pageAnnotationPlan"/);
  });
});

describe("PdfEvidenceOverlay.tsx — treatment takes priority, semanticKind path preserved", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(FILE, "utf8"); });

  it("getConfig checks rect.treatment before falling back to semanticKind/KIND_TIER", () => {
    const fnBody = src.slice(src.indexOf("function getConfig"), src.indexOf("function getConfig") + 400);
    const treatmentIdx = fnBody.indexOf("rect.treatment");
    const kindIdx = fnBody.indexOf("KIND_TIER");
    expect(treatmentIdx).toBeGreaterThan(-1);
    expect(kindIdx).toBeGreaterThan(-1);
    expect(treatmentIdx).toBeLessThan(kindIdx);
  });

  it("getTierForRect checks rect.treatment before falling back to semanticKind/KIND_TIER", () => {
    const fnBody = src.slice(src.indexOf("function getTierForRect"), src.indexOf("function getTierForRect") + 400);
    const treatmentIdx = fnBody.indexOf("rect.treatment");
    const kindIdx = fnBody.indexOf("KIND_TIER");
    expect(treatmentIdx).toBeGreaterThan(-1);
    expect(kindIdx).toBeGreaterThan(-1);
    expect(treatmentIdx).toBeLessThan(kindIdx);
  });

  it("shouldRender renders a rect that only sets treatment (no semanticKind, no level)", () => {
    const fnBody = src.slice(src.indexOf("function shouldRender"), src.indexOf("function shouldRender") + 300);
    expect(fnBody).toMatch(/if \(rect\.treatment\) return true;/);
  });

  it("the original semanticKind-driven KIND_TIER map is still present, untouched", () => {
    expect(src).toMatch(/const KIND_TIER: Record<SemanticKind, HighlightTier> = \{/);
    expect(src).toMatch(/mechanism:\s*"step"/);
  });

  it("mechanismChain/comparisonChain still match the original semanticKind values (OR'd with treatment, not replaced)", () => {
    expect(src).toMatch(/r\.semanticKind === "mechanism" \|\| r\.treatment === "mechanismBrace"/);
    expect(src).toMatch(/r\.semanticKind === "comparison" \|\| r\.treatment === "comparisonBracket"/);
  });
});

describe("PdfEvidenceOverlay.tsx — all 8 treatments have render code", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(FILE, "utf8"); });

  const TREATMENTS = [
    "definitionBar", "mechanismBrace", "procedureRail", "decisionConnector",
    "comparisonBracket", "trapNotch", "pearlMarker", "evidenceUnderline",
  ];

  it.each(TREATMENTS)('references "%s" somewhere in render logic', (treatment) => {
    expect(src).toContain(treatment);
  });

  it("procedureRail has its own SVG chain, distinct from mechanismBrace (square chips, not circles)", () => {
    expect(src).toMatch(/procedureChain/);
    expect(src).toMatch(/<rect x=\{railX/); // square step chip
    expect(src).toMatch(/STEPS/);
  });

  it("mechanismBrace keeps its original circled step numbers (unchanged)", () => {
    expect(src).toMatch(/<circle cx=\{braceX/);
    expect(src).toMatch(/PROCEDURE/);
  });

  it("decisionConnector renders a diamond marker distinct from trapNotch's triangle", () => {
    expect(src).toMatch(/decisionConnector.*isFirstLine[\s\S]{0,300}transform:\s*"rotate\(45deg\)"/);
  });

  it("pearlMarker renders a round dot distinct from decisionConnector's diamond", () => {
    expect(src).toMatch(/pearlMarker.*isFirstLine[\s\S]{0,300}borderRadius:\s*"50%"/);
  });

  it("evidenceUnderline renders borderBottom instead of a filled background", () => {
    expect(src).toMatch(/treatment === "evidenceUnderline"\s*\n\s*\? "transparent"/);
    expect(src).toMatch(/borderBottom:\s*rect\.treatment === "evidenceUnderline"/);
  });

  it("definitionBar reuses the existing gold left-edge accent, OR'd with the old semanticKind check", () => {
    expect(src).toMatch(/rect\.semanticKind === "definition" \|\| rect\.treatment === "definitionBar"/);
  });
});
