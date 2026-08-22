// tests/pdf/contextualConnectorOpacity.test.ts
// P0 stabilization, Tier 3, item 4 — relationship connectors (mechanism
// brace, procedure rail, comparison brackets) become contextual: low
// opacity by default, brightened only when the active evidence (click
// focus, hover, or Professor discussing that concept — all converge on
// activeEvidenceId) belongs to that specific chain. Addresses "arrows are
// useful, but dense pages can become visually noisy" — previously every
// connector rendered at a fixed opacity (0.55-0.85) regardless of focus.
//
// Hover is local component state (useState), NOT a new cross-view store —
// click-focus and Professor-focus already flow through the existing
// focusedId prop (backed by useReadingFocusStore's focusedEvidenceId in
// pages/index.tsx). No new cross-view state system was added, per instruction.
//
// No jsdom/render harness for this file in this repo — source inspection,
// matching this repo's established pattern (see pdfEvidenceOverlayTreatments.test.ts).

import fs from "fs";
import path from "path";

const FILE = path.resolve(__dirname, "../../components/pdf/PdfEvidenceOverlay.tsx");
const SRC = fs.readFileSync(FILE, "utf8");

describe("PdfEvidenceOverlay.tsx — hover state is local, not a new cross-view store", () => {
  it("REQUIRED: hoveredId is plain useState, not a new Zustand/global store", () => {
    expect(SRC).toMatch(/const \[hoveredId, setHoveredId\] = useState<string \| null>\(null\);/);
    expect(SRC).not.toMatch(/create\(.*hoveredId/s);
  });

  it("REQUIRED: does not import or reference a new store module — reuses focusedId (already backed by useReadingFocusStore upstream)", () => {
    expect(SRC).not.toMatch(/from ["']zustand["']/);
    expect(SRC).not.toMatch(/readingFocusStore/);
  });
});

describe("PdfEvidenceOverlay.tsx — activeEvidenceId unifies click-focus and hover", () => {
  it("REQUIRED: activeEvidenceId falls back from focusedId to hoveredId", () => {
    expect(SRC).toMatch(/const activeEvidenceId = focusedId \?\? hoveredId \?\? null;/);
  });

  it("REQUIRED: rects use activeEvidenceId (not just focusedId) for the dim-others spotlight effect", () => {
    const idx = SRC.indexOf("const activeFocused = !!activeEvidenceId");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 200);
    expect(block).toMatch(/const dimmed = !!activeEvidenceId && !activeFocused;/);
  });

  it("REQUIRED: rect buttons set/clear hoveredId on mouse enter/leave", () => {
    expect(SRC).toMatch(/onMouseEnter=\{\(\) => setHoveredId\(baseId\)\}/);
    expect(SRC).toMatch(/onMouseLeave=\{\(\) => setHoveredId\(\(prev\) => \(prev === baseId \? null : prev\)\)\}/);
  });
});

describe("PdfEvidenceOverlay.tsx — connector chains: low opacity by default, brightened only when active", () => {
  it("REQUIRED: chainOpacity returns the dim constant when nothing is active", () => {
    const idx = SRC.indexOf("function chainOpacity(chain: OverlayRect[]): number {");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 400);
    expect(block).toMatch(/if \(!activeEvidenceId\) return CONNECTOR_DIM_OPACITY;/);
  });

  it("REQUIRED: chainOpacity brightens only when a rect belonging to THAT chain is the active one", () => {
    const idx = SRC.indexOf("function chainOpacity(chain: OverlayRect[]): number {");
    const block = SRC.slice(idx, idx + 400);
    expect(block).toMatch(/const isActive = chain\.some\(\(r\) => r\.id === activeEvidenceId \|\| r\.id\.replace\(\/-L\\d\+\$\/, ""\) === activeEvidenceId\);/);
    expect(block).toMatch(/return isActive \? CONNECTOR_ACTIVE_OPACITY : CONNECTOR_DIM_OPACITY;/);
  });

  it("REQUIRED: the dim default is a real low-opacity value, not just a slightly-reduced one — dense pages should read as calm, not just dimmer", () => {
    const match = SRC.match(/const CONNECTOR_DIM_OPACITY = ([0-9.]+);/);
    expect(match).not.toBeNull();
    const dim = parseFloat(match![1]);
    expect(dim).toBeGreaterThan(0); // never fully invisible — "useful arrows" per the product owner
    expect(dim).toBeLessThanOrEqual(0.4);
  });

  it("REQUIRED: each of the three connector SVGs (mechanism, procedure, comparison) is wired to its own chain's computed opacity", () => {
    expect(SRC).toMatch(/opacity: mechanismChainOpacity, transition: "opacity 180ms ease"/);
    expect(SRC).toMatch(/opacity: procedureChainOpacity, transition: "opacity 180ms ease"/);
    expect(SRC).toMatch(/opacity: comparisonChainOpacity, transition: "opacity 180ms ease"/);
  });

  it("each chain opacity is memoized against its own chain and activeEvidenceId, not recomputed from unrelated state", () => {
    expect(SRC).toMatch(/const mechanismChainOpacity  = useMemo\(\(\) => chainOpacity\(mechanismChain\),  \[mechanismChain, activeEvidenceId\]\);/);
    expect(SRC).toMatch(/const procedureChainOpacity  = useMemo\(\(\) => chainOpacity\(procedureChain\),  \[procedureChain, activeEvidenceId\]\);/);
    expect(SRC).toMatch(/const comparisonChainOpacity = useMemo\(\(\) => chainOpacity\(comparisonChain\), \[comparisonChain, activeEvidenceId\]\);/);
  });
});
