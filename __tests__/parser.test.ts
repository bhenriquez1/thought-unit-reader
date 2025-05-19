import { improveBiomedicalParsing } from "../lib/parser";

test("highlights biomedical terms in alternating colors", () => {
  const input = "The enzyme-substrate complex is key in signal transduction.";
  const result = improveBiomedicalParsing(input);

  expect(result).toMatch(/enzyme-substrate complex/);
  expect(result).toMatch(/signal transduction/);
  expect(result).toMatch(/<span style="color:(black|gray)">/);
});