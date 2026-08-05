// tests/insights/extractPageBlocks.test.ts
// Pure-function tests for the structured page-block extractor — the fix for
// "OpenAI receives one flattened paragraph and can't tell a heading or table
// apart from body text." Every block must be a verbatim slice of the input
// (never rewritten), tagged with a type and its reading-order position.

import { extractPageBlocks } from "../../lib/insights/extractPageBlocks";

describe("extractPageBlocks", () => {
  it("returns an empty array for empty/whitespace-only text", () => {
    expect(extractPageBlocks("")).toEqual([]);
    expect(extractPageBlocks("   \n\n  ")).toEqual([]);
  });

  it("classifies a short first line as a heading", () => {
    const text = "Atomic Structure\n\nDalton proposed that matter is composed of atoms.";
    const blocks = extractPageBlocks(text);
    expect(blocks[0].type).toBe("heading");
    expect(blocks[0].text).toBe("Atomic Structure");
    expect(blocks[1].type).toBe("paragraph");
  });

  it("assigns increasing readingOrder starting at 0", () => {
    const text = "Heading One\n\nFirst paragraph here.\n\nSecond paragraph here.";
    const blocks = extractPageBlocks(text);
    expect(blocks.map(b => b.readingOrder)).toEqual([0, 1, 2]);
  });

  it("classifies consecutive numbered lines as a list", () => {
    const text =
      "Steps\n\n" +
      "1. Identify the chief complaint\n" +
      "2. Take a full history\n" +
      "3. Perform the exam";
    const blocks = extractPageBlocks(text);
    const list = blocks.find(b => b.type === "list");
    expect(list).toBeDefined();
    expect(list!.text).toMatch(/1\. Identify the chief complaint/);
  });

  it("classifies a block with column-aligned rows as a table", () => {
    const text =
      "Reference Ranges\n\n" +
      "Sodium      135-145 mEq/L\n" +
      "Potassium   3.5-5.0 mEq/L\n" +
      "Chloride    96-106 mEq/L";
    const blocks = extractPageBlocks(text);
    const table = blocks.find(b => b.type === "table");
    expect(table).toBeDefined();
    expect(table!.text).toMatch(/Sodium/);
  });

  it("classifies a standalone 'Figure N' line as figure-label", () => {
    const text = "Some paragraph text goes here for context.\n\nFigure 3.2";
    const blocks = extractPageBlocks(text);
    expect(blocks.find(b => b.type === "figure-label")).toBeDefined();
  });

  it("classifies a 'Figure N: description' line as caption", () => {
    const text = "Some paragraph text goes here for context.\n\nFigure 3.2: Cross-section of the femur.";
    const blocks = extractPageBlocks(text);
    const caption = blocks.find(b => b.type === "caption");
    expect(caption).toBeDefined();
    expect(caption!.text).toMatch(/Cross-section of the femur/);
  });

  it("classifies a short single-line formula as an equation", () => {
    const text = "Ideal gas behavior:\n\nPV = nRT";
    const blocks = extractPageBlocks(text);
    expect(blocks.find(b => b.type === "equation")).toBeDefined();
  });

  it("falls back to paragraph for ordinary prose", () => {
    const text = "This is a normal sentence that describes a mechanism in some detail and continues for a while.";
    const blocks = extractPageBlocks(text);
    expect(blocks[0].type).toBe("paragraph");
  });

  it("every block's text is a verbatim substring of the original page text — never rewritten", () => {
    const text =
      "Cellular Respiration\n\n" +
      "Glycolysis converts glucose into pyruvate in the cytosol.\n\n" +
      "1. Substrate enters the cell\n2. Glycolysis begins\n3. Pyruvate is produced";
    const blocks = extractPageBlocks(text);
    for (const block of blocks) {
      expect(text.includes(block.text)).toBe(true);
    }
  });

  it("is deterministic — the same input always produces the identical block list", () => {
    const text = "Heading\n\nBody paragraph one.\n\nBody paragraph two.";
    expect(extractPageBlocks(text)).toEqual(extractPageBlocks(text));
  });

  it("assigns a stable, unique blockId per block", () => {
    const text = "Heading\n\nFirst.\n\nSecond.";
    const blocks = extractPageBlocks(text);
    const ids = blocks.map(b => b.blockId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
