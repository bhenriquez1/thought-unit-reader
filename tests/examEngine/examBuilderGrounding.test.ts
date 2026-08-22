// tests/examEngine/examBuilderGrounding.test.ts
// X1 — canonicalQuestionMapper.ts becomes part of the LIVE candidate-
// generation path: examBuilder.ts now derives grounded question stems from
// each note's CanonicalThoughtUnits (via canonicalUnitsToDatStubs) and
// threads them into the concept text sent to the AI question generator,
// alongside the note-based content it already used. Static-analysis,
// matching this repo's established pattern for library-code coverage.

import fs from "fs";
import path from "path";

const SRC = fs.readFileSync(path.resolve(__dirname, "../../lib/examEngine/examBuilder.ts"), "utf8");

describe("examBuilder.ts — canonicalQuestionMapper is wired into the live path", () => {
  it("REQUIRED: imports canonicalUnitsToDatStubs from lib/datApex/canonicalQuestionMapper", () => {
    expect(SRC).toMatch(/import \{ canonicalUnitsToDatStubs \} from "@\/lib\/datApex\/canonicalQuestionMapper";/);
  });

  it("REQUIRED: buildConceptText accepts grounded stems and appends them as a distinct, labeled block", () => {
    const idx = SRC.indexOf("function buildConceptText(");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 900);
    expect(block).toMatch(/groundedStems: string\[\] = \[\]/);
    expect(block).toMatch(/Grounded question angles from the source passage:/);
  });

  it("REQUIRED: buildExam derives groundedStems from canonicalUnitsToDatStubs and passes them into buildConceptText", () => {
    const idx = SRC.indexOf("export async function buildExam(");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 4500);
    expect(block).toMatch(/canonicalUnitsToDatStubs\(units, \{ sourceBookId: opts\.bookId, maxStubs: 3 \}\)/);
    expect(block).toMatch(/buildConceptText\(note, groundedStems\)/);
  });

  it("sourceThoughtUnitIds still comes from the same canonical-unit fetch — no duplicate IDB read introduced", () => {
    const idx = SRC.indexOf("export async function buildExam(");
    const block = SRC.slice(idx, idx + 4500);
    // Exactly one getCanonicalUnitsByPage call site — units are fetched once and reused for both ids and stems.
    const matches = block.match(/getCanonicalUnitsByPage\(/g) ?? [];
    expect(matches.length).toBe(1);
    expect(block).toMatch(/sourceThoughtUnitIds: units\.map\(\(u\) => u\.id\)/);
  });

  it("REQUIRED: sourceKnowledgeNodeIds comes from its own getNodesByBookAndPage fetch, one per note, distinct from the canonical-unit fetch above", () => {
    const idx = SRC.indexOf("export async function buildExam(");
    const block = SRC.slice(idx, idx + 4500);
    const matches = block.match(/getNodesByBookAndPage\(/g) ?? [];
    expect(matches.length).toBe(1);
    expect(block).toMatch(/sourceKnowledgeNodeIds: knowledgeNodes\.map\(\(n\) => n\.id\)/);
  });
});
