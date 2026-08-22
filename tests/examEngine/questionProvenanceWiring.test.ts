// tests/examEngine/questionProvenanceWiring.test.ts
// X2 — static-analysis coverage proving the provenance fields flow end to
// end: examBuilder.ts stamps a pageTruthKey, questionGenerator.ts threads
// it through and links every surviving question back to its source
// canonical unit(s) via lib/canonical/store.ts's previously-dead
// linkQuestionToUnit.

import fs from "fs";
import path from "path";

function read(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, "../..", rel), "utf8");
}

describe("lib/examEngine/types.ts — EngineQuestion provenance fields", () => {
  const src = read("lib/examEngine/types.ts");

  it("REQUIRED: adds pageTruthKey, sourceEvidence, generatorVersion alongside the existing sourceThoughtUnitIds", () => {
    const idx = src.indexOf("export interface EngineQuestion");
    const block = src.slice(idx, idx + 2400);
    expect(block).toMatch(/sourceThoughtUnitIds\?: string\[\];/);
    expect(block).toMatch(/pageTruthKey\?: string;/);
    expect(block).toMatch(/sourceEvidence\?: string\[\];/);
    expect(block).toMatch(/generatorVersion\?: number;/);
  });
});

describe("lib/examEngine/examBuilder.ts — stamps pageTruthKey onto every generation request", () => {
  const src = read("lib/examEngine/examBuilder.ts");

  it("REQUIRED: pageTruthKey follows the same buildPageTruthKey convention used elsewhere in the app", () => {
    const idx = src.indexOf("return getOrGenerateQuestions({");
    const block = src.slice(idx, idx + 700);
    expect(block).toMatch(/pageTruthKey: `\$\{opts\.bookId\}::\$\{note\.pageNumber\}::t`,/);
  });
});

describe("lib/examEngine/questionGenerator.ts — links surviving questions back to their source units", () => {
  const src = read("lib/examEngine/questionGenerator.ts");

  it("REQUIRED: imports linkQuestionToUnit from lib/canonical/store — the previously-dead X2 wiring target", () => {
    expect(src).toMatch(/import \{ linkQuestionToUnit \} from "@\/lib\/canonical\/store";/);
  });

  it("REQUIRED: threads pageTruthKey into the POST body", () => {
    const idx = src.indexOf("body: JSON.stringify({");
    const block = src.slice(idx, idx + 500);
    expect(block).toMatch(/pageTruthKey: opts\.pageTruthKey,/);
  });

  it("REQUIRED: calls linkQuestionToUnit for every (question, sourceThoughtUnitId) pair among newly-generated questions", () => {
    const idx = src.indexOf("for (const q of generated)");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 300);
    expect(block).toMatch(/for \(const unitId of q\.sourceThoughtUnitIds \?\? \[\]\) \{/);
    expect(block).toMatch(/linkQuestionToUnit\(unitId, q\.id\)\.catch\(\(\) => \{\}\);/);
  });

  it("linking is best-effort — happens after the cache write, never blocks returning questions to the caller", () => {
    const cacheIdx = src.indexOf("await idbPutCached(key, merged);");
    const linkIdx = src.indexOf("for (const q of generated)");
    const returnIdx = src.indexOf("return merged.slice(0, opts.count);");
    expect(cacheIdx).toBeGreaterThan(-1);
    expect(linkIdx).toBeGreaterThan(cacheIdx);
    expect(returnIdx).toBeGreaterThan(linkIdx);
  });
});
