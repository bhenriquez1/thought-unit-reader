// tests/elena/childCanonicalExtraction.test.ts
// E3 — Elena's own book now produces real CanonicalThoughtUnits via the SAME
// pipeline pages/index.tsx's startBookProcessing uses for the adult Reader.
// buildCanonicalChunks is pure and gets full behavioral coverage; the
// IDB-touching extractChildPageCanonicalUnits gets static-analysis coverage
// for its "skip if already extracted" / "no-op on empty text" guards,
// matching this repo's established pattern for IDB-backed modules.

import fs from "fs";
import path from "path";
import { buildCanonicalChunks } from "@/lib/elena/childCanonicalExtraction";

describe("buildCanonicalChunks", () => {
  it("returns empty array for empty text", () => {
    expect(buildCanonicalChunks("")).toEqual([]);
  });

  it("produces chunks whose text is a substring of the source at the reported offsets", () => {
    const text = "The mitochondria is the powerhouse of the cell. It produces ATP through cellular respiration. This process happens in the inner membrane.";
    const chunks = buildCanonicalChunks(text);
    expect(chunks.length).toBeGreaterThan(0);
    for (const c of chunks) {
      expect(text.slice(c.startChar, c.endChar)).toBe(c.text);
    }
  });

  it("REQUIRED: offsets are non-decreasing across chunks — later chunks never point earlier than prior ones", () => {
    const text = "First idea explained here in full detail. Second idea explained here in full detail. Third idea explained here in full detail.";
    const chunks = buildCanonicalChunks(text);
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].startChar).toBeGreaterThanOrEqual(chunks[i - 1].startChar);
    }
  });
});

describe("lib/elena/childCanonicalExtraction.ts — extraction guards (static analysis)", () => {
  const SRC = fs.readFileSync(path.resolve(__dirname, "../../lib/elena/childCanonicalExtraction.ts"), "utf8");

  it("REQUIRED: no-ops on empty/whitespace-only page text before touching IDB", () => {
    const idx = SRC.indexOf("export async function extractChildPageCanonicalUnits");
    const block = SRC.slice(idx, idx + 600);
    expect(block).toMatch(/if \(!pageText \|\| !pageText\.trim\(\)\) return;/);
  });

  it("REQUIRED: skips re-extraction when the page already has canonical units", () => {
    const idx = SRC.indexOf("export async function extractChildPageCanonicalUnits");
    const block = SRC.slice(idx, idx + 600);
    expect(block).toMatch(/const existing = await getCanonicalUnitsByPage\(documentId, pageIndex\);/);
    expect(block).toMatch(/if \(existing\.length > 0\) return;/);
  });

  it("reuses buildCanonicalUnits/saveCanonicalUnits verbatim — no reimplemented extraction logic", () => {
    expect(SRC).toMatch(/import \{ buildCanonicalUnits, type RawPageChunk \} from "@\/lib\/canonical\/builder";/);
    expect(SRC).toMatch(/import \{ saveCanonicalUnits, getCanonicalUnitsByPage \} from "@\/lib\/canonical\/store";/);
    expect(SRC).toMatch(/buildCanonicalUnits\(\{ documentId, bookId: documentId, bookTitle, pageIndex, chunks \}\)/);
  });
});
