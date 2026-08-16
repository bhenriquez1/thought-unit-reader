// tests/canonical/datClassificationReexport.test.ts
// X1 architecture guard: lib/canonical/types.ts must not re-introduce a
// local definition of DAT's taxonomy — it should re-export from
// lib/examEngine/datClassification.ts so the shared canonical schema stays
// exam-vocabulary-agnostic. Static-analysis, matching this repo's
// established pattern for architecture-shape assertions.

import fs from "fs";
import path from "path";

const SRC = fs.readFileSync(path.resolve(__dirname, "../../lib/canonical/types.ts"), "utf8");

describe("lib/canonical/types.ts — DAT taxonomy re-export (X1)", () => {
  it("REQUIRED: re-exports DatSection/ClassificationSource/DatTopic/DatUnitType from the exam-engine layer, does not define them locally", () => {
    expect(SRC).toMatch(/export type \{\s*DatSection,\s*ClassificationSource,\s*DatTopic,\s*DatUnitType,\s*\} from "\.\.\/examEngine\/datClassification";/);
    expect(SRC).not.toMatch(/export type DatSection =\s*\n\s*\|/);
    expect(SRC).not.toMatch(/export type ClassificationSource =\s*\n\s*\|/);
  });

  it("REQUIRED: re-exports datSectionFromSubject rather than defining it locally", () => {
    expect(SRC).toMatch(/export \{ datSectionFromSubject \} from "\.\.\/examEngine\/datClassification";/);
    expect(SRC).not.toMatch(/export function datSectionFromSubject/);
  });

  it("CanonicalThoughtUnit still carries the DAT fields directly (backward-compatible — no consumer needed to change)", () => {
    const idx = SRC.indexOf("export interface CanonicalThoughtUnit");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 2000);
    expect(block).toMatch(/datSection: DatSection;/);
    expect(block).toMatch(/datTopic: DatTopic;/);
    expect(block).toMatch(/datUnitType: DatUnitType;/);
    expect(block).toMatch(/classificationSource: ClassificationSource;/);
  });
});
