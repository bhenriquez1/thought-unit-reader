import { parseIntoUnits, containsDiagramOrFormula } from "../lib/parser";

test("parses text into sentence units", () => {
  const input = "The enzyme-substrate complex is key in signal transduction. This is another sentence.";
  const result = parseIntoUnits(input);

  expect(result).toHaveLength(2);
  expect(result[0]).toContain("enzyme-substrate complex");
  expect(result[1]).toContain("This is another sentence");
});

test("detects scientific content", () => {
  const input = "The enzyme-substrate complex follows the equation: E + S ⇌ ES → EP.";
  const result = containsDiagramOrFormula(input);

  expect(result).toBe(true);
});
